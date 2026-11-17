import { marketingRequest } from '@/customer-marketing/marketing-api';
import { marketingCsv } from '@/customer-marketing/marketing-csv';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import { Button } from 'twenty-ui/primitives/input';
import { Heading, Text } from 'twenty-ui/primitives/typography';
import { TextInput } from '@/ui/input/components/TextInput';
import { Select } from '@/ui/input/components/Select';
import {
  type MarketingCapabilities,
  type MarketingContactExport,
  type MarketingContact,
  type MarketingPage,
  type MarketingSummary,
  MARKETING_CONSENT_STATES,
} from '@/customer-marketing/marketing-types';
import { useMarketingResource } from '@/customer-marketing/useMarketingResource';
import { useMarketingLabels } from '@/customer-marketing/useMarketingLabels';
import {
  StyledMarketingCard,
  StyledMarketingNote,
  StyledMarketingStats,
  StyledMarketingToolbar,
} from './MarketingStyles';
import { MarketingRequestState } from './MarketingRequestState';
import { MarketingCustomerTable } from './MarketingCustomerTable';

export const MarketingCustomers = ({
  segments = false,
}: {
  segments?: boolean;
}) => {
  const { t } = useLingui();
  const { consent } = useMarketingLabels();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('query') ?? '');
  const queryFromUrl = params.get('query') ?? '';
  useEffect(() => setSearch(queryFromUrl), [queryFromUrl]);
  const capabilities =
    useMarketingResource<MarketingCapabilities>('/capabilities');
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<Error | null>(null);
  const [syncController, setSyncController] = useState<AbortController | null>(
    null,
  );
  useEffect(() => () => syncController?.abort(), [syncController]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<Error | null>(null);
  const exportCustomers = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const filters = new URLSearchParams(params);
      filters.delete('after');
      filters.delete('size');
      const data = await marketingRequest<MarketingContactExport>(
        `/customers/export?${filters}`,
      );
      const url = URL.createObjectURL(
        new Blob([marketingCsv(data)], { type: 'text/csv;charset=utf-8' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'khach-hang.csv';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error: unknown) {
      setExportError(
        error instanceof Error
          ? error
          : new Error(t`Không xuất được khách hàng.`),
      );
    } finally {
      setExporting(false);
    }
  };
  const summary = useMarketingResource<MarketingSummary>('/summary');
  const customers = useMarketingResource<MarketingPage<MarketingContact>>(
    `/customers?${params.toString()}`,
  );
  const syncCustomers = async () => {
    const controller = new AbortController();
    setSyncController(controller);
    setSyncing(true);
    setSynced(0);
    setSyncError(null);
    let after: string | null = null;
    try {
      do {
        const page: { imported: number; nextCursor: string | null } =
          await marketingRequest('/sync', {
            method: 'POST',
            body: { after },
            signal: controller.signal,
          });
        if (
          !Number.isInteger(page.imported) ||
          page.imported < 0 ||
          page.imported > 100 ||
          (page.nextCursor !== null &&
            (typeof page.nextCursor !== 'string' ||
              !page.nextCursor ||
              page.nextCursor.length > 160)) ||
          (page.imported === 0 && page.nextCursor !== null)
        ) {
          throw new Error(t`Phản hồi đồng bộ chưa hợp lệ. Hãy thử lại.`);
        }
        if (page.nextCursor !== null && page.nextCursor === after) {
          throw new Error(t`Đồng bộ không tiến triển. Hãy thử lại.`);
        }
        setSynced((count) => (count ?? 0) + page.imported);
        after = page.nextCursor;
      } while (after && !controller.signal.aborted);
      if (!controller.signal.aborted) {
        summary.reload();
        customers.reload();
      }
    } catch (caught: unknown) {
      if (!controller.signal.aborted) {
        setSyncError(
          caught instanceof Error
            ? caught
            : new Error(t`Không đồng bộ được khách hàng.`),
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setSyncing(false);
      }
    }
  };
  const apply = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.delete('after');
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setParams(next);
  };
  const cohort = (min: string, max: string) => {
    const next = new URLSearchParams(params);
    next.delete('after');
    if (min) {
      next.set('minOrders', min);
    } else {
      next.delete('minOrders');
    }
    if (max) {
      next.set('maxOrders', max);
    } else {
      next.delete('maxOrders');
    }
    setParams(next);
  };
  return (
    <>
      {capabilities.data?.syncCustomers && (
        <StyledMarketingToolbar>
          <Button
            onClick={() => void syncCustomers()}
            disabled={syncing}
            loading={syncing}
          >{t`Đồng bộ khách từ ERP`}</Button>
          {synced !== null && (
            <StyledMarketingNote>
              {t`Khách đã xử lý`}: {synced.toLocaleString('vi-VN')}
            </StyledMarketingNote>
          )}
        </StyledMarketingToolbar>
      )}
      <MarketingRequestState
        loading={false}
        error={syncError}
        onRetry={() => void syncCustomers()}
      />
      <MarketingRequestState
        loading={summary.loading}
        error={summary.error}
        onRetry={summary.reload}
      />
      {summary.data && (
        <StyledMarketingStats>
          <StyledMarketingCard>
            <Text color="secondary">{t`Khách theo shop`}</Text>
            <Heading>
              {summary.data.contactCount.toLocaleString('vi-VN')}
            </Heading>
          </StyledMarketingCard>
          <StyledMarketingCard>
            <Text color="secondary">{t`Chưa hỏi consent`}</Text>
            <Heading>{summary.data.consentCounts.UNKNOWN ?? 0}</Heading>
          </StyledMarketingCard>
          <StyledMarketingCard>
            <Text color="secondary">{t`Đồng ý nhận ưu đãi`}</Text>
            <Heading>{summary.data.consentCounts.SUBSCRIBED ?? 0}</Heading>
          </StyledMarketingCard>
          <StyledMarketingCard>
            <Text color="secondary">{t`Đơn thiếu email`}</Text>
            <Heading>{summary.data.ordersWithoutEmail}</Heading>
          </StyledMarketingCard>
        </StyledMarketingStats>
      )}
      <StyledMarketingToolbar>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            apply('query', search);
          }}
        >
          <TextInput
            aria-label={t`Tìm khách hàng`}
            placeholder={t`Email hoặc tên người nhận`}
            value={search}
            onChange={setSearch}
            fullWidth
          />
          <Button type="submit">{t`Tìm kiếm`}</Button>
        </form>
        <Select
          dropdownId="marketing-shop"
          label={t`Shop`}
          value={params.get('shopId') ?? ''}
          onChange={(value) => apply('shopId', value)}
          options={[
            { value: '', label: t`Tất cả shop` },
            ...(summary.data?.shops ?? []).map((shop) => ({
              value: shop.id,
              label: shop.name,
            })),
          ]}
        />
        <Select
          dropdownId="marketing-consent"
          label={t`Consent`}
          value={params.get('consent') ?? ''}
          onChange={(value) => apply('consent', value)}
          options={[
            { value: '', label: t`Tất cả trạng thái` },
            ...MARKETING_CONSENT_STATES.map((state) => ({
              value: state,
              label: consent[state],
            })),
          ]}
        />
      </StyledMarketingToolbar>
      {segments && (
        <StyledMarketingToolbar>
          <Button
            onClick={() => {
              const next = new URLSearchParams();
              const shop = params.get('shopId');
              if (shop) {
                next.set('shopId', shop);
              }
              setParams(next);
            }}
          >{t`Tất cả khách`}</Button>
          <Button onClick={() => cohort('1', '1')}>{t`Mua lần đầu`}</Button>
          <Button onClick={() => cohort('2', '')}>{t`Mua nhiều lần`}</Button>
          <Button
            onClick={() => apply('consent', 'UNKNOWN')}
          >{t`Chưa hỏi nhận ưu đãi`}</Button>
          <Button
            onClick={() => apply('consent', 'SUBSCRIBED')}
          >{t`Đã đồng ý nhận ưu đãi`}</Button>
        </StyledMarketingToolbar>
      )}
      {capabilities.data?.exportCustomers && (
        <Button
          disabled={!params.get('shopId') || exporting}
          loading={exporting}
          onClick={() => void exportCustomers()}
        >{t`Xuất CSV của shop đã chọn`}</Button>
      )}
      <MarketingRequestState
        loading={false}
        error={exportError}
        onRetry={() => void exportCustomers()}
      />
      <StyledMarketingNote>{t`Hồ sơ được lưu trong Twenty, đồng bộ theo từng shop. Ngày hiển thị là lúc ERP ghi nhận đơn.`}</StyledMarketingNote>
      <MarketingRequestState
        loading={customers.loading}
        error={customers.error}
        onRetry={customers.reload}
      />
      {customers.data && (
        <>
          <MarketingCustomerTable items={customers.data.items} />
          <StyledMarketingToolbar>
            {params.has('after') && (
              <Button
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.delete('after');
                  setParams(next);
                }}
              >{t`Trang đầu`}</Button>
            )}
            {customers.data.nextCursor && (
              <Button
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set('after', customers.data?.nextCursor ?? '');
                  setParams(next);
                }}
              >{t`Trang tiếp`}</Button>
            )}
          </StyledMarketingToolbar>
        </>
      )}
    </>
  );
};
