import { useLingui } from '@lingui/react/macro';
import { type MarketingConsent } from './marketing-types';
export const useMarketingLabels = () => {
  const { t } = useLingui();
  const consent: Record<MarketingConsent, string> = {
    UNKNOWN: t`Chưa hỏi`,
    PENDING: t`Chờ trả lời`,
    SUBSCRIBED: t`Đồng ý`,
    DECLINED: t`Từ chối`,
    UNSUBSCRIBED: t`Đã hủy đăng ký`,
    SUPPRESSED: t`Đang chặn gửi`,
  };
  return { consent };
};
export const formatMarketingTime = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
export const marketingEvidenceLocalTime = () =>
  new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
    .format(new Date())
    .replace(' ', 'T');
