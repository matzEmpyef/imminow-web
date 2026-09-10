// Sign-in wording shared by Platform Pulse's Sign-ins card and the Sign-in history drawer
// (2026-09-10) — named by what the person did at the sign-in screen, not by server error codes.

export const SIGN_IN_METHOD_LABELS: Record<string, string> = {
  password: 'Password',
  email_code: 'Email code',
  phone_code: 'Phone code',
}

export const SIGN_IN_OUTCOME_LABELS: Record<string, string> = {
  success: 'Signed in',
  wrong_password: 'Wrong password',
  unknown_account: 'No account with that address',
  wrong_code: 'Wrong code',
  code_expired: 'Code expired',
  too_many_attempts: 'Too many wrong codes',
  rate_limited: 'Blocked after repeated failures',
  account_disabled: 'Account disabled',
  subscription_lapsed: 'Consultancy subscription lapsed',
}

export const SIGN_IN_PLATFORM_LABELS: Record<string, string> = { android: 'Android', ios: 'iOS', web: 'Web' }
