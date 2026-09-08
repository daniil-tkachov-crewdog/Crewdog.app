import React from "react";

// Lightweight, dependency-free renderer for chat message text.
// Turns markdown links [label](url), bare URLs and **bold** into safe React
// nodes (no dangerouslySetInnerHTML). Whitespace/newlines are preserved by the
// parent's `whitespace-pre-wrap`.

const MD_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;
const URL = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]}'"])/;
const BOLD = /\*\*([^*]+)\*\*/;

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

export function renderRichText(text: string): React.ReactNode {
  // 1) markdown links
  let nodes: React.ReactNode[] = splitByRegex(text, MD_LINK, (m, k) => (
    <a
      key={`ml${k}`}
      href={m[2]}
      target="_blank"
      rel="noopener noreferrer"
      className={LINK_CLS}
    >
      {m[1]}
    </a>
  ));

  // 2) bare URLs inside the remaining string parts
  nodes = nodes.flatMap((n, idx) =>
    typeof n === "string"
      ? splitByRegex(n, URL, (m, k) => {
          const href = m[1].startsWith("http") ? m[1] : `https://${m[1]}`;
          return (
            <a
              key={`u${idx}-${k}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK_CLS}
            >
              {m[1]}
            </a>
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
