"use client";

import {
  AlertCircle,
  Braces,
  Check,
  ChevronDown,
  CircleDot,
  Database,
  FileText,
  Layers3,
  LoaderCircle,
  Plus,
  RotateCcw,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  type FormEvent,
  startTransition,
  useDeferredValue,
  useState,
} from "react";

import { AppShell } from "@/components/app-shell";

import {
  ingestionSchema,
  type IngestionErrorResponse,
  type IngestionInput,
  type IngestionPayload,
  type IngestionResult,
} from "./ingestion-contract";

type FieldErrors = Partial<
  Record<"title" | "content" | "chunkSize" | "chunkOverlap" | "metadata", string>
>;

const defaultValues = {
  title: "",
  sourceType: "markdown",
  content: "",
  chunkSize: "1200",
  chunkOverlap: "150",
  metadata: '{\n  "topic": "postgresql"\n}',
};

function readApiMessage(body: IngestionErrorResponse | null) {
  if (!body) {
    return "The document could not be ingested. Please try again.";
  }

  if (body.message) {
    return Array.isArray(body.message) ? body.message.join(" ") : body.message;
  }

  if (body.detail) return body.detail;
  if (body.title) return body.title;

  if (Array.isArray(body.errors) && body.errors.length > 0) {
    return body.errors.join(" ");
  }

  if (body.errors && typeof body.errors === "object") {
    const values = Object.values(body.errors).flatMap((value) =>
      Array.isArray(value) ? value : [String(value)],
    );

    if (values.length > 0) {
      return values.join(" ");
    }
  }

  return "The document could not be ingested. Please try again.";
}

export function IngestionWorkbench() {
  const [values, setValues] = useState(defaultValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestionPayload | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showChunks, setShowChunks] = useState(false);
  const deferredContent = useDeferredValue(values.content);

  const characterCount = deferredContent.length;
  const estimatedChunks =
    characterCount === 0
      ? 0
      : Math.max(
          1,
          Math.ceil(
            characterCount /
              Math.max(
                1,
                Number(values.chunkSize) - Number(values.chunkOverlap),
              ),
          ),
        );

  function updateValue(name: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [name]: value }));

    if (fieldErrors[name as keyof FieldErrors]) {
      setFieldErrors((current) => ({ ...current, [name]: undefined }));
    }
  }

  function parseInput():
    | { success: true; data: IngestionInput }
    | { success: false } {
    const nextErrors: FieldErrors = {};
    let metadata: Record<string, unknown> = {};

    try {
      const parsedMetadata = values.metadata.trim()
        ? JSON.parse(values.metadata)
        : {};

      if (
        typeof parsedMetadata !== "object" ||
        parsedMetadata === null ||
        Array.isArray(parsedMetadata)
      ) {
        nextErrors.metadata = "Metadata must be a JSON object.";
      } else {
        metadata = parsedMetadata as Record<string, unknown>;
      }
    } catch {
      nextErrors.metadata = "Metadata contains invalid JSON.";
    }

    const parsed = ingestionSchema.safeParse({
      title: values.title,
      sourceType: values.sourceType,
      content: values.content,
      metadata,
      chunking: {
        strategy: "recursive",
        chunkSize: Number(values.chunkSize),
        chunkOverlap: Number(values.chunkOverlap),
      },
    });

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");

        if (path === "title") nextErrors.title = issue.message;
        if (path === "content") nextErrors.content = issue.message;
        if (path === "chunking.chunkSize") nextErrors.chunkSize = issue.message;
        if (path === "chunking.chunkOverlap") {
          nextErrors.chunkOverlap = issue.message;
        }
      }
    }

    setFieldErrors(nextErrors);

    if (!parsed.success || Object.keys(nextErrors).length > 0) {
      return { success: false };
    }

    return { success: true, data: parsed.data };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestError(null);

    const parsed = parseInput();
    if (!parsed.success) return;

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/documents/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json().catch(() => null)) as
        | IngestionResult
        | IngestionErrorResponse
        | null;

      if (!response.ok) {
        setRequestError(readApiMessage(body as IngestionErrorResponse | null));
        return;
      }

      startTransition(() => {
        setResult((body as IngestionResult).data);
        setShowChunks(false);
      });
    } catch {
      setRequestError(
        "The request could not be completed. Check your connection and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetWorkbench() {
    setValues(defaultValues);
    setFieldErrors({});
    setRequestError(null);
    setResult(null);
    setShowMetadata(false);
    setShowChunks(false);
  }

  return (
    <AppShell activeSection="ingestion">
      <main className="workspace" id="ingestion">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Corpus preparation</p>
            <h1>Ingest a document</h1>
            <p className="header-copy">
              Normalize source content, split it into traceable chunks, and
              generate embeddings in one controlled run.
            </p>
          </div>
          <div className="header-state">
            <CircleDot size={14} />
            Recursive strategy
          </div>
        </header>

        <form className="ingestion-layout" onSubmit={handleSubmit} noValidate>
          <section className="form-column" aria-label="Document input">
            {requestError ? (
              <div className="alert alert-error" role="alert">
                <AlertCircle size={20} />
                <div>
                  <strong>Ingestion failed</strong>
                  <p>{requestError}</p>
                </div>
              </div>
            ) : null}

            <div className="section-heading">
              <span className="section-number">01</span>
              <div>
                <h2>Document</h2>
                <p>Describe the source and add its raw content.</p>
              </div>
            </div>

            <div className="field-grid">
              <label className="field field-wide">
                <span className="field-label">Title</span>
                <input
                  aria-invalid={Boolean(fieldErrors.title)}
                  aria-describedby={
                    fieldErrors.title ? "title-error" : undefined
                  }
                  autoComplete="off"
                  name="title"
                  onChange={(event) =>
                    updateValue("title", event.target.value)
                  }
                  placeholder="PostgreSQL indexing guide"
                  value={values.title}
                />
                {fieldErrors.title ? (
                  <span className="field-error" id="title-error">
                    {fieldErrors.title}
                  </span>
                ) : null}
              </label>

              <label className="field">
                <span className="field-label">Source type</span>
                <select
                  name="sourceType"
                  onChange={(event) =>
                    updateValue("sourceType", event.target.value)
                  }
                  value={values.sourceType}
                >
                  <option value="markdown">Markdown</option>
                  <option value="text">Plain text</option>
                </select>
              </label>
            </div>

            <label className="field">
              <span className="field-row">
                <span className="field-label">Content</span>
                <span className="field-meta">
                  {characterCount.toLocaleString()} characters
                </span>
              </span>
              <textarea
                aria-invalid={Boolean(fieldErrors.content)}
                aria-describedby={
                  fieldErrors.content ? "content-error" : "content-help"
                }
                name="content"
                onChange={(event) =>
                  updateValue("content", event.target.value)
                }
                placeholder={"# PostgreSQL Indexing\n\nAdd the document body here..."}
                spellCheck="true"
                value={values.content}
              />
              {fieldErrors.content ? (
                <span className="field-error" id="content-error">
                  {fieldErrors.content}
                </span>
              ) : (
                <span className="field-help" id="content-help">
                  Markdown headings are preserved with their section content.
                </span>
              )}
            </label>

            <div className="advanced-block">
              <button
                aria-expanded={showMetadata}
                className="disclosure-button"
                onClick={() => setShowMetadata((current) => !current)}
                type="button"
              >
                <span>
                  <Braces size={18} />
                  Metadata
                  <small>Optional JSON for traceability</small>
                </span>
                <ChevronDown
                  className={showMetadata ? "chevron-open" : undefined}
                  size={18}
                />
              </button>

              {showMetadata ? (
                <label className="field metadata-field">
                  <span className="field-label">Metadata object</span>
                  <textarea
                    aria-invalid={Boolean(fieldErrors.metadata)}
                    aria-describedby={
                      fieldErrors.metadata ? "metadata-error" : "metadata-help"
                    }
                    className="code-input"
                    name="metadata"
                    onChange={(event) =>
                      updateValue("metadata", event.target.value)
                    }
                    spellCheck="false"
                    value={values.metadata}
                  />
                  {fieldErrors.metadata ? (
                    <span className="field-error" id="metadata-error">
                      {fieldErrors.metadata}
                    </span>
                  ) : (
                    <span className="field-help" id="metadata-help">
                      Stored with the document; not injected into embedding text.
                    </span>
                  )}
                </label>
              ) : null}
            </div>
          </section>

          <aside className="settings-column" aria-label="Chunking settings">
            <div className="section-heading compact">
              <span className="section-number">02</span>
              <div>
                <h2>Chunking</h2>
                <p>Control how content is divided.</p>
              </div>
            </div>

            <fieldset>
              <legend className="field-label">Strategy</legend>
              <label className="strategy-option">
                <input checked readOnly type="radio" />
                <span className="strategy-radio">
                  <Check size={13} />
                </span>
                <span>
                  <strong>Recursive</strong>
                  <small>Structure-aware baseline</small>
                </span>
              </label>
            </fieldset>

            <div className="number-grid">
              <label className="field">
                <span className="field-label">Chunk size</span>
                <div className="input-with-unit">
                  <input
                    aria-invalid={Boolean(fieldErrors.chunkSize)}
                    inputMode="numeric"
                    min="100"
                    name="chunkSize"
                    onChange={(event) =>
                      updateValue("chunkSize", event.target.value)
                    }
                    step="50"
                    type="number"
                    value={values.chunkSize}
                  />
                  <span>chars</span>
                </div>
                {fieldErrors.chunkSize ? (
                  <span className="field-error">{fieldErrors.chunkSize}</span>
                ) : null}
              </label>

              <label className="field">
                <span className="field-label">Overlap</span>
                <div className="input-with-unit">
                  <input
                    aria-invalid={Boolean(fieldErrors.chunkOverlap)}
                    inputMode="numeric"
                    min="0"
                    name="chunkOverlap"
                    onChange={(event) =>
                      updateValue("chunkOverlap", event.target.value)
                    }
                    step="25"
                    type="number"
                    value={values.chunkOverlap}
                  />
                  <span>chars</span>
                </div>
                {fieldErrors.chunkOverlap ? (
                  <span className="field-error">
                    {fieldErrors.chunkOverlap}
                  </span>
                ) : null}
              </label>
            </div>

            <div className="run-preview">
              <p>Run preview</p>
              <dl>
                <div>
                  <dt>Estimated chunks</dt>
                  <dd>{estimatedChunks || "—"}</dd>
                </div>
                <div>
                  <dt>Embedding mode</dt>
                  <dd>Synchronous</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>
                    {values.sourceType === "markdown" ? "Markdown" : "Text"}
                  </dd>
                </div>
              </dl>
              <small>
                Estimate only. Final chunk count depends on document structure.
              </small>
            </div>

            <button
              className="primary-button"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <Upload size={18} />
              )}
              {isSubmitting ? "Chunking and embedding..." : "Ingest document"}
            </button>
            <p className="submit-note">
              The request completes after chunks and embeddings are persisted.
            </p>
          </aside>
        </form>

        <section
          aria-live="polite"
          className={result ? "result-panel result-visible" : "result-panel"}
        >
          {result ? (
            <>
              <div className="result-heading">
                <div className="success-icon">
                  <Check size={20} />
                </div>
                <div>
                  <p className="eyebrow">Ingestion complete</p>
                  <h2>{result.document.title}</h2>
                  <code>{result.document.id}</code>
                </div>
                <button
                  className="secondary-button"
                  onClick={resetWorkbench}
                  type="button"
                >
                  <Plus size={16} />
                  New document
                </button>
              </div>

              <div className="result-metrics">
                <div>
                  <FileText size={18} />
                  <span>Chunks created</span>
                  <strong>{result.chunking.chunksCreated}</strong>
                </div>
                <div>
                  <Sparkles size={18} />
                  <span>Chunks embedded</span>
                  <strong>{result.embeddings.chunksEmbedded}</strong>
                </div>
                <div>
                  <Layers3 size={18} />
                  <span>Strategy</span>
                  <strong>{result.chunking.strategy}</strong>
                </div>
                <div>
                  <Database size={18} />
                  <span>Embedding model</span>
                  <strong>{result.embeddings.model ?? "Not reported"}</strong>
                </div>
              </div>

              <div className="result-actions">
                <button
                  aria-expanded={showChunks}
                  className="text-button"
                  onClick={() => setShowChunks((current) => !current)}
                  type="button"
                >
                  {showChunks ? "Hide chunk records" : "Inspect chunk records"}
                  <ChevronDown
                    className={showChunks ? "chevron-open" : undefined}
                    size={16}
                  />
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setResult(null);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  type="button"
                >
                  <RotateCcw size={15} />
                  Modify and re-run
                </button>
              </div>

              {showChunks ? (
                <div className="chunk-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Index</th>
                        <th>Chunk ID</th>
                        <th>Token estimate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.chunks.map((chunk) => (
                        <tr key={chunk.id}>
                          <td>{chunk.chunkIndex}</td>
                          <td>
                            <code>{chunk.id}</code>
                          </td>
                          <td>{chunk.tokenCount ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-result">
              <Layers3 size={22} />
              <div>
                <strong>Run output appears here</strong>
                <span>
                  Chunk totals, embedding details, and persisted IDs remain
                  available for inspection.
                </span>
              </div>
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
