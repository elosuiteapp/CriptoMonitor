import { useEffect, useState } from "react";

import { getLocale } from "../hooks/useLocale";
import { useT } from "../lib/i18n";
import { supabase } from "../lib/supabase";

interface OiRow {
  strike: number | null;
  type: string | null;
  oi: number | null;
  ts: string;
  expiry: string | null;
}
interface StrikeAgg {
  strike: number;
  call: number;
  put: number;
}

const fmtStrike = (s: number) => (s >= 1000 ? `${(s / 1000).toFixed(s % 1000 < 50 ? 0 : 1)}k` : `${s}`);
const fmtOi = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v >= 100 ? `${Math.round(v)}` : v.toFixed(1));

/** Perfil de Open Interest por strike (vencimento mais próximo). Mostra ONDE os
 *  contratos se acumulam — os "muros" de OI, que costumam grudar em números redondos
 *  e ancoram o Max Pain. É diferente do perfil de GEX (que pondera pelo gama): aqui é
 *  o contrato cru. Puts à esquerda (suporte), calls à direita (resistência). */
export default function GammaOiProfile({
  asset,
  spot,
  maxPain,
}: {
  asset: string;
  spot: number | null;
  maxPain: number | null;
}) {
  const { t } = useT();
  const [rows, setRows] = useState<OiRow[] | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("options_oi")
        .select("strike, type, oi, ts, expiry")
        .eq("asset", asset)
        .order("ts", { ascending: false })
        .limit(120);
      if (active) setRows((data as OiRow[]) ?? []);
    })();
    return () => {
      active = false;
    };
  }, [asset]);

  if (rows == null) return <div className="text-xs text-muted-foreground">{t.gammaChart.loadingOi}</div>;
  if (rows.length === 0)
    return <div className="text-xs text-muted-foreground">{t.gammaChart.noOi}</div>;

  // Só o snapshot mais recente (todas as linhas de uma coleta compartilham o mesmo ts)
  const latestTs = rows[0].ts;
  const snap = rows.filter((r) => r.ts === latestTs && r.strike != null);
  const expiry = snap.find((r) => r.expiry)?.expiry ?? null;

  const byStrike = new Map<number, StrikeAgg>();
  for (const r of snap) {
    const k = Number(r.strike);
    const a = byStrike.get(k) ?? { strike: k, call: 0, put: 0 };
    if (r.type === "call") a.call += Number(r.oi ?? 0);
    else if (r.type === "put") a.put += Number(r.oi ?? 0);
    byStrike.set(k, a);
  }
  const aggs = [...byStrike.values()].sort((a, b) => b.strike - a.strike);
  if (aggs.length === 0) return <div className="text-xs text-muted-foreground">{t.gammaChart.noOi}</div>;

  const maxSide = Math.max(1, ...aggs.map((a) => Math.max(a.call, a.put)));
  const totalCall = aggs.reduce((s, a) => s + a.call, 0);
  const totalPut = aggs.reduce((s, a) => s + a.put, 0);
  const callWall = aggs.reduce((m, a) => (a.call > m.call ? a : m), aggs[0]);
  const putWall = aggs.reduce((m, a) => (a.put > m.put ? a : m), aggs[0]);

  return (
    <div>
      <p className="mb-2 text-[10px] leading-snug text-muted-foreground">
        {t.gammaChart.oiIntro1} <span className="text-foreground">{t.gammaChart.oiIntroRaw}</span> {t.gammaChart.oiIntro2}{" "}
        <span className="text-foreground">{t.gammaChart.oiIntroTwoBars}</span>{t.gammaChart.oiIntro3}{" "}
        <span className="text-foreground">{t.gammaChart.oiIntroWall}</span>{t.gammaChart.oiIntro4}
      </p>

      <div className="space-y-0.5">
        {aggs.map((a) => {
          const callPct = (a.call / maxSide) * 50;
          const putPct = (a.put / maxSide) * 50;
          const isSpot = spot != null && Math.abs(a.strike - spot) < spot * 0.0025;
          const isMaxPain = maxPain != null && a.strike === maxPain;
          const isCallWall = a.strike === callWall.strike && a.call > 0;
          const isPutWall = a.strike === putWall.strike && a.put > 0;
          return (
            <div
              key={a.strike}
              className="flex items-center gap-2 text-[10px]"
              title={`Strike ${fmtStrike(a.strike)} — Calls ${fmtOi(a.call)} · Puts ${fmtOi(a.put)}`}
            >
              <div className="flex h-3 flex-1 items-center justify-end gap-1">
                {a.put > 0 && <span className="num text-rose-600/70 dark:text-rose-400/50">{fmtOi(a.put)}</span>}
                <div
                  className={`h-2 rounded-l ${isPutWall ? "bg-rose-500" : "bg-rose-500/70"}`}
                  style={{ width: `${putPct}%` }}
                />
              </div>
              <div
                className={`w-16 text-center num ${
                  isSpot ? "font-bold text-primary" : isMaxPain ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                }`}
              >
                {fmtStrike(a.strike)}
              </div>
              <div className="flex h-3 flex-1 items-center gap-1">
                <div
                  className={`h-2 rounded-r ${isCallWall ? "bg-emerald-500" : "bg-emerald-500/70"}`}
                  style={{ width: `${callPct}%` }}
                />
                {a.call > 0 && <span className="num text-emerald-600/70 dark:text-emerald-400/50">{fmtOi(a.call)}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
        <span>
          ◀ {t.gammaChart.puts} <span className="num text-rose-600/80 dark:text-rose-400/80">{fmtOi(totalPut)}</span> · {t.gammaChart.wall}{" "}
          <span className="text-foreground">{fmtStrike(putWall.strike)}</span>
        </span>
        <span className="text-muted-foreground">
          {expiry ? `${t.gammaChart.expiryPrefix} ${new Date(expiry).toLocaleDateString(getLocale() === "en" ? "en-US" : "pt-BR")}` : ""} · {t.gammaChart.oiInContracts}
        </span>
        <span>
          {t.gammaChart.wall} <span className="text-foreground">{fmtStrike(callWall.strike)}</span> · {t.gammaChart.calls}{" "}
          <span className="num text-emerald-600/80 dark:text-emerald-400/80">{fmtOi(totalCall)}</span> ▶
        </span>
      </div>
    </div>
  );
}
