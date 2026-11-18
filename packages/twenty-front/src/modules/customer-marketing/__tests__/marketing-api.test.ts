import { SESSION_COOKIE_OPT_IN_HEADER_NAME } from 'twenty-shared/constants';
import {
  marketingRequest,
  MarketingApiError,
} from '@/customer-marketing/marketing-api';
const fetchBefore = global.fetch;
const fetchMock = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock;
});
afterEach(() => {
  global.fetch = fetchBefore;
});
it('uses only the native cookie-authenticated BFF and never accepts a Clerk token from the browser', async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
  await expect(marketingRequest('/customers')).resolves.toEqual({ items: [] });
  expect(fetchMock.mock.calls[0][0]).toMatch(
    /\/auth\/erp-marketing\/customers$/,
  );
  expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  expect(
    fetchMock.mock.calls[0][1].headers[SESSION_COOKIE_OPT_IN_HEADER_NAME],
  ).toBe('1');
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
});
it('sends consent evidence as JSON with its optimistic version', async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ version: 2 }) });
  const body = {
    state: 'SUBSCRIBED',
    evidenceReference: 'Form response 123',
    expectedVersion: 1,
  };
  await marketingRequest('/customers/123/consent', { method: 'POST', body });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(body);
});
it('retains permission and conflict errors without returning false success', async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({ message: 'Dữ liệu đã thay đổi' }),
  });
  await expect(
    marketingRequest('/campaigns/123', { method: 'PATCH', body: {} }),
  ).rejects.toMatchObject({ status: 409, message: 'Dữ liệu đã thay đổi' });
});
it('handles a non-JSON proxy failure safely', async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 503,
    json: async () => {
      throw new Error('upstream HTML');
    },
  });
  await expect(marketingRequest('/summary')).rejects.toBeInstanceOf(
    MarketingApiError,
  );
});
it('rejects an invalid successful response instead of rendering a false empty state', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => null,
  });
  await expect(marketingRequest('/summary')).rejects.toMatchObject({
    status: 502,
  });
});
