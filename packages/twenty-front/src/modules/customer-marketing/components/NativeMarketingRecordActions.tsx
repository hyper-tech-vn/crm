import { useLingui } from '@lingui/react/macro';
import { useIsMobile } from 'twenty-ui/utilities';
import { Button } from 'twenty-ui/primitives/input';
import { useTheme } from 'twenty-ui/theme';
import { useNativeMarketingActions } from '@/customer-marketing/useNativeMarketingActions';

type NativeMarketingRecordActionsProps = {
  objectName: string;
  recordId?: string;
};

export const NativeMarketingRecordActions = (
  props: NativeMarketingRecordActionsProps,
) =>
  ['hypertechCustomer', 'hypertechCampaign'].includes(props.objectName) ? (
    <NativeMarketingActionsButton
      objectName={props.objectName}
      recordId={props.recordId}
    />
  ) : null;

type NativeMarketingActionsButtonProps = NativeMarketingRecordActionsProps;

const NativeMarketingActionsButton = ({
  objectName,
  recordId,
}: NativeMarketingActionsButtonProps) => {
  const { t } = useLingui();
  const isMobile = useIsMobile();
  const actions = useNativeMarketingActions(objectName, recordId);
  const theme = useTheme();
  const action = actions.find((item) =>
    ['hypertech-sync', 'hypertech-consent', 'hypertech-campaign'].includes(
      item.id,
    ),
  );
  if (!action) {
    return null;
  }
  return (
    <Button
      aria-label={action.label}
      size="sm"
      variant={
        action.id === 'hypertech-campaign' && !recordId ? 'solid' : 'outline'
      }
      color={
        action.id === 'hypertech-campaign' && !recordId ? 'accent' : 'neutral'
      }
      startIcon={<action.Icon size={theme.icon.size.sm} />}
      onClick={action.onClick}
    >
      {isMobile
        ? action.id === 'hypertech-sync'
          ? t`Đồng bộ`
          : action.id === 'hypertech-consent'
            ? t`Nhận email`
            : recordId
              ? t`Soạn`
              : t`Tạo`
        : action.label}
    </Button>
  );
};
