# Prompt de bootstrap — Crypto Monitor

> Cole este prompt no Claude Code (extensão do VS Code) dentro de uma pasta vazia chamada `crypto-monitor`. O PRD.md de referência deve estar na raiz dessa pasta antes de executar.

---

Você vai construir o MVP completo da plataforma **Crypto Monitor** — um cockpit de decisões para traders de criptomoedas que agrega dados de 10 fontes públicas gratuitas, armazena no Supabase e usa Claude API para gerar análises narrativas. O projeto está integralmente especificado no arquivo `PRD.md` na raiz desta pasta. **Leia-o por inteiro antes de qualquer ação** — ele é a fonte da verdade; este prompt é apenas o plano de execução.

## Regras de trabalho

1. **Antes de começar**, leia `PRD.md` completo e me apresente um plano de execução em etapas curtas, esperando minha aprovação antes de criar arquivos.
2. **Trabalhe em fases.** Não tente fazer tudo de uma vez. Ao fim de cada fase, pare, me mostre o resultado e espere "ok para a próxima".
3. **Commit por fase.** Ao concluir cada fase, faça um commit git com mensagem descritiva (`feat: fase 1 — pipeline de coleta`).
4. **Nunca invente credenciais.** Onde precisar de chaves de API, use placeholders no `.env.example` e me peça os valores reais quando for a hora.
5. **Código pronto para produção, não rascunho.** Tratamento de erros, logging estruturado, type hints no Python, TypeScript no frontend, testes para a lógica crítica (especialmente o módulo Gamma).
6. **Idioma:** comentários, mensagens de log e textos de UI em **português brasileiro**. Nomes de variáveis, funções, tabelas e colunas em **inglês**.
7. **Sem dados sintéticos.** Se uma fonte falhar, o card mostra "indisponível" — nunca preencher com mock.

## Stack obrigatória (do PRD)

- **Coletor:** Python 3.12 + CCXT + httpx + APScheduler + NumPy + python-dotenv + supabase-py
- **Banco:** Supabase (PostgreSQL) — Auth, RLS, Realtime, Edge Functions
- **Frontend:** Vite + React + TypeScript + Tailwind + **Lightweight Charts** (TradingView)
- **IA:** Anthropic SDK — modelos `claude-haiku-4-5` (Free), `claude-sonnet-4-6` (Pro), `claude-fable-5` (Expert)
- **Pagamentos:** Mercado Pago (PIX + cartão) — apenas no esqueleto na Fase 5

## Estrutura de pastas a criar

```
crypto-monitor/
├── PRD.md                          (já existe)
├── README.md
├── .gitignore
├── .env.example
├── collector/
│   ├── requirements.txt
│   ├── aggregator.py               # orquestrador APScheduler
│   ├── test_sources.py             # smoke test das 10 fontes
│   ├── sources/
│   │   ├── __init__.py
│   │   ├── base.py                 # classe abstrata BaseSource
│   │   ├── binance.py
│   │   ├── coinbase.py
│   │   ├── coinalyze.py
│   │   ├── deribit.py              # inclui módulo gamma — ver seção dedicada abaixo
│   │   ├── defillama.py
│   │   ├── alternative_me.py
│   │   ├── hyperliquid.py
│   │   ├── coingecko.py
│   │   ├── dexscreener.py
│   │   └── cryptocurrency_cv.py
│   ├── lib/
│   │   ├── supabase_client.py
│   │   ├── gamma.py                # cálculo BS + Zero Gamma (NumPy vetorizado)
│   │   └── logger.py
│   └── tests/
│       └── test_gamma.py           # testa cálculo de gamma e flip
├── sql/
│   ├── 001_schema.sql              # tabelas das 10 fontes + market_snapshot + gamma_profile
│   ├── 002_auth_plans.sql          # profiles, plans, subscriptions, usage_log
│   └── 003_rls_policies.sql        # gating por plano
├── ai/
│   ├── prompts/
│   │   ├── system_prompt.md        # regras do PRD §6.2
│   │   └── analysis_template.md    # estrutura: macro → fluxo → liquidez → síntese
│   └── edge-functions/
│       └── claude-analysis/index.ts   # Deno — Supabase Edge Function
├── web/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── lib/
│       │   ├── supabase.ts
│       │   └── format.ts           # traduções "número cru → leitura"
│       ├── pages/
│       │   ├── Login.tsx
│       │   ├── Dashboard.tsx
│       │   ├── Pricing.tsx
│       │   └── Analysis.tsx
│       ├── components/
│       │   ├── PriceHeader.tsx
│       │   ├── Chart.tsx           # Lightweight Charts + camadas
│       │   ├── ChartTypeSelector.tsx   # candles | barras | linha | área
│       │   ├── LayerToggles.tsx    # GEX | Zero Gamma | Liquidações | Funding | CVD
│       │   ├── GammaPanel.tsx      # regime + flip + max pain + histograma
│       │   ├── MetricCard.tsx      # card com semáforo + tradução
│       │   ├── LockedCard.tsx      # vitrine de upgrade
│       │   └── AIAnalysisButton.tsx
│       └── hooks/
│           ├── useAuth.ts
│           ├── useSnapshot.ts
│           └── usePlan.ts
└── docs/
    └── deploy.md                   # como subir coletor + Edge Functions
```

## Execução por fases

### Fase 0 — Setup (10 min)
- Criar a estrutura de pastas acima.
- `README.md` curto explicando o projeto e referenciando o PRD.
- `.gitignore` para Python e Node.
- `.env.example` com todas as variáveis (Supabase URL, service_role key, anon key, Coinalyze, CoinGecko, Anthropic, Mercado Pago — placeholders).
- `git init` + primeiro commit.

**Pare. Me mostre a árvore e espere ok.**

### Fase 1 — Schema SQL (PRD §5)
- `sql/001_schema.sql`: tabelas `prices_cex`, `derivatives` (Coinalyze: OI, funding, long/short, liq long/short, CVD), `options_oi` (com `gamma` e `expiry`), `gamma_profile` (zero_gamma_level, regime, max_pain, max_pain_expiry, profile_jsonb), `defi_health`, `sentiment`, `onchain_perps`, `macro`, `dex_liquidity`, `news_feed`, `market_snapshot` (JSONB agregador), `ai_analysis`, `alerts`.
- Índices em `(asset, ts)` em todas as tabelas de séries temporais.
- `sql/002_auth_plans.sql`: `plans` (com limites parametrizados — não hardcoded no código), `profiles`, `subscriptions`, `usage_log`. Trigger para criar `profile` em `on_auth_user_created`.
- `sql/003_rls_policies.sql`: policies exatamente como na tabela de gating do PRD §5.3. Inclua a policy que filtra snapshots de 30 min para Free.

**Pare. Me mostre os 3 arquivos. Vou rodar manualmente no SQL Editor do Supabase.**

### Fase 2 — Coletor Python (PRD §3 + §8.5)
- `collector/lib/gamma.py`: implementação **vetorizada com NumPy** seguindo o PRD §8.5 v1.4 — `get_book_summary_by_currency` (1 chamada/ativo), filtros (T ≥ 1 dia, OI > 0, IV presente), fórmula fechada de gamma BS, GEX líquido por strike, grade de 60 spots para Zero Gamma com interpolação, Max Pain do vencimento mais próximo.
- `collector/tests/test_gamma.py`: testes unitários — gamma de uma call ATM bate com referência conhecida, Zero Gamma de cenário sintético cai onde esperado, max pain de um book artificial está correto.
- Cada `sources/*.py` herda de `BaseSource` com método `collect() → dict normalizado`. Timestamps UTC, valores em USD, símbolos padronizados (BTC/ETH/SOL).
- `aggregator.py`: APScheduler ciclo de 5 min, executa todas as fontes em paralelo (asyncio + httpx), trata falhas individuais sem derrubar o ciclo, faz `upsert` no Supabase, recalcula `market_snapshot` ao fim.
- `test_sources.py`: roda cada fonte uma vez e imprime status/latência/amostra.

**Pare. Rode `python collector/test_sources.py` e me mostre a saída. Só passamos para a Fase 3 quando as 10 fontes responderem OK.**

### Fase 3 — Dashboard React (PRD §8)
- Vite + React + TS + Tailwind + Lightweight Charts.
- Login/cadastro via Supabase Auth (e-mail + senha; Google opcional).
- `Dashboard.tsx`: cabeçalho de preço, gráfico, painel Gamma (só BTC/ETH), grade de `MetricCard` para Pro+ e `LockedCard` para Free.
- `Chart.tsx`: Lightweight Charts com seletor de tipo (CandlestickSeries | BarSeries | LineSeries | AreaSeries) e camadas via `createPriceLine` para Call Wall, Put Wall, Zero Gamma e bolsões de liquidações. Faixa de funding como série secundária; CVD como sub-painel opcional.
- `GammaPanel.tsx`: 3 cards (regime / flip / max pain) + histograma SVG por strike, exatamente como o mockup que combinamos.
- `format.ts`: funções de tradução para cada métrica conforme tabela do PRD §8.2 (funding rate → leitura em português, CVD → leitura, etc).
- Realtime do Supabase para receber novos snapshots sem polling.
- `usePlan()` lê do banco e gate dos componentes acontece no frontend (dados já filtrados por RLS).

**Pare. Me mostre o dashboard rodando local com dados reais do Supabase.**

### Fase 4 — Camada de IA (PRD §6)
- `ai/edge-functions/claude-analysis/index.ts` (Deno): valida JWT do Supabase, lê plano e cota em `usage_log`, carrega `market_snapshot` mais recente + últimas 5 notícias, monta o prompt com o template `analysis_template.md` (estrutura: macro → fluxo → liquidez → síntese → disclaimer), escolhe o modelo Anthropic conforme plano, grava em `ai_analysis` e retorna.
- Frontend: botão "O que está acontecendo?" no header e tela `Analysis.tsx` renderizando a resposta com markdown.
- Contador "análise X de Y hoje" sempre visível.

**Pare. Demonstração: usuário Free → 1 análise/dia com Haiku; Pro → Sonnet com cota 10; Expert → Fable 5 ilimitado.**

### Fase 5 — Pagamentos e alertas (esqueleto)
- Edge Function `payment-webhook`: recebe webhook do Mercado Pago, valida assinatura, atualiza `subscriptions`.
- Página `Pricing.tsx` com a tabela de planos exata do PRD §7.
- Esqueleto do envio de alertas — e-mail via Resend (Pro) e WhatsApp via Evolution API (Expert). Sem disparar em produção ainda; apenas a estrutura.
- Tarefa cron diária para o relatório do Expert.

**Pare. Documente o que falta para produção em `docs/deploy.md`.**

---

## Quando terminar tudo

Me mostre:
1. `git log --oneline` com 5 commits (um por fase).
2. Saída do `test_sources.py` com as 10 fontes OK.
3. Saída dos testes do gamma.
4. Print do dashboard rodando com dados reais para BTC.
5. Print de uma análise de IA gerada para BTC.
6. Lista de itens pendentes para produção (do `docs/deploy.md`).

Comece lendo o `PRD.md` agora e me apresentando o plano da Fase 0.
