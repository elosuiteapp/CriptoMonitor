import { useState } from "react";

/** Tooltip premium reutilizável: ícone "i" discreto que, no hover/clique, abre um
 *  card escuro com borda, sombra e seta. Use em qualquer rótulo que tenha jargão. */
export default function InfoTip({ text, className = "" }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;

  return (
    <span className="relative inline-flex align-middle">
      <span
        role="button"
        tabIndex={0}
        aria-label="Mais informações"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className={`grid h-4 w-4 cursor-help select-none place-items-center rounded-full border border-border text-[9px] font-bold leading-none text-muted-foreground transition-colors hover:border-primary hover:text-primary ${className}`}
      >
        i
      </span>
      {open && (
        <span
          role="tooltip"
          className="tip-in pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-xl border border-border bg-background/95 p-3 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-foreground shadow-2xl ring-1 ring-black/50 backdrop-blur"
        >
          {text}
          <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-border bg-background" />
        </span>
      )}
    </span>
  );
}
