import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { type Request } from 'express';
import { ErpCrmAccessClient, parseErpCrmAccess } from './erp-crm-access.client';
import { ErpCrmAuthorizationService } from './erp-crm-authorization.service';
import { type ErpCrmIdentityStore } from './erp-crm-identity.store';
import {
  authorizeErpCrmHttpRequest,
  isErpCrmLogoutRequest,
} from './erp-crm-operation-policy';
import {
  erpCrmRequestStorage,
  type ErpCrmRequestPolicy,
} from './erp-crm-request-context';
import { sealErpProof, openErpProof } from './erp-crm-proof';
import { type RawAuthContext } from 'src/engine/core-modules/auth/types/raw-auth-context.type';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';

const organizationId = '10000000-0000-4000-8000-000000000001';
const employeeId = '20000000-0000-4000-8000-000000000001';
const workspaceId = '30000000-0000-4000-8000-000000000001';
const userId = '40000000-0000-4000-8000-000000000001';
const workspaceMemberId = '50000000-0000-4000-8000-000000000001';
const grant = { scope: 'SELF' as const, ownerEmployeeIds: [employeeId] };
const access = {
  version: 1 as const,
  organizationId,
  employeeId,
  instanceAdministration: false,
  permissions: { 'crm:access': grant, 'crm-customer:read': grant },
};
const proof = {
  idToken: 'signed-token',
  clerkSubject: 'user_actor',
  email: 'actor@example.test',
  expiresAt: Math.floor(Date.now() / 1000) + 600,
};
const policy = (): ErpCrmRequestPolicy => ({
  access,
  userId,
  workspaceId,
  workspaceMemberId,
  databaseSchema: 'workspace_a',
  grants: {
    'crm:access': { ...grant, ownerWorkspaceMemberIds: [workspaceMemberId] },
    'crm-customer:read': {
      ...grant,
      ownerWorkspaceMemberIds: [workspaceMemberId],
    },
  },
});
const request = (query: string, path = '/graphql') =>
  ({ path, method: 'POST', body: { query } }) as Request;

describe('ERP CRM boundary', () => {
  const environment = process.env;
  beforeEach(() => {
    process.env = {
      ...environment,
      AUTH_CLERK_ENABLED: 'true',
      ERP_CRM_BASE_URL: 'https://erp-api.hyper-tech.vn',
      ERP_CRM_ORGANIZATION_ID: organizationId,
      ERP_CRM_WORKSPACE_ID: workspaceId,
      APP_SECRET: 'test-secret-with-more-than-thirty-two-characters',
    };
  });
  afterEach(() => {
    process.env = environment;
    jest.restoreAllMocks();
  });

  it('validates organization, mandatory access, self scope and admin scope', () => {
    expect(parseErpCrmAccess(access, organizationId)).toEqual(access);
    expect(() =>
      parseErpCrmAccess(
        { ...access, organizationId: workspaceId },
        organizationId,
      ),
    ).toThrow();
    expect(() =>
      parseErpCrmAccess({ ...access, permissions: {} }, organizationId),
    ).toThrow(ForbiddenException);
    expect(() =>
      parseErpCrmAccess(
        {
          ...access,
          permissions: {
            'crm:access': { ...grant, ownerEmployeeIds: [workspaceId] },
          },
        },
        organizationId,
      ),
    ).toThrow();
    expect(
      parseErpCrmAccess(
        {
          ...access,
          permissions: { ...access.permissions, 'crm:admin': grant },
        },
        organizationId,
      ).permissions['crm:admin'],
    ).toBeUndefined();
  });

  it.each([401, 403, 500])('fails closed for ERP status %s', async (status) => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status }));
    await expect(
      new ErpCrmAccessClient().resolve('signed-token'),
    ).rejects.toBeInstanceOf(
      status === 401
        ? UnauthorizedException
        : status === 403
          ? ForbiddenException
          : ServiceUnavailableException,
    );
  });

  it('does not follow redirects or trust Clerk roles, and fails closed on network failure', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('unavailable'));
    await expect(
      new ErpCrmAccessClient().resolve('signed-token'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetch).toHaveBeenCalledWith(
      'https://erp-api.hyper-tech.vn/api/v1/access/applications/crm',
      expect.objectContaining({
        redirect: 'error',
        headers: expect.objectContaining({
          Authorization: 'Bearer signed-token',
        }),
      }),
    );
  });

  it('checks every root alias/fragment and rejects writes, batch envelopes and export without grant', () => {
    expect(() =>
      authorizeErpCrmHttpRequest(
        request('query { mine: companies { totalCount } }'),
        policy(),
      ),
    ).not.toThrow();
    for (const query of [
      'mutation { innocent: deleteCompany(id:"x") { id } }',
      'query { ...Hidden } fragment Hidden on Query { apiKeys { id } }',
      'mutation { exportRecords { id } }',
    ]) {
      expect(() =>
        authorizeErpCrmHttpRequest(
          request(query, query.includes('export') ? '/metadata' : '/graphql'),
          policy(),
        ),
      ).toThrow(ForbiddenException);
    }
    expect(() =>
      authorizeErpCrmHttpRequest(
        {
          path: '/graphql',
          method: 'POST',
          body: [{ query: '{ companies { id } }' }],
        } as Request,
        policy(),
      ),
    ).toThrow(ForbiddenException);
  });

  it('keeps logout available after revocation without allowing mixed operations', () => {
    expect(
      isErpCrmLogoutRequest(
        request('mutation { goodbye: signOut }', '/metadata'),
      ),
    ).toBe(true);
    expect(
      isErpCrmLogoutRequest(
        request('mutation { signOut deleteUser }', '/metadata'),
      ),
    ).toBe(false);
    expect(
      isErpCrmLogoutRequest(
        request(
          'mutation { signOut ...Other } fragment Other on Mutation { deleteUser }',
          '/metadata',
        ),
      ),
    ).toBe(false);
  });

  it('allows only own profile preferences and does not widen campaign scope', () => {
    const current = policy();
    const own = request(
      'mutation($input: UpdateWorkspaceMemberSettingsInput!) { updateWorkspaceMemberSettings(input:$input) }',
      '/metadata',
    );
    own.body.variables = {
      input: { workspaceMemberId, update: { locale: 'vi-VN' } },
    };
    expect(() => authorizeErpCrmHttpRequest(own, current)).not.toThrow();
    own.body.variables.input.workspaceMemberId = userId;
    expect(() => authorizeErpCrmHttpRequest(own, current)).toThrow(
      ForbiddenException,
    );
    current.grants['crm-campaign:read'] = {
      ...grant,
      ownerWorkspaceMemberIds: [workspaceMemberId],
    };
    expect(() =>
      authorizeErpCrmHttpRequest(
        request('{ messageCampaigns { id } }'),
        current,
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      authorizeErpCrmHttpRequest(
        request(
          'mutation { sendMessageCampaignTest(input:{}) { messageId } }',
          '/metadata',
        ),
        current,
      ),
    ).toThrow(ForbiddenException);
  });

  it('does not bypass send permissions through a trailing-slash metadata route', () => {
    const current = policy();
    const organization = {
      scope: 'ORGANIZATION' as const,
      ownerEmployeeIds: [],
      ownerWorkspaceMemberIds: [],
    };
    current.grants['crm:admin'] = organization;
    current.grants['crm-customer:read'] = organization;
    current.grants['crm-campaign:read'] = organization;
    expect(() =>
      authorizeErpCrmHttpRequest(
        request(
          'mutation { sendMessageCampaignTest(input:{}) { messageId } }',
          '/metadata/',
        ),
        current,
      ),
    ).toThrow(ForbiddenException);
  });

  it('binds encrypted proof to a native identity and secret', () => {
    const sealed = sealErpProof(proof, userId, process.env.APP_SECRET!);
    expect(sealed).not.toContain(proof.idToken);
    expect(openErpProof(sealed, userId, process.env.APP_SECRET!)).toEqual(
      proof,
    );
    expect(() =>
      openErpProof(sealed, workspaceId, process.env.APP_SECRET!),
    ).toThrow();
    expect(() =>
      openErpProof(sealed, userId, process.env.APP_SECRET! + 'different'),
    ).toThrow();
  });

  it('rechecks ERP on a new request, including an existing native session after revocation', async () => {
    const identities = {
      proof: jest.fn().mockResolvedValue({
        proof,
        binding: {
          organizationId,
          employeeId,
          workspaceId,
          workspaceMemberId,
        },
      }),
      workspaceMembersForEmployees: jest
        .fn()
        .mockResolvedValue(new Map([[employeeId, workspaceMemberId]])),
    };
    const client = { resolve: jest.fn().mockResolvedValue(access) };
    const service = new ErpCrmAuthorizationService(
      identities as unknown as ErpCrmIdentityStore,
      client as ErpCrmAccessClient,
    );
    const nativeUser = {
      id: userId,
      email: proof.email,
      canAccessFullAdminPanel: true,
      canImpersonate: true,
    };
    const auth = {
      user: nativeUser,
      authProvider: AuthProviderEnum.Clerk,
      workspace: { id: workspaceId, databaseSchema: 'workspace_a' },
      workspaceMemberId,
      impersonationContext: {},
    } as RawAuthContext;
    await erpCrmRequestStorage.run({}, async () => {
      await service.authorize(request('{ companies { totalCount } }'), auth);
      await service.authorize(request('{ companies { totalCount } }'), auth);
    });
    expect(client.resolve).toHaveBeenCalledTimes(1);
    expect(auth.user?.canAccessFullAdminPanel).toBe(false);
    expect(nativeUser.canAccessFullAdminPanel).toBe(true);
    client.resolve.mockRejectedValue(new ForbiddenException('Revoked'));
    await expect(
      erpCrmRequestStorage.run({}, () =>
        service.authorize(request('{ companies { totalCount } }'), auth),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.resolve).toHaveBeenCalledTimes(2);
  });
});
