#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import process from 'node:process'
import { resolve } from 'node:path'

const expectedAppleId = String(process.env.PLUTO_DEDICATED_APPLE_ID || '').trim()
const dedicatedEmailService = process.env.PLUTO_APPLE_ID_EMAIL_KEYCHAIN_SERVICE || 'OpenClaw Pluto Apple ID dedicated email'
const credentialStatusService = process.env.PLUTO_APPLE_ID_STATUS_KEYCHAIN_SERVICE || 'OpenClaw Pluto Apple ID credential status'
const candidatePasswordService = process.env.PLUTO_APPLE_ID_CANDIDATE_PASSWORD_SERVICE || 'OpenClaw Pluto Apple ID candidate password'
const verificationPhoneService = process.env.PLUTO_APPLE_ID_PHONE_KEYCHAIN_SERVICE || 'OpenClaw Pluto Apple ID verification phone'
const pruneInvalidCandidate = process.argv.includes('--prune-invalid-candidate')
const selfTest = process.argv.includes('--self-test')
const summaryOnly = process.argv.includes('--summary')
const forbiddenIdentities = (process.env.PLUTO_FORBIDDEN_IMESSAGE_IDENTITIES || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    ...options,
  })
}

function keychainSecretPresent(service) {
  const result = run('security', ['find-generic-password', '-s', service, '-w'])
  return {
    present: result.status === 0 && String(result.stdout || '').trim().length > 0,
    value: result.status === 0 ? String(result.stdout || '').trim() : '',
  }
}

function deleteKeychainService(service) {
  const result = run('security', ['delete-generic-password', '-s', service])
  return {
    ok: result.status === 0,
    exitCode: result.status,
  }
}

function maskEmail(value) {
  const text = String(value || '')
  const at = text.indexOf('@')
  if (at <= 1) return text ? '<redacted-email>' : null
  return `${text.slice(0, Math.min(3, at))}***${text.slice(at)}`
}

function readPlistJson(path) {
  const result = run('plutil', ['-convert', 'json', '-o', '-', path])
  if (result.status !== 0) {
    return { ok: false, path, data: null }
  }
  try {
    return { ok: true, path, data: JSON.parse(result.stdout || '{}') }
  } catch {
    return { ok: false, path, data: null }
  }
}

function inspectIdsAccountState() {
  const imessagePlist = readPlistJson(resolve(homedir(), 'Library/Preferences/com.apple.imservice.ids.iMessage.plist'))
  const byHostProbe = run('sh', [
    '-lc',
    'ls "$HOME"/Library/Preferences/ByHost/com.apple.imservice.ids.iMessage.*.plist 2>/dev/null | tail -n 1',
  ])
  const byHostPath = String(byHostProbe.stdout || '').trim()
  const byHostPlist = byHostPath ? readPlistJson(byHostPath) : { ok: false, path: null, data: null }
  const activeAccounts = Array.isArray(imessagePlist.data?.ActiveAccounts) ? imessagePlist.data.ActiveAccounts : []
  const onlineAccounts = Array.isArray(imessagePlist.data?.OnlineAccounts) ? imessagePlist.data.OnlineAccounts : []
  const status = byHostPlist.data?.Status && typeof byHostPlist.data.Status === 'object' ? byHostPlist.data.Status : {}
  const activeText = JSON.stringify({ activeAccounts, onlineAccounts, status }).toLowerCase()

  return {
    probeOk: imessagePlist.ok,
    byHostProbeOk: byHostPlist.ok,
    activeAccountCount: activeAccounts.length,
    onlineAccountCount: onlineAccounts.length,
    statusEntryCount: Object.keys(status).length,
    hasActiveAccount: activeAccounts.length > 0 || onlineAccounts.length > 0,
    expectedIdentityPresent: expectedAppleId ? activeText.includes(expectedAppleId.toLowerCase()) : false,
    forbiddenIdentityDetected: forbiddenIdentities.some((identity) => activeText.includes(identity.toLowerCase())),
  }
}

function runMessagesUiProbe() {
  const script = `
tell application "System Events"
  if not (exists process "Messages") then
    return "process=absent"
  end if

  tell process "Messages"
    set windowCount to count of windows
    set outputText to "process=present windowCount=" & windowCount
    if windowCount > 0 then
      repeat with i from 1 to windowCount
        set w to window i
        set buttonNames to ""
        try
          set buttonNames to name of every button of w as text
        end try
        set staticNames to ""
        try
          set staticNames to name of every static text of w as text
        end try
        set fieldValues to ""
        try
          repeat with textField in text fields of w
            try
              set fieldValues to fieldValues & " " & (value of textField as text)
            end try
          end repeat
        end try
        set fieldCount to 0
        try
          set fieldCount to count of text fields of w
        end try
        set outputText to outputText & linefeed & "window=" & i & tab & "buttons=" & buttonNames & tab & "static=" & staticNames & tab & "fields=" & fieldCount & tab & "values=" & fieldValues
      end repeat
    end if
    return outputText
  end tell
end tell
`
  const result = run('osascript', ['-e', script])
  return {
    ok: result.status === 0,
    exitCode: result.status,
    raw: `${result.stdout || ''}\n${result.stderr || ''}`,
  }
}

function includesAny(haystack, needles) {
  const normalized = haystack.toLowerCase()
  return needles.some((needle) => normalized.includes(needle.toLowerCase()))
}

function maxWindowMetric(uiRaw, metricName) {
  const matches = [...String(uiRaw || '').matchAll(new RegExp(`${metricName}=(\\d+)`, 'g'))]
  return matches.reduce((max, match) => Math.max(max, Number(match[1] || 0)), 0)
}

function classifyLoginState(uiRaw, credentials, idsAccountState) {
  const raw = String(uiRaw || '')
  const lower = raw.toLowerCase()
  const messagesRunning = lower.includes('process=present')
  const loginButtonsPresent = includesAny(raw, ['Entrar', 'Sign In']) && includesAny(raw, ['Esqueceu a senha?', 'Forgot password'])
  const loginErrorPresent = includesAny(raw, [
    'Sua senha ou Conta Apple esta incorreta',
    'Sua senha ou Conta Apple est\u00e1 incorreta',
    'password or Apple Account is incorrect',
    'password or Apple ID is incorrect',
  ])
  const needs2fa = includesAny(raw, [
    'codigo de verificacao',
    'c\u00f3digo de verifica\u00e7\u00e3o',
    'verificacao de dois fatores',
    'verifica\u00e7\u00e3o de dois fatores',
    'two-factor',
    'verification code',
  ])
  const expectedVisible = expectedAppleId ? lower.includes(expectedAppleId.toLowerCase()) : false
  const forbiddenIdentityDetected = includesAny(raw, forbiddenIdentities)

  if (!messagesRunning) return 'not_signed_in'
  if (forbiddenIdentityDetected) return 'not_signed_in'
  if (idsAccountState.forbiddenIdentityDetected) return 'not_signed_in'
  if (loginErrorPresent) return 'login_error'
  if (needs2fa) return 'needs_2fa'
  if (loginButtonsPresent) return 'not_signed_in'
  if (idsAccountState.probeOk && !idsAccountState.hasActiveAccount) return 'not_signed_in'
  if (
    idsAccountState.hasActiveAccount &&
    idsAccountState.expectedIdentityPresent &&
    credentials.validated &&
    credentials.expectedEmailMatches
  ) {
    return 'signed_in_dedicated'
  }
  if (expectedVisible && credentials.expectedEmailMatches) return 'signed_in_unknown'
  return 'signed_in_unknown'
}

function blockedByForState({ ok, forbiddenIdentityDetected, credentials, state, idsAccountState }) {
  if (ok) return null
  if (forbiddenIdentityDetected) return 'forbidden_identity'
  if (credentials.status === 'identity_unavailable') return 'identity_unavailable'
  if (state === 'login_error') return 'apple_login_error'
  if (credentials.status === 'account_missing') return 'apple_account_missing'
  if (credentials.status === 'candidate_pending') return 'apple_verification_pending'
  if (state === 'needs_2fa') return 'apple_verification_pending'
  if (credentials.validated && (!idsAccountState.hasActiveAccount || !idsAccountState.expectedIdentityPresent)) return 'messages_ids_pending'
  if (state === 'not_signed_in') return 'messages_login_pending'
  return 'unproven_dedicated_identity'
}

function loginPhaseForState({ ok, state, credentials, checks, idsAccountState }) {
  if (ok) return 'dedicated_identity_active'
  if (state === 'login_error') return 'apple_login_error_visible'
  if (state === 'needs_2fa') return 'apple_verification_prompt_visible'
  if (credentials.status === 'account_missing') return 'apple_account_creation_required'
  if (checks.loginWindowPresent) return 'messages_login_form_visible'
  if (credentials.status === 'candidate_pending' && idsAccountState.hasActiveAccount === false) return 'submitted_or_closed_without_ids'
  if (credentials.validated && idsAccountState.hasActiveAccount === false) return 'messages_ids_pending'
  return 'unproven_login_state'
}

function runSelfTest() {
  const cases = [
    {
      name: 'validated_marker_without_ids_is_not_dedicated',
      uiRaw: 'process=present windowCount=1\nwindow=1\tbuttons=\tstatic=\tfields=0\tvalues=',
      credentials: {
        status: 'validated',
        validated: true,
        expectedEmailMatches: true,
      },
      idsAccountState: {
        probeOk: true,
        hasActiveAccount: false,
        expectedIdentityPresent: false,
        forbiddenIdentityDetected: false,
      },
      expectedState: 'not_signed_in',
      expectedBlockedBy: 'messages_ids_pending',
      expectedOk: false,
    },
    {
      name: 'validated_marker_with_expected_ids_is_dedicated',
      uiRaw: 'process=present windowCount=1\nwindow=1\tbuttons=\tstatic=\tfields=0\tvalues=',
      credentials: {
        status: 'validated',
        validated: true,
        expectedEmailMatches: true,
      },
      idsAccountState: {
        probeOk: true,
        hasActiveAccount: true,
        expectedIdentityPresent: true,
        forbiddenIdentityDetected: false,
      },
      expectedState: 'signed_in_dedicated',
      expectedBlockedBy: null,
      expectedOk: true,
    },
    {
      name: 'candidate_pending_stays_apple_verification_pending',
      uiRaw: 'process=present windowCount=1\nwindow=1\tbuttons=Entrar, Esqueceu a senha?\tstatic=\tfields=1\tvalues=',
      credentials: {
        status: 'candidate_pending',
        validated: false,
        expectedEmailMatches: true,
      },
      idsAccountState: {
        probeOk: true,
        hasActiveAccount: false,
        expectedIdentityPresent: false,
        forbiddenIdentityDetected: false,
      },
      expectedState: 'not_signed_in',
      expectedBlockedBy: 'apple_verification_pending',
      expectedOk: false,
    },
    {
      name: 'candidate_pending_login_error_is_apple_login_error',
      uiRaw: 'process=present windowCount=1\nwindow=1\tbuttons=Entrar, Esqueceu a senha?\tstatic=Sua senha ou Conta Apple está incorreta\tfields=1\tvalues=',
      credentials: {
        status: 'candidate_pending',
        validated: false,
        expectedEmailMatches: true,
      },
      idsAccountState: {
        probeOk: true,
        hasActiveAccount: false,
        expectedIdentityPresent: false,
        forbiddenIdentityDetected: false,
      },
      expectedState: 'login_error',
      expectedBlockedBy: 'apple_login_error',
      expectedOk: false,
    },
  ]

  const results = cases.map((testCase) => {
    const state = classifyLoginState(testCase.uiRaw, testCase.credentials, testCase.idsAccountState)
    const forbiddenIdentityDetected = includesAny(testCase.uiRaw, forbiddenIdentities) || testCase.idsAccountState.forbiddenIdentityDetected
    const ok =
      state === 'signed_in_dedicated' &&
      testCase.credentials.validated &&
      testCase.credentials.expectedEmailMatches &&
      testCase.idsAccountState.hasActiveAccount &&
      testCase.idsAccountState.expectedIdentityPresent &&
      !forbiddenIdentityDetected
    const blockedBy = blockedByForState({
      ok,
      forbiddenIdentityDetected,
      credentials: testCase.credentials,
      state,
      idsAccountState: testCase.idsAccountState,
    })
    const pass = state === testCase.expectedState && blockedBy === testCase.expectedBlockedBy && ok === testCase.expectedOk
    return {
      name: testCase.name,
      pass,
      expected: {
        state: testCase.expectedState,
        blockedBy: testCase.expectedBlockedBy,
        ok: testCase.expectedOk,
      },
      actual: { state, blockedBy, ok },
    }
  })

  const failed = results.filter((result) => !result.pass)
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, ok: failed.length === 0, results }, null, 2)}\n`)
  process.exit(failed.length === 0 ? 0 : 1)
}

if (selfTest) runSelfTest()

const dedicatedEmail = keychainSecretPresent(dedicatedEmailService)
const credentialStatus = keychainSecretPresent(credentialStatusService)
let candidatePassword = keychainSecretPresent(candidatePasswordService)
const verificationPhone = keychainSecretPresent(verificationPhoneService)
const hygieneActions = []

if (pruneInvalidCandidate && credentialStatus.value === 'candidate_invalid' && candidatePassword.present) {
  const deletion = deleteKeychainService(candidatePasswordService)
  hygieneActions.push({
    action: 'prune_invalid_candidate_password',
    ok: deletion.ok,
  })
  candidatePassword = keychainSecretPresent(candidatePasswordService)
}

const credentials = {
  dedicatedEmailPresent: dedicatedEmail.present,
  expectedEmailMasked: maskEmail(expectedAppleId),
  storedEmailMasked: dedicatedEmail.present ? maskEmail(dedicatedEmail.value) : null,
  expectedEmailMatches: dedicatedEmail.present && dedicatedEmail.value.toLowerCase() === expectedAppleId.toLowerCase(),
  candidatePasswordPresent: candidatePassword.present,
  verificationPhonePresent: verificationPhone.present,
  statusMarkerPresent: credentialStatus.present,
  status: credentialStatus.present ? credentialStatus.value : 'missing',
  validated: credentialStatus.present && credentialStatus.value === 'validated',
}
const uiProbe = runMessagesUiProbe()
const idsAccountState = inspectIdsAccountState()
const state = classifyLoginState(uiProbe.raw, credentials, idsAccountState)
const forbiddenIdentityDetected = includesAny(uiProbe.raw, forbiddenIdentities) || idsAccountState.forbiddenIdentityDetected
const loginWindowPresent = includesAny(uiProbe.raw, ['Entrar', 'Sign In']) && includesAny(uiProbe.raw, ['Esqueceu a senha?', 'Forgot password'])
const loginWindowFieldCount = loginWindowPresent ? maxWindowMetric(uiProbe.raw, 'fields') : 0
const messagesWindowCount = maxWindowMetric(uiProbe.raw, 'windowCount')
const credentialContradictedByLoginError = state === 'login_error' && credentials.validated === true
const effectiveCredentials = {
  ...credentials,
  markerValidated: credentials.validated,
  contradictedByLoginError: credentialContradictedByLoginError,
  validated: credentials.validated === true && !credentialContradictedByLoginError,
}

const ok =
  state === 'signed_in_dedicated' &&
  effectiveCredentials.validated &&
  effectiveCredentials.expectedEmailMatches &&
  idsAccountState.hasActiveAccount &&
  idsAccountState.expectedIdentityPresent &&
  !forbiddenIdentityDetected
const needsHumanAction = state !== 'signed_in_dedicated' || !effectiveCredentials.validated
const blockedBy = blockedByForState({
  ok,
  forbiddenIdentityDetected,
  credentials: effectiveCredentials,
  state,
  idsAccountState,
})
const loginPhase = loginPhaseForState({
  ok,
  state,
  credentials: effectiveCredentials,
  checks: {
    loginWindowPresent,
    loginWindowFieldCount,
    messagesWindowCount,
  },
  idsAccountState,
})

function requiredNextStepForState() {
  if (ok) return null
  if (effectiveCredentials.status === 'identity_unavailable') {
    return 'Dedicated Pluto Apple Account cannot be provisioned with the current resources. Use STS/browser as the practical primary channel, or provide an accessible email and phone number for Apple verification.'
  }
  if (state === 'login_error') {
    if (effectiveCredentials.status === 'candidate_pending') {
      return 'Apple rejected the candidate Pluto Apple ID login. If the account is not created, finish the official Apple account creation flow; if it exists, recover or reset the password, then retry Messages login.'
    }
    return 'Apple rejected the dedicated Pluto Apple ID login. Recover or reset the Apple Account password, then retry Messages login.'
  }
  if (effectiveCredentials.status === 'account_missing') {
    return 'Create and verify the dedicated Pluto Apple Account with Apple, then sign into Messages on this Mac.'
  }
  if (effectiveCredentials.status === 'candidate_pending') {
    return 'A candidate password exists in Keychain but is not validated. Use it only in the official Apple account creation/login flow, complete verification, then mark the credential status as validated after Messages accepts the account.'
  }
  if (state === 'needs_2fa') {
    return 'Complete Apple 2FA/CAPTCHA/email/SMS verification in Messages, then send a fresh iPhone marker.'
  }
  if (effectiveCredentials.validated) {
    return 'Complete Messages login with the dedicated Pluto Apple ID and send a fresh iPhone marker.'
  }
  return 'Validate or recover the dedicated Pluto Apple ID password with Apple, then store a validated Keychain status marker.'
}

const result = {
  schemaVersion: 1,
  ok,
  state,
  expectedState: 'signed_in_dedicated',
  blockedBy,
  loginPhase,
  needsHumanAction,
  summary: {
    state,
    blockedBy,
    loginPhase,
    credentialStatus: effectiveCredentials.status,
    credentialValidated: effectiveCredentials.validated,
    candidatePasswordPresent: effectiveCredentials.candidatePasswordPresent,
    verificationPhonePresent: effectiveCredentials.verificationPhonePresent,
    messagesRunning: uiProbe.raw.toLowerCase().includes('process=present'),
    loginWindowPresent,
    idsHasActiveAccount: idsAccountState.hasActiveAccount,
    idsExpectedIdentityPresent: idsAccountState.expectedIdentityPresent,
  },
  credentials: effectiveCredentials,
  checks: {
    messagesUiProbeOk: uiProbe.ok,
    messagesRunning: uiProbe.raw.toLowerCase().includes('process=present'),
    messagesWindowCount,
    loginWindowPresent,
    loginWindowFieldCount,
    loginErrorPresent: state === 'login_error',
    needs2fa: state === 'needs_2fa',
    forbiddenIdentityDetected,
    dedicatedAppleIdExpected: true,
    dedicatedCredentialValidated: effectiveCredentials.validated,
    idsProbeOk: idsAccountState.probeOk,
    idsByHostProbeOk: idsAccountState.byHostProbeOk,
    idsActiveAccountCount: idsAccountState.activeAccountCount,
    idsOnlineAccountCount: idsAccountState.onlineAccountCount,
    idsStatusEntryCount: idsAccountState.statusEntryCount,
    idsHasActiveAccount: idsAccountState.hasActiveAccount,
    idsExpectedIdentityPresent: idsAccountState.expectedIdentityPresent,
  },
  hygiene: {
    pruneInvalidCandidateRequested: pruneInvalidCandidate,
    actions: hygieneActions,
  },
  requiredNextStep: requiredNextStepForState(),
}

const output = summaryOnly
  ? {
      schemaVersion: result.schemaVersion,
      ok: result.ok,
      summary: result.summary,
      requiredNextStep: result.requiredNextStep,
    }
  : result

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
process.exit(0)
