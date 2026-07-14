import { VOTE_GROUP, STUDY_GROUP, COMPOSE_KEYS, CONF2_BLOCK } from "./constants";

export const num = (v: unknown, d = 2) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d }));

export const decisionLabel = (d?: string | null) => (d === "long" || d === "buy" ? "Long" : d === "short" || d === "sell" ? "Short" : d === "flat" ? "Sair" : d === "preview" ? "Prévia" : d === "error" ? "Erro" : "Segurar");

export const sigRole = (key: string): { tag: string; cls: string; title: string } =>
  key.startsWith("tf_")
    ? { tag: "decide", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", title: "Estrutura SMC do 15m — arma o setup (entrada/stop/alvo estruturais) e é 1 dos 2 votos da confluência (Estrutura + Fluxo)" }
    : COMPOSE_KEYS.has(key)
    ? { tag: "compõe", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-500", title: "Peça do SMC que JÁ está dentro do placar DECIDE (Estrutura 15m) e do gatilho — swing, BOS/CHoCH, OB, liquidez e FVG formam o +/-bias e as zonas de entrada. Não vota separado pra não contar duas vezes." }
    : VOTE_GROUP[key]
    ? { tag: "vota", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400", title: `Compõe o grupo ${VOTE_GROUP[key]} da confluência: maioria 2 de 3 (Estrutura · Pressão · Técnico) a favor libera a entrada` }
    : STUDY_GROUP[key]
    ? { tag: "estudo", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400", title: `Grupo ${STUDY_GROUP[key]} — fora da decisão desde o v21 (robô opera SMC + pressão); segue medido como confluência de estudo/aprendizado` }
    : { tag: "medido", cls: "bg-muted text-muted-foreground", title: "Só medido — não influencia a decisão; alimenta o aprendizado por moeda (pode voltar ao placar se provar edge)" };
// Papel do sinal no ROBÔ 2.0 (5 blocos, força IGUAL): vota no bloco X, contexto (TF), ou medido (não vota).
export const conf2Role = (key: string): { tag: string; cls: string; title: string } => {
  const blk = CONF2_BLOCK[key];
  if (blk) return { tag: "vota", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400", title: `Robô 2.0: vota no bloco ${blk} com força IGUAL aos outros indicadores do bloco. O bloco segue a maioria; 3 dos 5 blocos na mesma direção abrem o trade.` };
  if (key.startsWith("tf_")) return { tag: "contexto", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-500", title: "Estrutura de outro timeframe — contexto do bloco Estrutura (só o 15m vota)." };
  return { tag: "medido", cls: "bg-muted text-muted-foreground", title: "Só medido — não vota no Robô 2.0 (ex.: Put/Call Wall é invertido na régua forte). Fica de referência." };
};
