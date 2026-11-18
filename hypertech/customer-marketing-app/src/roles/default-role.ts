import { defineApplicationRole } from 'twenty-sdk/define';
export default defineApplicationRole({
  universalIdentifier: '0f81af05-20eb-574f-a6ca-6ab251149ae7',
  label: 'Hypertech CRM application',
  canBeAssignedToUsers: false,
  canBeAssignedToAgents: false,
  canBeAssignedToApiKeys: false,
  canAccessAllTools: false,
  canUpdateAllSettings: false,
  recordsPermissions: {
    canReadAllRecords: false,
    canCreateAllRecords: false,
    canUpdateAllRecords: false,
    canSoftDeleteAllRecords: false,
    canDestroyAllRecords: false,
    objects: [],
  },
});
