import { Link } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import { Text } from 'twenty-ui/primitives/typography';
import { type MarketingContact } from '@/customer-marketing/marketing-types';
import {
  formatMarketingTime,
  useMarketingLabels,
} from '@/customer-marketing/useMarketingLabels';
import {
  StyledMarketingMobileLabel,
  StyledMarketingTable,
} from './MarketingStyles';
export const MarketingCustomerTable = ({
  items,
}: {
  items: MarketingContact[];
}) => {
  const { t } = useLingui();
  const { consent } = useMarketingLabels();
  if (!items.length) {
    return <Text>{t`Chưa có khách hàng phù hợp bộ lọc.`}</Text>;
  }
  return (
    <StyledMarketingTable aria-label={t`Danh sách khách hàng`}>
      <thead>
        <tr>
          <th>{t`Khách hàng`}</th>
          <th>{t`Shop`}</th>
          <th>{t`Đơn mua`}</th>
          <th>{t`Consent`}</th>
          <th>{t`Ghi nhận gần nhất`}</th>
          <th>{t`Thao tác`}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((contact) => (
          <tr key={contact.key}>
            <td>
              <Link to={`/marketing/customers/${contact.key}`}>
                {contact.email}
              </Link>
              <br />
              <Text color="secondary">
                {contact.preferredName ??
                  contact.recipientName ??
                  t`Chưa có tên người nhận`}
              </Text>
              {!contact.emailValid && <Text>{t`Cần kiểm tra email`}</Text>}
            </td>
            <td>
              {contact.shopName ?? t`Chưa gắn shop`}
              <br />
              <Text color="secondary">{contact.channel ?? t`Thủ công`}</Text>
            </td>
            <td>
              <StyledMarketingMobileLabel>{t`Đơn mua:`}</StyledMarketingMobileLabel>
              {contact.purchaseCount}
            </td>
            <td>{consent[contact.consent]}</td>
            <td>{formatMarketingTime(contact.lastRecordedAt)}</td>
            <td>
              <Link
                to={`/marketing/customers/${contact.key}`}
              >{t`Chi tiết`}</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </StyledMarketingTable>
  );
};
