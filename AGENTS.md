# Repository Guidelines

This repository is the private development workspace for `pluto-ops`, a local-first Vite/React cockpit for Pluto/OpenClaw operations.

## Scope

- Keep changes focused on this app and its documentation.
- Do not commit personal machine state, secrets, runtime logs, screenshots, temporary files, or agent caches.
- Treat Pluto/OpenClaw production runtime changes as separate operational work unless the user explicitly asks for them.

## Commands

Run from the repository root:

- `npm install`: install dependencies when needed.
- `npm run dev`: start the local app at `127.0.0.1`.
- `npm run lint`: lint the app.
- `npm run build`: verify the production build.

## Coding Style

- Use TypeScript and React function components.
- Keep UI copy concise and operational.
- Prefer local static data or explicit mocked state unless a real authenticated local endpoint is intentionally added.
- Avoid committing `.env` files; document new environment variables in `.env.example`.

## Pluto Safety

- This app must not expose raw tokens, API keys, private message contents, or local OpenClaw gateway auth tokens.
- Any integration with OpenClaw should default to read-only status checks and loopback-only endpoints.
- External services, public tunnels, financial actions, or broader messaging permissions require explicit user approval.

## Verification

Before publishing changes, run:

```bash
npm run lint
npm run build
```
