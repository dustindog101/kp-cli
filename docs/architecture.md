# Architecture

The command layer handles argument parsing and output. Each feature owns endpoint definitions, normalization, and service orchestration. Shared transport and authentication stay in `core`; adding a domain should not put that domain's behavior in the login code.

## Authentication

A terminal-only hidden prompt accepts User ID and password. macOS Keychain stores both as a secret payload under a profile/root-specific identity using the native OS keyring adapter. No username or password is written to metadata, command arguments, browser snapshots, or logs. Status reads configuration flags without retrieving the secret. Credential storage on other platforms has not been enabled or verified.

Hidden Chrome handles KP's identity redirects and fills the observed sign-in fields only on the exact `https://identityauth.kaiserpermanente.org` origin. It submits credentials at most once per login attempt. A successful pharmacy response listener captures allowlisted read-only API headers. Session state and headers are saved atomically into private profile files. Browser contexts are closed after capture. The same flow can use visible Chrome for human verification.

Read commands use Playwright's APIRequestContext, which sends HTTPS without launching a browser. Updated cookies are persisted when the transport closes. Recognized authentication failures trigger one saved-credential hidden login and one retry, including in JSON/agent mode. This is recovery on demand, not background keepalive or a direct HTTP credential grant.

Metadata tracks whether credentials are configured and whether automatic login is blocked. Rejected credentials pause automation until setup is replaced; a challenge pauses automation until explicit browser verification. Noninteractive commands never escalate themselves into a visible window. Interactive commands may open the browser after a hidden attempt requires verification. Raw server errors and login text are not included in error output. MFA is not bypassed.

`auth setup` stores the user-entered credentials and starts a fresh hidden login to check them. If validation requires verification, the credentials remain in Keychain, automation pauses, and the human completes `auth login --browser`. `auth forget` removes only the Keychain entry. `auth logout` deletes the Keychain entry before removing local state, so a failed Keychain removal cannot be reported as a complete logout.

## HTTP

Endpoints are defined from observed network requests. Session-bearing requests are restricted to the verified pharmacy API origin and path prefix. Redirects are disabled. TLS verification remains enabled. No guessed mutations, broad request retries, header dumps, or raw request command exist. Rate limits stop the command. Schema changes fail instead of producing an invented empty result.

Current reads are HTTP only. Browser authentication is the recovery mechanism; browser DOM fallback reads have not been implemented. Unsupported regional contracts must be explored before being added.

## Output

Human output uses simple text, short status blocks, and bounded tables. Backend values are stripped of terminal control characters for human display. JSON preserves values in a versioned success/error envelope. Error output omits raw network errors, request URLs with secrets, headers, and stack traces. Watch mode emits JSON lines for meaningful changes, rather than repeated unchanged snapshots.

## Future writes

A future mutation must have a separate prepare and execute boundary. Prepare should return an exact prescription/order ID, eligibility, fulfillment choices, price, and a stable reference to the reviewed plan. Execute should require explicit confirmation, revalidate the plan against current state, submit once, and read back the result. A network timeout is an unknown outcome; reconcile server state before retrying. Do not add synthetic refill/cancel payloads based on public FAQs.

## Future domains

Appointments, messages, and records have documented feature boundaries. Introduce modules after observing signed-in flows, with redacted contracts and synthetic fixtures. Keep medicine data, patient IDs, and captured sessions out of Git. A planned feature is reported as planned, rather than wired to a command that claims to return data.
