import { Inject, Injectable } from '@nestjs/common';
import OpenAI from 'openai';

import {
  DATABASE,
  OPENAI_CLIENT,
} from '../../common/constants/injection-tokens';
import type { Database } from '../../database/database.types';

@Injectable()
export class EmbeddingsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI | null,
  ) {}

  generateChunkEmbeddings() {
    void this.db;
    void this.openai;
    throw new Error('Not implemented: generate and store chunk embeddings.');
  }
}
