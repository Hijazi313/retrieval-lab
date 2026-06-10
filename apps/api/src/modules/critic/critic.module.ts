import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { OpenAiModule } from '../../openai/openai.module';
import { CriticController } from './critic.controller';
import { CriticService } from './critic.service';

@Module({
  imports: [DatabaseModule, OpenAiModule],
  controllers: [CriticController],
  providers: [CriticService],
  exports: [CriticService],
})
export class CriticModule {}
