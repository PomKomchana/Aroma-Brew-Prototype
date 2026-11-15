-- 01 helpers (used by other functions, not called from the app)
-- Small building blocks. assert_role is the permission check that nearly every staff function starts with.

-- checks that the employee exists, is active and has one of the allowed roles; raises an error if not
create or replace function assert_role(p_emp int, p_roles text[]) returns employee
language plpgsql security definer set search_path = public as $$
declare e employee%rowtype;
begin
  select * into e from employee where employee_id = p_emp and status = 'active';
  if not found or not (e.role = any (p_roles)) then
    raise exception 'You do not have permission to do this';
  end if;
  return e;
end $$;
  
-- writes one row to audit_log
create or replace function log_audit(p_emp int, p_action text, p_table text, p_record int, p_old text, p_new text)
returns void language sql security definer set search_path = public as $$
  insert into audit_log (employee_id, action, table_name, record_id, old_value, new_value)
  values (p_emp, p_action, p_table, p_record, p_old, p_new);
$$;

-- average cost per unit: from received lots first, otherwise the supplier list price
create or replace function ingredient_unit_cost(p_ing int) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select sum(qty_received * unit_cost) / nullif(sum(qty_received), 0)
       from ingredient_lot where ingredient_id = p_ing and unit_cost is not null),
    (select avg(unit_price) from supplier_ingredient where ingredient_id = p_ing),
    0);
$$;

-- timestamp -> Bangkok local time, so day/month reports cut at local midnight
create or replace function to_local(ts timestamp) returns timestamp
language sql stable as $$
  select (ts at time zone current_setting('TimeZone')) at time zone 'Asia/Bangkok'
$$;
