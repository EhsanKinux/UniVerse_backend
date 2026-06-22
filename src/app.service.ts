import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'uni-verse API',
      timestamp: new Date().toISOString(),
    };
  }
}
