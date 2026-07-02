-- 094 — VETO DE FLUXO com limiar REALISTA (dados 02/jul/2026).
-- Diagnóstico: o veto era fixo em ±50, mas o |flowTilt| MÁXIMO já registrado foi 28 →
-- o veto NUNCA disparou (a camada de confluência estava decorativa nas entradas).
-- Nos 30 trades reais: fluxo A FAVOR na entrada = 64% win (+707 USDT); fluxo CONTRA
-- (mesmo leve, −5..−24) = 19% win (−150) — 13 de 15 perderam.
-- flow_veto = força mínima do fluxo CONTRA a direção p/ segurar o setup estrutural
-- (setups de imbalance continuam ignorando o veto, como no desenho original). Default 10.
alter table public.bot_config add column if not exists flow_veto numeric not null default 10;
-- bot_set_config atualizado (flow_veto no whitelist) — corpo completo na migration aplicada
-- via MCP (bot_flow_veto_threshold_094); igual ao sql/092 + linha flow_veto.
