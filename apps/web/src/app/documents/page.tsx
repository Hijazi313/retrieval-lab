import type { Metadata } from "next";

import { DocumentsWorkspace } from "@/features/documents/documents-workspace";

export const metadata: Metadata = {
  title: "Documents | Retrieval Lab",
  description: "Inspect and manage documents in the retrieval corpus.",
};

export default function DocumentsPage() {
  return <DocumentsWorkspace />;
}
