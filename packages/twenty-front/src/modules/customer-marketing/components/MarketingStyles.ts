import { styled } from '@linaria/react';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme';

export const StyledMarketingBody = styled.div`
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[5]};
  min-width: 0;
  overflow: auto;
  padding: ${themeCssVariables.spacing[6]};
  @media (max-width: ${MOBILE_VIEWPORT}px) {
    padding: ${themeCssVariables.spacing[3]};
  }
`;
export const StyledMarketingToolbar = styled.div`
  align-items: end;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[3]};
  > * {
    min-width: 0;
  }
  form {
    display: flex;
    flex: 1;
    gap: ${themeCssVariables.spacing[2]};
    min-width: 180px;
  }
`;
export const StyledMarketingStats = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[4]};
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
`;
export const StyledMarketingCard = styled.section`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  min-width: 0;
  padding: ${themeCssVariables.spacing[4]};
`;
export const StyledMarketingGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[5]};
  grid-template-columns: repeat(2, minmax(0, 1fr));
  @media (max-width: ${MOBILE_VIEWPORT}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
export const StyledMarketingForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  max-width: 800px;
`;
export const StyledMarketingLabel = styled.label`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
`;
export const StyledMarketingNote = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  line-height: 1.6;
  margin: 0;
  overflow-wrap: anywhere;
`;
export const StyledMarketingTable = styled.table`
  border-collapse: collapse;
  table-layout: fixed;
  text-align: left;
  width: 100%;
  th,
  td {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
    overflow-wrap: anywhere;
    padding: ${themeCssVariables.spacing[3]};
    vertical-align: top;
  }
  th {
    color: ${themeCssVariables.font.color.secondary};
    font-weight: ${themeCssVariables.font.weight.medium};
  }
  th:first-child {
    width: 25%;
  }
  th:last-child {
    width: 90px;
  }
  td a {
    color: inherit;
    text-decoration: none;
  }
  td a:hover {
    text-decoration: underline;
  }
  @media (max-width: ${MOBILE_VIEWPORT}px) {
    display: block;
    thead {
      display: none;
    }
    tbody {
      display: block;
    }
    tr {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      padding: ${themeCssVariables.spacing[3]} 0;
      border-bottom: 1px solid ${themeCssVariables.border.color.light};
    }
    td {
      display: block;
      border: 0;
      padding: ${themeCssVariables.spacing[1]};
    }
    td:first-child {
      grid-column: 1 / -1;
      font-weight: ${themeCssVariables.font.weight.medium};
    }
    td:last-child {
      grid-column: 1 / -1;
    }
  }
`;
export const StyledMarketingMobileLabel = styled.span`
  display: none;
  @media (max-width: ${MOBILE_VIEWPORT}px) {
    display: inline;
    color: ${themeCssVariables.font.color.secondary};
    margin-right: ${themeCssVariables.spacing[1]};
  }
`;
export const StyledMarketingPreview = styled.pre`
  font-family: ${themeCssVariables.font.family};
  line-height: 1.6;
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
`;

export const StyledMarketingMobileNavigation = styled.nav`
  display: none;
  @media (max-width: ${MOBILE_VIEWPORT}px) {
    display: flex;
    flex-wrap: wrap;
    gap: ${themeCssVariables.spacing[4]};
  }
  a {
    color: ${themeCssVariables.font.color.primary};
  }
`;
