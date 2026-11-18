import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { type ErpCrmAccess, type ErpCrmProof } from './erp-crm-access.types';
import { getErpCrmConfig } from './erp-crm-config';
import { ErpCrmIdentityEntity } from './erp-crm-identity.entity';
import { openErpProof, sealErpProof } from './erp-crm-proof';

@Injectable()
export class ErpCrmIdentityStore {
  constructor(
    // oxlint-disable-next-line twenty/prefer-workspace-scoped-repository -- Authentication resolves by user before workspace context; configured org/workspace are checked before use.
    @InjectRepository(ErpCrmIdentityEntity)
    private readonly identities: Repository<ErpCrmIdentityEntity>,
  ) {}

  async find(userId: string): Promise<ErpCrmIdentityEntity | null> {
    return this.identities.findOne({ where: { userId } });
  }

  async proof(
    userId: string,
  ): Promise<{ binding: ErpCrmIdentityEntity; proof: ErpCrmProof }> {
    const binding = await this.identities
      .createQueryBuilder('binding')
      .addSelect('binding.encryptedProof')
      .where('binding.userId = :userId', { userId })
      .getOne();
    if (!binding) {
      throw new UnauthorizedException(
        'Sign in through Clerk to link ERP access.',
      );
    }
    try {
      const proof = openErpProof(
        binding.encryptedProof,
        userId,
        getErpCrmConfig().secret,
      );
      if (
        proof.clerkSubject !== binding.clerkSubject ||
        proof.expiresAt * 1000 <= Date.now()
      ) {
        throw new Error('Expired ERP identity proof');
      }
      return { binding, proof };
    } catch {
      throw new UnauthorizedException('Clerk sign-in must be renewed.');
    }
  }

  async bind(
    userId: string,
    workspaceMemberId: string,
    proof: ErpCrmProof,
    access: ErpCrmAccess,
  ): Promise<void> {
    const config = getErpCrmConfig();
    await this.identities.manager.transaction(async (manager) => {
      // Serialize first links as well as updates; absence of a binding cannot be locked.
      await manager.getRepository(UserEntity).findOneOrFail({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      const repository = manager.getRepository(ErpCrmIdentityEntity);
      const existing = await repository.findOne({ where: { userId } });
      if (
        existing &&
        (existing.clerkSubject !== proof.clerkSubject ||
          existing.employeeId !== access.employeeId ||
          existing.organizationId !== access.organizationId ||
          existing.workspaceId !== config.workspaceId ||
          existing.workspaceMemberId !== workspaceMemberId)
      ) {
        throw new ForbiddenException(
          'ERP identity binding cannot be reassigned.',
        );
      }
      await repository.save(
        repository.create({
          userId,
          workspaceMemberId,
          workspaceId: config.workspaceId,
          organizationId: access.organizationId,
          employeeId: access.employeeId,
          clerkSubject: proof.clerkSubject,
          encryptedProof: sealErpProof(proof, userId, config.secret),
        }),
      );
    });
  }

  async workspaceMembersForEmployees(
    employeeIds: string[],
  ): Promise<Map<string, string>> {
    if (!employeeIds.length) {
      return new Map();
    }
    const config = getErpCrmConfig();
    const bindings = await this.identities.find({
      where: {
        organizationId: config.organizationId,
        workspaceId: config.workspaceId,
        employeeId: In(employeeIds),
      },
      select: ['employeeId', 'workspaceMemberId'],
    });
    return new Map(
      bindings.map((binding) => [
        binding.employeeId,
        binding.workspaceMemberId,
      ]),
    );
  }
}
