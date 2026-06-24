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
      {
        type: "https://retrieval-lab.dev/problems/bad-request",
        title: "Bad Request",
        status: 400,
        detail: "Request body must be valid JSON.",
        instance: "/api/documents/ingest",
      },
      { status: 400 },
    );
  }

  const parsed = ingestionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        type: "https://retrieval-lab.dev/problems/bad-request",
        title: "Bad Request",
        status: 400,
        detail: "Please correct the highlighted fields.",
        instance: "/api/documents/ingest",
        errors: parsed.error.flatten().fieldErrors,
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
          type: "https://retrieval-lab.dev/problems/http-error",
          title: "Request Failed",
          status: response.status,
          detail: "The ingestion service returned an unexpected response.",
          instance: "/api/documents/ingest",
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
        type: timedOut
          ? "https://retrieval-lab.dev/problems/request-timeout"
          : apiUnavailable
            ? "https://retrieval-lab.dev/problems/service-unavailable"
            : "https://retrieval-lab.dev/problems/http-error",
        title: timedOut
          ? "Gateway Timeout"
          : apiUnavailable
            ? "Service Unavailable"
            : "Request Failed",
        status: timedOut ? 504 : apiUnavailable ? 503 : 500,
        detail: timedOut
          ? "Ingestion is taking longer than expected. The API request timed out."
          : apiUnavailable
            ? `The Retrieval Lab API is unavailable at ${apiOrigin}. Start both apps with "pnpm dev" or configure INTERNAL_API_URL.`
            : "The ingestion proxy encountered an unexpected error.",
        instance: "/api/documents/ingest",
      },
      { status: timedOut ? 504 : apiUnavailable ? 503 : 500 },
    );
  }
}
