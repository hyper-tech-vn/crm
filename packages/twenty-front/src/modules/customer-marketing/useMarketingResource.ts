import { useCallback, useEffect, useState } from 'react';
import { marketingRequest } from './marketing-api';

type Resource<TResult> = {
  path: string | null;
  data: TResult | null;
  error: Error | null;
  loading: boolean;
};
export const useMarketingResource = <TResult>(path: string | null) => {
  const [revision, setRevision] = useState(0);
  const [resource, setResource] = useState<Resource<TResult>>({
    path: null,
    data: null,
    error: null,
    loading: false,
  });
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (path === null) {
      return;
    }
    const controller = new AbortController();
    setResource({ path, data: null, error: null, loading: true });
    void marketingRequest<TResult>(path, { signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted) {
          setResource({ path, data, error: null, loading: false });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setResource({
            path,
            data: null,
            error:
              error instanceof Error
                ? error
                : new Error('Không tải được dữ liệu CRM'),
            loading: false,
          });
        }
      },
    );
    return () => controller.abort();
  }, [path, revision]);
  return {
    ...(path === resource.path
      ? resource
      : { data: null, error: null, loading: path !== null }),
    reload,
  };
};
