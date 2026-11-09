#!/usr/bin/env node

import { existsSync, mkdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import readline from 'node:readline/promises'

const repoRoot = resolve(new URL('..', import.meta.url).pathname)
const openclaw = process.env.OPENCLAW_BIN || '/opt/homebrew/bin/openclaw'
const ffmpeg = process.env.FFMPEG_BIN || '/opt/homebrew/bin/ffmpeg'
const afplay = process.env.AFPLAY_BIN || '/usr/bin/afplay'
const say = process.env.SAY_BIN || '/usr/bin/say'
const tmpDir = resolve(repoRoot, 'tmp/sts')
const speechDir = resolve(repoRoot, 'output/speech')
const defaultSessionKey = 'agent:openclaw-main:pluto-sts'
const defaultMicNames = [
  process.env.PLUTO_STS_MIC_NAME,
  'fifine Microphone',
  'Fosi Audio K5 Pro',
  'Microfone do iPhone de Pedro Paulo',
  'Insta360 Link 2',
].filter(Boolean)

function parseArgs(argv) {
  const options = {
    agent: 'openclaw-main',
    sessionKey: process.env.PLUTO_STS_SESSION_KEY || defaultSessionKey,
    language: process.env.PLUTO_STS_LANGUAGE || 'pt',
    recordSeconds: Number(process.env.PLUTO_STS_RECORD_SECONDS || 6),
    json: false,
    loop: false,
    noPlay: false,
    selfTest: false,
    text: '',
    micIndex: process.env.PLUTO_STS_MIC_INDEX || '',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => argv[++index] || ''
    if (arg === '--agent') options.agent = next()
    else if (arg === '--session-key') options.sessionKey = next()
    else if (arg === '--language') options.language = next()
    else if (arg === '--record-seconds') options.recordSeconds = Number(next())
    else if (arg === '--mic-index') options.micIndex = next()
    else if (arg === '--text') options.text = next()
    else if (arg === '--json') options.json = true
    else if (arg === '--loop') options.loop = true
    else if (arg === '--no-play') options.noPlay = true
    else if (arg === '--self-test') options.selfTest = true
    else if (arg === '--help' || arg === '-h') options.help = true
  }

  return options
}

function printHelp() {
  console.log(`Usage:
  npm run pluto:sts
  npm run pluto:sts -- --text "status do Pluto"
  npm run pluto:sts -- --self-test --no-play --json
  npm run pluto:sts -- --loop

Options:
  --text <text>            Skip microphone capture and send text to Pluto.
  --self-test              Validate TTS -> STT -> Pluto -> TTS using synthetic audio.
  --record-seconds <n>     Microphone capture duration, default 6.
  --mic-index <n>          AVFoundation audio device index override.
  --session-key <key>      OpenClaw session key, default ${defaultSessionKey}.
  --no-play                Generate response audio but do not play it.
  --json                   Print a machine-readable result.
  --loop                   Push-to-talk loop; press Enter per turn, q to quit.
`)
}

function log(options, message) {
  if (!options.json) console.log(message)
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
      stderr: String(result.stderr || '').trim().slice(0, 1200),
    })
  }
  try {
    return JSON.parse(result.stdout || '{}')
  } catch (error) {
    fail(`${label} returned invalid JSON`, { error: error.message })
  }
}

function listAudioDevices() {
  const result = run(ffmpeg, ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''])
  const combined = `${result.stdout || ''}\n${result.stderr || ''}`
  const devices = []
  let inAudio = false
  for (const line of combined.split('\n')) {
    if (line.includes('AVFoundation audio devices:')) {
      inAudio = true
      continue
    }
    if (inAudio && line.includes('AVFoundation') && line.includes('devices:')) break
    const match = line.match(/\[(\d+)\]\s+(.+)$/)
    if (inAudio && match) devices.push({ index: match[1], name: match[2].trim() })
  }
  return devices
}

function chooseMicIndex(options) {
  if (options.micIndex !== '') return { index: String(options.micIndex), name: 'override' }
  const devices = listAudioDevices()
  for (const preferred of defaultMicNames) {
    const found = devices.find((device) => device.name.toLowerCase().includes(preferred.toLowerCase()))
    if (found) return found
  }
  if (devices[0]) return devices[0]
  fail('No AVFoundation audio input devices found')
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function ensureDirs() {
  mkdirSync(tmpDir, { recursive: true })
  mkdirSync(speechDir, { recursive: true })
}

function synthesize(text, outputPath) {
  const attempts = [
    {
      provider: 'elevenlabs',
      args: ['infer', 'tts', 'convert', '--gateway', '--model', 'elevenlabs/eleven_multilingual_v2', '--text', text, '--output', outputPath, '--json'],
    },
    {
      provider: 'openai',
      args: ['infer', 'tts', 'convert', '--gateway', '--model', 'openai/gpt-4o-mini-tts', '--voice', 'cedar', '--text', text, '--output', outputPath, '--json'],
    },
  ]

  for (const attempt of attempts) {
    const result = run(openclaw, attempt.args)
    if (result.status === 0 && existsSync(outputPath)) {
      return {
        provider: attempt.provider,
        outputPath,
        detail: JSON.parse(result.stdout || '{}'),
      }
    }
  }

  const fallbackPath = outputPath.replace(/\.[^.]+$/, '.aiff')
  const fallback = run(say, ['-o', fallbackPath, text])
  if (fallback.status === 0 && existsSync(fallbackPath)) {
    return { provider: 'macos-say', outputPath: fallbackPath, detail: { ok: true, fallback: true } }
  }
  fail('Could not synthesize Pluto speech', { outputPath })
}

function transcribe(audioPath, options) {
  const models = ['elevenlabs/scribe_v2', 'openai/gpt-4o-transcribe', 'openai/gpt-4o-mini-transcribe']
  const prompt = 'Vocabulário: Pluto, OpenClaw, Codex, STS, speech-to-speech, Fosi K5 Pro, Insta360.'
  const errors = []

  for (const model of models) {
    for (const withPrompt of [true, false]) {
      const args = ['infer', 'audio', 'transcribe', '--model', model, '--file', audioPath, '--language', options.language]
      if (withPrompt) args.push('--prompt', prompt)
      args.push('--json')
      const result = run(openclaw, args)
      if (result.status !== 0) {
        errors.push({ model, withPrompt, stderr: String(result.stderr || '').trim().slice(0, 800) })
        continue
      }
      try {
        const parsed = JSON.parse(result.stdout || '{}')
        const text = parsed?.outputs?.map((entry) => entry.text).filter(Boolean).join('\n').trim()
        if (text && !looksLikePromptEcho(text, prompt)) return { model, text, detail: parsed }
        if (text) errors.push({ model, withPrompt, reason: 'prompt_echo_or_no_operator_speech', text })
      } catch (error) {
        errors.push({ model, withPrompt, error: error.message })
      }
    }
  }

  fail('Could not transcribe audio input', { audioPath: basename(audioPath), errors })
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

function captureMicrophone(options) {
  const mic = chooseMicIndex(options)
  const audioPath = resolve(tmpDir, `operator-${timestamp()}.wav`)
  const result = run(ffmpeg, [
    '-y',
    '-hide_banner',
    '-nostdin',
    '-f',
    'avfoundation',
    '-i',
    `:${mic.index}`,
    '-t',
    String(options.recordSeconds),
    '-ac',
    '1',
    '-ar',
    '16000',
    '-af',
    'highpass=f=80,loudnorm=I=-18:TP=-1.5:LRA=11',
    audioPath,
  ])
  if (result.status !== 0 || !existsSync(audioPath)) {
    fail('Microphone capture failed', {
      mic,
      stderr: String(result.stderr || '').trim().slice(0, 1400),
    })
  }
  return { audioPath, mic }
}

function agentTurn(transcript, options) {
  const message = [
    'Entrada STS local do operador para Pluto.',
    'Responda em portugues, curto e operacional.',
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
  ], 'Pluto agent turn')
  const text = parsed?.result?.payloads?.map((payload) => payload.text).filter(Boolean).join('\n').trim()
  if (!text) fail('Pluto returned an empty STS response', { status: parsed?.status })
  return { text, detail: parsed }
}

function playAudio(audioPath, options) {
  if (options.noPlay) return { played: false }
  const result = run(afplay, [audioPath])
  return { played: result.status === 0, exitCode: result.status }
}

function buildResult(stage, data) {
  return {
    schemaVersion: 1,
    ok: true,
    surface: 'pluto/sts',
    stage,
    disclosure: 'Pluto voice output is AI-generated.',
    ...data,
  }
}

function runTextTurn(text, options, source = 'text') {
  const agent = agentTurn(text, options)
  const speech = synthesize(agent.text, resolve(speechDir, `pluto-sts-response-${timestamp()}.mp3`))
  const playback = playAudio(speech.outputPath, options)
  return buildResult('complete', {
    source,
    transcript: text,
    responseText: agent.text,
    ttsProvider: speech.provider,
    responseAudioPath: speech.outputPath,
    playback,
  })
}

function runSelfTest(options) {
  const promptText = 'Pluto, smoke de speech to speech. Responda exatamente: OK STS.'
  const promptAudio = synthesize(promptText, resolve(tmpDir, `sts-self-test-prompt-${timestamp()}.mp3`))
  const transcript = transcribe(promptAudio.outputPath, options)
  const result = runTextTurn(transcript.text, options, 'self-test')
  return {
    ...result,
    promptAudioPath: promptAudio.outputPath,
    promptTtsProvider: promptAudio.provider,
    sttModel: transcript.model,
  }
}

function runMicrophoneTurn(options) {
  const capture = captureMicrophone(options)
  const transcript = transcribe(capture.audioPath, options)
  const result = runTextTurn(transcript.text, options, 'microphone')
  return {
    ...result,
    inputAudioPath: capture.audioPath,
    microphone: capture.mic,
    sttModel: transcript.model,
  }
}

async function runLoop(options) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  console.log('Pluto STS pronto. Pressione Enter para gravar um turno, digite q para sair.')
  try {
    while (true) {
      const answer = await rl.question('STS> ')
      if (answer.trim().toLowerCase() === 'q') break
      try {
        console.log(`Gravando ${options.recordSeconds}s. Fale agora.`)
        const result = runMicrophoneTurn(options)
        console.log(`Voce: ${result.transcript}`)
        console.log(`Pluto: ${result.responseText}`)
      } catch (error) {
        console.error(`STS erro: ${error.message}`)
      }
    }
  } finally {
    rl.close()
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }
  ensureDirs()

  if (options.loop) {
    await runLoop(options)
    return
  }

  let result
  if (options.selfTest) result = runSelfTest(options)
  else if (options.text) result = runTextTurn(options.text, options)
  else {
    log(options, `Gravando ${options.recordSeconds}s. Fale agora.`)
    result = runMicrophoneTurn(options)
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`Voce: ${result.transcript}`)
    console.log(`Pluto: ${result.responseText}`)
    console.log(`Audio: ${result.responseAudioPath}`)
  }
}

main().catch((error) => {
  const payload = {
    schemaVersion: 1,
    ok: false,
    surface: 'pluto/sts',
    error: error.message,
    details: error.details || {},
  }
  console.error(JSON.stringify(payload, null, 2))
  process.exit(1)
})
