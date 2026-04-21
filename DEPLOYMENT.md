# Deploying Chronos

Chronos ships as a single Node process: a Vite-built static bundle
plus a small free API (Wikipedia/Wikidata proxy, optional auth, event
cache). No AI key is required server-side — AI runs entirely in the
user's browser.

## Railway (recommended, $5/month-ish)

1. **Fork or clone the repo on GitHub.**
2. **Create a Railway project** at [railway.app](https://railway.app)
   → "New project" → "Deploy from GitHub repo" → pick your fork.
   Railway reads `railway.json` at the repo root, which already
   configures the build, start command, and health check.
3. **Add a PostgreSQL service** to the same project (one click).
   Railway injects `DATABASE_URL` automatically.
4. **Set environment variables** (Project → Variables):
   - `AUTH_SECRET` — 32+ random bytes, required for Better Auth.
     Generate with `openssl rand -hex 32`.
   - `BETTER_AUTH_URL` — your deployed origin, e.g.
     `https://chronosapp.org`.
   - `BASE_URL` — same as above.
   - (Optional) `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`,
     `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` for social sign-in.
5. **Add your custom domain** (Project → Settings → Domains). Point
   the DNS `A` / `CNAME` record to the address Railway shows you.
6. **Deploy.** First deploy takes ~3 minutes. The health check
   (`/api/config`) will flip green once the Node process is up.

## Docker (self-hosted or any Docker host)

```bash
docker build -t chronos .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:pw@host:5432/chronos \
  -e AUTH_SECRET=$(openssl rand -hex 32) \
  -e BASE_URL=https://yourdomain \
  chronos
```

The included `Dockerfile` builds, prunes dev deps, and boots on port
3000 with a Node-based health check.

## Render / Fly.io / anywhere else Node runs

`npm run build && npm start` is the whole deploy story. `PORT`
defaults to 3000. The only strictly required env var is
`DATABASE_URL` if you want auth/cache persistence — the app boots
fine without it (features degrade gracefully).

## Post-deploy checklist

- [ ] Visit the site and confirm the timeline loads.
- [ ] `/api/config` returns the provider list (used by the Settings
      panel).
- [ ] Open Settings → paste your own API key → click "Test
      connection". Confirm the network request in devtools goes to the
      provider's domain, not yours.
- [ ] Try chat, insights, and today's "Tell me more" — all should
      stream back without touching your server.
- [ ] If you added OAuth, test a sign-in round-trip.
- [ ] Add `security@yourdomain` and `conduct@yourdomain` aliases if
      you kept those addresses in SECURITY.md / CODE_OF_CONDUCT.md.

## Operating cost

The server is nearly free to run — no AI spend, tiny bandwidth (most
traffic is the static bundle, gzipped), Postgres is the bulk.
Railway's starter plan ($5/mo credit) handles it comfortably at low
volume.

Your users' AI spend is theirs — they bring their own keys.
