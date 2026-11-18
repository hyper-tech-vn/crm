import { definePageLayout, PageLayoutTabLayoutMode } from 'twenty-sdk/define';
export default definePageLayout({
  universalIdentifier: '6805bbce-7138-5663-ae6a-1b5d4215b42b',
  name: 'Hồ sơ khách hàng',
  type: 'RECORD_PAGE',
  objectUniversalIdentifier: '2af7d632-0da2-5a9a-b607-b20918526c93',
  tabs: [
    {
      universalIdentifier: '78660b82-41aa-5544-848d-fb6d05f073d5',
      title: 'Hồ sơ',
      position: 0,
      icon: 'IconUser',
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      widgets: [
        {
          universalIdentifier: '7bd7d14d-b232-53d7-83a8-04a4ae4f63c7',
          title: 'Thông tin khách hàng',
          type: 'FIELDS',
          configuration: {
            configurationType: 'FIELDS',
            viewUniversalIdentifier: 'a943bc47-3978-5536-a7de-84d49da8e54e',
            newFieldDefaultVisibility: false,
            shouldAllowUserToSeeHiddenFields: false,
          },
        },
      ],
    },
  ],
});
