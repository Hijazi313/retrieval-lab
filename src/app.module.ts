import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.schema';
import { DatabaseModule } from './database/database.module';
import { ChunkingModule } from './modules/chunking/chunking.module';
import { CriticModule } from './modules/critic/critic.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { EmbeddingsModule } from './modules/embeddings/embeddings.module';
import { EvaluationModule } from './modules/evaluation/evaluation.module';
import { RetrievalModule } from './modules/retrieval/retrieval.module';
import { RunsModule } from './modules/runs/runs.module';
import { OpenAiModule } from './openai/openai.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    QueueModule,
    OpenAiModule,
    DocumentsModule,
    ChunkingModule,
    CriticModule,
    EmbeddingsModule,
    RetrievalModule,
    EvaluationModule,
    RunsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
