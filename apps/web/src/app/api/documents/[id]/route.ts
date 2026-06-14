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
      body ?? { message: "The document could not be deleted." },
      { status: response.status },
    );
  } catch (error) {
    const unavailable = error instanceof RetrievalApiUnavailableError;

    return NextResponse.json(
      {
        message: unavailable
          ? 'The Retrieval Lab API is unavailable. Start both apps with "pnpm dev".'
          : "The delete proxy encountered an unexpected error.",
      },
      { status: unavailable ? 503 : 500 },
    );
  }
}
