import { type ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MarketingCustomers } from '@/customer-marketing/components/MarketingCustomers';
import { marketingRequest } from '@/customer-marketing/marketing-api';
const summaryReload = jest.fn();
const customersReload = jest.fn();
jest.mock('@/customer-marketing/marketing-api');
jest.mock('@/customer-marketing/useMarketingResource', () => ({
  useMarketingResource: (path: string) => ({
    data:
      path === '/capabilities'
        ? { syncCustomers: true, exportCustomers: false }
        : path === '/summary'
          ? {
              contactCount: 0,
              sourceContactCount: 101,
              consentCounts: {},
              ordersWithoutEmail: 2,
              shops: [],
            }
          : { items: [], nextCursor: null },
    loading: false,
    error: null,
    reload: path === '/summary' ? summaryReload : customersReload,
  }),
}));
jest.mock('@/customer-marketing/components/MarketingStyles', () => ({
  StyledMarketingCard: 'section',
  StyledMarketingNote: 'p',
  StyledMarketingStats: 'div',
  StyledMarketingToolbar: 'div',
  StyledMarketingTable: 'table',
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
    onClick,
    disabled,
    type,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: 'button' | 'submit';
  }) => (
    <button type={type ?? 'button'} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));
jest.mock('@/ui/input/components/TextInput', () => ({
  TextInput: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <input
      aria-label="Tìm khách hàng"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
jest.mock('@/ui/input/components/Select', () => ({
  Select: ({
    label,
    value,
    onChange,
    options,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
beforeEach(() => jest.clearAllMocks());
it('syncs every source page into Twenty and reloads native data without consent mutations', async () => {
  jest
    .mocked(marketingRequest)
    .mockResolvedValueOnce({ imported: 100, nextCursor: 'page-two' })
    .mockResolvedValueOnce({ imported: 1, nextCursor: null });
  render(
    <MemoryRouter>
      <MarketingCustomers />
    </MemoryRouter>,
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Đồng bộ khách từ ERP' }),
  );
  await waitFor(() => expect(summaryReload).toHaveBeenCalledTimes(1));
  expect(customersReload).toHaveBeenCalledTimes(1);
  expect(marketingRequest).toHaveBeenCalledTimes(2);
  expect(marketingRequest).toHaveBeenNthCalledWith(
    1,
    '/sync',
    expect.objectContaining({ method: 'POST', body: { after: null } }),
  );
  expect(marketingRequest).toHaveBeenNthCalledWith(
    2,
    '/sync',
    expect.objectContaining({ method: 'POST', body: { after: 'page-two' } }),
  );
  expect(screen.getByText(/101/)).toBeInTheDocument();
});
it('stops on source failure and leaves retry deliberate', async () => {
  jest
    .mocked(marketingRequest)
    .mockRejectedValueOnce(new Error('Nguồn ERP chưa phản hồi'));
  render(
    <MemoryRouter>
      <MarketingCustomers />
    </MemoryRouter>,
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Đồng bộ khách từ ERP' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Nguồn ERP chưa phản hồi',
  );
  expect(marketingRequest).toHaveBeenCalledTimes(1);
  expect(summaryReload).not.toHaveBeenCalled();
});
