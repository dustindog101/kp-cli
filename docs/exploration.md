# Pharmacy integration notes

This document describes integration contracts and current limitations. Examples and test fixtures are synthetic. Captured sessions, credentials, patient records, and account-specific exploration outputs are excluded from the public source and release package.

## Supported integration

- KP sign-in uses its identity redirect flow. The site's saved-User-ID preference is separate from credential storage in this CLI.
- Pharmacy pages may be embedded in an Epic MyChart FDI redirection iframe. Login capture observes successful pharmacy API responses rather than relying on top-level page text alone.
- Order status, order details, prescription listing, and pharmacy communication preferences use authenticated HTTPS requests without launching a browser for normal reads.
- Digital order status can be more specific than generic backend status. The CLI displays digital status and preserves the raw status in JSON.
- Order details can expose prescription-level status, copay, pharmacy location, hours, and phone numbers. CLI output is private account data.
- Prescription responses may include warnings, incomplete records, or missing identifiers. The CLI flags incomplete results and does not invent server identifiers.
- Communication preference output omits contact addresses.

## HTTP endpoints

Base: `https://apims.kaiserpermanente.org/kp/mycare/pharmacy-microservices/`

| Method | Path                                                     | Implemented behavior                                                 |
| ------ | -------------------------------------------------------- | -------------------------------------------------------------------- |
| GET    | `rx-order-management-bff/v1/orderStatus`                 | Order summary, raw and digital status                                |
| GET    | `rx-order-management-bff/v1/orderDetails`                | Selected order details; `ordernum` and `pharmacyId` query parameters |
| GET    | `rx-cost-inventory-bff/v1/rxDetails`                     | Prescription listing; `prescriptions_filter=all`                     |
| GET    | `pharmacy-center-kpweb-bff/v1/rxnotificationpreferences` | Preference names and channel subscription flags                      |

Prescription listing uses additional session/member/region headers. Values are captured into private local profile state, never hardcoded into the repository. Backend contracts and regional routing can change.

## Authentication and recovery

`kp auth setup` accepts hidden terminal input and stores the credential payload in macOS Keychain. Normal commands reuse private session state over HTTPS. Recognized authentication failures can trigger one hidden Chrome sign-in and one retry of the read.

The implementation has been checked with synthetic fixtures, native Keychain round-trip checks, hidden sign-in, and session-recovery checks. Successful tests do not guarantee permanent unattended access. Credential rejection and verification challenges pause automatic attempts. A human may need to run `kp auth login --browser`.

## Remaining work

Refill checkout, cancellation submission, auto-refill changes, and notification preference changes are not implemented. Inspect and validate eligible flows before adding mutation endpoints or payloads. Never infer write contracts from public help pages or read-only responses.

Future exploration includes order-history filtering, pharmacy announcements, regional adapters, and reviewed refill/cancellation plans. New contract fixtures must use synthetic data. Any authorized live mutation test must reconcile server state and handle uncertain outcomes before retrying.

Local notification history reports changes between successful order snapshots. KP announcements, care messages, push notifications, and email/SMS delivery are outside the current implementation.
