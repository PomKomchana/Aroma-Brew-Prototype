-- 09 triggers and views
-- These are the rules the database enforces by itself, whatever the app does.

-- 1) every stock_movement row updates the ingredient's stock_qty
create or replace function trg_apply_stock_movement() returns trigger
language plpgsql as $$
begin
  update ingredient
     set stock_qty = stock_qty + new.quantity_change
   where ingredient_id = new.ingredient_id;
  return new;
end $$;

create trigger apply_stock_movement
after insert on stock_movement
for each row execute function trg_apply_stock_movement();

-- 2) stock_movement and audit_log are append-only: no update, no delete
create or replace function trg_immutable() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only: update/delete is not allowed', tg_table_name;
end $$;

create trigger stock_movement_immutable before update or delete on stock_movement
for each row execute function trg_immutable();
create trigger audit_log_immutable before update or delete on audit_log
for each row execute function trg_immutable();

-- 3) nobody can change ingredient.stock_qty directly.
--    The trigger in (1) runs one level deep, so depth >= 2 means "this came from the ledger".
create or replace function trg_guard_stock_qty() returns trigger
language plpgsql as $$
begin
  if new.stock_qty is distinct from old.stock_qty and pg_trigger_depth() < 2 then
    raise exception 'stock_qty can only change through stock_movement';
  end if;
  return new;
end $$;

create trigger guard_stock_qty before update on ingredient
for each row execute function trg_guard_stock_qty();

-- consistency check: should return 0 rows. If it doesn't, stock_qty and the ledger disagree.
create view v_stock_check as
select i.ingredient_id, i.name, i.stock_qty,
       coalesce(sum(m.quantity_change), 0) as movement_sum
from ingredient i
left join stock_movement m using (ingredient_id)
group by i.ingredient_id, i.name, i.stock_qty
having i.stock_qty <> coalesce(sum(m.quantity_change), 0);
