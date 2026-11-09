#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const repoRoot = resolve(new URL('..', import.meta.url).pathname)
const openclaw = process.env.OPENCLAW_BIN || '/opt/homebrew/bin/openclaw'
const snapshotPath = resolve(repoRoot, 'src/data/plutoSnapshot.json')
const outputDir = resolve(repoRoot, 'output/mira-bridge')
const eventLogPath = resolve(outputDir, 'events.jsonl')
const latestStatePath = resolve(outputDir, 'latest-state.json')
const defaultSessionKey = 'agent:openclaw-main:mira-bridge'

function parseArgs(argv) {
  const options = {
    text: '',
    agent: process.env.PLUTO_MIRA_AGENT || 'openclaw-main',
    sessionKey: process.env.PLUTO_MIRA_SESSION_KEY || defaultSessionKey,
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
  npm run pluto:mira:turn -- --text "o que devo fazer agora?"
  npm run pluto:mira:self-test

Options:
  --text <text>            Intent from Paulo, Codex, or Mira.
  --agent <name>           OpenClaw agent, default openclaw-main.
  --session-key <key>      OpenClaw session key, default ${defaultSessionKey}.
  --json                   Print machine-readable proposal only.
  --self-test              Send a bounded smoke intent and validate proposal shape.
`)
}

function ensureDirs() {
  mkdirSync(outputDir, { recursive: true })
}

function sanitize(value, max = 1400) {
  return String(value || '')
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-REDACTED')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer REDACTED')
    .replace(/OPENCLAW_GATEWAY_TOKEN\s*=\s*\S+/gi, 'OPENCLAW_GATEWAY_TOKEN=REDACTED')
    .replace(/gateway\.auth\.token\s*[:=]\s*\S+/gi, 'gateway.auth.token=REDACTED')
    .replace(/\b[A-Za-z0-9_-]{32,}\.[A-Za-z0-9._-]{16,}\b/g, 'TOKEN.REDACTED')
    .trim()
    .slice(0, max)
}

function readSnapshot() {
  if (!existsSync(snapshotPath)) return null
  try {
    return JSON.parse(readFileSync(snapshotPath, 'utf8'))
  } catch {
    return null
  }
}

function compactContext(snapshot) {
  const alerts = Array.isArray(snapshot?.monitoring?.alerts) ? snapshot.monitoring.alerts : []
  const checks = Array.isArray(snapshot?.monitoring?.checks) ? snapshot.monitoring.checks : []
  const channels = Array.isArray(snapshot?.runtime?.channels) ? snapshot.runtime.channels : []
  return {
    schemaVersion: 1,
    source: 'src/data/plutoSnapshot.json',
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
        .slice(0, 6)
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
  }
}

function riskForIntent(text) {
  const normalized = String(text || '').toLowerCase()
  if (/(delete|remove|rm\s+-|reset|checkout|production|prod|stripe|payment|secret|token|senha|keychain|tailscale serve|funnel)/i.test(normalized)) {
    return 'high'
  }
  if (/(open|copy|cursor|mouse|keyboard|run|execute|login|imessage|messages|browser|osascript)/i.test(normalized)) {
    return 'medium'
  }
  return 'low'
}

function proposalId() {
  return `mira-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(16).slice(2, 8)}`
}

function runOpenClawTurn(message, options) {
  const result = spawnSync(openclaw, [
    'agent',
    '--agent',
    options.agent,
    '--session-key',
    options.sessionKey,
    '--message',
    message,
    '--timeout',
    '120',
    '--json',
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `/opt/homebrew/bin:/opt/homebrew/opt/node@24/bin:${process.env.PATH || ''}`,
    },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
  })

  if (result.error) throw new Error(result.error.message)
  if (result.status !== 0) throw new Error(`OpenClaw exited ${result.status}: ${sanitize(result.stderr, 600)}`)

  let parsed
  try {
    parsed = JSON.parse(result.stdout || '{}')
  } catch (error) {
    throw new Error(`OpenClaw returned invalid JSON: ${error.message}`, { cause: error })
  }

  const text = parsed?.result?.payloads?.map((payload) => payload.text).filter(Boolean).join('\n').trim()
  if (!text) throw new Error('Pluto returned an empty Mira bridge proposal')
  return { text: sanitize(text), status: sanitize(parsed.status ?? 'unknown', 80) }
}

function buildBridgePrompt(intent, context) {
  return [
    'Entrada para Pluto via Mira Bridge.',
    'Papel: Pluto deve atuar em modo leitura/proposta, nao executar acoes.',
    'Responda em portugues, curto e operacional.',
    'Nunca exponha secrets, tokens, chaves, senhas, conteudo privado de mensagens ou dados brutos.',
    'Se houver acao de cursor, browser, OS, producao, conta ou secret, trate como proposta dependente de aprovacao humana.',
    'Formato desejado: uma decisao recomendada, uma razao e um proximo passo seguro.',
    '',
    `Intent sanitizado: ${sanitize(intent, 500)}`,
    `Contexto sanitizado: ${JSON.stringify(context)}`,
  ].join('\n')
}

function writeEvent(event) {
  ensureDirs()
  appendFileSync(eventLogPath, `${JSON.stringify(event)}\n`, { mode: 0o600 })
}

function buildState(proposal, context) {
  return {
    schemaVersion: 1,
    petId: 'mira-cursor',
    plutoStatus: context.runtime.gatewayReachable ? 'reachable' : 'unreachable',
    codexStatus: 'ready',
    activeSurface: 'mira',
    pendingProposals: [proposal],
    lastSafeEvent: {
      type: 'proposal_created',
      at: proposal.createdAt,
      source: proposal.source,
      target: proposal.target,
      risk: proposal.risk,
    },
  }
}

function runTurn(text, options) {
  const snapshot = readSnapshot()
  const context = compactContext(snapshot)
  const intent = text.trim()
  if (!intent) throw new Error('Mira intent is empty')

  const bridgePrompt = buildBridgePrompt(intent, context)
  const pluto = runOpenClawTurn(bridgePrompt, options)
  const proposal = {
    schemaVersion: 1,
    id: proposalId(),
    createdAt: new Date().toISOString(),
    source: options.selfTest ? 'mira:self-test' : 'mira:operator',
    target: 'pluto/openclaw-main',
    intent: sanitize(intent, 420),
    risk: riskForIntent(intent),
    summary: pluto.text,
    suggestedCommand: 'npm run pluto:monitor',
    requiresApproval: true,
    execution: 'proposal_only',
  }

  const state = buildState(proposal, context)
  ensureDirs()
  writeFileSync(latestStatePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  writeEvent({
    schemaVersion: 1,
    at: proposal.createdAt,
    type: 'proposal_created',
    proposalId: proposal.id,
    source: proposal.source,
    target: proposal.target,
    risk: proposal.risk,
    intentLength: intent.length,
    summaryLength: proposal.summary.length,
    execution: proposal.execution,
  })
  return { proposal, state, plutoStatus: pluto.status }
}

function assertSelfTest(result) {
  const proposal = result.proposal
  const failures = []
  if (proposal.requiresApproval !== true) failures.push('requiresApproval must be true')
  if (proposal.execution !== 'proposal_only') failures.push('execution must be proposal_only')
  if (!proposal.summary) failures.push('summary is empty')
  if (!['low', 'medium', 'high'].includes(proposal.risk)) failures.push('risk invalid')
  if (failures.length > 0) throw new Error(`Mira bridge self-test failed: ${failures.join(', ')}`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const text = options.selfTest
    ? 'Mira self-test: confirme que Pluto esta em modo proposta, sem executar cursor ou OS.'
    : options.text
  const result = runTurn(text, options)
  if (options.selfTest) assertSelfTest(result)

  if (options.json || options.selfTest) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`Mira proposal: ${result.proposal.summary}`)
    console.log(`Risk: ${result.proposal.risk} · Approval: ${result.proposal.requiresApproval ? 'required' : 'not required'}`)
  }
}

main().catch((error) => {
  const payload = {
    schemaVersion: 1,
    ok: false,
    surface: 'pluto/mira-bridge',
    error: sanitize(error.message, 1000),
  }
  console.error(JSON.stringify(payload, null, 2))
  process.exit(1)
})
