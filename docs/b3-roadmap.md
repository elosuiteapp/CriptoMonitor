# Roadmap do módulo B3 — fontes pagas e melhorias futuras

Backlog do módulo B3 (admin-only). O P0 (dividendos, fundamentos completos, screener
setorial) já está **no ar** — ver `web/src/components/b3/*` e a edge `ai/edge-functions/b3-data`.
Este doc guarda a pesquisa (fontes, preços, métodos) dos itens que ficaram para depois,
para não precisar pesquisar tudo de novo. Pesquisa feita em **jun/2026**.

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
