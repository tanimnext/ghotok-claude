# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-10-20

First complete release.

### Added

- **Website** (Next.js): home page with search, biodata browsing with filters, public biodata
  profiles, packages and checkout (bKash, Nagad, Rocket), about, guide, FAQ, contact and policy
  pages, sign-up and login with OTP verification and password reset, English and Bangla, light
  and dark mode.
- **Member dashboard**: 10-step biodata editor with photo and NID upload, overview with
  connection balance and visit statistics, favorites, dislikes, who favorited me, unlocked
  contacts, proposals, connections and billing history with refund requests, notifications,
  support tickets, account and security settings, biodata hide, delete and restore request.
- **Admin panel** (React + Vite): overview, biodata review and editing, NID verification,
  recovery queue, reports, support tickets and contact messages, payments, refunds, manual
  connection adjustments with the ledger, packages, users and roles, analytics, audit log, pages
  and FAQs, site settings.
- **API** (Express + MongoDB): cookie-based authentication with rotating refresh tokens, roles and
  permissions, the connection ledger, manual and gateway payments (bKash tokenized checkout,
  Nagad), Cloudflare Images and R2 storage, email and SMS delivery, audit logging, rate limits.
- Shared packages: `@ghotok/shared` (biodata definition, options, permissions, API client,
  formatting) and `@ghotok/ui` (React components).
- Tests for the shared rules, the API (against a throwaway MongoDB), and both front-ends'
  dictionaries.
- Docker images for the API, website and admin panel, a Compose file for the whole stack, and CI.
- Documentation: README, architecture, API reference, deployment guide, contributing guide and
  decision records.

[Unreleased]: https://github.com/tanimnext/ghotok/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/tanimnext/ghotok/releases/tag/v1.0.0
