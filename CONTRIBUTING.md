# Contributing to Chronos

Thanks for considering a contribution. Here's how to get going.

## Development setup

```bash
git clone https://github.com/ogoldberg/chronos.git
cd chronos
npm install
npm run dev
```

The dev server runs at `http://localhost:5173`. You do not need a
database or an AI key to run the basics — the timeline, discovery,
Wikipedia/Wikidata integration, and graph visualization all work from
an empty env.

To test AI features, open the in-app Settings panel (⌘K → "AI
settings") and paste your own provider key. Keys stay in localStorage
and never touch the Chronos server.

## Before opening a PR

```bash
npm run build      # must pass (tsc -b + vite build)
npm test           # must pass (or pre-existing failures only)
npm run lint       # clean up anything new
```

If you touched the server AI boundary (there basically isn't one any
more) or the free API surface, `curl` the relevant endpoint locally
and confirm the behavior you expect.

## Conventions

- **Two spaces, no semicolons-on-new-lines-weirdness** — the codebase
  is uniformly prettier-ish. Match what's around you.
- **Zustand for state, hooks for local UI.** Stores live in
  `src/stores/`. Don't reach into them from random components —
  subscribe cleanly.
- **Feature folders** — each feature owns its UI, services, and local
  types under `src/features/<name>/`. Keep cross-feature imports
  explicit and sparing.
- **Comments explain *why*, not *what*.** Short, surgical, and only
  when the code alone wouldn't make the intent clear. No novels.
- **No server-side AI.** Every AI call runs browser-direct via
  `src/ai/callAI.ts`. If you need a new AI feature, add the system
  prompt to `src/ai/prompts.ts` and call `callAI(SYSTEM, [...])`
  from the client.
- **No hidden costs.** The server must not make AI calls on user
  traffic. If you need a server-side AI call, it belongs in the
  `seed.ts` CLI, not in a request handler.

## Commit style

Prefix commits with the area + short verb phrase:

```
feat(graph): parent-hub layout for Wikidata siblings
fix(discover): guard against NaN years in Wikidata date parsing
chore: update tsconfig target to es2022
docs: clarify BYOK architecture in README
```

Keep commits focused. A PR can bundle related commits, but each commit
should be individually revertable and make sense on its own.

## Code review

PRs get reviewed on five axes:

1. **Correctness** — does it do what it says?
2. **Readability** — will a new contributor understand it in a year?
3. **Architecture** — does it fit how Chronos is organized, or does
   it force us to introduce a new concept?
4. **Security** — does it touch user input, auth, or untrusted data?
5. **Performance** — does it affect the hot render path or a network
   fanout?

Be prepared to explain tradeoffs. Honest technical disagreement is
welcome.

## Community

Be kind. See the [Code of Conduct](./CODE_OF_CONDUCT.md).
