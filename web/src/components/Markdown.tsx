import type { ReactNode } from "react";

// Markdown leve (sem dependência) otimizado para leitura: títulos, listas,
// citações, regra horizontal, negrito/itálico/código/links inline.
function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(<span key={i++}>{s.slice(last, m.index)}</span>);
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(<strong key={i++} className="font-semibold text-foreground">{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      out.push(<code key={i++} className="rounded bg-muted px-1 py-0.5 text-[0.85em] text-foreground">{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("[")) {
      const link = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok);
      out.push(
        <a key={i++} href={link?.[2]} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
          {link?.[1]}
        </a>,
      );
    } else {
      out.push(<em key={i++}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(<span key={i++}>{s.slice(last)}</span>);
  return out;
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: ReactNode[] | null = null;
  let key = 0;

  const flush = () => {
    if (list) {
      blocks.push(<ul key={key++} className="my-3 space-y-1.5">{list}</ul>);
      list = null;
    }
  };

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) {
      flush();
      continue;
    }
    if (/^[-*]\s+/.test(t)) {
      list ??= [];
      list.push(
        <li key={key++} className="flex gap-2.5">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
          <span className="text-[15px] leading-relaxed text-foreground/90">{inline(t.replace(/^[-*]\s+/, ""))}</span>
        </li>,
      );
      continue;
    }
    flush();
    if (t === "---" || t === "***") {
      blocks.push(<hr key={key++} className="my-7 border-border" />);
    } else if (t.startsWith("### ")) {
      blocks.push(<h3 key={key++} className="mt-6 mb-2 text-base font-semibold text-foreground">{inline(t.slice(4))}</h3>);
    } else if (t.startsWith("## ")) {
      blocks.push(<h2 key={key++} className="mt-8 mb-2 text-xl font-bold text-foreground">{inline(t.slice(3))}</h2>);
    } else if (t.startsWith("# ")) {
      blocks.push(<h2 key={key++} className="mt-8 mb-3 text-2xl font-extrabold text-foreground">{inline(t.slice(2))}</h2>);
    } else if (t.startsWith("> ")) {
      blocks.push(
        <blockquote key={key++} className="my-4 border-l-2 border-primary/50 pl-4 text-[15px] italic text-muted-foreground">
          {inline(t.slice(2))}
        </blockquote>,
      );
    } else {
      blocks.push(<p key={key++} className="my-3 text-[15px] leading-relaxed text-foreground/90">{inline(t)}</p>);
    }
  }
  flush();
  return <div>{blocks}</div>;
}
