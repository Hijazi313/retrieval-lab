import { z } from "zod";

export const sourceTypes = ["markdown", "text"] as const;

export const ingestionSchema = z
  .object({
    title: z.string().trim().min(1, "Give this document a title."),
    sourceType: z.enum(sourceTypes),
    content: z
      .string()
      .trim()
      .min(1, "Add the source content you want to ingest."),
    metadata: z.record(z.string(), z.unknown()),
    chunking: z.object({
      strategy: z.literal("recursive"),
      chunkSize: z
        .number()
        .int("Chunk size must be a whole number.")
        .min(100, "Use at least 100 characters per chunk.")
        .max(10_000, "Keep chunk size at or below 10,000 characters."),
      chunkOverlap: z
        .number()
        .int("Overlap must be a whole number.")
        .min(0, "Overlap cannot be negative.")
        .max(2_000, "Keep overlap at or below 2,000 characters."),
    }),
  })
  .superRefine((value, context) => {
    if (value.chunking.chunkOverlap >= value.chunking.chunkSize) {
      context.addIssue({
        code: "custom",
        message: "Overlap must be smaller than the chunk size.",
        path: ["chunking", "chunkOverlap"],
      });
    }
  });

export type IngestionInput = z.infer<typeof ingestionSchema>;

export type IngestionResult = {
  document: {
    id: string;
    title: string;
    sourceType: string;
    createdAt: string;
  };
  chunking: {
    strategy: string;
    chunksCreated: number;
  };
  embeddings: {
    model: string | null;
    chunksEmbedded: number;
  };
  chunks: Array<{
    id: string;
    chunkIndex: number;
    tokenCount: number | null;
  }>;
};

export type IngestionErrorResponse = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
};
