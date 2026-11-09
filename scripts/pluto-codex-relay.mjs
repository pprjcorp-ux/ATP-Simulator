#!/usr/bin/env node

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const repoRoot = resolve(new URL('..', import.meta.url).pathname)
const openclaw = process.env.OPENCLAW_BIN || '/opt/homebrew/bin/openclaw'
const snapshotPath = resolve(repoRoot, 'src/data/plutoSnapshot.json')
const outputDir = resolve(repoRoot, 'output/codex-pluto')
const latestExchangePath = resolve(outputDir, 'latest-exchange.json')
const eventLogPath = resolve(outputDir, 'events.jsonl')
const defaultSessionKey = 'agent:openclaw-main:codex-relay'

function parseArgs(argv) {
  const options = {
    text: '',
    agent: process.env.PLUTO_CODEX_AGENT || 'openclaw-main',
    sessionKey: process.env.PLUTO_CODEX_SESSION_KEY || defaultSessionKey,
    json: false,
    selfTest: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => argv[++index] || ''
    if (arg === '--text') options.text = next()
    else if (arg === '--agent') options.agent = next()
    else if (arg === '--session-key') options.sessionKey = next()
    else if (arg === '--json') options.json = true
    else if (arg === '--self-test') options.selfTest = true
    else if (arg === '--help' || arg === '-h') options.help = true
  }

  return options
}

function printHelp() {
  console.log(`Usage:
  npm run pluto:codex:turn -- --text "Pluto, revise meu proximo passo"
  npm run pluto:codex:self-test

Options:
  --text <text>            Codex intent/question for Pluto.
  --agent <name>           OpenClaw agent, default openclaw-main.
  --session-key <key>      OpenClaw session key, default ${defaultSessionKey}.
  --json                   Print machine-readable exchange.
  --self-test              Validate relay shape with a bounded live Pluto turn.
`)
}

function ensureDirs() {
  mkdirSync(outputDir, { recursive: true })
}

function sanitize(value, max = 1600) {
  return String(value || '')
    .replace(/\bsk-[A-Za-z0-9._-]+\b/g, 'sk-REDACTED')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer REDACTED')
    .replace(/\bOPENAI_API_KEY\s*[:=]\s*\S+/gi, 'OPENAI_API_KEY=REDACTED')
    .replace(/OPENCLAW_GATEWAY_TOKEN\s*=\s*\S+/gi, 'OPENCLAW_GATEWAY_TOKEN=REDACTED')
    .replace(/gateway\.auth\.token\s*[:=]\s*\S+/gi, 'gateway.auth.token=REDACTED')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '<redacted-email>')
    .trim()
    .slice(0, max)
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `/opt/homebrew/bin:/opt/homebrew/opt/node@24/bin:${process.env.PATH || ''}`,
    },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
    ...options,
  })
}

function readJson(path) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function gitSummary() {
  const result = run('git', ['status', '--short'])
  if (result.status !== 0) {
    return { available: false, modified: 0, untracked: 0, files: [] }
  }

  const files = String(result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => sanitize(line, 120))

  return {
    available: true,
    modified: files.filter((line) => !line.startsWith('??')).length,
    untracked: files.filter((line) => line.startsWith('??')).length,
    files: files.slice(0, 16),
  }
}

function compactContext(snapshot) {
  const alerts = Array.isArray(snapshot?.monitoring?.alerts) ? snapshot.monitoring.alerts : []
  const checks = Array.isArray(snapshot?.monitoring?.checks) ? snapshot.monitoring.checks : []
  const channels = Array.isArray(snapshot?.runtime?.channels) ? snapshot.runtime.channels : []

  return {
    schemaVersion: 1,
    source: 'src/data/plutoSnapshot.json + git status --short',
    sanitized: snapshot?.validation?.sanitized === true,
    runtime: {
      gatewayReachable: snapshot?.runtime?.gatewayReachable === true,
      gatewayLatencyMs: snapshot?.runtime?.gatewayLatencyMs ?? null,
      nodeStatus: sanitize(snapshot?.runtime?.nodeStatus ?? 'unknown', 80),
    },
    monitoring: {
      status: sanitize(snapshot?.monitoring?.status ?? 'unknown', 80),
      pass: Number(snapshot?.monitoring?.summary?.pass ?? 0),
      warn: Number(snapshot?.monitoring?.summary?.warn ?? 0),
      fail: Number(snapshot?.monitoring?.summary?.fail ?? 0),
      openAlerts: alerts
        .filter((alert) => alert.status === 'open')
        .slice(0, 8)
        .map((alert) => ({
          id: sanitize(alert.id, 80),
          severity: sanitize(alert.severity, 40),
          message: sanitize(alert.message, 240),
        })),
      passingChecks: checks.filter((check) => check.status === 'pass').length,
    },
    channels: channels.map((channel) => ({
      key: sanitize(channel.key, 40),
      configured: channel.configured === true,
      running: channel.running === true,
      healthState: sanitize(channel.healthState ?? channel.statusState ?? 'unknown', 80),
      lastError: sanitize(channel.lastError ?? '', 160),
    })),
    worktree: gitSummary(),
  }
}

function riskForIntent(text) {
  const normalized = String(text || '').toLowerCase()
  if (/(delete|remove|rm\s+-|reset|checkout|production|prod|stripe|payment|secret|token|senha|keychain|tailscale serve|funnel|deploy|publish)/i.test(normalized)) {
    return 'high'
  }
  if (/(open|copy|cursor|mouse|keyboard|run|execute|login|imessage|messages|browser|osascript|discord|github|commit|push)/i.test(normalized)) {
    return 'medium'
  }
  return 'low'
}

function relayId() {
  return `codex-pluto-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(16).slice(2, 8)}`
}

function buildPrompt(intent, context) {
  return [
    'Entrada para Pluto via Codex Relay.',
    'Papel: Pluto e par operacional de Codex, nao executor automatico.',
    'Ajude Codex a decidir o proximo passo, revisar riscos e escolher evidencia de verificacao.',
    'Responda em portugues, curto, direto e operacional.',
    'Nunca exponha secrets, tokens, chaves, senhas, conteudo privado de mensagens ou logs brutos.',
    'Nao execute acoes. Se algo exigir cursor, OS, conta externa, producao, pagamento ou segredo, marque como dependente de aprovacao humana.',
    'Formato desejado: leitura do estado, risco principal, proximo movimento para Codex, evidencia que Codex deve colher.',
    '',
    `Intent Codex sanitizado: ${sanitize(intent, 700)}`,
    `Contexto sanitizado: ${JSON.stringify(context)}`,
  ].join('\n')
}

function runPluto(prompt, options) {
  const result = run(openclaw, [
    'agent',
    '--agent',
    options.agent,
    '--session-key',
    options.sessionKey,
    '--message',
    prompt,
    '--timeout',
    '120',
    '--json',
  ])

  if (result.error) throw new Error(result.error.message)
  if (result.status !== 0) throw new Error(`OpenClaw exited ${result.status}: ${sanitize(result.stderr, 600)}`)

  let parsed
  try {
    parsed = JSON.parse(result.stdout || '{}')
  } catch (error) {
    throw new Error(`OpenClaw returned invalid JSON: ${error.message}`, { cause: error })
  }

  const text = parsed?.result?.payloads?.map((payload) => payload.text).filter(Boolean).join('\n').trim()
  if (!text) throw new Error('Pluto returned an empty Codex relay response')
  return { text: sanitize(text, 1800), status: sanitize(parsed.status ?? 'unknown', 80) }
}

function writeEvent(exchange) {
  ensureDirs()
  appendFileSync(eventLogPath, `${JSON.stringify({
    schemaVersion: 1,
    at: exchange.createdAt,
    type: 'codex_relay_exchange',
    exchangeId: exchange.id,
    route: exchange.route,
    risk: exchange.risk,
    intentLength: exchange.intent.length,
    responseLength: exchange.plutoResponse.length,
    execution: exchange.execution,
  })}\n`, { mode: 0o600 })
}

function runRelay(text, options) {
  const intent = sanitize(text, 900)
  if (!intent) throw new Error('Codex relay intent is empty')

  const snapshot = readJson(snapshotPath)
  const context = compactContext(snapshot)
  const pluto = runPluto(buildPrompt(intent, context), options)
  const exchange = {
    schemaVersion: 1,
    id: relayId(),
    createdAt: new Date().toISOString(),
    surface: 'pluto/codex-relay',
    route: 'codex -> pluto/openclaw-main -> codex',
    source: options.selfTest ? 'codex:self-test' : 'codex',
    target: 'pluto/openclaw-main',
    intent,
    risk: riskForIntent(intent),
    execution: 'advisory_only',
    requiresCodexReview: true,
    contextSanitized: context.sanitized === true,
    plutoStatus: pluto.status,
    plutoResponse: pluto.text,
    suggestedCodexCommand: 'npm run pluto:monitor',
  }

  ensureDirs()
  writeFileSync(latestExchangePath, `${JSON.stringify(exchange, null, 2)}\n`, { mode: 0o600 })
  writeEvent(exchange)
  return exchange
}

function assertSelfTest(exchange) {
  const failures = []
  if (exchange.execution !== 'advisory_only') failures.push('execution must be advisory_only')
  if (exchange.requiresCodexReview !== true) failures.push('requiresCodexReview must be true')
  if (exchange.contextSanitized !== true) failures.push('contextSanitized must be true')
  if (!exchange.plutoResponse) failures.push('plutoResponse is empty')
  if (!['low', 'medium', 'high'].includes(exchange.risk)) failures.push('risk invalid')
  if (failures.length > 0) throw new Error(`Codex relay self-test failed: ${failures.join(', ')}`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const text = options.selfTest
    ? 'Codex self-test: revise se o relay Codex-Pluto esta em modo consultivo e diga o proximo passo seguro para Codex.'
    : options.text
  const exchange = runRelay(text, options)
  if (options.selfTest) assertSelfTest(exchange)

  if (options.json || options.selfTest) {
    console.log(JSON.stringify(exchange, null, 2))
  } else {
    console.log(`Pluto for Codex: ${exchange.plutoResponse}`)
    console.log(`Risk: ${exchange.risk} · Execution: ${exchange.execution}`)
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    schemaVersion: 1,
    ok: false,
    surface: 'pluto/codex-relay',
    error: sanitize(error.message, 1000),
  }, null, 2))
  process.exit(1)
})
