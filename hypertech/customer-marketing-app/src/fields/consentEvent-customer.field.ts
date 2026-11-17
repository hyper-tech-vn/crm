import {
  defineField,
  FieldType,
  RelationType,
  OnDeleteAction,
} from 'twenty-sdk/define';
export default defineField({
  universalIdentifier: '3f41e716-90a7-5cfe-8e22-1cc90aad2073',
  objectUniversalIdentifier: '874ee432-da2a-5e40-8f12-3a1a8425c744',
  type: FieldType.RELATION,
  isUIEditable: false,
  name: 'customer',
  label: 'Khách hàng',
  relationTargetObjectMetadataUniversalIdentifier:
    '2af7d632-0da2-5a9a-b607-b20918526c93',
  relationTargetFieldMetadataUniversalIdentifier:
    '0573b32b-7bed-523d-81c9-2a7fd926abc6',
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.RESTRICT,
    joinColumnName: 'customerId',
  },
});
