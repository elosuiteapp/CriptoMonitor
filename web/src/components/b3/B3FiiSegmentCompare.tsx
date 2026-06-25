// Comparação do FII vs a mediana do seu SEGMENTO (DY/P/VP/FFO/cap rate/vacância).
// Grátis: usa os fundamentos de FII que já carregamos (Fundamentus) + o segmento de
// cada um. Mediana (não média) pra não distorcer com outliers. Espelha o
// B3SectorCompare das ações — padrão visual único.
import { B3_FIIS, type B3FiiFund, type B3FiiFunds } from "../../lib/b3";
import { fmtMult, fmtPctRaw } from "./B3Shared";

type Better = "high" | "low";
interface Metric {
  key: keyof B3FiiFund;
  label: string;
  fmt: (n: number | null) => string;
  better: Better;
}
const METRICS: Metric[] = [
  { key: "dy", label: "Dividend Yield", fmt: fmtPctRaw, better: "high" },
  { key: "pvp", label: "P/VP", fmt: fmtMult, better: "low" },
  { key: "ffoYield", label: "FFO Yield", fmt: fmtPctRaw, better: "high" },
  { key: "capRate", label: "Cap Rate", fmt: fmtPctRaw, better: "high" },
  { key: "vacancia", label: "Vacância", fmt: fmtPctRaw, better: "low" },
];

const median = (xs: number[]): number | null => {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

export default function B3FiiSegmentCompare({ asset, fiis }: { asset: string; fiis: B3FiiFunds }) {
  const self = fiis[asset];
  const seg = self?.segmento ?? null;
  if (!self || !seg) return null;

  // Pares = FIIs do MESMO segmento com fundamento carregado.
  const peers = B3_FIIS.filter((f) => fiis[f.symbol]?.segmento === seg).map((f) => f.symbol);
  if (peers.length < 3) return null; // segmento pequeno demais pra mediana fazer sentido

  const rows = METRICS.map((mt) => {
    const selfVal = (self[mt.key] as number | null) ?? null;
    const med = median(peers.map((s) => fiis[s]?.[mt.key] as number).filter((n): n is number => n != null));
    let verdict: "good" | "bad" | "neutral" = "neutral";
    if (selfVal != null && med != null && Number.isFinite(med)) {
      const above = selfVal > med;
      const isGood = mt.better === "high" ? above : !above;
      verdict = Math.abs(selfVal - med) / (Math.abs(med) || 1) < 0.03 ? "neutral" : isGood ? "good" : "bad";
    }
    return { ...mt, selfVal, med, verdict };
  }).filter((r) => r.selfVal != null || r.med != null); // some linhas vazias (ex.: vacância em FII de papel)

  if (!rows.length) return null;

  const tone = (v: "good" | "bad" | "neutral") => (v === "good" ? "text-emerald-500" : v === "bad" ? "text-rose-500" : "text-muted-foreground");
  const word = (v: "good" | "bad" | "neutral") => (v === "good" ? "melhor" : v === "bad" ? "pior" : "≈ segmento");

  return (
    <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
      <h3 className="mb-1 text-sm font-semibold text-foreground">{asset} vs segmento · {seg}</h3>
      <p className="mb-3 text-[11px] text-muted-foreground">Mediana de {peers.length} FIIs do segmento. Verde = {asset} melhor que a mediana; vermelho = pior.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Indicador</th>
              <th className="px-3 py-2 text-right font-medium">{asset}</th>
              <th className="px-3 py-2 text-right font-medium">Mediana segmento</th>
              <th className="px-3 py-2 text-right font-medium">Posição</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key as string} className="border-b border-border/50 last:border-0">
                <td className="px-3 py-2 text-foreground">{r.label}</td>
                <td className="num px-3 py-2 text-right font-semibold text-foreground">{r.fmt(r.selfVal)}</td>
                <td className="num px-3 py-2 text-right text-muted-foreground">{r.fmt(r.med)}</td>
                <td className={`px-3 py-2 text-right text-xs font-semibold ${tone(r.verdict)}`}>{word(r.verdict)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
