# SathRide

A Pakistan-focused carpooling prototype built with Next.js, React, PostgreSQL,
Prisma, Better Auth and Leaflet. It includes passenger and driver onboarding,
ride search, seat requests, recurring carpools, communities, private messages,
verification review, trip sharing and an administrator console.

## Local setup on Ubuntu

Use Node.js 24 and npm. Run commands from this directory.

```bash
npm ci
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set `BETTER_AUTH_SECRET` in `.env` to the generated value. Keep `.env` private.
The example database URL is for development on your own machine.

In a separate terminal, start the persistent local PostgreSQL database:

```bash
npm run db:local
```

Keep that terminal open. Data lives in `.local-pg/`; Ctrl+C stops the database.
Alternatively, use `docker compose up -d db` with Docker Compose installed.
Choose one database option; both default to port 5432. If that port is occupied,
choose another in `DATABASE_URL` for the embedded option or update the Compose
port mapping and `DATABASE_URL` together.

Then initialize and start the app:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://localhost:3000**. `BETTER_AUTH_URL` must match the address used in
your browser. Development listens on all interfaces; use the localhost address
for the default authentication configuration.

## Local setup on Windows

Install Node.js 24. In PowerShell, enter the project directory and run:

```powershell
npm ci
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the generated value into `BETTER_AUTH_SECRET` in `.env`. With Docker
Desktop running, start PostgreSQL using `docker compose up -d db`, then run the
same `db:generate`, `db:migrate`, `db:seed` and `dev` commands shown above.
WSL can use the Ubuntu instructions. Native Windows setup has not been tested
in this workspace.

## Try the demo

All seeded names, accounts, documents and institutional affiliations are
fictional. The shared development password is **`SathRideDemo!2026`**.

| Email | Role / useful flow |
| --- | --- |
| `bilal@demo.sathride.test` | Passenger: find rides, request seats and message a driver |
| `hamza@demo.sathride.test` | Driver: accept requests and manage recurring carpools |
| `amna@demo.sathride.test` | Driver and passenger: female-only ride and a trip ready to start |
| `sara@demo.sathride.test` | Passenger: pending booking and verification submission |
| `zain@demo.sathride.test` | Driver and passenger: male-only ride and workplace community |
| `admin@demo.sathride.test` | Administrator: review documents, reports and account suspensions |

For a booking walkthrough, sign in as Bilal, find a ride and request seats.
In a separate browser profile, sign in as Hamza and accept the request under
the ride details. Bilal can then open the booking conversation or cancel the
booking. Pending requests do not reserve seats; acceptance checks capacity
inside a transaction.

The seed uses upserts and preserves existing demo activity. Re-running it does
not reset bookings or refresh existing dated rides. Create a new ride if a
seeded departure has passed. Recurring journeys can be generated with:

```bash
npm run db:recurring
```

Schedule that command periodically when operating recurring carpools. Generation
preserves skipped dates and prevents duplicate occurrences.

## Checks

With the local database and development server running, and the demo seeded:

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:browser
```

Integration tests create temporary users, check persisted authorization and
booking workflows, and clean up their fixtures. Browser tests create a fresh
ride (cancelled after the test) and a registration account. Run these against a development
database.

Browser tests use `/usr/bin/google-chrome` by default. Set `CHROME_PATH` to your
installed Chrome executable on other systems. For example in PowerShell:

```powershell
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:browser
```

Stop the development server before building so the two processes do not share
the `.next` output directory:

```bash
npm run build
npm start
```

Production mode blocks demo accounts and disables local delivery simulation.
Use a separate account to test a production server.

## Configuration and current limits

- **Delivery:** With `DEV_SIMULATION=true` in development, phone codes and
  recovery links go to a private development inbox; no SMS or email is sent.
  Use `npm run dev:inbox -- email` for recovery links, or pass the profile's
  normalized phone number for phone codes. Production
  requires an HTTPS `DELIVERY_WEBHOOK_URL` and `DELIVERY_WEBHOOK_SECRET`. The
  webhook receives `{kind,to,text}` with Bearer authentication and must actually
  deliver the message. Without it, phone verification and recovery are unavailable.
- **Verification:** Uploaded documents are stored in `storage/private/` and
  served through authorized API requests. Review is manual; it does not query
  government, university or vehicle registries. Community approval does not
  grant institutional verification.
- **Maps and matching:** Preset places and numeric coordinates work without a
  geocoding service. `ROUTING_URL` accepts an OSRM-compatible road routing server.
  Without a working routing provider, the app labels straight-segment geometry
  as approximate. Matching measures route proximity, direction and time;
  it does not predict traffic or pickup ETAs. Tile URL and attribution are
  configured through `NEXT_PUBLIC_TILE_URL` and `NEXT_PUBLIC_TILE_ATTRIBUTION`.
- **Trips:** Location requires browser permission and a secure browser context
  (HTTPS or localhost). Updates operate while the app is open; background GPS
  tracking is not implemented. Share links expire and can be revoked. Trip
  completion clears recorded location updates.
- **Emergency panel:** Set `EMERGENCY_NUMBER` only after checking the relevant
  local number. The panel supports calling and sharing trip details; it does not
  dispatch emergency services.
- **Payments:** Contributions are recorded in PKR. No payment gateway, escrow,
  settlement or refund processor is connected.
- **PWA:** The manifest and service worker support installation and an offline
  fallback. Authenticated pages, API responses, documents and location data are
  not cached for offline use. Push notifications are not implemented.
- **Operations:** This app needs a Node.js server and PostgreSQL. Persist and
  back up both the database and `storage/private/`; local files require shared
  storage for multiple server instances. Production provider delivery, retention,
  monitoring and operational processes remain deployment work.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/components/SathRide.tsx` | Connected application screens |
| `src/app/api/[...path]/route.ts` | Application API and authorization |
| `src/lib/service.ts` | Booking, recurring journey and trip business logic |
| `src/lib/rules.ts` | Input validation, eligibility and geographic matching |
| `prisma/` | Schema, migrations and fictional development seed |
| `tests/` | Unit, database-backed integration and browser checks |
| `.env.example` | Configuration template |
| `TASKS.md` | Implementation and verification status |
