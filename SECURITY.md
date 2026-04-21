# Security Policy

## Reporting a vulnerability

If you discover a security issue in Chronos, please email
`security@chronosapp.org` with details. Include steps to reproduce, the
version or commit you tested against, and any proof-of-concept you
have.

Please do not open a public GitHub issue for security reports. We aim
to acknowledge reports within 72 hours and will work with you on
disclosure timing.

## Scope

In scope:

- The client code in `src/` (including the browser AI provider
  adapters in `src/ai/providers/`)
- The server code in `server/` (free Wikipedia/Wikidata proxy, auth,
  DB routes)
- The deployed site at chronosapp.org

Out of scope:

- Vulnerabilities in upstream dependencies — please report those
  upstream. If you find one that we should pin around, let us know.
- Vulnerabilities in the AI providers themselves (Anthropic, OpenAI,
  Google) — those should go to the provider.

## No server-side API keys

Chronos deliberately has no server-side AI key. Every AI request runs
directly in the user's browser against the provider of their choice.
If you find a code path that sends a user's key to our server (or any
path that isn't the provider the user selected), that is a security
bug — please report it.
