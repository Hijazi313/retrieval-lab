import "server-only";

import { serverEnv } from "./env";

export class RetrievalApiUnavailableError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "RetrievalApiUnavailableError";
  }
}

export function retrievalApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const baseUrl = serverEnv.INTERNAL_API_URL.endsWith("/")
    ? serverEnv.INTERNAL_API_URL
    : `${serverEnv.INTERNAL_API_URL}/`;

  return new URL(normalizedPath, baseUrl);
}

export async function retrievalApiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = retrievalApiUrl(path);

  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
    });
  } catch (error) {
    throw new RetrievalApiUnavailableError(
      `Could not connect to the Retrieval Lab API at ${url.origin}.`,
      error,
    );
  }
}
