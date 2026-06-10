import { Injectable } from '@nestjs/common';

import {
  ChunkingInput,
  ChunkingOptions,
  ChunkingResult,
  ChunkingStrategy,
} from './chunking-strategy.interface';

const DEFAULT_CHUNK_SIZE = 1_000;
const DEFAULT_CHUNK_OVERLAP = 150;
const SEPARATORS = [
  '\n\n---\n\n',
  '\n\n## ',
  '\n\n### ',
  '\n\n',
  '. ',
  '\n',
  ' ',
];

type Section = {
  title: string | null;
  content: string;
};

type ChunkWithMetadata = {
  content: string;
  sectionTitle?: string;
};

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

    const chunks = this.isMarkdown(input.sourceType)
      ? this.splitMarkdown(input.text, chunkSize, chunkOverlap)
      : this.buildChunksFromText(input.text, chunkSize, chunkOverlap);

    return chunks.map((chunk, index) => ({
      chunkIndex: index,
      content: chunk.content,
      tokenCount: this.estimateTokenCount(chunk.content),
      metadata: {
        chunkSize,
        chunkOverlap,
        ...(chunk.sectionTitle ? { sectionTitle: chunk.sectionTitle } : {}),
      },
    }));
  }

  /**
   * Keeps markdown headings attached to their section before any size-based splitting.
   */
  private splitMarkdown(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): ChunkWithMetadata[] {
    const sections = this.splitMarkdownSections(text);
    const chunks: ChunkWithMetadata[] = [];

    sections.forEach((section) => {
      const builtChunks = this.buildChunksFromText(
        section.content,
        chunkSize,
        chunkOverlap,
      );

      builtChunks.forEach((chunk) => {
        chunks.push({
          content: chunk.content,
          sectionTitle: section.title ?? undefined,
        });
      });
    });

    return chunks;
  }

  /**
   * Splits markdown by level-two headings and keeps each heading with its own body.
   */
  private splitMarkdownSections(text: string): Section[] {
    const normalizedText = text.trim();

    if (!normalizedText) {
      return [];
    }

    const headingMatches = Array.from(normalizedText.matchAll(/^##\s+(.+)$/gm));

    if (headingMatches.length === 0) {
      return [{ title: null, content: normalizedText }];
    }

    const sections: Section[] = [];
    const firstHeadingIndex = headingMatches[0].index ?? 0;
    const leadingContent = normalizedText.slice(0, firstHeadingIndex).trim();

    if (leadingContent) {
      sections.push({
        title: this.extractLeadingTitle(leadingContent),
        content: leadingContent,
      });
    }

    headingMatches.forEach((match, index) => {
      const start = match.index ?? 0;
      const end =
        index + 1 < headingMatches.length
          ? (headingMatches[index + 1].index ?? normalizedText.length)
          : normalizedText.length;
      const content = normalizedText.slice(start, end).trim();

      if (!content) {
        return;
      }

      sections.push({
        title: match[1].trim(),
        content,
      });
    });

    return sections;
  }

  /**
   * Attempts structural document boundaries first, then sentences, lines, and words.
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
      const overlap = this.extractBoundaryAwareOverlap(
        previousChunk,
        chunkOverlap,
      );

      return `${overlap}${chunk}`.trim();
    });
  }

  /**
   * Reuses the existing recursive splitter for plain text, then applies clean overlap.
   */
  private buildChunksFromText(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): ChunkWithMetadata[] {
    const rawChunks = this.splitRecursively(text, chunkSize, SEPARATORS);
    const mergedChunks = this.mergeSmallChunks(rawChunks, chunkSize);
    const chunksWithOverlap = this.applyOverlap(mergedChunks, chunkOverlap);

    return chunksWithOverlap
      .map((content) => content.trim())
      .filter(Boolean)
      .map((content) => ({ content }));
  }

  /**
   * Avoids carrying overlap that starts in the middle of a word or sentence.
   */
  private extractBoundaryAwareOverlap(
    previousChunk: string,
    chunkOverlap: number,
  ): string {
    const tail = previousChunk.slice(-chunkOverlap);
    const boundaryIndex = this.findPreferredBoundaryIndex(tail);
    const overlap = tail.slice(boundaryIndex).trimStart();

    if (overlap.length > 0) {
      return `${overlap}\n`;
    }

    return '';
  }

  /**
   * Prefers paragraph and sentence boundaries, then falls back to word boundaries.
   */
  private findPreferredBoundaryIndex(text: string): number {
    const paragraphBoundary = this.findLastBoundaryIndex(
      text,
      /\n\n(?=\S)/g,
      2,
    );

    if (paragraphBoundary >= 0) {
      return paragraphBoundary;
    }

    const sentenceBoundary = this.findLastBoundaryIndex(
      text,
      /[.!?]\s+(?=\S)/g,
      2,
    );

    if (sentenceBoundary >= 0) {
      return sentenceBoundary;
    }

    const lineBoundary = this.findLastBoundaryIndex(text, /\n(?=\S)/g, 1);

    if (lineBoundary >= 0) {
      return lineBoundary;
    }

    const wordBoundary = this.findLastBoundaryIndex(text, /\s+(?=\S)/g, 1);

    if (wordBoundary >= 0) {
      return wordBoundary;
    }

    return 0;
  }

  /**
   * Chooses the latest clean boundary so overlap keeps as much useful context as possible.
   */
  private findLastBoundaryIndex(
    text: string,
    pattern: RegExp,
    boundaryLength: number,
  ): number {
    const matches = Array.from(text.matchAll(pattern));
    const lastMatch = matches[matches.length - 1];

    if (!lastMatch || lastMatch.index === undefined) {
      return -1;
    }

    return lastMatch.index + boundaryLength;
  }

  /**
   * Uses the top-level title when markdown starts with front matter or an H1 before any H2.
   */
  private extractLeadingTitle(content: string): string | null {
    const headingMatch = content.match(/^#\s+(.+)$/m);

    return headingMatch ? headingMatch[1].trim() : null;
  }

  /**
   * Applies markdown-specific behavior only when the source type says so.
   */
  private isMarkdown(sourceType?: string): boolean {
    return sourceType?.trim().toLowerCase() === 'markdown';
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
