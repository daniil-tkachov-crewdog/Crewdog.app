# Architecture

How this repository is laid out and why. If you are looking for a file, this
is the map; if you are adding one, this says where it goes.

The restructure that produced this layout, and the reasoning behind each
rule, is in [RESTRUCTURE.md](./RESTRUCTURE.md).

---

## One process, two applications

Crewdog deploys as a single Render Web Service. `server/` serves the API and
also serves `dist/`, the compiled frontend. There is no separate frontend
host in production, which is why `/api/*` and the SPA share an origin and the
browser never needs CORS.

```
client/    compiled by Vite into dist/
server/    Node + Express; serves the API and dist/
config/    build tooling (Vite, Tailwind, PostCSS, ESLint, TypeScript)
supabase/  migrations the Supabase CLI applies
docs/      this
```

### What is left at the root, and why

Nine config files moved into `config/`. These six could not, because the tool
that reads them only ever looks at the repository root:

| File | Read by |
|---|---|
| `package.json`, `package-lock.json`, `bun.lockb` | npm |
| `index.html` | Vite — it is the build's entry document, and `root` points here |
| `render.yaml` | Render |
| `vercel.json` | Vercel |
| `tsconfig.json` | editors and a bare `tsc`; it is a two-line stub whose `references` point into `config/` |
| `components.json` | the shadcn CLI |

Moving anything in `config/` means re-checking the wiring in
`config/vite.config.ts` and `config/postcss.config.js` — see the warning in
*Known seams*.

**The rule between them:** `client/` must not import from `server/`, and
`server/` must never import from `client/`. There is one exception, and it is
deliberate — see *Known seams* below.

---

## `server/`

```
server/
├── index.js              entrypoint: build the app, listen. 16 lines.
│
├── app/
│   ├── createApp.js      express wiring; mount order is behaviour, not style
│   ├── middleware/       blockScanners (and attachUser, which lives in usage.js)
│   └── static/           serveSpa: static files + the SEO-rendered catch-all
│
├── routes/
│   ├── index.js          the router table: URL → handler, one place
│   └── *.route.js        one file per endpoint
│
├── chat/                 everything /api/chat does
│   ├── createTurn.js     per-request state: usage, agent calls, the log
│   ├── runNormalTurn.js  tool-calling mode, answers with one JSON body
│   ├── runProTurn.js     skill-loading mode, answers over SSE
│   ├── buildChatTools.js the tool schemas, from the admin's config
│   └── toolRegistry.js   tool name → workflow
│
├── workflows/
│   └── runModelStage.js  one model call + usage + JSON parse
│
├── integrations/openai/  the shared client and model names
├── services/             domain logic over integrations and the database
│   ├── seo/              fetchSeo, renderSeoBlock
│   └── …                 (usage, traffic, cv, contacts, proSkills are still
│                          flat modules at the server root)
├── functions/            pure functions, one export per file
│   ├── text/ url/ html/ json/ date/ openai/ log/
├── prompts/              system.md and loadSystemPrompt
└── constants/            the non-employer host lists
```

### The four workflows

`agent.js`, `jobFinder.js`, `linkedinFinder.js` and `accommodationFinder.js`
each export one `run*` function, which the chat tool loop calls when the
model asks for it. They look alike in outline and differ in substance:

| Workflow | Model calls | Link check | Notes |
|---|---|---|---|
| `agent.js` (job description) | 4, chained | no | extract → verify company → X-ray HR → X-ray connections |
| `jobFinder.js` | 1 | yes | splits results into direct (employer's own site) and board |
| `linkedinFinder.js` | 1 | no | searches from a title and location |
| `accommodationFinder.js` | 1 | yes | refuses outright when the criteria are too thin |

They share `runModelStage()` and nothing else. There is deliberately no
pipeline abstraction over them — the reasoning is at the top of
`workflows/runModelStage.js`.

---

## `client/`

```
client/
├── main.tsx              mounts React; restores consent first
├── App.tsx               providers only
├── routes.tsx            the route table
│
├── features/             one folder per screen, self-contained
│   ├── chat/             the product. page + components + api + functions
│   ├── account/          profile, history, privacy, security
│   ├── billing/          pricing, checkout return, subscription panel
│   ├── auth/             login, verify, reset, the provider and guards
│   ├── admin/            the console and its six tabs
│   ├── support/ settings/ legal/ cv/
│
├── components/
│   ├── ui/               54 vendored shadcn primitives — do not reshape
│   └── layout/           Topbar, Footer, chrome, ScrollToTop, ConsentBanner
│
├── core/                 cross-feature infrastructure
│   ├── config/           env (validated at startup) and resolved URLs
│   ├── supabase/         the one browser client
│   ├── analytics/        GTM, consent, page views
│   ├── notify/ usage/
│
├── functions/            app-wide pure functions
├── hooks/                genuinely cross-feature hooks only
├── styles/ assets/
```

A feature folder holds its own `components/`, `api/`, `functions/` and
`types.ts`. Deleting a feature is deleting one folder.

**Cross-feature imports go through `core/`, `components/` or `functions/` —
never feature to feature.** Where that rule is currently bent: billing's
`SubscriptionCard` imports account's types, and support's form imports
account's shared style tokens.

---

## Where things go

| Adding… | Put it in |
|---|---|
| a new API endpoint | `server/routes/<name>.route.js`, registered in `routes/index.js` |
| logic that endpoint needs | `server/services/<domain>/` |
| a call to a third party | `server/integrations/<vendor>/` |
| a pure helper (server) | `server/functions/<domain>/<fnName>.js`, one export, filename = export |
| a new screen | `client/features/<feature>/<Name>Page.tsx` + a route in `routes.tsx` |
| a component used by one screen | that feature's `components/` |
| a component used by three screens | `client/components/` |
| a fetch the UI makes | that feature's `api/` |
| a prompt | `server/prompts/` or `server/agentPrompts.js` (and it is admin-editable) |

---

## Conventions

- **One exported function per file under `functions/`**, filename matching
  the export. This is what removed the four copies of `str` and the three
  different functions all called `normalizeUrl`.
- **Every file opens with a header comment** saying what it is and why it
  exists; every export has a doc comment; every non-obvious decision has a
  comment saying *why*, not *what*. The vendored `components/ui/` is exempt.
- **Dependencies point one way:** routes → chat/workflows → services →
  integrations → functions → constants. No cycles.

---

## Known seams

These are real and deliberate, not oversights:

1. **The frontend imports two server modules.** Five admin tab components
   import `server/agentPrompts.js` and `server/chatResults.js` so the prompt
   editors show the exact defaults the server would use. It keeps the panel
   honest, and it bundles both files into the browser — so nothing secret may
   go in either.
2. **The card shape is declared twice**, as JS in `server/chatResults.js` and
   as TypeScript in `client/features/chat/types.ts`. They must be changed
   together.
3. **`FREE_CAP`/`PRO_CAP` exist twice**, in `client/features/account/constants.ts`
   and privately in that feature's `api/account.ts`. The API copy is the one
   the running app uses.
4. **Two deploy targets.** `render.yaml` runs the whole thing; `vercel.json`
   builds a static site with no API behind it. Only the Render one is a
   complete deployment.
5. **The build config is wired by hand, because it is not at the root.**
   `config/vite.config.ts` states the project root, the `@` alias and the
   PostCSS path explicitly, and `config/postcss.config.js` states Tailwind's
   config path. Vite searches for a PostCSS config upward from the project
   root and Tailwind looks in the working directory, so without those two
   lines the build still succeeds and silently ships a stylesheet with no
   Tailwind in it. If you touch either file, rebuild and check the CSS is
   still around 120 KB rather than a few hundred bytes.

---

## Verifying a change

```bash
npm run typecheck   # must stay at 0
npm run lint        # 79 pre-existing errors; do not add more
npm run build
npm start           # serves dist/ and the API on :3000
```

CI (`.github/workflows/ci.yml`) runs typecheck, build, and boots the API to
check every import resolves. Lint is not yet a gate, because of that backlog.
