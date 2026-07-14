export const BARS = ["15m", "1H", "4H", "1D"];
// Sinais de FLUXO (opcionais) que o robô pode usar como confirmação — cada um liga/desliga (signal_toggles).
// O núcleo SMC price-action (OB/FVG/liquidez/EQH-EQL/zonas/BOS-CHoCH) é sempre usado, fora desta lista.
export const FLOW_SIGNALS: { key: string; label: string }[] = [
  { key: "cvd_div", label: "Divergência CVD (inst × varejo)" },
  { key: "cvd", label: "CVD agregado" },
  { key: "book_inst", label: "Book institucional (Coinbase)" },
  { key: "book_retail", label: "Book varejo" },
  { key: "absorb", label: "Absorção (teste de parede)" },
  { key: "walls", label: "Paredes de baleia" },
  { key: "book_trend", label: "Pressão do book" },
  { key: "liqs", label: "Liquidações" },
  { key: "gamma", label: "Put/Call Wall" },
  { key: "gflow", label: "Fluxo de gamma (HIRO)" },
  { key: "funding", label: "Funding (contrário)" },
  { key: "ls_ratio", label: "Long/Short (contrário)" },
  { key: "feargreed", label: "Fear & Greed" },
];
export const SIG_GROUPS = ["Estrutura", "Microestrutura", "Fluxo", "Posicionamento", "Técnico"];
// Robô 2.0 — a que BLOCO (dos 5, força igual) cada indicador vota. Fora daqui = contexto (TFs) ou medido (Put/Call Wall invertido).
export const CONF2_BLOCK: Record<string, string> = {
  tf_15m: "Estrutura", swing: "Estrutura", bos: "Estrutura", ob: "Estrutura", sweep: "Estrutura",
  book_inst: "Microestrutura", book_retail: "Microestrutura", absorb: "Microestrutura", walls: "Microestrutura", book_trend: "Microestrutura", fvg: "Microestrutura",
  funding: "Fluxo", cvd: "Fluxo", cvd_div: "Fluxo", liqs: "Fluxo",
  ls_ratio: "Posicionamento", feargreed: "Posicionamento", gflow: "Posicionamento",
  adx: "Técnico", ema2050: "Técnico", rsi: "Técnico", macd: "Técnico", sqz: "Técnico",
}; // VWAP saiu do bloco Técnico do Robô 2.0 (dono 10/jul) — não vota nem conta na força; segue no v28
// INDICADORES por bloco no sub-painel do gráfico (Robô 2.0). idx = posição na tupla block_hist
// [t, wforce, estrutura, micro, fluxo, posic, tecnico]. Cor casa com a bolinha do bloco no card.
export const BLOCK_LINES: { id: string; idx: number; label: string; color: string; width?: 1 | 2 }[] = [
  { id: "wforce", idx: 1, label: "Força ponderada", color: "#e2e8f0", width: 2 },
  { id: "estrutura", idx: 2, label: "Estrutura", color: "#10b981" },
  { id: "micro", idx: 3, label: "Microestrutura", color: "#38bdf8" },
  { id: "fluxo", idx: 4, label: "Fluxo", color: "#a78bfa" },
  { id: "posicionamento", idx: 5, label: "Posicionamento", color: "#fbbf24" },
  { id: "tecnico", idx: 6, label: "Técnico", color: "#f472b6" },
];
// Papel REAL de cada sinal no MOTOR v21 "SMC + PRESSÃO" (espelha o bot-run, sql/107):
// decide = estrutura SMC 15m (arma o setup + é 1 dos 2 votos) · vota = grupo Fluxo (book inst+varejo
// = a pressão, + liqs/gamma/CVD div) — Estrutura E Fluxo precisam votar na direção (2 de 2) ·
// estudo = Técnico/Sentimento saíram da decisão (decisão do dono 06/jul) — seguem medidos ·
// medido = só alimenta o aprendizado (absorção/paredes/pressão/CVD/funding, hit-rate <50%).
export const VOTE_GROUP: Record<string, string> = {
  book_inst: "Fluxo", book_retail: "Fluxo", cvd_div: "Fluxo", liqs: "Fluxo", gflow: "Fluxo",
  ema2050: "Técnico", vwap: "Técnico", adx: "Técnico",
};
export const STUDY_GROUP: Record<string, string> = {
  feargreed: "Sentimento", ls_ratio: "Sentimento",
};
// Peças do SMC que JÁ COMPÕEM o placar DECIDE (Estrutura 15m) e o gatilho — não votam separado
// pra não contar duas vezes; o selo "compõe" deixa isso explícito (dúvida do dono 06/jul).
export const COMPOSE_KEYS = new Set(["swing", "bos", "ob", "sweep", "fvg"]);
export const LOG_TONE: Record<string, string> = {
  trade: "bg-primary/15 text-primary",
  info: "bg-muted text-muted-foreground",
  warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  error: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};
// Taxa por ROUND-TRIP no papel (taker 0,04% + slippage 0,02%, os dois lados = 0,12%), igual ao bot-backtest.
// A auditoria provou que a régua BRUTA mente — o líquido de taxa é o que decide qual robô presta.
export const FEE_RT = 0.12;

// Catálogo dos robôs (vivo + sombras) — fonte única de nome/descrição por engine.
// Usado no placar de desempenho e na visão de posições/ordens por robô.
export const BOT_ENGINES: { eng: string; name: string; desc: string }[] = [
  { eng: "confluence2",     name: "Robô 2.0",              desc: "força ponderada dos 5 blocos" },
  { eng: "confluence2_tec", name: "Robô 3.0",              desc: "segue a maioria do bloco Técnico (≥3 de 5), sem veto de zona" },
  { eng: "smc",             name: "Robô v28",              desc: "SMC price-action + gates" },
  { eng: "confluence2_ct",  name: "2.0 · trailing vela",   desc: "saída por vela" },
  { eng: "confluence2_bg",  name: "2.0 · book-gate",       desc: "veta abrir contra o book varejo" },
  { eng: "confluence2_cap", name: "2.0 · teto same-side",  desc: "máx 2 posições do mesmo lado" },
  { eng: "confluence2_cd",  name: "2.0 · cooldown",        desc: "trava re-entrada por ~60min" },
];
export const ENGINE_NAME: Record<string, string> = Object.fromEntries(BOT_ENGINES.map((e) => [e.eng, e.name]));
