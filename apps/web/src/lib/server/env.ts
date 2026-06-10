import "server-only";

import { z } from "zod";

const internalApiUrl =
  process.env.INTERNAL_API_URL ??
  (process.env.NODE_ENV === "production"
    ? undefined
    : "http://127.0.0.1:3000");

const serverEnvSchema = z.object({
  INTERNAL_API_URL: z.url({
    error:
      "INTERNAL_API_URL must be an absolute URL and is required in production.",
  }),
});

const parsed = serverEnvSchema.safeParse({
  INTERNAL_API_URL: internalApiUrl,
});

if (!parsed.success) {
  throw new Error(
    `Invalid frontend server environment: ${z.prettifyError(parsed.error)}`,
  );
}

export const serverEnv = parsed.data;
