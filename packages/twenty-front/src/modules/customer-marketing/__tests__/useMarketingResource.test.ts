import { act, renderHook, waitFor } from '@testing-library/react';
import { useMarketingResource } from '@/customer-marketing/useMarketingResource';
import { marketingRequest } from '@/customer-marketing/marketing-api';
jest.mock('@/customer-marketing/marketing-api');
const request = jest.mocked(marketingRequest);
beforeEach(() => jest.clearAllMocks());
it('never displays the previous shop data while a different scope is loading', async () => {
  request.mockResolvedValueOnce({ items: ['shop-a'] });
  const { result, rerender } = renderHook(
    ({ path }: { path: string }) =>
      useMarketingResource<{ items: string[] }>(path),
    { initialProps: { path: '/customers?shopId=a' } },
  );
  await waitFor(() => expect(result.current.data?.items).toEqual(['shop-a']));
  request.mockImplementationOnce(() => new Promise(() => undefined));
  rerender({ path: '/customers?shopId=b' });
  expect(result.current.loading).toBe(true);
  expect(result.current.data).toBeNull();
});
it('ignores a late response from an aborted older scope', async () => {
  let resolveOld: (value: unknown) => void = () => undefined;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  const { result, rerender } = renderHook(
    ({ path }: { path: string }) =>
      useMarketingResource<{ items: string[] }>(path),
    { initialProps: { path: '/customers?shopId=a' } },
  );
  request.mockResolvedValueOnce({ items: ['shop-b'] });
  rerender({ path: '/customers?shopId=b' });
  await waitFor(() => expect(result.current.data?.items).toEqual(['shop-b']));
  await act(async () => resolveOld({ items: ['old-private-data'] }));
  expect(result.current.data?.items).toEqual(['shop-b']);
});
it('has a visible error and supports an explicit retry', async () => {
  request.mockRejectedValueOnce(new Error('Access denied'));
  const { result } = renderHook(() => useMarketingResource('/summary'));
  await waitFor(() =>
    expect(result.current.error?.message).toBe('Access denied'),
  );
  request.mockResolvedValueOnce({ totalOrders: 12 });
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.data).toEqual({ totalOrders: 12 }));
});
it('does not request disabled resources', () => {
  const { result } = renderHook(() => useMarketingResource(null));
  expect(result.current.loading).toBe(false);
  expect(request).not.toHaveBeenCalled();
});
