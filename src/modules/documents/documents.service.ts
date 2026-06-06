import { Inject, Injectable } from '@nestjs/common';

import { DATABASE } from '../../common/constants/injection-tokens';
import type { Database } from '../../database/database.types';

@Injectable()
export class DocumentsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  seedDocument() {
    void this.db;
    throw new Error('Not implemented: persist document and enqueue chunking.');
  }
}
