"use client";

import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Database,
  FilePlus2,
  FileText,
  LoaderCircle,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";

import { AppShell } from "@/components/app-shell";

import {
  type DocumentSummary,
  type DocumentsErrorResponse,
  type DocumentsResponse,
  readDocumentsError,
} from "./documents-contract";

const PAGE_SIZE = 20;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function DocumentsWorkspace() {
  const [documents, setDocuments] = useState<DocumentsResponse | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DocumentSummary | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadDocuments = useEffectEvent(async () => {
    setIsLoading(true);
    setLoadError(null);

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (search) params.set("search", search);

    try {
      const response = await fetch(`/api/documents?${params}`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | DocumentsResponse
        | DocumentsErrorResponse
        | null;

      if (!response.ok) {
        setLoadError(
          readDocumentsError(
            body as DocumentsErrorResponse | null,
            "Documents could not be loaded.",
          ),
        );
        return;
      }

      setDocuments(body as DocumentsResponse);
    } catch {
      setLoadError("The documents request could not be completed.");
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void loadDocuments();
  }, [page, search, reloadKey]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function clearSearch() {
    setSearchInput("");
    setSearch("");
    setPage(1);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;

    setDeletingId(pendingDelete.id);
    setDeleteError(null);

    try {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(pendingDelete.id)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | DocumentsErrorResponse
          | null;
        setDeleteError(
          readDocumentsError(body, "The document could not be deleted."),
        );
        return;
      }

      const remainingOnPage = (documents?.data.length ?? 1) - 1;
      setPendingDelete(null);

      if (remainingOnPage === 0 && page > 1) {
        setPage((current) => current - 1);
      } else {
        setReloadKey((current) => current + 1);
      }
    } catch {
      setDeleteError("The delete request could not be completed.");
    } finally {
      setDeletingId(null);
    }
  }

  const pagination = documents?.meta.pagination;
  const total = pagination?.totalItems ?? 0;
  const hasDocuments = Boolean(documents?.data.length);
  const noSearchMatches = !isLoading && !hasDocuments && Boolean(search);

  return (
    <AppShell activeSection="documents">
      <main className="workspace documents-workspace">
        <header className="workspace-header documents-header">
          <div>
            <p className="eyebrow">Corpus inventory</p>
            <h1>Documents</h1>
            <p className="header-copy">
              Inspect the sources available to retrieval and remove records that
              no longer belong in the corpus.
            </p>
          </div>
          <Link className="primary-link" href="/">
            <FilePlus2 size={17} />
            Ingest document
          </Link>
        </header>

        <section className="documents-panel">
          <div className="documents-toolbar">
            <form className="search-form" onSubmit={submitSearch}>
              <Search aria-hidden="true" size={17} />
              <label className="sr-only" htmlFor="document-search">
                Search documents
              </label>
              <input
                id="document-search"
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search title or content"
                type="search"
                value={searchInput}
              />
              {searchInput ? (
                <button
                  aria-label="Clear search"
                  className="icon-button"
                  onClick={clearSearch}
                  type="button"
                >
                  <X size={16} />
                </button>
              ) : null}
              <button className="search-button" type="submit">
                Search
              </button>
            </form>

            <p className="document-count" aria-live="polite">
              <strong>{total}</strong> {total === 1 ? "document" : "documents"}
            </p>
          </div>

          {loadError ? (
            <div className="documents-state" role="alert">
              <AlertCircle size={22} />
              <div>
                <strong>Documents are unavailable</strong>
                <p>{loadError}</p>
              </div>
              <button
                className="secondary-button"
                onClick={() => setReloadKey((current) => current + 1)}
                type="button"
              >
                <RefreshCw size={15} />
                Retry
              </button>
            </div>
          ) : isLoading ? (
            <div className="document-skeletons" aria-label="Loading documents">
              {Array.from({ length: 5 }, (_, index) => (
                <div className="document-skeleton" key={index}>
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : hasDocuments ? (
            <>
              <div className="documents-table-wrap">
                <table className="documents-table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Source</th>
                      <th>Chunks</th>
                      <th>Ingested</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents?.data.map((document) => (
                      <tr key={document.id}>
                        <td className="document-main-cell">
                          <div className="document-file-icon">
                            <FileText size={17} />
                          </div>
                          <div>
                            <strong>{document.title}</strong>
                            <p>{document.contentPreview}</p>
                            <code>{document.id}</code>
                          </div>
                        </td>
                        <td>
                          <span className="source-badge">
                            {document.sourceType}
                          </span>
                        </td>
                        <td>
                          <span className="chunk-count">
                            {document.chunkCount}
                          </span>
                        </td>
                        <td className="date-cell">
                          {formatDate(document.createdAt)}
                        </td>
                        <td className="action-cell">
                          <button
                            aria-label={`Delete ${document.title}`}
                            className="icon-button danger-button"
                            disabled={deletingId === document.id}
                            onClick={() => {
                              setDeleteError(null);
                              setPendingDelete(document);
                            }}
                            title="Delete document"
                            type="button"
                          >
                            {deletingId === document.id ? (
                              <LoaderCircle className="spin" size={16} />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination-bar">
                <span>
                  Page {pagination?.page} of {pagination?.totalPages}
                </span>
                <div>
                  <button
                    aria-label="Previous page"
                    className="icon-button"
                    disabled={!pagination?.hasPreviousPage}
                    onClick={() => setPage((current) => current - 1)}
                    type="button"
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <button
                    aria-label="Next page"
                    className="icon-button"
                    disabled={!pagination?.hasNextPage}
                    onClick={() => setPage((current) => current + 1)}
                    type="button"
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="documents-empty">
              <div className="empty-document-icon">
                {noSearchMatches ? <Search size={24} /> : <Database size={24} />}
              </div>
              <h2>
                {noSearchMatches ? "No matching documents" : "No documents yet"}
              </h2>
              <p>
                {noSearchMatches
                  ? `Nothing matched “${search}”. Try a broader search.`
                  : "Ingest your first source to make it available for retrieval experiments."}
              </p>
              {noSearchMatches ? (
                <button
                  className="secondary-button"
                  onClick={clearSearch}
                  type="button"
                >
                  Clear search
                </button>
              ) : (
                <Link className="primary-link" href="/">
                  <FilePlus2 size={16} />
                  Ingest document
                </Link>
              )}
            </div>
          )}
        </section>

        {pendingDelete ? (
          <div className="dialog-backdrop" role="presentation">
            <section
              aria-describedby="delete-description"
              aria-labelledby="delete-title"
              aria-modal="true"
              className="confirm-dialog"
              role="dialog"
            >
              <div className="dialog-icon">
                <Trash2 size={20} />
              </div>
              <div>
                <h2 id="delete-title">Delete this document?</h2>
                <p id="delete-description">
                  <strong>{pendingDelete.title}</strong> and its chunks,
                  embeddings, related retrieval results, and curated evaluation
                  links will be removed.
                </p>
              </div>

              {deleteError ? (
                <div className="dialog-error" role="alert">
                  <AlertCircle size={16} />
                  {deleteError}
                </div>
              ) : null}

              <div className="dialog-actions">
                <button
                  className="secondary-button"
                  disabled={Boolean(deletingId)}
                  onClick={() => setPendingDelete(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="delete-button"
                  disabled={Boolean(deletingId)}
                  onClick={confirmDelete}
                  type="button"
                >
                  {deletingId ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Trash2 size={16} />
                  )}
                  Delete document
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}
