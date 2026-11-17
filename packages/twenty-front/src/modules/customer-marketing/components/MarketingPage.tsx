import { Link, useParams } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import { IconUser, IconFilter, IconMail } from 'twenty-ui/icon';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import {
  StyledMarketingBody,
  StyledMarketingMobileNavigation,
} from './MarketingStyles';
import { MarketingCustomers } from './MarketingCustomers';
import { MarketingCustomerDetail } from './MarketingCustomerDetail';
import { MarketingCampaigns } from './MarketingCampaigns';
export const MarketingPage = () => {
  const { section, recordId } = useParams();
  const { t } = useLingui();
  const campaigns = section === 'campaigns';
  const segments = section === 'segments';
  const title = campaigns
    ? t`Chiến dịch`
    : segments
      ? t`Phân nhóm khách`
      : t`Khách hàng`;
  return (
    <PageCardLayout
      header={
        <PageHeader
          title={title}
          Icon={campaigns ? IconMail : segments ? IconFilter : IconUser}
        />
      }
    >
      <StyledMarketingBody>
        <StyledMarketingMobileNavigation aria-label={t`Điều hướng CRM`}>
          <Link to="/marketing/customers">{t`Khách hàng`}</Link>
          <Link to="/marketing/segments">{t`Phân nhóm`}</Link>
          <Link to="/marketing/campaigns">{t`Chiến dịch`}</Link>
        </StyledMarketingMobileNavigation>
        {campaigns ? (
          <MarketingCampaigns key={recordId} draftId={recordId} />
        ) : recordId ? (
          <MarketingCustomerDetail key={recordId} contactKey={recordId} />
        ) : (
          <MarketingCustomers key={section} segments={segments} />
        )}
      </StyledMarketingBody>
    </PageCardLayout>
  );
};
