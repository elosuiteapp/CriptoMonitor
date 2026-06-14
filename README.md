# Crypto Monitor

**Cockpit de decisões para traders de criptomoedas.** Plataforma SaaS que agrega
dados de 10 fontes públicas gratuitas (preço, fluxo, liquidez, opções, sentimento e
notícias), armazena tudo de forma estruturada no Supabase e usa a Claude API para
transformar números crus em análises narrativas em português — **sem nunca emitir
recomendações de compra ou venda**.

> A especificação completa e a fonte da verdade do produto é o [`PRD.md`](./PRD.md).
> Este README é apenas um mapa rápido do repositório.

## O que o produto é (e não é)

- ✅ Monitoramento + análise técnica de BTC, ETH e SOL (no MVP).
- ✅ Camada de interpretação por IA + alertas via e-mail e WhatsApp.
- ❌ Não é robô de trade, não emite sinais, não custodia ativos, não dá conselho
  financeiro (disclaimer obrigatório em toda tela de análise).

## Arquitetura (resumo)

```
[10 fontes externas]  →  [Coletor Python + APScheduler (ciclo 5 min)]
                              │  JSON normalizado + upsert
                              ▼
                      [Supabase / PostgreSQL]  ── Auth · RLS · Realtime · Edge Functions
                              │
                              ├──▶ [Camada de IA — Claude API]  → grava em `ai_analysis`
                              ▼
                      [Dashboard Vite + React]  ── Supabase Realtime
                              └──▶ [Alertas]  → e-mail (Pro) · WhatsApp (Expert)
```

## Estrutura do repositório

```
crypto-monitor/
├── PRD.md            # especificação do produto (fonte da verdade)
├── collector/        # coletor Python das 10 fontes + módulo Gamma
├── sql/              # migrations: schema, auth/planos, RLS
├── ai/               # prompts + Edge Functions (Claude API)
├── web/              # dashboard Vite + React + TypeScript
└── docs/             # notas de deploy
```

## Stack

| Camada | Tecnologia |
|---|---|
| Coleta | Python 3.12 · CCXT · httpx · APScheduler · NumPy · supabase-py |
| Banco/Auth | Supabase (PostgreSQL) — Auth, RLS, Realtime, Edge Functions |
| IA | Anthropic SDK — `claude-haiku-4-5` / `claude-sonnet-4-6` / `claude-fable-5` |
| Frontend | Vite · React · TypeScript · Tailwind · Lightweight Charts |
| Pagamentos | Mercado Pago (PIX + cartão) |
| Alertas | Resend (e-mail) · Evolution API (WhatsApp) |

## Convenções

- **Idioma:** comentários, logs e textos de UI em **português**; código (variáveis,
  funções, tabelas, colunas) em **inglês**.
- **Sem dados sintéticos:** fonte que falha exibe "indisponível", nunca mock.
- **Coletor burro, IA inteligente:** o coletor só coleta, normaliza e grava; toda
  interpretação acontece na camada de IA.

## Como rodar (será detalhado por fase)

1. Copie `.env.example` para `.env` e preencha as credenciais.
2. Aplique as migrations de `sql/` no Supabase.
3. Coletor: `pip install -r collector/requirements.txt` → `python collector/aggregator.py`.
4. Frontend: `cd web && npm install && npm run dev`.

Detalhes de deploy do coletor e das Edge Functions em [`docs/deploy.md`](./docs/deploy.md).
