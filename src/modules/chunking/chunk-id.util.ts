import { createHash } from 'crypto';

/**
 * Creates a stable UUID-shaped identifier for the same chunk identity.
 */
export function createDeterministicChunkId(input: {
  documentId: string;
  chunkStrategy: string;
  chunkIndex: number;
  content: string;
}): string {
  const hash = createHash('sha256')
    .update(input.documentId)
    .update(':')
    .update(input.chunkStrategy)
    .update(':')
    .update(String(input.chunkIndex))
    .update(':')
    .update(input.content)
    .digest('hex');

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    ((Number.parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80)
      .toString(16)
      .padStart(2, '0') + hash.slice(18, 20),
    hash.slice(20, 32),
  ].join('-');
}
