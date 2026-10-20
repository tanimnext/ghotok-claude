# Feature parity with ordhekdeen.com

Ghotok was checked against [ordhekdeen.com](https://ordhekdeen.com/) (অর্ধেক দ্বীন), the
best-known biodata-based matchmaking site in Bangladesh, in October 2026. This page lists what
that site offers and how Ghotok covers it, so future work can see what was a deliberate choice
and what is still open.

## How the reference was mapped

- The public pages (home, browse, biodata profiles, about, FAQ, guide, contact, banners,
  login and registration) were opened in a browser with the
  [REA](https://github.com/morluto/rea) MCP server (see `.mcp.json`), in Bangla and English.
- The member dashboard needs an account, and its routes redirect to the login page. No account
  was created and the login was not bypassed. The dashboard was reconstructed from the site's
  public JavaScript bundles: the route table, the API endpoint table and the full English
  message dictionary (every label, notice and error the dashboard can show).
- Each feature was then compared with Ghotok's code. Where the reference site is specific to
  one faith, Ghotok keeps the feature and makes it neutral, because Ghotok serves every faith.

Status: **Yes**, Ghotok has it. **Adapted**, Ghotok has it in a different form (reason given).
**No**, deliberately left out (reason given).

## Public website

| Reference feature | Ghotok | Notes |
| --- | --- | --- |
| Home: search by type, marital status and address; counters; how-it-works; FAQs | Yes | |
| Bangla and English, light and dark theme | Yes | |
| Browse with filters: type, marital status, age, height, complexion, education, medium, profession, economic status, special categories | Yes | `/biodatas` |
| Permanent and present address filters, division → district → upazila, with live counts per place | Yes | `GET /biodatas/location-counts`; 494 upazilas and 12 city corporations |
| Sort newest / oldest | Yes | |
| "Seen" marker on biodatas already opened; add to shortlist from the results | Yes | |
| Public biodata profile with a month-only date of birth | Yes | Full date stays private |
| Profile visit counter | Yes | Counted once per visitor per day |
| Share and print a biodata | Yes | |
| About, guide, FAQ, contact form, privacy, terms, refund policy | Yes | Editable in the admin panel |
| Child safety policy | Yes | `/child-safety` |
| Banners page: downloadable promotional banners | Yes | `/banners`, managed by staff |
| Success stories | Yes | From marriage reports shared with consent and approved by staff |
| Mobile app download link | Yes | Shown when *Site settings → appUrl* is set |
| Tutorial videos (create biodata, buy connections, view contact) | Yes | Links set in *Site settings* |
| Islamic content (Quran verses, fiqh pages, baby names) | No | Ghotok is multi-faith |
| Health directory, "chithi" letters, partner apps | No | External services outside the matchmaking scope |

## Accounts and sign-in

| Reference feature | Ghotok | Notes |
| --- | --- | --- |
| Register with email or mobile number, OTP verification | Yes | |
| Login with password | Yes | |
| Login with a one-time code | Yes | |
| Google sign-in | Yes | Optional; on when `GOOGLE_CLIENT_ID/SECRET` are set |
| "Remember me" | Yes | Off = browser-session cookies, one-day server session |
| Forgot password with OTP | Yes | |
| Signed-in devices, sign out one or every device | Yes | |
| Password change signs other devices out | Yes | Shows how many were signed out |
| Sign-in through the sister site (HalalBondhon SSO) and account migration | No | Belongs to the reference company |

## Biodata

| Reference feature | Ghotok | Notes |
| --- | --- | --- |
| Pledge before creating a biodata | Adapted | Faith-neutral pledge (truthfulness, guardian consent, respectful use) |
| Multi-step biodata form, completion meter, preview | Yes | 10 steps defined once in `shared/src/biodata.js` |
| Minimum age: bride 18, groom 21 | Yes | Child Marriage Restraint Act 2017 |
| Upazila for permanent and present address | Yes | |
| Special categories (disability, infertility, revert/convert, orphan) | Yes | Optional, searchable |
| Religious practice questions | Adapted | Asked in neutral terms that suit every faith |
| Submit for review; reviewer feedback | Yes | |
| Field-level corrections from the reviewer, highlighted in the editor | Yes | Must be changed before resubmitting |
| Edit suspension by staff | Yes | |
| Hide with a reason (in talks, engaged, break, privacy, other) | Yes | |
| Delete with reason; "married" form with partner lookup and story | Yes | Becomes a marriage report |
| Restore: instant for never-approved biodatas, otherwise by request | Yes | Staff can decline permanently |
| Connections gift on first approval | Yes | Setting, default 1 |
| Photo with visibility control, NID verification badge | Yes | Ghotok extra: the reference site has no photos |

## Connections, contact and payments

| Reference feature | Ghotok | Notes |
| --- | --- | --- |
| Packages of connections; one connection unlocks a guardian contact | Yes | |
| Discount for members with an approved biodata | Yes | Setting, default 0 % (the reference uses 50 %) |
| bKash and Nagad online checkout | Yes | |
| Card / mobile banking through SSLCommerz | Yes | Optional |
| Manual "Send Money" with transaction ID (bKash, Nagad, Rocket) | Yes | Ghotok extra |
| Payment receipt page | Yes | `/dashboard/payment/<invoice>` |
| Contact caution before unlocking; verified phone/email badges | Yes | |
| Connection refunded when a report about wrong contact details is upheld | Yes | Once per unlock |
| Refund requests | Yes | |
| Reporting requires an unlock first | Adapted | Anyone signed in can report; abuse is handled by rate limits and review |

## Member dashboard

| Reference feature | Ghotok | Notes |
| --- | --- | --- |
| Overview: biodata status, number (copy), live/hidden switch, visit stats, balance | Yes | |
| Shortlist, ignore list, who shortlisted me, purchased contacts | Yes | |
| Proposals | Yes | Ghotok extra |
| Support tickets with file attachments (image, PDF, video) | Yes | A reply reopens a closed ticket |
| A report opens a linked support conversation | Yes | |
| Notifications, mark read, delete | Yes | |
| Account settings, language, deactivate | Yes | |

## Admin panel

| Reference feature | Ghotok | Notes |
| --- | --- | --- |
| Biodata review queue, approve, reject with field corrections, edit | Yes | |
| Suspend editing, block, delete, restore, permanent restore decline | Yes | |
| NID verification | Yes | |
| Reports with connection refund and linked ticket | Yes | |
| Support tickets with attachments | Yes | |
| Payments, refunds, connection adjustments with ledger, packages | Yes | |
| Marriage reports and success-story moderation | Yes | |
| Banners | Yes | |
| Pages, FAQs, site and payment settings, tutorial links | Yes | |
| Users and roles, analytics, audit log | Yes | |
