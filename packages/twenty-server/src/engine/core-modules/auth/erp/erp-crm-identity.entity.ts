import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'hypertechErpIdentity', schema: 'core' })
@Unique('UQ_HYPERTECH_ERP_SUBJECT', ['clerkSubject'])
@Unique('UQ_HYPERTECH_ERP_EMPLOYEE', ['organizationId', 'employeeId'])
export class ErpCrmIdentityEntity {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  @Column({ type: 'uuid' })
  workspaceMemberId: string;

  @Column({ type: 'text' })
  clerkSubject: string;

  @Column({ type: 'text', select: false })
  encryptedProof: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
