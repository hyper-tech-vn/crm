import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';
import { Button, Textarea } from 'twenty-ui/primitives/input';
import { Heading, Text } from 'twenty-ui/primitives/typography';
import { TextInput } from '@/ui/input/components/TextInput';
import { Select } from '@/ui/input/components/Select';
import {
  type MarketingAudience,
  type MarketingDraft,
  type MarketingDraftInput,
  type MarketingSummary,
} from '@/customer-marketing/marketing-types';
import { marketingRequest } from '@/customer-marketing/marketing-api';
import { useMarketingResource } from '@/customer-marketing/useMarketingResource';
import { useMarketingLabels } from '@/customer-marketing/useMarketingLabels';
import {
  StyledMarketingCard,
  StyledMarketingForm,
  StyledMarketingGrid,
  StyledMarketingLabel,
  StyledMarketingNote,
  StyledMarketingPreview,
} from './MarketingStyles';
import { MarketingRequestState } from './MarketingRequestState';
import { MarketingCustomerTable } from './MarketingCustomerTable';

export const MarketingCampaignForm = ({
  draft,
  summary,
  readOnly = false,
  onSaved,
}: {
  draft: MarketingDraft | null;
  summary: MarketingSummary;
  readOnly?: boolean;
  onSaved: () => void;
}) => {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { consent } = useMarketingLabels();
  const [input, setInput] = useState<MarketingDraftInput>(
    draft ?? {
      shopId: '',
      kind: 'CONSENT_REQUEST',
      name: '',
      subject: '',
      bodyText: '',
      minOrders: 0,
      maxOrders: null,
    },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const audience = useMarketingResource<MarketingAudience>(
    draft ? `/campaigns/${draft.id}/audience` : null,
  );
  const update = <TKey extends keyof MarketingDraftInput>(
    key: TKey,
    value: MarketingDraftInput[TKey],
  ) => setInput((previous) => ({ ...previous, [key]: value }));
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await marketingRequest<MarketingDraft>(
        draft ? `/campaigns/${draft.id}` : '/campaigns',
        {
          method: draft ? 'PATCH' : 'POST',
          body: draft
            ? { draft: input, expectedVersion: draft.version }
            : input,
        },
      );
      if (draft) {
        onSaved();
      } else {
        navigate(`/marketing/campaigns/${saved.id}`, { replace: true });
      }
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught
          : new Error(t`Không lưu được chiến dịch.`),
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <StyledMarketingGrid>
        <StyledMarketingForm
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <TextInput
            label={t`Tên chiến dịch`}
            value={input.name}
            onChange={(value) => update('name', value)}
            maxLength={150}
            required
            disabled={readOnly}
            fullWidth
          />
          <Select
            dropdownId="marketing-campaign-shop"
            label={t`Shop gửi`}
            value={input.shopId}
            onChange={(value) => update('shopId', value)}
            disabled={readOnly}
            options={[
              { value: '', label: t`Chọn shop` },
              ...summary.shops.map((shop) => ({
                value: shop.id,
                label: shop.name,
              })),
            ]}
          />
          <Select
            dropdownId="marketing-campaign-kind"
            label={t`Loại chiến dịch`}
            value={input.kind}
            onChange={(value) => update('kind', value)}
            disabled={readOnly}
            options={[
              { value: 'CONSENT_REQUEST', label: t`Xin nhận ưu đãi` },
              { value: 'PROMOTION', label: t`Gửi khuyến mãi` },
            ]}
          />
          <StyledMarketingGrid>
            <TextInput
              type="number"
              min={0}
              max={1000000}
              label={t`Số đơn mua tối thiểu`}
              value={String(input.minOrders)}
              onChange={(value) => update('minOrders', Number(value))}
              required
              disabled={readOnly}
            />
            <TextInput
              type="number"
              min={input.minOrders}
              max={1000000}
              label={t`Số đơn mua tối đa (tùy chọn)`}
              value={input.maxOrders === null ? '' : String(input.maxOrders)}
              onChange={(value) =>
                update('maxOrders', value === '' ? null : Number(value))
              }
              disabled={readOnly}
            />
          </StyledMarketingGrid>
          <TextInput
            label={t`Tiêu đề email`}
            value={input.subject}
            onChange={(value) => update('subject', value)}
            required
            maxLength={200}
            fullWidth
            disabled={readOnly}
          />
          <StyledMarketingLabel>
            {t`Nội dung email`}
            <Textarea
              aria-label={t`Nội dung email`}
              value={input.bodyText}
              onChange={(event) => update('bodyText', event.target.value)}
              required
              maxLength={50000}
              rows={10}
              disabled={readOnly}
            />
          </StyledMarketingLabel>
          {!readOnly && (
            <Button
              type="submit"
              loading={saving}
              disabled={saving || !input.shopId}
            >{t`Lưu bản nháp`}</Button>
          )}
          <MarketingRequestState
            loading={false}
            error={error}
            onRetry={() => setError(null)}
          />
        </StyledMarketingForm>
        <StyledMarketingCard>
          <Heading>{t`Xem trước nội dung`}</Heading>
          <Text weight="semibold">{input.subject || t`Chưa có tiêu đề`}</Text>
          <StyledMarketingPreview>
            {input.bodyText || t`Nhập nội dung để xem trước.`}
          </StyledMarketingPreview>
          <StyledMarketingNote>
            {input.kind === 'PROMOTION'
              ? t`Tệp nhận khuyến mãi chỉ gồm khách đã đồng ý.`
              : t`Tệp xin consent chỉ gồm khách chưa được hỏi; khách đang chờ trả lời, từ chối hoặc đã hủy đăng ký được loại ra.`}
          </StyledMarketingNote>
          <Text>{t`Trạng thái: Bản nháp`}</Text>
        </StyledMarketingCard>
      </StyledMarketingGrid>
      {draft && (
        <StyledMarketingCard>
          <Heading>{t`Tệp khách của bản đã lưu`}</Heading>
          <MarketingRequestState
            loading={audience.loading}
            error={audience.error}
            onRetry={audience.reload}
          />
          {audience.data && (
            <>
              <Text>
                {t`Khách phù hợp phân nhóm`}: {audience.data.matchedContacts} ·{' '}
                {t`Đủ điều kiện của loại chiến dịch`}:{' '}
                {audience.data.eligibleContacts}
              </Text>
              <StyledMarketingNote>
                {t`Consent cần có`}: {consent[audience.data.requiredConsent]} ·{' '}
                {t`Chưa có đơn mua hợp lệ`}: {audience.data.withoutPurchase} ·{' '}
                {t`Email cần kiểm tra`}: {audience.data.invalidEmails}
              </StyledMarketingNote>
              <MarketingCustomerTable items={audience.data.sample.items} />
              <StyledMarketingNote>{t`Hiển thị tối đa 20 khách để kiểm tra. Thay đổi bộ lọc cần lưu trước khi xem lại tệp.`}</StyledMarketingNote>
            </>
          )}
        </StyledMarketingCard>
      )}
    </>
  );
};
