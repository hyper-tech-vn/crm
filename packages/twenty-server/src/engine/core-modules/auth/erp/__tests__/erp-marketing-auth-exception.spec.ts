import { type ArgumentsHost } from '@nestjs/common';
import {
  AuthException,
  AuthExceptionCode,
} from 'src/engine/core-modules/auth/auth.exception';
import { ErpMarketingAuthExceptionFilter } from 'src/engine/core-modules/auth/erp/erp-marketing-auth-exception.filter';
it('returns a safe 401 for expired native/Clerk proof instead of an internal server error', () => {
  const response = {
    status: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  new ErpMarketingAuthExceptionFilter().catch(
    new AuthException('private proof error', AuthExceptionCode.UNAUTHENTICATED),
    host,
  );
  expect(response.status).toHaveBeenCalledWith(401);
  expect(response.json).toHaveBeenCalledWith(
    expect.objectContaining({ statusCode: 401 }),
  );
  expect(JSON.stringify(response.json.mock.calls)).not.toContain(
    'private proof error',
  );
});
