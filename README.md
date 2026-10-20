# Ghotok (ঘটক)

A modern, secure matchmaking platform for every faith in Bangladesh: Muslim, Hindu, Christian,
Buddhist and others. Families publish a free biodata, browse approved biodatas, and unlock a
guardian's contact details with **connections** bought through bKash, Nagad or Rocket. Staff
review every biodata, verify National ID cards and payments, and handle reports and support from
an admin panel.

The whole system is JavaScript on the MERN stack: **MongoDB, Express, React and Node.js**. The
public website uses Next.js (React).

| App | What it is | Tech | Dev URL |
| --- | --- | --- | --- |
| `web/` | Public website and member dashboard | Next.js 16 (App Router), React 19, Tailwind CSS 4, TanStack Query | http://localhost:3000 |
| `admin/` | Admin panel for support staff and super admins | React 19, Vite 7, React Router 7, TanStack Query, Recharts | http://localhost:5173 |
| `server/` | REST API | Node.js 22, Express 5, Mongoose 8, Zod 4 | http://localhost:4000/api |
| `shared/` | Code used by all three: biodata form definition, option lists, permissions, API client, formatting | Plain JavaScript (ES modules) | – |
| `ui/` | React UI kit used by the website and the admin panel | React | – |

## Features

**Members (website)**

- Sign up with email or a Bangladeshi mobile number, with OTP verification and password reset.
- A guided, 10-step biodata editor (general, address, education, family, personal, occupation,
  marriage, expected partner, declaration and private contact details), with draft saving,
  submission for review, hide/show and soft delete with a recovery request.
- Photo upload (visible to everyone, only after a contact unlock, or to nobody), and NID upload
  for a verified badge.
- Search and filter approved biodatas (type, religion, age, height, marital status, complexion,
  division and districts, education, profession, economic status, NID-verified only), with a
  public profile page for each.
- Favorites, dislikes, "who favorited me", proposals (send, accept, decline, withdraw) and reports.
- Connections: buy packages (3 for ৳300, 5 for ৳500 by default) with bKash, Nagad or Rocket
  (Send Money + transaction ID, or online checkout for bKash/Nagad), unlock guardian contacts,
  see the balance, history and refunds.
- Profile visit statistics (today, 7 days, 30 days), notifications, support tickets.
- English and Bangla, light and dark mode, mobile first.

**Staff (admin panel)**

- Overview of everything waiting for attention.
- Biodata review: approve, ask for changes, edit any section, hide, delete, restore.
- NID verification, soft-delete recovery queue, reports and complaints.
- Payments: verify or reject transactions; refunds as connection credit or money back.
- Manual connection grant/revoke/refund with a full ledger.
- Users and roles, packages, pages and FAQs, site settings, analytics and an audit log of every
  staff action.

Roles: **Guest**, **Registered user**, **Support & reviewer** and **Super admin** (see
[`shared/src/permissions.js`](shared/src/permissions.js)).

## Getting started

### Requirements

- Node.js 22.12 or newer (`nvm use` reads `.nvmrc`)
- MongoDB 7 or newer running locally, or a MongoDB Atlas connection string
- Or just Docker (see [Running with Docker](#running-with-docker))

### Set up

```bash
npm ci                                   # installs every workspace
cp server/.env.example server/.env       # API settings (works as-is for local development)
cp web/.env.example web/.env.local       # website settings
cp admin/.env.example admin/.env         # admin panel settings
npm run seed:demo                        # super admin, packages, pages, FAQs and demo data
npm run dev                              # API, website and admin panel together
```

`npm run seed` creates only what a real installation needs (the first super admin, packages,
pages and FAQs). `npm run seed:demo` adds 20 demo biodatas and some activity; it refuses to run
when `NODE_ENV=production`.

In development, OTP codes are shown in the interface (`OTP_DEV_ECHO=true`), emails and SMS are
printed to the API log, and uploads are stored on disk.

### Demo accounts

| Account | Email | Password |
| --- | --- | --- |
| Super admin | `admin@ghotok.com.bd` | `ChangeMe!2026` (from `SEED_ADMIN_PASSWORD`) |
| Support reviewer | `support@example.com` | `Demo@12345` |
| Member with 5 connections | `member@example.com` | `Demo@12345` |
| Demo biodata owners | `demo1@example.com` … `demo20@example.com` | `Demo@12345` |

Change the super admin password before going live.

### Running with Docker

```bash
docker compose up --build -d
docker compose run --rm api node src/scripts/seed.js --demo
```

The website is on http://localhost:3000 and the admin panel on http://localhost:8080.
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) covers production.

## Scripts

Run from the repository root.

| Command | What it does |
| --- | --- |
| `npm run dev` | API, website and admin panel with reload (`dev:api`, `dev:web`, `dev:admin` for one) |
| `npm run seed` / `npm run seed:demo` | Load the base data / base data plus demo data |
| `npm test` | Unit and API integration tests (the API tests start a throwaway MongoDB) |
| `npm run lint` / `npm run lint:fix` | ESLint |
| `npm run format` / `npm run format:check` | Prettier |
| `npm run build` | Production builds of the website and the admin panel |
| `npm run check` | Everything CI runs: lint, format check, tests and builds |

## Documentation

- [Architecture](docs/ARCHITECTURE.md): how the pieces fit together, and the reasoning behind them
- [API reference](docs/API.md)
- [Deployment](docs/DEPLOYMENT.md): Docker, reverse proxy, Cloudflare, bKash/Nagad, backups
- [Contributing](CONTRIBUTING.md): conventions and how to add a biodata field, an endpoint or an
  admin screen
- [Decision records](docs/adr/)
- [Changelog](CHANGELOG.md)

## বাংলায় সংক্ষেপে

**ঘটক** বাংলাদেশের সব ধর্মের পরিবারের জন্য একটি নিরাপদ বিয়ের প্ল্যাটফর্ম। সদস্যরা বিনামূল্যে
বায়োডাটা তৈরি করেন, অনুমোদিত বায়োডাটা খোঁজেন এবং বিকাশ, নগদ বা রকেটে কেনা **কানেকশন** দিয়ে
অভিভাবকের যোগাযোগ নম্বর দেখেন। প্রতিটি বায়োডাটা, এনআইডি ও পেমেন্ট অ্যাডমিন প্যানেল থেকে যাচাই করা হয়।

- **ওয়েবসাইট** (`web/`): Next.js দিয়ে তৈরি পাবলিক সাইট ও সদস্য ড্যাশবোর্ড।
- **অ্যাডমিন প্যানেল** (`admin/`): React ও Vite দিয়ে তৈরি; বায়োডাটা অনুমোদন, পেমেন্ট যাচাই,
  রিফান্ড, রিপোর্ট, সাপোর্ট টিকিট, ব্যবহারকারী ও সেটিংস।
- **এপিআই** (`server/`): Node.js, Express ও MongoDB।

শুরু করতে: `npm ci`, `.env.example` ফাইলগুলো কপি করুন, তারপর `npm run seed:demo` এবং `npm run dev`।
বিস্তারিত উপরের ইংরেজি অংশে এবং `docs/` ফোল্ডারে আছে।
