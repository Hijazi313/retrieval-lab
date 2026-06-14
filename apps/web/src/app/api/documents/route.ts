import { NextResponse } from "next/server";

import {
  RetrievalApiUnavailableError,
  retrievalApiFetch,
  retrievalApiUrl,
} from "@/lib/server/retrieval-api";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const upstreamUrl = retrievalApiUrl("/api/documents");

  for (const key of ["search", "page", "pageSize", "sourceType", "sort"]) {
    const value = requestUrl.searchParams.get(key);
    if (value) upstreamUrl.searchParams.set(key, value);
  }

  try {
    const response = await retrievalApiFetch(upstreamUrl);
    const body = await response.json().catch(() => null);

    return NextResponse.json(
      body ?? { message: "The documents service returned an invalid response." },
      { status: response.status },
    );
  } catch (error) {
    const unavailable = error instanceof RetrievalApiUnavailableError;

    return NextResponse.json(
      {
        message: unavailable
          ? `The Retrieval Lab API is unavailable at ${upstreamUrl.origin}. Start both apps with "pnpm dev".`
          : "The documents proxy encountered an unexpected error.",
      },
      { status: unavailable ? 503 : 500 },
    );
  }
}
