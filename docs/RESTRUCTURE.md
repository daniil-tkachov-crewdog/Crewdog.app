# Crewdog.app — Codebase Restructure Proposal

Status: carried out. All eight phases below are done; see git history from
`Remove unreachable code` to `Move the build config into config/`.
Two things in it were deliberately not done, and say so where they appear:
the six-stage workflow pipeline in §3.5 (replaced by one shared model-call
stage — the reasoning is at the top of `server/workflows/runModelStage.js`),
and the split of `ChatPage.tsx`, which was moved but not broken up.
The result is documented in ARCHITECTURE.md, which is the file to read first.
Date: 2026-10-23.
Scope: the whole repository — Node/Express API, React SPA, SQL, config, docs.

---

## 0. TL;DR

The repo is two applications sharing one folder, and one of them has no folders
at all. Seventeen backend modules sit loose in the repository root next to
`package.json`, `vercel.json` and `tailwind.config.ts`. `server.js` is 1,213
lines and carries a single 580-line request handler. The frontend has a
`src/` tree, but it is organised by *what a file is* (`components/`, `services/`,
`lib/`, `utils/`, `hooks/`, `data/`) rather than *what it is for*, so one feature
is smeared across six directories. About 1,900 lines are dead, and three
imports point at files that do not exist.

The proposal below moves everything into a three-root layout
(`server/`, `client/`, `database/`), splits each root into layers, splits each
layer into domains, and extracts every reusable function into its own file under
a `functions/` tree. Every file gets a header comment, every function gets a
doc comment. Migration is eight phases; each phase is independently shippable.

---

## 1. What is actually there today

### 1.1 Inventory

| Area | Files | Lines (approx.) |
|---|---|---|
| Backend, loose in repo root | 18 `.js` | ~6,900 |
| Frontend `src/` | 120 `.ts`/`.tsx` | ~18,500 |
| shadcn/ui primitives | 54 `.tsx` | ~5,000 of the above |
| SQL migrations | 14 `.sql` | — |
| Build/deploy config, repo root | 11 files | — |

### 1.2 The ten concrete problems

**P1 — No backend directory.** `accommodationFinder.js`, `agent.js`,
`agentPrompts.js`, `blocklist.js`, `chatResults.js`, `chatlog.js`,
`contactLookups.js`, `cvReader.js`, `jobFinder.js`, `linkCheck.js`,
`linkedinFinder.js`, `lusha.js`, `proSchema.js`, `proSkills.js`, `server.js`,
`traffic.js`, `usage.js` all live in the repository root. There is no signal
about what is a route, what is a workflow, what is an integration and what is a
pure helper. The root is also where the build config lives, so `vite.config.ts`
and `jobFinder.js` are visually peers.

**P2 — `server.js` is a monolith.** 1,213 lines containing: express wiring,
the vulnerability-scanner blocklist middleware, seven route handlers, the
OpenAI tool registry, the Pro-mode response-format builder, the agent-call
summariser, the system-prompt loader, the SEO head renderer with five HTML
escaping helpers, the `index.html` template cache and the SPA catch-all. The
`POST /api/chat` handler alone is 580 lines and holds the entire agent loop:
auth gate, plan lookup, quota check, skill loading, tool-call dispatch,
multi-hop Responses API conversation, usage accounting, card assembly, SSE
error handling.

**P3 — Duplicated helpers.** `const str = (v) => String(v ?? "").trim()` is
defined four separate times (`accommodationFinder.js:24`, `chatResults.js:6`,
`jobFinder.js:24`, `linkedinFinder.js:59`). `normalizeUrl` is defined three
times with three different bodies (`accommodationFinder.js:32`,
`jobFinder.js:32`, `linkedinFinder.js:24`) — one of which is exported and
imported by `server.js`, so the other two silently diverge. `list`/`asList`
is defined twice.

**P4 — Three workflows, copy-pasted.** `jobFinder.js`, `linkedinFinder.js` and
`accommodationFinder.js` share the same shape: read defaults, render a prompt
template, call `openai.responses.create`, `parseJson`, normalise URLs, filter,
`verifyLinks`, return `{ result, usage }`. The shared spine is retyped in each
file instead of being a pipeline the three configure.

**P5 — `src/` is organised by file kind, not by feature.** The Account feature
occupies `src/pages/Account.tsx`, `src/components/account/*` (13 files),
`src/services/account.ts`, `src/services/billing.ts`, `src/services/profile.ts`,
`src/types/account.ts`, `src/types/billing.ts`, `src/data/account.mock.ts` and
`src/utils/account.ts`. Nothing tells you those belong together, and nothing
stops an unrelated page importing the middle of it.

**P6 — `lib/` vs `utils/` vs `hooks/` vs `data/` have no defined boundary.**
`src/lib/` holds a className merger, an analytics shim, a toast wrapper, env
parsing, config resolution, a PDF text extractor, a PDF *generator* and the
Supabase client. Those are six unrelated responsibilities under one name.
`src/utils/` holds exactly one file. `src/data/` holds one mock.

**P7 — Dead code, ~1,900 lines.** Nothing outside the folder imports
`src/components/run/` (7 files, 1,655 lines — `RunForm`, `SideForm`,
`CenteredForm`, `ResultsCard`, `CustomiseCVPanel`, `QuotaBadge`, `LoadingCard`).
With it die `src/services/run.ts` (173), `src/services/contactDetails.ts`,
`src/types/run.ts`, and `src/hooks/useMockAuth.ts` (a Zustand mock auth store
superseded by `src/auth/AuthProvider.tsx`). `src/utils/account.ts` has no
importers either.

**P8 — Three imports resolve to nothing.**
`src/data/account.mock.ts:7`, `src/components/account/ActivityLog.tsx:3` and
`src/components/account/AchievementsGrid.tsx:4` import from
`./data/account.types` — that file is not in the repo. They survive the build
only because all three are `import type`, which esbuild erases before
resolution; `tsc` fails on them. `src/utils/account.ts:1` imports the *values*
`FREE_CAP, PRO_CAP` from `@/constants/account`, and `src/constants/` does not
exist — that one would break the build if anything imported the file.

**P9 — `Chat.tsx` is 1,223 lines.** It holds five private components
(`Suggestions`, `AssistantBody`, `ThinkingIndicator`, `CopyButton`, plus the
page), three const tables (`MODES`, `THINKING_PHRASES`, `STARTER_PROMPTS`),
localStorage mode persistence, chat CRUD orchestration, SSE stream parsing,
CV attachment, voice input wiring and the composer. `ResultCards.tsx` (805)
and `PromptsTab.tsx` (591) are the same pattern on a smaller scale.

**P10 — Comment coverage is uneven.** Parts of `server.js` are genuinely
well-commented — the Lusha cost-guard ordering, the `instructions`-not-inherited
note at the tool-hop, the SEO rationale. Then `src/pages/Chat.tsx`,
`src/components/run/*` and most of `src/services/*` have none. The good comments
prove the house style exists; it just is not applied everywhere.

---

## 2. The rules

Five rules. Everything in §3 is derived from them mechanically.

### R1 — Three roots, by deployable

```
server/     runs on Node (Render). Never imported by the client.
client/     compiled by Vite into dist/. Never imported by the server.
database/   SQL the Supabase CLI applies. Imported by neither.
shared/     the small set of things both runtimes need (contracts, enums).
```

Enforced by ESLint `no-restricted-imports`: `client/**` may not import
`server/**`, and vice versa. Today nothing stops it.

### R2 — Inside a root: layer, then domain

```
<root>/<layer>/<domain>/<file>
```

Layer answers *what kind of thing is this* (route, workflow, integration,
feature, function). Domain answers *what is it about* (chat, cv, jobs, billing).
Both appear in the path, always in that order. A reader who knows the layer
names can find any file from its description in one guess.

### R3 — One exported function per file, under `functions/`

Every function that is not a route handler, a React component or a class method
lives alone in `functions/<domain>/<functionName>.js`, the filename exactly
matching the export, one `export function <name>` per file, no sibling exports.

This is the rule you asked for, and it is correct for this codebase's helpers —
it is what kills P3. Two carve-outs, because applying it literally everywhere
makes the tree worse rather than better:

- **React components keep their component + local subcomponents in one file**
  when the subcomponents are not reachable from anywhere else. A 40-line
  presentational helper used by exactly one parent does not earn a file; a
  60-line one used twice does. Extracting the former produces 800 two-line
  files and a wall of import noise, and the next person reads *more* to
  understand *less*.
- **`client/components/ui/`** (the 54 shadcn primitives) stays exactly as it is.
  It is vendored, regenerated by the shadcn CLI, and reshaping it means every
  future `npx shadcn add` conflicts. It is library code we consume, not code
  we own.

Everything else — every pure helper, every normaliser, every formatter, every
guard, every data mapper — gets its own file.

### R4 — Dependencies point one way

```
routes → workflows → integrations → functions → constants
```

A `function` imports only `constants` and other `functions`. An `integration`
never imports a `route`. There are no cycles. Today `agentPrompts.js` imports
from `linkCheck.js` while `linkCheck.js` is consumed by the three workflows that
also import `agentPrompts.js` — a near-cycle that this ordering removes.

### R5 — Every file is commented

Mandatory, enforced in review:

1. **File header.** What this file is, why it exists, who calls it. 1–5 lines.
2. **Doc comment per export.** Purpose, parameters, return, failure mode.
3. **A "why" comment at every non-obvious decision.** Not what the code does —
   the code says that — but why it is this way. The existing comment at
   `server.js:1038` ("`instructions` is NOT inherited through
   `previous_response_id`") is the standard: it records a fact about the
   platform that cost someone an afternoon.

Format, applied to every `functions/` file:

```js
// server/functions/url/normalizeJobUrl.js
//
// Canonicalises a job-posting URL so the same vacancy from two sources
// deduplicates to one row. Called by the job workflow before verification.

/**
 * Strip tracking parameters, force https, drop a trailing slash and lowercase
 * the host, leaving the path's case intact (some ATS paths are case-sensitive).
 *
 * @param {string} url  Raw URL as the model returned it; may be malformed.
 * @returns {string}    Canonical URL, or "" when the input will not parse.
 *                      Never throws — a bad URL is a dropped result, not a
 *                      failed search.
 */
export function normalizeJobUrl(url) { /* … */ }
```

---

## 3. Target structure

### 3.1 Top level

```
crewdog.app/
├── README.md
├── package.json
├── docs/
├── config/
├── database/
├── shared/
├── server/
└── client/
```

Root holds `README.md`, `package.json`, `.gitignore` and the lockfiles — nothing
else. Every other root-level file today moves into `config/`.

### 3.2 `config/`

```
config/
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── eslint.config.js
├── components.json           # shadcn CLI
├── tsconfig.json
├── tsconfig.client.json      # was tsconfig.app.json
├── tsconfig.node.json
└── deploy/
    ├── render.yaml
    └── vercel.json
```

Note: `render.yaml` must stay at the repository root or be re-pointed in the
Render dashboard, and some tools insist on a root `tsconfig.json`. Where a tool
cannot be told to look in `config/`, leave a three-line root stub that
re-exports the real file. Stub, not duplicate.

### 3.3 `database/`

```
database/
├── migrations/              # the 14 existing .sql files, unchanged
└── README.md                # table map: which feature owns which table,
                             # which columns are RLS-protected, how to apply
```

Rename from `supabase/` only if the Supabase CLI config is updated with it;
otherwise keep the directory name and add the README. The README is the point —
there are 14 migrations and no document saying what the schema *is*.

### 3.4 `shared/`

```
shared/
├── contracts/
│   ├── chatResult.js        # the ResultGroup / SummaryStep shape
│   ├── proSchema.js         # ← proSchema.js, the Pro output JSON Schema
│   └── markers.js           # CARDS_MARKER, SUGGESTIONS_MARKER
└── constants/
    ├── plans.js             # free | pro
    └── limits.js            # DEFAULT_LIMITS, FIVE_HOURS_MS, WEEK_MS
```

These exist twice today: `chatResults.js` defines the card shape on the server
and `src/types/chatResults.ts` re-declares it in TypeScript for the client. One
source, generated or hand-kept in lockstep, stops them drifting.

### 3.5 `server/`

```
server/
├── index.js                     # entrypoint: build app, listen. ~20 lines.
│
├── app/
│   ├── createApp.js             # express(), trust proxy, body parser, mounts
│   ├── middleware/
│   │   ├── blockScanners.js     # ← blocklist.js usage in server.js
│   │   ├── attachUser.js        # ← usage.js:90
│   │   └── errorHandler.js      # new: one place that shapes error responses
│   └── static/
│       ├── serveSpa.js          # express.static + catch-all
│       └── renderIndexHtml.js   # ← server.js:1171 template()
│
├── routes/
│   ├── index.js                 # the router table — the only place that
│   │                            # maps a URL to a handler
│   ├── health.route.js          # GET  /api/health
│   ├── models.route.js          # GET  /api/models
│   ├── track.route.js           # POST /api/track
│   ├── proSchema.route.js       # GET  /api/pro-schema
│   ├── extractCv.route.js       # POST /api/extract-cv
│   ├── cvReader.route.js        # POST /api/cv-reader
│   ├── transcribe.route.js      # POST /api/transcribe
│   ├── contactLookup.route.js   # POST /api/contact-lookup
│   └── chat.route.js            # POST /api/chat — thin: validate, call the
│                                # orchestrator, send. ~60 lines, not 580.
│
├── chat/                        # everything the 580-line handler contained
│   ├── runChatTurn.js           # the orchestrator the route calls
│   ├── runNormalTurn.js         # tool-calling chat path
│   ├── runProTurn.js            # Pro structured-output path (SSE)
│   ├── toolRegistry.js          # name → workflow, the one dispatch table
│   ├── toolLoop.js              # the multi-hop Responses API loop
│   └── stream/
│       ├── openSseStream.js
│       ├── writeSseEvent.js
│       └── writeSseError.js
│
├── workflows/                   # the agent pipelines
│   ├── pipeline/
│   │   ├── runPipeline.js       # the shared spine (fixes P4)
│   │   └── stages/
│   │       ├── buildPrompt.js
│   │       ├── callModel.js
│   │       ├── parseResults.js
│   │       ├── normalizeResults.js
│   │       ├── filterResults.js
│   │       └── verifyResults.js
│   ├── jobDescription/          # ← agent.js runJobSearch
│   │   ├── runJobSearch.js
│   │   └── prompts.js
│   ├── jobFinder/               # ← jobFinder.js
│   │   ├── runJobFinder.js
│   │   └── prompts.js
│   ├── linkedinFinder/          # ← linkedinFinder.js
│   │   ├── runLinkedinFinder.js
│   │   └── prompts.js
│   └── accommodationFinder/     # ← accommodationFinder.js
│       ├── runAccommodationFinder.js
│       └── prompts.js
│
├── integrations/                # every outbound third party, one folder each
│   ├── openai/
│   │   ├── client.js
│   │   ├── createResponse.js
│   │   ├── transcribeAudio.js
│   │   └── listModels.js
│   ├── supabase/
│   │   ├── restHeaders.js       # ← cvReader.js:156
│   │   ├── select.js
│   │   ├── upsert.js            # ← cvReader.js:180
│   │   └── uploadToBucket.js
│   ├── lusha/                   # ← lusha.js
│   │   ├── lookupContact.js
│   │   ├── post.js
│   │   └── readApiKey.js
│   └── linkCheck/               # ← linkCheck.js
│       ├── verifyLinks.js
│       ├── checkOne.js
│       └── readCapped.js
│
├── services/                    # domain logic over integrations + database
│   ├── cv/
│   │   ├── extractCvFields.js
│   │   ├── readProfile.js
│   │   └── storeCv.js
│   ├── usage/                   # ← usage.js
│   │   ├── planForUser.js
│   │   ├── limitsForPlan.js
│   │   ├── checkLimit.js
│   │   ├── recordUsage.js
│   │   └── verifyAccessToken.js
│   ├── contacts/                # ← contactLookups.js
│   │   ├── lushaEnabled.js
│   │   ├── readCachedLookup.js
│   │   └── writeCachedLookup.js
│   ├── proSkills/               # ← proSkills.js
│   │   ├── listSkills.js
│   │   ├── getSkillPrompts.js
│   │   └── renderSkillMenu.js
│   ├── traffic/                 # ← traffic.js
│   │   ├── recordPageView.js
│   │   ├── insertPageView.js
│   │   └── purgeOldViews.js
│   ├── chatlog/
│   │   └── recordChatCall.js    # ← chatlog.js
│   └── seo/
│       ├── fetchSeo.js          # ← server.js:1042
│       └── renderSeoBlock.js    # ← server.js:1086
│
├── functions/                   # R3 territory: one pure function per file
│   ├── text/
│   │   ├── str.js               # the four copies collapse to this
│   │   ├── toList.js            # the two copies collapse to this
│   │   ├── htmlToText.js
│   │   ├── significantWords.js
│   │   └── renderTemplate.js    # ← agent.js render()
│   ├── url/
│   │   ├── normalizeUrl.js      # ONE implementation, was three
│   │   ├── isListingUrl.js
│   │   ├── isEmployerSite.js
│   │   └── nameFromProfileUrl.js
│   ├── html/
│   │   ├── escapeAttr.js
│   │   ├── jsonLd.js
│   │   ├── metaName.js
│   │   └── metaProp.js
│   ├── openai/
│   │   ├── outputText.js
│   │   ├── addUsage.js
│   │   ├── toModelInput.js
│   │   ├── buildProFormat.js
│   │   └── mimeToExtension.js
│   ├── json/
│   │   ├── parseJsonOrDefault.js
│   │   └── parsePhrases.js
│   ├── cards/                   # ← chatResults.js
│   │   ├── toCardGroup.js
│   │   ├── peopleCards.js
│   │   ├── jobCards.js
│   │   ├── placeCards.js
│   │   ├── linkStep.js
│   │   ├── splitSuggestions.js
│   │   └── fromProJson.js
│   ├── pdf/
│   │   ├── decodePdf.js
│   │   └── pdfToText.js
│   ├── request/
│   │   ├── clientIp.js
│   │   ├── truncateIp.js
│   │   ├── visitorId.js
│   │   ├── parseUserAgent.js
│   │   ├── normaliseReferrer.js
│   │   ├── isTrackablePath.js
│   │   └── isBlockedPath.js
│   ├── usage/
│   │   ├── toUnits.js
│   │   └── isAdminUser.js
│   ├── cache/
│   │   ├── cacheGet.js
│   │   └── cacheSet.js
│   └── log/
│       └── summarizeAgentCall.js
│
├── prompts/                     # ← app/prompts/ + agentPrompts.js, split up
│   ├── system.md
│   ├── routing.defaults.js
│   ├── toolParams.defaults.js
│   ├── jobDescription.defaults.js
│   ├── jobFinder.defaults.js
│   ├── linkedinFinder.defaults.js
│   ├── accommodationFinder.defaults.js
│   └── cards.contract.js        # CARDS_PRESENTATION, WORKFLOW_CONTRACT,
│                                # SUGGESTIONS_CONTRACT, SUGGESTIONS_TAIL
└── constants/
    ├── expiryPhrases.js         # JOB_EXPIRY_PHRASES, PROPERTY_EXPIRY_PHRASES
    ├── blockedPaths.js
    └── models.js
```

The 325-line `agentPrompts.js` becoming seven files matters more than it looks:
today editing the accommodation prompt means scrolling past the job prompt, and
every prompt change produces a diff against one file that four features share.

### 3.6 `client/` (was `src/`)

```
client/
├── main.tsx
├── App.tsx                      # providers only
├── routes.tsx                   # the route table, extracted from App.tsx
│
├── features/                    # ← the big change: feature-first (fixes P5)
│   ├── chat/
│   │   ├── ChatPage.tsx         # ← pages/Chat.tsx, ~250 lines once split
│   │   ├── components/
│   │   │   ├── Composer.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── AssistantBody.tsx
│   │   │   ├── Suggestions.tsx
│   │   │   ├── ThinkingIndicator.tsx
│   │   │   ├── CopyButton.tsx
│   │   │   ├── ChatSidebar.tsx
│   │   │   ├── ModeMenu.tsx
│   │   │   ├── VoiceButton.tsx
│   │   │   ├── UsageMeter.tsx
│   │   │   └── cards/           # ← ResultCards.tsx (805 lines) split by card
│   │   │       ├── ResultGroupCard.tsx
│   │   │       ├── PersonCard.tsx
│   │   │       ├── JobCard.tsx
│   │   │       ├── PlaceCard.tsx
│   │   │       └── ToolSummary.tsx
│   │   ├── hooks/
│   │   │   ├── useChatSession.ts
│   │   │   ├── useChatStream.ts
│   │   │   ├── useChatMode.ts
│   │   │   └── useCvAttachment.ts
│   │   ├── api/
│   │   │   ├── sendChat.ts
│   │   │   ├── listChats.ts
│   │   │   ├── createChat.ts
│   │   │   ├── addMessage.ts
│   │   │   └── deleteChat.ts
│   │   └── functions/
│   │       ├── parseSseChunk.ts
│   │       ├── resultsToText.ts
│   │       ├── renderRichText.tsx
│   │       └── formatCountdown.ts
│   │
│   ├── account/
│   │   ├── AccountPage.tsx
│   │   ├── components/          # ← components/account/* (13 files)
│   │   ├── api/                 # ← services/account.ts, profile.ts
│   │   ├── functions/
│   │   │   └── normalizeSummary.ts   # ← utils/account.ts, un-orphaned
│   │   └── types.ts             # ← types/account.ts + the MISSING
│   │                            #   account.types.ts, written properly (P8)
│   ├── billing/
│   │   ├── PricingPage.tsx
│   │   ├── SuccessPage.tsx
│   │   ├── CancelPage.tsx
│   │   ├── components/          # SubscriptionCard, DownsellModal, …
│   │   └── api/                 # ← services/billing.ts
│   ├── auth/
│   │   ├── LoginPage.tsx
│   │   ├── VerifyPage.tsx
│   │   ├── ForgotPasswordPage.tsx
│   │   ├── ResetPasswordPage.tsx
│   │   ├── AuthProvider.tsx
│   │   ├── RequireAuth.tsx
│   │   ├── RequireAdmin.tsx
│   │   └── adapters/supabase.ts
│   ├── admin/
│   │   ├── AdminPage.tsx
│   │   └── tabs/
│   │       ├── users/
│   │       ├── api/
│   │       ├── prompts/         # ← PromptsTab.tsx, 591 lines, split
│   │       ├── seo/
│   │       ├── traffic/
│   │       └── agent/
│   ├── support/
│   ├── cv/
│   │   ├── components/CvUploadDialog.tsx
│   │   ├── api/
│   │   └── functions/
│   │       ├── extractPdfText.ts
│   │       └── generateCvPdf.ts
│   └── legal/                   # Privacy, Terms, FAQ, NotFound
│
├── components/
│   ├── ui/                      # the 54 shadcn primitives — UNCHANGED (R3)
│   └── layout/
│       ├── Topbar.tsx
│       ├── Footer.tsx
│       ├── Wordmark.tsx
│       ├── ThemeToggle.tsx
│       ├── ScrollToTop.tsx
│       └── ConsentBanner.tsx
│
├── core/                        # ← replaces lib/ + utils/ + data/ (fixes P6)
│   ├── config/
│   │   ├── env.ts
│   │   ├── apiBase.ts
│   │   └── endpoints.ts
│   ├── http/
│   │   ├── apiFetch.ts          # new: one fetch wrapper, auth header + errors
│   │   └── apiUrl.ts
│   ├── supabase/
│   │   ├── client.ts
│   │   └── getAccessToken.ts
│   ├── analytics/
│   │   ├── gtm.ts
│   │   ├── consent.ts
│   │   └── usePageViews.tsx
│   └── notify/
│       └── notify.ts
│
├── functions/                   # app-wide pure functions, one per file (R3)
│   ├── format/
│   │   ├── cn.ts
│   │   ├── formatDate.ts
│   │   ├── formatCurrency.ts
│   │   └── truncate.ts
│   └── guards/
│       ├── isEmail.ts
│       └── isLinkedinUrl.ts
│
├── hooks/                       # only genuinely cross-feature hooks
│   ├── useIsMobile.ts
│   └── useToast.ts
│
├── styles/
│   └── index.css
│
└── assets/
```

A feature folder is self-contained: page, components, hooks, api calls,
functions, types. Deleting a feature means deleting one folder. Finding where a
bug lives means opening one folder. Cross-feature imports go through
`core/`, `shared/` or `components/` — never feature-to-feature.

---

## 4. File-by-file migration map

### 4.1 Backend

| From | To |
|---|---|
| `server.js` (1,213) | `server/index.js`, `server/app/*`, `server/routes/*`, `server/chat/*`, `server/services/seo/*`, `server/functions/html/*` |
| `agent.js` | `server/workflows/jobDescription/`, `server/functions/{text,openai,json}/` |
| `agentPrompts.js` (325) | `server/prompts/*.defaults.js` (7 files) |
| `jobFinder.js` | `server/workflows/jobFinder/` + `server/functions/url/` |
| `linkedinFinder.js` | `server/workflows/linkedinFinder/` + `server/functions/url/` |
| `accommodationFinder.js` | `server/workflows/accommodationFinder/` + `server/functions/url/` |
| `linkCheck.js` | `server/integrations/linkCheck/` + `server/constants/expiryPhrases.js` |
| `lusha.js` | `server/integrations/lusha/` |
| `contactLookups.js` | `server/services/contacts/` |
| `cvReader.js` | `server/services/cv/` + `server/functions/pdf/` + `server/integrations/supabase/` |
| `usage.js` | `server/services/usage/` + `server/app/middleware/attachUser.js` + `server/functions/{usage,cache}/` |
| `traffic.js` | `server/services/traffic/` + `server/functions/request/` |
| `chatlog.js` | `server/services/chatlog/recordChatCall.js` |
| `chatResults.js` | `server/functions/cards/` + `server/prompts/cards.contract.js` |
| `proSchema.js` | `shared/contracts/proSchema.js` |
| `proSkills.js` | `server/services/proSkills/` |
| `blocklist.js` | `server/app/middleware/blockScanners.js` + `server/constants/blockedPaths.js` |
| `app/prompts/system.md` | `server/prompts/system.md` |

### 4.2 Frontend

| From | To |
|---|---|
| `src/pages/Chat.tsx` (1,223) | `client/features/chat/` — page + 11 components + 4 hooks + 4 functions |
| `src/components/chat/ResultCards.tsx` (805) | `client/features/chat/components/cards/` (5 files) |
| `src/pages/admin/PromptsTab.tsx` (591) | `client/features/admin/tabs/prompts/` |
| `src/pages/Verify.tsx` (613) | `client/features/auth/VerifyPage.tsx` + components |
| `src/components/account/*` | `client/features/account/components/` |
| `src/services/*` | the owning feature's `api/` folder |
| `src/lib/*` | `client/core/*` by responsibility |
| `src/utils/account.ts` | `client/features/account/functions/normalizeSummary.ts` |
| `src/data/account.mock.ts` | `client/features/account/fixtures/` |
| `src/types/*` | the owning feature's `types.ts`, or `shared/contracts/` |
| `src/analytics/*` | `client/core/analytics/` |
| `src/auth/*` | `client/features/auth/` |
| `src/components/ui/*` | `client/components/ui/` (move only, no edits) |

### 4.3 Deletions

| Delete | Lines | Why |
|---|---|---|
| `src/components/run/` (7 files) | 1,655 | No importer outside the folder |
| `src/services/run.ts` | 173 | Only consumer was `components/run/` |
| `src/services/contactDetails.ts` | ~60 | Only consumer was `components/run/ResultsCard` |
| `src/types/run.ts` | ~20 | Types for the above |
| `src/hooks/useMockAuth.ts` | ~45 | Superseded by `auth/AuthProvider` |

Do this in its own commit, before anything moves, so the diff is reviewable as
"deleted, nothing else". If any of it is wanted later, it is in git history.

### 4.4 Fixes that must happen during the move

1. **Write `account.types.ts`.** Three files import it; it does not exist. Its
   shape is recoverable from `src/data/account.mock.ts` (`AccountUser`,
   `Achievement`, `ActivityItem`, `SearchItem`). New home:
   `client/features/account/types.ts`.
2. **Write `constants/account.ts`** with `FREE_CAP` and `PRO_CAP`, or inline
   them — whichever, `src/utils/account.ts` cannot keep importing a file that
   is not there.
3. **Collapse the three `normalizeUrl`s into one** and diff the three bodies
   first. They differ; one of the differences is probably a bug, and finding out
   which is the single highest-value hour in this whole migration.
4. **Turn on `tsc --noEmit` in CI.** Problem P8 existed because nothing ran it.
   A restructure without this just makes room for the next three.

---

## 5. Migration plan

Eight phases. Each is one PR, each leaves `main` deployable, none needs the next
one to land. Mechanical moves stay mechanical — do not refactor logic in a move
commit, or the diff becomes unreviewable and a behaviour change hides in it.

| # | Phase | Risk | Notes |
|---|---|---|---|
| 1 | Delete dead code (§4.3) | none | Pure deletion |
| 2 | Fix the broken imports (§4.4 1–2), enable `tsc --noEmit` in CI | low | Must precede the moves |
| 3 | Create `server/`, move the 17 root `.js` files in, fix import paths | low | No code edits, path edits only |
| 4 | Split `server.js` into `app/` + `routes/` + `chat/` | **high** | The agent loop. Needs manual testing of both chat modes, each tool, and the SSE error path |
| 5 | Extract `server/functions/`, collapse the duplicate helpers | medium | Where `normalizeUrl` gets resolved |
| 6 | Build `server/workflows/pipeline/`, move the three finders onto it | medium | Behaviour-preserving by construction if 5 landed clean |
| 7 | `src/` → `client/`, reshape into `features/` | medium | Mostly path churn; `Chat.tsx` is the real work |
| 8 | Comment pass (R5) across everything, write `docs/` | none | Do it last, when the files have stopped moving |

Phases 1–3 are a day. Phase 4 is the one that can break production — it carries
the metered, money-spending path, and it deserves its own week and its own
rollback plan.

---

## 6. What this is worth

- **Finding code.** Layer + domain in the path means a described file is one
  guess away. Today the answer for anything backend is "grep the root".
- **One definition per concept.** Four `str`s and three `normalizeUrl`s become
  one each, so fixing a URL bug fixes it everywhere rather than in one of three
  places.
- **Reviewable diffs.** A prompt change touches a 40-line prompt file, not a
  325-line shared one. A card change touches one card.
- **A testable server.** You cannot unit-test a 580-line route handler. You can
  test `runChatTurn`, `toolLoop` and 40 pure functions.
- **Deletable features.** One folder per feature means removing one is a
  `rm -rf`, not an archaeology exercise.
- **Comments that survive.** A rule applied to 400 small files holds; a rule
  applied to a 1,200-line file does not.

The cost is roughly two weeks of moving things and one genuinely risky phase.

---

## 7. Open questions

1. **`client/` or keep `src/`?** `src/` is the Vite convention and every
   `@/` alias, the Tailwind content glob and `components.json` point at it.
   Renaming is a one-line change in each, but it does churn every import.
   Recommendation: rename, once, in phase 7 — the three-root symmetry is worth
   more than matching the default.
2. **Is `shared/` worth it for two contracts?** It is, if the card shape stays
   duplicated across `chatResults.js` and `types/chatResults.ts`. If you would
   rather generate the TS types from the JS source, `shared/` can be skipped.
3. **TypeScript on the server?** The backend is plain JS with JSDoc. The split
   in phase 3 is the cheapest moment to convert, and it would have caught the
   three-`normalizeUrl` divergence. Out of scope here; worth deciding before
   phase 4.
4. **Vercel vs Render.** `vercel.json` builds a static site with no API, while
   `render.yaml` runs the full server. Two deploy targets with different
   capabilities, and nothing documents which is live. Worth resolving before
   someone deploys the frontend to a host where `/api` does not exist.
