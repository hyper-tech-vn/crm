import { assertWorkspaceMemberUpdateUsesNonCustomFieldsOnly } from 'src/engine/core-modules/user/utils/assert-workspace-member-update-non-custom-fields.util';
import { ForbiddenException } from '@nestjs/common';
import { type WorkspaceTableShape } from 'src/engine/twenty-orm/table-shape/types/workspace-table-shape.type';
import { type WorkspaceSelectQueryBuilder } from 'src/engine/twenty-orm/query-builder/workspace-select-query-builder';
import { workspaceAuthContextStorage } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { type ErpCrmCapability } from './erp-crm-access.types';
import { erpCrmEnabled } from './erp-crm-config';
import { requireErpCapability } from './erp-crm-operation-policy';
import {
  erpCrmRequestStorage,
  type ErpCrmRequestPolicy,
} from './erp-crm-request-context';

const CUSTOMERS = new Set(['company', 'person', 'opportunity']);
const CAMPAIGNS = new Set([
  'messageCampaign',
  'messageList',
  'messageListMember',
]);
const quote = (identifier: string) =>
  '"' + identifier.replace(/"/g, '""') + '"';

export const erpRecordPredicate = (
  policy: ErpCrmRequestPolicy,
  shape: WorkspaceTableShape,
  alias: string,
  capability: ErpCrmCapability,
) => {
  const grant = requireErpCapability(policy, capability);
  if (!policy.databaseSchema || policy.databaseSchema !== shape.schemaName) {
    throw new ForbiddenException('ERP CRM workspace mismatch.');
  }
  if (shape.nameSingular === 'workspaceMember' && capability === 'crm:access') {
    return {
      sql: `${quote(alias)}."id" = :erp_self_profile`,
      parameters: { erp_self_profile: policy.workspaceMemberId },
    };
  }
  if (grant.scope === 'ORGANIZATION') {
    return { sql: 'TRUE', parameters: {} };
  }
  const parameter =
    'erp_' +
    capability.replace(/[^a-z]/g, '_') +
    '_' +
    alias.replace(/[^a-zA-Z0-9]/g, '_');
  const owners = grant.ownerWorkspaceMemberIds;
  if (!owners.length) {
    return { sql: 'FALSE', parameters: {} };
  }
  const column = (name: string) => quote(alias) + '.' + quote(name);
  const owned = (name: string) =>
    `${column(name)} = ANY(:${parameter}::uuid[])`;
  let sql: string;
  if (
    shape.nameSingular === 'company' &&
    shape.columnNames.includes('accountOwnerId')
  ) {
    sql = owned('accountOwnerId');
  } else if (
    ['person', 'opportunity'].includes(shape.nameSingular) &&
    shape.columnNames.includes('companyId')
  ) {
    const company = quote(shape.schemaName) + '."company"';
    const companyOwned = `EXISTS (SELECT 1 FROM ${company} AS "erp_owner_company" WHERE "erp_owner_company"."id" = ${column('companyId')} AND "erp_owner_company"."deletedAt" IS NULL AND "erp_owner_company"."accountOwnerId" = ANY(:${parameter}::uuid[]))`;
    sql = shape.columnNames.includes('createdByWorkspaceMemberId')
      ? `((${column('companyId')} IS NULL AND ${owned('createdByWorkspaceMemberId')}) OR ${companyOwned})`
      : companyOwned;
  } else if (
    CAMPAIGNS.has(shape.nameSingular) &&
    shape.columnNames.includes('createdByWorkspaceMemberId')
  ) {
    sql = owned('createdByWorkspaceMemberId');
  } else {
    throw new ForbiddenException(
      'Scoped ERP access is not supported for this CRM object.',
    );
  }
  return { sql, parameters: { [parameter]: owners } };
};

const readCapability = (
  shape: WorkspaceTableShape,
): ErpCrmCapability | undefined =>
  CUSTOMERS.has(shape.nameSingular)
    ? 'crm-customer:read'
    : CAMPAIGNS.has(shape.nameSingular)
      ? 'crm-campaign:read'
      : undefined;

export const applyErpCrmReadPolicy = (builder: WorkspaceSelectQueryBuilder) => {
  if (!erpCrmEnabled()) {
    return;
  }
  const carrier = erpCrmRequestStorage.getStore();
  const nativeContext = workspaceAuthContextStorage.getStore();
  if (
    !carrier &&
    nativeContext?.type !== 'user' &&
    nativeContext?.type !== 'pendingActivationUser'
  ) {
    return;
  }
  const policy = carrier?.policy;
  if (!policy) {
    if (builder.tableShape.nameSingular === 'workspaceMember') {
      return;
    }
    throw new ForbiddenException('ERP CRM authorization has not completed.');
  }
  const aliases = [
    { alias: builder.alias, shape: builder.tableShape },
    ...builder.getJoinAliases().map(({ name }) => ({
      alias: name,
      shape: builder.getJoinedTableShape(name),
    })),
  ];
  for (const { alias, shape } of aliases) {
    if (!shape) {
      throw new ForbiddenException('Unknown CRM join.');
    }
    const capability = readCapability(shape);
    if (!capability) {
      if (shape.nameSingular !== 'workspaceMember') {
        requireErpCapability(policy, 'crm:admin');
      }
      continue;
    }
    const predicate = erpRecordPredicate(policy, shape, alias, capability);
    builder.setParameters(predicate.parameters);
    if (alias === builder.alias) {
      builder.addRowAccessCondition(predicate.sql);
    } else {
      builder.addJoinCondition(alias, predicate.sql);
    }
  }
};

export const requireErpCrmWrite = (
  shape: WorkspaceTableShape,
  action: 'create' | 'update' | 'delete',
  records: Record<string, unknown>[] = [],
) => {
  if (!erpCrmEnabled()) {
    return;
  }
  const carrier = erpCrmRequestStorage.getStore();
  const nativeContext = workspaceAuthContextStorage.getStore();
  if (
    !carrier &&
    nativeContext?.type !== 'user' &&
    nativeContext?.type !== 'pendingActivationUser'
  ) {
    return;
  }
  if (carrier?.provisioning && shape.nameSingular === 'workspaceMember') {
    return;
  }
  const policy = carrier?.policy;
  if (!policy) {
    throw new ForbiddenException('ERP CRM authorization has not completed.');
  }
  if (
    shape.nameSingular === 'workspaceMember' &&
    action === 'update' &&
    policy.selfProfileUpdate
  ) {
    for (const record of records) {
      const profile = Object.fromEntries(
        Object.entries(record)
          .filter(([name]) => name !== 'id')
          .map(([name, value]) => [
            shape.columnShapeByColumnName[name]?.compositeParentFieldName ??
              name,
            value,
          ]),
      );
      if (Object.keys(profile).length) {
        assertWorkspaceMemberUpdateUsesNonCustomFieldsOnly({ update: profile });
      }
    }
    return { policy, capability: 'crm:access' as const };
  }
  const capability: ErpCrmCapability = CUSTOMERS.has(shape.nameSingular)
    ? `crm-customer:${action}`
    : CAMPAIGNS.has(shape.nameSingular)
      ? 'crm-campaign:manage'
      : 'crm:admin';
  const grant = requireErpCapability(policy, capability);
  for (const record of records) {
    if (
      action !== 'create' &&
      Object.keys(record).some((key) => key.startsWith('createdBy'))
    ) {
      throw new ForbiddenException('CRM ownership provenance is immutable.');
    }
    if (shape.nameSingular === 'company' && grant.scope !== 'ORGANIZATION') {
      if (action === 'create' && record.accountOwnerId === undefined) {
        record.accountOwnerId = policy.workspaceMemberId;
      }
      if (
        'accountOwnerId' in record &&
        !grant.ownerWorkspaceMemberIds.includes(String(record.accountOwnerId))
      ) {
        throw new ForbiddenException(
          'ERP does not allow assigning this CRM owner.',
        );
      }
    }
    if (
      CAMPAIGNS.has(shape.nameSingular) &&
      ['status', 'scheduledAt', 'sendAt', 'state'].some(
        (key) => key in record && record[key] !== 'DRAFT',
      )
    ) {
      for (const key of ['crm-campaign:send', 'crm-customer:read'] as const) {
        if (requireErpCapability(policy, key).scope !== 'ORGANIZATION') {
          throw new ForbiddenException(
            'Sending a campaign requires organization scope.',
          );
        }
      }
    }
  }
  return { policy, capability };
};

export const requireErpRawWorkspaceQuery = () => {
  if (
    !erpCrmEnabled() ||
    (!erpCrmRequestStorage.getStore() &&
      !['user', 'pendingActivationUser'].includes(
        workspaceAuthContextStorage.getStore()?.type ?? '',
      ))
  ) {
    return;
  }
  const policy = erpCrmRequestStorage.getStore()?.policy;
  if (!policy) {
    throw new ForbiddenException('ERP CRM authorization is required.');
  }
  for (const capability of [
    'crm:admin',
    'crm-customer:read',
    'crm-customer:create',
    'crm-customer:update',
    'crm-customer:delete',
    'crm-customer:export',
    'crm-campaign:read',
    'crm-campaign:manage',
    'crm-campaign:send',
  ] as const) {
    if (requireErpCapability(policy, capability).scope !== 'ORGANIZATION') {
      throw new ForbiddenException(
        'Raw workspace operations require full ERP CRM administration.',
      );
    }
  }
};
