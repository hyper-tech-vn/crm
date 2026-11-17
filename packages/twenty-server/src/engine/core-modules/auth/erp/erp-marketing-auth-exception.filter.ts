import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
} from '@nestjs/common';
import { type Response } from 'express';
import {
  AuthException,
  AuthExceptionCode,
} from 'src/engine/core-modules/auth/auth.exception';

@Catch(AuthException)
export class ErpMarketingAuthExceptionFilter implements ExceptionFilter {
  catch(exception: AuthException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception.code === AuthExceptionCode.WORKSPACE_SUSPENDED ? 403 : 401;
    response
      .status(status)
      .header('Cache-Control', 'private, no-store')
      .json({
        statusCode: status,
        message:
          status === 401
            ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
            : 'Workspace hiện không khả dụng.',
      });
  }
}
