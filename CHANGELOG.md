# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Feature parity with ordhekdeen.com; see [docs/FEATURE-PARITY.md](docs/FEATURE-PARITY.md).

### Added

- **Search**: upazila-level permanent and present address filters with live counts, education
  medium, special categories, oldest-first sort, "seen" markers and shortlisting from the results.
- **Biodata lifecycle**: pledge before creation, field-level corrections from reviewers, edit
  suspension, hiding with a reason, a marriage report with partner lookup when deleting, instant
  restore of never-approved biodatas, permanent restore declines, a connections gift on first
  approval, a month-only public date of birth and the legal minimum age for grooms (21).
- **Success stories** from marriage reports shared with consent, moderated by staff.
- **Banners**: downloadable promotional banners managed in the admin panel.
- **Support**: file attachments (images, PDF, video) on tickets and reports; a report opens a
  linked ticket and can refund the reporter's connection; replying reopens a closed ticket.
- **Payments**: SSLCommerz checkout, receipt page, discount for members with an approved biodata.
- **Sign-in**: one-time code, Google, "remember me", signed-in devices and sign out everywhere.
  Changing the password signs other devices out.
- Child safety policy page, tutorial video and app download links in site settings,
  notification delete.
- REA (reverse-engineering MCP server and skill) configured for Claude Code in `.mcp.json`.

### Changed

- Creating a biodata needs the pledge; hiding one needs a reason.
- Gateway payments return to the receipt page instead of the connections page.

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
