import { renderHook } from '@testing-library/react';
import { useRefetchFindManyRecords } from '@/object-record/hooks/useRefetchFindManyRecords';
const mockRefetchQueries = jest.fn();
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({ refetchQueries: mockRefetchQueries }),
}));
beforeEach(() => jest.clearAllMocks());
it('refreshes the native list while preserving skipped picker queries', async () => {
  mockRefetchQueries.mockImplementation(({ onQueryUpdated }) => {
    expect(onQueryUpdated({ options: { fetchPolicy: 'standby' } })).toBe(false);
    expect(onQueryUpdated({ options: { fetchPolicy: 'cache-first' } })).toBe(
      true,
    );
    return Promise.resolve([]);
  });
  const { result } = renderHook(() =>
    useRefetchFindManyRecords({
      objectMetadataNamePlural: 'hypertechCustomers',
    }),
  );
  await result.current.refetchFindManyRecords();
  expect(mockRefetchQueries).toHaveBeenCalledWith({
    include: ['FindManyHypertechCustomers'],
    onQueryUpdated: expect.any(Function),
  });
});
it('keeps active query failures visible', async () => {
  const error = new Error('Active query failed');
  mockRefetchQueries.mockRejectedValue(error);
  const { result } = renderHook(() =>
    useRefetchFindManyRecords({
      objectMetadataNamePlural: 'hypertechCampaigns',
    }),
  );
  await expect(result.current.refetchFindManyRecords()).rejects.toThrow(error);
});
