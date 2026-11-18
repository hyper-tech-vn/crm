import { type ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MarketingCampaignForm } from '@/customer-marketing/components/MarketingCampaignForm';
import { marketingRequest } from '@/customer-marketing/marketing-api';
import {
  type MarketingDraft,
  type MarketingSummary,
} from '@/customer-marketing/marketing-types';

jest.mock('@/customer-marketing/marketing-api');
jest.mock('@/customer-marketing/useMarketingResource', () => ({
  useMarketingResource: () => ({
    data: null,
    loading: false,
    error: null,
    reload: jest.fn(),
  }),
}));
jest.mock('@/customer-marketing/components/MarketingStyles', () => ({
  StyledMarketingGrid: 'div',
  StyledMarketingForm: 'form',
  StyledMarketingLabel: 'label',
  StyledMarketingCard: 'section',
  StyledMarketingPreview: 'pre',
  StyledMarketingNote: 'p',
}));
jest.mock('twenty-ui/primitives/typography', () => ({
  Text: ({ children, role }: { children: ReactNode; role?: string }) => (
    <span role={role}>{children}</span>
  ),
  Heading: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
jest.mock('twenty-ui/primitives/input', () => ({
  Button: ({
    children,
    type,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    type?: 'button' | 'submit';
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type={type ?? 'button'} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Textarea: ({
    value,
    onChange,
    'aria-label': label,
  }: {
    value: string;
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
    'aria-label': string;
  }) => <textarea aria-label={label} value={value} onChange={onChange} />,
}));
jest.mock('@/ui/input/components/TextInput', () => ({
  TextInput: ({
    label,
    value,
    onChange,
    disabled,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
  }) => (
    <label>
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </label>
  ),
}));
jest.mock('@/ui/input/components/Select', () => ({
  Select: ({
    label,
    value,
    onChange,
    options,
    disabled,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    disabled?: boolean;
  }) => (
    <label>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));
const request = jest.mocked(marketingRequest);
const shop = '11111111-1111-1111-1111-111111111111';
const summary: MarketingSummary = {
  totalOrders: 2,
  ordersWithEmail: 2,
  ordersWithoutEmail: 0,
  contactCount: 1,
  invalidEmailContacts: 0,
  consentCounts: { UNKNOWN: 1 },
  shops: [{ id: shop, name: 'Store A', channel: 'ETSY' }],
};
const draft: MarketingDraft = {
  id: shop,
  shopId: shop,
  name: 'Offers',
  kind: 'PROMOTION',
  subject: 'Offers for subscribers',
  bodyText: 'Customer content',
  minOrders: 2,
  maxOrders: null,
  version: 7,
  createdAt: '2026-11-17T00:00:00Z',
  updatedAt: '2026-11-17T00:00:00Z',
};
beforeEach(() => jest.clearAllMocks());
it('creates a consent-request draft without subscribing or sending to anyone', async () => {
  const user = userEvent.setup();
  request.mockResolvedValue({ ...draft, kind: 'CONSENT_REQUEST' });
  render(
    <MemoryRouter>
      <MarketingCampaignForm
        draft={null}
        summary={summary}
        onSaved={jest.fn()}
      />
    </MemoryRouter>,
  );
  await user.type(screen.getByLabelText('Tên chiến dịch'), 'Ask permission');
  await user.selectOptions(screen.getByLabelText('Shop gửi'), shop);
  await user.type(
    screen.getByLabelText('Tiêu đề email'),
    'Would you like offers?',
  );
  await user.type(
    screen.getByLabelText('Nội dung email'),
    'Please choose whether to receive offers.',
  );
  await user.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request).toHaveBeenCalledWith('/campaigns', {
    method: 'POST',
    body: expect.objectContaining({
      shopId: shop,
      kind: 'CONSENT_REQUEST',
      minOrders: 0,
    }),
  });
});
it('patches the saved draft with its version and reloads the preview', async () => {
  const user = userEvent.setup();
  const saved = jest.fn();
  request.mockResolvedValue({ ...draft, version: 8 });
  render(
    <MemoryRouter>
      <MarketingCampaignForm draft={draft} summary={summary} onSaved={saved} />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(request).toHaveBeenCalledWith(
    `/campaigns/${draft.id}`,
    expect.objectContaining({
      method: 'PATCH',
      body: expect.objectContaining({ expectedVersion: 7 }),
    }),
  );
});
it('keeps the form on an update conflict and does not claim success', async () => {
  const user = userEvent.setup();
  const saved = jest.fn();
  request.mockRejectedValue(new Error('Dữ liệu đã thay đổi'));
  render(
    <MemoryRouter>
      <MarketingCampaignForm draft={draft} summary={summary} onSaved={saved} />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Dữ liệu đã thay đổi',
  );
  expect(saved).not.toHaveBeenCalled();
});
it('shows a read-only campaign to a reader without manage capability', () => {
  render(
    <MemoryRouter>
      <MarketingCampaignForm
        draft={draft}
        summary={summary}
        onSaved={jest.fn()}
        readOnly
      />
    </MemoryRouter>,
  );
  expect(
    screen.queryByRole('button', { name: 'Lưu bản nháp' }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText('Tên chiến dịch')).toBeDisabled();
});
