# Template da mensagem do usuário (preenchido pela Edge Function)

Analise o momento de mercado do ativo **{{ASSET}}** com base no snapshot abaixo.
Siga a estrutura: contexto macro → fluxo → níveis de liquidez/opções → sentimento
→ síntese. Cite os níveis de preço (Call/Put Wall, Zero Gamma, Max Pain) quando
disponíveis. Encerre com o disclaimer.

## Snapshot consolidado (JSON)
```json
{{SNAPSHOT_JSON}}
```

## Notícias recentes
{{NEWS}}

Lembre-se: traduza cada número, não recomende operação, não preveja preço-alvo.
