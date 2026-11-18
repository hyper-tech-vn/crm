import { SESSION_COOKIE_OPT_IN_HEADER_NAME } from 'twenty-shared/constants';
import { t } from '@lingui/core/macro';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

export class MarketingApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export const marketingRequest = async <TResult>(
  path: string,
  options: {
    method?: 'POST' | 'PATCH';
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<TResult> => {
  const response = await fetch(
    `${REACT_APP_SERVER_BASE_URL}/auth/erp-marketing${path}`,
    {
      method: options.method ?? 'GET',
      credentials: 'include',
      signal: options.signal,
      headers: {
        Accept: 'application/json',
        [SESSION_COOKIE_OPT_IN_HEADER_NAME]: '1',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    },
  );
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data &&
      typeof data === 'object' &&
      'message' in data &&
      typeof data.message === 'string'
        ? data.message
        : t`Không tải được dữ liệu CRM. Vui lòng thử lại.`;
    throw new MarketingApiError(response.status, message);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new MarketingApiError(
      502,
      t`Dữ liệu CRM chưa hợp lệ. Vui lòng thử lại.`,
    );
  }
  return data as TResult;
};
