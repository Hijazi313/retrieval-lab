import { NextResponse } from "next/server";

import {
  RetrievalApiUnavailableError,
  retrievalApiFetch,
} from "@/lib/server/retrieval-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const response = await retrievalApiFetch(
      `/api/documents/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );

    if (response.status === 204) {
      return new Response(null, { status: 204 });
    }

    const body = await response.json().catch(() => null);
    return NextResponse.json(
      body ?? {
        type: "https://retrieval-lab.dev/problems/http-error",
        title: "Request Failed",
        status: response.status,
        detail: "The document could not be deleted.",
        instance: `/api/documents/${encodeURIComponent(id)}`,
      },
      { status: response.status },
    );
  } catch (error) {
    const unavailable = error instanceof RetrievalApiUnavailableError;

    return NextResponse.json(
      {
        type: unavailable
          ? "https://retrieval-lab.dev/problems/service-unavailable"
          : "https://retrieval-lab.dev/problems/http-error",
        title: unavailable ? "Service Unavailable" : "Request Failed",
        status: unavailable ? 503 : 500,
        detail: unavailable
          ? 'The Retrieval Lab API is unavailable. Start both apps with "pnpm dev".'
          : "The delete proxy encountered an unexpected error.",
        instance: `/api/documents/${encodeURIComponent(id)}`,
      },
      { status: unavailable ? 503 : 500 },
    );
  }
}
