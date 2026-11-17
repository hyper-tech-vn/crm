import { ForbiddenException } from '@nestjs/common';
import {
  getOperationAST,
  Kind,
  parse,
  valueFromASTUntyped,
  type SelectionSetNode,
  type FragmentDefinitionNode,
} from 'graphql';
import { type Request } from 'express';

import { type ErpCrmCapability } from './erp-crm-access.types';
import { type ErpCrmRequestPolicy } from './erp-crm-request-context';

const SAFE_METADATA_READS = new Set([
  'getViews',
  'navigationMenuItems',
  'objects',
  'fields',
  'minimalMetadata',
  'minimalObjectMetadata',
  'metadataTranslations',
  '__schema',
  '__type',
  '__typename',
  'currentUser',
  'currentWorkspace',
  'getClientConfig',
  'findManyObjectMetadata',
  'findManyFieldMetadata',
  'findManyViews',
  'findManyViewFields',
  'findManyViewFilters',
  'findManyViewSorts',
  'findManyViewGroups',
  'findManyViewFilterGroups',
  'findManyViewFieldGroups',
  'findManyNavigationMenuItems',
  'getNavigationMenuItems',
  'findManyRoles',
  'findManyRoleTargets',
  'getMyPermissions',
  'getWorkspaceMembers',
  'findManyWorkspaceMembers',
  'getPermissions',
  'getRecordPermissions',
  'findManyAgentChatThreads',
  'getCurrentUser',
  'getCurrentWorkspace',
  'getWorkspaceCreationDefaults',
  'findManyFavorites',
  'getAvailablePackages',
  'getCurrentUserAvailableWorkspaces',
]);
const SAFE_METADATA_WRITES = new Set([
  'signOut',
  'renewToken',
  'getAuthTokensFromLoginToken',
  'getAuthTokensFromSSOExchangeToken',
  'generateTransientToken',
]);
const CUSTOMER_NAMES = [
  'Company',
  'Companies',
  'Person',
  'People',
  'Opportunity',
  'Opportunities',
];

export const requireErpCapability = (
  policy: ErpCrmRequestPolicy,
  capability: ErpCrmCapability,
) => {
  const grant = policy.grants[capability];
  if (!grant) {
    throw new ForbiddenException('ERP has not granted this CRM operation.');
  }
  return grant;
};

const requireOrganizationCapability = (
  policy: ErpCrmRequestPolicy,
  capability: ErpCrmCapability,
) => {
  if (requireErpCapability(policy, capability).scope !== 'ORGANIZATION') {
    throw new ForbiddenException(
      'This CRM operation requires organization scope.',
    );
  }
};

export const authorizeErpCrmRootField = (
  policy: ErpCrmRequestPolicy,
  field: string,
  mutation: boolean,
  metadata: boolean,
) => {
  if (field === '__typename') {
    return;
  }
  if (metadata) {
    if (!mutation && SAFE_METADATA_READS.has(field)) {
      return;
    }
    if (mutation && SAFE_METADATA_WRITES.has(field)) {
      return;
    }
    if (
      mutation &&
      field === 'updateWorkspaceMemberSettings' &&
      policy.selfProfileUpdate
    ) {
      return;
    }
    if (/export/i.test(field)) {
      requireOrganizationCapability(policy, 'crm-customer:read');
      requireOrganizationCapability(policy, 'crm-customer:export');
      return;
    }
    if (
      [
        'sendMessageCampaign',
        'sendMessageCampaignTest',
        'cancelMessageCampaign',
        'previewMessageCampaignAudience',
        'previewMessageCampaignSend',
      ].includes(field)
    ) {
      requireOrganizationCapability(policy, 'crm-customer:read');
      requireOrganizationCapability(policy, 'crm-campaign:read');
      requireOrganizationCapability(policy, 'crm-campaign:send');
      return;
    }
    requireErpCapability(policy, 'crm:admin');
    return;
  }
  if (
    !mutation &&
    [
      'companies',
      'company',
      'people',
      'person',
      'opportunities',
      'opportunity',
    ].includes(field)
  ) {
    requireErpCapability(policy, 'crm-customer:read');
    return;
  }
  if (!mutation && ['workspaceMembers', 'workspaceMember'].includes(field)) {
    return;
  }
  for (const name of CUSTOMER_NAMES) {
    for (const action of [
      'create',
      'update',
      'delete',
      'destroy',
      'restore',
      'upsert',
      'merge',
    ]) {
      if (field !== action + name && field !== action + 'Many' + name) {
        continue;
      }
      requireErpCapability(policy, 'crm-customer:read');
      requireErpCapability(
        policy,
        action === 'create'
          ? 'crm-customer:create'
          : ['delete', 'destroy'].includes(action)
            ? 'crm-customer:delete'
            : 'crm-customer:update',
      );
      if (action === 'merge' || action === 'upsert') {
        throw new ForbiddenException(
          'Use explicit CRM create/update operations.',
        );
      }
      return;
    }
  }
  const campaign = field.match(
    /^(create|update|delete|destroy|restore)(?:Many)?(MessageCampaign|MessageCampaigns|MessageList|MessageLists|MessageListMember|MessageListMembers)$/,
  );
  if (
    campaign ||
    (!mutation &&
      [
        'messageCampaign',
        'messageCampaigns',
        'messageList',
        'messageLists',
        'messageListMember',
        'messageListMembers',
      ].includes(field))
  ) {
    // These vendor objects have no stable owner column. Never widen SELF/UNIT to whole-workspace access.
    requireOrganizationCapability(policy, 'crm-campaign:read');
    if (mutation) {
      requireOrganizationCapability(policy, 'crm-campaign:manage');
    }
    return;
  }
  requireErpCapability(policy, 'crm:admin');
};

export const authorizeErpCrmHttpRequest = (
  request: Request,
  policy: ErpCrmRequestPolicy,
) => {
  const path = request.path.replace(/\/+$/, '') || '/';
  if (path === '/graphql' || path === '/metadata' || path === '/admin-panel') {
    if (path === '/admin-panel') {
      requireErpCapability(policy, 'crm:admin');
      if (!policy.access.instanceAdministration) {
        throw new ForbiddenException(
          'ERP has not granted instance administration.',
        );
      }
    }
    const body: unknown =
      request.method === 'GET' ? request.query : request.body;
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      !('query' in body) ||
      typeof body.query !== 'string' ||
      body.query.length > 1024 * 1024
    ) {
      throw new ForbiddenException('Unsupported CRM GraphQL request.');
    }
    const name =
      'operationName' in body && typeof body.operationName === 'string'
        ? body.operationName
        : undefined;
    let document;
    try {
      document = parse(body.query, { maxTokens: 20000 });
    } catch {
      throw new ForbiddenException('Invalid CRM GraphQL request.');
    }
    const operation = getOperationAST(document, name);
    if (!operation || operation.operation === 'subscription') {
      throw new ForbiddenException('Unsupported CRM GraphQL operation.');
    }
    const fragments = new Map<string, FragmentDefinitionNode>();
    for (const definition of document.definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        fragments.set(definition.name.value, definition);
      }
    }
    const visited = new Set<string>();
    const walk = (selection: SelectionSetNode) => {
      for (const field of selection.selections) {
        if (
          field.kind === Kind.FIELD &&
          field.name.value === 'updateWorkspaceMemberSettings' &&
          path === '/metadata' &&
          operation.operation === 'mutation'
        ) {
          const argument = field.arguments?.find(
            (argument) => argument.name.value === 'input',
          );
          const input: unknown = argument
            ? valueFromASTUntyped(
                argument.value,
                'variables' in body &&
                  typeof body.variables === 'object' &&
                  body.variables !== null
                  ? (body.variables as Record<string, unknown>)
                  : {},
              )
            : undefined;
          if (
            !input ||
            typeof input !== 'object' ||
            !('workspaceMemberId' in input) ||
            input.workspaceMemberId !== policy.workspaceMemberId
          ) {
            throw new ForbiddenException(
              'Only own CRM preferences may be changed here.',
            );
          }
          policy.selfProfileUpdate = true;
        }
        if (field.kind === Kind.FIELD) {
          authorizeErpCrmRootField(
            policy,
            field.name.value,
            operation.operation === 'mutation',
            path !== '/graphql',
          );
        }
        if (field.kind === Kind.INLINE_FRAGMENT) {
          walk(field.selectionSet);
        }
        if (field.kind === Kind.FRAGMENT_SPREAD) {
          if (visited.has(field.name.value)) {
            continue;
          }
          visited.add(field.name.value);
          const fragment = fragments.get(field.name.value);
          if (!fragment) {
            throw new ForbiddenException('Unknown CRM fragment.');
          }
          walk(fragment.selectionSet);
        }
      }
    };
    walk(operation.selectionSet);
    return;
  }
  const resource = path.match(
    /^\/rest\/(companies|people|opportunities)(?:\/|$)/,
  );
  if (resource) {
    if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) {
      throw new ForbiddenException('Unsupported CRM REST method.');
    }
    requireErpCapability(policy, 'crm-customer:read');
    if (request.method !== 'GET') {
      requireErpCapability(
        policy,
        request.method === 'POST'
          ? 'crm-customer:create'
          : request.method === 'DELETE'
            ? 'crm-customer:delete'
            : 'crm-customer:update',
      );
    }
    return;
  }
  requireErpCapability(policy, 'crm:admin');
};

// Revocation must not trap the browser in a session it cannot terminate.
export const isErpCrmLogoutRequest = (request: Request): boolean => {
  if (
    request.path.replace(/\/+$/, '') !== '/metadata' ||
    request.method !== 'POST' ||
    Array.isArray(request.body) ||
    typeof request.body?.query !== 'string'
  ) {
    return false;
  }
  try {
    const document = parse(request.body.query, { maxTokens: 20000 });
    const operation = getOperationAST(document, request.body.operationName);
    if (!operation || operation.operation !== 'mutation') {
      return false;
    }
    const fragments = new Map(
      document.definitions
        .filter(
          (node): node is FragmentDefinitionNode =>
            node.kind === Kind.FRAGMENT_DEFINITION,
        )
        .map((node) => [node.name.value, node]),
    );
    const visited = new Set<string>();
    const names: string[] = [];
    const walk = (selection: SelectionSetNode) => {
      for (const field of selection.selections) {
        if (field.kind === Kind.FIELD) {
          names.push(field.name.value);
        } else if (field.kind === Kind.INLINE_FRAGMENT) {
          walk(field.selectionSet);
        } else if (!visited.has(field.name.value)) {
          visited.add(field.name.value);
          const fragment = fragments.get(field.name.value);
          if (!fragment) {
            throw new Error('Unknown fragment');
          }
          walk(fragment.selectionSet);
        }
      }
    };
    walk(operation.selectionSet);
    return (
      names.includes('signOut') &&
      names.every((name) => name === 'signOut' || name === '__typename')
    );
  } catch {
    return false;
  }
};
