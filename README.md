**English** | [ไทย](README.th.md)

# Aroma Brew

A café and bakery management system (POS + recipe-based stock), built for the CPE230 database design and management course.

Cashiers get a point-of-sale screen, stock staff get inventory and purchasing, the owner gets reports, and customers get a small website for browsing the menu, ordering ahead and checking their points.

## What it uses

- Frontend: React 18 + TypeScript + Vite
- Backend / DB: Supabase (PostgreSQL). The main logic lives in database functions and the web app calls them with `supabase.rpc()`
- Deploy: Vercel

There is no separate Node server. The important things (stock deduction, points, pricing) happen inside the database, so if any step fails the whole transaction rolls back. You never end up with a bill whose stock wasn't deducted.

## How to run

1. Create a project on Supabase.
2. Open the SQL Editor and run the files in `database/` in this order: **schema → functions → security → seed**. Details and a file-by-file guide are in [database/README.md](database/README.md).
3. Copy the Project URL and anon key from Project Settings → API into a `.env` file (start from `.env.example`).
4. Install and start:

```bash
npm install
npm run dev
```

For a deploy build use `npm run build` (set the same two env variables on Vercel).

## Test accounts

Log in at `/login` with employee ID + password.

| Employee ID | Password | Role |
|---|---|---|
| 1 | owner1234 | Owner |
| 2 | cashier1234 | Cashier |
| 3 | stock1234 | Stock clerk |

Sample customers: `0812345678`, `0898765432` (for the member site and pre-orders).

> These are demo credentials only. Change them before real use and remove the demo account buttons in `src/pages/Login.tsx`.

## Screens

S01–S18 refer to the screen numbers in the Submission 2 slides.

**Cashier**
- `/login` sign in (S01)
- `/shift` open shift (S02)
- `/pos` sell, pick modifiers, find a member, pay, receipt (S03–S07)
- `/orders` order queue, cancel a bill while the shift is still open (S08)
- `/close-shift` close shift and count cash (S09)
- `/preorders` handle pre-orders: start making → ready → collect and pay

**Stock (stock / owner)**
- `/stock` stock levels, receive goods, stock count, movement history, reorder points and low-stock alerts (S10–S12)
- `/suppliers` suppliers and the ingredients each one delivers
- `/purchasing` purchase orders: draft → sent → partial → received

**Owner**
- `/dashboard` (S13), `/products` products and recipes (S14), `/employees` (S15), `/promotions` (S16)
- `/reports` sales by day / month / year / custom period with CSV export, bill list and audit log (S17)

**Customer (no staff login)**
- `/`, `/menu`, `/allergens`, `/stores` menu, allergen info, branches
- `/signin` phone number + OTP, then points at `/rewards` / `/member` (S18)
- `/basket` → `/my-orders/:id` order ahead, then pay and pick up at the counter

**Other**
- Offline mode: if the internet drops while selling, bills are kept in the browser and sent up once the connection is back (NFR-04)

## Keeping the free Supabase project awake

Free Supabase projects are paused after about a week without database activity. `.github/workflows/keep-supabase-awake.yml` calls `get_branches()` once a day to prevent that. To turn it on, add two repository secrets (Settings → Secrets and variables → Actions): `SUPABASE_URL` and `SUPABASE_ANON_KEY`. You can test it from the Actions tab with "Run workflow".

GitHub stops scheduled workflows in a public repo after 60 days without any repo activity. If that happens, re-enable it from the Actions tab.

## Not done yet / known limits

- No screen for editing modifiers yet (they are changed directly in the database). It's missing from `/products`.
- OTP is demo only: the code is shown on screen, nothing is sent by SMS or LINE.
- Staff functions check permissions from the employee ID that is passed in (no Supabase Auth). That's fine for a prototype, but real use would need sessions / JWT.
- There is no screen for work schedules or clock-in, even though `attendance` and `work_schedule` are in the ERD.
- One payment method per bill (cash, card or PromptPay). Split payment isn't supported.

## Folder layout

```
database/   all the SQL (schema / functions / security / seed)
src/
  pages/      staff screens
  customer/   customer website
  components/ shared pieces
  lib/        Supabase calls, offline queue, helpers
  auth/       role checks
  i18n/
```
