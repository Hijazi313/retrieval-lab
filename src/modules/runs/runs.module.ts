import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { RunsService } from './runs.service';

@Module({
  imports: [DatabaseModule],
  providers: [RunsService],
  exports: [RunsService],
})
export class RunsModule {}
