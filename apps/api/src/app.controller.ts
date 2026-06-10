import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Reports process readiness for local orchestration and frontend proxies.
   */
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'retrieval-lab-api',
    };
  }
}
