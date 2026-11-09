# Pluto Ops runbook

Atualizado em: 2026-06-02  
Escopo: app local `pluto-ops` no checkout deste repo e runtime OpenClaw `openclaw-main`/`Pluto`.

## Estado esperado

- Gateway local: `127.0.0.1:18789`.
- Agente default: `openclaw-main`.
- Modelo primario: `openai/gpt-5.4-mini`.
- Secrets: SecretRefs resolvidos por provider local `filemain` em `~/.openclaw/secrets.json`.
- App local: Vite/React, sem backend e sem secrets no repo.
- Canais externos: devem ficar ativos somente quando constarem explicitamente na allowlist.

## Como testar

### Gateway e seguranca

```bash
/opt/homebrew/bin/openclaw config validate
/opt/homebrew/bin/openclaw security audit --deep
/opt/homebrew/bin/openclaw status --deep
```

Aceite minimo:
- `config validate` sem erro.
- `security audit` com `0 critical`.
- `status --deep` com Gateway reachable e Event loop OK.

### Secrets e modelo

```bash
/opt/homebrew/bin/openclaw secrets audit --check
/opt/homebrew/bin/openclaw models status --probe --probe-provider openai --probe-max-tokens 16 --probe-timeout 20000 --json
```

Aceite minimo:
- Secrets audit `clean`.
- Probe OpenAI com `status: ok`.

### Smoke do Pluto

```bash
/opt/homebrew/bin/openclaw agent \
  --agent openclaw-main \
  --session-key agent:openclaw-main:pluto-smoke \
  --message "Responda apenas: OK PLUTO" \
  --timeout 90 \
  --json
```

Aceite minimo:
- `status: ok`.
- Payload final contem exatamente `OK PLUTO`.
- `fallbackUsed: false` quando o primario estiver saudavel.

### STS rapido local

Use quando o iMessage dedicado ainda estiver bloqueado e o operador precisar falar
com Pluto por voz neste Mac.

```bash
npm run pluto:sts:self-test
npm run pluto:sts -- --text "resuma o estado operacional em uma frase"
npm run pluto:sts
```

Aceite minimo:
- `pluto:sts:self-test` retorna `ok=true`.
- A resposta do agente nao fica vazia.
- Um arquivo de resposta e gerado em `output/speech/`.
- O modo live grava um turno curto do microfone, transcreve e toca a resposta.
- A voz e AI-generated; nao exponha segredo, token ou conteudo privado em logs compartilhados.

Overrides uteis:
- `PLUTO_STS_MIC_INDEX=0 npm run pluto:sts` escolhe o dispositivo AVFoundation por indice.
- `npm run pluto:sts -- --record-seconds 10` aumenta a janela de fala.
- `npm run pluto:sts -- --loop` abre modo push-to-talk: Enter grava, `q` sai.

### Mira Bridge

Use quando Paulo quer que a Mira intermedie Paulo, Codex e Pluto/OpenClaw sem
dar execucao livre ao cursor, browser ou sistema.

```bash
npm run pluto:mira:self-test
npm run pluto:mira:turn -- --text "Mira, peca ao Pluto um proximo passo seguro"
```

Aceite minimo:
- O comando retorna uma proposta de Pluto em portugues.
- `requiresApproval=true`.
- `execution="proposal_only"`.
- `risk` e `summary` estao presentes.
- `output/mira-bridge/events.jsonl` registra somente metadados: horario,
  `proposalId`, risco, comprimentos e alvo; nao registra texto bruto de conversa,
  token, senha, API key ou log completo.
- A UI `?surface=mira` mostra a fila e permite aprovar/rejeitar intencoes sem
  executar comandos automaticamente.

Limites:
- Aprovacao na UI e intencao operacional, nao clique real.
- Acoes de cursor/OS, browser, contas, producao, pagamentos e secrets continuam
  dependendo de confirmacao humana explicita e execucao por Codex/operador.
- Pluto/OpenClaw e fonte de proposta, nao autoridade final de execucao.

### Codex Relay

Use quando Codex precisa consultar Pluto como segundo operador antes de decidir
o proximo passo. A rota e `Codex -> Pluto/OpenClaw -> Codex`; Mira pode mostrar
ou aprovar a intencao, mas a execucao continua com Codex e o operador.

```bash
npm run pluto:codex:self-test
npm run pluto:codex:turn -- --text "Pluto, revise meu proximo passo como Codex"
```

Aceite minimo:
- O comando retorna uma resposta de Pluto em portugues.
- `execution="advisory_only"`.
- `requiresCodexReview=true`.
- `contextSanitized=true`.
- O monitor inclui `pluto_codex_relay_self_test` como check pass/fail.
- `output/codex-pluto/events.jsonl` registra somente metadados: horario,
  `exchangeId`, rota, risco, comprimentos e modo de execucao.

Limites:
- Pluto nao executa comandos, cursor, browser, OS, producao, pagamentos, contas
  ou secrets por esse relay.
- Codex deve verificar a evidencia recomendada por Pluto antes de afirmar que
  algo esta pronto.
- Qualquer acao sensivel continua dependendo de confirmacao humana explicita.

### Persona e avatar Pluto Court Maestro

Pluto usa a persona operacional `Pluto Court Maestro`: original, inspirada em
disciplina, compostura e precisao de tenis classico, mas sem copiar aparencia,
voz, identidade ou endosso de atleta real.

Fonte local:

```bash
cat config/pluto-persona.json
```

Estado HeyGen atual:
- avatar: `Pluto Court Maestro`
- avatar_id: `5da0cff076ab47d3b19bbefbef193c11`
- group_id: `f82177116f12485a9d074bd5dcca9981`
- status: `ready_preview`

Regra de seguranca: se qualquer geracao visual/voz tentar virar sosia,
impersonacao ou clone de pessoa real, rejeite e regenere como personagem
original.

### STS rapido no iPhone

Use quando o operador precisa falar com Pluto pelo iPhone antes do iMessage
dedicado estar aprovado. Esse caminho e tailnet-only: o servidor Node escuta
somente `127.0.0.1` e o Tailscale Serve publica HTTPS apenas para dispositivos
logados na mesma tailnet.

O cockpit local tambem tem uma aba `STS`:

```bash
npm run dev
```

Abra `http://127.0.0.1:5173`, entre em `STS` e use o painel para copiar
comandos, ver guardrails Mac/iPhone e rodar o probe de health com o token
efemero salvo localmente. O token digitado no painel nao e salvo.

```bash
npm run pluto:sts:mobile:start
npm run pluto:sts:mobile:status
```

Em outro terminal, publique o path sem substituir o gateway raiz:

```bash
tailscale serve --bg --https=443 --set-path /sts http://127.0.0.1:8787
tailscale serve status --json
```

No iPhone, abra o link real salvo em `tmp/sts-mobile/current-public-url`. Ele
contem `?token=...`; esse token e salvo no `localStorage` do Safari e removido
da URL visivel depois do primeiro carregamento. `status` e `server.log` nao
imprimem o token.

Aceite minimo:
- Safari abre `Pluto STS` em HTTPS pela tailnet.
- O indicador fica `online`.
- O iPhone pede permissao de microfone.
- Um turno de voz retorna transcript, resposta curta de Pluto e audio tocavel.
- A resposta vem do agente `openclaw-main` pela sessao `agent:openclaw-main:pluto-sts-mobile`.
- Nenhum secret, token ou conteudo bruto de log e impresso nos docs/checkers.

Overrides uteis:
- `PLUTO_STS_MOBILE_TOKEN=<token> npm run pluto:sts:mobile` fixa token ate o processo parar.
- `npm run pluto:sts:mobile -- --port 8790` muda a porta local.
- `npm run pluto:sts:mobile:self-test` valida STT -> Pluto -> TTS sem abrir servidor.
- `npm run pluto:sts:mobile:start` inicia daemon local, valida health `200` com
  token e redige o token no `server.log`.
- `npm run pluto:sts:mobile:status` mostra pid/health sem imprimir token.
- `npm run pluto:sts:mobile:stop` encerra o pid local registrado.

Fallback sem Tailscale no iPhone:

```bash
npm run pluto:sts:mobile -- --host 0.0.0.0 --port 8787
```

Use `http://IP-DO-MAC:8787/sts/?token=...` somente na LAN confiavel. Como HTTP
nao e contexto seguro para microfone no Safari, use o campo `Texto ou ditado do
iPhone`; o teclado do iPhone faz o ditado, Pluto responde com texto e audio.
Isso e modo degradado, nao substitui o caminho final HTTPS/tailnet.

### Canais

```bash
/opt/homebrew/bin/openclaw channels status --probe --timeout 20000
```

Aceite minimo:
- Canal escolhido para operacao aparece `enabled` e funcional.
- WhatsApp ativo deve aparecer `linked`, `running`, `connected` e `health:healthy`.
- Discord ativo deve aparecer `running`, `connected` e `works`.
- Canal que nao deve operar permanece `disabled`.

### Discord DM

Use quando o operador quiser falar com Pluto por DM no Discord ou receber
aprovacoes executivas por DM. O estado atual deve ser tratado como bloqueado se
`discord_dm_readiness` disser `disabled` ou `missing bot token credential`.

Estado e auto-teste:

```bash
npm run pluto:discord:status
npm run pluto:discord:self-test
```

Validacao sem envio externo:

```bash
npm run pluto:discord:dry-run
```

Aceite do dry-run:
- `dryRun=true`.
- `channel="discord"`.
- `payload.to="user:<discord-user-id>"`.

Observacao operacional:
- Bot Discord nao adiciona amigo por QR/link de amigo como uma conta humana.
- Convites `discord.gg/...` servem para humanos entrarem no servidor; para o
  Pluto operar em canal, o bot `@pluto` precisa estar no servidor por OAuth e
  ter permissao de ver/enviar no canal.
- `discord_dm_readiness` valida credencial/DM; `discord_channel_access` valida
  acesso read-only do bot ao canal dedicado configurado.

Gerar link OAuth correto para adicionar o bot ao servidor:

```bash
npm run pluto:discord:invite-url
```

Para ativar envio real:
1. Obtenha um bot token Discord valido no portal oficial do Discord.
2. Instale via stdin, sem passar o token em argumento de shell:

```bash
printf '%s' '<DISCORD_BOT_TOKEN>' | npm run pluto:discord:install-from-stdin
```

Esse comando:
- cria backup de `~/.openclaw/openclaw.json` e `~/.openclaw/secrets.json`;
- salva o valor em `~/.openclaw/secrets.json` como `channels.discord.token`;
- força `~/.openclaw/secrets.json` para modo `0600` depois da escrita;
- configura `channels.discord.token` como SecretRef `filemain`;
- adiciona `PLUTO_DISCORD_USER_ID` em `channels.discord.allowFrom`;
- configura `channels.discord.enabled=true`;
- roda secrets audit e dry-run Discord.

Depois rode:

```bash
npm run pluto:monitor
/opt/homebrew/bin/openclaw channels status --probe --timeout 20000
```

So envie o smoke real depois de o monitor parar de alertar
`discord_dm_readiness`:

```bash
/opt/homebrew/bin/openclaw message send \
  --channel discord \
  --target user:<discord-user-id> \
  --message "[Pluto] oi" \
  --json
```

Falhas conhecidas:
- `disabled`: o canal existe na config, mas nao esta carregado como canal ativo.
- `missing bot token credential`: falta SecretRef/env seguro para o token do bot.
- `missing allowlisted Discord user`: o alvo humano nao esta em `allowFrom`,
  guild users ou approvers.
- `Discord bot missing access to configured dedicated channel`: DM pode estar
  funcional, mas o bot ainda nao tem acesso ao canal dedicado. Adicione o bot ao
  servidor/canal ou conceda `View Channel` e `Send Messages`.
- ID de convite/DM/grupo nao e canal texto de servidor para bot. Se a API do
  Discord retornar tipo `3` ou `Missing Access` para o ID informado, use um canal
  texto real do servidor. Estado validado: `AI MAFIA` usa `#general`
  `1409335728361443352` como canal texto operacional do Pluto; o bot tem
  `View Channel`, `Send Messages` e `Read Message History`, mas nao tem
  `Manage Channels`, entao nao cria canais novos sozinho.

### iMessage anti-eco

Se a Conta Apple dedicada ainda nao existir, prepare o provisionamento primeiro:

```bash
npm run pluto:apple-id:provision
```

Esse comando:
- grava o e-mail dedicado esperado no Keychain;
- preserva `OpenClaw Pluto Apple ID credential status` se ele ja existir;
- marca `account_missing` somente quando nao ha marcador previo ou quando voce usa `--force-reset-status`;
- abre `https://account.apple.com/account` e `https://iforgot.apple.com/password/verify/appleid`;
- prepara o Messages no passo de login com o e-mail dedicado;
- imprime somente diagnostico sanitizado.

Para filtrar a saida com `jq`, evite o cabecalho de `npm run`:

```bash
node scripts/pluto-apple-account-provision.mjs --json | jq '{keychain, messages}'
npm --silent run pluto:apple-id:provision -- --json | jq '{keychain, messages}'
```

Quando o operador tiver e-mail e telefone verificaveis para receber os codigos
da Apple, use o modo com senha candidata:

```bash
PLUTO_APPLE_ID_VERIFICATION_EMAIL='<email-verificavel>' \
PLUTO_APPLE_ID_VERIFICATION_PHONE='<telefone-verificavel>' \
npm run pluto:apple-id:provision -- --generate-password
```

Esse modo:
- mantem a Apple ID dedicada configurada localmente, que deve chegar no inbox informado por `PLUTO_APPLE_ID_VERIFICATION_EMAIL`;
- salva o telefone verificavel no Keychain quando `PLUTO_APPLE_ID_VERIFICATION_PHONE` estiver presente e depois imprime somente o numero mascarado;
- salva a senha candidata somente no Keychain;
- copia a senha candidata para o clipboard para colar no formulario oficial da Apple;
- marca `credentials.status="candidate_pending"` ate a Apple aceitar a criacao/login;
- nao torna o iMessage verde enquanto `credentials.validated=false`.
- nao inventa data de nascimento e nao tenta resolver CAPTCHA; esses dois itens,
  junto com codigos de e-mail/SMS, sao o gate humano obrigatorio do cadastro.

```bash
npm run pluto:imessage-login:summary
npm run pluto:imessage-login:self-test
"${PLUTO_IMESSAGE_TOPOLOGY_CHECK:-$HOME/.openclaw/workspaces/openclaw-main/bin/pluto-imessage-selfchat-check}" | jq '.topology.topology, .checks'
```

Aceite minimo:
- `state="signed_in_dedicated"` no checker de login.
- `credentials.expectedEmailMatches=true`.
- `credentials.validated=true`; senha candidata nao vale como credencial final.
- `checks.forbiddenIdentityDetected=false`.
- `checks.idsHasActiveAccount=true` e `checks.idsExpectedIdentityPresent=true`; `ActiveAccounts=[]`/`OnlineAccounts=[]` significa que o servico IDS do iMessage ainda nao aceitou uma conta ativa.
- `pluto:imessage-login:self-test` passa; ele prova que `validated=true` sem IDS ativo nao vira `signed_in_dedicated`.
- `imessageRunning=true`.
- `runtimePatchPresent=true`.
- `runtimeSelfChatLocalMirrorGuardPresent=true` enquanto a topologia ainda for `self-chat`; isso prova que o runtime descarta a linha local espelhada e espera a linha inbound do operador.
- `dedicatedIdentityReady=true` depois que a Apple ID dedicada do Pluto estiver logada no Messages deste Mac.
- `mirroredPairCount=0` e `reflectedAssistantRows=0` na conversa nova.

Estado conhecido enquanto a Apple ID dedicada nao estiver criada/verificada:
- `state` fica `not_signed_in`, `login_error`, `needs_2fa` ou `signed_in_unknown`.
- `credentials.status="account_missing"` significa que o e-mail dedicado ainda precisa virar uma Conta Apple criada/verificada em `https://account.apple.com/account`.
- `not_signed_in` com `checks.idsActiveAccountCount=0` e `checks.idsOnlineAccountCount=0` significa que o Messages pode estar aberto, mas o servico IDS/iMessage nao tem conta ativa.
- `credentials.validated=false` se a senha ainda for candidata, tiver sido recusada ou nao tiver sido confirmada no fluxo oficial da Apple.
- Senha candidata recusada nao deve ficar guardada; rode `scripts/pluto-imessage-login-state.mjs --prune-invalid-candidate` para remover somente o item candidato marcado como invalido.
- `topology="self-chat"`.
- `dedicatedIdentityReady=false`.
- `runtimeSelfChatLocalMirrorGuardPresent=true` deve permanecer verdadeiro; se voltar para `false`, uma atualizacao/reinstalacao sobrescreveu o patch anti-loop.
- `npm run pluto:monitor` deve manter os alertas `imessage_login_state` e `imessage_topology` abertos.

Classificacao SOTA do login iMessage:
- `not_signed_in`: Messages aberto ou fechado sem sessao dedicada aceita; quando `idsActiveAccountCount=0`, a ausencia vem dos plists IDS/iMessage, nao apenas da UI.
- `login_error`: Messages mostra erro de Conta Apple/senha.
- `account_missing`: marcador local indicando que a Conta Apple dedicada ainda nao foi criada/verificada; crie a conta antes de tentar login repetidamente.
- `candidate_pending`: existe senha candidata no Keychain/clipboard, mas ela ainda nao foi aceita pela Apple; complete data de nascimento, CAPTCHA e email/SMS antes de marcar como validada.
- `login_error` junto de `candidate_pending`: a Apple rejeitou a credencial candidata no Messages; se a conta ainda nao existe, volte ao fluxo oficial de criacao/verificacao; se ela existe, use recuperacao Apple antes de tentar marcar `validated`.
- `needs_2fa`: Apple exige codigo, CAPTCHA ou verificacao humana.
- `signed_in_unknown`: nao ha erro visivel e o checker nao conseguiu provar nem ausencia nem presenca da identidade dedicada.
- `signed_in_dedicated`: unico estado verde; requer marcador Keychain `validated` e evidencia sem identidade proibida.

O campo `blockedBy` e a chave curta para triagem:
- `apple_verification_pending`: senha candidata existe, mas faltam data de nascimento, CAPTCHA, e-mail/SMS ou aceite Apple.
- `messages_login_pending`: falta entrar no Messages com a Apple ID dedicada.
- `messages_ids_pending`: credencial local foi marcada, mas IDS/iMessage ainda nao prova a conta ativa.
- `forbidden_identity`: conta pessoal/numero do operador apareceu na superficie do Messages.

O campo `loginPhase` e a fase operacional curta:
- `messages_login_form_visible`: Messages esta pronto para senha/login.
- `submitted_or_closed_without_ids`: login foi tentado ou a janela fechou, mas IDS/iMessage ainda nao tem conta ativa.
- `apple_login_error_visible`: Apple rejeitou a credencial na UI.
- `apple_verification_prompt_visible`: Apple pediu codigo/2FA/CAPTCHA.
- `messages_ids_pending`: credencial local existe, mas IDS ainda nao aceitou a identidade.
- `dedicated_identity_active`: unica fase final aprovada.

Se o formulario da Apple perder a senha, ou se o macOS/Chrome falhar ao salvar
a senha localmente, restaure a candidata para o clipboard sem imprimir segredo:

```bash
npm run pluto:apple-id:handoff
npm run pluto:apple-id:copy-email
npm run pluto:apple-id:copy-phone
npm run pluto:apple-id:copy-password
npm run pluto:apple-id:update-password
npm run pluto:apple-id:update-password-from-clipboard
npm run pluto:apple-id:clipboard
npm run pluto:apple-id:submit-messages
```

`pluto:apple-id:handoff` abre os fluxos oficiais da Apple, abre Messages e deixa
o e-mail dedicado no clipboard para iniciar o preenchimento. Ele nao envia
formulario, nao tenta CAPTCHA/2FA e nao imprime senha ou telefone.
`pluto:apple-id:clipboard` compara o clipboard com os valores guardados no
Keychain e retorna apenas `dedicated_email`, `verification_phone`,
`candidate_password`, `empty` ou `unrecognized`.
Se a senha candidata precisar ser substituida, grave a nova senha no Keychain
sem imprimir o segredo:

```bash
read -s PLUTO_APPLE_PASSWORD
printf '%s' "$PLUTO_APPLE_PASSWORD" | npm run pluto:apple-id:update-password
unset PLUTO_APPLE_PASSWORD
```

Esse comando sempre volta o marcador para `candidate_pending`; ele nao marca a
senha como aceita pela Apple.
Se a senha ja estiver no clipboard, use
`npm run pluto:apple-id:update-password-from-clipboard`; ele tambem nao imprime
o segredo e deixa o marcador como `candidate_pending`.
`pluto:apple-id:submit-messages` copia a senha candidata do Keychain para o
clipboard, cola no login do Messages e aciona `Entrar`; se Apple pedir
2FA/CAPTCHA/codigo, esse continua sendo o gate humano obrigatorio.
Ele tambem grava `output/monitoring/pluto-apple-id-submit-latest.json`, contendo
apenas timestamp, fase antes/depois, resultado sanitizado da submissao e booleans
IDS. O monitor usa esse arquivo para mostrar idade/status da ultima tentativa.

O prompt "Salvar senha" do navegador/macOS e apenas armazenamento local. Ele
nao prova que a Conta Apple foi criada, nao prova que a senha foi aceita e nao
muda o gate do Pluto. Se esse salvamento local falhar, ignore o prompt, restaure
a senha candidata pelo comando acima e continue no formulario oficial da Apple
ate concluir e-mail/SMS/CAPTCHA. O estado deve permanecer `candidate_pending`
ate o Messages/IDS provar a identidade dedicada.

Depois que a Apple aceitar a conta e o Messages entrar sem erro com a Apple ID
dedicada, rode o preflight e depois grave somente o marcador de validacao, sem
imprimir a senha:

```bash
npm run pluto:apple-id:ready
npm run pluto:apple-id:credential -- --mark-validated --confirm-apple-accepted
```

Esse comando deve falhar enquanto `idsHasActiveAccount` ou
`idsExpectedIdentityPresent` nao forem `true`. Isso evita falso verde quando a
senha foi aceita no site da Apple, mas o Messages/IDS ainda nao aceitou a
identidade dedicada neste Mac.

### App Pluto Ops

```bash
export PATH=/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:$PATH
npm run lint
npm run build
npm run snapshot:import
```

### CI remoto

GitHub Actions e opcional para este PR. Para criar ou alterar
`.github/workflows/*`, a credencial GitHub precisa do escopo `workflow`.

Checks de runtime OpenClaw continuam locais porque dependem de `~/.openclaw`,
LaunchAgents e canais pareados.

### Gate completo Pluto

```bash
npm run pluto:check
```

Aceite minimo:
- Checks OpenClaw sem `FAIL`.
- `openclaw_agent_smoke` retorna `OK PLUTO`.
- `pluto_sts_self_test` retorna `STS self-test completed`.
- `npm_lint` e `npm_build` passam.
- Evidencia fica em `output/monitoring/pluto-health-latest.json`.

Se `npm` nao estiver no PATH, rode o mesmo gate com o Node disponivel:

```bash
node scripts/pluto-health-check.mjs --full
```

Para teste HTTP local:

```bash
npm run dev
curl -fsS http://127.0.0.1:5173/ >/dev/null
```

## Como monitorar

Checks manuais recomendados:

```bash
/opt/homebrew/bin/openclaw status --deep
/opt/homebrew/bin/openclaw channels status --probe --timeout 20000
/opt/homebrew/bin/openclaw tasks audit
/opt/homebrew/bin/openclaw secrets audit --check
/opt/homebrew/bin/openclaw security audit --deep
```

Check consolidado recomendado:

```bash
npm run pluto:monitor
jq '.summary' output/monitoring/pluto-health-latest.json
jq '{status, alerts: [.alerts[]? | {severity, id, message, owner}]}' output/monitoring/pluto-alerts-latest.json
npm run pluto:alerts:route
jq '{status, summary, routes: [.routes[]? | {id, status, owner, destination, requiresHuman}]}' output/monitoring/pluto-alert-routes-latest.json
```

Politica atual do Pluto Ops:

- Canal esperado por padrao: Discord.
- STS mobile e STS local sao gates proprios do monitor.
- iMessage fica arquivado por padrao e nao entra na saude operacional principal.
- WhatsApp fica opcional enquanto nao for explicitamente esperado.

Para auditar iMessage como canal legado, rode explicitamente:

```bash
PLUTO_IMESSAGE_POLICY=active PLUTO_EXPECTED_CHANNELS=discord,imessage npm run pluto:monitor
```

Quando WhatsApp tambem for canal escolhido:

```bash
PLUTO_EXPECTED_CHANNELS=discord,whatsapp npm run pluto:monitor
```

Alertar se:
- Gateway nao estiver reachable.
- `/tools/invoke` aceitar POST sem token; o esperado e `401` ou `403`.
- Event loop nao estiver OK.
- `security audit` tiver qualquer `critical`.
- `secrets audit` nao estiver `clean`.
- Canal ativo ficar `disabled`, `stopped`, `disconnected` ou sem health OK.
- `imessage_archived` sumir quando iMessage deve permanecer fora do SLO principal.
- iMessage arquivado ainda aparecer ativo/running fora de `PLUTO_EXPECTED_CHANNELS`.
- Em auditoria opt-in, iMessage continuar em `self-chat` quando o objetivo for acesso via identidade dedicada.
- Em auditoria opt-in, `imessage_login_state` nao estiver `signed_in_dedicated` com credencial validada.
- Em auditoria opt-in, `imessage_login_state` detectar identidade pessoal ou numero do operador como identidade do Mac para o canal Pluto.
- Probe de modelo retornar `rate_limit`, `insufficient_quota`, `invalid_request_error` ou `timeout`.
- `tasks audit` apontar warnings novos fora de `docs/pluto-task-triage.md`.
- `output/monitoring/pluto-health-latest.json` tiver `.summary.status == "fail"`.
- `output/monitoring/pluto-alerts-latest.json` tiver `.status == "open"`.
- `output/monitoring/pluto-alert-routes-latest.json` tiver `.summary.blockingRoutes > 0`.
- `output/monitoring/pluto-alert-routes-latest.json` tiver `.summary.humanRoutes > 0` quando o objetivo declarado for merge/aprovacao completa do PR.

Contrato local de alerta:
- `output/monitoring/pluto-alerts-latest.json` e escrito a cada `npm run pluto:monitor`.
- `output/monitoring/pluto-alert-routes-latest.json` e escrito por `npm run pluto:monitor` e por `npm run pluto:alerts:route`.
- `src/data/plutoSnapshot.json` tambem e atualizado por `npm run pluto:monitor`, para o cockpit local refletir o ultimo monitor.
- Se o health passar mas o roteador ou import do snapshot falhar, `npm run pluto:monitor` deve sair diferente de zero.
- `.status == "clear"` significa nenhum check em `warn` ou `fail`.
- `.status == "open"` significa pelo menos um alerta com `severity`, `id`, `message`, `owner`, `command`, `metrics` e `runbook`.
- `warning` indica atencao operacional sem quebra do gate; `critical` indica check em `fail` e deve acionar rollback/triagem.
- Roteamento usa `status="human_review"` para PR limpo/mergeable sem reviewer elegivel. Isso e bloqueio humano, nao falha tecnica.
- Roteamento usa `status="open"` para warning acionavel que nao e handoff humano nem advisory.
- Roteamento usa `status="advisory"` para Tokenjuice/runtime gaps e outros limites conhecidos que nao devem gerar falso vermelho operacional.
- `gateway_tools_auth_probe` deve ficar `pass`; se falhar, trate como incidente de superficie de execucao.
- `imessage_archived` deve ficar `pass` no modo padrao.
- `imessage_login_state` e `imessage_topology` so devem aparecer quando `PLUTO_IMESSAGE_POLICY=active` ou `PLUTO_EXPECTED_CHANNELS` incluir `imessage`.
- Em auditoria opt-in, `imessage_login_state` deve ficar `warn` enquanto a Apple ID dedicada exigir criacao, recuperacao, CAPTCHA, e-mail/SMS ou 2FA humano.
- Em auditoria opt-in, `imessage_topology` pode ficar `warn` enquanto a Apple ID dedicada exigir criacao, CAPTCHA, e-mail/SMS ou 2FA humano.
- Em auditoria opt-in, `imessage_topology` deve ficar `fail` se `runtimeSelfChatLocalMirrorGuardPresent=false` durante fallback `self-chat`; nesse caso, restaure o backup do runtime ou reaplique o guard antes de aceitar operacao por iMessage.

Tokenjuice e PR:
- `tokenjuice:runtime-gap` deve permanecer advisory enquanto o runtime OpenClaw nao provar middleware de compaction seguro para saidas de tools.
- PR sem `reviewDecision` e roteado para `Human reviewer`; Codex nao deve marcar isso como verde final nem tentar aprovar o proprio PR.
- Checks remotos falhando no PR viram rota `critical` para Codex; PR limpo mas sem review vira rota humana.

Logs uteis:

```bash
/opt/homebrew/bin/openclaw logs --follow
/opt/homebrew/bin/openclaw logs --follow | rg "channels/whatsapp|channels/discord|openai|model|security|secrets"
```

## Como reverter

### Rollback de identidade dedicada iMessage

Use quando a Apple ID dedicada ficar bloqueada, o Messages voltar para conta pessoal ou o smoke criar eco.

```bash
/opt/homebrew/bin/openclaw config set --batch-json '[
  {"path":"channels.imessage.allowFrom","value":["<telefone-operador-e164>"]},
  {"path":"channels.imessage.groupAllowFrom","value":["<telefone-operador-e164>"]},
  {"path":"channels.imessage.enabled","value":true},
  {"path":"channels.imessage.responsePrefix","value":"[Pluto]"},
  {"path":"channels.imessage.catchup.enabled","value":true},
  {"path":"channels.imessage.coalesceSameSenderDms","value":true},
  {"path":"channels.whatsapp.accounts.default.enabled","value":false}
]' --strict-json --replace
/opt/homebrew/bin/openclaw config validate
/opt/homebrew/bin/openclaw gateway restart
```

Esse rollback restaura o fallback operacional, mas nao aprova o canal como final: `npm run pluto:monitor` deve continuar com `imessage_topology` aberto enquanto a topologia for `self-chat`.

### Desativar canal externo

Use quando houver loop de mensagens, contato errado, token suspeito ou instabilidade de canal.

```bash
/opt/homebrew/bin/openclaw config set channels.whatsapp.accounts.default.enabled false --strict-json
/opt/homebrew/bin/openclaw config set channels.discord.enabled false --strict-json
/opt/homebrew/bin/openclaw gateway restart
```

Depois valide:

```bash
/opt/homebrew/bin/openclaw channels status --probe --timeout 20000
```

### Desativar STS mobile

Use quando o token foi compartilhado por engano, o iPhone saiu da tailnet ou o
servidor precisa parar. Isso nao altera iMessage, WhatsApp, Discord nem o
gateway OpenClaw.

```bash
tailscale serve --https=443 --set-path /sts off
pkill -f 'scripts/pluto-sts-mobile-server.mjs'
tailscale serve status --json
```

Depois confirme que o handler `/sts` sumiu e que qualquer handler `/` existente
permanece exatamente como antes.

### Restaurar config OpenClaw

Antes de qualquer mudanca sensivel, crie backup:

```bash
ts=$(date +%Y%m%d-%H%M%S)
cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak.pluto-$ts
cp ~/.openclaw/secrets.json ~/.openclaw/secrets.json.bak.pluto-$ts
```

Para reverter, restaure o backup escolhido e reinicie:

```bash
cp ~/.openclaw/openclaw.json.bak.pluto-YYYYMMDD-HHMMSS ~/.openclaw/openclaw.json
/opt/homebrew/bin/openclaw config validate
/opt/homebrew/bin/openclaw gateway restart
```

### Reverter app local

```bash
git status --short
git diff -- docs README.md src scripts package.json
```

Reverta somente arquivos do projeto que foram alterados no PR. Nao remova nem sobrescreva `~/.openclaw` a partir do repo.

## Pendencias humanas

- Nenhuma pendencia Apple/iMessage no modo padrao: iMessage esta arquivado fora do SLO principal.
- Se iMessage for reativado explicitamente, criar/verificar a Apple ID dedicada e repetir o smoke anti-eco antes de voltar a chamar esse canal de pronto.
- Confirmar se WhatsApp deve entrar no SLO; por padrao, somente Discord e STS sao esperados.
- Confirmar destino do PR: repo/remoto alvo para `pluto-ops`.
- Confirmar destino de alertas: Discord DM, WhatsApp, email, dashboard local ou cron OpenClaw.
- Confirmar se Tailscale Serve deve continuar ligado para o gateway.
