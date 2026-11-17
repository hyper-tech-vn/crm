import {
  sourcePageSchema,
  sourceSummarySchema,
} from './erp-customer-source.schemas';
import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { getErpCrmConfig } from 'src/engine/core-modules/auth/erp/erp-crm-config';
import {
  type CustomerVisibility,
  type SourcePage,
  type SourceSummary,
} from './customer-marketing.types';
const SOURCE_PREFIX = '/api/v1/orders/crm-customers';
export const needsCustomerVisibility = (
  path: string,
  query: unknown,
  method = 'GET',
) =>
  (path.startsWith('/auth/erp-marketing') &&
    (!/^\/auth\/erp-marketing\/campaigns(?:\/[a-f0-9-]{36})?\/?$/.test(path) ||
      method !== 'GET')) ||
  /hypertech(?:Customer|ConsentEvent)/i.test(path) ||
  (typeof query === 'string' &&
    /hypertech(?:Customer|ConsentEvent)/i.test(query));
export const parseCustomerVisibility = (value: unknown): CustomerVisibility => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid customer visibility');
  }
  const entries = ['read', 'update', 'export', 'consent'].map((key) => {
    const grant: unknown = Reflect.get(value, key);
    if (
      !grant ||
      typeof grant !== 'object' ||
      !('all' in grant) ||
      typeof grant.all !== 'boolean' ||
      !('keys' in grant) ||
      !Array.isArray(grant.keys) ||
      grant.keys.length > 50000 ||
      !grant.keys.every(
        (key) => typeof key === 'string' && /^[a-f0-9]{32}$/.test(key),
      )
    ) {
      throw new Error('Invalid customer visibility grant');
    }
    return [key, { all: grant.all, keys: [...grant.keys] }];
  });
  return Object.fromEntries(entries) as CustomerVisibility;
};
@Injectable()
export class ErpCustomerSourceClient {
  async visibility(proof: string): Promise<CustomerVisibility> {
    try {
      return parseCustomerVisibility(await this.get(proof, '/visibility'));
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith('Invalid customer visibility')
      ) {
        throw new ServiceUnavailableException(
          'ERP source visibility is invalid.',
        );
      }
      throw error;
    }
  }
  async summary(proof: string): Promise<SourceSummary> {
    const result = sourceSummarySchema.safeParse(
      await this.get(proof, '/summary'),
    );
    if (!result.success) {
      throw new ServiceUnavailableException('ERP source summary is invalid.');
    }
    return result.data;
  }
  async contacts(proof: string, after: string | null): Promise<SourcePage> {
    const result = sourcePageSchema.safeParse(
      await this.get(
        proof,
        '/customers',
        after ? { after, size: '100' } : { size: '100' },
      ),
    );
    if (!result.success) {
      throw new ServiceUnavailableException('ERP source page is invalid.');
    }
    return result.data;
  }
  async history(
    proof: string,
    key: string,
    query: Record<string, string>,
  ): Promise<unknown> {
    if (!/^[a-f0-9]{32}$/.test(key)) {
      throw new ForbiddenException();
    }
    return this.get(proof, `/customers/${key}/orders`, query);
  }
  private async get(
    proof: string,
    path: string,
    query: Record<string, string> = {},
  ) {
    const url = new URL(getErpCrmConfig().endpoint);
    url.pathname = SOURCE_PREFIX + path;
    url.search = '';
    for (const [key, value] of Object.entries(query)) {
      if (!['after', 'size'].includes(key) || value.length > 200) {
        throw new ForbiddenException();
      }
      url.searchParams.set(key, value);
    }
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${proof}`,
          Accept: 'application/json',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'ERP customer source is unavailable.',
      );
    }
    if (response.status === 401) {
      throw new UnauthorizedException('Phiên đăng nhập Clerk đã hết hạn.');
    }
    if (response.status === 403) {
      throw new ForbiddenException('ERP chưa cấp quyền đọc nguồn khách hàng.');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(
        'ERP customer source is unavailable.',
      );
    }
    try {
      const text = await response.text();
      if (text.length > 8 * 1024 * 1024) {
        throw new Error('Response too large');
      }
      const data: unknown = JSON.parse(text);
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Invalid source response');
      }
      return data;
    } catch {
      throw new ServiceUnavailableException(
        'ERP customer source response is invalid.',
      );
    }
  }
}
