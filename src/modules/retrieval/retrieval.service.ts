import { Injectable } from '@nestjs/common';

import type { RetrievalStrategy } from '../../common/types/retrieval-strategy.type';

@Injectable()
export class RetrievalService {
  search(strategy: RetrievalStrategy) {
    throw new Error(`Not implemented: run ${strategy} retrieval.`);
  }
}
