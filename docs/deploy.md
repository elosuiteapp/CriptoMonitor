# Deploy — Crypto Monitor

Guia para colocar os 4 componentes em produção: **banco (Supabase)**, **coletor
(Python)**, **Edge Functions** e **frontend (Vite)**.

Projeto Supabase: `gshdynwrvabasjiapyap` (região `sa-east-1`).

---

## 1. Banco (Supabase)

As migrations em `sql/` já foram aplicadas (`001`–`005`). Para um ambiente novo,
aplicar em ordem no SQL Editor ou via `supabase db push`.

Confirme em **Authentication → Providers**:
- E-mail/senha habilitado. Para testes sem caixa de entrada, desligue
  temporariamente **"Confirm email"**.
- Google OAuth (opcional): configure client ID/secret.

---

## 2. Coletor (Python) — Railway ou Render

Processo contínuo (worker). O repo já traz `collector/Dockerfile`, `railway.json`
e `render.yaml`.

**Railway:** New Project → Deploy from GitHub repo → seleciona este repo. O
`railway.json` usa `collector/Dockerfile`. Em **Variables**, adicione:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `COINALYZE_API_KEY`,
`COINGECKO_API_KEY`, `ASSETS=BTC,ETH,SOL`, `COLLECT_INTERVAL_MINUTES=5`,
`MACRO_INTERVAL_MINUTES=15`, `LOG_LEVEL=INFO`. Deploy.

**Render:** New → Blueprint → aponta para o repo (lê `render.yaml`) → preenche os
valores `sync:false` em Environment → Apply.

### Rodar localmente (teste)

```bash
cd collector
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python aggregator.py            # ciclo contínuo (5 min)
# ou um ciclo único para teste:
python aggregator.py --once
```

Variáveis (`.env` na raiz): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`COINALYZE_API_KEY`, `COINGECKO_API_KEY`, `ASSETS`, `COLLECT_INTERVAL_MINUTES`,
`MACRO_INTERVAL_MINUTES`, `LOG_LEVEL`.

**Manter vivo:** `systemd`, `pm2 start "python aggregator.py" --name collector`,
ou o process manager da plataforma. Critério de saúde: ≥ 9/10 fontes OK por ciclo
e `market_snapshot` populando.

---

## 3. Edge Functions

Deploy (CLI) ou via painel. JWT conforme a função:

```bash
supabase functions deploy generate-analysis               # verify_jwt = true (IA: Gemini)
supabase functions deploy create-checkout                 # verify_jwt = true
supabase functions deploy payment-webhook --no-verify-jwt # valida por assinatura HMAC
supabase functions deploy alerts-dispatch                 # invocada por cron
```

### Secrets (Project Settings → Edge Functions → Secrets)

| Função | Secrets |
|---|---|
| `generate-analysis` | `GEMINI_API_KEY` (provedor de IA: Google Gemini) |
| `create-checkout` | `MERCADOPAGO_ACCESS_TOKEN`, `APP_URL` (URL pública do frontend) |
| `payment-webhook` | `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` |
| `alerts-dispatch` | `RESEND_API_KEY`, `ALERTS_FROM_EMAIL`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `ALERTS_DRY_RUN` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são injetados
automaticamente nas funções.

### Cron (alertas + relatório diário do Expert)

Via `pg_cron` chamando a função, ou Supabase Scheduled Functions, ou cron externo:

```sql
-- exemplo pg_cron: avalia alertas a cada 5 min
select cron.schedule('alerts', '*/5 * * * *', $$
  select net.http_post(
    url    := 'https://gshdynwrvabasjiapyap.functions.supabase.co/alerts-dispatch',
    headers:= jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
  );
$$);
```

**Relatório diário do Expert (PRD §6, Fase 4):** um cron diário que, para cada
usuário Expert, invoca `claude-analysis` por ativo e envia por e-mail (reusa o
helper de envio de `alerts-dispatch`). Estrutura pronta; agendar quando ativar.

### Webhook do Mercado Pago

No painel do MP, aponte o webhook de pagamentos para:
`https://gshdynwrvabasjiapyap.functions.supabase.co/payment-webhook`
O checkout deve enviar `external_reference = user_id` e `metadata.plan_slug`.

---

## 4. Frontend (Vite)

Host estático (Vercel, Netlify, Cloudflare Pages):

```bash
cd web
npm install
npm run build      # gera web/dist
```

Variáveis de ambiente do host: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
(Em dev, o Vite lê o `.env` da raiz via `envDir: ".."`.)

---

## 5. Checklist de credenciais para produção

- [ ] `SUPABASE_SERVICE_ROLE_KEY` (coletor + functions)
- [ ] `COINALYZE_API_KEY` (9ª fonte de dados)
- [ ] `COINGECKO_API_KEY` (evita rate limit do macro)
- [ ] `GEMINI_API_KEY` (análise de IA — Google Gemini; secret da função `generate-analysis`)
- [ ] `MERCADOPAGO_ACCESS_TOKEN` + `MERCADOPAGO_WEBHOOK_SECRET` (pagamentos)
- [ ] `RESEND_API_KEY` + `ALERTS_FROM_EMAIL` (alertas por e-mail)
- [ ] `EVOLUTION_API_URL` + `EVOLUTION_API_KEY` + `EVOLUTION_INSTANCE` (WhatsApp)

## 6. Pendências conhecidas (pós-MVP)

- **Fonte de notícias** (Cryptocurrency.cv) parqueada — definir endpoint real e
  reincluir em `collector/sources/__init__.py`.
- **Camada de Liquidações no gráfico** — requer heatmap com nível de preço
  (CoinGlass, fonte secundária do §3). As demais camadas estão prontas.
