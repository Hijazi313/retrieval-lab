import { NextResponse } from "next/server";

import {
  ingestionSchema,
  type IngestionErrorResponse,
} from "@/features/ingestion/ingestion-contract";
import {
  RetrievalApiUnavailableError,
  retrievalApiFetch,
  retrievalApiUrl,
} from "@/lib/server/retrieval-api";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = ingestionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Please correct the highlighted fields.",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const response = await retrievalApiFetch("/api/documents/ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(parsed.data),
      signal: AbortSignal.timeout(120_000),
    });

    const responseBody = (await response.json().catch(() => null)) as
      | IngestionErrorResponse
      | null;

    if (!response.ok) {
      return NextResponse.json(
        responseBody ?? {
          message: "The ingestion service returned an unexpected response.",
        },
        { status: response.status },
      );
    }

    return NextResponse.json(responseBody, { status: response.status });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    const apiUnavailable = error instanceof RetrievalApiUnavailableError;
    const apiOrigin = retrievalApiUrl("/").origin;

    return NextResponse.json(
      {
        message: timedOut
          ? "Ingestion is taking longer than expected. The API request timed out."
          : apiUnavailable
            ? `The Retrieval Lab API is unavailable at ${apiOrigin}. Start both apps with "pnpm dev" or configure INTERNAL_API_URL.`
            : "The ingestion proxy encountered an unexpected error.",
      },
      { status: timedOut ? 504 : apiUnavailable ? 503 : 500 },
    );
  }
}
