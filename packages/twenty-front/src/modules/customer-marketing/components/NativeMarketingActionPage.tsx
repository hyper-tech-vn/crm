import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { Button } from 'twenty-ui/primitives/input';
import { Text } from 'twenty-ui/primitives/typography';
import { ListItem } from 'twenty-ui/primitives/navigation';
import {
  IconMail,
  IconRefresh,
  IconShoppingBag,
  IconCheck,
  IconDownload,
} from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { Select } from '@/ui/input/components/Select';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useRefetchFindManyRecords } from '@/object-record/hooks/useRefetchFindManyRecords';
import { useMarketingResource } from '@/customer-marketing/useMarketingResource';
import { marketingRequest } from '@/customer-marketing/marketing-api';
import { marketingCsv } from '@/customer-marketing/marketing-csv';
import {
  type MarketingContact,
  type MarketingSummary,
  type MarketingDraft,
  type MarketingPage,
  type MarketingOrder,
  type MarketingCapabilities,
} from '@/customer-marketing/marketing-types';
import { MarketingRequestState } from '@/customer-marketing/components/MarketingRequestState';
import { MarketingCampaignForm } from '@/customer-marketing/components/MarketingCampaignForm';
import { MarketingConsentForm } from '@/customer-marketing/components/MarketingConsentForm';
import { formatMarketingTime } from '@/customer-marketing/useMarketingLabels';
import { MOBILE_NAVIGATION_BAR_CLEARANCE } from '@/navigation/constants/MobileNavigationBarClearance';

const StyledContent = styled.div`
  box-sizing: border-box;
  display: flex;
  flex: 1;
  flex-direction: column;
  flex-shrink: 1;
  gap: ${themeCssVariables.spacing[4]};
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[4]};
  padding-bottom: ${MOBILE_NAVIGATION_BAR_CLEARANCE};
`;
export const NativeMarketingActionPage = () => {
  const { t } = useLingui();
  const { action, recordId } = useParams();
  const title =
    action === 'sync'
      ? t`Đồng bộ khách từ ERP`
      : action === 'export'
        ? t`Xuất khách theo shop`
        : action === 'consent'
          ? t`Quyền nhận email`
          : action === 'orders'
            ? t`Đơn hàng từ ERP`
            : t`Chiến dịch`;
  const Icon =
    action === 'sync'
      ? IconRefresh
      : action === 'export'
        ? IconDownload
        : action === 'consent'
          ? IconCheck
          : action === 'orders'
            ? IconShoppingBag
            : IconMail;
  return (
    <PageCardLayout
      header={<PageCardHeader title={title} icon={<Icon />} />}
      showInformationBanner={false}
    >
      <StyledContent>
        {action === 'sync' ? (
          <NativeMarketingSync />
        ) : action === 'export' ? (
          <NativeMarketingExport />
        ) : action === 'campaign' ? (
          <NativeMarketingCampaign recordId={recordId} />
        ) : recordId && ['consent', 'orders'].includes(action ?? '') ? (
          <NativeMarketingCustomerAction
            recordId={recordId}
            action={action ?? ''}
          />
        ) : (
          <Text>{t`Thao tác không hợp lệ.`}</Text>
        )}
      </StyledContent>
    </PageCardLayout>
  );
};
const NativeMarketingSync = () => {
  const { t } = useLingui();
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);
  const { refetchFindManyRecords } = useRefetchFindManyRecords({
    objectMetadataNamePlural: 'hypertechCustomers',
  });
  useEffect(() => () => controller?.abort(), [controller]);
  const sync = async () => {
    const abort = new AbortController();
    setController(abort);
    setBusy(true);
    setCount(0);
    setError(null);
    try {
      let after: string | null = null;
      do {
        const page: { imported: number; nextCursor: string | null } =
          await marketingRequest<{
            imported: number;
            nextCursor: string | null;
          }>('/sync', {
            method: 'POST',
            body: { after },
            signal: abort.signal,
          });
        if (
          !Number.isInteger(page.imported) ||
          page.imported < 0 ||
          page.imported > 100 ||
          (page.nextCursor !== null &&
            (typeof page.nextCursor !== 'string' ||
              !page.nextCursor ||
              page.nextCursor === after ||
              page.nextCursor.length > 160 ||
              page.imported === 0))
        ) {
          throw new Error(t`Phản hồi đồng bộ chưa hợp lệ.`);
        }
        setCount((value) => (value ?? 0) + page.imported);
        after = page.nextCursor;
      } while (after && !abort.signal.aborted);
      if (!abort.signal.aborted) {
        await refetchFindManyRecords();
      }
    } catch (caught: unknown) {
      if (!abort.signal.aborted) {
        setError(
          caught instanceof Error
            ? caught
            : new Error(t`Không đồng bộ được khách hàng.`),
        );
      }
    } finally {
      if (!abort.signal.aborted) {
        setBusy(false);
      }
    }
  };
  return (
    <>
      <Text color="secondary">{t`Lấy email và thông tin đơn từ ERP. Ghi chú và quyền nhận email trong Twenty được giữ nguyên.`}</Text>
      <Button
        loading={busy}
        disabled={busy}
        onClick={() => void sync()}
      >{t`Đồng bộ khách từ ERP`}</Button>
      {count !== null && (
        <Text role="status">
          {t`Khách đã xử lý`}: {count.toLocaleString('vi-VN')}
        </Text>
      )}
      <MarketingRequestState
        loading={false}
        error={error}
        onRetry={() => void sync()}
      />
    </>
  );
};
const NativeMarketingExport = () => {
  const { t } = useLingui();
  const summary = useMarketingResource<MarketingSummary>('/summary');
  const [shop, setShop] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await marketingRequest<Parameters<typeof marketingCsv>[0]>(
        `/customers/export?shopId=${encodeURIComponent(shop)}`,
      );
      const url = URL.createObjectURL(
        new Blob([marketingCsv(data)], { type: 'text/csv;charset=utf-8' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'khach-hang.csv';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught
          : new Error(t`Không xuất được khách hàng.`),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <MarketingRequestState
        loading={summary.loading}
        error={summary.error}
        onRetry={summary.reload}
      />
      {summary.data && (
        <Select
          dropdownId="native-marketing-export-shop"
          label={t`Shop`}
          value={shop}
          onChange={setShop}
          options={[
            { value: '', label: t`Chọn shop` },
            ...summary.data.shops.map((item) => ({
              value: item.id,
              label: item.name,
            })),
          ]}
          fullWidth
        />
      )}
      <Text color="secondary">{t`Chọn shop để xuất tối đa 5.000 khách trong phạm vi được ERP cấp.`}</Text>
      <Button
        disabled={!shop || busy}
        loading={busy}
        onClick={() => void download()}
      >{t`Xuất CSV`}</Button>
      <MarketingRequestState
        loading={false}
        error={error}
        onRetry={() => void download()}
      />
    </>
  );
};
const NativeMarketingCampaign = ({ recordId }: { recordId?: string }) => {
  const { t } = useLingui();
  const summary = useMarketingResource<MarketingSummary>('/summary');
  const capabilities =
    useMarketingResource<MarketingCapabilities>('/capabilities');
  const draft = useMarketingResource<MarketingDraft>(
    recordId && recordId !== 'new' ? `/campaigns/${recordId}` : null,
  );
  const { refetchFindManyRecords } = useRefetchFindManyRecords({
    objectMetadataNamePlural: 'hypertechCampaigns',
  });
  return (
    <>
      <MarketingRequestState
        loading={summary.loading || capabilities.loading || draft.loading}
        error={summary.error ?? capabilities.error ?? draft.error}
        onRetry={() => {
          summary.reload();
          capabilities.reload();
          draft.reload();
        }}
      />
      {recordId === 'new' &&
        capabilities.data &&
        !capabilities.data.manageCampaigns && (
          <Text>{t`Bạn chưa được cấp quyền tạo chiến dịch.`}</Text>
        )}
      {summary.data &&
        capabilities.data &&
        ((recordId === 'new' && capabilities.data.manageCampaigns) ||
          draft.data) && (
          <MarketingCampaignForm
            nativePanel
            draft={draft.data ?? null}
            summary={summary.data}
            readOnly={!capabilities.data.manageCampaigns}
            onSaved={() => {
              draft.reload();
              void refetchFindManyRecords();
            }}
          />
        )}
    </>
  );
};
const NativeMarketingCustomerAction = ({
  recordId,
  action,
}: {
  recordId: string;
  action: string;
}) => {
  const { t } = useLingui();
  const { record, loading, error, refetch } = useFindOneRecord({
    objectNameSingular: 'hypertechCustomer',
    objectRecordId: recordId,
  });
  const key = record?.sourceKey;
  const contact = useMarketingResource<MarketingContact>(
    typeof key === 'string' ? `/customers/${key}` : null,
  );
  const capabilities =
    useMarketingResource<MarketingCapabilities>('/capabilities');
  return (
    <>
      <MarketingRequestState
        loading={loading || contact.loading || capabilities.loading}
        error={error ?? contact.error ?? capabilities.error}
        onRetry={() => {
          void refetch();
          contact.reload();
          capabilities.reload();
        }}
      />
      {contact.data && (
        <>
          <Text weight="semibold">{contact.data.email}</Text>
          {action === 'consent' ? (
            capabilities.data?.updateConsent ? (
              <MarketingConsentForm
                key={contact.data.version}
                contact={contact.data}
                onSaved={() => {
                  contact.reload();
                  void refetch();
                }}
              />
            ) : (
              <Text>{t`Bạn chưa được cấp quyền ghi nhận consent.`}</Text>
            )
          ) : (
            <NativeMarketingOrders contactKey={contact.data.key} />
          )}
        </>
      )}
    </>
  );
};
const NativeMarketingOrders = ({ contactKey }: { contactKey: string }) => {
  const { t } = useLingui();
  const [after, setAfter] = useState<string | null>(null);
  const statusLabels: Record<string, string> = {
    OPEN: t`Đang xử lý`,
    COMPLETED: t`Hoàn tất`,
    CANCELLED: t`Đã hủy`,
    RETURNED_REFUNDED: t`Đã hoàn trả / hoàn tiền`,
    DRAFT: t`Bản nháp`,
  };
  const orders = useMarketingResource<MarketingPage<MarketingOrder>>(
    `/customers/${contactKey}/orders${after ? `?after=${encodeURIComponent(after)}` : ''}`,
  );
  return (
    <>
      <MarketingRequestState
        loading={orders.loading}
        error={orders.error}
        onRetry={orders.reload}
      />
      {orders.data?.items.map((order) => (
        <ListItem
          key={order.id}
          description={`${statusLabels[order.status] ?? order.status} · ${formatMarketingTime(order.recordedAt)}`}
        >
          {order.code}
        </ListItem>
      ))}
      {orders.data?.nextCursor && (
        <Button
          onClick={() => setAfter(orders.data?.nextCursor ?? null)}
        >{t`Xem thêm đơn`}</Button>
      )}
    </>
  );
};
