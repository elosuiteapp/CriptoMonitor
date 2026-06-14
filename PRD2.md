# PRD — Plataforma de Monitoramento e Análise Técnica de Criptomoedas

**Versão:** 1.5 · **Data:** Junho/2026 · **Autor:** Marcos (Back Hub Soluções Digitais)
**Status:** Aprovado para desenvolvimento (MVP)

> **Changelog v1.5:** Adicionada seção 8.6 — Inventário obrigatório de cards do dashboard, com mapeamento 1-para-1 entre cada fonte de dados e o card que ela alimenta na UI. Inclui o novo card de **Divergência Spot vs. Perps** (Coinbase × Binance) e o **bloco de notícias** (Cryptocurrency.cv) como elementos visuais explícitos. Critério de "pronto" da Fase 3 passa a exigir todos os cards renderizados, não apenas a coleta funcional. Evita o descompasso entre o backend coletar e o frontend não exibir.
>
> **Changelog v1.4:** Método de cálculo do módulo Gamma especificado em detalhe (seção 8.5): endpoint `get_book_summary_by_currency` (1 chamada por ativo), fórmula fechada de gamma BS alimentada pela `mark_iv` da Deribit, grade de 60 spots hipotéticos para reconstruir a curva GEX(S) e obter o Zero Gamma por interpolação. Decisão 12 corrigida. Risco da coleta de tickers eliminado.
>
> **Changelog v1.3:** Adicionado módulo Gamma estilo SpotGamma (seção 8.5): regime de gamma, Zero Gamma/flip, perfil por strike e Max Pain — calculados com greeks gratuitos da Deribit. Nova camada "Zero Gamma" no gráfico. Tipos de visualização do gráfico adicionados (candles, barras OHLC, linha, área). GEX restrito a BTC e ETH (liquidez de opções de SOL insuficiente).
>
> **Changelog v1.2:** Posicionamento evoluído para "cockpit de decisões do trader". Adicionada seção 8.4 — Gráfico com camadas (Lightweight Charts + níveis de liquidez/opções plotados sobre os candles). Camadas do gráfico incluídas no gating por plano. Stack e decisões atualizadas.
>
> **Changelog v1.1:** Coinalyze substitui CoinGlass como fonte primária de derivativos (liquidações, OI, funding, long/short ratio, CVD agregado). CoinGlass rebaixado a fonte opcional/secundária. Adicionada seção 8 — Princípios de UX do Dashboard. Risco do free tier do CoinGlass eliminado.

---

## 1. Visão do Produto

Plataforma SaaS de monitoramento e análise técnica de criptoativos (BTC, ETH e SOL no MVP) que agrega dados de 10 fontes públicas gratuitas, armazena tudo de forma estruturada e usa IA (Claude API) para transformar números crus em análises narrativas contextualizadas — sem emitir recomendações de compra ou venda.

O diferencial não é coletar dados (qualquer agregador faz isso), e sim a **camada de interpretação por IA** combinada com **alertas via WhatsApp** — um canal que concorrentes internacionais (CoinGlass, Coinalyze) não oferecem ao público brasileiro.

### 1.1 O que o produto NÃO é

- Não é robô de trade nem emite sinais de compra/venda.
- Não é corretora nem custodia ativos.
- Não oferece aconselhamento financeiro (disclaimer obrigatório em todas as telas de análise).

### 1.2 Posicionamento

**"O cockpit de decisões do trader."** Como o painel de um avião: todos os instrumentos numa tela só — preço, fluxo, liquidez, opções, sentimento e notícias — com leituras traduzidas e a IA como copiloto que narra o cenário. Quem decide é sempre o piloto: a plataforma entrega visão completa do mercado, nunca o comando de compra ou venda.

Concorrentes mostram gráficos; a plataforma entrega o contexto: quem está comprando (varejo vs. instituição), onde está a liquidez (alvos magnéticos), o que as opções protegem (tetos e pisos) e qual o sentimento macro — tudo interpretado em português claro e visível sobre o próprio gráfico.

---

## 2. Público-Alvo e Personas

| Persona | Perfil | Dor | Plano natural |
|---|---|---|---|
| **Curioso** | Acompanha cripto casualmente, segue influencers | Não entende os termos técnicos (funding, OI, GEX) | Free |
| **Trader individual** | Opera swing/day trade em BTC/ETH/SOL | Paga 3-4 ferramentas gringas em dólar para ter visão completa | Pro |
| **Trader profissional** | Opera diariamente, precisa de velocidade | Perde movimentos por não estar na frente da tela | Expert |

---

## 3. Fontes de Dados (10 fontes — todas gratuitas)

| # | Fonte | Dado extraído | Uso no sistema | Acesso |
|---|---|---|---|---|
| 1 | **Binance** | Preço real-time + volume perps | CVD do varejo (massa alavancada) | CCXT / WebSocket, sem chave |
| 2 | **Coinbase** | Volume spot | Proxy institucional; divergência spot vs. perps | CCXT / WebSocket, sem chave |
| 3 | **Coinalyze** | Liquidações, OI, funding rate, long/short ratio e CVD — **agregados de múltiplas exchanges** | Alvos de liquidez + posicionamento dos alavancados + validação do CVD próprio | REST, chave gratuita, 40 calls/min |
| 4 | **Deribit** | OI de opções (calls/puts) | GEX — Call Walls e Put Walls | REST público, sem chave |
| 5 | **DefiLlama** | TVL + fluxo de stablecoins | Saúde de rede ETH/SOL | REST, sem chave |
| 6 | **Alternative.me** | Fear & Greed Index | Termômetro de sentimento macro | REST, sem chave |
| 7 | **Hyperliquid** | Funding rate horário + OI perps onchain | Comparação CEX (varejo) vs. DEX onchain | REST público, sem chave |
| 8 | **CoinGecko** | Dominância BTC, market cap global, OHLCV | Contexto macro do mercado | REST, chave Demo gratuita (10k calls/mês, 30 req/min) |
| 9 | **DexScreener** | Liquidez DEX em tempo real (ETH/SOL) | Liquidez onchain por par | REST, sem chave (300 req/min) |
| 10 | **Cryptocurrency.cv** | Feed de notícias (BTC, ETH, DeFi, SOL) | Contexto de eventos para a análise de IA | REST JSON, sem chave, open source |

**Regra de arquitetura:** o coletor apenas coleta, formata e grava. Toda interpretação acontece na camada de IA.

**Fonte secundária (opcional):** CoinGlass permanece mapeado como fallback caso o heatmap visual de liquidações agregue valor além do que o Coinalyze entrega. Não faz parte do ciclo de coleta do MVP.

**Orçamento de chamadas Coinalyze:** ciclo de 5 min com 3 ativos × 4 métricas ≈ 12 calls/ciclo — bem abaixo do limite de 40 calls/min.

---

## 4. Arquitetura Técnica

```
[10 fontes externas]
        │  REST / WebSocket / CCXT
        ▼
[Python Aggregator]  ── APScheduler (ciclo de 5 min)
        │  JSON estruturado + upsert
        ▼
[Supabase / PostgreSQL]  ── Auth · RLS · Realtime · Edge Functions
        │
        ├──▶ [Camada de IA — Claude API]  → grava análises em `ai_analysis`
        │
        ▼
[Dashboard Web — Vite + React]  ── Supabase Realtime (sem polling)
        │
        └──▶ [Alertas]  → e-mail (Pro) · WhatsApp via Evolution API (Expert)
```

### 4.1 Stack

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Coleta | Python 3.12 + CCXT + APScheduler | Padrão de mercado, libs maduras |
| Banco/Auth | Supabase (PostgreSQL) | Auth pronto, RLS nativo, Realtime, free tier generoso |
| IA | Claude API (modelos em camadas, ver §6) | Custo escala com receita |
| Frontend | Vite + React | Mesmo stack do Sollia — reuso de conhecimento e componentes |
| Gráfico | Lightweight Charts (TradingView, open source) | ~45kb, candles profissionais, `createPriceLine` nativo para plotar níveis |
| Pagamentos | Mercado Pago ou Asaas | PIX obrigatório no Brasil |
| Alertas WhatsApp | Evolution API / Meta WhatsApp API | Infraestrutura já dominada (Sollia) |
| Deploy coletor | VPS simples ou Railway/Fly.io | Processo Python contínuo |

### 4.2 Estrutura do repositório

```
crypto-monitor/
├── collector/
│   ├── aggregator.py        # orquestrador com APScheduler
│   ├── sources/             # um módulo por fonte (binance.py, coinglass.py, ...)
│   └── test_sources.py      # valida as 10 fontes individualmente
├── sql/
│   ├── 001_schema.sql       # tabelas das 10 fontes + market_snapshot
│   ├── 002_auth_plans.sql   # profiles, subscriptions, usage_log
│   └── 003_rls_policies.sql # gating por plano
├── ai/
│   ├── prompts/             # templates de análise por tipo
│   └── edge-functions/      # claude-analysis, payment-webhook
├── web/                     # dashboard Vite + React
├── config/
│   └── .env.example
├── requirements.txt
└── README.md
```

---

## 5. Modelo de Dados (resumo)

### 5.1 Tabelas de coleta (uma por fonte + agregadora)

- `prices_cex` — Binance/Coinbase: asset, exchange, price, volume_spot, volume_perps, cvd, ts
- `derivatives` — Coinalyze: asset, open_interest, funding_rate, long_short_ratio, liq_long_usd, liq_short_usd, cvd, ts
- `options_oi` — Deribit: asset, strike, type (call/put), oi, gamma, gex, expiry, ts
- `gamma_profile` — Deribit (calculado): asset, zero_gamma_level, regime (pos/neg), max_pain, max_pain_expiry, ts
- `defi_health` — DefiLlama: chain, tvl_usd, stablecoin_flow_24h, ts
- `sentiment` — Alternative.me: fng_value, classification, ts
- `onchain_perps` — Hyperliquid: asset, funding_rate, open_interest, mark_price, ts
- `macro` — CoinGecko: btc_dominance, total_mcap, ts
- `dex_liquidity` — DexScreener: asset, pair, liquidity_usd, volume_24h, ts
- `news_feed` — Cryptocurrency.cv: title, source, assets[], published_at
- `market_snapshot` — agregadora: asset, ts, payload JSONB (visão consolidada que a IA lê em uma única query)

### 5.2 Tabelas de negócio

- `profiles` — extensão do auth.users (nome, telefone p/ WhatsApp)
- `plans` — free / pro / expert (limites parametrizados em colunas, não hardcoded)
- `subscriptions` — user_id, plan_id, status, gateway_customer_id, current_period_end
- `usage_log` — user_id, action (ai_analysis), date, count (controle de cota diária)
- `ai_analysis` — asset, model_used, content, snapshot_ref, created_at
- `alerts` — user_id, asset, metric, condition, channel (email/whatsapp), active

### 5.3 Gating por RLS (Row Level Security)

| Recurso | Free | Pro | Expert | Mecanismo |
|---|---|---|---|---|
| Ativos | BTC | BTC, ETH, SOL | BTC, ETH, SOL + novos | Policy por `asset` via plano do usuário |
| Frequência | snapshot 30 min | 5 min | 5 min | View filtrada (`snapshot_free` retorna apenas registros :00 e :30) |
| Métricas avançadas (liquidações, GEX, funding, DEX) | ✕ | ✓ | ✓ | RLS por tabela |
| Camadas do gráfico (níveis sobre os candles) | candles simples, sem camadas | todas as camadas | todas as camadas | Frontend valida plano; dados das camadas já protegidos por RLS |
| Análises de IA | 1/dia | 10/dia | ilimitado | Checagem em `usage_log` na Edge Function |
| Alertas | ✕ | e-mail | e-mail + WhatsApp | Coluna `channel` validada por plano |
| Histórico | ✕ | 30 dias | completo | Policy com filtro de `ts` |

---

## 6. Camada de IA (Claude API)

**Princípio:** custo de IA escala com a receita, nunca contra ela.

| Plano | Modelo | Uso |
|---|---|---|
| Free | `claude-haiku-4-5` | 1 análise/dia do snapshot de BTC |
| Pro | `claude-sonnet-4-6` | Até 10 análises/dia sob demanda |
| Expert | `claude-fable-5` | Ilimitado + relatório diário automático ("análise profunda com o modelo mais avançado" como argumento de venda) |

### 6.1 Fluxo da análise

1. Usuário clica "Analisar" (ou cron dispara o relatório diário do Expert).
2. Edge Function valida plano e cota em `usage_log`.
3. Lê o `market_snapshot` mais recente do ativo (uma query).
4. Monta o prompt: dados + notícias recentes + template do tipo de análise.
5. Chama a Claude API com o modelo do plano.
6. Grava em `ai_analysis` e retorna ao dashboard.

### 6.2 Regras do prompt de análise

- Linguagem: português claro, sem jargão sem explicação.
- Estrutura fixa: contexto macro → fluxo (varejo vs. instituição) → níveis de liquidez → sentimento → síntese.
- Proibido: recomendação de compra/venda, previsão de preço-alvo, linguagem de certeza.
- Obrigatório: disclaimer de que não constitui aconselhamento financeiro.

---

## 7. Monetização

### 7.1 Planos

| | **Free** | **Pro — R$ 59/mês** | **Expert — R$ 149/mês** |
|---|---|---|---|
| Objetivo | Porta de entrada, cria hábito | Produto completo p/ trader individual | Sinal na mão de quem opera todo dia |
| Ativos | BTC | BTC, ETH, SOL | Tudo do Pro + acesso antecipado a novos ativos |
| Dados | Preço + Fear & Greed, 30 min | 10 fontes, 5 min | 10 fontes, 5 min |
| IA | 1 análise/dia (Haiku) | 10/dia (Sonnet) | Ilimitado (Fable 5) + relatório diário |
| Alertas | — | E-mail | E-mail + WhatsApp |
| Histórico | — | 30 dias | Completo |

Anual com desconto (~2 meses grátis) na fase 2.

### 7.2 Estratégia de conversão

- Usuário Free vê os cards de liquidação/GEX/funding **bloqueados com cadeado** no painel — curiosidade vende.
- Custo marginal do Free ≈ zero (dados já coletados; ele só lê uma view filtrada + 1 chamada Haiku/dia).
- Gateway: Mercado Pago ou Asaas (PIX + cartão). Webhook → Edge Function → atualiza `subscriptions`.

---

## 8. Princípios de UX do Dashboard

**Regra central: nenhum número cru sem tradução.** O dado bruto existe para o trader experiente; a tradução existe para todos.

### 8.1 Normalização (camada técnica)

Cada fonte retorna JSON em formato próprio (timestamps em ms vs. segundos, valores em USD vs. ativo nativo, símbolos divergentes). O `aggregator.py` normaliza tudo **antes de gravar**: timestamps em UTC, valores em USD, símbolos padronizados (BTC/ETH/SOL). O usuário e a IA nunca enxergam a heterogeneidade das fontes.

### 8.2 Tradução (camada de apresentação)

| Dado bruto | Como aparece no card |
|---|---|
| Funding rate: +0.0125% | "Alavancados pagando para ficar comprados — mercado otimista" (número como detalhe expansível) |
| CVD: -340M | "Varejo vendendo agressivamente nas últimas 4h" |
| Liquidações long $85M @ 64.2k | "Bolsão de liquidez comprada em US$ 64.2k — alvo magnético abaixo do preço" |
| Long/short ratio: 2.3 | "Maioria posicionada comprada — atenção a squeeze" |
| F&G: 71 | "Ganância — historicamente região de cautela" |

### 8.3 Padrões visuais

- **Semáforo em todos os cards:** verde / amarelo / vermelho conforme leitura da métrica — a tela inteira é compreensível em 10 segundos sem ler nada.
- **Um ativo por tela:** painel dedicado por ativo; troca via seletor no topo. Sem grids comparativos no MVP.
- **Card expansível:** estado padrão mostra a tradução + semáforo; expandido mostra número bruto, mini-gráfico e fonte do dado.
- **Cadeado como vitrine:** no plano Free, os cards avançados aparecem visíveis porém bloqueados (título + cadeado + CTA de upgrade) — nunca ocultos.
- **Análise de IA como costura:** botão fixo "O que está acontecendo?" gera a narrativa que conecta todos os cards numa leitura única.
- **Disclaimer persistente** no rodapé de toda tela de análise.

### 8.4 Gráfico com camadas — o coração do cockpit (v1.2)

O gráfico de candles é o centro visual do painel, posicionado entre o cabeçalho de preço e os cards de métricas. O que o diferencia de qualquer gráfico comum: **as métricas da plataforma são plotadas como camadas sobre os candles**, transformando números abstratos em níveis visíveis em relação ao preço.

**Biblioteca:** Lightweight Charts (TradingView, open source, ~45kb). Decisão: usar a biblioteca e não o widget embedado do TradingView, pois só a biblioteca permite sobrepor dados próprios via `createPriceLine` — o widget pronto mataria o diferencial.

**Dados (custo zero adicional):** OHLCV histórico do CoinGecko + candles real-time do WebSocket Binance + níveis das tabelas `derivatives` e `options_oi`. Nenhuma fonte nova.

**Camadas disponíveis (toggle no rodapé do gráfico):**

| Camada | O que plota | Fonte |
|---|---|---|
| Opções (GEX) | Linhas horizontais do Call Wall e Put Wall — tetos e pisos protegidos pelos market makers | Deribit |
| Zero Gamma (v1.3) | Linha do gamma flip — o nível onde o regime de volatilidade vira | Deribit (calculado) |
| Liquidações | Linhas nos bolsões de liquidez com valor notional (ex: "$85M @ 64.2k") | Coinalyze |
| Funding | Faixa de cor no rodapé do gráfico indicando funding positivo/negativo por período | Coinalyze / Hyperliquid |
| CVD | Sub-gráfico opcional abaixo dos candles com o delta de volume do varejo | Binance / Coinalyze |

**Tipos de visualização (v1.3):** seletor de estilo do gráfico com candles (padrão), barras OHLC, linha e área — todos nativos do Lightweight Charts (`CandlestickSeries`, `BarSeries`, `LineSeries`, `AreaSeries`), custo de implementação trivial. As camadas funcionam sobre qualquer tipo.

**Timeframes:** 15m, 1h, 4h (padrão), 1D.

**Gating:** Free vê candles simples sem camadas (toggles visíveis porém bloqueados com cadeado — vitrine). Pro e Expert têm todas as camadas.

**Conexão com a IA:** a análise narrativa referencia os mesmos níveis plotados no gráfico ("range entre 62k e 70k com ímã em 64.2k") — o usuário lê e **vê** a mesma informação, fechando o ciclo do cockpit.

### 8.5 Módulo Gamma — estilo SpotGamma (v1.3)

O módulo mais sofisticado do cockpit, exclusivo para **BTC e ETH** (a liquidez de opções de SOL na Deribit é insuficiente para um GEX confiável — reavaliar trimestralmente).

**Método de cálculo (v1.4):**

1. **Coleta — 1 chamada HTTP por ativo.** Endpoint `public/get_book_summary_by_currency?currency={BTC|ETH}&kind=option` retorna todos os instrumentos ativos com `open_interest`, `mark_iv` e `underlying_price`. O nome do instrumento (`BTC-27JUN26-70000-C`) codifica vencimento, strike e tipo.
2. **Filtros de higiene:** descartar opções com `T < 1 dia` (gamma diverge perto do vencimento), `oi == 0` e IV ausente.
3. **Gamma por opção — fórmula fechada de Black-Scholes** (juros ≈ 0): `gamma = φ(d1) / (S · σ · √T)`, onde `d1 = [ln(S/K) + σ²·T/2] / (σ·√T)`, `σ = mark_iv/100`. Não é modelagem própria de volatilidade — é aritmética determinística com a IV fornecida pela Deribit.
4. **GEX líquido por strike:** `gex = sinal · γ · OI · S² · 0.01`, com `sinal = +1` para calls e `−1` para puts (convenção: dealers comprados em calls, vendidos em puts — mesma premissa da SpotGamma). Unidade: dólares de hedge por movimento de 1%.
5. **Zero Gamma (flip):** grade de 60 spots hipotéticos (preço atual −15% a +15%, passo 0,5%); para cada spot recalcula o GEX líquido total → curva GEX(S); o flip é o cruzamento por zero, obtido por interpolação linear entre os dois pontos vizinhos. Se não houver cruzamento na grade, regime estável e o campo retorna `null`.
6. **Regime:** sinal do GEX no spot atual (positivo / negativo).
7. **Max Pain:** vencimento mais próximo; para cada strike candidato, soma do payoff de todas as opções liquidando ali; strike que minimiza o payoff total.

**Performance:** ~500 opções × 60 spots = 30k avaliações da fórmula fechada — NumPy vetorizado resolve em milissegundos. O ciclo total adiciona <5s. Coleta a cada 5 min como as demais fontes.

**Métricas calculadas:**

| Métrica | O que é | Tradução no card |
|---|---|---|
| Regime de gamma | Sinal do GEX líquido na região do preço | Positivo: "Volatilidade amortecida — dealers vendem altas e compram quedas, preço tende a grudar". Negativo: "Movimentos amplificados — dealers aceleram a tendência" |
| Zero Gamma (flip) | Nível de preço onde o GEX acumulado cruza zero | "Abaixo de US$ X o regime vira — atenção redobrada" |
| Perfil de gamma por strike | Histograma horizontal: calls à direita, puts à esquerda | Identifica visualmente todas as paredes, não só as duas maiores |
| Max Pain | Strike onde o maior valor em opções expira sem valor (vencimento mais próximo — sextas-feiras na Deribit) | "Ímã de vencimento em US$ X na sexta" |

**Apresentação:** painel dedicado dentro da aba do ativo com 3 cards (regime, flip, max pain) + histograma do perfil. A linha do Zero Gamma também aparece como camada no gráfico principal. Disponível a partir do plano Pro.

**Diferencial competitivo:** SpotGamma cobra ~US$ 50+/mês focada em ações americanas; leitura de gamma para cripto em português, integrada ao cockpit, praticamente não existe no mercado brasileiro.

### 8.6 Inventário obrigatório de cards do dashboard (v1.5)

**Regra:** toda fonte coletada na seção 3 **deve** ter pelo menos um elemento visual correspondente na UI. Coletar dados que não aparecem em lugar nenhum é desperdício e gera o descompasso "backend pronto, UI incompleta" observado em iterações anteriores. Esta seção amarra cada fonte a um componente visível e serve como checklist de "pronto" da Fase 3.

#### 8.6.1 Bloco "Preço e gráfico" (topo da página)

| Elemento | Fonte | Plano mínimo |
|---|---|---|
| Cabeçalho de preço + variação 24h | Binance (preço real-time) | Free |
| Gráfico OHLCV | CoinGecko (histórico) + Binance WebSocket (tempo real) | Free (sem camadas) / Pro (com camadas) |
| Camadas sobre o gráfico | Conforme tabela 8.4 | Pro |

#### 8.6.2 Bloco "Módulo Gamma" (BTC e ETH apenas)

| Elemento | Fonte | Plano mínimo |
|---|---|---|
| Card Regime de Gamma | Deribit (calculado — §8.5) | Pro |
| Card Zero Gamma (flip) | Deribit (calculado) | Pro |
| Card Max Pain | Deribit (calculado) | Pro |
| Histograma perfil por strike | Deribit (`options_oi`) | Pro |

#### 8.6.3 Bloco "Fluxo, liquidez e sentimento" (grade de cards)

| Card | Fonte | Leitura traduzida (exemplo) | Plano |
|---|---|---|---|
| **Fear & Greed** | Alternative.me | "Medo extremo — região historicamente de oportunidade" | Free |
| **Funding agregado (CEX)** | Coinalyze | "Comprados pagando caro — risco de squeeze de altas" | Pro |
| **Funding onchain** | Hyperliquid | "Alavancados onchain pagando para ficar comprados — viés otimista" | Pro |
| **CVD do varejo** | Binance / Coinalyze | "Varejo vendendo agressivamente nas últimas 4h" | Pro |
| **Long/Short ratio** | Coinalyze | "Mais comprados que vendidos — atenção a squeeze" | Pro |
| **Liquidações** | Coinalyze | "Cascata de liquidações vendidas — pressão compradora" | Pro |
| **Divergência Spot vs. Perps (v1.5)** | Coinbase × Binance | Calcula delta de volume spot (Coinbase) vs. perps (Binance) em 24h. Positivo: "Instituições comprando à vista enquanto varejo aposta — divergência saudável". Negativo: "Varejo eufórico, instituições paradas — sinal de cautela". | Pro |
| **TVL e fluxo de stablecoins (v1.5)** | DefiLlama | "TVL crescendo +4% em 7d e stablecoins entrando — capital novo na rede" (apenas ETH e SOL) | Pro |
| **Liquidez DEX (v1.5)** | DexScreener | "Liquidez nos pares principais estável em US$ X — mercado onchain saudável" (apenas ETH e SOL) | Pro |
| **Macro do mercado (v1.5)** | CoinGecko | "Dominância BTC em 54% e market cap global em US$ X — fase de altcoins ou de BTC" | Pro |

#### 8.6.4 Bloco "Notícias" (v1.5)

Bloco dedicado abaixo da grade de cards, com lista de **5 a 8 notícias mais recentes** filtradas para o ativo selecionado. Cada item exibe: título, fonte, timestamp relativo ("há 2h"), e ícone clicável para abrir a notícia original em nova aba. **Fonte:** Cryptocurrency.cv. **Plano:** Free vê últimas 3, Pro+ vê todas. A IA usa as notícias do bloco como contexto adicional na geração da análise.

#### 8.6.5 Regras transversais

- **Todo card exibe a fonte do dado** no rodapé (ex: "Fonte: Coinalyze") — transparência editorial.
- **Todo card exibe o timestamp do snapshot** que originou aquela leitura, prevenindo dúvidas sobre coerência temporal entre cards.
- **Cards bloqueados no Free** seguem o padrão de vitrine com cadeado: título + CTA "Desbloquear no Pro" (§8.3).
- **Critério de pronto da Fase 3:** todos os elementos das seções 8.6.1 a 8.6.4 renderizados com dados reais. Nenhum card aparecendo apenas em mockup.

---

## 9. Roadmap de Desenvolvimento

### Fase 1 — Pipeline de dados (semana 1-2) ✅ caminho validado
1. Schema SQL (3 migrations) no Supabase.
2. `aggregator.py` com as 10 fontes + `test_sources.py` — incluindo módulo `coinalyze.py` no lugar de `coinglass.py` e agregação de gamma por strike no `deribit.py` (GEX, Zero Gamma, Max Pain).
3. Critério de pronto: 10 fontes retornando OK e `market_snapshot` populando a cada 5 min.

**Fluxo de trabalho:** bootstrap no Claude Cowork (estrutura, código, testes na VM isolada) → pasta abre direto no VS Code → desenvolvimento contínuo com Claude Code.

### Fase 2 — Auth, planos e gating (semana 3)
4. Supabase Auth + `profiles`/`plans`/`subscriptions`/`usage_log`.
5. Políticas RLS completas.
6. Critério: usuário free logado só enxerga BTC com snapshot de 30 min.

### Fase 3 — Dashboard (semana 4-5)
7. Vite + React + Supabase Realtime.
8. Gráfico Lightweight Charts com camadas (liquidações + Call/Put Walls + Zero Gamma) e seletor de tipo (candles, barras, linha, área).
9. Painel Gamma (regime, flip, max pain + histograma por strike) — BTC e ETH, plano Pro+.
10. Painel por ativo: cabeçalho, gráfico, gamma e **todos os cards do inventário §8.6** — incluindo divergência Coinbase×Binance, TVL/stablecoins (DefiLlama), liquidez DEX (DexScreener), macro (CoinGecko) e bloco de notícias (Cryptocurrency.cv).
11. Botão "Analisar com IA" + tela de análise.

**Critério de pronto da Fase 3 (v1.5):** todos os elementos do inventário §8.6 renderizados com dados reais. Auditoria contra o PRD antes de fechar a fase.

### Fase 4 — IA em camadas (semana 6)
12. Edge Function `claude-analysis` com seleção de modelo por plano e controle de cota — prompt enriquecido com regime de gamma e flip.
13. Relatório diário automático (Expert).

### Fase 5 — Pagamentos e alertas (semana 7-8)
14. Checkout Mercado Pago/Asaas + webhook.
15. Alertas por e-mail (Pro) e WhatsApp via Evolution API (Expert) — incluindo alerta de virada de regime de gamma.
16. Landing page com tabela de planos.

### Pós-MVP (backlog)
- Novos ativos (votação dos usuários Expert).
- App mobile (notificações push).
- API pública para plano Expert/Business.
- Backtesting visual de níveis de liquidação.
- Camadas adicionais no gráfico: heatmap de liquidez DEX, marcadores de notícias no eixo do tempo, replay histórico do cockpit.

---

## 10. Métricas de Sucesso

| Métrica | Meta MVP (90 dias) |
|---|---|
| Uptime do coletor | > 99% (falha de 1 fonte não derruba o ciclo) |
| Cadastros Free | 300 |
| Conversão Free → pago | ≥ 5% |
| Churn mensal | < 8% |
| Custo de IA / receita | < 15% |

---

## 11. Riscos e Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Rate limit do Coinalyze (40 calls/min) | Coleta de derivativos incompleta | Orçamento atual: ~12 calls/ciclo de 5 min — folga de 3x. Se escalar ativos, espaçar chamadas dentro do ciclo |
| Rate limit do CoinGecko (10k/mês) | Falha na coleta macro | Coletar macro a cada 15 min (não 5) — consumo ~2.9k calls/mês |
| Mudança em API gratuita (breaking change) | Fonte fora do ar | Módulos isolados por fonte + try/except + log; painel degrada graciosamente |
| Custo de IA acima do previsto | Margem comprimida | Cotas por plano + Haiku como base + cache de análises (mesma análise servida se snapshot não mudou) |
| Interpretação como recomendação financeira | Risco legal/reputacional | Disclaimer fixo + regras de prompt (§6.2) + revisão dos templates |
| ToS das fontes para uso comercial | Bloqueio de acesso | Revisar termos de cada API antes do lançamento pago; ter fonte substituta mapeada |
| Coleta de ~300-500 tickers de opções na Deribit por ciclo | Ciclo de coleta lento | Resolvido (v1.4): endpoint `get_book_summary_by_currency` retorna todos os instrumentos em 1 chamada |
| Usuário interpretar regime de gamma errado | Frustração / risco reputacional | Tradução obrigatória no card + tooltip educativo + a IA sempre contextualiza o regime na análise |

---

## 12. Decisões Registradas

1. **SQL antes do Python** — o schema é o contrato do sistema.
2. **Coletor burro, IA inteligente** — separação total entre coleta e interpretação.
3. **Vite + React, não Next.js** — consistência com o stack do Sollia.
4. **Modelos de IA em camadas** — Haiku/Sonnet/Fable 5 conforme plano.
5. **PIX obrigatório** — Mercado Pago ou Asaas, não Stripe puro.
6. **WhatsApp como diferencial do Expert** — reuso da infraestrutura Sollia/Evolution API.
7. **Glassnode e CoinMarketCap descartados** — free tiers restritos demais; CoinGecko cobre o macro.
8. **Coinalyze como fonte primária de derivativos (v1.1)** — dados agregados de múltiplas exchanges, chave gratuita, 40 calls/min; elimina a incerteza do free tier do CoinGlass, que passa a fallback opcional.
9. **Nenhum número cru sem tradução (v1.1)** — toda métrica exibida ao usuário tem leitura em português claro + semáforo; dado bruto fica no estado expandido do card.
10. **Lightweight Charts com camadas próprias (v1.2)** — biblioteca open source da TradingView em vez do widget embedado; só ela permite plotar liquidações e Call/Put Walls sobre os candles, que é o coração do cockpit.
11. **Posicionamento "cockpit de decisões" (v1.2)** — todos os instrumentos numa tela, IA como copiloto narrador; a decisão é sempre do piloto. O termo nunca implica recomendação de operação.
12. **Módulo Gamma via book_summary + IV (v1.4)** — endpoint agregado da Deribit (1 chamada por ativo) + `mark_iv` da própria Deribit + fórmula fechada de gamma BS aplicada em grade de 60 spots para reconstruir a curva GEX(S) e localizar o flip por interpolação. Não é modelagem própria de volatilidade. BTC e ETH apenas (liquidez de opções de SOL insuficiente — reavaliar trimestralmente).
13. **Tipos de gráfico nativos (v1.3)** — candles, barras OHLC, linha e área via séries nativas do Lightweight Charts; camadas funcionam sobre qualquer tipo.
14. **Inventário obrigatório de cards (v1.5)** — toda fonte coletada tem componente visual correspondente; o critério de "pronto" da Fase 3 exige auditoria contra a seção 8.6. Coletar sem exibir é desperdício e quebra a promessa do cockpit "completo".

---

*Este documento consolida as definições de produto. Qualquer alteração de escopo deve ser registrada em nova versão.*
