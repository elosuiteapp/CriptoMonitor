# Cockpit Report — Relatório Diário (template)

Template do relatório diário por ativo, gerado pela IA (Google Gemini) e exibido na aba
"Relatórios". O prompt-sistema correspondente está **embutido** na Edge Function
`ai/edge-functions/cockpit-report/index.ts` (Deno não lê este arquivo em runtime; este
.md é a fonte versionada/documental da estrutura). O conteúdo é o mesmo para Pro e Expert
— só muda o modelo Gemini.

## Regras (PRD §6.2)
- Proibido recomendar compra/venda.
- Proibido preço-alvo.
- Proibida linguagem de certeza (prefira "tende a", "historicamente", "sugere").
- Usar apenas os dados fornecidos; métrica ausente = "indisponível neste ciclo" (nunca inventar).
- Sempre encerrar com o disclaimer.

## Estrutura obrigatória (markdown)
1. **Resumo das últimas 24h** — mudança de preço, regime de gamma, fluxo (varejo × institucional) e sentimento.
2. **Níveis em destaque** — Call Wall, Put Wall, Zero Gamma, Max Pain, POC e bolsões de liquidez (citar preços quando houver).
3. **Leitura macro** — DXY e correlações 30d, Fear & Greed, dominância BTC.
4. **Cenários** — cenário base + cenário alternativo, de forma **narrativa e não-direcional**
   (ex.: "se mantiver acima de X, o regime amortecido tende a seguir; se perder Y, o regime tende a virar negativo"). Sem alvo de preço.
5. **Eventos relevantes** — notícias do período.
6. **Aviso** — informativo/educacional, não é recomendação nem aconselhamento financeiro; a decisão é do usuário.

## Dados fornecidos ao modelo (placeholders preenchidos na Edge Function)
- `snapshot_atual` — `market_snapshot.payload` mais recente do ativo.
- `snapshot_24h` — snapshot de ~24h atrás (ou o mais antigo disponível se o histórico ainda não cobre 24h).
- `gamma` — do snapshot (regime, Zero Gamma, Max Pain, Call/Put Wall, Put/Call, IV, skew).
- `volatilidade` — `volatility_index` (DVOL, IVP 90d, RV 30d, IV-RV spread, term structure) quando houver.
- `macro` — `macro_assets` + `macro_correlations`.
- `noticias` — `news_feed` das últimas 24h do ativo.
