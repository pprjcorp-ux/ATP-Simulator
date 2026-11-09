# Pluto Ops

Cockpit local para acompanhar o estado operacional da instancia OpenClaw/Discord `Pluto`.

O app e deliberadamente local-first: ele nao le secrets, nao chama producao e nao executa comandos destrutivos. A primeira versao consolida o inventario atual de acessos, pendencias humanas e comandos de validacao em uma interface navegavel.
A aba `STS` mostra o acesso rapido por voz para Mac Mini e iPhone, incluindo
readiness, comandos, smoke humano e probe local com token efemero.
A aba `Mira` mostra a ponte segura entre Paulo, Codex e Pluto/OpenClaw: a Mira
usa o pet local `mira-cursor`, transforma respostas de Pluto em propostas e
mantem cursor/OS atras de aprovacao humana.
O `Codex Relay` e a via operacional para Codex consultar Pluto como segundo
operador: Pluto revisa risco, proximo movimento e evidencia, mas retorna sempre
em modo `advisory_only`.

## Rodando

```bash
npm install
npm run snapshot:import
npm run dev
```

Abra `http://127.0.0.1:5173`. Para ir direto ao dashboard de voz, abra
`http://127.0.0.1:5173/?surface=sts`.
Para ir direto a ponte Mira, abra `http://127.0.0.1:5173/?surface=mira`.

Se o terminal nao encontrar `npm`, carregue o Node local do Homebrew antes dos comandos:

```bash
export PATH=/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:$PATH
```

## Validacao

```bash
npm run lint
npm run build
```

Checks operacionais do Pluto:

```bash
npm run pluto:monitor
npm run pluto:check
npm run pluto:sts:self-test
npm run pluto:sts
npm run pluto:sts:mobile
npm run pluto:sts:mobile:start
npm run pluto:sts:mobile:status
npm run pluto:sts:mobile:stop
npm run pluto:mira:self-test
npm run pluto:mira:turn -- --text "Mira, peca ao Pluto um proximo passo seguro"
npm run pluto:codex:self-test
npm run pluto:codex:turn -- --text "Pluto, revise meu proximo passo como Codex"
npm run pluto:alerts:route
```

Para habilitar o alvo iPhone/STS no Cockpit, configure a URL pública antes do
build/dev server:

```bash
export PLUTO_STS_MOBILE_PUBLIC_URL=<https-tailnet-sts-url>
export VITE_PLUTO_STS_PUBLIC_URL=<https-tailnet-sts-url>
npm run pluto:sts:mobile:start
```

Politica atual de canais:

- `PLUTO_EXPECTED_CHANNELS` padrao: `discord`.
- `PLUTO_IMESSAGE_POLICY` padrao: `archived`.
- iMessage e Apple ID dedicada nao fazem parte da saude operacional principal.
- WhatsApp e outros canais pareados, mas fora da lista esperada, aparecem como opcionais/arquivados.

Para auditar iMessage manualmente sem reativar como requisito permanente:

```bash
PLUTO_IMESSAGE_POLICY=active PLUTO_EXPECTED_CHANNELS=discord,imessage npm run pluto:monitor
npm run pluto:imessage-login:summary
```

`pluto:monitor` grava:

- `output/monitoring/pluto-health-latest.json`: checks, metricas e status geral.
- `output/monitoring/pluto-alerts-latest.json`: alertas em aberto com owner, comando e runbook.
- `output/monitoring/pluto-alert-routes-latest.json`: roteamento local de alertas, Tokenjuice e PR.
- `src/data/plutoSnapshot.json`: snapshot sanitizado usado pelo cockpit local.

Se o health passar, mas o roteador ou import do snapshot falhar, `pluto:monitor`
tambem falha. Isso evita cockpit stale com status verde.

`pluto:alerts:route` separa tres conceitos:

- alerta tecnico: vem de `pluto-alerts-latest.json` e pode ser `warning` ou `critical`;
- handoff humano: PR limpo/mergeable sem review, credencial externa ou aprovacao;
- advisory: limitacao conhecida, como `Tokenjuice runtime_gap`, que deve aparecer no Cockpit sem quebrar Discord + STS.

Checks de runtime OpenClaw ficam locais porque dependem de `~/.openclaw` e dos
canais pareados nesta maquina. GitHub Actions exige credencial com escopo
`workflow` para criar ou alterar `.github/workflows/*`.

`pluto:imessage-login` e um checker legado read-only e sanitizado. Ele classifica o estado do
Messages para a Apple ID dedicada do Pluto sem imprimir senha, token ou conteudo
de mensagens. Use `npm run pluto:imessage-login:summary` para uma leitura
operacional curta; `credentials` e `checks` continuam
disponiveis para auditoria. Alem da UI do Messages, o checker le os plists IDS/iMessage e
reporta somente contagens/booleanos; `idsActiveAccountCount=0` significa que nao
ha conta iMessage ativa aceita neste Mac. Para limpar apenas uma senha candidata
ja marcada como invalida, rode `scripts/pluto-imessage-login-state.mjs --prune-invalid-candidate`.
O campo `loginPhase` resume a fase operacional sem expor dados sensiveis:
`messages_login_form_visible`, `submitted_or_closed_without_ids`,
`apple_login_error_visible`, `apple_verification_prompt_visible`,
`messages_ids_pending` ou `dedicated_identity_active`.
Se o e-mail dedicado ainda nao existir como Conta Apple, o estado deve ficar
`OpenClaw Pluto Apple ID credential status=account_missing` ate a criacao em
`https://account.apple.com/account`. Quando houver e-mail e telefone verificaveis,
use `npm run pluto:apple-id:provision -- --generate-password`; ele gera uma senha
candidata forte, salva somente no Keychain, copia para o clipboard e marca
`candidate_pending`. Se `PLUTO_APPLE_ID_VERIFICATION_PHONE` estiver definido,
o provisionador salva esse telefone no Keychain e mostra apenas o valor
mascarado nos diagnosticos. So marque `validated` depois que a Apple aceitar a conta e
o Messages logar com a identidade dedicada. Se a senha sumir do formulario ou o
salvamento local de senha falhar, restaure a candidata no clipboard com
`npm run pluto:apple-id:copy-password`. Para preencher o formulario sem imprimir
dado sensivel, use tambem `npm run pluto:apple-id:copy-email` e
`npm run pluto:apple-id:copy-phone`. Para checar qual valor esta no clipboard
sem imprimir o conteudo, use `npm run pluto:apple-id:clipboard`.
Se a senha candidata mudar, atualize o Keychain via stdin silencioso, sem
colocar a senha no historico do shell:

```bash
read -s PLUTO_APPLE_PASSWORD
printf '%s' "$PLUTO_APPLE_PASSWORD" | npm run pluto:apple-id:update-password
unset PLUTO_APPLE_PASSWORD
```

Se a senha ja estiver no clipboard, use
`npm run pluto:apple-id:update-password-from-clipboard`; o comando valida forma
basica, grava no Keychain e nao imprime o conteudo.

Para tentar o login no Messages com a senha candidata guardada no Keychain, use
`npm run pluto:apple-id:submit-messages`; ele nao tenta resolver 2FA/CAPTCHA e
continua exigindo prova IDS antes de marcar `validated`. Cada tentativa grava
`output/monitoring/pluto-apple-id-submit-latest.json` com evidencia sanitizada:
timestamp, estado antes/depois, fase e booleans IDS.
O botao/prompt "Salvar senha" do navegador ou macOS nao cria nem valida a Conta
Apple; se ele der erro, ignore esse salvamento local e continue somente pelo
formulario oficial da Apple. O estado correto continua `candidate_pending` ate
Apple aceitar cadastro/login, e-mail/SMS/CAPTCHA passarem e o Messages provar
uma conta IDS ativa.
Se o checker mostrar `login_error` enquanto a senha ainda esta
`candidate_pending`, a Apple rejeitou essa credencial no Messages; crie/verifique
a conta se ela ainda nao existir, ou use recuperacao Apple antes de tentar login
de novo.
Depois que a Apple aceitar a conta e o Messages entrar sem erro, marque a
credencial depois do preflight:

```bash
npm run pluto:apple-id:ready
npm run pluto:apple-id:credential -- --mark-validated --confirm-apple-accepted
```

O comando de marcacao tambem pode ser chamado diretamente com
`npm run pluto:apple-id:credential -- --mark-validated --confirm-apple-accepted`.
Esse comando recusa a marcacao se os plists IDS/iMessage ainda nao provarem
conta ativa com a Apple ID dedicada.
Data de nascimento, CAPTCHA e codigos de e-mail/SMS continuam sendo etapas
humanas; nao invente nem automatize esses dados.
Para preparar esse fluxo sem tocar em senha, rode `npm run pluto:apple-id:provision`;
ele preserva o marcador Keychain atual, abre a criacao/recuperacao oficial da
Apple, prepara o Messages e imprime um diagnostico sanitizado. Use
`--force-reset-status` somente se quiser voltar explicitamente para
`account_missing`. Quando for encadear com `jq`, use
`node scripts/pluto-apple-account-provision.mjs --json` ou
`npm --silent run pluto:apple-id:provision -- --json`; `npm run ... | jq`
inclui cabecalho do npm e quebra o parse.
Para retomar a etapa humana com o minimo de passos, rode
`npm run pluto:apple-id:handoff`: ele abre os fluxos oficiais da Apple, abre
Messages e copia o e-mail dedicado para o clipboard. Depois use os comandos
`copy-phone` e `copy-password` conforme o formulario pedir.

`pluto:sts` abre um turno rapido speech-to-speech local: captura o microfone,
transcreve via OpenClaw, envia para o agente Pluto e toca a resposta por voz.
Para uma validacao sem microfone humano, use `npm run pluto:sts:self-test`.

`pluto:sts:mobile` abre uma PWA STS local para iPhone. O servidor escuta apenas
`127.0.0.1`, exige token Bearer e deve ser publicado somente dentro da tailnet
com Tailscale Serve:

```bash
npm run pluto:sts:mobile:start
npm run pluto:sts:mobile:status
tailscale serve --bg --https=443 --set-path /sts http://127.0.0.1:8787
```

Use no iPhone o link real salvo localmente em
`tmp/sts-mobile/current-public-url`; `status` e `server.log` nao imprimem o
token. O token e efemero quando `PLUTO_STS_MOBILE_TOKEN` nao esta definido.

`pluto:mira:turn` e o bridge local Paulo/Codex/Mira -> Pluto. Ele envia uma
intencao sanitizada e um resumo do snapshot local para `openclaw-main`, retorna
uma proposta com `requiresApproval=true` e grava apenas metadados sanitizados em
`output/mira-bridge/`. Ele nao executa cursor, browser, OS, producao ou secrets.
Use `npm run pluto:mira:self-test` para provar que o caminho continua em modo
`proposal_only`.

`pluto:codex:turn` e o relay Codex -> Pluto -> Codex. Ele envia para Pluto
somente um intent sanitizado, snapshot sanitizado e resumo de worktree; Pluto
retorna uma revisao consultiva com `execution="advisory_only"` e
`requiresCodexReview=true`. Use quando Codex precisar de uma segunda leitura
operacional antes de editar, rodar checks, acionar Mira ou pedir uma pendencia
humana. O log em `output/codex-pluto/` preserva metadados e a ultima resposta
sanitizada; `output/` continua fora do git.

Se o iPhone ainda nao estiver no Tailscale, o servidor tambem aceita fallback
LAN com `--host 0.0.0.0`; nesse modo, use o campo de texto/ditado da PWA porque
microfone de navegador exige HTTPS confiavel.

Se precisar rodar dentro do Codex sem `npm` no PATH, o gate completo tambem pode ser chamado direto pelo Node atual:

```bash
node scripts/pluto-health-check.mjs --full
```

Se o build falhar ao carregar bindings nativos de Rollup/Rolldown, use o Node local do Homebrew:

```bash
PATH=/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:$PATH npm run build
```

Se o erro for assinatura/quarantine em bindings nativos, rode:

```bash
npm run repair:native
```

## Conteudo operacional

- Gateway: `127.0.0.1:18789`
- Agente: `openclaw-main`
- Identidade: `Pluto`
- Persona: `Pluto Court Maestro` (`config/pluto-persona.json`)
- Inventario fonte: `ACCESS_INVENTORY.md`
- Plano de execucao Pluto: `docs/pluto-execution-plan.md`
- Runbook operacional: `docs/pluto-runbook.md`
- Triagem de tasks: `docs/pluto-task-triage.md`
- Snapshot fonte: `~/.openclaw/workspaces/openclaw-main/logs/weekly-pre-timemachine/latest.json`
- Snapshot sanitizado: `src/data/plutoSnapshot.json`

## Proximos incrementos seguros

- Conectar novas secoes do cockpit ao snapshot sanitizado, nao ao JSON bruto do OpenClaw.
- Conectar status em tempo real somente via endpoint local autenticado.
- Criar `.env.example` quando houver backend/API real.
- Evoluir Mira Bridge para consumir propostas ao vivo via endpoint loopback
  autenticado, mantendo o default atual como leitura/proposta.
