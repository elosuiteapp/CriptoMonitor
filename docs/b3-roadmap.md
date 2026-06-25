# Roadmap do módulo B3 — fontes pagas e melhorias futuras

Backlog do módulo B3 (admin-only). O P0 (dividendos, fundamentos completos, screener
setorial) já está **no ar** — ver `web/src/components/b3/*` e a edge `ai/edge-functions/b3-data`.
Este doc guarda a pesquisa (fontes, preços, métodos) dos itens que ficaram para depois,
para não precisar pesquisar tudo de novo. Pesquisa feita em **jun/2026**.

---

## Avaliação de fontes + arquitetura (25/jun/2026)

Avaliação cruzada de uma lista ampla de fontes (locais + globais) contra o estado real do app.
**Achado-chave:** boa parte da "camada global/macro" **já é coletada para o cripto** — o trabalho
não é construir do zero, é **plugar no módulo B3** + somar o que é genuinamente brasileiro.
Tudo abaixo respeita [[scale-with-revenue]] (grátis primeiro, pago só com receita),
[[orbeview-visual-standard]] (reusar componentes) e [[relevance-first]].

### Já existe (não rebuildar)
- **B3 core (`b3-data`):** Yahoo (cotação/candles/dividendos), Fundamentus (fundamentos da bolsa
  toda), StatusInvest (proventos tipados + agenda), BCB (Selic/IPCA/PTAX + Focus), ADR premium
  (proxy do estrangeiro), comparação setorial, leitura de ação (força vs IBOV/MAs/S-R).
- **Global/macro já coletado p/ cripto:** `macro-fred` → VIX, DXY, US10Y, M2, net liquidity, NFCI,
  HY spread, 2s10s · `econ-calendar` (ForexFactory) · Alternative.me F&G · CFTC COT (CME cripto).

### Veredito por fonte (free? viável? onde encaixa)

| Fonte | Custo | Endpoint | Freq. | Veredito |
|---|---|---|---|---|
| **BCB SGS** (CDI 4389, IBC-Br 24364, desemprego 24369) | grátis, s/ chave | `api.bcb.gov.br/dados/serie/bcdata.sgs.{N}/dados/ultimos/{n}` | diária/mensal | ✅ **FEITO (Onda 1)** |
| **Commodities** (Brent BZ=F, Cobre HG=F, Ouro GC=F) | grátis, s/ chave | Yahoo chart (já proxiado) | intradiário | ✅ **FEITO (Onda 1)** — linkage PETR4/VALE3 |
| **FRED** (VIX/DXY/yields/M2/CPI) | grátis (chave no `app_secrets`) | `macro-fred` → `macro_assets`/`macro_global` | diária (cron job 6) | ⏳ **SURFACE** — dado já no banco; falta expor no cockpit B3 |
| **EIA** (petróleo WTI/Brent + estoques → PETR4) | grátis c/ **API key** | `api.eia.gov/v2/...` | semanal | ⏳ pendente: key do dono |
| **CFTC COT** (DXY/ouro/petróleo) | grátis | API CFTC pública (temos o padrão `cftc_cot`) | semanal | ⏳ aba Macro B3 — relevante p/ WDO |
| **CVM** (carteiras de fundos) | grátis | `dados.cvm.gov.br` (CSV/zip) | mensal, **lag 1–3m** | 🔮 Fase 2 — pesado; é tendência, não tempo real |
| **CBOE** (put/call S&P) | grátis | download diário CBOE | diária | 🔵 opcional — sentimento US |
| **Minério de ferro** (→VALE3) | ❌ sem feed grátis bom | — | — | ⚠️ usar **cobre** como proxy (feito) |
| **B3 UP2DATA / dadosdemercado** (fluxo por investidor) | **pago/comercial** | contato comercial | diária | 🔒 **defer** — maior diferencial, mas custa (P2) |
| **brapi** gregas/IV de opções B3 | **virou pago** | brapi.dev | — | ⚠️ saímos da brapi; gamma B3 = OpLab (P2) |
| **MacroMicro** F&G Brasil | ❌ sem API pública | — | — | 🛠️ **construir o nosso** (breadth IBOV + vol + momentum) |
| **Investing.com** calendário | scraping/ToS | — | — | ⛔ pular — já temos `econ-calendar` |

### Ondas (grátis, priorizado)
- **Onda 1 — FEITO 25/jun:** BCB completo (CDI/IBC-Br/desemprego) + strip "Commodities que movem o
  IBOV" (Brent/cobre/ouro com mapeamento p/ PETR4/VALE3/siderúrgicas) no cockpit B3.
- **Onda 2 — diferencial nosso:** (b) ✅ **FEITO 25/jun** — **Fear & Greed Brasil próprio**
  (`brazilFng` no `b3-data` mode overview, `B3FearGreedPanel` no cockpit): 0..100 de 6 forças
  grátis e auditáveis — amplitude do basket, momento IBOV vs MM125, faixa 52 sem, volatilidade
  realizada (invertida), câmbio (porto-seguro) e risco global (VIX). Reusa o `BiasGauge`. Validado
  live (score 49 "Neutro"). E (d) ✅ **FEITO 25/jun** — **Cockpit Report B3** (`b3-report`, Gemini)
  enriquecido: recebe F&G + commodities + macro completo e abre com uma **## Síntese do dia** (2-3
  frases que amarram o termômetro ao quadro), + seções de macro (CDI/IBC-Br/desemprego) e externo
  (commodities→ação) ampliadas. Falta: (a) surface dos demais globais (DXY/yields/M2 já em
  `macro_global`) num bloco risk-on/off; (c) COT (DXY/ouro/petróleo) na aba Macro.
- **Onda 3 — com receita:** fluxo por investidor (UP2DATA/dadosdemercado) + gamma/opções (OpLab) —
  os dois maiores trunfos, ambos pagos.

**Honestidade:** "nenhuma plataforma integra tudo" é real e atingível — mas os dois maiores trunfos
(fluxo por investidor + gamma B3) são pagos, e F&G-Brasil-pronto (MacroMicro) e minério grátis
**não existem como API**. O caminho gratuito forte = contexto global (temos) + commodity-linkage +
F&G-Brasil-nosso + síntese em PT.

---

## P2 — diferenciais pagos (o que falta para o módulo ficar "completo")

### 1. Fluxo por tipo de investidor (estrangeiro · institucional · PF) — **maior diferencial**

O "smart money" de verdade da B3 é o **saldo diário/acumulado por tipo de investidor**
(estrangeiro, institucional, pessoa física). É o sinal mais acompanhado do mercado brasileiro
e hoje só temos um *proxy* grátis (prêmio/desconto dos ADRs).

- **Fonte:** [dadosdemercado.com.br/api](https://www.dadosdemercado.com.br/api/docs)
  - Endpoint: `/bolsa/investidores-estrangeiros` (e o relatório de fluxo por tipo, histórico desde 2010).
  - Combina CVM, BCB, Anbima e B3.
- **Preço:** **não é público** — "entre em contato" → **api@dadosdemercado.com.br** (pedir orçamento + limites de requisição). Possível tier grátis com conta (CSV), mas a API completa é provavelmente paga.
- **Como integrar:**
  1. Novo modo na edge `b3-data` (ex.: `{ mode: "flow" }`) que chama a API com token guardado em secret (`DADOSDEMERCADO_TOKEN`).
  2. Substituir o "Termômetro do estrangeiro (proxy)" da aba **Fluxo & Smart Money** pelo fluxo oficial: cards de saldo do dia + gráfico de fluxo acumulado por tipo.
  3. Alimentar o **Relatório IA** (`b3-report`) com o fluxo (seção "## 4. Fluxo").
- **Por que vale:** nenhum concorrente grátis tem isso bem feito; é o "gamma/HIRO" da B3.

### 2. Gamma & Opções (GEX) — replicar o trunfo da cripto

Call/Put Wall, Zero Gamma, Max Pain e exposição a gama por strike nas opções líquidas
(PETR4, VALE3, IBOV). É o mesmo cockpit de gamma da cripto, aplicado à B3.

- **Fonte:** [OpLab](https://oplab.com.br/planos/) — séries de opções de todas as ações da B3 (semanais/mensais), **gregas (delta, gamma, theta, vega, rho)** e **open interest**. Tem API.
- **Preço:** ver [oplab.com.br/planos](https://oplab.com.br/planos/) (pago; confirmar tier com API + gregas + OI por strike).
- **Como integrar:**
  1. Edge `b3-data` modo `{ mode: "options", ticker }` → puxa cadeia de opções + gregas + OI da OpLab (secret `OPLAB_TOKEN`).
  2. Reusar o motor/visual de gamma do cripto (Call/Put Wall, Zero Gamma, Max Pain) — ver [[orbeview-visual-standard]]: não criar UI nova.
  3. Card "Risco de Squeeze" análogo ao do cripto.
- **Alternativa:** MarketDataCloud (marketdatacloud.com.br) — market data B3 em tempo real (também pago).

---

## P1 — melhorias grátis que ficaram para depois

- **Universo dinâmico** em vez da lista fixa: `brapi /api/quote/list?sortBy=...&sector=...` e `/api/v2/tickers` funcionam **sem token** → puxar as mais líquidas e a composição/peso do IBOV. (Hoje o universo é curado em `web/src/lib/b3.ts`.) — **PENDENTE**
- ✅ **Comparação com pares do setor** na ficha do ativo — FEITO (jun/2026). `B3SectorCompare.tsx` no cockpit: mediana de DY/P/L/P/VP/ROE/margem dos pares do setor (`B3_SECTORS`) vs o ativo. Só ações, ≥3 pares.
- ✅ **Repensar a aba Smart Money para ação** — FEITO (jun/2026). `B3StockReadPanel.tsx` + `lib/b3StockRead.ts`: força relativa vs IBOV (1M/3M/6M), médias (MM20/50/200 + golden/death), suporte/resistência por pivôs, volume vs média. SMC/ICT virou seção "Análise avançada" abaixo (só p/ ações; índice/dólar seguem no SMC).
- ✅ **Distinguir Dividendo × JCP** + ✅ **Agenda de proventos futura** — FEITO (jun/2026). Edge `b3-data` modo `proventos` via **StatusInvest** (`companytickerprovents`, JSON interno): data-com (`ed`), pagamento (`pd`), tipo (`et`/`etd` → Dividendo/JCP/Rendimento), valor (`v`). Inclui provisionados futuros = agenda. Aba Dividendos: coluna Tipo no histórico + card "Agenda de proventos". Fallback Yahoo se vier vazio. Risco: scrape de endpoint interno pode quebrar.

---

## Fontes grátis JÁ em uso (P0, referência)
- **Yahoo Finance** (sem token): cotações, candles (todos os TFs), `events=div` (dividendos), ADRs, macro global.
- **Fundamentus** `resultado.php` (scrape server-side): fundamentos da bolsa toda em 1 request.
- **BCB** (SGS + Olinda/Focus): Selic, IPCA, PTAX, expectativas de mercado.

Ver [[b3-data-sources]] para os detalhes técnicos (endpoints, parsing, gotchas).
