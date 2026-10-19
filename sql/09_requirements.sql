-- 09: Requirements batch
alter table employee drop constraint if exists employee_status_check;
alter table employee add constraint employee_status_check check (status in ('active','inactive','deleted'));

alter table purchase_order drop constraint if exists purchase_order_status_check;
alter table purchase_order add constraint purchase_order_status_check
  check (status in ('draft','sent','partial','received','cancelled'));
alter table purchase_order add column if not exists expected_date date;
alter table purchase_order add column if not exists note varchar(200);
alter table purchase_order add column if not exists sent_at timestamp;
alter table purchase_order add column if not exists closed_at timestamp;

alter table supplier add column if not exists is_active boolean not null default true;
alter table ingredient_lot add column if not exists received_at timestamp not null default now();

create index if not exists purchase_order_status_idx on purchase_order (status);
create index if not exists ingredient_lot_po_idx on ingredient_lot (po_id);

-- 2. Stock alerts
create or replace function get_stock_alerts(p_emp int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_all jsonb; v_low jsonb; v_exp jsonb; v_count int;
begin
  perform assert_role(p_emp, array['owner','stock']);
  v_all := get_ingredients(p_emp);

  select coalesce(jsonb_agg(jsonb_build_object(
           'ingredient_id', x->'ingredient_id', 'name', x->'name', 'unit', x->'unit',
           'stock_qty', x->'stock_qty', 'reorder_point', x->'reorder_point',
           'level', case when (x->>'stock_qty')::numeric <= 0 then 'out' else 'low' end
         ) order by (x->>'stock_qty')::numeric / nullif((x->>'reorder_point')::numeric, 0), x->>'name'), '[]'::jsonb)
    into v_low
    from jsonb_array_elements(v_all) x
   where (x->>'low')::boolean or (x->>'stock_qty')::numeric <= 0;

  select coalesce(jsonb_agg(jsonb_build_object(
           'ingredient_id', x->'ingredient_id', 'name', x->'name', 'unit', x->'unit',
           'stock_qty', x->'stock_qty', 'nearest_expiry', x->'nearest_expiry'
         ) order by x->>'nearest_expiry'), '[]'::jsonb)
    into v_exp
    from jsonb_array_elements(v_all) x
   where (x->>'near_expiry')::boolean;

  select count(*) into v_count from jsonb_array_elements(v_all) x
   where (x->>'low')::boolean or (x->>'near_expiry')::boolean or (x->>'stock_qty')::numeric <= 0;

  return jsonb_build_object('count', v_count, 'low', v_low, 'near_expiry', v_exp);
end $$;

-- The alert thresholds had no screen before; this lets owner/stock tune them.
create or replace function set_reorder_point(p_emp int, p_ingredient int, p_reorder numeric, p_expiry_days int)
returns void language plpgsql security definer set search_path = public as $$
declare e employee; i ingredient%rowtype;
begin
  e := assert_role(p_emp, array['owner','stock']);
  if p_reorder is null or p_reorder < 0 then raise exception 'Reorder point must not be negative'; end if;
  if p_expiry_days is null or p_expiry_days < 0 or p_expiry_days > 365 then raise exception 'Expiry alert days must be between 0 and 365'; end if;
  select * into i from ingredient where ingredient_id = p_ingredient and branch_id = e.branch_id;
  if not found then raise exception 'Ingredient not found'; end if;
  update ingredient set reorder_point = p_reorder, expiry_alert_days = p_expiry_days where ingredient_id = p_ingredient;
  if i.reorder_point <> p_reorder or i.expiry_alert_days <> p_expiry_days then
    perform log_audit(p_emp, 'Change alert thresholds', 'ingredient', p_ingredient,
      i.reorder_point || ' / ' || i.expiry_alert_days || 'd', p_reorder || ' / ' || p_expiry_days || 'd');
  end if;
end $$;

-- 3. Employees: owner can delete cashier / stock accounts
create or replace function delete_employee(p_emp int, p_target int) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare o employee; t employee%rowtype; v_result text;
begin
  o := assert_role(p_emp, array['owner']);
  if p_target = p_emp then raise exception 'You cannot delete your own account'; end if;

  select * into t from employee where employee_id = p_target and branch_id = o.branch_id and status <> 'deleted';
  if not found then raise exception 'Employee not found'; end if;
  if t.role not in ('cashier','stock') then raise exception 'Only cashier and stock accounts can be deleted'; end if;

  perform 1 from shift where employee_id = p_target and close_time is null;
  if found then raise exception 'This cashier still has an open shift. Close the shift first.'; end if;

  begin
    delete from employee where employee_id = p_target;
    v_result := 'deleted';
  exception when foreign_key_violation then
    update employee set status = 'deleted', password_hash = crypt(gen_random_uuid()::text, gen_salt('bf'))
     where employee_id = p_target;
    v_result := 'archived';
  end;

  perform log_audit(p_emp, 'Delete employee', 'employee', p_target, t.name || ' / ' || t.role || ' / ' || t.status, v_result);
  return v_result;
end $$;

create or replace function list_employees(p_emp int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform assert_role(p_emp, array['owner']);
  return coalesce((select jsonb_agg(jsonb_build_object('employee_id', employee_id, 'name', name, 'role', role, 'status', status) order by employee_id)
                     from employee where status <> 'deleted'), '[]'::jsonb);
end $$;

-- Same as 04 plus: deleted accounts cannot be edited/revived, and status can only be active/inactive
create or replace function upsert_employee(p_emp int, p_data jsonb) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare o employee; v_id int; v_old employee%rowtype; v_pw text; v_status text;
begin
  o := assert_role(p_emp, array['owner']);
  v_pw := nullif(p_data->>'password', '');
  v_status := coalesce(p_data->>'status', 'active');
  if nullif(trim(p_data->>'name'), '') is null then raise exception 'Name is required'; end if;
  if v_status not in ('active','inactive') then raise exception 'Invalid status'; end if;
  if v_pw is not null and length(v_pw) < 6 then raise exception 'Password must be at least 6 characters'; end if;

  v_id := nullif(p_data->>'employee_id', '')::int;
  if v_id is null then
    if v_pw is null then raise exception 'Password is required for a new employee'; end if;
    insert into employee (branch_id, name, role, password_hash, status)
    values (o.branch_id, trim(p_data->>'name'), p_data->>'role', crypt(v_pw, gen_salt('bf')), v_status)
    returning employee_id into v_id;
    perform log_audit(p_emp, 'Create employee', 'employee', v_id, null, (p_data->>'name') || ' / ' || (p_data->>'role'));
  else
    select * into v_old from employee where employee_id = v_id and branch_id = o.branch_id and status <> 'deleted';
    if not found then raise exception 'Employee not found'; end if;
    if v_id = p_emp and (p_data->>'role' <> 'owner' or v_status <> 'active') then
      raise exception 'You cannot demote or deactivate your own account';
    end if;
    update employee set name = trim(p_data->>'name'), role = p_data->>'role', status = v_status,
           password_hash = case when v_pw is null then password_hash else crypt(v_pw, gen_salt('bf')) end
     where employee_id = v_id;
    perform log_audit(p_emp, 'Update employee', 'employee', v_id,
      v_old.role || ' / ' || v_old.status,
      (p_data->>'role') || ' / ' || v_status || case when v_pw is null then '' else ' / password reset' end);
  end if;
  return v_id;
end $$;

-- 5. Sales report (hour / day / month buckets over a chosen period)
create or replace function to_local(ts timestamp) returns timestamp
language sql stable as $$
  select (ts at time zone current_setting('TimeZone')) at time zone 'Asia/Bangkok'
$$;

create or replace function get_sales_report(p_emp int, p_from date, p_to date, p_group text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sales numeric; v_orders int; v_disc numeric; v_cost numeric; v_cancelled int; v_cancelled_amt numeric;
  v_buckets jsonb; v_top jsonb; v_method jsonb;
begin
  perform assert_role(p_emp, array['owner']);
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Invalid date range'; end if;
  if p_group not in ('hour','day','month') then raise exception 'Invalid grouping'; end if;
  if p_group = 'hour' and p_to - p_from > 31 then raise exception 'Hourly view supports up to 31 days'; end if;
  if p_group = 'day' and p_to - p_from > 400 then raise exception 'Daily view supports up to 400 days'; end if;
  if p_group = 'month' and p_to - p_from > 3700 then raise exception 'Date range is too long'; end if;

  select coalesce(sum(total_price) filter (where status = 'paid'), 0),
         count(*) filter (where status = 'paid'),
         coalesce(sum(discount_amount) filter (where status = 'paid'), 0),
         count(*) filter (where status = 'cancelled'),
         coalesce(sum(total_price) filter (where status = 'cancelled'), 0)
    into v_sales, v_orders, v_disc, v_cancelled, v_cancelled_amt
    from orders where to_local(order_date)::date between p_from and p_to;

  select coalesce(sum(-m.quantity_change * ingredient_unit_cost(m.ingredient_id)), 0) into v_cost
    from stock_movement m join orders o on o.order_id = m.reference_id
   where m.reference_type = 'order' and m.movement_type in ('sale','return')
     and to_local(o.order_date)::date between p_from and p_to;

  with paid as (
    select to_local(order_date) as l, total_price from orders
     where status = 'paid' and to_local(order_date)::date between p_from and p_to
  ), keys as (
    select case p_group
             when 'hour'  then lpad(h::text, 2, '0')
             when 'day'   then to_char(d, 'YYYY-MM-DD')
             else              to_char(d, 'YYYY-MM') end as k
      from (select generate_series(0, 23) as h, null::date as d where p_group = 'hour'
            union all
            select null, g::date from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g where p_group = 'day'
            union all
            select null, g::date from generate_series(date_trunc('month', p_from)::timestamp, date_trunc('month', p_to)::timestamp, interval '1 month') g where p_group = 'month') s
  ), agg as (
    select case p_group when 'hour' then lpad(extract(hour from l)::int::text, 2, '0')
                        when 'day'  then to_char(l, 'YYYY-MM-DD')
                        else             to_char(l, 'YYYY-MM') end as k,
           sum(total_price) as sales, count(*) as n
      from paid group by 1
  )
  select jsonb_agg(jsonb_build_object('key', keys.k, 'sales', coalesce(agg.sales, 0), 'orders', coalesce(agg.n, 0)) order by keys.k)
    into v_buckets
    from keys left join agg on agg.k = keys.k;

  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_top from (
    select pr.name, sum(d.quantity)::int as qty,
           sum(d.quantity * (d.price + coalesce((select sum(m.price_at_sale) from order_detail_modifier m where m.order_detail_id = d.order_detail_id), 0))) as revenue
      from order_detail d join orders o using (order_id) join product pr using (product_id)
     where o.status = 'paid' and to_local(o.order_date)::date between p_from and p_to
     group by pr.name order by qty desc, pr.name limit 5) r;

  select coalesce(jsonb_object_agg(method, amt), '{}'::jsonb) into v_method from (
    select p.method, sum(p.amount) as amt from payment p join orders o using (order_id)
     where o.status = 'paid' and to_local(o.order_date)::date between p_from and p_to group by 1) t;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'group', p_group,
    'sales', v_sales, 'orders', v_orders, 'discount', v_disc,
    'avg_bill', case when v_orders > 0 then round(v_sales / v_orders, 2) else 0 end,
    'cost', v_cost, 'profit', v_sales - v_cost,
    'cancelled', v_cancelled, 'cancelled_amount', v_cancelled_amt,
    'buckets', coalesce(v_buckets, '[]'::jsonb), 'top_products', v_top, 'by_method', v_method);
end $$;

-- 6. Suppliers and the ingredients each one delivers
create or replace function list_suppliers(p_emp int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform assert_role(p_emp, array['owner','stock']);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'supplier_id', s.supplier_id, 'name', s.name, 'contact_name', s.contact_name,
      'phone_number', s.phone_number, 'address', s.address, 'is_active', s.is_active,
      'ingredients', coalesce((
        select jsonb_agg(jsonb_build_object(
          'supplier_ingredient_id', si.supplier_ingredient_id, 'ingredient_id', si.ingredient_id,
          'ingredient', i.name, 'unit', i.unit, 'unit_price', si.unit_price, 'lead_time_days', si.lead_time_days
        ) order by i.name)
        from supplier_ingredient si join ingredient i using (ingredient_id)
        where si.supplier_id = s.supplier_id), '[]'::jsonb)
    ) order by s.is_active desc, s.name)
    from supplier s), '[]'::jsonb);
end $$;

create or replace function upsert_supplier(p_emp int, p_data jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  e employee; v_id int; v_item jsonb; v_ing int; v_price numeric; v_lead int; v_old numeric;
  v_ids int[] := '{}'; v_name text; v_phone text;
begin
  e := assert_role(p_emp, array['owner','stock']);
  v_name := nullif(trim(coalesce(p_data->>'name', '')), '');
  v_phone := nullif(trim(coalesce(p_data->>'phone_number', '')), '');
  if v_name is null then raise exception 'Supplier name is required'; end if;
  if length(v_name) > 100 then raise exception 'Supplier name is too long'; end if;
  if v_phone is not null and length(v_phone) > 15 then raise exception 'Phone number must be at most 15 characters'; end if;

  v_id := nullif(p_data->>'supplier_id', '')::int;
  if v_id is null then
    insert into supplier (name, contact_name, phone_number, address, is_active)
    values (v_name, nullif(trim(coalesce(p_data->>'contact_name', '')), ''), v_phone,
            nullif(trim(coalesce(p_data->>'address', '')), ''), coalesce((p_data->>'is_active')::boolean, true))
    returning supplier_id into v_id;
    perform log_audit(p_emp, 'Create supplier', 'supplier', v_id, null, v_name);
  else
    perform 1 from supplier where supplier_id = v_id for update;
    if not found then raise exception 'Supplier not found'; end if;
    update supplier set name = v_name, contact_name = nullif(trim(coalesce(p_data->>'contact_name', '')), ''),
           phone_number = v_phone, address = nullif(trim(coalesce(p_data->>'address', '')), ''),
           is_active = coalesce((p_data->>'is_active')::boolean, true)
     where supplier_id = v_id;
    perform log_audit(p_emp, 'Update supplier', 'supplier', v_id, null, v_name);
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_data->'ingredients', '[]'::jsonb)) loop
    v_ing := (v_item->>'ingredient_id')::int;
    v_price := (v_item->>'unit_price')::numeric;
    v_lead := nullif(v_item->>'lead_time_days', '')::int;
    if v_price is null or v_price < 0 then raise exception 'Unit price must not be negative'; end if;
    if v_lead is not null and v_lead < 0 then raise exception 'Lead time must not be negative'; end if;
    perform 1 from ingredient where ingredient_id = v_ing and branch_id = e.branch_id;
    if not found then raise exception 'Ingredient not found'; end if;
    if v_ing = any (v_ids) then raise exception 'The same ingredient is listed twice'; end if;
    v_ids := v_ids || v_ing;

    select unit_price into v_old from supplier_ingredient where supplier_id = v_id and ingredient_id = v_ing;
    insert into supplier_ingredient (supplier_id, ingredient_id, unit_price, lead_time_days)
    values (v_id, v_ing, v_price, v_lead)
    on conflict (supplier_id, ingredient_id) do update set unit_price = excluded.unit_price, lead_time_days = excluded.lead_time_days;
    if v_old is not null and v_old <> v_price then
      perform log_audit(p_emp, 'Change supplier price', 'supplier', v_id,
        (select name from ingredient where ingredient_id = v_ing) || ': ' || v_old, v_price::text);
    end if;
  end loop;

  delete from supplier_ingredient where supplier_id = v_id and not (ingredient_id = any (v_ids));
  return v_id;
end $$;

-- 7. Purchase orders
-- draft -> sent -> partial -> received      (draft/sent -> cancelled; partial can be closed short)
create or replace function save_po(p_emp int, p_data jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  e employee; v_id int; v_sup int; v_line jsonb; v_ing int; v_qty numeric; v_price numeric; v_list numeric;
  v_ids int[] := '{}'; v_total numeric := 0; v_status text; v_branch int;
begin
  e := assert_role(p_emp, array['owner','stock']);
  v_sup := (p_data->>'supplier_id')::int;
  perform 1 from supplier where supplier_id = v_sup and is_active;
  if not found then raise exception 'Supplier not found or inactive'; end if;
  if p_data->'lines' is null or jsonb_typeof(p_data->'lines') <> 'array' or jsonb_array_length(p_data->'lines') = 0 then
    raise exception 'Add at least one ingredient to the order';
  end if;
  if nullif(p_data->>'expected_date', '')::date < current_date then raise exception 'Expected date is in the past'; end if;

  v_id := nullif(p_data->>'po_id', '')::int;
  if v_id is null then
    insert into purchase_order (branch_id, supplier_id, employee_id, expected_date, note)
    values (e.branch_id, v_sup, p_emp, nullif(p_data->>'expected_date', '')::date, left(nullif(trim(coalesce(p_data->>'note', '')), ''), 200))
    returning po_id into v_id;
  else
    select status, branch_id into v_status, v_branch from purchase_order where po_id = v_id for update;
    if not found or v_branch <> e.branch_id then raise exception 'Purchase order not found'; end if;
    if v_status <> 'draft' then raise exception 'Only draft purchase orders can be edited'; end if;
    update purchase_order set supplier_id = v_sup, expected_date = nullif(p_data->>'expected_date', '')::date,
           note = left(nullif(trim(coalesce(p_data->>'note', '')), ''), 200)
     where po_id = v_id;
    delete from po_detail where po_id = v_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_data->'lines') loop
    v_ing := (v_line->>'ingredient_id')::int;
    v_qty := (v_line->>'qty_ordered')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Quantity must be greater than 0'; end if;
    if v_ing = any (v_ids) then raise exception 'The same ingredient is listed twice'; end if;
    v_ids := v_ids || v_ing;

    select unit_price into v_list from supplier_ingredient where supplier_id = v_sup and ingredient_id = v_ing;
    if not found then
      raise exception '% is not supplied by this supplier', coalesce((select name from ingredient where ingredient_id = v_ing), 'Ingredient');
    end if;
    v_price := coalesce(nullif(v_line->>'unit_price', '')::numeric, v_list);
    if v_price < 0 then raise exception 'Unit price must not be negative'; end if;

    insert into po_detail (po_id, ingredient_id, qty_ordered, unit_price) values (v_id, v_ing, v_qty, v_price);
    v_total := v_total + v_qty * v_price;
  end loop;

  update purchase_order set total_cost = round(v_total, 2) where po_id = v_id;
  perform log_audit(p_emp, case when p_data ? 'po_id' and nullif(p_data->>'po_id', '') is not null then 'Edit purchase order' else 'Create purchase order' end,
                    'purchase_order', v_id, null, 'total ' || round(v_total, 2));
  return v_id;
end $$;

create or replace function set_po_status(p_emp int, p_po int, p_status text) returns text
language plpgsql security definer set search_path = public as $$
declare e employee; po purchase_order%rowtype;
begin
  e := assert_role(p_emp, array['owner','stock']);
  select * into po from purchase_order where po_id = p_po and branch_id = e.branch_id for update;
  if not found then raise exception 'Purchase order not found'; end if;

  if po.status = 'draft' and p_status = 'sent' then
    update purchase_order set status = 'sent', sent_at = now() where po_id = p_po;
  elsif po.status in ('draft','sent') and p_status = 'cancelled' then
    update purchase_order set status = 'cancelled', closed_at = now() where po_id = p_po;
  elsif po.status = 'partial' and p_status = 'received' then
    update purchase_order set status = 'received', closed_at = now() where po_id = p_po;
  else
    raise exception 'Cannot change a % purchase order to %', po.status, p_status;
  end if;

  perform log_audit(p_emp, 'Purchase order status', 'purchase_order', p_po, po.status, p_status);
  return p_status;
end $$;

-- p_statuses null = all
create or replace function list_purchase_orders(p_emp int, p_statuses text[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e employee;
begin
  e := assert_role(p_emp, array['owner','stock']);
  return coalesce((
    select jsonb_agg(r order by r.po_id desc) from (
      select po.po_id, po.status, po.order_date, po.expected_date, po.note, po.sent_at, po.closed_at, po.total_cost,
             po.supplier_id, s.name as supplier, emp.name as created_by,
             coalesce((select jsonb_agg(jsonb_build_object(
               'po_detail_id', d.po_detail_id, 'ingredient_id', d.ingredient_id, 'ingredient', i.name, 'unit', i.unit,
               'qty_ordered', d.qty_ordered, 'qty_received', d.qty_received, 'unit_price', d.unit_price) order by d.po_detail_id)
               from po_detail d join ingredient i using (ingredient_id) where d.po_id = po.po_id), '[]'::jsonb) as lines,
             coalesce((select jsonb_agg(jsonb_build_object(
               'lot_id', l.lot_id, 'ingredient', i.name, 'unit', i.unit, 'qty_received', l.qty_received,
               'unit_cost', l.unit_cost, 'expiry_date', l.expiry_date, 'received_at', l.received_at) order by l.lot_id)
               from ingredient_lot l join ingredient i using (ingredient_id) where l.po_id = po.po_id), '[]'::jsonb) as receipts
        from purchase_order po
        join supplier s using (supplier_id)
        join employee emp on emp.employee_id = po.employee_id
       where po.branch_id = e.branch_id and (p_statuses is null or po.status = any (p_statuses))
       order by po.po_id desc limit 200
    ) r), '[]'::jsonb);
end $$;

-- p_lines: [{po_detail_id, qty_received, unit_cost, expiry_date}] - blank / 0 quantities are skipped.
-- Each line creates its own lot (so each delivery keeps its own cost and expiry) and a 'receive' movement.
create or replace function receive_po(p_emp int, p_po int, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e employee; po purchase_order%rowtype; v_line jsonb; d po_detail%rowtype; v_qty numeric; v_cost numeric;
  v_exp date; v_lot int; v_n int := 0; v_open int; v_status text;
begin
  e := assert_role(p_emp, array['owner','stock']);
  select * into po from purchase_order where po_id = p_po and branch_id = e.branch_id for update;
  if not found then raise exception 'Purchase order not found'; end if;
  if po.status not in ('sent','partial') then
    raise exception 'Goods can only be received against a sent purchase order (this one is %)', po.status;
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_qty := coalesce(nullif(v_line->>'qty_received', '')::numeric, 0);
    if v_qty = 0 then continue; end if;
    if v_qty < 0 then raise exception 'Quantity must be greater than 0'; end if;

    select * into d from po_detail where po_detail_id = (v_line->>'po_detail_id')::int and po_id = p_po for update;
    if not found then raise exception 'Line does not belong to this purchase order'; end if;

    v_cost := coalesce(nullif(v_line->>'unit_cost', '')::numeric, d.unit_price);
    if v_cost < 0 then raise exception 'Unit price must not be negative'; end if;
    v_exp := nullif(v_line->>'expiry_date', '')::date;
    if v_exp is not null and v_exp < current_date then raise exception 'Expiry date is already in the past'; end if;

    insert into ingredient_lot (ingredient_id, po_id, qty_received, unit_cost, expiry_date)
    values (d.ingredient_id, p_po, v_qty, v_cost, v_exp) returning lot_id into v_lot;

    insert into stock_movement (branch_id, ingredient_id, movement_type, quantity_change, reference_type, reference_id, reason, employee_id)
    values (e.branch_id, d.ingredient_id, 'receive', v_qty, 'lot', v_lot, 'Goods received (PO-' || lpad(p_po::text, 4, '0') || ')', p_emp);

    update po_detail set qty_received = qty_received + v_qty where po_detail_id = d.po_detail_id;

    if v_cost <> d.unit_price then
      perform log_audit(p_emp, 'PO receipt: price differs from order', 'purchase_order', p_po,
        (select name from ingredient where ingredient_id = d.ingredient_id) || ': ' || d.unit_price, v_cost::text);
    end if;
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then raise exception 'Enter a received quantity for at least one line'; end if;

  select count(*) into v_open from po_detail where po_id = p_po and qty_received < qty_ordered;
  v_status := case when v_open = 0 then 'received' else 'partial' end;
  update purchase_order set status = v_status, closed_at = case when v_open = 0 then now() else null end where po_id = p_po;

  return jsonb_build_object('status', v_status, 'lots', v_n);
end $$;

-- Seed: link the default supplier's ingredient list to the current catalogue (only if empty)
insert into supplier (name, contact_name, phone_number, address)
select 'Bean & Leaf Trading', 'Khun Ploy', '0891112222', 'Bangkok'
 where (select count(*) from supplier) <= 1 and not exists (select 1 from supplier where name = 'Bean & Leaf Trading');
insert into supplier_ingredient (supplier_id, ingredient_id, unit_price, lead_time_days)
select s.supplier_id, i.ingredient_id, case when i.name ilike '%matcha%' then 2.40 else 0.85 end, 2
  from supplier s, ingredient i
 where s.name = 'Bean & Leaf Trading' and (i.name ilike '%coffee%' or i.name ilike '%matcha%')
on conflict do nothing;
