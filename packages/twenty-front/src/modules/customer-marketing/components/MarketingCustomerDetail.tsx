import { AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import { Button } from 'twenty-ui/primitives/input';
import { Heading, Text } from 'twenty-ui/primitives/typography';
import {
  type MarketingCapabilities,
  type MarketingContact,
  type MarketingOrder,
  type MarketingPage,
} from '@/customer-marketing/marketing-types';
import { useMarketingResource } from '@/customer-marketing/useMarketingResource';
import {
  formatMarketingTime,
  useMarketingLabels,
} from '@/customer-marketing/useMarketingLabels';
import {
  StyledMarketingCard,
  StyledMarketingGrid,
  StyledMarketingNote,
  StyledMarketingTable,
} from './MarketingStyles';
import { MarketingConsentForm } from './MarketingConsentForm';
import { MarketingRequestState } from './MarketingRequestState';
export const MarketingCustomerDetail = ({
  contactKey,
}: {
  contactKey: string;
}) => {
  const { t } = useLingui();
  const { consent } = useMarketingLabels();
  const [after, setAfter] = useState<string | null>(null);
  const statusLabels: Record<string, string> = {
    OPEN: t`Đang xử lý`,
    COMPLETED: t`Hoàn tất`,
    CANCELLED: t`Đã hủy`,
    RETURNED_REFUNDED: t`Đã hoàn trả / hoàn tiền`,
    DRAFT: t`Bản nháp`,
    SPLIT: t`Đã tách đơn`,
  };
  const customer = useMarketingResource<MarketingContact>(
    `/customers/${contactKey}`,
  );
  const capabilities =
    useMarketingResource<MarketingCapabilities>('/capabilities');
  const orders = useMarketingResource<MarketingPage<MarketingOrder>>(
    `/customers/${contactKey}/orders${after ? `?after=${encodeURIComponent(after)}` : ''}`,
  );
  return (
    <>
      <Link to="/marketing/customers">{t`Quay lại khách hàng`}</Link>
      <MarketingRequestState
        loading={customer.loading}
        error={customer.error}
        onRetry={customer.reload}
      />
      {customer.data && (
        <StyledMarketingGrid>
          <StyledMarketingCard>
            <Heading>{customer.data.email}</Heading>
            {customer.data.id && (
              <Link
                to={getAppPath(AppPath.RecordShowPage, {
                  objectNameSingular: 'hypertechCustomer',
                  objectRecordId: customer.data.id,
                })}
              >{t`Mở hồ sơ Twenty`}</Link>
            )}
            <Text>{customer.data.shopName ?? t`Chưa gắn shop`}</Text>
            {customer.data.preferredName && (
              <Text>
                {t`Tên gọi khách`}: {customer.data.preferredName}
              </Text>
            )}
            {customer.data.customerNotes && (
              <StyledMarketingNote>
                {customer.data.customerNotes}
              </StyledMarketingNote>
            )}
            <Text>
              {t`Tên người nhận gần nhất`}: {customer.data.recipientName ?? '—'}
            </Text>
            <Text>
              {t`Điện thoại`}: {customer.data.recipientPhone ?? '—'}
            </Text>
            <Text>
              {t`Quốc gia từ địa chỉ đơn`}:{' '}
              {customer.data.country ?? t`Chưa có dữ liệu`}
            </Text>
            <Text>
              {t`Số đơn mua`}: {customer.data.purchaseCount} /{' '}
              {customer.data.orderCount} {t`đơn ghi nhận`}
            </Text>
            <Text>
              {t`Đơn hoàn tất`}: {customer.data.completedCount} ·{' '}
              {t`Đơn đang xử lý`}: {customer.data.activeCount}
            </Text>
            <StyledMarketingNote>{t`Tên và điện thoại lấy từ thông tin người nhận trên đơn; email là định danh liên hệ trong shop này.`}</StyledMarketingNote>
            {customer.data.sourceSnapshotAt && (
              <StyledMarketingNote>
                {t`Đồng bộ nguồn gần nhất`}:{' '}
                {formatMarketingTime(customer.data.sourceSnapshotAt)}
              </StyledMarketingNote>
            )}
          </StyledMarketingCard>
          <StyledMarketingCard>
            <Heading>{t`Quyền nhận email`}</Heading>
            <Text>{consent[customer.data.consent]}</Text>
            {customer.data.evidenceAt && (
              <Text>{formatMarketingTime(customer.data.evidenceAt)}</Text>
            )}
            {customer.data.evidenceReference && (
              <StyledMarketingNote>
                {customer.data.evidenceReference}
              </StyledMarketingNote>
            )}
            <MarketingRequestState
              loading={capabilities.loading}
              error={capabilities.error}
              onRetry={capabilities.reload}
            />
            {capabilities.data?.updateConsent && (
              <MarketingConsentForm
                key={customer.data.version}
                contact={customer.data}
                onSaved={customer.reload}
              />
            )}
          </StyledMarketingCard>
        </StyledMarketingGrid>
      )}
      <Heading>{t`Lịch sử đơn hàng`}</Heading>
      <MarketingRequestState
        loading={orders.loading}
        error={orders.error}
        onRetry={orders.reload}
      />
      {orders.data && (
        <>
          <StyledMarketingTable aria-label={t`Lịch sử đơn hàng`}>
            <thead>
              <tr>
                <th>{t`Đơn hàng`}</th>
                <th>{t`Trạng thái`}</th>
                <th>{t`Người nhận`}</th>
                <th>{t`ERP ghi nhận`}</th>
              </tr>
            </thead>
            <tbody>
              {orders.data.items.map((order) => (
                <tr key={order.id}>
                  <td>{order.code}</td>
                  <td>{statusLabels[order.status] ?? order.status}</td>
                  <td>{order.recipientName}</td>
                  <td>{formatMarketingTime(order.recordedAt)}</td>
                </tr>
              ))}
            </tbody>
          </StyledMarketingTable>
          {orders.data.nextCursor && (
            <Button
              onClick={() => setAfter(orders.data?.nextCursor ?? null)}
            >{t`Xem thêm đơn`}</Button>
          )}
        </>
      )}
    </>
  );
};
