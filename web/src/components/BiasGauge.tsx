// Medidor semicircular do viés (-100..+100) — primitivo VISUAL compartilhado de
// TODOS os módulos (cripto, B3, …). Arcos vermelho/neutro/verde + agulha. O
// tamanho é controlado por `className` (default = hero h-28 w-56; o badge do
// header usa um compacto). Mantém UMA fonte da verdade do medidor de viés.

export type Tone = "bull" | "bear" | "neutral";

export default function BiasGauge({
  value,
  tone,
  className = "h-28 w-56",
}: {
  value: number;
  tone: Tone;
  className?: string;
}) {
  const v = Math.max(-100, Math.min(100, value));
  const a = ((90 - v * 0.9) * Math.PI) / 180;
  const cx = 110;
  const cy = 110;
  const r = 78;
  const nx = cx + r * Math.cos(a);
  const ny = cy - r * Math.sin(a);
  const needle = tone === "bull" ? "#10b981" : tone === "bear" ? "#f43f5e" : "#94a3b8";
  return (
    <svg viewBox="0 0 220 124" className={className}>
      <path d="M 32 110 A 78 78 0 0 1 71 42.5" fill="none" stroke="#f43f5e" strokeOpacity="0.55" strokeWidth="10" strokeLinecap="round" />
      <path d="M 71 42.5 A 78 78 0 0 1 149 42.5" fill="none" stroke="currentColor" className="text-muted" strokeWidth="10" strokeLinecap="round" />
      <path d="M 149 42.5 A 78 78 0 0 1 188 110" fill="none" stroke="#10b981" strokeOpacity="0.55" strokeWidth="10" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={needle} strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="5" fill={needle} />
    </svg>
  );
}
