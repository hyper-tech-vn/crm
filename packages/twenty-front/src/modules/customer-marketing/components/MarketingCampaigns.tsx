import { useState } from 'react';
import { Button } from 'twenty-ui/primitives/input';
import { Link } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import { Text } from 'twenty-ui/primitives/typography';
import {
  type MarketingCapabilities,
  type MarketingDraft,
  type MarketingPage,
  type MarketingSummary,
} from '@/customer-marketing/marketing-types';
import { useMarketingResource } from '@/customer-marketing/useMarketingResource';
import { formatMarketingTime } from '@/customer-marketing/useMarketingLabels';
import { StyledMarketingTable } from './MarketingStyles';
import { MarketingRequestState } from './MarketingRequestState';
import { MarketingCampaignForm } from './MarketingCampaignForm';
export const MarketingCampaigns = ({ draftId }: { draftId?: string }) => {
  const { t } = useLingui();
  const capabilities =
    useMarketingResource<MarketingCapabilities>('/capabilities');
  const summary = useMarketingResource<MarketingSummary>('/summary');
  const [after, setAfter] = useState<string | null>(null);
  const creating = draftId === 'new';
  const listing = !draftId;
  const drafts = useMarketingResource<MarketingPage<MarketingDraft>>(
    listing
      ? `/campaigns${after ? `?after=${encodeURIComponent(after)}` : ''}`
      : null,
  );
  const draft = useMarketingResource<MarketingDraft>(
    draftId && !creating ? `/campaigns/${draftId}` : null,
  );
  if (listing) {
    return (
      <>
        <MarketingRequestState
          loading={capabilities.loading}
          error={capabilities.error}
          onRetry={capabilities.reload}
        />
        {capabilities.data?.manageCampaigns && (
          <Link to="/marketing/campaigns/new">{t`Tạo chiến dịch`}</Link>
        )}
        <MarketingRequestState
          loading={drafts.loading}
          error={drafts.error}
          onRetry={drafts.reload}
        />
        {drafts.data &&
          (drafts.data.items.length ? (
            <StyledMarketingTable aria-label={t`Chiến dịch`}>
              <thead>
                <tr>
                  <th>{t`Tên chiến dịch`}</th>
                  <th>{t`Loại`}</th>
                  <th>{t`Trạng thái`}</th>
                  <th>{t`Cập nhật`}</th>
                  <th>{t`Thao tác`}</th>
                </tr>
              </thead>
              <tbody>
                {drafts.data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>
                      {item.kind === 'PROMOTION'
                        ? t`Gửi khuyến mãi`
                        : t`Xin nhận ưu đãi`}
                    </td>
                    <td>{t`Bản nháp`}</td>
                    <td>{formatMarketingTime(item.updatedAt)}</td>
                    <td>
                      <Link
                        to={`/marketing/campaigns/${item.id}`}
                      >{t`Chi tiết`}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </StyledMarketingTable>
          ) : (
            <Text>{t`Chưa có chiến dịch. Tạo bản nháp để chọn shop, tệp khách và nội dung.`}</Text>
          ))}
        {after && (
          <Button onClick={() => setAfter(null)}>{t`Trang đầu`}</Button>
        )}
        {drafts.data?.nextCursor && (
          <Button
            onClick={() => setAfter(drafts.data?.nextCursor ?? null)}
          >{t`Trang tiếp`}</Button>
        )}
      </>
    );
  }
  return (
    <>
      <Link to="/marketing/campaigns">{t`Quay lại chiến dịch`}</Link>
      <MarketingRequestState
        loading={summary.loading || capabilities.loading || draft.loading}
        error={summary.error ?? capabilities.error ?? draft.error}
        onRetry={() => {
          summary.reload();
          capabilities.reload();
          draft.reload();
        }}
      />
      {summary.data &&
        capabilities.data &&
        (creating || draft.data) &&
        (creating && !capabilities.data.manageCampaigns ? (
          <Text role="alert">{t`Bạn chưa được cấp quyền quản lý chiến dịch trong ERP.`}</Text>
        ) : (
          <MarketingCampaignForm
            key={`${draft.data?.id ?? 'new'}-${draft.data?.version ?? 0}`}
            draft={creating ? null : draft.data}
            summary={summary.data}
            readOnly={!capabilities.data.manageCampaigns}
            onSaved={draft.reload}
          />
        ))}
    </>
  );
};
