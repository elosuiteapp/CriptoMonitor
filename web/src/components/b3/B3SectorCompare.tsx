// Comparação do ativo vs a mediana do seu setor (DY/P/L/P/VP/ROE/margem).
// Grátis: usa os fundamentos do Fundamentus que já carregamos + os setores curados
// (B3_SECTORS). Mediana (não média) pra não distorcer com outliers. Só p/ ações.
import { B3_ASSETS, B3_SECTORS, b3Sector, type B3Funds } from "../../lib/b3";
import InfoTip from "../InfoTip";
import { fmtMult, fmtPctRaw } from "./B3Shared";

type Better = "high" | "low"; // direção que é "boa": DY/ROE alto bom; P/L/P/VP baixo bom.
interface Metric {
  key: keyof B3Funds[string];
  label: string;
  fmt: (n: number | null) => string;
  better: Better;
}
const METRICS: Metric[] = [
  { key: "dy", label: "Dividend Yield", fmt: (n) => fmtPctRaw(n), better: "high" },
  { key: "pl", label: "P/L", fmt: (n) => (n == null ? "—" : n.toFixed(1)), better: "low" },
  { key: "pvp", label: "P/VP", fmt: fmtMult, better: "low" },
  { key: "roe", label: "ROE", fmt: (n) => fmtPctRaw(n), better: "high" },
  { key: "mrgLiq", label: "Margem líquida", fmt: (n) => fmtPctRaw(n), better: "high" },
];

const median = (xs: number[]): number | null => {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

export default function B3SectorCompare({ asset, funds }: { asset: string; funds: B3Funds }) {
  const sector = b3Sector(asset);
  const self = funds[asset];
  if (!self || sector === "Outros") return null;

  // Pares do setor (ações com o mesmo setor curado) que têm fundamento carregado.
  const peers = B3_ASSETS.filter((a) => a.kind === "stock" && B3_SECTORS[a.symbol] === sector && funds[a.symbol]).map((a) => a.symbol);
  if (peers.length < 3) return null; // setor pequeno demais pra uma mediana fazer sentido

  const rows = METRICS.map((mt) => {
    const selfVal = (self[mt.key] as number | null) ?? null;
    const med = median(peers.map((s) => funds[s]?.[mt.key] as number).filter((n): n is number => n != null));
    let verdict: "good" | "bad" | "neutral" = "neutral";
    if (selfVal != null && med != null && Number.isFinite(med)) {
      const above = selfVal > med;
      const isGood = mt.better === "high" ? above : !above;
      // tolerância de 3% pra não rotular diferenças irrelevantes como "melhor/pior"
      verdict = Math.abs(selfVal - med) / (Math.abs(med) || 1) < 0.03 ? "neutral" : isGood ? "good" : "bad";
    }
    return { ...mt, selfVal, med, verdict };
  });

  const tone = (v: "good" | "bad" | "neutral") => (v === "good" ? "text-emerald-500" : v === "bad" ? "text-rose-500" : "text-muted-foreground");
  const word = (v: "good" | "bad" | "neutral") => (v === "good" ? "melhor" : v === "bad" ? "pior" : "≈ setor");

  return (
    <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        {asset} vs setor · {sector}
        <InfoTip text="Compara os fundamentos da ação com a mediana das empresas do mesmo setor. Verde = a ação está melhor que a média do setor naquele indicador; vermelho = pior. Ajuda a ver se ela está cara ou barata em relação às concorrentes." />
      </h3>
      <p className="mb-3 text-[11px] text-muted-foreground">Mediana de {peers.length} ações do setor. Verde = {asset} melhor que a mediana; vermelho = pior.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Indicador</th>
              <th className="px-3 py-2 text-right font-medium">{asset}</th>
              <th className="px-3 py-2 text-right font-medium">Mediana setor</th>
              <th className="px-3 py-2 text-right font-medium">Posição</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border/50 last:border-0">
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
