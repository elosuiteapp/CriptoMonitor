# Auditoria de lançamento — Módulo Cripto (02/jul/2026)

> **STATUS (02/jul, fim do dia): CORRIGIDO E DEPLOYADO** — C1/C2/A1/A2/A3/A4 + M1-M9 aplicados
> (sql/095+096, market-read/alerts-dispatch/generate-analysis redeployadas, front na Vercel).
> **Correção do próprio relatório:** o C3 (vitrine Free sem snapshot) era **FALSO POSITIVO** —
> o front tem caminho próprio pro Free (`useSnapshot.loadBasic` monta payload de `prices_cex`+
> `sentiment`+`gamma_profile`, tudo acessível ao Free); o bloqueio do snapshot é por desenho.
> Verificado impersonando usuário Free real: prices_cex 18 linhas/30min ✓, sentiment ✓, CVD no
> PriceRow ✓. Ficam pendentes (aceitos p/ lançamento): baixos de performance (RAF 60fps),
> medidor de paredes vs canvas, fórmula do tooltip do book heatmap, auth no crypto-onchain,
> cosméticos de gamma (paredes sem sinal/Max Pain igualdade exata), fallback de watchlist.

Auditoria completa pré-lançamento: 5 agentes de código (cockpit, Smart Money/gamma,
Leitura/alertas, Macro/IA/i18n, gating/planos) + verificação ao vivo de dados/RLS no banco
(impersonando usuário Free real, testes anon via REST, advisors).

**Contexto-raiz de vários achados:** a migração pra cobrança por módulo (sql/078) criou os
planos vendidos hoje (`mod_crypto`, `complete`), mas vários gates ficaram presos nos slugs
legados (`expert`/`pro`) ou não acompanharam (RLS, canais de alerta, audiência de notificação).

---

## 🔴 CRÍTICOS (bloqueiam lançamento)

**C1. Alertas 100% inoperantes nos planos vendidos.** `plans.alert_channels` de
`mod_crypto`/`complete` = `['email','whatsapp']` **sem `'inapp'`** (sql/078), mas
`AlertsDrawer.tsx:221` insere sempre `channel:"inapp"` e a RLS `alerts_insert` (sql/003)
exige canal do plano → todo INSERT de alerta de assinante pagante é rejeitado. É o mesmo bug
que a sql/035 corrigiu pra pro/expert, reintroduzido pela 078. CONFIRMADO no banco.
*Fix: UPDATE plans adicionando 'inapp' aos dois planos (+ corrigir sql/078 no repo).*

**C2. Alertas de "mudança de leitura" nunca chegam a quem compra hoje.**
`market-read/index.ts:350-352` filtra destinatários por `slug === "expert"` (legado; só 1
assinatura ativa). `mod_crypto`/`complete` têm `smart_money=true`, veem a aba, mas recebem
zero alertas. *Fix: elegibilidade por `plan.smart_money` (ou modules contém crypto), não slug.*

**C3. Vitrine Free quebrada (cockpit meio vazio pra cadastro novo).** A policy de
`market_snapshot` exige `plan_is_advanced()`; a sql/053 abriu `gamma_profile` e
`orderbook_imbalance` (varejo) pro Free mas esqueceu o snapshot → Free tem payload NULO:
cards de funding/derivativos/sentimento/direção do capital vazios e a camada **CVD prometida
na vitrine** sem dado. CONFIRMADO impersonando usuário Free (gamma 72 linhas ✓, imbalance 48 ✓,
snapshot 0 ✗). *Fix: carve-out na policy (asset ∈ plan_assets() AND plan_has_layer('cvd')).*

## 🟠 ALTOS

**A1. Bypass de paywall na IA cripto.** `generate-analysis` valida `plan.assets` + cota, mas
não `plan.modules` — assinante só-B3/só-Forex (BTC de vitrine, cota 10/dia) gera análise
cripto direto no endpoint. *Fix: exigir 'crypto' em plan_modules() na função.*

**A2. Módulo cripto sem ErrorBoundary.** B3Module/ForexModule têm; o cockpit cripto
(Dashboard/Chart/GammaPanel…) não — qualquer throw de render = tela branca total.
*Fix: embrulhar o módulo crypto no mesmo ErrorBoundary.*

**A3. Histórico da Leitura bloqueado pros planos vendidos.** `market_read` RLS =
`current_plan_slug()='expert'` (sql/049) → sparkline `biasHist` vazio pra mod_crypto/complete.
*Fix: policy por smart_money/modules.*

**A4. Rótulo premium/discount enganoso no Smart Money.** `SmartMoneyTab.tsx:759` +
`smcNarrative.ts:137-143` classificam por bandas 95%/5% → preço a 70% do range vira
"Equilíbrio (meio do range)", contradizendo o medidor ao lado e o glossário.
*Fix: classificar por equilibrium.top/bottom (47,5–52,5%).*

## 🟡 MÉDIOS

**M1. Notificações do servidor 100% em PT pra usuário EN.** `market-read:421` (título/corpo +
`regime_label` PT), `alerts-dispatch:29-78,135-144` (labels, describe(), e-mail HTML).
Sino/toast/push/e-mail em PT pra quem usa o app em EN.
**M2. Opt-in de e-mail de alerta invisível pros planos vendidos.** `AlertsDrawer.tsx:124,151-159`
só mostra pra `slug==='expert'`; mod_crypto/complete têm canal email mas não conseguem ativar.
**M3. Vazamento além da vitrine no gamma_profile.** Policy do preview (sql/053) libera a LINHA
inteira → Free lê `put_call_ratio/avg_iv/iv_skew` (card Expert) do BTC via REST.
**M4. Calendário econômico promete JP/EUR/CN e só busca EUA.** `MacroTab.tsx:312,458` chama
`econ-calendar` sem `countries` (default USD-only); rodapé afirma multi-país.
**M5. Aba Relatórios enganosa em 17/20 moedas.** Cron gera só BTC/ETH/SOL; nas demais mostra
"em breve os relatórios diários aparecem aqui" (nunca chegam) e o botão de gerar (Expert
legado) devolve 400 "ativo invalido".
**M6. Payload da moeda anterior persiste ao trocar de ativo.** `useSnapshot` não zera payload
na troca; `PriceHeader` não reseta change24h → ~1s de dados do BTC sob o header "SOL".
**M7. Funding on-chain (Hyperliquid, HORÁRIO) lido com limiares de 8h.** `Dashboard.tsx:395` +
`format.ts:72-85` — card quase nunca sinaliza e o glossário não avisa a diferença de período.
**M8. Deriva de migração: colunas `module` de notifications/alerts não existem em sql/.**
Existem no banco (aplicadas fora do repo); provisionamento limpo a partir de sql/ quebraria
o sino e o alerts-dispatch. *Fix: migração retroativa no repo.*
**M9. Tooltip do heatmap de liquidação hardcoded PT** (`liquidationHeatmap.ts:175-177`).

## 🔵 BAIXOS

- 3 loops requestAnimationFrame contínuos a 60fps com camadas ligadas (CPU/bateria) — Chart.tsx:459,621,816
- Medidor "paredes fortes" (close do candle) × barras do canvas (preço vivo) podem discordar — Chart.tsx:100 vs 738
- Tooltip do book heatmap: fórmula de bin diferente do preenchimento (célula vizinha) — Chart.tsx:639 vs bookDepthGrid.ts:73
- useWatchlist otimista sem rollback em erro de escrita — useWatchlist.ts:35-50
- /analysis sem guarda de módulo no front; Free recebe "volte amanhã" com cota permanente 0 — Analysis.tsx:93
- Notícias no prompt da IA sem filtro de idioma (manchete PT em análise EN) — generate-analysis:168
- OnchainPanel.tsx:82 com toLocaleString("pt-BR") fixo
- Edge crypto-onchain sem auth/plano (dado público, mas feature é Pro+ na UI)
- GammaProfileLine: put/call wall sem checar sinal do GEX (book fino) — :50-51
- GammaOiProfile: destaque Max Pain por igualdade exata de strike — :95
- IndicatorsTab.tsx:345: key React duplicada no mapa de liquidez
- market-read: fallback de watchlist não cobre favoritos fora da lista cripto; copy "virou" dispara também na entrada de neutro
- Advisors (higiene): search_path em bot_pnl_summary; pg_net no schema public

## ✅ Auditado e LIMPO (não mexer)

- **Unidades de funding**: corretas em TODAS as superfícies (CEX percent ÷100, on-chain fração, Binance fapi ×100 no SMT) — zero erro de 100×.
- **Vazamento externo**: anon recebe vazio em todas as tabelas/RPCs; RLS por ativo segura em todas as tabelas pagas; RPCs admin com is_admin() interno; spoof de isAdmin no client não abre dado.
- **Motor da Leitura front × servidor**: EM SINCRONIA (pesos .22/.18/.18/.25/.12/.10 idênticos, mesmas 6 forças, mesma fonte de candles).
- **Dados ao vivo**: snapshot 4-5min/20 moedas, depth 1min, walls/liquidations ok, notícias PT+EN frescas, funding/OI/F&G presentes; coletor grava as 3 corretoras com ts idêntico.
- **i18n do módulo**: paridade PT/EN forçada por tipo; fusos do calendário corretos; correlações 30d/90d corretas.
- **Races do gráfico** (troca de ativo/TF), cleanup de subscriptions, canais realtime únicos, degradação sem gamma/ETF/Coinbase, VAPID ausente degrada bem, heatmap "estimativa" honesto.

## Ordem de correção sugerida

1. **C1+C2+A3+M2** (mesmo tema: gates presos no slug legado) — 1 UPDATE de plans + market-read por smart_money + policy do market_read + AlertsDrawer.
2. **C3+M3** (RLS da vitrine Free) — carve-out do snapshot + restringir colunas do gamma preview (view ou policy).
3. **A1** (modules na generate-analysis) e **A2** (ErrorBoundary).
4. **A4, M1, M4-M9** em lote.
5. Baixos: oportunisticamente.
