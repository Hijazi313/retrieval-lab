import { Database, Layers3, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type AppSection = "ingestion" | "documents" | "retrieval" | "evaluation";

type AppShellProps = {
  activeSection: AppSection;
  children: ReactNode;
};

const navigation = [
  { id: "ingestion", label: "Ingestion", href: "/", icon: Upload },
  { id: "documents", label: "Documents", href: "/documents", icon: Database },
  { id: "retrieval", label: "Retrieval", icon: Sparkles },
  { id: "evaluation", label: "Evaluation", icon: Layers3 },
] as const;

/**
 * Shared application frame. Feature pages own their content and state.
 */
export function AppShell({ activeSection, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            RL
          </div>
          <div>
            <strong>Retrieval Lab</strong>
            <span>Experiment workspace</span>
          </div>
        </div>

        <nav aria-label="Primary navigation" className="nav-list">
          {navigation.map((item) => {
            const Icon = item.icon;
            const className = [
              "nav-item",
              activeSection === item.id ? "nav-item-active" : "",
              !("href" in item) ? "nav-item-muted" : "",
            ]
              .filter(Boolean)
              .join(" ");

            if (!("href" in item)) {
              return (
                <span className={className} key={item.id}>
                  <Icon size={18} />
                  {item.label}
                </span>
              );
            }

            return (
              <Link className={className} href={item.href} key={item.id}>
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-status">
          <span className="status-dot" />
          <div>
            <strong>Local workspace</strong>
            <span>API via server proxy</span>
          </div>
        </div>
      </aside>

      {children}
    </div>
  );
}
