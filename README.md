# Crewdog

Job search for data centre work: find vacancies, find the people hiring for
them, and find somewhere to live near the site. A chat front end over four
search workflows, each driven by an admin-editable prompt.

## Running it

Requires Node 20+.

```bash
npm ci
npm run dev      # Vite dev server on :8080 (frontend only)
```

`npm run dev` serves the frontend alone, so `/api/*` is not available. For
the whole thing, build once and run the server that serves both:

```bash
npm run build
npm start        # :3000 — serves dist/ and the API
```

## Environment

The browser needs these at **build** time (Vite inlines anything `VITE_`-prefixed
into the bundle, so never put a secret behind that prefix):

| Variable | |
|---|---|
| `VITE_SUPABASE_URL` | required |
| `VITE_SUPABASE_ANON_KEY` | required |
| `VITE_STRIPE_PUBLISHABLE_KEY` | required |
| `VITE_API_BASE` | where the frontend calls the API |
| `VITE_SITE_URL`, `VITE_GTM_ID` | optional |

The server needs these at **run** time, and they stay on the server:

| Variable | |
|---|---|
| `OPENAI_API_KEY` | required — the process will not boot without it |
| `SUPABASE_SERVICE_ROLE_KEY` | traffic, chat log and the contact cache; without it those log a warning and switch off |
| `LUSHA_API_KEY` | contact reveals; also gated by a switch in the admin panel |
| `OPENAI_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `PORT` | optional |

## Checks

```bash
npm run typecheck   # must stay at 0
npm run lint        # 79 pre-existing errors; do not add more
npm run build
```

CI runs typecheck, build, and boots the API to confirm every import resolves
and `/api/health` answers.

## Layout

`client/` is the React app, `server/` the Express API, `config/` the build
tooling and `supabase/migrations/` the schema. The server serves the built
frontend, so production is one process.

The root holds only what has to be there: `package.json` and the lockfiles,
`index.html` (Vite's entry document), `render.yaml` and `vercel.json` (each
platform reads its own from the root), `components.json` (the shadcn CLI) and
a `tsconfig.json` stub pointing into `config/`. Everything else moved.

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) is the full map — where each
kind of file goes, how the four workflows differ, and the seams worth
knowing about. [docs/RESTRUCTURE.md](docs/RESTRUCTURE.md) records how the
layout got this way.
