# Inventario operacional de acessos - Pluto/OpenClaw

Atualizado em: `<redacted-runtime-date>`
Diretorio atual: `<repo-root>`
Alvo operacional real: OpenClaw agent `openclaw-main`, identidade `Pluto`, gateway `127.0.0.1:18789`, Discord OK.

## Resumo executivo

- O diretorio `clawn` agora contem um app React/Vite local chamado `Pluto Ops`, com `package.json`, `README.md`, `src/`, lint e build validados.
- Ainda nao ha `.env.example`, `vercel.json`, `wrangler.toml`, `supabase/`, `.github/workflows` ou `docker-compose.yml`, porque backend/deploy/CI ainda nao foram escolhidos para este app.
- O trabalho util foi aplicado no alvo correto: `~/.openclaw` / OpenClaw Discord Pluto.
- Secrets OpenClaw migrados para SecretRefs via provider local `filemain` em `~/.openclaw/secrets.json` com permissao `0600`.
- Backups criados antes de alterar secrets e modelos em `~/.openclaw/backups/`.
- `openclaw secrets audit --check` ficou limpo: `plaintext=0`, `unresolved=0`, `shadowed=0`, `legacy=0`.
- `openclaw doctor --fix` reparou 3 session route pins legados e, em modo interativo, arquivou 23 transcripts orfaos como `.deleted.<timestamp>`.
- `openclaw status --deep` confirma gateway reachable, Discord OK, LaunchAgents loaded/running, agent `openclaw-main` ativo, Tailscale exposure off.
- Validacao HTTP sem token: `POST /tools/invoke` em `127.0.0.1:18789` retorna `401`; gateway protegido na pratica.
- `openclaw security audit --deep` tem 0 critical e 5 warnings operacionais: trusted proxies ausentes para proxy reverso, exec security full, override de profile minimal, heuristica multi-user e plugins npm sem pin.
- GitHub, Docker, Playwright, Vercel CLI, Wrangler CLI, Cloudflare MCP, Stripe MCP, Figma, Google Drive/Gmail/Calendar, Supabase connector, Sentry e Tailscale foram validados.
- Bloqueios restantes dependem de login/aprovacao humana ou decisao de produto: cloudflared Tunnel, Stripe CLI, 1Password CLI, Supabase/repo alvo e Figma editavel.

## Inventario de acessos

| Servico | Status | Evidencia objetiva | Acao executada ou necessaria |
| --- | --- | --- | --- |
| OpenClaw Pluto | OK | `openclaw status --deep`: gateway local `ws://127.0.0.1:18789`, reachable, Discord `OK`, services loaded/running, `openclaw-main` ativo. | Alvo operacional pronto em loopback. |
| OpenClaw secrets | OK | `openclaw secrets audit --check`: clean, `plaintext=0`, `unresolved=0`, `shadowed=0`, `legacy=0`. | Migrado para SecretRefs; manter `~/.openclaw/secrets.json` fora de git e migrar para 1Password quando houver conta. |
| OpenClaw doctor/state | Parcial | `doctor --fix` reparou 3 session route pins; sessao interativa arquivou 23 orfaos. `doctor` ainda mostra aviso de Gateway SecretRef por check sincrono que nao resolve refs; `secrets audit` resolve 11/11. | Sem acao destrutiva pendente; tratar o aviso do `doctor` como limitação do check enquanto SecretRef estiver em uso. |
| OpenClaw security | Parcial | `openclaw security audit --deep`: 0 critical, 5 warn, 1 info. | Warnings restantes sao decisoes de politica: reduzir `exec.security=full`, pin npm specs e definir boundary se houver multiusuario. |
| Discord channel | OK | `status --deep`: Discord `ON`/`OK`, token env, accounts 1/1; config tem `groupPolicy=allowlist`, exec approvals `dm`, 1 approver. | Mantido sem ampliar acesso externo. |
| Gateway HTTP auth | OK | `curl -X POST /tools/invoke` sem token retornou `401`; root UI retorna `200`. | Protecao pratica validada; manter `gateway.bind` em loopback. |
| Contexto local do projeto | OK | App `Pluto Ops` criado no repo local; `npm run lint` e `npm run build` passam. | Falta decidir se este app vira repo proprio e qual deploy/backend usar. |
| GitHub CLI | OK | `gh auth status` autenticado com scopes `gist`, `read:org`, `repo`. | Pronto para repos; falta escolher repo alvo para este workspace. |
| GitHub app/connector | OK | GitHub app listou conta instalada. | Pronto para operar via conector quando houver repo alvo. |
| GitHub MCP local | OK | Docker image `ghcr.io/github/github-mcp-server:latest` presente; execucao `--help` com `gh auth token` validada. | Pronto enquanto Docker Desktop estiver rodando. |
| Docker | OK | `docker system info`: `29.2.0 Docker Desktop linux/aarch64`. | Pronto para MCPs/servicos locais. |
| Vercel CLI | OK | `vercel whoami` autenticado apos OAuth/device flow. | Pronto para `vercel link`, `env pull`, `logs` quando houver projeto. |
| Vercel MCP | OK | `codex mcp list`: `vercel` habilitado com OAuth. | Pronto via conector; projeto especifico ainda nao selecionado. |
| Cloudflare MCP/API | OK | Cloudflare API `/user` autenticada; account id redigido. | API pronta via MCP. |
| Wrangler CLI | OK | `wrangler whoami` autenticado; account id redigido. | Pronto para Workers/Pages/D1 quando houver projeto. |
| cloudflared Tunnel | Bloqueado | `cloudflared tunnel list`: origin cert ausente; Cloudflare API `/zones`: `total_count=0`. | Adicionar uma zone/domínio à Cloudflare ou usar tunnel token criado no Dashboard. |
| Supabase | Parcial | Connector listou org/projeto com `status=INACTIVE`; identificadores redigidos. | Restaurar/ativar projeto ou escolher outro backend antes de migrations/logs. |
| Stripe MCP | OK | Stripe app retornou conta autenticada; identificador e display redigidos. | Pronto via conector para operacoes suportadas. |
| Stripe CLI | Bloqueado | `stripe --version`: `1.42.1`; `stripe config --list`: config local ausente; `stripe login` gerou fluxo mas nao foi completado. | Confirmar pareamento no Dashboard e validar `stripe config --list`; depois `stripe listen`. |
| Figma | Parcial | `figma whoami` autenticado; seat `View`. | Leitura OK; criacao/edicao exige assento editavel. |
| Google Drive/Docs | OK | Drive profile autenticado; root listou arquivos recentes. | Pronto para busca/leitura/criacao conforme escopos. |
| Gmail | OK | Gmail profile autenticado; labels `INBOX` e `UNREAD` retornaram contagens. | Pronto para consulta; escritas so sob pedido explicito. |
| Google Calendar | OK | Busca no calendario primario para 2026-05-29 retornou resposta valida sem erro. | Pronto para consulta e agenda conforme pedido. |
| 1Password CLI | Falta | `op --version`: `2.32.0`; `op account list --format=json`: `[]`; `op whoami`: no account found. | Adicionar conta/sign-in para virar cofre preferencial. |
| Tailscale | OK | `tailscale status` autenticado na tailnet; IP/usuario redigidos. | Pronto para acesso tailnet; exposicao OpenClaw continua off. |
| Playwright/browser automation | OK | `npx playwright screenshot` gerou `/tmp/clawn-playwright-check.png` (`1280 x 720`). | Pronto para validacao web local/remota. |
| Sentry/observability | Parcial | `sentry whoami` autenticado; user ID redigido; sem projeto alvo neste workspace. | Criar/vincular projeto Sentry e DSN quando houver app. |
| CI/CD | Falta | `clawn` nao tem `.github/workflows` nem configs de deploy. | Criar pipeline depois que repo/app existir. |
| Staging/producao | Falta | Sem app alvo, sem `.vercel/`, sem Cloudflare zone/Worker local, Supabase inativo. | Definir app, dominio e provider antes de mexer em producao. |

## Pendencias humanas

- Configurar Cloudflare Tunnel: adicionar zone/domínio na Cloudflare ou criar token de tunnel no Dashboard.
- Completar Stripe CLI: confirmar pareamento do `stripe login` no Dashboard e validar `stripe config --list`.
- Adicionar/sign-in 1Password: `op account add` ou app 1Password autorizado para CLI.
- Decidir se o Supabase inativo deve ser restaurado ou substituido.
- Definir se o app `Pluto Ops` deve virar repo proprio, ser publicado em um repo existente ou permanecer apenas como cockpit local.
- Decidir se o assento Figma precisa ser elevado de `View` para edicao/criacao.

## Proximos passos

1. Concluir Cloudflare Tunnel somente se necessario: adicionar zone/domínio ou usar tunnel token do Dashboard.
2. Concluir Stripe CLI: entrar no Dashboard Stripe, repetir `stripe login`, validar `stripe config --list`, depois `stripe listen` quando houver endpoint local.
3. Concluir cofre: entrar no 1Password CLI e migrar `~/.openclaw/secrets.json` para refs `op://...` ou provider `exec` com `op read`.
4. Concluir Tailscale somente se for necessario expor/acessar Pluto fora da LAN.
5. Decidir destino do app `Pluto Ops`: repo proprio, repo existente ou ferramenta local.
6. No destino escolhido, criar `.env.example`, `.env.local`, runbook, CI/CD e mapeamento staging/producao.
7. Vincular deploy: `vercel link` ou Cloudflare Worker/Pages conforme decisao de plataforma.
8. Ativar backend: restaurar Supabase ou criar alternativa, entao validar migrations/logs.
