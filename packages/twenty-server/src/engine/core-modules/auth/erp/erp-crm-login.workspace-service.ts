import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MEMBER_ROLE_UNIVERSAL_IDENTIFIER } from 'twenty-shared/constants';
import { Repository } from 'typeorm';

import { AuthService } from 'src/engine/core-modules/auth/services/auth.service';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WorkspaceInvitationService } from 'src/engine/core-modules/workspace-invitation/services/workspace-invitation.service';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';
import { RoleService } from 'src/engine/metadata-modules/role/role.service';
import { RoleAssignmentWriteService } from 'src/engine/permissions/role-assignment/role-assignment-write.service';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';
import { ErpCrmAccessClient } from './erp-crm-access.client';
import { type ErpCrmProof } from './erp-crm-access.types';
import { getErpCrmConfig, isErpUuid } from './erp-crm-config';
import { ErpCrmIdentityStore } from './erp-crm-identity.store';
import { erpCrmRequestStorage } from './erp-crm-request-context';

@Injectable()
export class ErpCrmLoginWorkspaceService {
  constructor(
    private readonly accessClient: ErpCrmAccessClient,
    private readonly identities: ErpCrmIdentityStore,
    private readonly authService: AuthService,
    private readonly users: UserService,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly memberships: Repository<UserWorkspaceEntity>,
    private readonly userWorkspaces: UserWorkspaceService,
    private readonly invitations: WorkspaceInvitationService,
    private readonly roles: RoleService,
    private readonly assignments: RoleAssignmentWriteService,
    private readonly orm: WorkspaceOrmManager,
  ) {}

  async signIn(
    identity: ErpCrmProof & { firstName?: string; lastName?: string },
  ): Promise<string> {
    const config = getErpCrmConfig();
    const access = await this.accessClient.resolve(identity.idToken);
    const workspace = await this.workspaces.findOne({
      where: { id: config.workspaceId },
    });
    if (!workspace) {
      throw new ServiceUnavailableException(
        'The ERP CRM workspace must be provisioned before sign-in.',
      );
    }
    const existing = await this.users.findUserByEmail(identity.email);
    if (existing) {
      const binding = await this.identities.find(existing.id);
      if (!binding && !access.permissions['crm:admin']) {
        throw new ForbiddenException(
          'An ERP administrator must reconcile this legacy CRM identity.',
        );
      }
      if (
        binding &&
        (binding.clerkSubject !== identity.clerkSubject ||
          binding.employeeId !== access.employeeId ||
          binding.organizationId !== access.organizationId ||
          binding.workspaceId !== config.workspaceId)
      ) {
        throw new ForbiddenException('ERP CRM identity cannot be reassigned.');
      }
    }
    const member = await this.roles.getRoleByUniversalIdentifier({
      workspaceId: workspace.id,
      universalIdentifier: MEMBER_ROLE_UNIVERSAL_IDENTIFIER,
    });
    const adminRoleId = process.env.ERP_CRM_ADMIN_ROLE_ID;
    const role = access.permissions['crm:admin']
      ? isErpUuid(adminRoleId)
        ? await this.roles.getRoleById(adminRoleId, workspace.id)
        : null
      : member;
    if (
      !role ||
      !role.canBeAssignedToUsers ||
      (!access.permissions['crm:admin'] && role.canUpdateAllSettings)
    ) {
      throw new ServiceUnavailableException(
        'ERP CRM native role mapping is invalid.',
      );
    }
    const inWorkspace =
      existing &&
      (await this.memberships.exists({
        where: { userId: existing.id, workspaceId: workspace.id },
      }));
    if (
      !inWorkspace &&
      !(await this.invitations.getOneWorkspaceInvitation(
        workspace.id,
        identity.email,
      ))
    ) {
      await this.invitations.createWorkspaceInvitation(
        identity.email,
        workspace,
        role.id,
      );
    }
    return erpCrmRequestStorage.run({ provisioning: true }, async () => {
      const redirect = await this.authService.signInUpWithSocialSso(
        {
          email: identity.email,
          firstName: identity.firstName,
          lastName: identity.lastName,
          picture: null,
          action: 'list-available-workspaces',
        },
        AuthProviderEnum.Clerk,
      );
      const user = await this.users.findUserByEmailOrThrow(identity.email);
      await this.userWorkspaces.addUserToWorkspaceIfUserNotInWorkspace(
        user,
        workspace,
        role.id,
      );
      const membership = await this.memberships.findOneOrFail({
        where: { userId: user.id, workspaceId: workspace.id },
      });
      await this.assignments.assignRoleToUserWorkspaces({
        workspaceId: workspace.id,
        userWorkspaceIds: [membership.id],
        roleId: role.id,
      });
      const workspaceMember = await this.orm.executeInWorkspaceContext(
        async () =>
          this.orm
            .getRepositoryWithoutPermissionChecks<WorkspaceMemberWorkspaceEntity>(
              'workspaceMember',
            )
            .findOneOrFail({ where: { userId: user.id } }),
        buildSystemAuthContext(workspace.id),
      );
      await this.identities.bind(user.id, workspaceMember.id, identity, access);
      return redirect;
    });
  }
}
