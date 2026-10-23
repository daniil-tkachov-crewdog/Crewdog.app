import React from "react";

// Lightweight, dependency-free renderer for chat message text.
// Turns markdown links [label](url), bare URLs and **bold** into safe React
// nodes (no dangerouslySetInnerHTML). Whitespace/newlines are preserved by the
// parent's `whitespace-pre-wrap`.

// Markdown link with any href (http(s), www, or a bare domain like linkedin.com/in/x).
const MD_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/;
// Bare links: full URLs, www.*, or bare domains with a known TLD + optional path.
const URL =
  /((?:https?:\/\/|www\.)[^\s<]+|(?:[a-zA-Z0-9-]+\.)+(?:com|org|net|io|co|ai|dev|app|me|uk|us|ca|de|fr|nl|es|it|ie|eu|edu|gov|info|biz)(?:\/[^\s<]*)?)/i;
const BOLD = /\*\*([^*]+)\*\*/;

// Turn a raw href into an absolute URL (prepend https:// when the scheme is missing).
function toHref(raw: string): string {
  if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
  return `https://${raw}`;
}

// Peel trailing sentence punctuation off a bare URL so it isn't swallowed by the link.
function peelTrailing(raw: string): { core: string; trailing: string } {
  const m = raw.match(/[.,;:!?)\]}'"]+$/);
  const trailing = m ? m[0] : "";
  return { core: trailing ? raw.slice(0, raw.length - trailing.length) : raw, trailing };
}

const LINK_CLS =
  "font-medium text-[#E0480F] underline decoration-[#E0480F]/40 underline-offset-2 transition-colors hover:decoration-[#E0480F] dark:text-[#FF5A1F] dark:decoration-[#FF5A1F]/40 dark:hover:decoration-[#FF5A1F] [overflow-wrap:anywhere]";

function splitByRegex(
  text: string,
  regex: RegExp,
  render: (m: RegExpExecArray, key: string) => React.ReactNode
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = new RegExp(regex.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(render(m, String(i++)));
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// The LinkedIn finder marks the people it found a live availability signal for.
// The marker opens the line and is stripped before rendering — the highlight is
// the whole point of it, so it must never reach the reader as text.
const AVAILABLE_MARK = /^\s*(?:[-*•]\s*|\d+[.)]\s*)?::available::\s*/i;

const AVAILABLE_CLS =
  "inline-block rounded-[10px] px-2.5 py-1 shadow-[0_1px_8px_-2px_rgba(139,92,246,0.55)] ring-1 ring-violet-400/25 dark:shadow-[0_1px_10px_-2px_rgba(167,139,250,0.5)] dark:ring-violet-300/25";

export function renderRichText(text: string): React.ReactNode {
  // Availability highlighting is per line, so it has to happen before the
  // inline passes, which treat the message as one flat string.
  if (AVAILABLE_MARK.test(text) || text.includes("::available::")) {
    const lines = text.split("\n");
    return lines.flatMap((line, i) => {
      const nl = i < lines.length - 1 ? ["\n"] : [];
      if (!AVAILABLE_MARK.test(line)) {
        return [
          <React.Fragment key={`l${i}`}>{renderInline(line)}</React.Fragment>,
          ...nl,
        ];
      }
      return [
        <span key={`a${i}`} className={AVAILABLE_CLS}>
          {renderInline(line.replace(AVAILABLE_MARK, ""))}
        </span>,
        ...nl,
      ];
    });
  }
  return renderInline(text);
}

function renderInline(text: string): React.ReactNode {
  // 1) markdown links (any href)
  let nodes: React.ReactNode[] = splitByRegex(text, MD_LINK, (m, k) => (
    <a
      key={`ml${k}`}
      href={toHref(m[2])}
      target="_blank"
      rel="noopener noreferrer"
      className={LINK_CLS}
    >
      {m[1]}
    </a>
  ));

  // 2) bare URLs / domains inside the remaining string parts
  nodes = nodes.flatMap((n, idx) =>
    typeof n === "string"
      ? splitByRegex(n, URL, (m, k) => {
          const { core, trailing } = peelTrailing(m[1]);
          return (
            <React.Fragment key={`u${idx}-${k}`}>
              <a
                href={toHref(core)}
                target="_blank"
                rel="noopener noreferrer"
                className={LINK_CLS}
              >
                {core}
              </a>
              {trailing}
            </React.Fragment>
          );
        })
      : [n]
  );

  // 3) **bold**
  nodes = nodes.flatMap((n, idx) =>
    typeof n === "string"
      ? splitByRegex(n, BOLD, (m, k) => (
          <strong key={`b${idx}-${k}`} className="font-semibold">
            {m[1]}
          </strong>
        ))
      : [n]
  );

  return nodes;
}
