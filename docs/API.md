# API reference

Base URL: `/api` (in development `http://localhost:4000/api`; the website and admin panel call it
on their own origin). Request and response bodies are JSON. Every route is defined in
`server/src/routes/` and every request body, query and URL parameter is validated by the Zod
schemas in `server/src/validations/`. Those two folders are the source of truth when this page and
the code disagree.

## Conventions

**Authentication.** Logging in sets `HttpOnly` cookies (`gh_at` access token, `gh_rt` refresh
token) and a readable `gh_session=1` hint. Browsers send them automatically. Other clients can
send `Authorization: Bearer <access token>`.

| Marker | Meaning |
| --- | --- |
| public | No account needed |
| auth | Signed in (`401 UNAUTHORIZED`, or `401 TOKEN_EXPIRED` when the access token needs refreshing) |
| verified | Signed in with a verified email or phone (`403 NOT_VERIFIED`) |
| `perm.name` | Staff permission from `shared/src/permissions.js` (`403 FORBIDDEN`) |

**Errors.**

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Please check the highlighted fields.",
             "details": { "fields": { "email": "Enter a valid email address." } } } }
```

Switch on `code`, never on `message`. Common codes: `VALIDATION_ERROR`, `UNAUTHORIZED`,
`TOKEN_EXPIRED`, `SESSION_EXPIRED`, `NOT_VERIFIED`, `ACCOUNT_INACTIVE`, `FORBIDDEN`, `NOT_FOUND`,
`NOT_PENDING` (someone already processed it), `INSUFFICIENT_CONNECTIONS` (402), `RATE_LIMITED`
(429), `BAD_ORIGIN`, `SERVER_ERROR`.

**Lists** return `{ items, total, page, limit, pages }` and accept `?page=` and `?limit=`.

**Origins.** `POST`/`PUT`/`PATCH`/`DELETE` requests carrying an `Origin` header must come from the
API's own origin or one listed in `CORS_ORIGINS`.

**Rate limits.** Login, registration and OTP routes, and write-heavy member actions (unlock,
favourite, proposals, payments, uploads) have tighter limits than the general API limit.

## Health

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/health` | public | `{ ok, time }` |

## Auth: `/auth`

| Method | Path | Access | Body / notes |
| --- | --- | --- | --- |
| POST | `/auth/register` | public | `{ name, email?, phone?, password, language? }`, email or phone required. Sends an OTP |
| POST | `/auth/login` | public | `{ identifier, password }`, identifier is an email or mobile number. Sets cookies |
| POST | `/auth/verify` | public | `{ identifier, code }`, verifies the account and signs in |
| POST | `/auth/resend-otp` | public | `{ identifier, purpose: 'verify' \| 'reset' }` |
| POST | `/auth/forgot-password` | public | `{ identifier }`, answers the same way whether or not the account exists |
| POST | `/auth/reset-password` | public | `{ identifier, code, password }`, signs out every session |
| POST | `/auth/refresh` | refresh cookie | Rotates the refresh token |
| POST | `/auth/logout` | – | Revokes the session and clears cookies |
| GET | `/auth/me` | auth | `{ user }` |

With `OTP_DEV_ECHO=true` (development only) responses that send a code include it as `devOtp`.

## Account: `/me` (auth)

| Method | Path | Body / notes |
| --- | --- | --- |
| GET | `/me/dashboard` | Biodata summary, connection balance, visit stats, counts, recent proposals |
| PATCH | `/me` | `{ name?, language? }` |
| POST | `/me/change-password` | `{ currentPassword, newPassword }` |
| DELETE | `/me` | `{ password, reason? }`, deactivates the account |
| GET | `/me/favorites`, `/me/dislikes`, `/me/favorited-me`, `/me/unlocks` | Personal lists |
| GET | `/me/connections` | Balance and ledger |
| GET | `/me/proposals` | `?box=sent\|received&status=` |
| POST | `/me/proposals/:id/respond` | `{ action: 'accept' \| 'decline', note? }` |
| POST | `/me/proposals/:id/withdraw` | |
| GET | `/me/notifications` | |
| POST | `/me/notifications/read-all`, `/me/notifications/:id/read` | |

## Biodatas: `/biodatas`

The member's own biodata:

| Method | Path | Access | Body / notes |
| --- | --- | --- | --- |
| GET | `/biodatas/me` | auth | `{ biodata, completion }`, `biodata` is null before creation |
| POST | `/biodatas/me` | verified | Creates an empty draft |
| PUT | `/biodatas/me/sections/:section` | verified | `{ data }`, one section, validated with the shared definition. Editing an approved biodata sends it back to review |
| POST | `/biodatas/me/submit` | verified | Submits a complete biodata for review |
| PATCH | `/biodatas/me/visibility` | auth | `{ hidden }` |
| DELETE | `/biodatas/me` | auth | `{ reason, note? }`, soft delete |
| GET / POST | `/biodatas/me/restore-request` | auth | `{ reason? }`, asks staff to restore a deleted biodata |
| GET | `/biodatas/me/stats` | auth | Visits today / 7 days / 30 days, favourites |
| POST | `/biodatas/me/photo/upload-url` | verified | Returns an upload target and a `ticket` |
| POST | `/biodatas/me/photo` | verified | `{ ticket, visibility? }`, attaches the uploaded photo |
| PATCH | `/biodatas/me/photo` | auth | `{ visibility: 'public' \| 'after_unlock' \| 'hidden' }` |
| DELETE | `/biodatas/me/photo` | auth | |
| POST | `/biodatas/me/nid/upload-url` | verified | `{ side: 'front' \| 'back', contentType }` |
| POST | `/biodatas/me/nid` | verified | `{ frontTicket, backTicket }`, submits the NID for verification |

Browsing and interacting (`:no` is a biodata number such as `GH-1005`):

| Method | Path | Access | Body / notes |
| --- | --- | --- | --- |
| GET | `/biodatas` | public | Search. `?type&religion&marital&complexion&profession&economic&division&district&ageMin&ageMax&heightMin&heightMax&education&nid&q&sort&page&limit` (`district` takes a comma-separated list) |
| GET | `/biodatas/featured` | public | `?limit=` (1–12) |
| GET | `/biodatas/:no` | public | Public profile (no private fields) |
| POST | `/biodatas/:no/visit` | public | Counts a profile visit (once per visitor per day) |
| GET | `/biodatas/:no/viewer` | auth | The viewer's state: unlocked (with contact), favourite, dislike, proposal |
| POST | `/biodatas/:no/unlock` | verified | Spends one connection (402 `INSUFFICIENT_CONNECTIONS`); unlocking again is free. Returns the guardian contact |
| POST / DELETE | `/biodatas/:no/favorite` | auth | |
| POST / DELETE | `/biodatas/:no/dislike` | auth | |
| POST | `/biodatas/:no/proposals` | verified | `{ message? }` |
| POST | `/biodatas/:no/report` | auth | `{ reason, details? }` |

## Packages, payments and refunds

| Method | Path | Access | Body / notes |
| --- | --- | --- | --- |
| GET | `/packages` | public | Active packages and enabled payment methods (with Send Money numbers) |
| POST | `/payments` | verified | `{ packageId, method: 'bkash' \| 'nagad' \| 'rocket', mode: 'manual' \| 'gateway', senderNumber?, trxId? }`. Manual payments need the sender number and transaction ID and wait for staff. Gateway mode returns a `redirectURL` |
| GET | `/payments/mine` | auth | |
| GET | `/payments/:method/callback` | gateway | bKash/Nagad return URL; confirms with the gateway, credits, then redirects to the website |
| POST | `/refunds` | auth | `{ paymentId, reason }` |
| GET | `/refunds/mine` | auth | |

## Support and content

| Method | Path | Access | Body / notes |
| --- | --- | --- | --- |
| GET / POST | `/tickets` | auth | Create: `{ subject, category, message }` |
| GET | `/tickets/:id` | auth | Own tickets only |
| POST | `/tickets/:id/messages` | auth | `{ message }` |
| POST | `/tickets/:id/close` | auth | |
| POST | `/contact` | public | `{ name, email?, phone?, subject?, message }` |
| GET | `/public/stats` | public | Home page statistics |
| GET | `/public/settings` | public | Site name, tagline, contact details |
| GET | `/public/pages/:slug` | public | A published CMS page |
| GET | `/public/faqs` | public | Active FAQs |

## Uploads (development storage driver)

| Method | Path | Notes |
| --- | --- | --- |
| PUT | `/uploads/local/:token` | Raw image body (JPEG, PNG or WebP, up to 5 MB), authorised by the signed token from an `upload-url` call |
| GET | `/uploads/file/:token` | Serves a stored file for a short-lived signed token |

With `STORAGE_DRIVER=cloudflare` the upload targets point at Cloudflare Images and R2 instead and
these routes are not used.

## Admin: `/admin`

Every route needs a staff account (`admin.access`) plus the permission shown.

**Overview and insight**

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/admin/overview` | `overview.view` | KPI counts and short queues; payments only for `payments.manage` |
| GET | `/admin/analytics` | `analytics.view` | `?days=7..365`: daily series, totals and breakdowns |
| GET | `/admin/audit-logs` | `audit.view` | `?action=` (prefix) `&targetId=` |

**Biodatas, NID and recovery**

| Method | Path | Permission | Body / notes |
| --- | --- | --- | --- |
| GET | `/admin/biodatas` | `biodata.review` | `?status&nid&type&religion&hidden&blocked&deleted=true\|false\|all&q` |
| GET | `/admin/biodatas/:id` | `biodata.review` | Full biodata, completion, owner, activity, reports, restore request |
| POST | `/admin/biodatas/:id/approve` | `biodata.review` | Fails with `INCOMPLETE`, or `NID_REQUIRED` when the moderation setting requires it |
| POST | `/admin/biodatas/:id/reject` | `biodata.review` | `{ reason }`, the owner sees it |
| PUT | `/admin/biodatas/:id/sections/:section` | `biodata.edit` | `{ data }`, staff correction |
| POST | `/admin/biodatas/:id/block` | `biodata.review` | `{ blocked, reason? }`, hide from or show to the public |
| POST | `/admin/biodatas/:id/delete` | `biodata.review` | `{ reason }` |
| POST | `/admin/biodatas/:id/restore` | `recovery.manage` | |
| GET | `/admin/biodatas/:id/nid` | `nid.verify` | Short-lived image links; each view is audited |
| POST | `/admin/biodatas/:id/nid/verify` | `nid.verify` | |
| POST | `/admin/biodatas/:id/nid/reject` | `nid.verify` | `{ note }` |
| GET | `/admin/restore-requests` | `recovery.manage` | `?status=pending\|approved\|declined` |
| POST | `/admin/restore-requests/:id/approve` | `recovery.manage` | `{ note? }` |
| POST | `/admin/restore-requests/:id/decline` | `recovery.manage` | `{ note? }` |

**Users**

| Method | Path | Permission | Body / notes |
| --- | --- | --- | --- |
| GET | `/admin/users` | `users.view` | `?q&role=user\|support\|super_admin\|staff&status&verified` |
| GET | `/admin/users/:id` | `users.view` | Account, biodata, payments, ledger, counts |
| PATCH | `/admin/users/:id` | `users.manage` | `{ name?, email?, phone?, role?, status?, statusReason?, emailVerified?, phoneVerified? }`. Changing `role` also needs `roles.assign`; staff cannot change their own role or suspend themselves |
| POST | `/admin/users` | `users.manage` | `{ name, email?, phone?, password, role }` |
| POST | `/admin/users/:id/reset-password` | `users.manage` | `{ password }`, signs the user out everywhere |

**Money**

| Method | Path | Permission | Body / notes |
| --- | --- | --- | --- |
| GET | `/admin/payments` | `payments.manage` | `?status&method&mode&q` (invoice, transaction ID or sender) |
| POST | `/admin/payments/:id/verify` | `payments.manage` | Credits the connections |
| POST | `/admin/payments/:id/reject` | `payments.manage` | `{ reason }` |
| GET | `/admin/refunds` | `refunds.manage` | `?status` |
| POST | `/admin/refunds/:id/approve` | `refunds.manage` | `{ resolution: 'connection_credit' \| 'money_back', connections?, amount?, refundTrxId?, note? }` |
| POST | `/admin/refunds/:id/reject` | `refunds.manage` | `{ note }` |
| POST | `/admin/connections/adjust` | `connections.adjust` | `{ user, action: 'grant' \| 'revoke' \| 'refund_credit', quantity, reason }`, `user` is an ID, email or phone |
| GET | `/admin/connections/ledger` | `connections.adjust` | `?user&type` |
| GET / POST | `/admin/packages` | `packages.manage` | `{ name: { en, bn? }, description?, connections, price, isActive?, highlight?, sortOrder? }` |
| PATCH / DELETE | `/admin/packages/:id` | `packages.manage` | A package that has payments is retired instead of deleted |

**Moderation and support**

| Method | Path | Permission | Body / notes |
| --- | --- | --- | --- |
| GET | `/admin/reports` | `reports.manage` | `?status=active\|open\|in_review\|resolved\|dismissed` |
| PATCH | `/admin/reports/:id` | `reports.manage` | `{ status, actionTaken? }`, the reporter is notified when closed |
| GET | `/admin/tickets` | `tickets.manage` | `?status=active\|open\|waiting\|answered\|closed&category&q` |
| GET | `/admin/tickets/:id` | `tickets.manage` | With messages |
| POST | `/admin/tickets/:id/messages` | `tickets.manage` | `{ message, close? }` |
| PATCH | `/admin/tickets/:id` | `tickets.manage` | `{ status?, priority?, assignToMe? }` |
| GET | `/admin/contact-messages` | `tickets.manage` | `?status=new\|read\|replied\|archived` |
| PATCH | `/admin/contact-messages/:id` | `tickets.manage` | `{ status }` |

**Website content and settings**

| Method | Path | Permission | Body / notes |
| --- | --- | --- | --- |
| GET | `/admin/settings` | `settings.manage` | All setting groups |
| PUT | `/admin/settings/:key` | `settings.manage` | `key` is `site`, `payments`, `stats` or `moderation`; `{ value }` is merged over the defaults |
| GET | `/admin/pages` | `content.manage` | |
| GET / PUT / DELETE | `/admin/pages/:slug` | `content.manage` | `{ title: { en, bn }, body: { en, bn }, isPublished }`, body is Markdown |
| GET / POST | `/admin/faqs` | `content.manage` | `{ question: { en, bn }, answer: { en, bn }, category?, sortOrder?, isActive? }` |
| PATCH / DELETE | `/admin/faqs/:id` | `content.manage` | |
