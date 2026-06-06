import { BadRequestException, Injectable } from '@nestjs/common';

import {
  ChunkingOptions,
  ChunkingResult,
  ChunkingStrategy,
} from './chunking-strategy.interface';
import { RecursiveTextChunkingStrategy } from './recursive-text-chunking.strategy';
import { TextNormalizerService } from './text-normalizer.service';

/**
 * Coordinates normalization and chunking strategy selection for callers.
 */
@Injectable()
export class ChunkingService {
  private readonly strategies: Map<string, ChunkingStrategy>;

  constructor(
    private readonly normalizer: TextNormalizerService,
    recursiveStrategy: RecursiveTextChunkingStrategy,
  ) {
    this.strategies = new Map([[recursiveStrategy.name, recursiveStrategy]]);
  }

  /**
   * Normalizes raw document content before strategy-specific splitting.
   */
  normalize(text: string): string {
    return this.normalizer.normalize(text);
  }

  /**
   * Runs the requested chunking strategy through a stable module boundary.
   */
  splitText(input: {
    text: string;
    strategy: string;
    options?: ChunkingOptions;
  }): ChunkingResult[] {
    const strategy = this.strategies.get(input.strategy);

    if (!strategy) {
      throw new BadRequestException(
        `Unsupported chunking strategy: ${input.strategy}`,
      );
    }

    return strategy.split({ text: input.text }, input.options);
  }
}
