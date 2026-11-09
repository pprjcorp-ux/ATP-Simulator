#!/usr/bin/env node

import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import process from 'node:process'

const repoRoot = resolve(new URL('..', import.meta.url).pathname)
const openclaw = process.env.OPENCLAW_BIN || '/opt/homebrew/bin/openclaw'
const tmpDir = resolve(repoRoot, 'tmp/sts-mobile')
const speechDir = resolve(repoRoot, 'output/speech')
const serverLogPath = resolve(tmpDir, 'server.log')
const serverPidPath = resolve(tmpDir, 'server.pid')
const currentTokenPath = resolve(tmpDir, 'current-token')
const currentPublicUrlPath = resolve(tmpDir, 'current-public-url')
const defaultSessionKey = 'agent:openclaw-main:pluto-sts-mobile'
const defaultPort = Number(process.env.PLUTO_STS_MOBILE_PORT || 8787)
const defaultHost = process.env.PLUTO_STS_MOBILE_HOST || '127.0.0.1'
const maxBodyBytes = Number(process.env.PLUTO_STS_MOBILE_MAX_BYTES || 8 * 1024 * 1024)
const generatedToken = process.env.PLUTO_STS_MOBILE_TOKEN || randomBytes(24).toString('base64url')

function parseArgs(argv) {
  const options = {
    host: defaultHost,
    port: defaultPort,
    token: generatedToken,
    agent: process.env.PLUTO_STS_AGENT || 'openclaw-main',
    sessionKey: process.env.PLUTO_STS_MOBILE_SESSION_KEY || defaultSessionKey,
    language: process.env.PLUTO_STS_LANGUAGE || 'pt',
    publicBaseUrl: process.env.PLUTO_STS_MOBILE_PUBLIC_URL || '',
    selfTest: false,
    daemon: false,
    status: false,
    stop: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => argv[++index] || ''
    if (arg === '--host') options.host = next()
    else if (arg === '--port') options.port = Number(next())
    else if (arg === '--token') options.token = next()
    else if (arg === '--agent') options.agent = next()
    else if (arg === '--session-key') options.sessionKey = next()
    else if (arg === '--language') options.language = next()
    else if (arg === '--public-base-url') options.publicBaseUrl = next()
    else if (arg === '--self-test') options.selfTest = true
    else if (arg === '--daemon') options.daemon = true
    else if (arg === '--status') options.status = true
    else if (arg === '--stop') options.stop = true
    else if (arg === '--help' || arg === '-h') options.help = true
  }

  return options
}

function printHelp() {
  console.log(`Usage:
  npm run pluto:sts:mobile
  npm run pluto:sts:mobile:start
  npm run pluto:sts:mobile:status
  npm run pluto:sts:mobile:stop
  npm run pluto:sts:mobile -- --port 8787 --public-base-url <https-tailnet-sts-url>
  npm run pluto:sts:mobile -- --self-test

Options:
  --host <host>             Bind host. Default: ${defaultHost}
  --port <port>             Bind port. Default: ${defaultPort}
  --token <token>           Bearer token. Default: random per process.
  --public-base-url <url>   URL printed for the iPhone.
  --session-key <key>       OpenClaw session key. Default: ${defaultSessionKey}
  --self-test               Run a local STT -> Pluto -> TTS fixture without starting HTTP.
  --daemon                  Start server detached and validate health.
  --status                  Print detached server status without token.
  --stop                    Stop detached server pid if it is still alive.
`)
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function ensureDirs() {
  mkdirSync(tmpDir, { recursive: true })
  mkdirSync(speechDir, { recursive: true })
}

function chmodPrivate(path) {
  try {
    chmodSync(path, 0o600)
  } catch {
    // Best-effort hardening; callers still validate health/status separately.
  }
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `/opt/homebrew/bin:/opt/homebrew/opt/node@24/bin:${process.env.PATH || ''}`,
    },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 12,
    ...options,
  })
}

function sanitize(value, max = 1000) {
  return String(value || '')
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-REDACTED')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer REDACTED')
    .trim()
    .slice(0, max)
}

function fail(message, details = {}) {
  const error = new Error(message)
  error.details = details
  throw error
}

function parseJsonCommand(command, args, label) {
  const result = run(command, args)
  if (result.error) fail(`${label} failed to start`, { error: result.error.message })
  if (result.status !== 0) {
    fail(`${label} failed`, {
      exitCode: result.status,
      stderr: sanitize(result.stderr),
    })
  }
  try {
    return JSON.parse(result.stdout || '{}')
  } catch (error) {
    fail(`${label} returned invalid JSON`, { error: error.message })
  }
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
}

function looksLikePromptEcho(text, prompt) {
  const normalizedText = normalizeText(text)
  const normalizedPrompt = normalizeText(prompt)
  if (!normalizedText) return true
  if (normalizedText === normalizedPrompt) return true
  if (normalizedText.startsWith('vocabulario pluto openclaw codex')) return true
  const promptWords = new Set(normalizedPrompt.split(/\s+/).filter(Boolean))
  const textWords = normalizedText.split(/\s+/).filter(Boolean)
  if (textWords.length < 4) return false
  const promptWordCount = textWords.filter((word) => promptWords.has(word)).length
  return promptWordCount / textWords.length > 0.85
}

function transcribe(audioPath, options) {
  const models = ['elevenlabs/scribe_v2', 'openai/gpt-4o-transcribe', 'openai/gpt-4o-mini-transcribe']
  const prompt = 'Vocabulario: Pluto, OpenClaw, Codex, STS, speech-to-speech, iPhone, Tailscale.'
  const errors = []

  for (const model of models) {
    for (const withPrompt of [true, false]) {
      const args = ['infer', 'audio', 'transcribe', '--model', model, '--file', audioPath, '--language', options.language]
      if (withPrompt) args.push('--prompt', prompt)
      args.push('--json')
      const result = run(openclaw, args)
      if (result.status !== 0) {
        errors.push({ model, withPrompt, stderr: sanitize(result.stderr, 600) })
        continue
      }
      try {
        const parsed = JSON.parse(result.stdout || '{}')
        const text = parsed?.outputs?.map((entry) => entry.text).filter(Boolean).join('\n').trim()
        if (text && !looksLikePromptEcho(text, prompt)) return { model, text }
        if (text) errors.push({ model, withPrompt, reason: 'prompt_echo_or_no_operator_speech' })
      } catch (error) {
        errors.push({ model, withPrompt, error: error.message })
      }
    }
  }

  fail('Could not transcribe mobile audio input', { audioFile: basename(audioPath), errors })
}

function agentTurn(transcript, options) {
  const message = [
    'Entrada STS mobile do operador para Pluto.',
    'Responda em portugues, curto e operacional.',
    'Nao exponha secrets, tokens, chaves ou conteudo privado.',
    'Se a entrada pedir um smoke exato, respeite exatamente.',
    '',
    `Transcricao do operador: ${transcript}`,
  ].join('\n')
  const parsed = parseJsonCommand(openclaw, [
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
  ], 'Pluto mobile STS turn')
  const text = parsed?.result?.payloads?.map((payload) => payload.text).filter(Boolean).join('\n').trim()
  if (!text) fail('Pluto returned an empty mobile STS response', { status: parsed?.status })
  return { text }
}

function synthesize(text, outputPath) {
  const attempts = [
    {
      provider: 'elevenlabs',
      mime: 'audio/mpeg',
      args: ['infer', 'tts', 'convert', '--gateway', '--model', 'elevenlabs/eleven_multilingual_v2', '--text', text, '--output', outputPath, '--json'],
    },
    {
      provider: 'openai',
      mime: 'audio/mpeg',
      args: ['infer', 'tts', 'convert', '--gateway', '--model', 'openai/gpt-4o-mini-tts', '--voice', 'cedar', '--text', text, '--output', outputPath, '--json'],
    },
  ]

  for (const attempt of attempts) {
    const result = run(openclaw, attempt.args)
    if (result.status === 0 && existsSync(outputPath)) {
      return {
        provider: attempt.provider,
        outputPath,
        mime: attempt.mime,
      }
    }
  }

  fail('Could not synthesize mobile Pluto speech', { outputFile: basename(outputPath) })
}

function contentTypeToExtension(contentType) {
  const normalized = String(contentType || '').split(';')[0].trim().toLowerCase()
  if (normalized === 'audio/webm') return '.webm'
  if (normalized === 'audio/mp4') return '.m4a'
  if (normalized === 'audio/mpeg') return '.mp3'
  if (normalized === 'audio/wav' || normalized === 'audio/wave' || normalized === 'audio/x-wav') return '.wav'
  return '.audio'
}

function processAudioTurn(audioPath, options) {
  const transcript = transcribe(audioPath, options)
  return processTextTurn(transcript.text, options, { sttModel: transcript.model })
}

function processTextTurn(text, options, extra = {}) {
  const transcript = String(text || '').trim()
  if (!transcript) fail('Text turn is empty')
  const agent = agentTurn(transcript, options)
  const speech = synthesize(agent.text, resolve(speechDir, `pluto-sts-mobile-response-${timestamp()}.mp3`))
  return {
    schemaVersion: 1,
    ok: true,
    surface: 'pluto/sts/mobile',
    disclosure: 'Pluto voice output is AI-generated.',
    transcript,
    responseText: agent.text,
    ...extra,
    ttsProvider: speech.provider,
    audioMime: speech.mime,
    audioBase64: readFileSync(speech.outputPath).toString('base64'),
  }
}

function htmlShell() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#101820">
<title>Pluto STS</title>
<style>
:root {
  color-scheme: dark;
  --bg: #101820;
  --panel: #17212b;
  --ink: #f5f7f8;
  --muted: #b8c4cb;
  --line: #2b3945;
  --accent: #55c2a4;
  --danger: #ff6b6b;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--ink); font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif; }
body { display: flex; justify-content: center; }
main { width: min(100%, 680px); min-height: 100dvh; padding: max(18px, env(safe-area-inset-top)) 18px max(18px, env(safe-area-inset-bottom)); display: grid; grid-template-rows: auto 1fr auto; gap: 18px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h1 { margin: 0; font-size: 22px; line-height: 1.1; letter-spacing: 0; }
.pill { min-height: 32px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; color: var(--muted); display: inline-flex; align-items: center; justify-content: center; font-size: 13px; white-space: nowrap; }
.surface { display: grid; align-content: center; gap: 18px; }
.record { width: min(76vw, 280px); aspect-ratio: 1; margin: 0 auto; border: 0; border-radius: 50%; background: var(--accent); color: #061411; font-size: 24px; font-weight: 800; letter-spacing: 0; box-shadow: 0 22px 54px rgba(0,0,0,.35), inset 0 -8px 18px rgba(0,0,0,.18); touch-action: none; }
.record[data-state="recording"] { background: var(--danger); color: white; animation: pulse 1s ease-in-out infinite; }
.record:disabled { opacity: .62; }
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(.96); } }
.status { min-height: 24px; text-align: center; color: var(--muted); font-size: 15px; }
.log { border-top: 1px solid var(--line); padding-top: 14px; display: grid; gap: 12px; }
.entry { display: grid; gap: 6px; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
.label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
.text { margin: 0; font-size: 16px; line-height: 1.35; overflow-wrap: anywhere; }
.controls { display: flex; gap: 10px; }
.secondary { flex: 1; min-height: 44px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink); font-size: 15px; }
.secondary:disabled { opacity: .5; }
.fallback { border-top: 1px solid var(--line); padding-top: 14px; display: grid; gap: 10px; }
.fallback label { display: grid; gap: 7px; color: var(--muted); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
.fallback textarea { width: 100%; min-height: 86px; resize: vertical; border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: #0d141c; color: var(--ink); font: inherit; font-size: 16px; line-height: 1.35; }
.fallback button { min-height: 44px; border: 0; border-radius: 8px; background: var(--ink); color: var(--bg); font-size: 15px; font-weight: 800; }
audio { width: 100%; }
</style>
</head>
<body>
<main>
  <header>
    <h1>Pluto STS</h1>
    <span class="pill" id="health">offline</span>
  </header>
  <section class="surface" aria-live="polite">
    <button class="record" id="record" type="button">Falar</button>
    <div class="status" id="status">Toque e segure para falar com Pluto.</div>
    <div class="controls">
      <button class="secondary" id="tap" type="button">Gravar 8s</button>
      <button class="secondary" id="replay" type="button" disabled>Repetir audio</button>
    </div>
  </section>
  <section class="fallback">
    <label for="textTurn">Texto ou ditado do iPhone</label>
    <textarea id="textTurn" placeholder="Dite pelo teclado do iPhone ou digite aqui."></textarea>
    <button id="sendText" type="button">Enviar para Pluto</button>
  </section>
  <section class="log">
    <div class="entry">
      <span class="label">Voce</span>
      <p class="text" id="transcript">Aguardando voz.</p>
    </div>
    <div class="entry">
      <span class="label">Pluto</span>
      <p class="text" id="reply">Aguardando resposta.</p>
      <audio id="player" controls preload="none"></audio>
    </div>
  </section>
</main>
<script>
const statusEl = document.getElementById('status')
const healthEl = document.getElementById('health')
const recordButton = document.getElementById('record')
const tapButton = document.getElementById('tap')
const replayButton = document.getElementById('replay')
const textTurn = document.getElementById('textTurn')
const sendText = document.getElementById('sendText')
const transcriptEl = document.getElementById('transcript')
const replyEl = document.getElementById('reply')
const player = document.getElementById('player')

const params = new URLSearchParams(location.search)
const queryToken = params.get('token')
if (queryToken) {
  localStorage.setItem('plutoStsToken', queryToken)
  params.delete('token')
  const clean = location.pathname + (params.toString() ? '?' + params.toString() : '')
  history.replaceState(null, '', clean)
}
const token = localStorage.getItem('plutoStsToken') || ''

let mediaRecorder = null
let chunks = []
let stopTimer = null
let busyTimer = null
let busy = false
let lastAudioUrl = ''

function setStatus(text, state = 'idle') {
  statusEl.textContent = text
  recordButton.dataset.state = state
}

function setBusy(value) {
  busy = value
  recordButton.disabled = value
  tapButton.disabled = value
  sendText.disabled = value
  if (busyTimer) clearTimeout(busyTimer)
  if (value) {
    busyTimer = setTimeout(() => {
      busy = false
      recordButton.disabled = false
      tapButton.disabled = false
      sendText.disabled = false
      setStatus('Pronto para novo turno.')
    }, 90000)
  }
}

function pickMime() {
  const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']
  return candidates.find((candidate) => window.MediaRecorder && MediaRecorder.isTypeSupported(candidate)) || ''
}

async function checkHealth() {
  try {
    const basePath = location.pathname.endsWith('/') ? location.pathname : location.pathname + '/'
    const response = await fetch(basePath + 'health', { headers: token ? { Authorization: 'Bearer ' + token } : {} })
    const data = await response.json()
    healthEl.textContent = data.ok ? 'online' : 'bloqueado'
  } catch {
    healthEl.textContent = 'offline'
  }
}

async function startRecording(autoStopMs = 0) {
  if (busy) return
  if (!token) {
    setStatus('Abra com o link que contem token.')
    return
  }
  if (!window.isSecureContext) {
    setStatus('Voz do navegador exige HTTPS. Use texto/ditado abaixo.')
    return
  }
  setBusy(true)
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    chunks = []
    const mimeType = pickMime()
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data)
    }
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop())
      submitRecording(mimeType || mediaRecorder.mimeType || 'audio/webm')
    }
    mediaRecorder.start()
    setStatus('Gravando. Solte para enviar.', 'recording')
    if (autoStopMs > 0) stopTimer = setTimeout(stopRecording, autoStopMs)
  } catch (error) {
    setBusy(false)
    setStatus('Microfone indisponivel: ' + error.message)
  }
}

function stopRecording() {
  if (stopTimer) clearTimeout(stopTimer)
  stopTimer = null
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    setStatus('Enviando audio.')
    mediaRecorder.stop()
  } else {
    setBusy(false)
  }
}

async function submitRecording(mimeType) {
  try {
    const blob = new Blob(chunks, { type: mimeType })
    if (blob.size < 800) throw new Error('audio muito curto')
    setStatus('Pluto esta processando.')
    const basePath = location.pathname.endsWith('/') ? location.pathname : location.pathname + '/'
    const response = await fetch(basePath + 'api/turn', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': blob.type || 'application/octet-stream',
      },
      body: blob,
    })
    const data = await response.json()
    if (!response.ok || !data.ok) throw new Error(data.error || 'falha no turno')
    transcriptEl.textContent = data.transcript || 'Sem transcricao.'
    replyEl.textContent = data.responseText || 'Sem resposta.'
    if (lastAudioUrl) URL.revokeObjectURL(lastAudioUrl)
    const audioBytes = Uint8Array.from(atob(data.audioBase64), (char) => char.charCodeAt(0))
    const audioBlob = new Blob([audioBytes], { type: data.audioMime || 'audio/mpeg' })
    lastAudioUrl = URL.createObjectURL(audioBlob)
    player.src = lastAudioUrl
    replayButton.disabled = false
    await player.play().catch(() => {})
    setStatus('Pronto.')
  } catch (error) {
    setStatus('Erro: ' + error.message)
  } finally {
    setBusy(false)
  }
}

async function submitTextTurn() {
  const text = textTurn.value.trim()
  if (busy) return
  if (!token) {
    setStatus('Abra com o link que contem token.')
    return
  }
  if (!text) {
    setStatus('Digite ou dite uma mensagem.')
    return
  }
  setBusy(true)
  try {
    setStatus('Pluto esta processando texto.')
    const basePath = location.pathname.endsWith('/') ? location.pathname : location.pathname + '/'
    const response = await fetch(basePath + 'api/text', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })
    const data = await response.json()
    if (!response.ok || !data.ok) throw new Error(data.error || 'falha no turno')
    transcriptEl.textContent = data.transcript || text
    replyEl.textContent = data.responseText || 'Sem resposta.'
    if (lastAudioUrl) URL.revokeObjectURL(lastAudioUrl)
    const audioBytes = Uint8Array.from(atob(data.audioBase64), (char) => char.charCodeAt(0))
    const audioBlob = new Blob([audioBytes], { type: data.audioMime || 'audio/mpeg' })
    lastAudioUrl = URL.createObjectURL(audioBlob)
    player.src = lastAudioUrl
    replayButton.disabled = false
    await player.play().catch(() => {})
    textTurn.value = ''
    setStatus('Pronto.')
  } catch (error) {
    setStatus('Erro: ' + error.message)
  } finally {
    setBusy(false)
  }
}

recordButton.addEventListener('pointerdown', () => startRecording())
recordButton.addEventListener('pointerup', stopRecording)
recordButton.addEventListener('pointercancel', stopRecording)
tapButton.addEventListener('click', () => startRecording(8000))
sendText.addEventListener('click', submitTextTurn)
replayButton.addEventListener('click', () => {
  player.currentTime = 0
  player.play().catch(() => {})
})
checkHealth()
</script>
</body>
</html>`
}

function jsonResponse(res, statusCode, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...corsHeaders(res.req),
  })
  res.end(body)
}

function textResponse(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...corsHeaders(res.req),
  })
  res.end(body)
}

function corsHeaders(req) {
  const origin = req?.headers?.origin || ''
  const allowed = /^https?:\/\/(127\.0\.0\.1|localhost):\d+$/i.test(origin)
    || /^https:\/\/[a-z0-9-]+\.tail[0-9a-z]+\.ts\.net$/i.test(origin)
  if (!allowed) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
    Vary: 'Origin',
  }
}

function constantTimeTokenMatch(provided, expected) {
  const providedBuffer = Buffer.from(String(provided || ''))
  const expectedBuffer = Buffer.from(String(expected || ''))
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer)
}

function requestToken(req, url) {
  const auth = req.headers.authorization || ''
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1] || ''
  return bearer || url.searchParams.get('token') || ''
}

function requireToken(req, res, url, options) {
  const token = requestToken(req, url)
  if (constantTimeTokenMatch(token, options.token)) return true
  jsonResponse(res, 401, {
    schemaVersion: 1,
    ok: false,
    surface: 'pluto/sts/mobile',
    error: 'unauthorized',
  })
  return false
}

async function readRequestBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > maxBodyBytes) fail('Audio body too large', { maxBodyBytes })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function createApp(options) {
  return createServer(async (req, res) => {
    res.req = req
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
    const pathname = url.pathname.replace(/\/+$/, '') || '/'
    try {
      if (req.method === 'OPTIONS') {
        textResponse(res, 204, '')
        return
      }

      if ((req.method === 'GET' || req.method === 'HEAD') && (pathname === '/' || pathname === '/sts')) {
        textResponse(res, 200, htmlShell(), 'text/html; charset=utf-8')
        return
      }

      if ((req.method === 'GET' || req.method === 'HEAD') && (pathname === '/health' || pathname === '/sts/health')) {
        if (!requireToken(req, res, url, options)) return
        jsonResponse(res, 200, {
          schemaVersion: 1,
          ok: true,
          surface: 'pluto/sts/mobile',
          host: options.host,
          port: options.port,
          agent: options.agent,
          sessionKey: options.sessionKey,
          maxBodyBytes,
        })
        return
      }

      if (req.method === 'POST' && (pathname === '/api/turn' || pathname === '/sts/api/turn')) {
        if (!requireToken(req, res, url, options)) return
        const body = await readRequestBody(req)
        if (body.length < 800) fail('Audio body too short')
        const extension = contentTypeToExtension(req.headers['content-type'])
        const audioPath = resolve(tmpDir, `operator-mobile-${timestamp()}${extension}`)
        writeFileSync(audioPath, body)
        const result = processAudioTurn(audioPath, options)
        jsonResponse(res, 200, result)
        return
      }

      if (req.method === 'POST' && (pathname === '/api/text' || pathname === '/sts/api/text')) {
        if (!requireToken(req, res, url, options)) return
        const body = await readRequestBody(req)
        let parsed
        try {
          parsed = JSON.parse(body.toString('utf8') || '{}')
        } catch {
          fail('Invalid JSON text turn')
        }
        const result = processTextTurn(parsed?.text, options, { source: 'text' })
        jsonResponse(res, 200, result)
        return
      }

      jsonResponse(res, 404, { schemaVersion: 1, ok: false, surface: 'pluto/sts/mobile', error: 'not_found' })
    } catch (error) {
      jsonResponse(res, 500, {
        schemaVersion: 1,
        ok: false,
        surface: 'pluto/sts/mobile',
        error: error.message,
        details: error.details || {},
      })
    }
  })
}

function buildPublicUrl(options) {
  const base = options.publicBaseUrl || `http://${options.host}:${options.port}/sts`
  const url = new URL(base)
  url.searchParams.set('token', options.token)
  return url.toString()
}

function redactPublicUrl(publicUrl) {
  try {
    const url = new URL(publicUrl)
    if (url.searchParams.has('token')) url.searchParams.set('token', 'REDACTED')
    return url.toString()
  } catch {
    return sanitize(publicUrl)
  }
}

function runSelfTest(options) {
  ensureDirs()
  const promptText = 'Pluto, smoke mobile STS. Responda exatamente: OK MOBILE STS.'
  const promptAudio = resolve(tmpDir, `mobile-self-test-prompt-${timestamp()}.mp3`)
  const speech = synthesize(promptText, promptAudio)
  const result = processAudioTurn(speech.outputPath, options)
  console.log(JSON.stringify({
    ...result,
    audioBase64: `[redacted:${result.audioBase64.length}]`,
    promptTtsProvider: speech.provider,
  }, null, 2))
}

function readPid() {
  try {
    const pid = Number(readFileSync(serverPidPath, 'utf8').trim())
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

function processAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function readPrivateFile(path) {
  try {
    return readFileSync(path, 'utf8').trim()
  } catch {
    return ''
  }
}

function healthStatus(options, token = readPrivateFile(currentTokenPath)) {
  if (!token) return null
  const result = run('curl', [
    '-sS',
    '--connect-timeout',
    '3',
    '--max-time',
    '10',
    '-o',
    '/dev/null',
    '-w',
    '%{http_code}',
    '-H',
    `Authorization: Bearer ${token}`,
    `http://${options.host}:${options.port}/sts/health`,
  ])
  const code = Number(String(result.stdout || '').trim())
  return Number.isFinite(code) ? code : null
}

function serverStatus(options, token = readPrivateFile(currentTokenPath)) {
  const pid = readPid()
  const alive = processAlive(pid)
  const healthCode = healthStatus(options, token)
  return {
    schemaVersion: 1,
    ok: alive && healthCode === 200,
    surface: 'pluto/sts/mobile',
    bind: `http://${options.host}:${options.port}`,
    pid,
    processAlive: alive,
    healthStatus: healthCode,
    tokenPresent: Boolean(token),
    publicUrlPresent: Boolean(readPrivateFile(currentPublicUrlPath)),
    logPath: serverLogPath,
  }
}

function printServerStatus(options) {
  console.log(JSON.stringify(serverStatus(options), null, 2))
}

function stopDaemon(options) {
  const pid = readPid()
  if (pid && processAlive(pid)) {
    process.kill(pid, 'SIGTERM')
  }
  try {
    unlinkSync(serverPidPath)
  } catch {
    // Already stopped or never started.
  }
  console.log(JSON.stringify({
    ...serverStatus(options),
    stoppedPid: pid,
  }, null, 2))
}

function daemonArgs(options) {
  return [
    resolve(repoRoot, 'scripts/pluto-sts-mobile-server.mjs'),
    '--host',
    options.host,
    '--port',
    String(options.port),
    '--agent',
    options.agent,
    '--session-key',
    options.sessionKey,
    '--language',
    options.language,
    '--public-base-url',
    options.publicBaseUrl || `http://${options.host}:${options.port}/sts`,
  ]
}

function waitForHealthy(options, token, timeoutMs = 7000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const code = healthStatus(options, token)
    if (code === 200) return true
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
  }
  return false
}

function startDaemon(options) {
  ensureDirs()
  const existing = serverStatus(options)
  if (existing.ok) {
    console.log(JSON.stringify({ ...existing, alreadyRunning: true }, null, 2))
    return
  }

  const logFd = openSync(serverLogPath, 'a', 0o600)
  chmodPrivate(serverLogPath)
  const child = spawn(process.execPath, daemonArgs(options), {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `/opt/homebrew/bin:/opt/homebrew/opt/node@24/bin:${process.env.PATH || ''}`,
      PLUTO_STS_MOBILE_TOKEN: options.token,
      PLUTO_STS_MOBILE_PUBLIC_URL: options.publicBaseUrl || `http://${options.host}:${options.port}/sts`,
      PLUTO_STS_MOBILE_REDACT_STARTUP: '1',
    },
    detached: true,
    stdio: ['ignore', logFd, logFd],
  })
  child.unref()
  closeSync(logFd)
  writeFileSync(serverPidPath, `${child.pid}\n`, { mode: 0o600 })
  chmodPrivate(serverPidPath)

  const healthy = waitForHealthy(options, options.token)
  const status = serverStatus(options, options.token)
  console.log(JSON.stringify({
    ...status,
    ok: healthy && status.ok,
    startedPid: child.pid,
    tokenSource: process.env.PLUTO_STS_MOBILE_TOKEN ? 'env' : 'ephemeral',
    tokenLength: options.token.length,
  }, null, 2))
  process.exit(healthy && status.ok ? 0 : 1)
}

function start(options) {
  ensureDirs()
  const app = createApp(options)
  app.listen(options.port, options.host, () => {
    const publicUrl = buildPublicUrl(options)
    writeFileSync(currentTokenPath, `${options.token}\n`, { mode: 0o600 })
    writeFileSync(currentPublicUrlPath, `${publicUrl}\n`, { mode: 0o600 })
    chmodPrivate(currentTokenPath)
    chmodPrivate(currentPublicUrlPath)
    console.log(JSON.stringify({
      schemaVersion: 1,
      ok: true,
      surface: 'pluto/sts/mobile',
      bind: `http://${options.host}:${options.port}`,
      publicUrl: process.env.PLUTO_STS_MOBILE_REDACT_STARTUP === '1' ? redactPublicUrl(publicUrl) : publicUrl,
      tokenSource: process.env.PLUTO_STS_MOBILE_TOKEN ? 'env' : 'ephemeral',
      tokenLength: options.token.length,
    }, null, 2))
  })
}

const options = parseArgs(process.argv.slice(2))
if (options.help) {
  printHelp()
} else if (options.selfTest) {
  runSelfTest(options)
} else if (options.status) {
  printServerStatus(options)
} else if (options.stop) {
  stopDaemon(options)
} else if (options.daemon) {
  startDaemon(options)
} else {
  start(options)
}
