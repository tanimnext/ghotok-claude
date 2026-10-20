# Deployment

Ghotok has three deployable parts and a database:

| Part | Image | Listens on | Public address (example) |
| --- | --- | --- | --- |
| Website (`web/`) | `web/Dockerfile` (Next.js standalone server) | 3000 | `https://ghotok.com.bd` |
| Admin panel (`admin/`) | `admin/Dockerfile` (static files on nginx) | 80 | `https://admin.ghotok.com.bd` |
| API (`server/`) | `server/Dockerfile` (Node.js) | 4000 | not exposed directly |
| MongoDB | `mongo:8`, or MongoDB Atlas | 27017 | never exposed |

Visitors only ever talk to the website and the admin panel. Both forward `/api` to the API on the
private network: Next.js with a rewrite, the admin container with its nginx proxy. Keep the API
off the public internet; it is reached through those two origins.

All images build from the repository root, for example
`docker build -f server/Dockerfile -t ghotok-api .`. CI builds all three on every pull request.

## 1. Server and DNS

Any Linux server with Docker and Compose works (2 vCPU and 2–4 GB RAM is plenty to start). Point
both domains at it, ideally through Cloudflare's proxy (orange cloud) with SSL mode "Full
(strict)".

## 2. Configuration

Copy `server/.env.example` to `server/.env` on the server and set at least:

| Variable | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Your MongoDB connection string (Atlas, or `mongodb://mongo:27017/ghotok` with the bundled container) |
| `WEB_URL` | `https://ghotok.com.bd` |
| `ADMIN_URL` | `https://admin.ghotok.com.bd` |
| `API_PUBLIC_URL` | `https://ghotok.com.bd` (the API is reached through the website's `/api`; payment gateways call back here) |
| `CORS_ORIGINS` | `https://ghotok.com.bd,https://admin.ghotok.com.bd` |
| `JWT_ACCESS_SECRET`, `JWT_UPLOAD_SECRET` | Two different random values: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `COOKIE_SECURE` | `true` |
| `OTP_DEV_ECHO` | `false` (the API refuses to start in production otherwise) |
| `TRUST_PROXY` | How many proxies sit in front of the API, so rate limits and logs see the visitor's real IP. Cloudflare, your TLS proxy and the website or admin container each count as one: `3` for the setup in this guide, `2` without Cloudflare |
| `SMTP_*`, `MAIL_FROM` | Your mail provider |
| `SMS_API_URL` | Your SMS gateway URL with `{number}` and `{message}` placeholders |
| `STORAGE_DRIVER` | `cloudflare` (see section 4) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | The first super admin, created by the seed script |

The API validates its configuration at start-up and exits with a clear message when something is
missing or unsafe (for example the development JWT secrets in production).

Build-time settings for the front-ends are passed as build arguments:

| Image | Build argument | Example |
| --- | --- | --- |
| web | `NEXT_PUBLIC_SITE_URL` | `https://ghotok.com.bd` (used in SEO metadata and the sitemap) |
| web | `API_URL` | `http://api:4000` (where the Next.js server finds the API) |
| web | `NEXT_PUBLIC_DEFAULT_LANG` | `en` or `bn` |
| admin | `VITE_WEBSITE_URL` | `https://ghotok.com.bd` |
| admin | `VITE_BASE` | `/` (or `/admin/` when served under a path) |

The admin container also reads `API_UPSTREAM` at start-up (default `http://api:4000`).

## 3. Run with Docker Compose

The `docker-compose.yml` at the repository root runs MongoDB, the API, the website and the admin
panel. For production, set the public URLs before building, because the front-ends bake them in:

```bash
export NODE_ENV=production
export WEB_URL=https://ghotok.com.bd
export ADMIN_URL=https://admin.ghotok.com.bd
export API_PUBLIC_URL=https://ghotok.com.bd
export CORS_ORIGINS=https://ghotok.com.bd,https://admin.ghotok.com.bd

docker compose up --build -d
docker compose run --rm api node src/scripts/seed.js     # first run only; never use --demo in production
```

(Compose also reads these from a `.env` file next to `docker-compose.yml`.)

Then sign in to the admin panel as the seeded super admin and **change the password**, set the
payment numbers and support contacts under *Site settings*, and review the seeded pages and FAQs.

When MongoDB is hosted elsewhere (Atlas), remove the `mongo` service and its `depends_on`, and set
`MONGODB_URI` in `server/.env` (and drop the `MONGODB_URI` line under `api.environment`, which
otherwise points at the bundled container).

## 4. TLS and the reverse proxy

Compose publishes the website on port 3000 and the admin panel on 8080. Put a TLS-terminating
proxy in front of them. With Caddy, which obtains certificates automatically:

```caddyfile
ghotok.com.bd {
  reverse_proxy 127.0.0.1:3000
}
admin.ghotok.com.bd {
  reverse_proxy 127.0.0.1:8080
}
```

The equivalent with nginx:

```nginx
server {
  listen 443 ssl http2;
  server_name ghotok.com.bd;
  # ssl_certificate / ssl_certificate_key …
  client_max_body_size 6m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
server {
  listen 443 ssl http2;
  server_name admin.ghotok.com.bd;
  client_max_body_size 6m;
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Consider restricting the admin domain further (Cloudflare Access, or an IP allow-list).

## 5. Media storage: Cloudflare Images and R2

Photos go to **Cloudflare Images**; NID scans go to a **private R2 bucket**. Browsers upload
directly to Cloudflare with short-lived URLs issued by the API.

1. **Images.** In the Cloudflare dashboard open *Images*, note the **account ID** and the
   **account hash** (`CF_ACCOUNT_ID`, `CF_IMAGES_ACCOUNT_HASH`), and create an API token with
   *Cloudflare Images: Edit* (`CF_IMAGES_API_TOKEN`). To keep photos private, enable signed URLs
   under *Images → Keys* and set `CF_IMAGES_SIGNING_KEY`; the API then signs every photo URL with
   an expiry. `CF_IMAGES_VARIANT` names the delivery variant (default `public`).
2. **R2.** Create a bucket (for example `ghotok-private`) with public access **off**
   (`R2_BUCKET`). Create an R2 API token with *Object Read & Write* for that bucket
   (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`).
3. **R2 CORS.** Browsers upload NID images with a presigned `PUT`, so the bucket needs a CORS rule:

   ```json
   [
     {
       "AllowedOrigins": ["https://ghotok.com.bd"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

4. Set `STORAGE_DRIVER=cloudflare` and restart the API.

With `STORAGE_DRIVER=local` files are kept in the API container's `/app/server/uploads` (a named
volume in Compose). That is fine for a trial, but back the volume up, and do not run more than
one API instance with it.

## 6. Payments

All three methods (bKash, Nagad, Rocket) work without any gateway account: members send money to
the numbers set in *Site settings → Payments* and enter the transaction ID, and staff verify it
against the merchant statement in *Payments*.

Online checkout is optional:

- **bKash tokenized checkout.** Ask bKash for merchant credentials, set `BKASH_ENABLED=true`,
  `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD`, and change
  `BKASH_BASE_URL` from the sandbox to the production endpoint bKash gives you.
- **Nagad.** Set `NAGAD_ENABLED=true`, `NAGAD_MERCHANT_ID`, `NAGAD_MERCHANT_NUMBER`, Nagad's
  public key (`NAGAD_PUBLIC_KEY`) and your merchant private key (`NAGAD_MERCHANT_PRIVATE_KEY`),
  either as PEM or as the bare base64 key body Nagad provides, and the production
  `NAGAD_BASE_URL`.

Gateways redirect the member back to `API_PUBLIC_URL/api/payments/<method>/callback`. Give the
gateway that URL if it asks for an allow-list. The API confirms the payment with the gateway (and
that the amount matches) before crediting, then sends the member to their *Connections* page.
Test the whole flow in the sandbox first.

## 7. Email and SMS

- **Email**: any SMTP provider (Amazon SES, Mailgun, Zoho, your host). Set `SMTP_HOST`,
  `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and a `MAIL_FROM` on a domain with SPF and DKIM.
- **SMS**: most Bangladeshi gateways (BulkSMSBD, SSL Wireless and others) offer a GET API. Put its
  URL in `SMS_API_URL` with `{number}` (sent as `8801XXXXXXXXX`) and `{message}` placeholders.

Without these settings messages are only written to the API log, so OTPs will not reach anyone.

## 8. Database and backups

- Indexes are created automatically when the API starts.
- Use authentication (Atlas does) and never publish port 27017.
- Back up daily and test a restore. With the bundled container:

  ```bash
  docker compose exec -T mongo mongodump --archive --gzip --db ghotok > ghotok-$(date +%F).archive.gz
  # restore:
  docker compose exec -T mongo mongorestore --archive --gzip --drop < ghotok-YYYY-MM-DD.archive.gz
  ```

  Keep copies off the server. Atlas offers scheduled backups.

## 9. Updating

```bash
git pull
docker compose up --build -d     # rebuilds and replaces the containers
docker image prune -f
```

To roll back, check out the previous release tag and run the same commands. Data changes are
backwards compatible within a release line; read `CHANGELOG.md` before upgrading.

## 10. Monitoring

- `GET /api/health` returns `{ ok: true }`; the API image has a Docker health check on it.
- The API writes structured JSON logs (pino) to stdout: `docker compose logs -f api`. Ship them
  to your log service of choice.
- Staff actions are recorded in the audit log (admin panel → *Audit log*).

## Production checklist

- [ ] `NODE_ENV=production`, strong and different JWT secrets, `COOKIE_SECURE=true`
- [ ] `OTP_DEV_ECHO=false`, SMTP and SMS configured and tested
- [ ] `WEB_URL`, `ADMIN_URL`, `API_PUBLIC_URL` and `CORS_ORIGINS` use the real HTTPS domains
- [ ] `STORAGE_DRIVER=cloudflare`, Images signing on, R2 bucket private with CORS for the website
- [ ] Super admin password changed; extra staff accounts created with the right roles
- [ ] Payment numbers and support contacts set in *Site settings*
- [ ] MongoDB not reachable from the internet; daily backups running and a restore tested
- [ ] TLS on both domains; the admin domain restricted if possible
