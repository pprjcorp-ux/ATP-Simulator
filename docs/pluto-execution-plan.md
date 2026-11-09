# Pluto execution plan

Atualizado em: 2026-06-02  
Meta assumida: tornar o Pluto operacional e auditavel para trabalho real em canais controlados, com PR aprovado, monitoramento verificavel e documentacao minima.

## PLAN

## T-001 - Consolidar baseline operacional e seguranca local
- Owner: Pluto/Codex
- Entregaveis:
  - Snapshot atual de gateway, canais, modelo e security audit.
  - Registro dos deltas entre inventario historico e estado atual.
  - Gate minimo de seguranca para seguir com canais externos.
- Acceptance (deterministica):
  - `/opt/homebrew/bin/openclaw security audit --deep` retorna `0 critical`.
  - `POST http://127.0.0.1:18789/tools/invoke` sem token retorna `401` ou `403`.
  - `/opt/homebrew/bin/openclaw config validate` retorna sucesso.
  - Gateway responde em `127.0.0.1:18789` e status mostra LaunchAgent rodando.
- Riscos:
  - Status historico divergir do config atual.
  - Tailscale Serve expor o gateway para tailnet sem runbook claro.
  - Exec `full` continuar como excecao operacional.
- Dependencias:
  - OpenClaw CLI em `/opt/homebrew/bin/openclaw`.
  - Acesso local ao `~/.openclaw`.
- Monitoramento:
  - `npm run pluto:monitor` grava evidencias em `output/monitoring/pluto-health-latest.json`.
  - Alertas locais ficam em `output/monitoring/pluto-alerts-latest.json`.
  - Alerta manual se `security audit` mostrar qualquer `critical`.
  - Observar `Gateway`, `Event loop`, `Tasks` e `Channels` em `openclaw status --deep`.
- Docs/runbook:
  - Registrar procedimentos em `docs/pluto-runbook.md`.

## T-002 - Restaurar canais externos com allowlist explicita
- Owner: Pluto/Codex + Owner humano
- Entregaveis:
  - Decisao registrada sobre quais canais ficam ativos: WhatsApp, Discord, iMessage.
  - Config dos canais ativada somente para allowlists conhecidas.
  - Smoke de resposta para cada canal ativo.
- Acceptance (deterministica):
  - `/opt/homebrew/bin/openclaw channels status --probe --timeout 20000` mostra cada canal escolhido como `enabled`, `running` e `connected` ou `works`.
  - `bin/pluto-imessage-selfchat-check` mostra `dedicatedIdentityReady=true` quando iMessage for o canal principal.
  - `npm run pluto:imessage-login` mostra `state="signed_in_dedicated"` e `credentials.validated=true`.
  - Enquanto a Apple ID dedicada nao estiver logada, `npm run pluto:monitor` deve manter alerta `imessage_topology` aberto.
  - Enquanto a credencial Apple ainda for candidata, `npm run pluto:monitor` deve manter alerta `imessage_login_state` aberto.
  - `candidate_pending` e estado de criacao em andamento, nao estado aprovado.
  - STS fica como canal pratico primario enquanto a Apple ID dedicada ainda depender de codigo de e-mail/SMS/CAPTCHA.
  - Enquanto houver fallback `self-chat`, `bin/pluto-imessage-selfchat-check` mostra `runtimeSelfChatLocalMirrorGuardPresent=true`.
  - WhatsApp, se ativo, mostra `linked` e `health:healthy`.
  - Discord, se ativo, mostra bot identificado e `works`.
  - Canais nao escolhidos permanecem `disabled`.
- Riscos:
  - Reativar canal externo sem confirmar que a allowlist esta correta.
  - Sessao WhatsApp antiga estar pareada mas canal estar desabilitado.
  - Mensagens de teste chegarem em contatos reais.
- Dependencias:
  - Confirmacao humana dos canais que devem operar.
  - Conta WhatsApp/Discord pareada e tokens validos.
- Monitoramento:
  - `PLUTO_EXPECTED_CHANNELS=imessage,whatsapp npm run pluto:monitor` quando WhatsApp for canal escolhido.
  - `imessage_topology` alerta se a conversa continuar em `self-chat` ou se houver pares espelhados.
  - `imessage_topology` falha se o fallback `self-chat` estiver ativo sem o guard local anti-loop.
  - `imessage_login_state` alerta se o Messages estiver em login, erro de senha, 2FA ou estado nao provado.
  - Alertar se canal ativo ficar `disconnected`, `stopped`, `disabled` ou sem `transport` recente.
  - Usar logs filtrados por `channels/whatsapp` e `channels/discord`.
- Docs/runbook:
  - `docs/pluto-runbook.md`, secoes "Canais" e "Reversao".

## T-003 - Validar modelo, secrets e smoke do agente Pluto
- Owner: Pluto/Codex
- Entregaveis:
  - Probe do modelo primario.
  - Audit de secrets sem plaintext/unresolved refs.
  - Smoke deterministico no session-key do Pluto.
- Acceptance (deterministica):
  - `/opt/homebrew/bin/openclaw secrets audit --check` retorna clean.
  - `/opt/homebrew/bin/openclaw models status --probe --probe-provider openai --probe-max-tokens 16 --probe-timeout 20000` retorna provider `openai` com `status: ok`.
  - Smoke do agente retorna exatamente `OK PLUTO`.
  - `npm run pluto:sts:self-test` retorna `ok=true` e gera audio de resposta.
- Riscos:
  - Chave OpenAI expirar, ficar sem quota ou ter sido exposta.
  - Fallback para modelo sem suporte a ferramentas quebrar o fluxo.
  - Sessao antiga mascarar resultado de smoke.
- Dependencias:
  - SecretRef valido para `openclaw-main`.
  - Quota OpenAI disponivel.
- Monitoramento:
  - `npm run pluto:check` executa smoke do agente e probe do provider.
  - Registrar erro de provider/modelo: `rate_limit`, `insufficient_quota`, `invalid_request_error`.
  - Acompanhar `Sessions` e `Tasks` no status.
- Docs/runbook:
  - `docs/pluto-runbook.md`, secoes "Modelo e secrets" e "Como testar".

## T-004 - Fechar app local Pluto Ops com checks de build e smoke web
- Owner: Pluto/Codex
- Entregaveis:
  - App Vite local com snapshot importavel.
  - Build/lint limpos.
  - Screenshot Playwright ou equivalente do cockpit.
- Acceptance (deterministica):
  - `npm run lint` passa.
  - `npm run build` passa.
  - `npm run snapshot:import` passa quando o snapshot fonte existir.
  - `npm run dev` serve em `127.0.0.1` e endpoint HTTP retorna `200`.
- Riscos:
  - Bindings nativos de Rollup/Rolldown quebrarem no ambiente.
  - Snapshot bruto conter dado sensivel se importado sem sanitizacao.
  - UI exibir estado antigo como se fosse atual.
- Dependencias:
  - Node/npm instalados.
  - Snapshot local ou fallback sanitizado em `src/data/plutoSnapshot.json`.
- Monitoramento:
  - `npm run pluto:check` roda lint, build e import de snapshot como gate de PR.
  - Verificacao visual/screenshot apos alteracoes de UI.
- Docs/runbook:
  - `README.md` e `docs/pluto-runbook.md`.

## T-005 - Implantar monitoramento observavel minimo
- Owner: Pluto/Codex
- Entregaveis:
  - Checklist de health checks periodicos.
  - Definicao de alertas locais para gateway, canais, modelo e tasks.
  - Artefato JSON consumivel por cron/OpenClaw/dashboard local.
  - Artefato de roteamento para Tokenjuice, PR e alertas locais.
  - Comandos de triagem para logs.
- Acceptance (deterministica):
  - Existe runbook com comandos de monitoramento e criterios de alerta.
  - `npm run pluto:monitor` gera `output/monitoring/pluto-health-latest.json`.
  - `npm run pluto:monitor` gera `output/monitoring/pluto-alerts-latest.json` com `.status` em `clear` ou `open`.
  - `npm run pluto:monitor` gera `output/monitoring/pluto-alert-routes-latest.json` com owner, destino, canal e acao.
  - `gateway_tools_auth_probe` passa com HTTP `401` ou `403` para chamada sem token em `/tools/invoke`.
  - `imessage_login_state` fica `pass` somente com Apple ID dedicada validada e sem identidade proibida.
  - `imessage_topology` fica `pass` somente com identidade dedicada pronta e sem pares refletidos.
  - `imessage_topology` fica `fail` se `runtimeSelfChatLocalMirrorGuardPresent=false` durante fallback `self-chat`.
  - `openclaw status --deep` cobre gateway, canais, event loop, tasks e sessions.
  - `openclaw security audit --deep` e `openclaw secrets audit --check` estao no checklist.
- Riscos:
  - Monitoramento apenas manual ser esquecido.
  - Alertas sem owner claro.
  - Handoff de PR ser confundido com falha tecnica.
  - Tailscale Serve alterar a superficie de exposicao sem aviso.
- Dependencias:
  - Decisao se monitoramento sera manual, cron OpenClaw ou ferramenta externa.
  - Destino de alerta: Discord DM, WhatsApp, email, dashboard local ou rota de PR.
- Monitoramento:
  - Metric goals: gateway reachable, event loop OK, 0 critical security, channels escolhidos OK, model probe OK.
  - Alerta se tasks audit tiver warnings novos fora de `docs/pluto-task-triage.md`.
- Docs/runbook:
  - `docs/pluto-runbook.md`, secao "Como monitorar"; `docs/pluto-task-triage.md`.

## T-006 - Preparar PR e criterio de aceite final
- Owner: Pluto/Codex + Reviewer humano
- Entregaveis:
  - PR com plano, runbook e quaisquer ajustes de config/app.
  - Evidencias de checks anexadas.
  - Checklist de rollback.
- Acceptance (deterministica):
  - Git diff limitado a arquivos do projeto Pluto Ops/docs.
  - Todos os checks de `RUN_CHECKS` passam ou ficam marcados com bloqueio humano objetivo.
  - PR aprovado pelo reviewer humano.
- Riscos:
  - Repo remoto ainda nao definido.
  - Alteracoes em `~/.openclaw` nao serem versionaveis no repo.
  - PR misturar app local com secrets/config de maquina.
- Dependencias:
  - Definir repo/remoto alvo.
  - Reviewer humano disponivel.
  - Token GitHub com escopo `workflow` caso o repo precise de GitHub Actions.
- Monitoramento:
  - Checks locais de runtime: `npm run pluto:check`.
  - GitHub Actions fica como pendencia humana se for exigido como check remoto.
  - Pos-merge: repetir `T-001`, `T-003` e canais escolhidos de `T-002`.
- Docs/runbook:
  - `docs/pluto-execution-plan.md`, `docs/pluto-runbook.md`, `README.md`.

## RUN_CHECKS

## Para T-001
- check_1: `/opt/homebrew/bin/openclaw config validate`
- check_2: `/opt/homebrew/bin/openclaw security audit --deep | sed -n '1,80p'` deve mostrar `Summary: 0 critical`.
- check_3: `/opt/homebrew/bin/openclaw status --deep` deve mostrar Gateway reachable e LaunchAgent running.
- check_4: `npm run pluto:monitor` deve gerar `output/monitoring/pluto-health-latest.json`.
- check_5: `curl -sS -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data '{}' http://127.0.0.1:18789/tools/invoke` deve retornar `401` ou `403`.

## Para T-002
- check_1: `/opt/homebrew/bin/openclaw channels status --probe --timeout 20000`
- check_2: `"${PLUTO_IMESSAGE_TOPOLOGY_CHECK:-$HOME/.openclaw/workspaces/openclaw-main/bin/pluto-imessage-selfchat-check}" | jq '.topology.topology, .checks.dedicatedIdentityReady, .checks.runtimeSelfChatLocalMirrorGuardPresent, .checks.mirroredPairCount'`
- check_2b: `npm run pluto:imessage-login | jq '.state, .credentials.validated, .credentials.expectedEmailMatches, .checks.forbiddenIdentityDetected'`
- check_3: WhatsApp ativo deve conter `enabled`, `linked`, `running`, `connected`, `health:healthy`.
- check_4: Discord ativo deve conter `enabled`, `running`, `connected`, `works`.
- check_5: Canais nao escolhidos devem aparecer como `disabled`.

## Para T-003
- check_1: `/opt/homebrew/bin/openclaw secrets audit --check`
- check_2: `/opt/homebrew/bin/openclaw models status --probe --probe-provider openai --probe-max-tokens 16 --probe-timeout 20000 --json`
- check_3: `/opt/homebrew/bin/openclaw agent --agent openclaw-main --session-key agent:openclaw-main:pluto-smoke --message "Responda apenas: OK PLUTO" --timeout 90 --json`
- check_4: `npm run pluto:check` deve incluir `PASS openclaw_agent_smoke`.
- check_5: `npm run pluto:check` deve incluir `PASS pluto_sts_self_test`.

## Para T-004
- check_1: `npm run lint`
- check_2: `npm run build`
- check_3: `npm run snapshot:import`
- check_4: `npm run dev` seguido de `curl -fsS http://127.0.0.1:5173/ >/dev/null`
- check_5: `npm run pluto:check` deve incluir `PASS npm_lint` e `PASS npm_build`.

## Para T-005
- check_1: `rg -n "Como monitorar|Gateway|Event loop|security audit|secrets audit|channels status" docs/pluto-runbook.md`
- check_2: `/opt/homebrew/bin/openclaw tasks audit --json` deve ter `summary.combined.errors == 0`; warnings devem estar registrados em `docs/pluto-task-triage.md`.
- check_3: `/opt/homebrew/bin/openclaw status --deep | rg "Gateway|Event loop|Tasks|Channels|WhatsApp|Discord|iMessage"`
- check_4: `jq '.summary.status, .checks[].id' output/monitoring/pluto-health-latest.json`
- check_5: `jq '.status, (.alerts[]?.severity // empty)' output/monitoring/pluto-alerts-latest.json`
- check_6: `jq '.checks[] | select(.id=="gateway_tools_auth_probe" or .id=="imessage_topology") | {id,status,metrics}' output/monitoring/pluto-health-latest.json`
- check_7: `jq '.checks[] | select(.id=="imessage_login_state") | {id,status,metrics}' output/monitoring/pluto-health-latest.json`

## Para T-006
- check_1: `git status --short`
- check_2: `git diff -- docs/pluto-execution-plan.md docs/pluto-runbook.md README.md`
- check_3: PR aprovado no provedor Git definido.
- check_4: Se GitHub Actions for exigido, token com `workflow` cria/atualiza `.github/workflows/*`.
- check_5: Repetir checks T-001, T-003, T-004 e canais escolhidos de T-002 apos merge.

## REVIEW_RUBRIC

Aprovar se:
- Todos os acceptance checks passaram ou estao marcados como bloqueio humano objetivo.
- Os canais externos ativos batem com a decisao humana registrada.
- iMessage principal usa Apple ID dedicada do Pluto; enquanto isso nao for verdade, o alerta `imessage_topology` permanece aberto como pendencia humana.
- Apple ID dedicada tem credencial validada; enquanto isso nao for verdade, o alerta `imessage_login_state` permanece aberto como pendencia humana.
- `openclaw security audit --deep` mostra `0 critical`.
- `/tools/invoke` rejeita POST sem token com `401` ou `403`.
- `openclaw secrets audit --check` esta limpo.
- Modelo primario responde no probe e no smoke `OK PLUTO`.
- STS rapido local passa no self-test e fica disponivel como fallback humano enquanto iMessage dedicado estiver pendente.
- App Pluto Ops passa em `npm run lint` e `npm run build`.
- Monitoramento e runbook cobrem "como testar", "como reverter" e "como monitorar".
- Alertas locais geram JSON consumivel por automacao mesmo sem destino externo escolhido.
- PR contem apenas mudancas relacionadas ao Pluto Ops/docs/runbook.
- Se CI remoto for exigido, GitHub Actions passa no PR.

Reprovar se:
- Ha dependencia oculta de token, conta, canal ou projeto cloud nao documentada.
- Check deterministico faltando para canal, modelo, secrets, gateway ou app.
- Monitoramento nao tem owner, comando ou criterio de alerta.
- Alertas existem apenas em texto humano e nao em artefato verificavel.
- Runbook nao explica rollback de config ou desativacao de canais.
- PR mistura secrets, arquivos de maquina ou mudancas fora do escopo.
- Canal externo e ativado sem allowlist e confirmacao humana.
