# KP member CLI

An unofficial Kaiser Permanente CLI for people and agents. Prescription information is the first feature. Enter credentials once in the CLI and save them in macOS Keychain; pharmacy reads use direct HTTPS, with a hidden Chrome login when the session expires. Visible browser login is also available.

## Get started

Requires Node.js 22+ and Google Chrome. Saved-credential login currently supports macOS Keychain. Both User ID and password are hidden during terminal entry and are never accepted in command arguments or piped input.

```sh
git clone https://github.com/dustindog101/kp-cli.git
cd kp-cli
npm ci
npm link
kp auth setup
kp status
kp orders show
```

Install the packaged CLI from the [latest GitHub release](https://github.com/dustindog101/kp-cli/releases/latest), or clone the source using the commands above. This project is independent of Kaiser Permanente and is not an official KP product.

`kp auth setup` prompts privately in the terminal, saves the User ID and password in macOS Keychain, and attempts sign-in through hidden Chrome. After setup, normal commands reuse the saved session over HTTPS. When KP returns a recognized authentication failure, the CLI tries saved credentials once in a hidden browser and retries the read once. This works in agent/JSON mode too; no terminal input is needed for saved credentials.

`kp auth login` uses saved credentials in hidden Chrome. `kp auth login --browser` opens visible Chrome for MFA or a site challenge and fills saved credentials when a sign-in form is present. Without configured credentials, `auth login` uses manual browser sign-in. `--fresh` skips the saved session.

KP may still require verification, a changed password, or a browser challenge. Automatic login pauses after a credential rejection or challenge; it does not keep resubmitting passwords. Interactive commands can open a visible browser when verification is needed. Agent/JSON commands stop with a stable error until a human runs `kp auth login --browser`. There is no proactive background keepalive, direct-HTTPS password grant, or guarantee of permanent unattended access.

`kp auth forget` removes saved credentials but keeps the current session. `kp auth logout` removes credentials, the session, and local updates. `--no-interactive` prevents visible browser recovery; saved-credential hidden recovery remains enabled.

## Commands

```sh
kp status                           # Orders and prescription availability
kp orders list                      # Current orders and identifiers
kp orders show                      # Details when exactly one order exists
kp orders show ORDER_ID              # Status, copay, pickup address, hours, phones
kp rx list                          # Prescriptions, refills remaining, eligibility
kp rx show rx-1                      # Current response row (not a persistent Rx ID)
kp rx refill rx-1 --dry-run          # Eligibility preview only
kp orders cancel ORDER_ID --dry-run  # Order preview only
kp notifications preferences        # Current KP communication preferences
kp notifications sync               # Establish baseline, then detect changes
kp notifications list               # Cached local update history
kp notifications watch --interval 300
kp auth setup                       # Enter credentials once, save in Keychain
kp auth login --browser              # Complete MFA or a browser challenge
kp auth forget                      # Forget credentials; keep current session
kp auth status                      # Local metadata; does not assert validity
kp auth status --live                # Validate using an order-status request
kp auth logout                      # Remove credentials, session, and update cache
kp features                         # Current and planned modules
```

**Refill and cancellation submission are not implemented.** Commands require `--dry-run`, never alter the KP cart, and never submit or cancel an order. Checkout and cancellation request contracts have not been verified for submission. Complete those actions on KP until an eligible flow can be inspected and implemented. Pharmacy preferences are read-only as well.

`notifications watch` polls only order status. The first successful sync establishes a baseline without alerting; subsequent changes appear in the terminal. JSON watch output is newline-delimited records. This is a local change log, not KP's message inbox, email/SMS delivery, or a background service. A disappeared order is reported as “no longer listed,” not “cancelled.” History is limited to 200 events.

KP can return backend warnings or missing prescription identifiers. The CLI reports this as incomplete data and does not manufacture server IDs. `rx-1` references are only valid for the current listing and may change between requests. Generic order status and digital status can differ; the CLI displays digital status and preserves the raw status in JSON.

## Agent interface

Add `--json` before or after the subcommand. Normal commands emit one JSON record to stdout; progress goes to stderr. Help and version remain text.

```sh
kp --json status
kp orders list --json
kp notifications sync --json
```

```json
{ "schemaVersion": 1, "ok": true, "data": { "example": "synthetic" } }
```

```json
{
  "schemaVersion": 1,
  "ok": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "No saved session. Run kp auth login."
  }
}
```

Exit codes: `0` success, `1` local/internal error, `2` invalid arguments, `3` authentication required, `4` network/API/schema failure, `5` not found, `6` action not implemented/verified. See [the agent guide](docs/agents.md).

## Session storage

Default location: `~/.local/share/kp-cli/profiles/default/`. Select another account with `--profile NAME`, or set `KP_HOME` to change the root.

The CLI credential payload is stored in macOS Keychain, scoped to the profile and storage root. KP session state can also contain its remembered-User-ID preference. Keychain may ask for access or need unlocking. There is no plaintext-password fallback.

Session files and captured API headers contain session credentials; local status snapshots contain health information. Profile directories use `0700` and files use `0600` on macOS/Linux. These files are stored unencrypted under your OS account. `auth logout` removes Keychain credentials and local state; it does not revoke other browser sessions. No session export command or raw HTTP command is provided.

For isolated development:

```sh
KP_HOME="$PWD/.local" node bin/kp.js auth login --browser
KP_HOME="$PWD/.local" node bin/kp.js status
```

`.local/`, `.kp/`, browser artifacts, and environment files are ignored by Git. Never put real patient data in fixtures, docs, or commits. Public package publishing is disabled.

## Development and layout

```sh
npm run check
npm run format:check
npm test
```

- `src/core/`: profile storage, browser authentication, HTTP transport, output, errors.
- `src/features/pharmacy/`: observed endpoint definitions, response normalization, read services, refill previews.
- `src/features/notifications/`: bounded local snapshot comparisons.
- `src/features/{appointments,messages,records}/`: domain boundaries and implementation requirements for future features.
- `src/cli.js`: command routing and rendering.
- `test/`: synthetic status/partial-data, transport, private-storage, and agent-output checks.

See [the integration notes](docs/exploration.md) for verified capabilities and remaining work, and [architecture](docs/architecture.md) for extension rules. Regional endpoints may differ; this release is not verified across all KP regions.
