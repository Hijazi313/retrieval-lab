import { Injectable } from '@nestjs/common';

/**
 * Prepares raw document text before any chunking strategy sees it.
 */
@Injectable()
export class TextNormalizerService {
  /**
   * Normalizes line endings and noisy whitespace while preserving paragraphs.
   */
  normalize(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
