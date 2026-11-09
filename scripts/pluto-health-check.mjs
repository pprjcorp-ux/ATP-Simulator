import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const args = new Set(process.argv.slice(2))
const full = args.has('--full')
const includeSmoke = full || args.has('--smoke')
const selfTest = args.has('--self-test')
const openclaw = process.env.OPENCLAW_BIN || '/opt/homebrew/bin/openclaw'
const openclawConfigPath = process.env.OPENCLAW_CONFIG_PATH || resolve(homedir(), '.openclaw/openclaw.json')
const tailscaleCandidates = [
  process.env.TAILSCALE_BIN ? { command: process.env.TAILSCALE_BIN, source: 'env' } : null,
  existsSync(resolve(homedir(), 'bin/tailscale')) ? { command: resolve(homedir(), 'bin/tailscale'), source: 'home-bin' } : null,
  { command: 'tailscale', source: 'path' },
].filter(Boolean)
const stsMobileHealthUrl = process.env.PLUTO_STS_MOBILE_HEALTH_URL || 'http://127.0.0.1:8787/sts/health'
const imessageTopologyCheck = process.env.PLUTO_IMESSAGE_TOPOLOGY_CHECK || resolve(homedir(), '.openclaw/workspaces/openclaw-main/bin/pluto-imessage-selfchat-check')
const imessagePolicy = (process.env.PLUTO_IMESSAGE_POLICY || 'archived').trim().toLowerCase()
const expectedChannels = (process.env.PLUTO_EXPECTED_CHANNELS || 'discord')
  .split(',')
  .map((channel) => channel.trim().toLowerCase())
  .filter(Boolean)
const includeIMessageChecks = imessagePolicy === 'active' || expectedChannels.includes('imessage')
const knownTaskWarningTokens = (process.env.PLUTO_KNOWN_TASK_WARNING_TOKENS || '0a75d876-f3e5-4637-b7bb-e96eab54bf70,a2dca4f6-7b20-41a6-90e2-392df3d4bf19')
  .split(',')
  .map((token) => token.trim())
  .filter(Boolean)

const repoRoot = resolve(new URL('..', import.meta.url).pathname)
const imessageLoginStateCheck = process.env.PLUTO_IMESSAGE_LOGIN_STATE_CHECK || resolve(repoRoot, 'scripts/pluto-imessage-login-state.mjs')
const outputDir = resolve(repoRoot, 'output/monitoring')
const appleIdSubmitEvidencePath = resolve(outputDir, 'pluto-apple-id-submit-latest.json')
const startedAt = new Date()
const nodeBin = process.execPath
const commandEnv = {
  ...process.env,
  PATH: `/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:${process.env.PATH || ''}`,
}

function redactDiagnosticText(value) {
  return String(value || '')
    .replace(/\bsk-[A-Za-z0-9._-]+\b/g, 'sk-REDACTED')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer REDACTED')
    .replace(/\bOPENAI_API_KEY\s*[:=]\s*\S+/gi, 'OPENAI_API_KEY=REDACTED')
}

function excerpt(value, max = 4000) {
  const text = redactDiagnosticText(value).trim()
  if (text.length <= max) return text
  return `${text.slice(0, Math.floor(max / 2))}\n...<truncated>...\n${text.slice(-Math.floor(max / 2))}`
}

function runCommand(id, command, commandArgs, evaluate, options = {}) {
  const started = Date.now()
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    env: commandEnv,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
    ...options,
  })

  const base = {
    id,
    command: [command, ...commandArgs].join(' '),
    exitCode: result.status,
    durationMs: Date.now() - started,
    stdoutExcerpt: excerpt(result.stdout),
    stderrExcerpt: excerpt(result.stderr),
  }

  if (result.error) {
    return {
      ...base,
      status: 'fail',
      message: result.error.message,
    }
  }

  const assessment = evaluate(result.stdout || '', result.stderr || '', result.status)
  return {
    ...base,
    ...assessment,
  }
}

function localCheck(id, evaluate) {
  const started = Date.now()
  try {
    return {
      id,
      command: 'local config inspection',
      exitCode: 0,
      durationMs: Date.now() - started,
      stdoutExcerpt: '',
      stderrExcerpt: '',
      ...evaluate(),
    }
  } catch (error) {
    return {
      id,
      command: 'local config inspection',
      exitCode: 1,
      durationMs: Date.now() - started,
      stdoutExcerpt: '',
      stderrExcerpt: '',
      status: 'fail',
      message: error.message,
    }
  }
}

function readJsonFile(path) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function getPath(object, path) {
  return path.split('.').reduce((cursor, key) => (cursor && typeof cursor === 'object' ? cursor[key] : undefined), object)
}

function getJsonPointer(object, pointer) {
  if (pointer === '') return object
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) return undefined
  return pointer
    .slice(1)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((cursor, key) => (cursor && typeof cursor === 'object' ? cursor[key] : undefined), object)
}

function ageSeconds(isoTimestamp) {
  const time = Date.parse(String(isoTimestamp || ''))
  if (!Number.isFinite(time)) return null
  return Math.max(0, Math.round((Date.now() - time) / 1000))
}

function runCommandSequence(id, steps, evaluate) {
  const started = Date.now()
  const outputs = []
  const command = steps.map((step) => [step.command, ...step.args].join(' ')).join(' && ')

  for (const step of steps) {
    const result = spawnSync(step.command, step.args, {
      cwd: repoRoot,
      env: commandEnv,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 8,
    })
    outputs.push(result)

    if (result.error) {
      return {
        id,
        command,
        exitCode: result.status,
        durationMs: Date.now() - started,
        stdoutExcerpt: excerpt(outputs.map((output) => output.stdout).join('\n')),
        stderrExcerpt: excerpt(outputs.map((output) => output.stderr).join('\n')),
        status: 'fail',
        message: result.error.message,
      }
    }

    if (result.status !== 0) {
      return {
        id,
        command,
        exitCode: result.status,
        durationMs: Date.now() - started,
        stdoutExcerpt: excerpt(outputs.map((output) => output.stdout).join('\n')),
        stderrExcerpt: excerpt(outputs.map((output) => output.stderr).join('\n')),
        status: 'fail',
        message: `exit code ${result.status}`,
      }
    }
  }

  const stdout = outputs.map((output) => output.stdout || '').join('\n')
  const stderr = outputs.map((output) => output.stderr || '').join('\n')
  return {
    id,
    command,
    exitCode: 0,
    durationMs: Date.now() - started,
    stdoutExcerpt: excerpt(stdout),
    stderrExcerpt: excerpt(stderr),
    ...evaluate(stdout, stderr, 0),
  }
}

function passWhenZero(message = 'ok') {
  return (_stdout, _stderr, code) => ({
    status: code === 0 ? 'pass' : 'fail',
    message: code === 0 ? message : `exit code ${code}`,
  })
}

function containsPass(pattern, message) {
  return (stdout, stderr, code) => {
    const combined = `${stdout}\n${stderr}`
    if (code !== 0) return { status: 'fail', message: `exit code ${code}` }
    return pattern.test(combined)
      ? { status: 'pass', message }
      : { status: 'fail', message: `missing expected evidence: ${pattern}` }
  }
}

function evaluateSecurity(stdout, stderr, code) {
  if (code !== 0) return { status: 'fail', message: `exit code ${code}` }
  const combined = `${stdout}\n${stderr}`
  const match = combined.match(/Summary:\s*(\d+)\s+critical/i)
  const critical = match ? Number(match[1]) : null
  return {
    status: critical === 0 ? 'pass' : 'fail',
    message: critical === 0 ? '0 critical security findings' : 'security critical count missing or non-zero',
    metrics: { critical },
  }
}

function evaluateGatewayAuthProbe(stdout, _stderr, code) {
  const statusCode = Number(String(stdout || '').trim())
  return {
    status: code === 0 && (statusCode === 401 || statusCode === 403) ? 'pass' : 'fail',
    message: code === 0 && (statusCode === 401 || statusCode === 403)
      ? 'tools invoke rejects unauthenticated POST'
      : `unexpected unauthenticated /tools/invoke status: ${Number.isNaN(statusCode) ? 'missing' : statusCode}`,
    metrics: { statusCode: Number.isNaN(statusCode) ? null : statusCode },
  }
}

function evaluateStsMobileAuthProbe(stdout, _stderr, code) {
  if (code !== 0) {
    return {
      status: 'warn',
      message: 'STS mobile server not reachable on loopback',
      metrics: { url: stsMobileHealthUrl, curlExitCode: code },
    }
  }
  const statusCode = Number(String(stdout || '').trim())
  return {
    status: statusCode === 401 ? 'pass' : statusCode === 200 ? 'fail' : 'warn',
    message: statusCode === 401
      ? 'STS mobile health rejects unauthenticated requests'
      : statusCode === 200
        ? 'STS mobile health is reachable without token'
        : `STS mobile health returned HTTP ${Number.isNaN(statusCode) ? 'missing' : statusCode}`,
    metrics: { url: stsMobileHealthUrl, statusCode: Number.isNaN(statusCode) ? null : statusCode },
  }
}

function evaluateTailscaleServeStatus(stdout, _stderr, code) {
  if (code !== 0) {
    return {
      status: 'warn',
      message: 'Tailscale Serve status unavailable for STS route',
      metrics: { expectedPath: '/sts', expectedProxy: 'http://127.0.0.1:8787' },
    }
  }
  try {
    const parsed = JSON.parse(stdout)
    const webEntries = Object.values(parsed?.Web || {})
    const stsHandlers = webEntries.map((entry) => entry?.Handlers?.['/sts']).filter(Boolean)
    const proxies = stsHandlers.map((handler) => handler?.Proxy).filter(Boolean)
    const routeConfigured = proxies.includes('http://127.0.0.1:8787')
    return {
      status: routeConfigured ? 'pass' : 'warn',
      message: routeConfigured ? 'Tailscale Serve routes /sts to local STS mobile server' : 'Tailscale Serve /sts route is not configured',
      metrics: {
        expectedPath: '/sts',
        expectedProxy: 'http://127.0.0.1:8787',
        routeConfigured,
        proxies,
      },
    }
  } catch (error) {
    return { status: 'warn', message: `could not parse Tailscale Serve status JSON: ${error.message}` }
  }
}

function evaluateTailscaleServeReadiness() {
  const attempts = []
  for (const candidate of tailscaleCandidates) {
    const result = spawnSync(candidate.command, ['serve', 'status', '--json'], {
      cwd: repoRoot,
      env: commandEnv,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 4,
      timeout: 12000,
    })
    const assessment = evaluateTailscaleServeStatus(result.stdout || '', result.stderr || '', result.status ?? 1)
    attempts.push({
      source: candidate.source,
      exitCode: result.status,
      status: assessment.status,
      message: assessment.message,
    })
    if (assessment.status === 'pass') {
      return {
        ...assessment,
        metrics: {
          ...assessment.metrics,
          binarySource: candidate.source,
          attemptedSources: attempts.map((attempt) => attempt.source),
        },
      }
    }
  }

  const lastAttempt = attempts.at(-1)
  return {
    status: 'warn',
    message: lastAttempt?.message || 'Tailscale Serve status unavailable for STS route',
    metrics: {
      expectedPath: '/sts',
      expectedProxy: 'http://127.0.0.1:8787',
      attemptedSources: attempts.map((attempt) => attempt.source),
      lastExitCode: lastAttempt?.exitCode ?? null,
    },
  }
}

function evaluateOpenClawStatus(stdout, _stderr, code) {
  if (code !== 0) return { status: 'fail', message: `exit code ${code}` }
  try {
    const parsed = JSON.parse(stdout)
    const gatewayReachable = parsed?.gateway?.reachable === true
    const eventLoopDegraded = parsed?.health?.eventLoop?.degraded === true
    return {
      status: gatewayReachable && !eventLoopDegraded ? 'pass' : 'fail',
      message: gatewayReachable
        ? eventLoopDegraded
          ? 'gateway reachable but event loop degraded'
          : 'gateway reachable'
        : 'gateway not reachable',
      metrics: {
        gatewayReachable,
        eventLoopDegraded,
        gatewayLatencyMs: parsed?.gateway?.connectLatencyMs ?? parsed?.health?.durationMs ?? null,
        eventLoopP99Ms: parsed?.health?.eventLoop?.delayP99Ms ?? null,
      },
    }
  } catch (error) {
    return { status: 'fail', message: `could not parse status JSON: ${error.message}` }
  }
}

function evaluateModelProbe(stdout, _stderr, code) {
  if (code !== 0) return { status: 'fail', message: `exit code ${code}` }
  try {
    const parsed = JSON.parse(stdout)
    const results = parsed?.auth?.probes?.results || []
    const statuses = results.map((entry) => entry.status)
    return {
      status: statuses.includes('ok') ? 'pass' : 'fail',
      message: statuses.includes('ok') ? 'openai probe ok' : `openai probe not ok: ${statuses.join(', ') || 'none'}`,
      metrics: {
        provider: 'openai',
        statuses,
        durationMs: parsed?.auth?.probes?.durationMs ?? null,
      },
    }
  } catch (error) {
    return { status: 'fail', message: `could not parse model probe JSON: ${error.message}` }
  }
}

function evaluateChannels(stdout, stderr, code) {
  if (code !== 0) return { status: 'fail', message: `exit code ${code}` }
  const combined = `${stdout}\n${stderr}`
  const channelLines = combined
    .split('\n')
    .filter((line) => /Discord|WhatsApp|iMessage/i.test(line))
  const failures = []
  const warnings = []
  const archivedUnexpected = []

  function lineTokens(line) {
    const detail = line.includes(':') ? line.slice(line.indexOf(':') + 1) : line
    return detail
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean)
  }

  function hasAny(tokens, values) {
    return values.some((value) => tokens.includes(value))
  }

  function hasBadState(tokens) {
    return tokens.some((token) => token === 'disabled' || token === 'stopped' || token === 'disconnected' || token === 'off' || token.startsWith('error:'))
  }

  for (const channel of expectedChannels) {
    const line = channelLines.find((candidate) => candidate.toLowerCase().includes(channel))
    if (!line) {
      failures.push(`${channel}: missing`)
      continue
    }
    const tokens = lineTokens(line)
    if (channel === 'imessage' && !(tokens.includes('enabled') && hasAny(tokens, ['running', 'works', 'ok']) && !hasBadState(tokens))) {
      failures.push(`${channel}: not healthy`)
    }
    if (channel === 'whatsapp' && !(tokens.includes('enabled') && tokens.includes('linked') && hasAny(tokens, ['connected', 'health:healthy', 'running']) && !hasBadState(tokens))) {
      failures.push(`${channel}: not linked/running/healthy`)
    }
    if (channel === 'discord' && !(tokens.includes('enabled') && hasAny(tokens, ['connected', 'works', 'running']) && !hasBadState(tokens))) {
      failures.push(`${channel}: not connected/working`)
    }
  }

  for (const line of channelLines) {
    const lower = line.toLowerCase()
    const isExpected = expectedChannels.some((channel) => lower.includes(channel))
    const tokens = lineTokens(line)
    const appearsActive = hasAny(tokens, ['enabled', 'running', 'connected', 'works', 'health:healthy']) && !hasBadState(tokens)
    const archivedByPolicy = imessagePolicy === 'archived' && lower.includes('imessage')
    if (!isExpected && appearsActive && archivedByPolicy) {
      archivedUnexpected.push(line.trim())
      warnings.push(`archived iMessage still active: ${line.trim()}`)
    }
    if (!isExpected && appearsActive && !archivedByPolicy) warnings.push(`unexpected active channel: ${line.trim()}`)
  }

  if (failures.length > 0) {
    return {
      status: 'fail',
      message: failures.join('; '),
      metrics: { expectedChannels, warnings, archivedUnexpected },
    }
  }

  return {
    status: warnings.length > 0 ? 'warn' : 'pass',
    message: warnings.length > 0 ? 'non-expected channel warning present' : 'expected channels healthy',
    metrics: { expectedChannels, warnings, archivedUnexpected },
  }
}

function evaluateDiscordDmConfig(config, env = process.env) {
  const discord = config?.channels?.discord
  if (!discord) {
    return {
      status: 'pass',
      message: 'Discord DM not configured as a Pluto target',
      metrics: { configured: false },
    }
  }

  const allowFrom = Array.isArray(discord.allowFrom) ? discord.allowFrom : []
  const guildUsers = Object.values(discord.guilds || {}).flatMap((guild) => (Array.isArray(guild?.users) ? guild.users : []))
  const approvers = Array.isArray(discord.execApprovals?.approvers) ? discord.execApprovals.approvers : []
  const allowlistedUserCount = new Set([...allowFrom, ...guildUsers, ...approvers].filter(Boolean)).size
  const enabled = discord.enabled === true
  const isSecretRef = (value) =>
    value && typeof value === 'object' && !Array.isArray(value) &&
    typeof value.source === 'string' &&
    typeof value.provider === 'string' &&
    typeof value.id === 'string'
  const hasCredentialRef =
    ['tokenRef', 'botTokenRef', 'appTokenRef', 'secretRef'].some((key) => typeof discord[key] === 'string' && discord[key].trim()) ||
    ['token', 'botToken', 'appToken', 'secret'].some((key) => isSecretRef(discord[key]))
  const hasInlineCredential = ['token', 'botToken', 'appToken', 'secret'].some((key) => typeof discord[key] === 'string' && discord[key].trim())
  const hasEnvCredential = Boolean(env.DISCORD_BOT_TOKEN || env.OPENCLAW_DISCORD_BOT_TOKEN || env.DISCORD_TOKEN)
  const hasCredential = hasCredentialRef || hasInlineCredential || hasEnvCredential
  const issues = []

  if (!enabled) issues.push('disabled')
  if (!hasCredential) issues.push('missing bot token credential')
  if (allowlistedUserCount === 0) issues.push('missing allowlisted Discord user')

  return {
    status: issues.length === 0 ? 'pass' : 'warn',
    message: issues.length === 0
      ? 'Discord DM config ready'
      : `Discord DM not ready: ${issues.join(', ')}`,
    metrics: {
      configured: true,
      enabled,
      hasCredential,
      hasCredentialRef,
      hasInlineCredential,
      hasEnvCredential,
      allowlistedUserCount,
      execApprovalsEnabled: discord.execApprovals?.enabled === true,
    },
  }
}

function evaluateDiscordDmReadiness() {
  return evaluateDiscordDmConfig(readJsonFile(openclawConfigPath), commandEnv)
}

function discordConfiguredChannelIds(discord) {
  return Object.values(discord?.guilds || {})
    .flatMap((guild) => Object.keys(guild?.channels || {}))
    .filter(Boolean)
}

function assessDiscordChannelAccess(statusCode, configuredChannelCount) {
  if (configuredChannelCount === 0) {
    return {
      status: 'pass',
      message: 'Discord dedicated channel not configured',
      metrics: { configuredChannelCount },
    }
  }

  return {
    status: statusCode === 200 ? 'pass' : statusCode === 401 ? 'fail' : 'warn',
    message: statusCode === 200
      ? 'Discord bot can read the configured dedicated channel'
      : statusCode === 401
        ? 'Discord bot token rejected while checking dedicated channel'
        : statusCode === 403 || statusCode === 404
          ? 'Discord bot missing access to configured dedicated channel'
          : `Discord dedicated channel access returned HTTP ${Number.isNaN(statusCode) ? 'missing' : statusCode}`,
    metrics: {
      configuredChannelCount,
      statusCode: Number.isNaN(statusCode) ? null : statusCode,
    },
  }
}

function resolveDiscordToken(config, env = commandEnv) {
  const discord = config?.channels?.discord
  const inline = ['token', 'botToken', 'appToken', 'secret']
    .map((key) => discord?.[key])
    .find((value) => typeof value === 'string' && value.trim())
  if (inline) return inline

  const ref = ['token', 'botToken', 'appToken', 'secret']
    .map((key) => discord?.[key])
    .find((value) => value && typeof value === 'object' && !Array.isArray(value))
  if (ref?.source === 'file' && ref?.provider) {
    const providerPath = config?.secrets?.providers?.[ref.provider]?.path
    const secrets = readJsonFile(providerPath || resolve(homedir(), '.openclaw/secrets.json'))
    const value = ref.id?.startsWith('/') ? getJsonPointer(secrets, ref.id) : getPath(secrets, ref.id || '')
    if (typeof value === 'string' && value.trim()) return value
  }

  return env.DISCORD_BOT_TOKEN || env.OPENCLAW_DISCORD_BOT_TOKEN || env.DISCORD_TOKEN || ''
}

function evaluateDiscordChannelAccess() {
  const config = readJsonFile(openclawConfigPath)
  const discord = config?.channels?.discord
  const channelIds = discordConfiguredChannelIds(discord)
  if (channelIds.length === 0) return assessDiscordChannelAccess(NaN, 0)

  const token = resolveDiscordToken(config)
  if (!token) {
    return {
      status: 'warn',
      message: 'Discord dedicated channel configured but bot credential is unavailable',
      metrics: { configuredChannelCount: channelIds.length, statusCode: null },
    }
  }

  const result = spawnSync('curl', [
    '-sS',
    '-o',
    '/dev/null',
    '-w',
    '%{http_code}',
    '--connect-timeout',
    '5',
    '--max-time',
    '10',
    '-H',
    ['Authorization:', 'Bot', token].join(' '),
    `https://discord.com/api/v10/channels/${channelIds[0]}`,
  ], {
    cwd: repoRoot,
    env: commandEnv,
    encoding: 'utf8',
    timeout: 12000,
  })

  if (result.error) {
    return {
      status: 'warn',
      message: `Discord dedicated channel access probe failed: ${result.error.message}`,
      metrics: { configuredChannelCount: channelIds.length, statusCode: null },
    }
  }

  const statusCode = Number(String(result.stdout || '').trim())
  return assessDiscordChannelAccess(statusCode, channelIds.length)
}

function evaluateIMessageTopology(stdout, _stderr, code) {
  try {
    const parsed = JSON.parse(stdout)
    const topology = parsed?.topology?.topology ?? parsed?.topology ?? 'unknown'
    const checks = parsed?.checks || {}
    const dedicatedIdentityReady = checks.dedicatedIdentityReady === true || topology === 'dedicated-identity'
    const mirroredPairCount = Number(checks.mirroredPairCount ?? parsed?.topology?.mirroredPairCount ?? 0)
    const reflectedAssistantRows = Number(checks.reflectedAssistantRows ?? parsed?.topology?.reflectedAssistantRows ?? 0)
    const residualEcho = mirroredPairCount > 0 || reflectedAssistantRows > 0
    const runtimePatchPresent = checks.runtimePatchPresent ?? null
    const runtimeSelfChatLocalMirrorGuardPresent = checks.runtimeSelfChatLocalMirrorGuardPresent ?? null
    const selfChatFallbackActive = !dedicatedIdentityReady || topology === 'self-chat'
    const selfChatGuardMissing = selfChatFallbackActive && runtimeSelfChatLocalMirrorGuardPresent !== true

    return {
      status: selfChatGuardMissing ? 'fail' : dedicatedIdentityReady && !residualEcho ? 'pass' : 'warn',
      message: selfChatGuardMissing
        ? 'iMessage self-chat local mirror guard missing'
        : !dedicatedIdentityReady
        ? 'iMessage still requires dedicated Pluto Apple ID'
        : residualEcho
          ? `iMessage dedicated identity has residual mirrored/reflected rows: mirrored=${mirroredPairCount}, reflectedAssistant=${reflectedAssistantRows}`
          : 'iMessage dedicated identity ready',
      metrics: {
        topology,
        dedicatedIdentityReady,
        mirroredPairCount,
        reflectedAssistantRows,
        runtimePatchPresent,
        runtimeSelfChatLocalMirrorGuardPresent,
        gatewayReachable: checks.gatewayReachable ?? null,
        imessageConfigured: checks.imessageConfigured ?? null,
        imessageRunning: checks.imessageRunning ?? null,
      },
    }
  } catch (error) {
    return {
      status: code !== 0 ? 'warn' : 'warn',
      message: code !== 0
        ? `iMessage topology checker exit code ${code}; could not parse topology JSON: ${error.message}`
        : `could not parse iMessage topology JSON: ${error.message}`,
    }
  }
}

function evaluateIMessageLoginState(stdout, _stderr, code) {
  if (code !== 0) return { status: 'warn', message: `iMessage login state checker exit code ${code}` }
  try {
    const parsed = JSON.parse(stdout)
    const state = parsed?.state || 'unknown'
    const credentials = parsed?.credentials || {}
    const checks = parsed?.checks || {}
    const forbiddenIdentityDetected = checks.forbiddenIdentityDetected === true
    const credentialReady = credentials.expectedEmailMatches === true && credentials.validated === true
    const idsReady = checks.idsHasActiveAccount === true && checks.idsExpectedIdentityPresent === true
    const identityUnavailable = credentials.status === 'identity_unavailable'
    const signedInDedicated = state === 'signed_in_dedicated'
    const loginPhase = parsed?.loginPhase ?? parsed?.summary?.loginPhase ?? null
    const submitEvidence = readJsonFile(appleIdSubmitEvidencePath)
    const submitAgeSeconds = ageSeconds(submitEvidence?.generatedAt)

    return {
      status: forbiddenIdentityDetected ? 'fail' : signedInDedicated && credentialReady && idsReady ? 'pass' : 'warn',
      message: forbiddenIdentityDetected
        ? 'forbidden operator identity appears in Messages login surface'
        : signedInDedicated && credentialReady && idsReady
          ? 'Messages signed in with validated dedicated Pluto Apple ID'
          : identityUnavailable
            ? 'Dedicated Apple ID unavailable; STS/browser is the practical primary channel until email and phone verification are available'
          : `Messages dedicated Apple ID not ready: ${state}${loginPhase ? ` (${loginPhase})` : ''}`,
      metrics: {
        state,
        expectedState: parsed?.expectedState || 'signed_in_dedicated',
        blockedBy: parsed?.blockedBy ?? null,
        loginPhase,
        lastSubmitPresent: submitEvidence !== null,
        lastSubmitAgeSeconds: submitAgeSeconds,
        lastSubmitOk: submitEvidence?.submit?.ok ?? null,
        lastSubmitReason: submitEvidence?.submit?.reason ?? null,
        lastSubmitStateAfter: submitEvidence?.stateAfter?.state ?? null,
        lastSubmitPhaseAfter: submitEvidence?.stateAfter?.loginPhase ?? null,
        lastSubmitIdsHasActiveAccount: submitEvidence?.stateAfter?.idsHasActiveAccount ?? null,
        lastSubmitIdsExpectedIdentityPresent: submitEvidence?.stateAfter?.idsExpectedIdentityPresent ?? null,
        needsHumanAction: parsed?.needsHumanAction ?? true,
        dedicatedEmailPresent: credentials.dedicatedEmailPresent ?? null,
        expectedEmailMatches: credentials.expectedEmailMatches ?? null,
        candidatePasswordPresent: credentials.candidatePasswordPresent ?? null,
        verificationPhonePresent: credentials.verificationPhonePresent ?? null,
        statusMarkerPresent: credentials.statusMarkerPresent ?? null,
        credentialStatus: credentials.status ?? null,
        credentialValidated: credentials.validated ?? null,
        credentialMarkerValidated: credentials.markerValidated ?? null,
        credentialContradictedByLoginError: credentials.contradictedByLoginError ?? null,
        messagesRunning: checks.messagesRunning ?? null,
        messagesWindowCount: checks.messagesWindowCount ?? null,
        loginWindowPresent: checks.loginWindowPresent ?? null,
        loginWindowFieldCount: checks.loginWindowFieldCount ?? null,
        loginErrorPresent: checks.loginErrorPresent ?? null,
        needs2fa: checks.needs2fa ?? null,
        forbiddenIdentityDetected,
        idsProbeOk: checks.idsProbeOk ?? null,
        idsByHostProbeOk: checks.idsByHostProbeOk ?? null,
        idsActiveAccountCount: checks.idsActiveAccountCount ?? null,
        idsOnlineAccountCount: checks.idsOnlineAccountCount ?? null,
        idsStatusEntryCount: checks.idsStatusEntryCount ?? null,
        idsHasActiveAccount: checks.idsHasActiveAccount ?? null,
        idsExpectedIdentityPresent: checks.idsExpectedIdentityPresent ?? null,
      },
    }
  } catch (error) {
    return { status: 'warn', message: `could not parse iMessage login state JSON: ${error.message}` }
  }
}

function evaluateIMessageArchived() {
  return {
    status: 'pass',
    message: 'iMessage archived by policy; Discord and STS are the primary Pluto ingress routes',
    metrics: {
      policy: imessagePolicy,
      expectedChannels,
      activeChecks: includeIMessageChecks,
      manualAuditCommand: 'PLUTO_IMESSAGE_POLICY=active PLUTO_EXPECTED_CHANNELS=discord,imessage npm run pluto:monitor',
    },
  }
}

function evaluateTasks(stdout, stderr, code) {
  if (code !== 0) return { status: 'fail', message: `exit code ${code}` }
  const stdoutText = String(stdout || '').trim()
  const combined = `${stdout}\n${stderr}`.trim()

  function taskAssessment(errors, warnings, unknownWarningTokens) {
    const knownWarningsOnly = warnings > 0 && unknownWarningTokens.length === 0
    return {
      status: errors > 0 ? 'fail' : unknownWarningTokens.length > 0 ? 'warn' : 'pass',
      message: errors > 0
        ? 'task audit has errors'
        : unknownWarningTokens.length > 0
          ? 'task audit has new warnings to triage'
          : knownWarningsOnly
            ? 'tasks audit has known warnings only'
            : 'tasks audit clean',
      metrics: { errors, warnings, unknownWarningTokens, knownTaskWarningTokens },
    }
  }

  try {
    const parsed = JSON.parse(stdoutText)
    const errors = Number(parsed?.summary?.combined?.errors ?? parsed?.summary?.errors ?? 0)
    const warnings = Number(parsed?.summary?.combined?.warnings ?? parsed?.summary?.warnings ?? 0)
    const unknownWarningTokens = (parsed?.findings || [])
      .filter((finding) => finding.severity === 'warn')
      .map((finding) => finding.token)
      .filter((token) => token && !knownTaskWarningTokens.includes(token))
    return taskAssessment(errors, warnings, unknownWarningTokens)
  } catch (error) {
    if (stdoutText.length > 0) {
      return {
        status: 'warn',
        message: `could not parse task audit stdout JSON: ${error.message}`,
        metrics: {
          errors: 0,
          warnings: 1,
          unknownWarningTokens: ['unparsed-task-audit-json'],
          knownTaskWarningTokens,
          stderrPresent: String(stderr || '').trim().length > 0,
        },
      }
    }
    const errorMatch = combined.match(/(\d+)\s+errors?/i)
    const warningMatch = combined.match(/(\d+)\s+warnings?/i)
    const errors = errorMatch ? Number(errorMatch[1]) : 0
    const warnings = warningMatch ? Number(warningMatch[1]) : 0
    return taskAssessment(errors, warnings, warnings > 0 ? ['unparsed-task-audit-warning'] : [])
  }
}

function evaluateSmoke(stdout, _stderr, code) {
  if (code !== 0) return { status: 'fail', message: `exit code ${code}` }
  try {
    const parsed = JSON.parse(stdout)
    const text = parsed?.result?.payloads?.map((payload) => payload.text).join('\n') || ''
    const fallbackUsed = parsed?.result?.meta?.executionTrace?.fallbackUsed ?? null
    return {
      status: text.trim() === 'OK PLUTO' ? 'pass' : 'fail',
      message: text.trim() === 'OK PLUTO' ? 'agent smoke returned OK PLUTO' : `unexpected smoke response: ${text}`,
      metrics: { fallbackUsed },
    }
  } catch (error) {
    return { status: 'fail', message: `could not parse smoke JSON: ${error.message}` }
  }
}

function evaluateStsSelfTest(stdout, _stderr, code) {
  if (code !== 0) return { status: 'fail', message: `exit code ${code}` }
  try {
    const parsed = JSON.parse(stdout)
    const responseText = String(parsed?.responseText || '').trim()
    const hasAudio = typeof parsed?.responseAudioPath === 'string' && parsed.responseAudioPath.length > 0
    return {
      status: parsed?.ok === true && responseText && hasAudio ? 'pass' : 'fail',
      message: parsed?.ok === true && responseText && hasAudio
        ? 'STS self-test completed'
        : 'STS self-test missing response or audio evidence',
      metrics: {
        source: parsed?.source || null,
        ttsProvider: parsed?.ttsProvider || null,
        sttModel: parsed?.sttModel || null,
        playback: parsed?.playback?.played ?? null,
        hasAudio,
      },
    }
  } catch (error) {
    return { status: 'fail', message: `could not parse STS self-test JSON: ${error.message}` }
  }
}

function evaluateMiraBridgeSelfTest(stdout, _stderr, code) {
  if (code !== 0) return { status: 'fail', message: `exit code ${code}` }
  try {
    const parsed = JSON.parse(stdout)
    const proposal = parsed?.proposal || {}
    const state = parsed?.state || {}
    const pendingProposals = Array.isArray(state?.pendingProposals) ? state.pendingProposals : []
    const proposalOnly = proposal.execution === 'proposal_only'
    const approvalRequired = proposal.requiresApproval === true
    const hasSummary = typeof proposal.summary === 'string' && proposal.summary.trim().length > 0
    return {
      status: proposalOnly && approvalRequired && hasSummary ? 'pass' : 'fail',
      message: proposalOnly && approvalRequired && hasSummary
        ? 'Mira bridge self-test completed in proposal-only mode'
        : 'Mira bridge self-test did not prove proposal-only approval gating',
      metrics: {
        risk: typeof proposal.risk === 'string' ? proposal.risk : null,
        requiresApproval: proposal.requiresApproval ?? null,
        execution: typeof proposal.execution === 'string' ? proposal.execution : null,
        hasSummary,
        pendingProposals: pendingProposals.length,
        plutoStatus: typeof parsed?.plutoStatus === 'string' ? parsed.plutoStatus : null,
      },
    }
  } catch (error) {
    return { status: 'fail', message: `could not parse Mira bridge self-test JSON: ${error.message}` }
  }
}

function evaluateCodexRelaySelfTest(stdout, _stderr, code) {
  if (code !== 0) return { status: 'fail', message: `exit code ${code}` }
  try {
    const parsed = JSON.parse(stdout)
    const advisoryOnly = parsed?.execution === 'advisory_only'
    const reviewRequired = parsed?.requiresCodexReview === true
    const contextSanitized = parsed?.contextSanitized === true
    const hasResponse = typeof parsed?.plutoResponse === 'string' && parsed.plutoResponse.trim().length > 0
    return {
      status: advisoryOnly && reviewRequired && contextSanitized && hasResponse ? 'pass' : 'fail',
      message: advisoryOnly && reviewRequired && contextSanitized && hasResponse
        ? 'Codex relay self-test completed in advisory-only mode'
        : 'Codex relay self-test did not prove advisory-only review gating',
      metrics: {
        risk: typeof parsed?.risk === 'string' ? parsed.risk : null,
        execution: typeof parsed?.execution === 'string' ? parsed.execution : null,
        requiresCodexReview: parsed?.requiresCodexReview ?? null,
        contextSanitized,
        hasResponse,
        plutoStatus: typeof parsed?.plutoStatus === 'string' ? parsed.plutoStatus : null,
      },
    }
  } catch (error) {
    return { status: 'fail', message: `could not parse Codex relay self-test JSON: ${error.message}` }
  }
}

function evaluateIMessageLoginSelfTest(stdout, _stderr, code) {
  if (code !== 0) return { status: 'fail', message: `exit code ${code}` }
  try {
    const parsed = JSON.parse(stdout)
    const failures = (parsed?.results || []).filter((result) => result.pass !== true)
    return {
      status: parsed?.ok === true && failures.length === 0 ? 'pass' : 'fail',
      message: parsed?.ok === true && failures.length === 0
        ? 'iMessage login self-test passed'
        : `iMessage login self-test failures: ${failures.map((result) => result.name).join(', ') || 'unknown'}`,
      metrics: {
        cases: Array.isArray(parsed?.results) ? parsed.results.length : null,
        failures: failures.length,
      },
    }
  } catch (error) {
    return { status: 'fail', message: `could not parse iMessage login self-test JSON: ${error.message}` }
  }
}

function evaluateJsonOkSelfTest(stdout, _stderr, code) {
  if (code !== 0) return { status: 'fail', message: `exit code ${code}` }
  try {
    const parsed = JSON.parse(stdout)
    const failures = (parsed?.results || []).filter((result) => result.pass !== true)
    return {
      status: parsed?.ok === true && failures.length === 0 ? 'pass' : 'fail',
      message: parsed?.ok === true && failures.length === 0
        ? 'health-check self-test passed'
        : `health-check self-test failures: ${failures.map((result) => result.name).join(', ') || 'unknown'}`,
      metrics: {
        cases: Array.isArray(parsed?.results) ? parsed.results.length : null,
        failures: failures.length,
      },
    }
  } catch (error) {
    return { status: 'fail', message: `could not parse health-check self-test JSON: ${error.message}` }
  }
}

function runSelfTest() {
  const partialApiKeyDiagnostic = ['sk', 'proj', '...1DXCsq0A'].join('-')
  const partialApiKeyPrefix = ['sk', 'proj'].join('-')
  const cases = [
    {
      name: 'topology_nonzero_self_chat_missing_guard_is_fail',
      actual: evaluateIMessageTopology(JSON.stringify({
        topology: 'self-chat',
        checks: {
          dedicatedIdentityReady: false,
          runtimeSelfChatLocalMirrorGuardPresent: false,
          mirroredPairCount: 0,
          reflectedAssistantRows: 0,
        },
      }), '', 1),
      expected: {
        status: 'fail',
        messageIncludes: 'local mirror guard missing',
      },
    },
    {
      name: 'topology_nonzero_unparseable_is_warn_with_exit_code',
      actual: evaluateIMessageTopology('not json', '', 1),
      expected: {
        status: 'warn',
        messageIncludes: 'exit code 1',
      },
    },
    {
      name: 'task_audit_parses_stdout_json_despite_stderr_noise',
      actual: evaluateTasks(JSON.stringify({
        summary: { combined: { errors: 0, warnings: 1 } },
        findings: [{ severity: 'warn', token: 'new-warning-token' }],
      }), 'informational stderr line', 0),
      expected: {
        status: 'warn',
        unknownWarningToken: 'new-warning-token',
      },
    },
    {
      name: 'task_audit_invalid_stdout_json_reports_unparsed_token',
      actual: evaluateTasks('not json', '1 warning from stderr', 0),
      expected: {
        status: 'warn',
        unknownWarningToken: 'unparsed-task-audit-json',
      },
    },
    {
      name: 'discord_configured_but_disabled_without_credential_is_warn',
      actual: evaluateDiscordDmConfig({
        channels: {
          discord: {
            enabled: false,
            allowFrom: ['123456789012345678'],
          },
        },
      }, {}),
      expected: {
        status: 'warn',
        messageIncludes: 'disabled, missing bot token credential',
      },
    },
    {
      name: 'discord_enabled_with_credential_and_allowlist_is_pass',
      actual: evaluateDiscordDmConfig({
        channels: {
          discord: {
            enabled: true,
            token: { source: 'file', provider: 'filemain', id: '/channels/discord/token' },
            allowFrom: ['123456789012345678'],
          },
        },
      }, {}),
      expected: {
        status: 'pass',
        messageIncludes: 'ready',
      },
    },
    {
      name: 'archived_imessage_active_is_warn',
      actual: evaluateChannels('Discord: enabled, running\niMessage: enabled, running', '', 0),
      expected: {
        status: 'warn',
        messageIncludes: 'non-expected channel warning',
      },
    },
    {
      name: 'discord_channel_http_200_is_pass',
      actual: assessDiscordChannelAccess(200, 1),
      expected: {
        status: 'pass',
        messageIncludes: 'can read',
      },
    },
    {
      name: 'discord_channel_http_403_is_warn',
      actual: assessDiscordChannelAccess(403, 1),
      expected: {
        status: 'warn',
        messageIncludes: 'missing access',
      },
    },
    {
      name: 'sts_mobile_unauthenticated_health_401_is_pass',
      actual: evaluateStsMobileAuthProbe('401', '', 0),
      expected: {
        status: 'pass',
        messageIncludes: 'rejects unauthenticated',
      },
    },
    {
      name: 'sts_mobile_unauthenticated_health_200_is_fail',
      actual: evaluateStsMobileAuthProbe('200', '', 0),
      expected: {
        status: 'fail',
        messageIncludes: 'without token',
      },
    },
    {
      name: 'sts_mobile_tailscale_sts_route_is_pass',
      actual: evaluateTailscaleServeStatus(JSON.stringify({
        Web: {
          'mac.example.ts.net:443': {
            Handlers: {
              '/sts': { Proxy: 'http://127.0.0.1:8787' },
            },
          },
        },
      }), '', 0),
      expected: {
        status: 'pass',
        messageIncludes: 'routes /sts',
      },
    },
    {
      name: 'diagnostic_excerpt_redacts_partial_api_keys',
      actual: {
        status: excerpt(`effective detail: ${partialApiKeyDiagnostic}`).includes(partialApiKeyPrefix) ? 'fail' : 'pass',
        message: excerpt(`effective detail: ${partialApiKeyDiagnostic}`),
      },
      expected: {
        status: 'pass',
        messageIncludes: 'sk-REDACTED',
      },
    },
  ]

  const results = cases.map((testCase) => {
    const actual = testCase.actual
    const expected = testCase.expected
    const pass =
      actual.status === expected.status &&
      (!expected.messageIncludes || String(actual.message || '').includes(expected.messageIncludes)) &&
      (!expected.unknownWarningToken || (actual.metrics?.unknownWarningTokens || []).includes(expected.unknownWarningToken))
    return {
      name: testCase.name,
      pass,
      expected,
      actual: {
        status: actual.status,
        message: actual.message,
        unknownWarningTokens: actual.metrics?.unknownWarningTokens || [],
      },
    }
  })
  const failed = results.filter((result) => !result.pass)
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    ok: failed.length === 0,
    results,
  }, null, 2)}\n`)
  process.exit(failed.length === 0 ? 0 : 1)
}

if (selfTest) runSelfTest()

function buildAlerts(checks) {
  return checks
    .filter((check) => check.status === 'fail' || check.status === 'warn')
    .map((check) => ({
      id: check.id,
      severity: check.status === 'fail' ? 'critical' : 'warning',
      status: 'open',
      owner: 'Pluto/Codex',
      message: check.message,
      command: check.command,
      metrics: check.metrics || {},
      runbook: 'docs/pluto-runbook.md#como-monitorar',
    }))
}

const checks = [
  runCommand('openclaw_config_validate', openclaw, ['config', 'validate'], passWhenZero('config valid')),
  runCommand('openclaw_secrets_audit', openclaw, ['secrets', 'audit', '--check'], containsPass(/clean/i, 'secrets audit clean')),
  runCommand('openclaw_security_audit', openclaw, ['security', 'audit', '--deep'], evaluateSecurity),
  runCommand('gateway_tools_auth_probe', 'curl', ['-sS', '--connect-timeout', '3', '--max-time', '10', '-o', '/dev/null', '-w', '%{http_code}', '-X', 'POST', '-H', 'Content-Type: application/json', '--data', '{}', 'http://127.0.0.1:18789/tools/invoke'], evaluateGatewayAuthProbe, { timeout: 12000 }),
  runCommand('sts_mobile_auth_probe', 'curl', ['-sS', '--connect-timeout', '3', '--max-time', '10', '-o', '/dev/null', '-w', '%{http_code}', stsMobileHealthUrl], evaluateStsMobileAuthProbe, { timeout: 12000 }),
  localCheck('sts_mobile_tailscale_route', evaluateTailscaleServeReadiness),
  runCommand('openclaw_status', openclaw, ['status', '--deep', '--json'], evaluateOpenClawStatus),
  runCommand('openclaw_channels', openclaw, ['channels', 'status', '--probe', '--timeout', '20000'], evaluateChannels),
  localCheck('discord_dm_readiness', evaluateDiscordDmReadiness),
  localCheck('discord_channel_access', evaluateDiscordChannelAccess),
  ...(includeIMessageChecks
    ? [
        runCommand('imessage_login_state', nodeBin, [imessageLoginStateCheck], evaluateIMessageLoginState),
        runCommand('imessage_topology', imessageTopologyCheck, [], evaluateIMessageTopology),
      ]
    : [
        localCheck('imessage_archived', evaluateIMessageArchived),
      ]),
  runCommand('openclaw_model_probe', openclaw, ['models', 'status', '--probe', '--probe-provider', 'openai', '--probe-max-tokens', '16', '--probe-timeout', '20000', '--json'], evaluateModelProbe),
  runCommand('openclaw_tasks_audit', openclaw, ['tasks', 'audit', '--json'], evaluateTasks),
  runCommand('pluto_mira_bridge_self_test', nodeBin, [resolve(repoRoot, 'scripts/pluto-mira-bridge.mjs'), '--self-test'], evaluateMiraBridgeSelfTest),
  runCommand('pluto_codex_relay_self_test', nodeBin, [resolve(repoRoot, 'scripts/pluto-codex-relay.mjs'), '--self-test'], evaluateCodexRelaySelfTest),
]

if (includeSmoke) {
  checks.push(
    runCommand('openclaw_agent_smoke', openclaw, [
      'agent',
      '--agent',
      'openclaw-main',
      '--session-key',
      'agent:openclaw-main:pluto-smoke',
      '--message',
      'Responda apenas: OK PLUTO',
      '--timeout',
      '90',
      '--json',
    ], evaluateSmoke),
  )
}

if (full) {
  checks.push(runCommand('pluto_alert_router', nodeBin, [resolve(repoRoot, 'scripts/pluto-alert-router.mjs')], passWhenZero('alert router passed')))
  checks.push(runCommand('npm_snapshot_import', nodeBin, [resolve(repoRoot, 'scripts/import-pluto-snapshot.mjs')], passWhenZero('snapshot import passed')))
  checks.push(
    runCommand('pluto_health_self_test', nodeBin, [resolve(repoRoot, 'scripts/pluto-health-check.mjs'), '--self-test'], evaluateJsonOkSelfTest),
    runCommand('pluto_alert_router_self_test', nodeBin, [resolve(repoRoot, 'scripts/pluto-alert-router.mjs'), '--self-test'], evaluateJsonOkSelfTest),
    runCommand('pluto_discord_self_test', nodeBin, [resolve(repoRoot, 'scripts/pluto-discord-credential.mjs'), '--self-test'], evaluateJsonOkSelfTest),
    runCommand('pluto_sts_self_test', nodeBin, [resolve(repoRoot, 'scripts/pluto-sts-turn.mjs'), '--self-test', '--no-play', '--json'], evaluateStsSelfTest),
    runCommand('npm_lint', nodeBin, [resolve(repoRoot, 'node_modules/eslint/bin/eslint.js'), '.'], passWhenZero('lint passed')),
    runCommandSequence('npm_build', [
      { command: nodeBin, args: [resolve(repoRoot, 'node_modules/typescript/bin/tsc'), '-b'] },
      { command: nodeBin, args: [resolve(repoRoot, 'node_modules/vite/bin/vite.js'), 'build'] },
    ], passWhenZero('build passed')),
  )
  if (includeIMessageChecks) {
    checks.push(runCommand('imessage_login_self_test', nodeBin, [imessageLoginStateCheck, '--self-test'], evaluateIMessageLoginSelfTest))
  }
}

function makeReport(checks, finishedAt) {
  const failed = checks.filter((check) => check.status === 'fail')
  const warned = checks.filter((check) => check.status === 'warn')
  const alerts = buildAlerts(checks)
  return {
    schemaVersion: 1,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    mode: full ? 'full' : 'monitor',
    expectedChannels,
    summary: {
      status: failed.length > 0 ? 'fail' : warned.length > 0 ? 'warn' : 'pass',
      pass: checks.filter((check) => check.status === 'pass').length,
      warn: warned.length,
      fail: failed.length,
      alerts: alerts.length,
    },
    alertStatus: alerts.length > 0 ? 'open' : 'clear',
    alerts,
    checks,
  }
}

function writeLatestReport(report, sourceReport = null) {
  const latestPath = resolve(outputDir, 'pluto-health-latest.json')
  const latestAlertsPath = resolve(outputDir, 'pluto-alerts-latest.json')
  writeFileSync(latestPath, `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(latestAlertsPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: report.finishedAt,
    sourceReport: sourceReport || latestPath,
    status: report.alerts.length > 0 ? 'open' : 'clear',
    alerts: report.alerts,
  }, null, 2)}\n`)
  return { latestPath, latestAlertsPath }
}

mkdirSync(outputDir, { recursive: true })

const failed = checks.filter((check) => check.status === 'fail')
const alerts = buildAlerts(checks)
const finishedAt = new Date()
const report = makeReport(checks, finishedAt)

const stamp = finishedAt.toISOString().replace(/[:.]/g, '-')
const reportPath = resolve(outputDir, `pluto-health-${stamp}.json`)
const alertsPath = resolve(outputDir, `pluto-alerts-${stamp}.json`)
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
writeFileSync(alertsPath, `${JSON.stringify({
  schemaVersion: 1,
  generatedAt: finishedAt.toISOString(),
  sourceReport: reportPath,
  status: alerts.length > 0 ? 'open' : 'clear',
  alerts,
}, null, 2)}\n`)
writeLatestReport(report, reportPath)

for (const check of checks) {
  const marker = check.status === 'pass' ? 'PASS' : check.status === 'warn' ? 'WARN' : 'FAIL'
  console.log(`${marker} ${check.id}: ${check.message}`)
}
for (const alert of alerts) {
  console.log(`ALERT ${alert.severity} ${alert.id}: ${alert.message}`)
}
console.log(`report=${reportPath}`)
console.log(`alerts=${alertsPath}`)

process.exit(failed.length > 0 ? 1 : 0)
