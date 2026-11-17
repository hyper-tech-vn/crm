import { useLingui } from '@lingui/react/macro';
import { Button } from 'twenty-ui/primitives/input';
import { Text } from 'twenty-ui/primitives/typography';
import { MarketingApiError } from '@/customer-marketing/marketing-api';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

export const MarketingRequestState = ({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) => {
  const { t } = useLingui();
  if (loading) {
    return <Text role="status">{t`Đang tải dữ liệu…`}</Text>;
  }
  if (!error) {
    return null;
  }
  const expired = error instanceof MarketingApiError && error.status === 401;
  return (
    <div role="alert">
      <Text>{error.message}</Text>
      {expired ? (
        <Button
          onClick={() =>
            window.location.assign(`${REACT_APP_SERVER_BASE_URL}/auth/clerk`)
          }
        >{t`Đăng nhập lại`}</Button>
      ) : (
        <Button onClick={onRetry}>{t`Thử lại`}</Button>
      )}
    </div>
  );
};
