/**
 * Input shared by all chunking strategies.
 */
export interface ChunkingInput {
  text: string;
  sourceType?: string;
}

/**
 * Optional knobs that strategies can honor without changing the caller contract.
 */
export interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

/**
 * Normalized chunk output used by persistence and later embedding steps.
 */
export interface ChunkingResult {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
}

/**
 * Boundary every chunking strategy must implement.
 */
export interface ChunkingStrategy {
  readonly name: string;
  split(input: ChunkingInput, options?: ChunkingOptions): ChunkingResult[];
}
