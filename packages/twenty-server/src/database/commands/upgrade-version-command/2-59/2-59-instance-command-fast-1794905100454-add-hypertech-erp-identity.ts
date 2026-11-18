import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.59.0', 1794905100454)
export class AddHypertechErpIdentityFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."hypertechErpIdentity" ("userId" uuid NOT NULL, "workspaceId" uuid NOT NULL, "organizationId" uuid NOT NULL, "employeeId" uuid NOT NULL, "workspaceMemberId" uuid NOT NULL, "clerkSubject" text NOT NULL, "encryptedProof" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_HYPERTECH_ERP_EMPLOYEE" UNIQUE ("organizationId", "employeeId"), CONSTRAINT "UQ_HYPERTECH_ERP_SUBJECT" UNIQUE ("clerkSubject"), CONSTRAINT "PK_0a7641148dc2af66fa01720ee76" PRIMARY KEY ("userId"))');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "core"."hypertechErpIdentity"');
  }
}
