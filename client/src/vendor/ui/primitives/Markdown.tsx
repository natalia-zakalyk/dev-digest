import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Markdown renderer (replaces prototype mdLite). Inline + GFM. */
export function Markdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 style={{ fontSize: "1.55em", fontWeight: 650, lineHeight: 1.25, margin: "0 0 14px", color: "var(--text-primary)" }}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ fontSize: "1.2em", fontWeight: 650, lineHeight: 1.3, margin: "22px 0 8px", color: "var(--text-primary)" }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ fontSize: "1.05em", fontWeight: 650, lineHeight: 1.3, margin: "16px 0 6px", color: "var(--text-primary)" }}>
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 style={{ fontSize: "1em", fontWeight: 650, margin: "14px 0 6px", color: "var(--text-primary)" }}>{children}</h4>
          ),
          ul: ({ children }) => (
            <ul style={{ listStyle: "disc", margin: "0 0 10px", paddingLeft: "1.4em" }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ listStyle: "decimal", margin: "0 0 10px", paddingLeft: "1.4em" }}>{children}</ol>
          ),
          li: ({ children }) => <li style={{ margin: "4px 0", lineHeight: 1.6 }}>{children}</li>,
          p: ({ children }) => <p style={{ margin: "0 0 10px", lineHeight: 1.75 }}>{children}</p>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          code: ({ children }) => (
            <code
              className="mono"
              style={{
                fontSize: "0.92em",
                padding: "1px 6px",
                borderRadius: 4,
                background: "var(--bg-hover)",
                color: "var(--accent-text)",
              }}
            >
              {children}
            </code>
          ),
          a: ({ children, href }) => (
            <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
