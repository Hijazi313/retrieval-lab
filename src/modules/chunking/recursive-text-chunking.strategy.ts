import { Injectable } from '@nestjs/common';

import {
  ChunkingInput,
  ChunkingOptions,
  ChunkingResult,
  ChunkingStrategy,
} from './chunking-strategy.interface';

const DEFAULT_CHUNK_SIZE = 1_000;
const DEFAULT_CHUNK_OVERLAP = 150;
const SEPARATORS = ['\n\n', '\n', '. ', ' ', ''];

/**
 * Splits text by progressively smaller separators before falling back to characters.
 */
@Injectable()
export class RecursiveTextChunkingStrategy implements ChunkingStrategy {
  readonly name = 'recursive';

  /**
   * Splits normalized text into ordered chunks with optional overlap metadata.
   */
  split(input: ChunkingInput, options: ChunkingOptions = {}): ChunkingResult[] {
    const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const chunkOverlap = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

    if (chunkOverlap >= chunkSize) {
      throw new Error('chunkOverlap must be smaller than chunkSize.');
    }

    const rawChunks = this.splitRecursively(input.text, chunkSize, SEPARATORS);
    const mergedChunks = this.mergeSmallChunks(rawChunks, chunkSize);
    const chunksWithOverlap = this.applyOverlap(mergedChunks, chunkOverlap);

    return chunksWithOverlap
      .map((content) => content.trim())
      .filter(Boolean)
      .map((content, index) => ({
        chunkIndex: index,
        content,
        tokenCount: this.estimateTokenCount(content),
        metadata: {
          chunkSize,
          chunkOverlap,
        },
      }));
  }

  /**
   * Attempts paragraph, line, sentence, and word boundaries before character slicing.
   */
  private splitRecursively(
    text: string,
    chunkSize: number,
    separators: string[],
  ): string[] {
    if (text.length <= chunkSize) {
      return [text];
    }

    const [separator, ...remainingSeparators] = separators;

    if (separator === undefined) {
      return [text];
    }

    if (separator === '') {
      return this.splitByCharacters(text, chunkSize);
    }

    const parts = text.split(separator);

    if (parts.length === 1) {
      return this.splitRecursively(text, chunkSize, remainingSeparators);
    }

    return parts.flatMap((part, index) => {
      const value = index === parts.length - 1 ? part : `${part}${separator}`;

      if (value.length <= chunkSize) {
        return value;
      }

      return this.splitRecursively(value, chunkSize, remainingSeparators);
    });
  }

  /**
   * Packs small split fragments into larger chunks without crossing the size limit.
   */
  private mergeSmallChunks(chunks: string[], chunkSize: number): string[] {
    const merged: string[] = [];
    let current = '';

    for (const chunk of chunks) {
      if ((current + chunk).length > chunkSize && current.trim()) {
        merged.push(current);
        current = chunk;
        continue;
      }

      current += chunk;
    }

    if (current.trim()) {
      merged.push(current);
    }

    return merged;
  }

  /**
   * Carries trailing text from the previous chunk into the next chunk.
   */
  private applyOverlap(chunks: string[], chunkOverlap: number): string[] {
    if (chunkOverlap === 0) {
      return chunks;
    }

    return chunks.map((chunk, index) => {
      if (index === 0) {
        return chunk;
      }

      const previousChunk = chunks[index - 1];
      const overlap = previousChunk.slice(-chunkOverlap);

      return `${overlap}${chunk}`;
    });
  }

  /**
   * Last-resort splitter for text with no useful separators.
   */
  private splitByCharacters(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];

    for (let index = 0; index < text.length; index += chunkSize) {
      chunks.push(text.slice(index, index + chunkSize));
    }

    return chunks;
  }

  /**
   * Lightweight estimate used until tokenizer-backed counting is introduced.
   */
  private estimateTokenCount(content: string): number {
    return Math.ceil(content.length / 4);
  }
}
