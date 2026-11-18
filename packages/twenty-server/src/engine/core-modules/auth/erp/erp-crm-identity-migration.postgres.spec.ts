import { DataSource } from 'typeorm';
import { AddHypertechErpIdentityFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-59/2-59-instance-command-fast-1794905100454-add-hypertech-erp-identity';
import { ErpCrmIdentityEntity } from './erp-crm-identity.entity';

(process.env.ERP_CRM_MIGRATION_TEST_DATABASE_URL ? describe : describe.skip)(
  'ERP identity migration on an isolated database',
  () => {
    it('preserves legacy rows, hides proof by default and enforces immutable identity uniqueness', async () => {
      jest.useRealTimers();
      const database = new DataSource({
        type: 'postgres',
        url: process.env.ERP_CRM_MIGRATION_TEST_DATABASE_URL,
        entities: [ErpCrmIdentityEntity],
      });
      await database.initialize();
      const runner = database.createQueryRunner();
      try {
        // Never reuse a populated core schema, even if an operator points at the wrong database.
        expect(
          (
            await database.query("SELECT to_regnamespace('core') AS namespace")
          )[0].namespace,
        ).toBeNull();
        await runner.startTransaction();
        await runner.query('CREATE SCHEMA core');
        await runner.query(
          'CREATE TABLE core.legacy_user_fixture (id integer PRIMARY KEY, name text)',
        );
        await runner.query(
          "INSERT INTO core.legacy_user_fixture VALUES (1,'existing user')",
        );
        const command = new AddHypertechErpIdentityFastInstanceCommand();
        await command.up(runner);
        const repository = runner.manager.getRepository(ErpCrmIdentityEntity);
        const id = (index: number) =>
          `70000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
        const binding = {
          userId: id(1),
          workspaceId: id(2),
          organizationId: id(3),
          employeeId: id(4),
          workspaceMemberId: id(5),
          clerkSubject: 'user_existing',
          encryptedProof: 'encrypted-private-proof',
        };
        await repository.insert(binding);
        expect(
          (await repository.findOneByOrFail({ userId: id(1) })).encryptedProof,
        ).toBeUndefined();
        await runner.query('SAVEPOINT duplicate_identity');
        await expect(
          repository.insert({
            ...binding,
            userId: id(6),
            clerkSubject: 'user_other',
          }),
        ).rejects.toThrow();
        await runner.query('ROLLBACK TO SAVEPOINT duplicate_identity');
        await runner.query('SAVEPOINT duplicate_subject');
        await expect(
          repository.insert({ ...binding, userId: id(6), employeeId: id(7) }),
        ).rejects.toThrow();
        await runner.query('ROLLBACK TO SAVEPOINT duplicate_subject');
        expect(
          await runner.query('SELECT * FROM core.legacy_user_fixture'),
        ).toEqual([{ id: 1, name: 'existing user' }]);
        await command.down(runner);
        expect(
          await runner.query('SELECT * FROM core.legacy_user_fixture'),
        ).toEqual([{ id: 1, name: 'existing user' }]);
      } finally {
        if (runner.isTransactionActive) {
          await runner.rollbackTransaction();
        }
        await runner.release();
        await database.destroy();
      }
    }, 30000);
  },
);
