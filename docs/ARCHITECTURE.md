# Architecture

Ghotok is a three-tier system in one npm-workspaces monorepo, all JavaScript (ES modules).

```
                ┌──────────────────────────┐        ┌──────────────────────────┐
  Visitors ───▶ │  web/  Next.js website   │        │  admin/  React panel     │ ◀─── Staff
  & members     │  SSR pages + dashboard   │        │  static files (Vite)     │
                └────────────┬─────────────┘        └────────────┬─────────────┘
                     /api/* (rewrite)                     /api/* (reverse proxy)
                             └──────────────┬──────────────────────┘
                                            ▼
                             ┌──────────────────────────────┐
                             │  server/  Express REST API   │──▶ Email (SMTP), SMS gateway
                             │  auth, rules, money, audit   │──▶ bKash / Nagad APIs
                             └──────────────┬───────────────┘──▶ Cloudflare Images + R2
                                            ▼
                                     ┌─────────────┐
                                     │   MongoDB   │
                                     └─────────────┘
```

Both front-ends reach the API as `/api` **on their own origin**: Next.js forwards it with a
rewrite and the admin panel's web server proxies it. The auth cookies are therefore first-party
and `SameSite=Lax` everywhere, and there is no cross-origin cookie handling to get wrong.

## Repository layout

```
shared/   option lists, Bangladesh locations, the biodata form definition and validator,
          role permissions, the browser API client, display formatting, icons, design tokens
ui/       React components shared by both front-ends (buttons, form fields, dialogs, tabs,
          pagination, toasts, biodata field and section renderers)
server/   the Express API
web/      the Next.js website and member dashboard
admin/    the Vite + React admin panel
docs/     this documentation and the decision records (docs/adr)
```

`shared` and `ui` are workspace packages (`@ghotok/shared`, `@ghotok/ui`) consumed as source:
Next.js transpiles them (`transpilePackages`) and Vite bundles them directly. There is no build
step for them.

## The shared biodata definition

[`shared/src/biodata.js`](../shared/src/biodata.js) describes the whole biodata form once:
sections, fields, types, options, required flags, conditional fields (`showIf`), privacy flags
and bilingual labels. Everything else is derived from it:

| Consumer | What it gets from the definition |
| --- | --- |
| API model (`server/src/models/biodata.model.js`) | The Mongoose sub-schema for each section |
| API validation | `validateSection` / `validateBiodata` (the same functions run in the browser) |
| Member editor (`web/.../biodata-editor`) | The step list and every input, via `BiodataField` from `@ghotok/ui` |
| Public profile and admin review | Read-only rendering via `BiodataSections` from `@ghotok/ui` |
| Privacy | `publicSections()` strips private fields (parents' names, the contact section) |

Search needs indexed top-level fields (type, religion, birth date, district and so on). The model
copies them out of the sections in a `pre('validate')` hook, so they can never disagree with the
sections.

## API structure

```
server/src/
  app.js            builds the Express app (security headers → CORS → logs → cookies → uploads →
                    JSON → body sanitising → origin check → rate limit → load user → routes → errors)
  server.js         starts it, connects MongoDB, shuts down gracefully
  config/           env (validated with Zod at start-up), db, logger (pino)
  routes/           URL → middleware chain → controller. Admin routes name their permission.
  middlewares/      auth (loadUser, requireAuth, requireVerified, requirePermission), validate (Zod),
                    security (origin check, body sanitising, rate limits), error handler
  validations/      Zod schemas for request bodies, queries and params
  controllers/      thin: read the request, call one service, send the response
  services/         all business rules; the only layer that touches models
  serializers/      the JSON shape of each resource, so private fields cannot leak by accident
  models/           Mongoose models, one per file
  integrations/     storage (local / Cloudflare), payments (bKash, Nagad), messaging (email, SMS)
  utils/            errors, pagination, crypto, cookies, request context
  scripts/          seed data
```

Rules of thumb that keep this maintainable:

- Controllers never contain logic and never touch models.
- Services throw `ApiError`s (`utils/api-error.js`); the error middleware turns them into
  `{ error: { code, message, details? } }`. Front-ends switch on `code`, never on the message.
- Every staff action calls `recordAudit(ctx, action, …)` with the request context (actor, IP,
  user agent), which feeds the admin audit log.
- List endpoints return `{ items, total, page, limit, pages }`.

## Authentication and sessions

- **Access token**: a JWT valid for 15 minutes, in an `HttpOnly` cookie (`gh_at`). A `Bearer`
  header is also accepted, for tests and future mobile apps.
- **Refresh token**: an opaque random token in an `HttpOnly` cookie limited to `/api/auth`
  (`gh_rt`), stored only as a SHA-256 hash in the `sessions` collection. It rotates on every use;
  presenting an already-used token revokes the whole token family, which signs out anyone using
  a stolen copy.
- **Session hint**: a readable, non-secret cookie (`gh_session=1`) tells the front-ends whether
  to ask for the current user at all, so anonymous visitors do not trigger 401s.
- The shared API client retries a request once after refreshing on `401 TOKEN_EXPIRED`.
- State-changing requests must come from an allowed origin (`originCheck`), in addition to
  `SameSite` cookies.
- Passwords are hashed with bcrypt. OTPs are hashed, expire, are rate limited and allow a few
  attempts only.
- Suspending or banning an account, or changing its role, revokes all of its sessions.

## Roles and permissions

Roles are `user`, `support` and `super_admin`; guests have no account. Permissions live in
[`shared/src/permissions.js`](../shared/src/permissions.js) and are checked in two places from
the same table:

- the API, with `requirePermission('payments.manage')` on each admin route, and
- the admin panel, which hides navigation and pages the role cannot use (`useCan`, `Guarded`).

Support staff review biodatas, NIDs, reports, tickets and the recovery queue. Money, packages,
roles, settings, content, analytics and the audit log are for super admins.

## Connections and payments

The connection balance is money, so it has one entry point: `changeBalance()` in
`services/connection.service.js`. It updates `User.connectionBalance` with an atomic conditional
`$inc` (a debit only matches when the balance is high enough) and writes a
`ConnectionTransaction` row for every change: purchase, unlock, admin grant or revoke, refund
credit or refund revoke. No MongoDB transactions or replica set are needed.

- **Unlocking a contact** debits one connection and creates a `ContactUnlock`. A unique index on
  (user, biodata) makes the unlock idempotent; a second unlock of the same biodata is free.
- **Manual payments** (Send Money + transaction ID, all three methods) are created as `pending`
  and credited when staff verify them. Crediting moves the payment from `pending` to `verified`
  in a single conditional update, so two staff members cannot credit it twice.
- **Online checkout** (bKash tokenized checkout, Nagad) is switched on with API keys. The
  gateway calls back to `/api/payments/:method/callback`; the API confirms the payment with the
  gateway before crediting it through the same path.
- **Refunds** are requested by members and decided by super admins, either as connection credit
  or as money returned (which takes back the connections the payment bought, as far as they are
  unused).

## Media storage

Uploads go straight from the browser to storage; the API only issues short-lived, signed upload
targets and later attaches the result after checking a signed "ticket" that proves it was issued
to the same user.

| Driver | Photos | NID images |
| --- | --- | --- |
| `local` (development) | Files on disk behind signed, expiring URLs | Same |
| `cloudflare` (production) | Cloudflare Images direct creator upload; optional signed delivery URLs | Private R2 bucket, presigned PUT and short-lived GET links |

NID images are never public. Staff open them through `/api/admin/biodatas/:id/nid`, which returns
links valid for a few minutes and records each view in the audit log.

## Front-ends

Both front-ends use **TanStack Query** for server state and the shared API client
(`@ghotok/shared/api-client`). Interface text lives in per-app dictionaries (`src/lib/i18n/en.js`
and `bn.js`) with identical keys, enforced by tests. Language (`gh_lang`) and theme (`gh_theme`)
are cookies, so the server renders the right language and theme on the first byte.

**Website (`web/`)**: Next.js App Router. Public pages are server-rendered for search engines
and fetch public data directly from the API (`lib/api/server.js`). Anything personal (the
dashboard, a viewer's favourites, unlock state) is fetched in the browser. CMS pages (about,
guide, policies and any page staff add) are served by one dynamic route, `app/(site)/[slug]`.

**Admin panel (`admin/`)**: a single-page app. `src/app/routes.js` lists every screen with its
path, permission and sidebar entry; the router and the navigation are both built from it, and
each screen is loaded on demand. List filters, tabs and pages live in the URL, so every view can
be shared and survives a reload.

**Design system**: colours, fonts and shared classes are CSS variables in
`shared/styles/tokens.css`, mapped into Tailwind CSS 4 with `@theme`. Light and dark themes are
two sets of the same variables. Chart colours (`--chart-1…3`) were checked for colour-blind
separation and contrast in both themes.

## Testing

| Suite | Location | What it covers |
| --- | --- | --- |
| Shared | `shared/test` | Biodata validation, completion, privacy, permissions |
| API | `server/test` | HTTP-level integration tests against a throwaway MongoDB (`mongodb-memory-server`): auth, biodata lifecycle, billing, interactions, uploads |
| Website | `web/test` | Dictionary parity, Markdown rendering, validators |
| Admin | `admin/test` | Dictionary parity and that every key the panel uses exists |

CI (`.github/workflows/ci.yml`) runs lint, format check, all tests, both production builds and the
three Docker image builds on every pull request.
