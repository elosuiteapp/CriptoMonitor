# Auditoria de lançamento — Módulo B3 (02/jul/2026)

4 agentes de código (cockpit, SmartMoney/Leitura/FII, Macro/IA/Relatórios, gating) +
verificação ao vivo (banco, crons, Fundamentus, edge b3-flow).

> **STATUS (02/jul): CORRIGIDO E DEPLOYADO** — todos os críticos/altos e os médios acionáveis
> aplicados (sql/097 APLICADA; b3-analysis/b3-report/b3-flow/b3-data redeployadas; front na
> Vercel; cron `b3-report-daily` criado). Fix do fluxo validado live (90/90 dias com valores
> negativos parseando; antes todo dia de saída virava null).

**Raiz dos graves:** o B3 nasceu **admin-only** e a sql/078/080 o tornou vendável (mod_b3) —
vários gates ficaram no estado antigo. Mesmo padrão da auditoria do cripto.

## 🔴 CRÍTICOS (experiência do assinante mod_b3) — CORRIGIDOS

**C1. Sem seletor de ticker no header** — `Dashboard.tsx:210/216` era `isAdmin`-only (B3 E
Forex). O pagante não tinha como buscar/trocar papel. → Agora por capacidade (admin OU módulo).

**C2. IA por ativo devolvia 403 sempre** — `b3-analysis` exigia `role='admin'` com o botão
destravado na UI. → Agora admin OU módulo b3, com **cota `ai_daily_limit`** (mesmo pool
usage_log/ai_analysis do cripto, com custo registrado) + `maxOutputTokens` 4096→8192 +
**fallback pro flash também no texto vazio** (o pro devolvia 200 vazio por MAX_TOKENS).

**C3. "Relatório Diário" não era diário** — não existia cron (3 relatórios no mês, último
25/jun) e o botão "Gerar" (admin-only no servidor) ficava exposto ao assinante → 403.
→ Cron `b3-report-daily` seg-sex 21:05 UTC (gera pregão+FIIs); botão só aparece pro admin.

**C4. "Maré global" MUDA pro assinante** — RLS de `macro_global` exigia `plan_is_advanced()`
(capacidade do cripto; mod_b3/mod_forex = false) → painel da aba Macro e eixo da Leitura
sumiam silenciosamente. → Policy: advanced OU módulo b3/forex (sql/097).

## 🟠 ALTOS — CORRIGIDOS

**A1. Fluxo por investidor perdia TODOS os dias de saída** — a fonte usa o menos Unicode −
(U+2212); a edge `b3-flow` não convertia → fluxo negativo virava null e a tendência do
estrangeiro enviesava pra cima (somas tratavam null como 0). → `.replace(/−/g,"-")`;
validado live (90/90 dias ok). O coletor Python já convertia.

**A2. Coletor não escalava "bi"** — `b3_flow.py` gravava "1,2 bi" como 1.2 mi (1000× menor)
na `b3_investor_flow`/newsletter. → ×1000 no `_num`. ⚠️ precisa DEPLOY do coletor no Railway.

## 🟡 MÉDIOS — CORRIGIDOS

- **Selic diária no prompt do b3-report** (IA podia reportar "Selic 0,05%") → anualizada
  (252 d.u.) antes de mandar, rotulada `selic_aa`.
- **Calendário prometia Brasil** e o feed (ForexFactory) não tem BRL → textos honestos
  (só EUA) + nota explicando; pedido `countries:["USD"]`.
- **Dólar "5" no Mercado global** (0 casas) → 2 casas.
- **Proventos do FII anterior piscando** na troca de ticker → reset no efeito.
- **Dados da aba paga Dividendos abertos** — modos `dividends`/`proventos` do `b3-data`
  agora exigem admin OU módulo b3; `b3_investor_flow` com RLS por módulo (era using(true)).
- **`accessibleModules` ignorava o plano** (isolamento de notificações) → por entitlement
  (admin = tudo; senão plan.modules).
- **Badge "preview admin" pro pagante** → "módulo ativo" (verde) pro assinante.
- **brazilFng**: guarda `Number.isFinite` (NaN numa força contaminava o score inteiro).

## ✅ Falsos alarmes verificados ao vivo (NÃO mexer)

- **Payout do FII**: "Dividendo/cota" do Fundamentus É o acumulado 12m (MXRF11 = 1,17 ≈
  12×~0,10) — fórmula e rótulo estavam certos.
- **`resultado.php`**: tem 22 colunas INCLUINDO "Mrg Bruta" — o mapeamento posicional do
  scrape confere hoje (nota de robustez: sem validação de cabeçalho, mudança de layout
  corrompe silencioso; aceito).

## 🔵 Aceitos p/ lançamento (baixos, documentados)

- Beta pareia retornos por posição (não por data) — viés só com pregão faltante.
- Eixo "Renda (DY)" do FII usa limiar absoluto 9% (não compara com CDI; o eixo Selic compensa).
- Payout 100-105% verde ("coberto") — tolerância de ruído.
- Fallback brapi→Yahoo silencioso; rodapé sempre "Yahoo".
- Rotação setorial rotulada "capital girou" mas mede retorno mediano 30d (InfoTip esclarece).
- ADR prêmio/desconto pode misturar horários fora da sobreposição NYSE×B3.
- Macro BR sem competência da série (IPCA/IBC-Br podem ter 1-2m de lag, não indicado).
- F&G BR renormaliza quando uma força falha (nota diz "6 forças").
- Cabeçalhos "admin-only" obsoletos em comentários (raiz do padrão; atualizar oportunisticamente).
- B3 só em PT (decisão conhecida; EN é pendência isolada).

## Pendências operacionais

1. **Deploy do coletor no Railway** (fix do "bi" ×1000) — ação do dono.
2. Confirmar amanhã (~18:10 BRT) o primeiro `b3-report` do cron em `b3_reports`.
