# Pluto smoke test e audit - 2026-05-29

Horario: 2026-05-29, tarde, America/Sao_Paulo.
Escopo: OpenClaw/Discord `Pluto` (`openclaw-main`) e app local `Pluto Ops`.

## Smoke test

| Check | Resultado | Evidencia |
| --- | --- | --- |
| OpenClaw status profundo | OK | `openclaw status --deep`: gateway `127.0.0.1:18789` reachable, Discord OK, LaunchAgents gateway/node loaded e running, Tailscale exposure off. |
| Gateway UI | OK | `curl http://127.0.0.1:18789/` retornou HTTP `200`. |
| Gateway endpoint sensivel sem token | OK | `POST /tools/invoke` sem token retornou HTTP `401`. |
| App Pluto Ops | OK | `curl http://127.0.0.1:5173/` retornou HTTP `200`. |
| Browser automation | OK | Playwright gerou screenshot em `/tmp/pluto-smoke-desktop.png`. |
| Build app | OK | `npm run build` concluiu com sucesso. |
| Lint app | OK | `npm run lint` concluiu com sucesso. |

## Audit

| Area | Resultado | Evidencia |
| --- | --- | --- |
| Secrets OpenClaw | OK | `openclaw secrets audit --check`: `plaintext=0`, `unresolved=0`, `shadowed=0`, `legacy=0`. |
| Security OpenClaw | Parcial | `openclaw security audit --deep`: `0 critical`, `5 warn`, `1 info`. |
| Doctor OpenClaw | Parcial | `openclaw doctor --non-interactive`: 1 orphan transcript; Gateway token via SecretRef nao resolvido pelo doctor; aviso de `tools.profile=minimal` com `tools.exec` configurado. |
| Tasks audit | OK | `openclaw tasks audit`: `0 findings`, `0 errors`, `0 warnings`. |
| Tasks historicas | Parcial | `openclaw tasks list --status failed --json`: 6 cron tasks falhadas rastreadas; nenhuma lost/timed_out. |
| Tasks maintenance preview | OK | `openclaw tasks maintenance --json`: preview sem reconciliacao/prune pendente; 21 terminal, 15 succeeded, 6 failed. |
| NPM audit | OK | `npm audit --audit-level=moderate`: `found 0 vulnerabilities`. |

## Warnings atuais

- `gateway.trustedProxies` ausente: aceitavel enquanto Control UI ficar somente em loopback; configurar se houver reverse proxy.
- `tools.exec.security=full`: manter como break-glass ou reduzir para allowlist por agente.
- `tools.profile=minimal` e `openclaw-main=messaging`: override intencional ou ajustar para enforcement global.
- Heuristica multi-user: Discord allowlist indica superficie compartilhada; manter boundary de operador confiavel.
- Plugins npm `codex` e `discord` sem pin exato.
- `doctor` nao resolve o Gateway SecretRef, embora `secrets audit` esteja limpo e `/tools/invoke` sem token retorne `401`.
- 1 orphan transcript em `~/.openclaw/agents/openclaw-main/sessions`.
- 6 falhas historicas de cron, principalmente `metaclaw-stalled-review`, `metaclaw-daily-review` e `metaclaw-nightly-summary`; uma falha explicita: `tool_search` nao suportado com `gpt-5.4-nano`.

## Conclusao

Pluto esta operacional para trabalho local: gateway e Discord OK, endpoints sensiveis protegidos na pratica, app local renderizando, build/lint limpos e secrets audit limpo.

Pendencias nao criticas: decidir se arquiva o orphan transcript com `openclaw doctor --fix`, corrigir modelo/ferramentas dos crons que falharam, reduzir/pinar superficie de exec/plugins se a meta for hardening.
