# LifeLedger

LifeLedger is a private personal dashboard for tracking expenses and learning sessions. It uses a React/Vite frontend, Express API, MongoDB/Mongoose storage, and HTTP-only cookie authentication.

## Features

- One environment-bootstrapped owner plus username/password accounts, rate-limited sign-in/registration, and per-account data isolation.
- New registrations remain pending until the owner approves them. The owner-only User Management page supports username search, status filtering, approval/rejection, and block/unblock controls that revoke active sessions immediately.
- Expense and learning CRUD, search, date/category/payment/subject filters, server pagination, and CSV export.
- User-created learning subjects with case-insensitive unique names, colors/icons, archive controls, per-subject goals, histories, and learning analytics.
- Overview with persisted daily, weekly and monthly figures, budget remaining, category mix, spending trends, recent expenses, learning subjects, weekly goal progress, and daily reflections.
- Combined monthly calendar, date-specific review, analytics, editable preferences, and JSON backup download.
- Asia/Kolkata date boundaries, Monday-start weeks, INR and paise-backed expense amounts.
- Responsive light and dark themes.

## Project layout

```text
backend/   Express API, Mongoose models, validation, auth, report routes
frontend/  React/Vite app, pages, charts, shared styles and API client
```

## Local setup

Requirements: Node.js 20+, npm, and MongoDB (local or Atlas).

1. Copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI`, a long random `AUTH_SECRET`, `INITIAL_ADMIN_USERNAME`, and a unique `INITIAL_ADMIN_PASSWORD`. Keep `.env` out of version control.
2. Install and start the API:

   ```sh
   cd backend
   npm install
   npm run dev
   ```

   On startup, LifeLedger adopts the existing account matching the configured bootstrap username as the owner, preserving its database ID and existing records. If that account does not exist, it creates the sole owner account from the environment values. The owner role has a unique database index; public registration can only create normal users. Changing the bootstrap password env var does not overwrite a stored password. To rotate it, update the password hash through a trusted administrative process; do not delete the database.
3. In a second terminal, copy `frontend/.env.example` to `frontend/.env` (the default points at `http://localhost:4000/api`) and run:

   ```sh
   cd frontend
   npm install
   npm run dev
   ```

4. Visit the Vite URL and sign in with the bootstrap owner account. New users can register with a username and password, then must wait for owner approval. They receive a separate workspace after approval and cannot view owner data or User Management.

## Environment variables

Backend (`backend/.env`):

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (defaults to 4000; Render injects this) |
| `NODE_ENV` | Set to `production` for secure cookies |
| `MONGODB_URI` | MongoDB connection string |
| `AUTH_SECRET` | Random secret used to sign seven-day session JWT cookies |
| `INITIAL_ADMIN_USERNAME` | Username created at first startup if absent |
| `INITIAL_ADMIN_PASSWORD` | Initial password (bcrypt hashed; never returned) |
| `FRONTEND_ORIGIN` | Exact allowed frontend origin for credentialed CORS |

Frontend (`frontend/.env`): `VITE_API_BASE_URL` is the API URL ending in `/api`. Never put backend secrets in frontend variables.

## Dates and money

The app treats entered date/time values as Asia/Kolkata. The browser sends an explicit `+05:30` offset; MongoDB stores instants as UTC dates. Date-only filters become midnight Asia/Kolkata at the start and an exclusive next midnight at the end. Reports group days in `Asia/Kolkata`; weeks start Monday. Expenses are stored in integer paise and presented in INR. Settings currently keep Asia/Kolkata as the supported reporting timezone.

Weekly spending budgets are stored separately from account settings, with a unique `(userId, weekStart)` index and week dates represented as Asia/Kolkata calendar dates. Existing monthly budgets remain in `User.settings.monthlyBudgetPaise` and continue to appear in monthly views; they are not converted or modified. The backend initializes the weekly budget index on startup.

Learning subjects are private to each user and have a case-insensitive unique name index. At startup the backend links legacy learning sessions to subjects matching their existing subject text; all session dates, durations, and notes are retained. New accounts start with no prefilled subjects.

## Tests and builds

```sh
cd backend && npm test
cd frontend && npm test
cd frontend && npm run build
```

Backend tests cover input validation, Asia/Kolkata date boundaries, registration constraints, owner authorization, and rejection of blocked/revoked sessions. Frontend tests cover API request credentials and owner-only sidebar visibility. Database-backed approval/login/block workflow integration tests still require a dedicated test MongoDB; no production database is used by the current tests.

## Deployment preparation

### MongoDB Atlas

Create a database user limited to the LifeLedger database, enable TLS, and restrict network access to the smallest practical set of deployment addresses. Use the resulting URI only in Render secrets. Do not commit credentials.

### Render API

- Create a Node web service rooted at `backend`.
- Build command: `npm install`.
- Start command: `npm start`.
- Set `NODE_ENV=production`, `MONGODB_URI`, `AUTH_SECRET`, bootstrap username/password, and `FRONTEND_ORIGIN` in Render's secret environment settings.
- Configure health check path `/api/health`.

### Vercel frontend

- Import the repository and set the project root to `frontend`.
- Build command: `npm run build`; output directory: `dist`.
- Set `VITE_API_BASE_URL=/api` in Vercel so browser requests stay on the frontend origin. `frontend/vercel.json` proxies `/api/*` to `https://lifeledger-api.onrender.com/api/*` and rewrites other routes to `index.html`; update the proxy destination if the Render service has a different hostname.
- Set Render `FRONTEND_ORIGIN` to the exact deployed Vercel origin (scheme and hostname, no path). This keeps credentialed CORS restricted to that frontend for any direct cross-origin tooling. Browser API calls use the Vercel proxy and a first-party, `HttpOnly; Secure; SameSite=Lax` cookie in production. The cookie has `Path=/`, no `Domain` attribute, and a seven-day `Max-Age` matching the JWT lifetime.

Deployment itself has not been performed; it requires the owner's Atlas, Render, and Vercel accounts and credentials.

## Backup and restoration

Settings offers a JSON backup download containing settings, expenses, sessions, and reflections. It deliberately excludes password hashes and session secrets. Restoration is currently a manual, owner-operated database import after reviewing the JSON and mapping its records to the account's user id. There is no in-app restore path, to avoid accidental duplicate imports or overwriting live data.

## Owner approval and account migration

`INITIAL_ADMIN_USERNAME` identifies the existing owner account. On startup, the server first keeps an existing owner if present; otherwise it promotes the existing account matching that configured username, preserving its MongoDB ID, password hash, settings, expenses, learning sessions, and reviews. If neither exists, the environment credentials create the one owner account. A unique partial index prevents a second owner. Existing normal accounts with no status retain the schema default `active`; newly registered accounts use `pending_approval` and receive no session cookie until approved. Rejected accounts remain in the database and keep their username reserved. No collection is dropped or reset.

The sign-in screen identifies the personal application owner as Rohit Varma Kunaparaju. This display name is informational only; admin permissions are checked from the authenticated MongoDB role.

## Known limitations

- Initial owner provisioning is environment based; password rotation needs an administrative procedure.
- Weekly/monthly dashboard and date-range report endpoints return persisted data, but previous-period comparisons and daily summaries CSV are not yet provided.
- Subject and category lists are configurable. Subject goals, streak display, learning topic completion tracking, and custom timezone selection are not implemented.
- The report date selector supports this week/month/year; arbitrary custom ranges can be selected in the transaction screens and exported.
- Automated tests are focused on pure validation/date utilities. API integration tests and full frontend behavior tests need a dedicated test MongoDB setup.
# Expenses-and-learning-tracker.
