**English** | [ไทย](README.th.md)

# database

PostgreSQL schema for Aroma Brew (Supabase). Every object is defined once, in its final form.

The web app does not write to tables directly. It calls the functions in `functions/` through `supabase.rpc()`, and the database enforces the rules (stock, permissions, audit).

## Folders and run order

```
schema/     tables, indexes, triggers, views
functions/  all logic the app calls through rpc
security/   RLS and function permissions
seed/       demo data
```

Run in this order: **schema → functions → security → seed**, and by file number inside each folder. Tables reference each other with foreign keys, so a different order fails.

### schema/

| File | Contents |
|---|---|
| 01_extensions | pgcrypto (password hashing) |
| 02_tables_core | branch, employee, shift, attendance, work_schedule |
| 03_tables_menu | product, ingredient, recipe, modifier, modifier_ingredient |
| 04_tables_inventory | supplier, supplier_ingredient, purchase_order, po_detail, ingredient_lot, stock_movement |
| 05_tables_sales | customer, promotion, orders, order_detail, order_detail_modifier, payment, point_transaction |
| 06_tables_system | audit_log, member_otp, member_session, offline_order_log |
| 07_tables_preorder | preorder_setting, preorder, preorder_item, preorder_item_modifier |
| 08_indexes | indexes |
| 09_triggers_views | stock deduction trigger, `stock_qty` guard, append-only logs, `v_stock_check` |

### functions/

| File | About |
|---|---|
| 01_helpers | `assert_role` (permission check), `log_audit`, ingredient cost, Bangkok time conversion |
| 02_auth_employee | login, employee management |
| 03_shift_pos | open/close shift, `checkout`, member lookup, bill list, cancel bill |
| 04_offline_sync | sync bills sold while offline |
| 05_stock | stock levels, alerts, receiving, stock count |
| 06_purchasing | suppliers, purchase orders, receiving against a PO |
| 07_products_promotions | products and recipes, promotions |
| 08_reports | dashboard, sales report, audit log |
| 09_member_portal | OTP sign-in, member summary, branch list |
| 10_preorder | pre-orders (customer side, staff side, settings) |

All function files use `create or replace` and can be re-run.

### security/

- `01_rls` enables Row Level Security on every table. The browser can read only `product`, `modifier`, `recipe`, `ingredient` and active `promotion` rows directly. Everything else goes through a function.
- `02_grants` controls which functions the browser may call. Internal helpers (`assert_role`, `log_audit`, `take_stock_offline`, `ingredient_unit_cost`, `to_local` and the `preorder_*` helpers) are revoked from `anon` / `authenticated`. When you add a function that only other functions should call, revoke it here too. Supabase allows every function in `public` by default.

### seed/

- `01_base_data` branch, 3 demo accounts, ingredients with opening stock, menu, recipes, modifiers, sample customers, promotion
- `02_suppliers` two suppliers and their prices

Seed is not re-runnable (it would insert everything again).

## Setting up Supabase

1. Open **SQL Editor** → New query.
2. Paste each file in the order above and press Run (23 files).

To paste once instead, join the files first:

```bash
cat schema/*.sql functions/*.sql security/*.sql seed/*.sql > all.sql
```

(`all.sql` is only for sending to Supabase; don't commit it.)

### Starting over

`reset.sql` drops and recreates the whole `public` schema. It **deletes all data**, so use it only on a dev database. Then run everything again in the same order.

## Checking the setup

```sql
-- 0 rows expected. A row means stock_qty disagrees with the stock_movement history.
select * from v_stock_check;

-- 31 tables, all with RLS on
select count(*), bool_and(rowsecurity) from pg_tables where schemaname = 'public';

-- should return the employee as json
select login(2, 'cashier1234');
```

## Rules the database enforces

- **Stock changes only through `stock_movement`.** Insert a row and a trigger updates `ingredient.stock_qty`. Updating `stock_qty` directly raises an error.
- **`stock_movement` and `audit_log` are append-only.** Update and delete are blocked by a trigger. Fix a wrong entry with a correcting row.
- **`checkout` is one transaction:** bill, lines, modifiers, recipe-based stock deduction, promotion, payment and member points. If any step fails, everything rolls back.
- **A pre-order is not a bill.** `complete_preorder` calls `checkout` when the cashier collects payment, so stock, points, promotion and reports behave like a normal sale.
- **Staff functions take the employee id as their first argument** and check it with `assert_role`. Start any new staff function with `perform assert_role(p_emp, array[...])` (or `e := assert_role(...)` if you need the employee row).
- **Functions that read or write tables are `security definer`** with a fixed `search_path`. Keep `set search_path = public` (add `extensions` if you use `crypt()`).
