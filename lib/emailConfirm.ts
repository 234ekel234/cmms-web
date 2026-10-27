/**
 * A confirm-email link waiting for its owner to sign in.
 *
 * The link (`/confirm-email?token=…`) only works for the signed-in user it was
 * sent for — that is the whole proof (backend helpers/emailConfirmation.js) —
 * so someone arriving signed out has to sign in first. The token waits here
 * meanwhile, in sessionStorage: it survives the trip through the login page in
 * this tab and nothing longer, and it is out of the address bar and history.
 */
const KEY = "cmms.pendingEmailConfirm";

export function savePendingConfirm(token: string) {
  try { sessionStorage.setItem(KEY, token); } catch { /* storage off: the link can be opened again */ }
}

export function pendingConfirm(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

export function clearPendingConfirm() {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
