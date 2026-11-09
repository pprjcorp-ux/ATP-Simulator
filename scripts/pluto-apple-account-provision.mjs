#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(import.meta.url), '../..')
const expectedAppleId = String(process.env.PLUTO_DEDICATED_APPLE_ID || '').trim()
const verificationEmail = String(process.env.PLUTO_APPLE_ID_VERIFICATION_EMAIL || '').trim()
const verificationPhoneFromEnv = String(process.env.PLUTO_APPLE_ID_VERIFICATION_PHONE || '').trim()
const dedicatedEmailService = process.env.PLUTO_APPLE_ID_EMAIL_KEYCHAIN_SERVICE || 'OpenClaw Pluto Apple ID dedicated email'
const credentialStatusService = process.env.PLUTO_APPLE_ID_STATUS_KEYCHAIN_SERVICE || 'OpenClaw Pluto Apple ID credential status'
const candidatePasswordService = process.env.PLUTO_APPLE_ID_CANDIDATE_PASSWORD_SERVICE || 'OpenClaw Pluto Apple ID candidate password'
const verificationPhoneService = process.env.PLUTO_APPLE_ID_PHONE_KEYCHAIN_SERVICE || 'OpenClaw Pluto Apple ID verification phone'
const loginStateCheck = resolve(repoRoot, 'scripts/pluto-imessage-login-state.mjs')
const generateCandidatePassword = process.argv.includes('--generate-password')
const forceResetStatus = process.argv.includes('--force-reset-status')
const jsonOnly = process.argv.includes('--json') || process.argv.includes('--quiet')

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    ...options,
  })
}

function maskEmail(value) {
  const text = String(value || '')
  const at = text.indexOf('@')
  if (at <= 1) return text ? '<redacted-email>' : null
  return `${text.slice(0, Math.min(3, at))}***${text.slice(at)}`
}

function maskPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length < 5) return null
  return `+${digits.slice(0, 2)} *** *** ${digits.slice(-4)}`
}

function makeCandidatePassword() {
  const left = randomBytes(7).toString('base64url')
  const right = randomBytes(5).toString('base64url')
  const number = String(1000 + (randomBytes(2).readUInt16BE(0) % 9000))
  return `Pluto-${left}-${right}-${number}!Aa`
}

function keychainUpsert(service, account, value) {
  return run('security', ['add-generic-password', '-U', '-a', account, '-s', service, '-w', value])
}

function keychainRead(service) {
  const result = run('security', ['find-generic-password', '-s', service, '-w'])
  return {
    present: result.status === 0 && String(result.stdout || '').trim().length > 0,
    value: result.status === 0 ? String(result.stdout || '').trim() : '',
  }
}

function copyToClipboard(value) {
  return run('pbcopy', [], { input: value })
}

function openUrl(url) {
  return run('open', [url])
}

function fail(message, extra = {}) {
  process.stdout.write(`${JSON.stringify({ ok: false, message, ...extra }, null, 2)}\n`)
  process.exit(1)
}

function prepareMessagesLogin() {
  run('killall', ['Messages'])
  run('sleep', ['2'])
  run('open', ['-a', 'Messages'])
  run('sleep', ['4'])
  run('open', ['imessage://'])
  run('sleep', ['1'])
  const script = `
tell application "System Events"
  if not (exists process "Messages") then return "process=absent"
  tell process "Messages"
    try
      click menu item "Nova Mensagem" of menu "Arquivo" of menu bar item "Arquivo" of menu bar 1
      delay 0.5
    end try
    try
      click menu item "Ajustes…" of menu "Mensagens" of menu bar item "Mensagens" of menu bar 1
      delay 0.5
    end try
    if (count of windows) = 0 then return "windowCount=0"
    set frontmost to true
    tell window 1
      if (count of text fields) > 0 then
        set value of text field 1 to "${expectedAppleId.replaceAll('"', '\\"')}"
        delay 0.2
        key code 36
      end if
    end tell
    return "prepared"
  end tell
end tell
`
  return run('osascript', ['-e', script])
}

function readLoginState() {
  const result = run(process.execPath, [loginStateCheck])
  try {
    return JSON.parse(result.stdout || '{}')
  } catch {
    return {
      ok: false,
      state: 'unknown',
      requiredNextStep: 'Could not parse iMessage login checker output.',
    }
  }
}

if (!expectedAppleId || !verificationEmail) {
  fail('Set PLUTO_DEDICATED_APPLE_ID and PLUTO_APPLE_ID_VERIFICATION_EMAIL before provisioning legacy iMessage.')
}

keychainUpsert(dedicatedEmailService, 'pluto-apple-id-email', expectedAppleId)
const existingCredentialStatus = keychainRead(credentialStatusService)
const existingCandidatePassword = keychainRead(candidatePasswordService)
let verificationPhone = keychainRead(verificationPhoneService)
let verificationPhoneSource = verificationPhone.present ? 'keychain' : 'missing'
if (verificationPhoneFromEnv.length > 0) {
  keychainUpsert(verificationPhoneService, 'pluto-apple-id-verification-phone', verificationPhoneFromEnv)
  verificationPhone = keychainRead(verificationPhoneService)
  verificationPhoneSource = 'env'
}
let credentialStatus =
  forceResetStatus || !existingCredentialStatus.present
    ? 'account_missing'
    : existingCredentialStatus.value
let candidateCreated = false
let clipboardUpdated = false
if (generateCandidatePassword) {
  const candidatePassword = makeCandidatePassword()
  keychainUpsert(candidatePasswordService, 'pluto-apple-id-candidate-password', candidatePassword)
  const clipboard = copyToClipboard(candidatePassword)
  clipboardUpdated = clipboard.status === 0
  credentialStatus = 'candidate_pending'
  candidateCreated = true
}
keychainUpsert(credentialStatusService, 'pluto-apple-id', credentialStatus)
openUrl('https://account.apple.com/account')
openUrl('https://iforgot.apple.com/password/verify/appleid')
prepareMessagesLogin()

const state = readLoginState()

const output = {
  schemaVersion: 1,
  mode: jsonOnly ? 'json' : 'default',
  target: maskEmail(expectedAppleId),
  opened: {
    createAccount: 'https://account.apple.com/account',
    recoverAccount: 'https://iforgot.apple.com/password/verify/appleid',
  },
  verification: {
    inbox: maskEmail(verificationEmail),
    phone: maskPhone(verificationPhone.value),
    phoneSource: verificationPhoneSource,
    phonePresent: verificationPhone.present,
    birthDateRequired: true,
    captchaRequired: true,
    submitRequiresHumanVerification: true,
  },
  keychain: {
    dedicatedEmailPresent: true,
    previousCredentialStatus: existingCredentialStatus.present ? existingCredentialStatus.value : 'missing',
    credentialStatus,
    existingCandidatePasswordPresent: existingCandidatePassword.present,
    candidatePasswordCreated: candidateCreated,
    passwordCopiedToClipboard: clipboardUpdated,
    statusPreserved: !forceResetStatus && !generateCandidatePassword && existingCredentialStatus.present,
  },
  messages: {
    state: state.state ?? 'unknown',
    loginWindowPresent: state.checks?.loginWindowPresent ?? null,
    loginWindowFieldCount: state.checks?.loginWindowFieldCount ?? null,
    idsActiveAccountCount: state.checks?.idsActiveAccountCount ?? null,
    idsExpectedIdentityPresent: state.checks?.idsExpectedIdentityPresent ?? null,
  },
  requiredHumanAction: candidateCreated
    ? 'Create and verify the dedicated Pluto Apple Account. Paste the candidate password from the clipboard only into the official Apple form, then complete email/SMS/CAPTCHA verification.'
    : 'Create and verify the dedicated Pluto Apple Account, then sign into Messages on this Mac.',
  requiredNextStep: state.requiredNextStep ?? null,
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
