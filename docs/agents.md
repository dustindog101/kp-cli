# Agent usage

Use `--json --no-interactive` for deterministic, unattended reads. Run `kp auth status --live --json` to validate a session; local `auth status` only checks whether files exist. A human runs `kp auth setup` once to enter credentials into Keychain, or uses manual browser login. Saved credentials support hidden recovery in JSON mode; any MFA/browser challenge still needs a human.

Safe current commands: `status`, `orders list`, `orders show`, `rx list`, `rx show`, `notifications preferences`, `notifications sync`, `notifications list`, and refill/cancel previews with `--dry-run`. Sync writes only the local private update cache. No remote mutation is implemented.

Do not assume a prescription is orderable because it appears in a list. Check `canOrder` and `refillEligible`. Respect `partial` and `warnings`; null IDs are unavailable. Row references such as `rx-1` are not permanent identifiers. A pickup-ready order may have raw status `INPROGRESS`; use the normalized digital status for user-facing reporting.

On `AUTH_REQUIRED`, ask the user to run `kp auth setup` or `kp auth login --browser`. On `AUTH_INTERACTION_REQUIRED`, stop until a human completes `kp auth login --browser`. On `CREDENTIALS_REJECTED`, automatic attempts are paused; ask the user to replace credentials with `kp auth setup`. Never repeatedly submit credentials or accept them in chat/arguments. Use `--interactive` only when the user is available for visible verification. On `RATE_LIMITED`, stop and wait. On `SCHEMA_CHANGED`, report the limitation; do not infer an empty account. On `ACTION_NOT_VERIFIED`, use the website or an inspected preview; do not invent API calls.

JSON stdout may contain prescription names, IDs, and pharmacy details. Treat output as private account data. Do not commit it, attach it to public issues, or include credentials in logs. The fixtures in `test/` are synthetic.
