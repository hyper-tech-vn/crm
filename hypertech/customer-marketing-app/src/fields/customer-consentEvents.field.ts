import { defineField, FieldType, RelationType } from 'twenty-sdk/define';
export default defineField({
  universalIdentifier: '0573b32b-7bed-523d-81c9-2a7fd926abc6',
  objectUniversalIdentifier: '2af7d632-0da2-5a9a-b607-b20918526c93',
  type: FieldType.RELATION,
  isUIEditable: false,
  name: 'consentEvents',
  label: 'Lịch sử consent',
  relationTargetObjectMetadataUniversalIdentifier:
    '874ee432-da2a-5e40-8f12-3a1a8425c744',
  relationTargetFieldMetadataUniversalIdentifier:
    '3f41e716-90a7-5cfe-8e22-1cc90aad2073',
  universalSettings: { relationType: RelationType.ONE_TO_MANY },
});
