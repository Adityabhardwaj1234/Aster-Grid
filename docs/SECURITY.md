# Security and Data Policy

## Scope and trust model

ASTERGRID is a **local, single-user** synthetic coordination simulation. It is not an operational emergency-response system and must not be used for real-world dispatch, targeting, surveillance, or military coordination.

The trust model assumes:

- The server runs on the operator's own machine and binds to `127.0.0.1` by default.
- There is no authentication, no user account, and no multi-tenant boundary.
- All scenario data is fictional and generated locally from a seed.
- The browser, local filesystem, and local operator are trusted. The network and any external input are not.

**Do not expose ASTERGRID to a public network or the internet.** If a remote deployment is ever attempted, authentication, TLS termination, per-user authorization, CSRF protection, and durable rate limiting must be added first.

## Assets and classification

| Asset | Classification | Handling |
|---|---|---|
| Scenario configuration | Synthetic, non-sensitive | Validated, hashed, stored in SQLite |
| Generated world, artifacts, snapshots | Synthetic, non-sensitive | Stored locally, included in evidence exports |
| Run report and Markdown | Synthetic, non-sensitive | Downloadable by the local operator |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Secret | Read server-side only; never sent to the browser, never written to SQLite |
| Runtime database | Local operational data | `%LOCALAPPDATA%\ASTERGRID` or `~/.astergrid`; ignored by Git |
| Logs | Operational metadata | No keys, prompts, or model reasoning |

No personal data, real geospatial coordinates, named-person tracking, live feeds, weapons, targeting fields, or operational dispatch data are collected or accepted.

## Data policy

- All terrain, districts, populations, facilities, assets, and events are generated locally from a seed.
- No real geospatial datasets, map providers, live feeds, or external enrichment.
- No user accounts or personal profiles.
- The API rejects extra/unknown fields through Pydantic models with `extra="forbid"`.
- The UI, report, and Markdown export carry a persistent synthetic-data disclaimer.
- Runs are retained up to `ASTERGRID_RUNS_RETENTION` (default 20) and then pruned. Evidence copies committed under `docs/evidence/` are deliberate project artifacts, not runtime data.
- Runs left non-terminal by a restart are marked `interrupted`; evidence is not silently deleted.

## Secrets

- `.env` is ignored and must never be committed. `.env.example` contains placeholders only.
- Provider keys are read server-side from the environment and are never included in API responses, browser bundles, reports, logs, or screenshots.
- The verification script scans tracked files for common key and private-key formats and fails the gate on a match.
- If a secret is committed: rotate it immediately, remove it from the working tree and history, then record the incident and prevention step. Never force-push shared history casually.

## Input validation and abuse limits

- Pydantic models validate API bodies, scenario fields, numeric ranges, string lengths, enums, and artifact shapes.
- Unknown districts are rejected with `UNKNOWN_DISTRICT`; schema violations return `VALIDATION_ERROR` with field-level details.
- API mutation bodies are limited to **256,000 bytes** by the security middleware. The check reads `Content-Length`; a chunked request without that header is not size-limited by this middleware. The app remains local-only, but this is a known limitation.
- Run creation is limited to **6 per minute per process** using an in-memory sliding window. The limit is not shared across processes or hosts.
- A stale preview hash blocks run creation, preventing a run against a world the user did not inspect.
- Agents cannot supply arbitrary URLs, shell commands, filesystem paths, generated source, or executable tools.
- Model outputs, if a live provider path is added, must be revalidated against typed schemas before commit.
- SSE and event replay use typed payloads and monotonic sequence numbers.

## Run isolation

- One `RunContext` and one fresh ADK `Workflow` per run.
- Fixed artifact slots with single ownership.
- No shared mutable domain state between runs.
- Unique run IDs, correlation IDs, and monotonic event sequences.
- SQLite access uses parameterized statements and a write lock.
- A corrupt or inaccessible database fails loudly; it is not silently deleted.

## Transport and server

- Default bind: `127.0.0.1:8000`.
- CORS allow-list: `http://127.0.0.1:5173` and `http://localhost:5173` only; credentials disabled.
- Security headers on every response:
  - `Content-Security-Policy` with `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`
  - `Permissions-Policy` denying camera, microphone, geolocation, payment, and USB
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Resource-Policy: same-origin`
- API responses use `Cache-Control: no-store`. SSE responses disable buffering.
- The CSP allows `'unsafe-inline'` for styles because the UI uses style attributes for dynamic transforms and scene overlays. Scripts remain `'self'` only. This is a deliberate local-app trade-off and should be tightened with nonces before any public deployment.
- `/docs`, `/redoc`, and `/openapi.json` are served without a CSP header so FastAPI's documentation UI can load its own assets. They are local-only and unauthenticated.
- Static serving resolves paths and refuses to escape the frontend root.

## Live-model mode

Live Gemini execution is **not implemented** in this build.

- Without a key, Gemini mode is rejected with `GEMINI_NOT_CONFIGURED`.
- With a key present, Gemini mode is rejected with `GEMINI_NOT_ENABLED` (HTTP 501).
- There is no silent fallback to deterministic mode.
- The run manifest records requested mode, effective mode, and actual model calls.

If a provider path is added later, it must keep keys server-side, bound calls and retries, validate every output before use, preserve Critic authority, and never send real operational data.

## Logging and observability

- Uvicorn access logs record method, path, status, and timing.
- Application errors return structured codes and messages without stack traces or secrets.
- No prompts, provider keys, authorization headers, or private chain-of-thought are logged.
- The UI shows decision summaries, typed evidence, findings, and hashes — not hidden model reasoning.

## Public repository hygiene

- No `.env`, databases, WAL/SHM files, test traces, browser profiles, build output, or runtime logs.
- No hardcoded remote URLs in code, tests, or scripts; the remote lives in Git configuration.
- Screenshots contain only synthetic data and no secrets.
- Third-party assets and licenses are documented in `docs/ASSETS.md`.

## Verification

`scripts/verify.ps1` performs repository hygiene checks before running tests:

1. Refuses a tracked `.env`.
2. Scans tracked files for common credential patterns.
3. Runs `git diff --check` for whitespace errors.
4. Runs backend tests, Ruff check, and Ruff format check.
5. Runs frontend typecheck, unit tests, production build, and Playwright.

The accepted evidence run used zero model calls and no provider credentials.

## Incident response

If a secret is exposed:

1. Rotate or revoke it immediately.
2. Remove it from the working tree and Git history.
3. Force-push only after coordination; never rewrite shared history casually.
4. Record the incident and the prevention step.

## Disclaimer

This software is an educational demonstration. Outputs are fictional and must not be used to make real emergency-response, safety, medical, or operational decisions.