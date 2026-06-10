import { NextResponse } from "next/server";

import {
  RetrievalApiUnavailableError,
  retrievalApiFetch,
} from "@/lib/server/retrieval-api";

export async function GET() {
  try {
    const response = await retrievalApiFetch("/api/health", {
      signal: AbortSignal.timeout(3_000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { status: "degraded", api: "unhealthy" },
        { status: 503 },
      );
    }

    return NextResponse.json({ status: "ok", api: "reachable" });
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        api:
          error instanceof RetrievalApiUnavailableError
            ? "unreachable"
            : "unknown",
      },
      { status: 503 },
    );
  }
}
