/**
 * The account boundary (Phase 4 M5). The original asked a guest to sign in after "Approve and
 * continue" (it went to `/login?redirect=…`) and, signed in, saved the design to the account before
 * attaching it to the product page. Its sign-in and cloud-save backend could not be observed, and
 * this rebuild has none yet: accounts arrive with checkout (Phase 6).
 *
 * So the Studio and the product page ask this boundary — never a hard-wired assumption — what the
 * customer can do after approving. Today the only adapter is `noAccounts`: sign-in is unavailable,
 * and the approved design stays in this browser (it is already saved there by the Studio). A real
 * adapter later answers `signed-in` (attach straight away) or offers a sign-in URL, without changes
 * to the Review, handoff or product page code.
 */

export type AccountSession =
  /** No account system in this build: no sign-in is offered and nothing is sent anywhere. */
  | { kind: 'unavailable'; reason: string }
  /** Signed out; signing in is possible at `signInHref(redirect)`. */
  | { kind: 'guest'; signInHref(redirectTo: string): string }
  /** Signed in: approved designs go to the account. */
  | { kind: 'signed-in'; displayName: string };

export interface AccountService {
  session(): AccountSession;
}

export const NO_ACCOUNTS_REASON = 'Signing in to save designs to an account isn’t available yet. It arrives with online checkout.';

export const noAccounts: AccountService = {
  session: () => ({ kind: 'unavailable', reason: NO_ACCOUNTS_REASON }),
};

let current: AccountService = noAccounts;

export function accountService(): AccountService {
  return current;
}

/** Tests (and, later, the real adapter) set the service here. */
export function setAccountServiceForTests(next: AccountService | null): void {
  current = next ?? noAccounts;
}
