import { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Button } from 'twenty-ui/primitives/input';
import { TextInput } from '@/ui/input/components/TextInput';
import { Select } from '@/ui/input/components/Select';
import {
  type MarketingConsent,
  type MarketingContact,
  MARKETING_CONSENT_STATES,
} from '@/customer-marketing/marketing-types';
import { marketingRequest } from '@/customer-marketing/marketing-api';
import {
  marketingEvidenceLocalTime,
  useMarketingLabels,
} from '@/customer-marketing/useMarketingLabels';
import { StyledMarketingForm } from './MarketingStyles';
import { MarketingRequestState } from './MarketingRequestState';

export const MarketingConsentForm = ({
  contact,
  onSaved,
}: {
  contact: MarketingContact;
  onSaved: () => void;
}) => {
  const { t } = useLingui();
  const { consent } = useMarketingLabels();
  const [next, setNext] = useState<MarketingConsent | ''>('');
  const [reference, setReference] = useState('');
  const [at, setAt] = useState(marketingEvidenceLocalTime);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await marketingRequest(`/customers/${contact.key}/consent`, {
        method: 'POST',
        body: {
          state: next,
          evidenceAt: new Date(`${at}:00+07:00`).toISOString(),
          evidenceReference: reference,
          expectedVersion: contact.version,
        },
      });
      onSaved();
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught
          : new Error(t`Không lưu được consent.`),
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <StyledMarketingForm
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Select
        dropdownId="marketing-next-consent"
        label={t`Kết quả xác nhận`}
        value={next}
        onChange={setNext}
        options={[
          { value: '', label: t`Chọn trạng thái` },
          ...MARKETING_CONSENT_STATES.filter(
            (state) => state !== 'UNKNOWN',
          ).map((state) => ({ value: state, label: consent[state] })),
        ]}
      />
      <TextInput
        type="datetime-local"
        label={t`Thời điểm xác nhận (giờ Việt Nam)`}
        value={at}
        onChange={setAt}
        required
      />
      <TextInput
        label={t`Bằng chứng`}
        placeholder={t`Link form, email phản hồi hoặc mã bằng chứng xác nhận`}
        value={reference}
        onChange={setReference}
        required
        minLength={10}
        maxLength={1000}
        fullWidth
      />
      <Button
        type="submit"
        disabled={!next || saving || reference.trim().length < 10 || !at}
        loading={saving}
      >{t`Lưu xác nhận`}</Button>
      <MarketingRequestState
        loading={false}
        error={error}
        onRetry={() => setError(null)}
      />
    </StyledMarketingForm>
  );
};
