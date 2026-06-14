-- ═══════════════════════════════════════════════════════════════════════════
-- 001_schema.sql — Tabelas de coleta das 10 fontes + agregadora + IA + alertas
-- Crypto Monitor · PRD §5.1
--
-- Convenções:
--   · Timestamps em timestamptz (o coletor normaliza tudo para UTC antes de gravar).
--   · Valores monetários em USD (normalizados no aggregator.py).
--   · `asset` em texto padronizado (BTC/ETH/SOL); novos ativos sem alterar schema.
--   · Toda tabela de série temporal tem UNIQUE para permitir upsert e índice (asset, ts).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. prices_cex — Binance / Coinbase (preço spot + perps, CVD do varejo) ──
create table if not exists public.prices_cex (
  id            bigint generated always as identity primary key,
  asset         text        not null,
  exchange      text        not null,          -- 'binance' | 'coinbase'
  price         numeric,                        -- preço em USD
  volume_spot   numeric,                        -- volume spot (USD)
  volume_perps  numeric,                        -- volume de perpétuos (USD)
  cvd           numeric,                        -- cumulative volume delta
  ts            timestamptz not null default now(),
  unique (asset, exchange, ts)
);
create index if not exists idx_prices_cex_asset_ts on public.prices_cex (asset, ts desc);

-- ─── 2. derivatives — Coinalyze (agregado multi-exchange) ────────────────────
create table if not exists public.derivatives (
  id                bigint generated always as identity primary key,
  asset             text        not null,
  open_interest     numeric,                    -- OI em USD
  funding_rate      numeric,                    -- fração (ex: 0.000125 = 0,0125%)
  long_short_ratio  numeric,
  liq_long_usd      numeric,                    -- liquidações de comprados (USD)
  liq_short_usd     numeric,                    -- liquidações de vendidos (USD)
  cvd               numeric,                    -- CVD agregado (validação do próprio)
  ts                timestamptz not null default now(),
  unique (asset, ts)
);
create index if not exists idx_derivatives_asset_ts on public.derivatives (asset, ts desc);

-- ─── 3. options_oi — Deribit (OI de opções por strike, com gamma e GEX) ──────
create table if not exists public.options_oi (
  id        bigint generated always as identity primary key,
  asset     text        not null,               -- BTC | ETH (SOL sem liquidez)
  strike    numeric     not null,
  type      text        not null check (type in ('call', 'put')),
  oi        numeric,                             -- open interest do contrato
  gamma     numeric,                             -- gamma BS por opção (calculado)
  gex       numeric,                             -- GEX líquido do strike (USD/1%)
  expiry    timestamptz not null,
  ts        timestamptz not null default now(),
  unique (asset, strike, type, expiry, ts)
);
create index if not exists idx_options_oi_asset_ts on public.options_oi (asset, ts desc);

-- ─── 4. gamma_profile — Deribit (resultado do módulo Gamma, PRD §8.5) ────────
create table if not exists public.gamma_profile (
  id                bigint generated always as identity primary key,
  asset             text        not null,        -- BTC | ETH
  zero_gamma_level  numeric,                      -- nível do flip (null = sem cruzamento)
  regime            text        check (regime in ('positive', 'negative')),
  max_pain          numeric,                      -- strike de max pain
  max_pain_expiry   timestamptz,                  -- vencimento usado no max pain
  net_gex_spot      numeric,                      -- GEX líquido no preço atual
  spot_price        numeric,                      -- preço de referência do cálculo
  profile_jsonb     jsonb,                        -- histograma {strike: gex} por strike
  ts                timestamptz not null default now(),
  unique (asset, ts)
);
create index if not exists idx_gamma_profile_asset_ts on public.gamma_profile (asset, ts desc);

-- ─── 5. defi_health — DefiLlama (TVL + fluxo de stablecoins por chain) ───────
create table if not exists public.defi_health (
  id                  bigint generated always as identity primary key,
  chain               text        not null,       -- 'ethereum' | 'solana' | ...
  tvl_usd             numeric,
  stablecoin_flow_24h numeric,
  ts                  timestamptz not null default now(),
  unique (chain, ts)
);
create index if not exists idx_defi_health_chain_ts on public.defi_health (chain, ts desc);

-- ─── 6. sentiment — Alternative.me (Fear & Greed, global) ────────────────────
create table if not exists public.sentiment (
  id              bigint generated always as identity primary key,
  fng_value       int,                            -- 0..100
  classification  text,                            -- 'Greed', 'Fear', ...
  ts              timestamptz not null default now(),
  unique (ts)
);
create index if not exists idx_sentiment_ts on public.sentiment (ts desc);

-- ─── 7. onchain_perps — Hyperliquid (funding + OI perps onchain) ─────────────
create table if not exists public.onchain_perps (
  id            bigint generated always as identity primary key,
  asset         text        not null,
  funding_rate  numeric,
  open_interest numeric,
  mark_price    numeric,
  ts            timestamptz not null default now(),
  unique (asset, ts)
);
create index if not exists idx_onchain_perps_asset_ts on public.onchain_perps (asset, ts desc);

-- ─── 8. macro — CoinGecko (dominância BTC, market cap global) ────────────────
create table if not exists public.macro (
  id            bigint generated always as identity primary key,
  btc_dominance numeric,                          -- %
  total_mcap    numeric,                          -- USD
  ts            timestamptz not null default now(),
  unique (ts)
);
create index if not exists idx_macro_ts on public.macro (ts desc);

-- ─── 9. dex_liquidity — DexScreener (liquidez DEX por par) ───────────────────
create table if not exists public.dex_liquidity (
  id            bigint generated always as identity primary key,
  asset         text        not null,
  pair          text        not null,             -- ex: 'WETH/USDC'
  liquidity_usd numeric,
  volume_24h    numeric,
  ts            timestamptz not null default now(),
  unique (asset, pair, ts)
);
create index if not exists idx_dex_liquidity_asset_ts on public.dex_liquidity (asset, ts desc);

-- ─── 10. news_feed — Cryptocurrency.cv (feed de notícias) ────────────────────
create table if not exists public.news_feed (
  id            bigint generated always as identity primary key,
  title         text        not null,
  source        text,
  url           text,
  assets        text[]      not null default '{}',  -- ativos citados
  published_at  timestamptz not null,
  ts            timestamptz not null default now(),
  unique (url)
);
create index if not exists idx_news_feed_published on public.news_feed (published_at desc);
create index if not exists idx_news_feed_assets on public.news_feed using gin (assets);

-- ─── Agregadora — market_snapshot (visão consolidada que a IA lê) ────────────
create table if not exists public.market_snapshot (
  id        uuid        primary key default gen_random_uuid(),
  asset     text        not null,
  payload   jsonb       not null,                  -- visão consolidada de todas as fontes
  ts        timestamptz not null default now(),
  unique (asset, ts)
);
create index if not exists idx_market_snapshot_asset_ts on public.market_snapshot (asset, ts desc);

-- ─── ai_analysis — análises narrativas geradas pela Claude API ───────────────
create table if not exists public.ai_analysis (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        references auth.users (id) on delete cascade,
  asset         text        not null,
  model_used    text        not null,             -- claude-haiku-4-5 | sonnet | fable
  content       text        not null,
  snapshot_ref  uuid        references public.market_snapshot (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_ai_analysis_user on public.ai_analysis (user_id, created_at desc);
create index if not exists idx_ai_analysis_asset on public.ai_analysis (asset, created_at desc);

-- ─── alerts — regras de alerta por usuário ───────────────────────────────────
create table if not exists public.alerts (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  asset       text        not null,
  metric      text        not null,               -- 'price' | 'funding' | 'gamma_regime' | ...
  condition   jsonb       not null,               -- ex: {"op": ">", "value": 70000}
  channel     text        not null check (channel in ('email', 'whatsapp')),
  active       boolean     not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_alerts_user on public.alerts (user_id);
create index if not exists idx_alerts_active on public.alerts (asset, active) where active;
