# Pluto task warning triage

Atualizado em: 2026-06-02

## Warnings conhecidos

### TaskFlow `0a75d876-f3e5-4637-b7bb-e96eab54bf70`
- Codigo: `stale_blocked`
- Status: `blocked`
- Owner: Pluto/Codex
- Origem: `agent:openclaw-main:imessage:direct:<redacted-operator>`
- Goal: `cross-channel interaction system design`
- Tarefa relacionada: `a2dca4f6-7b20-41a6-90e2-392df3d4bf19`
- Diagnostico: a tarefa de subagent terminou `succeeded`, mas a entrega terminal ao requester falhou por timeout de LLM. O conteudo util ficou preservado em `progressSummary`.
- Risco atual: baixo para operacao do Pluto; medio para confiabilidade de notificacoes de TaskFlow.
- Acao: manter como warning conhecido ate decidir se o historico deve ser arquivado por manutencao OpenClaw.
- Acceptance para limpeza:
  - `/opt/homebrew/bin/openclaw tasks audit` retorna `0 warnings`; ou
  - o warning permanece apenas nesta lista e nenhum novo warning aparece.

### Task `a2dca4f6-7b20-41a6-90e2-392df3d4bf19`
- Codigo: `delivery_failed`
- Status: `succeeded`
- Delivery status: `failed`
- Diagnostico: task executou e produziu resumo, mas a notificacao final falhou.
- Risco atual: baixo para conteudo; medio para entrega ao canal.
- Acao: monitorar novos `delivery_failed`; se repetir, investigar timeout/modelo/canal antes de ativar automacoes dependentes de notificacao.

## Comando de triagem

```bash
/opt/homebrew/bin/openclaw tasks audit --json
```

## Regra de alerta

Alertar se:
- `summary.combined.errors > 0`
- aparecer warning com `token` diferente dos listados acima
- `delivery_failed` se repetir em task criada depois de 2026-06-02
- TaskFlow `blocked` ficar ligada a canal ativo de producao sem resumo preservado
