export interface Config {
  enabled: boolean;
  venue: string;
  inst_id: string;
  base_ccy: string;
  quote_ccy: string;
  bar: string;
  ema_fast: number;
  ema_slow: number;
  order_quote_sz: number;
  buy_threshold: number;
  sell_threshold: number;
  leverage: number;
  mgn_mode: string;
  position: string;
  pos_base_sz: number;
  entry_px: number | null;
  pyramid: boolean;
  pyramid_max: number;
  min_votes: number;
  stop_pct: number;
  ct_stop_pct: number;
  counter_trend: string; // 'block' | 'tight'
  auto_weight: boolean;  // auto-ponderar sinais por moeda (usa o aprendizado)
  trail_on: boolean;     // stop móvel (trailing) ligado
  rev_mode?: string;     // reversão: off (nunca vira a mão) | imbalance (só FVG fresco) | any (antigo)
  ta_gate?: boolean;     // LEGADO (v16): filtro técnico — substituído pelo voto do grupo Técnico
  flow_veto?: number;    // LEGADO (v16): veto de fluxo — substituído pelo voto do grupo Fluxo
  conf_min?: number;     // motor v17: nº mínimo de grupos votando na direção (só no escopo 'all')
  // v18-v22 (playbook/contexto/pressão — sql/104/106/107):
  imb_mode?: string;       // 'retest' (zona respeitada, igual módulo) | 'chase' (antigo)
  imb_align?: boolean;     // imbalance só a favor da estrutura
  setup_priority?: string; // 'structure' (reteste de OB/FVG primeiro) | 'imbalance'
  zone_once?: boolean;     // 1 entrada por zona
  dir_mode?: string;       // 'any' | 'majority' (2-de-3) | 'internal'
  htf_gate?: string;       // 'off' | '1H' | '4H' | '1D' — bússola do TF maior
  conf_scope?: string;     // 'smc_flow' (estrutura + pressão não-contra) | 'all' (4 grupos)
  bot_engine?: string;     // 'smc' (v28) | 'confluence2' (Robô 2.0: força ponderada dos 5 blocos + saída por confluência)
  conf2_weights?: Record<string, number>; // peso por bloco (%) do Robô 2.0 (força ponderada = Σ peso×força)
  conf2_enter?: number;    // força ponderada mínima p/ ABRIR (−100..+100)
  conf2_hold?: number;     // histerese: segura enquanto |força| ≥ hold; sai perto de 0
  conf2_stop_atr?: number; // largura ×ATR do stop de catástrofe (saída principal é por confluência)
  conf2_be_atr?: number;   // trava de breakeven: ≥ N×ATR de lucro → stop nunca fica abaixo da entrada (0 = off)
  delta_confirm?: boolean; // vela da entrada precisa de delta (volume taker) a favor (v24)
  zone_discipline?: boolean; // premium não compra / discount não vende, salvo rompimento (v25)
  sq_filter?: boolean;     // Squeeze Momentum (LazyBear) forte contra segura a entrada (v26)
  target_on?: boolean;   // take-profit estrutural (alvo na liquidez); false = sai só por stop/trailing
  tp_partial?: boolean;  // no alvo, embolsa METADE e o resto corre no trailing (stop ≥ breakeven)
  block_hours?: number[] | null; // gate de sessão GLOBAL: horas UTC sem ENTRADAS novas (saídas normais)
  asset_overrides?: Record<string, { conf_min?: number; block_hours?: number[]; risk_mult?: number; trail_floor?: string }>; // CADA MOEDA É ÚNICA: dose por ativo (sobrepõe o global)
  max_zone_atr?: number; // qualidade 1: entrada imbalance só a ≤ X ATR da borda do FVG (0 = off)
  opp_zone_atr?: number; // qualidade 2: bloqueia entrada com FVG/OB oposto fresco a ≤ X ATR à frente (0 = off)
  opp_htf_atr?: number;  // fase R (APROVADA): zona OPOSTA do TF da bússola a ≤ X×ATR(HTF) à frente segura a entrada (0 = off)
  vol_max_atr?: number;  // fase V (APROVADA): vela fechada com range > K×ATR (spike) não gera entrada (0 = off)
  trail_pct: number;     // distância do trailing (%) — fallback quando não há ATR
  trail_atr_mult: number; // distância do trailing = k × ATR do ativo (adaptativo)
  stop_atr_on: boolean;  // stop de risco por ATR (senão, % fixo)
  stop_atr_mult: number; // distância do stop de risco = k × ATR do ativo
  risk_pct: number;      // % do patrimônio arriscado por trade (sizing por risco)
  daily_loss_pct: number; // circuit breaker: perda diária máx (%)
  max_positions: number;  // máx. posições simultâneas
  cooldown_min: number;   // cooldown pós-stop (min)
  imbalance_on: boolean;  // override: FVG novo → entra a favor
  imbalance_min_pct: number; // tamanho mínimo do FVG (% do preço); 0 = todo FVG
  signal_toggles: Record<string, boolean>; // sinais de fluxo ligados/desligados (ausente = ligado)
  last_bias: number | null;
  last_conviction: number | null;
  last_decision: string | null;
  last_run: string | null;
  last_reading: Reading | null;
}
export interface ReadingSig {
  key: string;
  group: string;
  label: string;
  score: number;
  weight: number;
  note: string;
}
export interface ConfGroup { key: string; label: string; score: number; vote: 1 | 0 | -1 }
export interface Conf2Group { key: string; label: string; score: number; vote: 1 | 0 | -1; up: number; dn: number; n: number; weight: number }
export interface Conf2 { groups: Conf2Group[]; up: number; dn: number; wforce: number; enter: number; hold: number; dir: string; weights?: Record<string, number> }
export interface Reading {
  bias: number;              // viés estrutural SMC do 15m (quem decide)
  conviction: number;        // legado: |bias| (fica no payload, não é mais exibido)
  signals: ReadingSig[];
  spot?: number;
  flowTilt?: number;         // placar do grupo Fluxo (limpo, v17)
  confluence?: ConfGroup[];  // motor v17: os 4 grupos (Estrutura/Fluxo/Técnico/Sentimento) e o voto de cada
  confMin?: number;          // grupos necessários p/ executar
  confVotes?: { for: number; against: number } | null; // votos na direção do setup deste ciclo
  confluence2?: Conf2;       // Robô 2.0: os 5 blocos (força igual por indicador), votos + força total −100..+100
  engine?: string;           // motor vivo do ciclo ('smc' | 'confluence2')
  setup?: string | null;     // gatilho SMC armado ("imbalance ↑", "OB/FVG + estrutura ↓"…)
  planStop?: number | null;  // stop estrutural do plano
  planTarget?: number | null;// alvo (próxima liquidez) do plano
  want?: string;             // alvo final após vetos (long/short/flat)
  position?: string;
  adds?: number;
  leverage?: number;
  gate?: string | null;      // por que segurou / nota do plano
  ts?: string;
  structure?: { smcBias?: number; setup?: string | null; planStop?: number | null; planTarget?: number | null; flowBias?: number; gammaRegime?: string; zone?: string | null; autoWeight?: { on: boolean; structWAdj?: number } } | null;
}
export interface OrderRow {
  id: string;
  source: string;
  action: string | null;
  inst_id: string | null;
  side: string | null;
  ord_type: string | null;
  sz: string | null;
  avg_px: number | null;
  pnl: number | null;
  ok: boolean;
  result: { msg?: string; data?: { sMsg?: string; ordId?: string }[] } | null;
  note: string | null;
  created_at: string;
  engine?: string;
}
export interface LogRow {
  id: number;
  level: string;
  message: string;
  created_at: string;
}
export interface BotPosition {
  asset: string;
  inst_id: string | null;
  position: string;
  pos_base_sz: number;
  entry_px: number | null;
  adds: number | null;
  stop_px: number | null;
  ctrend: boolean | null;
  peak_px: number | null;
  target_px: number | null;
  last_bias: number | null;
  last_conviction: number | null;
  last_decision: string | null;
  last_reading: Reading | null;
  engine?: string;
  block_hist?: number[][]; // histórico rolante [t, wforce, estrutura, micro, fluxo, posic, tecnico] p/ o gráfico
}
export interface LearningSig { key: string; label: string; weight: number; n: number; hitRate: number; edge: number }
export interface LearnAssetStat { n: number; hitRate: number; perSignal?: LearningSig[]; ai_report?: string | null }
export interface Learning {
  data: { window: string; labeled: number; overall: { n: number; hitRate: number }; byAsset: Record<string, LearnAssetStat>; perSignal: LearningSig[] } | null;
  ai_report: string | null;
  updated_at: string;
}
export interface BtTrade { side: string; at: number; r: number; reason: string; counter?: boolean; bars: number }
