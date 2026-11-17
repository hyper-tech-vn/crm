import { erpCrmRequestStorage } from './erp-crm-request-context';
import { ForbiddenException } from '@nestjs/common';
import { type ObjectLiteral } from 'typeorm';
import { type ObjectRecord } from 'twenty-shared/types';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace-repository';
import { type WorkspaceTableShape } from 'src/engine/twenty-orm/table-shape/types/workspace-table-shape.type';
import {
  erpRecordPredicate,
  requireErpCrmWrite,
} from './erp-crm-record-policy';

export const assertErpCrmReferences = async <TEntity extends ObjectLiteral>(
  repository: WorkspaceRepository<TEntity>,
  shape: WorkspaceTableShape,
  records: Partial<ObjectRecord>[],
  action: 'create' | 'update',
) => {
  const write = requireErpCrmWrite(shape, action, records);
  if (!write || write.capability === 'crm:admin') {
    return;
  }
  for (const record of records) {
    if (
      action === 'create' &&
      write.policy.grants[write.capability]?.scope !== 'ORGANIZATION' &&
      ['person', 'opportunity'].includes(shape.nameSingular)
    ) {
      const creator: unknown = record.createdBy;
      if (
        creator !== undefined &&
        (!creator ||
          typeof creator !== 'object' ||
          !('workspaceMemberId' in creator) ||
          creator.workspaceMemberId !== write.policy.workspaceMemberId)
      ) {
        throw new ForbiddenException('ERP does not allow another CRM creator.');
      }
      if (creator === undefined) {
        record.createdBy = {
          source: 'MANUAL',
          workspaceMemberId: write.policy.workspaceMemberId,
        };
      }
    }
    if (!['person', 'opportunity'].includes(shape.nameSingular)) {
      continue;
    }
    if (
      action === 'update' &&
      'companyId' in record &&
      !record.companyId &&
      write.policy.grants[write.capability]?.scope !== 'ORGANIZATION'
    ) {
      throw new ForbiddenException('Scoped CRM users cannot detach a company.');
    }
    if (!record.companyId) {
      continue;
    }
    const relation = shape.relationShapeByFieldName.company;
    if (!relation) {
      throw new ForbiddenException('CRM company ownership cannot be resolved.');
    }
    const companies = repository.getRepositoryForObjectMetadataId(
      relation.targetObjectMetadataId,
    );
    const builder = companies
      .createQueryBuilder('erp_target_company')
      .where({ id: record.companyId })
      .forUpdate();
    const predicate = erpRecordPredicate(
      write.policy,
      builder.tableShape,
      builder.alias,
      write.capability,
    );
    builder.addRowAccessCondition(predicate.sql, predicate.parameters);
    if (!(await builder.getOne())) {
      throw new ForbiddenException('ERP has denied the target CRM company.');
    }
    const carrier = erpCrmRequestStorage.getStore();
    if (carrier) {
      carrier.verifiedCompanyIds ??= new Set();
      carrier.verifiedCompanyIds.add(String(record.companyId));
    }
  }
};
