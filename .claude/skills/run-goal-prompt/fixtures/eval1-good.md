Proposed goal brief
- Outcome: the authentication middleware is replaced with the new provider, with existing session behavior preserved.
- Scope: `src/middleware/auth.*` and its direct tests; excludes the login UI and the user model.
- Completion evidence: `npm test -- auth` passes, and a manual login/logout round trip succeeds against staging.
- Minimal truth: none; this fits in one session.
- Open assumptions: the new provider keeps the current token format.

Questions:
1. Which provider replaces the current one, and is the token format identical?
2. Must existing sessions survive the swap, or is a forced re-login acceptable?

Please confirm or correct this brief. I will generate the final `/goal` only after confirmation.

needs confirmation
