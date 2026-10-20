# Contributing

This guide is for developers working on Ghotok. Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
first; it explains how the parts fit together.

## Workflow

1. Branch from `main` (`feature/…`, `fix/…`).
2. Make the change, with tests where it changes behaviour.
3. Run `npm run check` (lint, format check, tests, builds). CI runs the same on every pull
   request and also builds the Docker images.
4. Open a pull request using the template; keep it focused on one change.

Commit messages: an imperative summary line under about 70 characters ("Add NID re-upload after
rejection"), a blank line, then what changed and why when it is not obvious.

## Code conventions

- **JavaScript only**, ES modules everywhere, Node.js 22. No TypeScript; use JSDoc on exported
  functions whose inputs or outputs are not obvious.
- **Formatting is Prettier's job** (`npm run format`); **ESLint** catches mistakes
  (`npm run lint:fix`). Don't hand-format.
- **Naming**: React components and their files in `PascalCase.jsx`; hooks `useSomething`; server
  files by role (`payment.service.js`, `payment.controller.js`, `payment.validation.js`,
  `payment.serializer.js`, `payment.model.js`).
- **Comments** explain *why*, not *what*. A short header comment at the top of a module saying
  what it is for is welcome.
- **No duplication across apps.** Code used by both front-ends belongs in `ui/` (React components)
  or `shared/` (anything else). Constants, option lists and labels live in
  `shared/src/options.js`, not in components.
- **Text** is never hard-coded in components: add it to both `en.js` and `bn.js` of the app
  (`web/src/lib/i18n`, `admin/src/lib/i18n`). Tests fail when the two dictionaries differ, and the
  admin tests also fail when a page uses a key that does not exist.
- **Styling** uses Tailwind classes with the design tokens (`bg-surface`, `text-muted`,
  `text-rose-text`, …) from `shared/styles/tokens.css`. Never hard-code colours; both themes must
  work.

### API rules

- Routes only wire middleware: `validate(...)`, auth or permission checks, then a controller.
- Controllers stay thin: read `req`, call one service, send the result.
- Services hold the business rules and are the only code that uses models.
- Responses go through a serializer, so a model field never leaks by accident (the contact
  section and NID data are private).
- Throw `ApiError`s from `utils/api-error.js` with a stable `code`; front-ends rely on codes.
- Every staff action calls `recordAudit(ctx, 'area.action', { targetType, targetId, summary })`.
- Change a connection balance only through `changeBalance()`.

## How to…

### Add a biodata field

1. Add the field to its section in [`shared/src/biodata.js`](shared/src/biodata.js): `key`,
   `type` (`text`, `textarea`, `number`, `select`, `multiselect`, `district`, `date`, `phone`,
   `email`), `label: { en, bn }`, and as needed `required`, `options`, `min`/`max`,
   `maxLength`, `help`, `private: true` or `showIf: (biodata) => …`. Option lists go in
   `shared/src/options.js`.
2. That is all for most fields: the database schema, API validation, the member's editor, the
   public profile and the admin review screen are all generated from this definition.
3. If people should be able to **search** by it, also: copy it to a top-level field in the
   `pre('validate')` hook of `server/src/models/biodata.model.js` (add an index if needed), filter on
   it in `server/src/services/search.service.js`, accept it in `searchQuery`
   (`server/src/validations/biodata.validation.js`), and add the control to
   `web/src/components/biodata/SearchFilters.jsx`.
4. Add or update tests in `shared/test/biodata.test.js`.

### Add an API endpoint

1. **Validation**: a Zod schema in `server/src/validations/<area>.validation.js`.
2. **Service**: the logic in `server/src/services/<area>.service.js`.
3. **Controller**: a small function in `server/src/controllers/` (admin ones in
   `controllers/admin/`).
4. **Route**: in `server/src/routes/`. Admin routes go in `routes/admin/index.js` with
   `can('<permission>')`.
5. **Serializer** for any new resource shape.
6. **Test** in `server/test/`. Tests drive the real app over HTTP against a throwaway MongoDB;
   `test/helpers.js` creates users, signed-in agents and approved biodatas:

   ```js
   const { agent } = await userWithAgent();
   const res = await agent.get('/api/me/dashboard');
   expect(res.status).toBe(200);
   ```

7. **Client**: a function in `web/src/lib/api/endpoints.js` or `admin/src/lib/api.js`. Pages call
   those functions and never build URLs themselves.
8. **Document** it in [`docs/API.md`](docs/API.md).

### Add a permission or change who can do what

Edit [`shared/src/permissions.js`](shared/src/permissions.js). The API and the admin panel both
read it, so one change updates the route check and what the panel shows. Update
`shared/test/permissions.test.js`.

### Add an admin screen

1. Create `admin/src/pages/<Name>Page.jsx`. Reuse `PageHeader`, `DataCard` (paginated lists with
   loading and empty states), `Tabs`, `UserCell` and the dialogs from `@ghotok/ui`. Keep filters
   in the URL with `useQueryParam` / `usePageParam`.
2. Register it in [`admin/src/app/routes.js`](admin/src/app/routes.js) with its path, permission
   and, for a top-level screen, its sidebar entry (`nav: { key, icon, group, badge? }`). The router
   and sidebar are built from that list, and the page is loaded on demand.
3. Add its text to `admin/src/lib/i18n/en.js` and `bn.js`.
4. After a change, invalidate the related queries (`queryClient.invalidateQueries`) so lists,
   the overview and the sidebar badges update.

### Add a website page

Pages live in `web/src/app` (App Router). Public pages are Server Components and load public data
with `getPublic()` from `web/src/lib/api/server.js`; anything personal is loaded in a Client
Component with TanStack Query. A simple text page needs no code: create it in the admin panel
under *Pages and FAQs* and it is served at `/<slug>`.

### Add a UI component to the shared kit

Put it in `ui/src/`, export it from `ui/src/index.js`, and keep it free of app-specific imports.
Links go through `useUiLink()` so they work with both Next.js and React Router.

## Environment and data

- `npm run seed:demo` loads realistic demo data; `npm run seed` loads only what production needs.
- To start over locally, drop the `ghotok` database and seed again.
- OTP codes appear in the interface while `OTP_DEV_ECHO=true` (development only), and emails and
  SMS are printed to the API log until SMTP/SMS settings are filled in.
