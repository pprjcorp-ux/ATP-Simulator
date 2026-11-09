#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(import.meta.url), '../..')
const loginStateCheck = resolve(repoRoot, 'scripts/pluto-imessage-login-state.mjs')
const monitoringDir = resolve(repoRoot, 'output/monitoring')
const submitEvidencePath = resolve(monitoringDir, 'pluto-apple-id-submit-latest.json')
const expectedAppleId = String(process.env.PLUTO_DEDICATED_APPLE_ID || '').trim()
const dedicatedEmailService = process.env.PLUTO_APPLE_ID_EMAIL_KEYCHAIN_SERVICE || 'OpenClaw Pluto Apple ID dedicated email'
const credentialStatusService = process.env.PLUTO_APPLE_ID_STATUS_KEYCHAIN_SERVICE || 'OpenClaw Pluto Apple ID credential status'
const candidatePasswordService = process.env.PLUTO_APPLE_ID_CANDIDATE_PASSWORD_SERVICE || 'OpenClaw Pluto Apple ID candidate password'
const verificationPhoneService = process.env.PLUTO_APPLE_ID_PHONE_KEYCHAIN_SERVICE || 'OpenClaw Pluto Apple ID verification phone'

const args = new Set(process.argv.slice(2))
const prepareAccountFlow = args.has('--prepare-account-flow')
const checkClipboardStatus = args.has('--clipboard-status')
const submitMessagesLogin = args.has('--submit-messages-login')
const copyDedicatedEmail = args.has('--copy-dedicated-email-to-clipboard')
const copyVerificationPhone = args.has('--copy-verification-phone-to-clipboard')
const restoreCandidate = args.has('--restore-candidate-to-clipboard')
const updateCandidateFromStdin = args.has('--update-candidate-password-from-stdin')
const updateCandidateFromClipboard = args.has('--update-candidate-password-from-clipboard')
const markValidated = args.has('--mark-validated')
const checkReadyToValidate = args.has('--check-ready-to-validate')
const confirmAppleAccepted = args.has('--confirm-apple-accepted')

function run(command, commandArgs, options = {}) {
  return spawnSync(command, commandArgs, {
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

function readKeychain(service) {
  const result = run('security', ['find-generic-password', '-s', service, '-w'])
  return {
    ok: result.status === 0,
    value: result.status === 0 ? String(result.stdout || '').trim() : '',
  }
}

function writeKeychain(service, account, value) {
  return run('security', ['add-generic-password', '-U', '-a', account, '-s', service, '-w', value])
}

function updateCandidatePassword(candidatePassword, sourceAction) {
  const normalizedPassword = String(candidatePassword || '').trim()
  if (normalizedPassword.length < 12 || /\s/.test(normalizedPassword)) {
    fail('Candidate password input is missing, too short, or contains whitespace.', {
      expectedEmail: maskEmail(expectedAppleId),
      actions,
    })
  }
  const writeCandidate = writeKeychain(
    candidatePasswordService,
    'pluto-apple-id-candidate-password',
    normalizedPassword,
  )
  if (writeCandidate.status !== 0) {
    fail('Could not write the candidate password to Keychain.', {
      expectedEmail: maskEmail(expectedAppleId),
      actions,
    })
  }
  const writeStatus = writeKeychain(credentialStatusService, 'pluto-apple-id', 'candidate_pending')
  if (writeStatus.status !== 0) {
    fail('Could not mark the candidate credential status in Keychain.', {
      expectedEmail: maskEmail(expectedAppleId),
      actions,
    })
  }
  actions.push(sourceAction)
  actions.push('credential_status_marked_candidate_pending')
}

function openUrl(url) {
  return run('open', [url])
}

function submitMessagesLoginWithClipboard() {
  const candidatePassword = readKeychain(candidatePasswordService)
  if (!candidatePassword.ok || candidatePassword.value.length === 0) {
    return { ok: false, reason: 'candidate_password_missing' }
  }
  const clipboard = run('pbcopy', [], { input: candidatePassword.value })
  if (clipboard.status !== 0) {
    return { ok: false, reason: 'clipboard_write_failed' }
  }
  run('open', ['-a', 'Messages'])
  run('sleep', ['2'])
  run('open', ['imessage://'])
  run('sleep', ['1'])
  const script = `
tell application "System Events"
  if not (exists process "Messages") then return "process=absent"
  tell process "Messages"
    set frontmost to true
    if (count of windows) = 0 then
      try
        click menu item "Nova Mensagem" of menu "Arquivo" of menu bar item "Arquivo" of menu bar 1
        delay 0.5
      end try
      try
        click menu item "Ajustes…" of menu "Mensagens" of menu bar item "Mensagens" of menu bar 1
        delay 0.5
      end try
    end if
    if (count of windows) = 0 then return "windowCount=0"
    tell window 1
      set fieldCount to 0
      try
        set fieldCount to count of text fields
      end try
      if fieldCount = 0 then return "fields=0"
      set focused of text field 1 to true
      delay 0.2
      keystroke "a" using command down
      delay 0.1
      keystroke "v" using command down
      delay 0.4
      try
        click button "Entrar"
      on error
        key code 36
      end try
      return "submitted"
    end tell
  end tell
end tell
`
  const result = run('osascript', ['-e', script])
  run('sleep', ['8'])
  return {
    ok: result.status === 0 && String(result.stdout || '').includes('submitted'),
    reason: result.status === 0 ? String(result.stdout || '').trim() : 'osascript_failed',
  }
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '')
}

function writeSubmitEvidence({ stateBefore, submit, stateAfter }) {
  mkdirSync(monitoringDir, { recursive: true })
  const now = new Date()
  writeFileSync(
    submitEvidencePath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: now.toISOString(),
        surface: 'pluto/apple-id/messages-login',
        expectedEmail: maskEmail(expectedAppleId),
        action: 'submit_messages_login',
        submit: {
          ok: submit?.ok === true,
          reason: submit?.reason ?? null,
        },
        stateBefore: {
          state: stateBefore?.state ?? null,
          blockedBy: stateBefore?.blockedBy ?? null,
          loginPhase: stateBefore?.loginPhase ?? stateBefore?.summary?.loginPhase ?? null,
          idsHasActiveAccount: stateBefore?.checks?.idsHasActiveAccount ?? null,
          idsExpectedIdentityPresent: stateBefore?.checks?.idsExpectedIdentityPresent ?? null,
        },
        stateAfter: {
          state: stateAfter?.state ?? null,
          blockedBy: stateAfter?.blockedBy ?? null,
          loginPhase: stateAfter?.loginPhase ?? stateAfter?.summary?.loginPhase ?? null,
          idsHasActiveAccount: stateAfter?.checks?.idsHasActiveAccount ?? null,
          idsExpectedIdentityPresent: stateAfter?.checks?.idsExpectedIdentityPresent ?? null,
          loginWindowPresent: stateAfter?.checks?.loginWindowPresent ?? null,
        },
      },
      null,
      2,
    )}\n`,
  )
}

function readLoginState() {
  const result = run(process.execPath, [loginStateCheck])
  try {
    return JSON.parse(result.stdout || '{}')
  } catch {
    return { ok: false, state: 'unknown', requiredNextStep: 'Could not parse iMessage login checker output.' }
  }
}

function fail(message, extra = {}) {
  process.stdout.write(`${JSON.stringify({ ok: false, message, ...extra }, null, 2)}\n`)
  process.exit(1)
}

const selectedActionCount = [
  prepareAccountFlow,
  checkClipboardStatus,
  submitMessagesLogin,
  copyDedicatedEmail,
  copyVerificationPhone,
  restoreCandidate,
  updateCandidateFromStdin,
  updateCandidateFromClipboard,
  checkReadyToValidate,
  markValidated,
].filter(Boolean).length
if (selectedActionCount === 0) {
  fail('Choose --prepare-account-flow, --clipboard-status, --submit-messages-login, --copy-dedicated-email-to-clipboard, --copy-verification-phone-to-clipboard, --restore-candidate-to-clipboard, --update-candidate-password-from-stdin, --update-candidate-password-from-clipboard, --check-ready-to-validate, or --mark-validated.')
}
if (selectedActionCount > 1) {
  fail('Choose only one credential action per run.')
}
if (!expectedAppleId) {
  fail('Set PLUTO_DEDICATED_APPLE_ID before running legacy Apple ID credential actions.')
}

const dedicatedEmail = readKeychain(dedicatedEmailService)
const dedicatedEmailMatches = dedicatedEmail.ok && dedicatedEmail.value.toLowerCase() === expectedAppleId.toLowerCase()
if (!dedicatedEmailMatches) {
  fail('Dedicated Apple ID email marker is missing or does not match the expected Pluto identity.', {
    expectedEmail: maskEmail(expectedAppleId),
    storedEmail: dedicatedEmail.ok ? maskEmail(dedicatedEmail.value) : null,
  })
}

const actions = []
let clipboardStatus = null
let submitResult = null
let actionStateBefore = null

if (checkClipboardStatus) {
  const clipboard = run('pbpaste', [])
  const clipboardValue = clipboard.status === 0 ? String(clipboard.stdout || '').trim() : ''
  const verificationPhone = readKeychain(verificationPhoneService)
  const candidatePassword = readKeychain(candidatePasswordService)
  const clipboardPhoneDigits = normalizePhone(clipboardValue)
  const storedPhoneDigits = normalizePhone(verificationPhone.value)
  clipboardStatus = {
    available: clipboard.status === 0,
    recognizedAs:
      clipboardValue.length === 0
        ? 'empty'
        : clipboardValue === expectedAppleId
          ? 'dedicated_email'
          : verificationPhone.ok && storedPhoneDigits.length > 0 && clipboardPhoneDigits === storedPhoneDigits
            ? 'verification_phone'
            : candidatePassword.ok && clipboardValue === candidatePassword.value
              ? 'candidate_password'
              : 'unrecognized',
    dedicatedEmailMatches: clipboardValue === expectedAppleId,
    verificationPhoneMatches: verificationPhone.ok && storedPhoneDigits.length > 0 && clipboardPhoneDigits === storedPhoneDigits,
    candidatePasswordMatches: candidatePassword.ok && clipboardValue === candidatePassword.value,
  }
  actions.push('clipboard_status_checked')
}

if (submitMessagesLogin) {
  actionStateBefore = readLoginState()
  submitResult = submitMessagesLoginWithClipboard()
  actions.push(submitResult.ok ? 'messages_login_submitted' : 'messages_login_submit_failed')
}

if (prepareAccountFlow) {
  const openAccount = openUrl('https://account.apple.com/account')
  const openRecovery = openUrl('https://iforgot.apple.com/password/verify/appleid')
  const openMessages = run('open', ['-a', 'Messages'])
  const clipboard = run('pbcopy', [], { input: expectedAppleId })
  if (clipboard.status !== 0) {
    fail('Could not copy the dedicated Apple ID email to the clipboard.', {
      expectedEmail: maskEmail(expectedAppleId),
      actions,
    })
  }
  actions.push('apple_account_page_opened')
  actions.push('apple_recovery_page_opened')
  actions.push(openMessages.status === 0 ? 'messages_opened' : 'messages_open_failed')
  actions.push(openAccount.status === 0 && openRecovery.status === 0 ? 'dedicated_email_copied_to_clipboard' : 'dedicated_email_copied_after_open_warning')
}

if (copyDedicatedEmail) {
  const clipboard = run('pbcopy', [], { input: expectedAppleId })
  if (clipboard.status !== 0) {
    fail('Could not copy the dedicated Apple ID email to the clipboard.', {
      expectedEmail: maskEmail(expectedAppleId),
      actions,
    })
  }
  actions.push('dedicated_email_copied_to_clipboard')
}

if (copyVerificationPhone) {
  const verificationPhone = readKeychain(verificationPhoneService)
  if (!verificationPhone.ok || verificationPhone.value.length === 0) {
    fail('No verification phone is stored in Keychain.', {
      expectedEmail: maskEmail(expectedAppleId),
      actions,
    })
  }
  const clipboard = run('pbcopy', [], { input: verificationPhone.value })
  if (clipboard.status !== 0) {
    fail('Could not copy the verification phone to the clipboard.', {
      expectedEmail: maskEmail(expectedAppleId),
      actions,
    })
  }
  actions.push('verification_phone_copied_to_clipboard')
}

if (restoreCandidate) {
  const candidatePassword = readKeychain(candidatePasswordService)
  if (!candidatePassword.ok || candidatePassword.value.length === 0) {
    fail('No candidate password is stored in Keychain.', {
      expectedEmail: maskEmail(expectedAppleId),
      actions,
    })
  }
  const clipboard = run('pbcopy', [], { input: candidatePassword.value })
  if (clipboard.status !== 0) {
    fail('Could not copy the candidate password to the clipboard.', {
      expectedEmail: maskEmail(expectedAppleId),
      actions,
    })
  }
  actions.push('candidate_password_copied_to_clipboard')
}

if (updateCandidateFromStdin) {
  updateCandidatePassword(readFileSync(0, 'utf8'), 'candidate_password_updated_from_stdin')
}

if (updateCandidateFromClipboard) {
  const clipboard = run('pbpaste', [])
  if (clipboard.status !== 0) {
    fail('Could not read the clipboard.', {
      expectedEmail: maskEmail(expectedAppleId),
      actions,
    })
  }
  updateCandidatePassword(clipboard.stdout, 'candidate_password_updated_from_clipboard')
}

const state = readLoginState()
const readyToMarkValidated =
  state.state !== 'login_error' &&
  state.checks?.idsHasActiveAccount === true &&
  state.checks?.idsExpectedIdentityPresent === true

if (checkReadyToValidate) {
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: readyToMarkValidated,
        expectedEmail: maskEmail(expectedAppleId),
        action: 'check_ready_to_validate',
        readyToMarkValidated,
        state: state.state ?? 'unknown',
        blockedBy: state.blockedBy ?? null,
        idsHasActiveAccount: state.checks?.idsHasActiveAccount ?? null,
        idsExpectedIdentityPresent: state.checks?.idsExpectedIdentityPresent ?? null,
        credentials: {
          status: state.credentials?.status ?? null,
          validated: state.credentials?.validated ?? null,
          expectedEmailMatches: state.credentials?.expectedEmailMatches ?? null,
          candidatePasswordPresent: state.credentials?.candidatePasswordPresent ?? null,
          verificationPhonePresent: state.credentials?.verificationPhonePresent ?? null,
        },
        requiredNextStep: state.requiredNextStep ?? null,
      },
      null,
      2,
    )}\n`,
  )
}

if (markValidated) {
  if (!confirmAppleAccepted) {
    fail('Refusing to mark validated without --confirm-apple-accepted.', {
      expectedEmail: maskEmail(expectedAppleId),
      state: state.state ?? 'unknown',
      actions,
    })
  }
  if (state.state === 'login_error') {
    fail('Refusing to mark validated while Messages reports an Apple login error.', {
      expectedEmail: maskEmail(expectedAppleId),
      state: state.state,
      requiredNextStep: state.requiredNextStep ?? null,
      actions,
    })
  }
  if (!readyToMarkValidated) {
    fail('Refusing to mark validated until IDS proves Messages has the dedicated Pluto Apple ID active.', {
      expectedEmail: maskEmail(expectedAppleId),
      state: state.state ?? 'unknown',
      blockedBy: state.blockedBy ?? null,
      idsHasActiveAccount: state.checks?.idsHasActiveAccount ?? null,
      idsExpectedIdentityPresent: state.checks?.idsExpectedIdentityPresent ?? null,
      requiredNextStep: state.requiredNextStep ?? null,
      actions,
    })
  }
  const write = writeKeychain(credentialStatusService, 'pluto-apple-id', 'validated')
  if (write.status !== 0) {
    fail('Could not write the validated credential marker to Keychain.', {
      expectedEmail: maskEmail(expectedAppleId),
      state: state.state ?? 'unknown',
      actions,
    })
  }
  actions.push('credential_status_marked_validated')
}

if (checkReadyToValidate && !markValidated && !restoreCandidate) {
  process.exit(readyToMarkValidated ? 0 : 1)
}

const after = readLoginState()
if (submitMessagesLogin) {
  writeSubmitEvidence({ stateBefore: actionStateBefore, submit: submitResult, stateAfter: after })
}
process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      expectedEmail: maskEmail(expectedAppleId),
      actions,
      stateBefore: actionStateBefore?.state ?? state.state ?? 'unknown',
      stateAfter: after.state ?? 'unknown',
      credentials: {
        status: after.credentials?.status ?? null,
        validated: after.credentials?.validated ?? null,
        expectedEmailMatches: after.credentials?.expectedEmailMatches ?? null,
        candidatePasswordPresent: after.credentials?.candidatePasswordPresent ?? null,
        verificationPhonePresent: after.credentials?.verificationPhonePresent ?? null,
      },
      clipboard: clipboardStatus,
      submit: submitResult,
      requiredNextStep: after.requiredNextStep ?? null,
    },
    null,
    2,
  )}\n`,
)
