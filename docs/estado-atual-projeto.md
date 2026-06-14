# Crypto Monitor — Estado atual do projeto (14/06/2026)

Relatório do que está **realmente** implementado e no ar hoje, para análise externa.
Inclui ao final uma seção reconciliando este estado com o prompt da "Fase 6.2"
(Cockpit Report 2x/dia + Volatility Dashboard), que contém premissas desatualizadas.

---

## 1. Resumo executivo

SaaS de cockpit de trading cripto (estilo SpotGamma) para BTC, ETH e SOL. Traduz
métricas institucionais (gamma/GEX, opções, funding, OI, fluxo) em leitura simples
com semáforo. Três planos: **Free, Pro, Expert** (gating por RLS).

**Stack:**
- **Coletor**: Python 3.12 (CCXT, httpx, APScheduler, NumPy, supabase-py) — worker contínuo.
- **Banco/Auth/Realtime/Edge**: Supabase (PostgreSQL), projeto `gshdynwrvabasjiapyap`.
- **Frontend**: Vite + React + TypeScript + Tailwind + Lightweight Charts.
- **IA**: **Google Gemini** (não Claude) via Edge Function.

**Hospedagem:**
- Coletor → **Railway** (serviço `crypto-monitor-collector`, região **US West**).
- Frontend → **Vercel**.
- Banco/funcs → **Supabase**.
- Deploy automático via push no GitHub (`elosuiteapp/CriptoMonitor`, branch `main`).

**Status geral:** Fases 0–5 (MVP) + Fase 6.1 (cockpit expandido) implementadas e no ar.
Coletor coletando e gravando a cada 5 min; dashboard atualiza em tempo real via
Supabase Realtime.

---

## 2. Coletor (≈13 fontes)

Worker contínuo (`collector/aggregator.py`), ciclo a cada **5 min** (APScheduler cron
`*/5`). Cada fonte é isolada (falha de uma não derruba o ciclo). Após o ciclo, grava
o `market_snapshot` consolidado por ativo (visão única que o front e a IA leem).

| Fonte | Alimenta | Cadência | Status |
|---|---|---|---|
| Binance (CCXT, **só spot** via `data-api.binance.vision`) | preço, volume_spot, **CVD** | 5 min | ✅ (geo-bloqueio 451 contornado) |
| Coinbase | preço, volume_spot | 5 min | ✅ |
| Coinalyze (`api-key`) | funding, OI, long/short, liquidações (`derivatives`) | 5 min | ✅ (depende da API key) |
| Deribit | book de opções → gamma/GEX, Zero Gamma, Max Pain, Put/Call, IV, skew, walls | 5 min | ✅ (BTC/ETH) |
| Options flow (Deribit trades) | proxy HIRO (`options_flow`) | 5 min | ✅ (esparso) |
| Orderbook walls (Binance via vision + Coinbase) | paredes do book | 5 min | ✅ |
| Hyperliquid | funding/OI on-chain (`onchain_perps`) | 5 min | ✅ |
| DefiLlama | TVL / stablecoins (`defi_health`) | 5 min | ✅ |
| Alternative.me | Fear & Greed (`sentiment`) | ~diário | ✅ |
| DexScreener | liquidez DEX | 5 min | ✅ |
| Notícias (RSS BR) | `news_feed` | 5 min | ✅ |
| CoinGecko | dominância BTC, mcap (`macro`) | ~15 min | ✅ |
| Macro markets (Yahoo Finance) | DXY, S&P, Ouro, 10Y + correlações 30d | ~30 min | ✅ |

**Volume de perps da Binance (`volume_perps`)**: indisponível (fapi geo-bloqueado, sem
endpoint público alternativo). Não é crítico.

---

## 3. Banco de dados

**Migrations aplicadas (via Supabase MCP): 001 a 014.**

```
001_schema · 002_auth_plans · 003_rls_policies · 004_harden_functions ·
005_realtime · 006_news_basic · 007_oi_delta · 008_macro_assets ·
009_orderbook_walls · 010_exchange_flows · 011_gamma_sentiment ·
012_gamma_levels · 013_options_flow · 014_gamma_levels_history
```
> A próxima migration seria **015**. (Atenção: 005 e 006 já existem — qualquer plano
> que peça "sql/005_*" / "sql/006_*" está desatualizado.)

**Tabelas principais:** `market_snapshot` (payload JSONB consolidado), `prices_cex`,
`derivatives`, `gamma_profile`, `options_oi`, `options_flow`, `orderbook_walls`,
`onchain_perps`, `dex_liquidity`, `defi_health`, `sentiment`, `macro`, `macro_assets`,
`macro_correlations`, `exchange_flows`, `news_feed`, `ai_analysis`, `alerts`,
`plans`, `subscriptions`, `profiles`, `usage_log`.

**Colunas atuais relevantes (para o plano da Fase 6.2):**
- `ai_analysis`: `id, user_id, asset, model_used, content, snapshot_ref, created_at`
  → **NÃO tem** `report_type` nem `auto_generated`. `user_id` é por-usuário (relatório
  broadcast precisaria de `user_id` nullable ou marcador de sistema).
- `profiles`: `id, full_name, phone, created_at, updated_at`
  → **NÃO tem** `alert_channels` nem `whatsapp_phone` (tem `phone`).

**RLS / planos:** gating por plano via funções (`plan_is_advanced()`, `current_plan_slug()`,
`plan_assets()`, `ts_within_history()`, `ts_within_frequency()`). Tabela `plans`
parametriza limites (assets, intervalo, métricas avançadas, camadas, cota de IA,
modelo de IA, canais de alerta, dias de histórico).

**RPC:** `gamma_levels_history(p_asset, p_days)` — histórico reamostrado de níveis (até 90d),
SECURITY INVOKER.

**Extensões:** `pg_cron` e `pg_net` estão **disponíveis mas NÃO instalados**
(precisam ser habilitados para agendamento). `http` também disponível.

---

## 4. Edge Functions (Supabase)

| Função | Status | Observação |
|---|---|---|
| `generate-analysis` (v6) | ✅ **EM USO** | **IA real = Google Gemini.** On-demand, gating de cota/modelo por plano |
| `claude-analysis` (v3) | ⚠️ legado | Função antiga de Claude, **substituída pelo Gemini**, não usada |
| `create-checkout` (v3) | ⚠️ Mercado Pago | Pagamentos; será **reescrito para Asaas** (adiado) |
| `payment-webhook` (v3) | ⚠️ Mercado Pago | idem |

**IA (Gemini):** `gemini-2.5-flash` (Free/Pro) e `gemini-2.5-pro` (Expert). Cuidado
conhecido: são "thinking models" → exigem `maxOutputTokens` alto + `thinkingBudget: 0`
no flash, senão retornam vazio; free tier dá 429 no 2.5-pro (fallback p/ flash).

---

## 5. Frontend

**Páginas:** Dashboard (página do ativo), Analysis (IA on-demand), Pricing, login/auth.

**Abas da página do ativo** (`TabBar`, IDs `cockpit | macro | smart`):
- **Cockpit Principal** (Free+): gráfico de candles com camadas (GEX, Zero Gamma, Max
  Pain, Volume Profile/POC, paredes do book, funding, CVD), **Módulo Gamma**, e os
  **cards** (ver abaixo).
- **Macro & Correlações** (Pro+): DXY, S&P, Ouro, 10Y + correlações Pearson 30d.
- **Smart Money & On-chain** (Expert): estruturada mas **sem dados** (exchange flows
  on-chain sem fonte grátis — mensagem honesta de "integração pendente").

**Módulo Gamma** — toggle `Barras | Linha | Níveis`:
- **Barras**: GEX por strike (barras).
- **Linha**: perfil de GEX estilo SpotGamma (X=preço, Put/Call Wall, Spot, Zero Gamma,
  Max Pain, zonas de dealers comprados/vendidos).
- **Níveis**: séries temporais dos níveis como linhas suaves (média móvel), em 2 painéis
  (Preço×Paredes e zoom no miolo), com seletor de janela **7d/30d/90d** (RPC reamostrada).
- **Fluxo de opções (proxy HIRO)**: delta-fluxo do hedge acumulado.
- Cards de sentimento de opções: **Put/Call ratio, IV média, Skew** (Deribit).

**Cards (Cockpit) — separados por audiência:**
- 🛒 **Varejo e alavancagem**: Fear & Greed, Funding (CEX), Funding onchain, CVD do
  varejo, Long/Short, Liquidações, Delta de OI.
- 🏦 **Institucional e estrutural** (com borda de destaque + selo "Institucional"):
  **Prêmio Coinbase (Institucional × Varejo)**, Saúde DeFi/TVL, Liquidez DEX, Macro.

**Prêmio Coinbase**: `(preço Coinbase − preço Binance)/Binance` — substituiu o antigo
card "Divergência Spot×Perps" (que dependia do volume de perps da Binance, indisponível).

**Atualização:** o front assina **Supabase Realtime** → atualiza sozinho quando um novo
snapshot é gravado (a cada ~5 min). Não é tick-a-tick.

---

## 6. Pagamentos e planos

- Gating de planos **funciona** (via RLS + tabela `plans`).
- **Mas o checkout real não está ligado**: `create-checkout`/`payment-webhook` são
  Mercado Pago e serão reescritos para **Asaas** (adiado pelo dono do projeto).
- **Provável que não haja usuários Pro/Expert reais pagantes ainda** — só a conta de
  teste com acesso total. Isso impacta qualquer feature de "disparar para muitos
  assinantes".

---

## 7. Alertas / entrega — NÃO configurado

- **Resend (e-mail)** e **Evolution API (WhatsApp)**: secrets **não configurados**.
- Função `alerts-dispatch` existe no repo mas **nunca foi deployada** (cron dry-run).
- Ou seja: **qualquer entrega por e-mail/WhatsApp está bloqueada** até o dono fornecer
  as credenciais.

---

## 8. Pendências / lacunas conhecidas

- **Exchange flows on-chain** (netflow de exchanges): sem fonte grátis confiável
  (Blockchair bloqueia). UI honesta de "pendente". Exigiria fonte paga (CryptoQuant/
  Glassnode) ou indexador próprio.
- **Liquidações como heatmap por nível de preço** (estilo CoinGlass): fora.
- **Calendário econômico** (aba Macro): sem fonte grátis estável.
- **`volume_perps` Binance**: indisponível (geo-bloqueio fapi).
- **Histórico curto**: o coletor começou em 14/06/2026; métricas que exigem 30/90 dias
  (ex.: IVP 90d, RV 30d, janelas longas de gráfico) só ficam completas com o tempo.

---

## 9. Reconciliação com o prompt da "Fase 6.2" (Cockpit Report + Volatility Dashboard)

O prompt é uma **proposta nova e boa**, mas foi escrito com premissas que **não batem**
com o estado atual. Pontos a corrigir antes de implementar:

| Prompt assume | Realidade | Ação |
|---|---|---|
| Seções **§8.9 / §8.10** do PRD | **Não existem** (maior é §8.8). Roadmap só prevê "Relatório diário automático (Expert)" | Tratar como feature **nova**; atualizar o PRD se for adotar |
| IA = **Claude** (`claude-analysis`, claude-sonnet-4-6, claude-fable-5) | IA = **Gemini** (`generate-analysis`). claude-analysis é legado | Relatórios devem usar **Gemini** |
| **Resend + Evolution configurados** | **Não estão** | Entrega e-mail/WhatsApp **bloqueada** sem credenciais |
| `sql/005_*`, `sql/006_*` | 005/006 já existem; estamos na **014** | Usar **015+** via MCP |
| `pg_cron` pronto | **Não instalado** (disponível) | Habilitar pg_cron + pg_net |
| `ai_analysis`/`profiles` já com colunas novas | **Não têm** | Criar; tornar `ai_analysis.user_id` nullable p/ broadcast |
| MVP com assinantes reais | Pagamentos (Asaas) **não ligados** → ~0 Pro/Expert | "Disparar para muitos" hoje ≈ 1 usuário (teste) |
| Smart Money: "Blockchair 403" | Na prática 430; segue **sem fonte** | Manter honesto (já está) |

**Viabilidade técnica (se for adotar a Fase 6.2):**

- **Item A (Relatório 2x/dia)** — viável, mas: usar **Gemini**; **entrega** (e-mail/
  WhatsApp) e **cron** dependem de Resend/Evolution. Schema + templates + geração +
  armazenamento + aba "Relatórios" podem ser feitos **agora**; entrega/cron depois.
- **Item B (Volatility Dashboard)** — viável e **sem depender de credenciais externas**:
  - **DVOL** (Deribit `get_volatility_index_data`) e **term structure** (já temos o book) → **imediato**.
  - **IVP 90d / RV 30d / DVOL var-24h** → precisam de **histórico** que ainda não existe
    (coletor novo) → começam acumulando.

**Ordem recomendada:** fazer primeiro o que não depende de terceiros (Item B + o "miolo"
do Item A com Gemini), e ligar a entrega + cron quando Resend/Evolution forem fornecidos.

---

## 10. Perguntas em aberto para decisão

1. Adotar a Fase 6.2 como **feature nova** (e atualizar o PRD), com IA = **Gemini**?
2. Relatórios: **2x/dia (Pro+Expert)** como o prompt, ou **1x/dia (Expert)** como o PRD?
3. Você tem/quer fornecer **Resend** e **Evolution** agora, ou deixamos a entrega para depois?
4. Começar pelo **Item B** (independente) e pelo miolo do **Item A**, deixando entrega/cron como etapa 2?
