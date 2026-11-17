import { Injectable, type NestMiddleware } from '@nestjs/common';
import { type NextFunction, type Request, type Response } from 'express';
import { erpCrmRequestStorage } from './erp-crm-request-context';

@Injectable()
export class ErpCrmRequestMiddleware implements NestMiddleware {
  use(_request: Request, _response: Response, next: NextFunction) {
    erpCrmRequestStorage.run({}, next);
  }
}
