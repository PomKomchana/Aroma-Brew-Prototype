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

create or replace function log_audit(p_emp int, p_action text, p_table text, p_record int, p_old text, p_new text)
returns void language sql security definer set search_path = public as $$
  insert into audit_log (employee_id, action, table_name, record_id, old_value, new_value)
  values (p_emp, p_action, p_table, p_record, p_old, p_new);
$$;

create or replace function ingredient_unit_cost(p_ing int) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select sum(qty_received * unit_cost) / nullif(sum(qty_received), 0)
       from ingredient_lot where ingredient_id = p_ing and unit_cost is not null),
    (select avg(unit_price) from supplier_ingredient where ingredient_id = p_ing),
    0);
$$;

create or replace function get_ingredients(p_emp int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform assert_role(p_emp, array['owner','stock']);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'ingredient_id', i.ingredient_id, 'name', i.name, 'unit', i.unit,
      'stock_qty', i.stock_qty, 'reorder_point', i.reorder_point,
      'expiry_alert_days', i.expiry_alert_days,
      'low', i.stock_qty < i.reorder_point,
      'nearest_expiry', x.nearest,
      'near_expiry', x.nearest is not null and x.nearest <= current_date + i.expiry_alert_days
    ) order by i.name)
    from ingredient i
    left join lateral (
      select min(expiry_date) as nearest from (
        select l.expiry_date,
               coalesce(sum(l.qty_received) over (order by l.lot_id desc rows between unbounded preceding and 1 preceding), 0) as before_qty
          from ingredient_lot l where l.ingredient_id = i.ingredient_id
      ) t where t.before_qty < i.stock_qty and t.expiry_date is not null
    ) x on true
  ), '[]'::jsonb);
end $$;

create or replace function receive_stock(
  p_emp int, p_ingredient int, p_qty numeric, p_unit_cost numeric, p_expiry date
) returns int
language plpgsql security definer set search_path = public as $$
declare e employee; v_lot int;
begin
  e := assert_role(p_emp, array['owner','stock']);
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than 0'; end if;
  if p_expiry is not null and p_expiry < current_date then raise exception 'Expiry date is already in the past'; end if;
  perform 1 from ingredient where ingredient_id = p_ingredient and branch_id = e.branch_id;
  if not found then raise exception 'Ingredient not found'; end if;

  insert into ingredient_lot (ingredient_id, qty_received, unit_cost, expiry_date)
  values (p_ingredient, p_qty, p_unit_cost, p_expiry) returning lot_id into v_lot;

  insert into stock_movement (branch_id, ingredient_id, movement_type, quantity_change, reference_type, reference_id, reason, employee_id)
  values (e.branch_id, p_ingredient, 'receive', p_qty, 'lot', v_lot, 'Goods received', p_emp);
  return v_lot;
end $$;

create or replace function count_stock(p_emp int, p_counts jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare e employee; c jsonb; v_cur numeric; v_new numeric; v_n int := 0; v_reason text;
begin
  e := assert_role(p_emp, array['owner','stock']);
  for c in select * from jsonb_array_elements(p_counts) loop
    v_new := (c->>'counted_qty')::numeric;
    v_reason := nullif(trim(coalesce(c->>'reason', '')), '');
    if v_new is null or v_new < 0 then raise exception 'Invalid counted quantity'; end if;

    select stock_qty into v_cur from ingredient
     where ingredient_id = (c->>'ingredient_id')::int and branch_id = e.branch_id for update;
    if not found then raise exception 'Ingredient not found'; end if;
    if v_new = v_cur then continue; end if;
    if v_reason is null then raise exception 'Please give a reason for every adjusted item'; end if;

    insert into stock_movement (branch_id, ingredient_id, movement_type, quantity_change, reference_type, reason, employee_id)
    values (e.branch_id, (c->>'ingredient_id')::int, 'adjust', v_new - v_cur, 'count', left(v_reason, 200), p_emp);
    perform log_audit(p_emp, 'Stock count adjustment', 'ingredient', (c->>'ingredient_id')::int, v_cur::text, v_new::text);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function get_stock_movements(p_emp int, p_ingredient int default null, p_limit int default 100)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform assert_role(p_emp, array['owner','stock']);
  return coalesce((
    select jsonb_agg(r) from (
      select m.movement_id, m.movement_date, i.name as ingredient, i.unit, m.movement_type,
             m.quantity_change, m.reason, m.reference_type, m.reference_id, emp.name as employee
        from stock_movement m
        join ingredient i using (ingredient_id)
        join employee emp on emp.employee_id = m.employee_id
       where p_ingredient is null or m.ingredient_id = p_ingredient
       order by m.movement_id desc limit least(p_limit, 500)
    ) r), '[]'::jsonb);
end $$;

create or replace function get_orders(p_emp int, p_from date, p_to date, p_shift int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e employee;
begin
  e := assert_role(p_emp, array['owner','cashier']);
  if e.role = 'cashier' and p_shift is null then raise exception 'Shift is required'; end if;
  if e.role = 'cashier' then
    perform 1 from shift where shift_id = p_shift and employee_id = p_emp;
    if not found then raise exception 'You do not have permission to do this'; end if;
  end if;
  return coalesce((
    select jsonb_agg(r order by r.order_id desc) from (
      select o.order_id, o.order_date, o.status, o.total_price, o.discount_amount, o.cancel_reason,
             o.customer_phone is not null as has_member, emp.name as cashier, o.shift_id,
             (select p.method from payment p where p.order_id = o.order_id limit 1) as method,
             (select string_agg(d.quantity || '× ' || pr.name || ' (' || d.size || ')', ', ' order by d.order_detail_id)
                from order_detail d join product pr using (product_id) where d.order_id = o.order_id) as items,
             (s.close_time is not null) as shift_closed
        from orders o
        join employee emp on emp.employee_id = o.employee_id
        join shift s on s.shift_id = o.shift_id
       where (p_shift is not null and o.shift_id = p_shift)
          or (p_shift is null and o.order_date::date between p_from and p_to)
       order by o.order_id desc limit 500
    ) r), '[]'::jsonb);
end $$;

create or replace function void_order(p_emp int, p_order int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare e employee; o orders%rowtype; v_open boolean; v_pts int;
begin
  e := assert_role(p_emp, array['owner','cashier']);
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Please give a reason'; end if;

  select * into o from orders where order_id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status = 'cancelled' then raise exception 'Order is already cancelled'; end if;

  select close_time is null into v_open from shift where shift_id = o.shift_id;
  if e.role = 'cashier' and not (v_open and o.employee_id = p_emp) then
    raise exception 'Only the owner can cancel a bill after the shift is closed';
  end if;

  update orders set status = 'cancelled', cancel_reason = left(trim(p_reason), 200) where order_id = p_order;

  insert into stock_movement (branch_id, ingredient_id, movement_type, quantity_change, reference_type, reference_id, reason, employee_id)
  select branch_id, ingredient_id, 'return', -sum(quantity_change), 'order', p_order, 'Order cancelled', p_emp
    from stock_movement
   where reference_type = 'order' and reference_id = p_order and movement_type = 'sale'
   group by branch_id, ingredient_id
  having sum(quantity_change) <> 0;

  if o.customer_phone is not null then
    select coalesce(sum(points), 0) into v_pts from point_transaction
     where order_id = p_order and transaction_type = 'earn';
    if v_pts > 0 then
      insert into point_transaction (customer_phone, order_id, transaction_type, points)
      values (o.customer_phone, p_order, 'adjust', -v_pts);
      update customer set points = greatest(points - v_pts, 0) where phone_number = o.customer_phone;
    end if;
  end if;

  perform log_audit(p_emp, 'Cancel bill', 'orders', p_order, 'paid ' || o.total_price, 'cancelled: ' || left(trim(p_reason), 100));
end $$;

create or replace function get_dashboard(p_emp int, p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sales numeric; v_orders int; v_disc numeric; v_cost numeric; v_by_day jsonb; v_top jsonb; v_by_method jsonb; v_value numeric; v_low int;
begin
  perform assert_role(p_emp, array['owner']);
  if p_to - p_from > 366 then raise exception 'Date range is too long'; end if;

  select coalesce(sum(total_price),0), count(*), coalesce(sum(discount_amount),0)
    into v_sales, v_orders, v_disc
    from orders where status = 'paid' and order_date::date between p_from and p_to;

  -- sale + return ของออเดอร์ในช่วงนี้ (บิลที่ยกเลิกหักล้างกันเอง)
  select coalesce(sum(-m.quantity_change * ingredient_unit_cost(m.ingredient_id)), 0) into v_cost
    from stock_movement m join orders o on o.order_id = m.reference_id
   where m.reference_type = 'order' and m.movement_type in ('sale','return')
     and o.order_date::date between p_from and p_to;

  select jsonb_agg(jsonb_build_object('day', d::date, 'sales', coalesce(s.sales, 0), 'orders', coalesce(s.n, 0)) order by d)
    into v_by_day
    from generate_series(p_from, p_to, interval '1 day') d
    left join (select order_date::date as dd, sum(total_price) as sales, count(*) as n
                 from orders where status = 'paid' group by 1) s on s.dd = d::date;

  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_top from (
    select pr.name, sum(d.quantity)::int as qty,
           sum(d.quantity * (d.price + coalesce((select sum(m.price_at_sale) from order_detail_modifier m where m.order_detail_id = d.order_detail_id), 0))) as revenue
      from order_detail d join orders o using (order_id) join product pr using (product_id)
     where o.status = 'paid' and o.order_date::date between p_from and p_to
     group by pr.name order by qty desc limit 5) r;

  select coalesce(jsonb_object_agg(method, amt), '{}'::jsonb) into v_by_method from (
    select p.method, sum(p.amount) as amt from payment p join orders o using (order_id)
     where o.status = 'paid' and o.order_date::date between p_from and p_to group by 1) t;

  select coalesce(sum(stock_qty * ingredient_unit_cost(ingredient_id)), 0), count(*) filter (where stock_qty < reorder_point)
    into v_value, v_low from ingredient;

  return jsonb_build_object('sales', v_sales, 'orders', v_orders, 'discount', v_disc, 'cost', v_cost,
    'profit', v_sales - v_cost, 'by_day', v_by_day, 'top_products', v_top, 'by_method', v_by_method,
    'stock_value', v_value, 'low_stock', v_low);
end $$;

create or replace function get_products_admin(p_emp int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform assert_role(p_emp, array['owner']);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'product_id', p.product_id, 'name', p.name, 'category', p.category, 'price', p.price,
      'image', p.image, 'is_active', p.is_active,
      'recipes', coalesce((select jsonb_agg(jsonb_build_object('size', r.size, 'ingredient_id', r.ingredient_id, 'qty_per_serve', r.qty_per_serve) order by r.size, r.ingredient_id)
                             from recipe r where r.product_id = p.product_id), '[]'::jsonb)
    ) order by p.product_id) from product p), '[]'::jsonb);
end $$;

create or replace function upsert_product(p_emp int, p_product jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_id int; v_old product%rowtype; r jsonb;
begin
  perform assert_role(p_emp, array['owner']);
  if nullif(trim(p_product->>'name'), '') is null then raise exception 'Product name is required'; end if;
  if (p_product->>'price')::numeric < 0 then raise exception 'Price must not be negative'; end if;

  v_id := nullif(p_product->>'product_id', '')::int;
  if v_id is null then
    insert into product (name, category, price, image, is_active)
    values (trim(p_product->>'name'), p_product->>'category', (p_product->>'price')::numeric,
            nullif(p_product->>'image', ''), coalesce((p_product->>'is_active')::boolean, true))
    returning product_id into v_id;
    perform log_audit(p_emp, 'Create product', 'product', v_id, null, p_product->>'name');
  else
    select * into v_old from product where product_id = v_id;
    if not found then raise exception 'Product not found'; end if;
    update product set name = trim(p_product->>'name'), category = p_product->>'category',
           price = (p_product->>'price')::numeric, image = nullif(p_product->>'image', ''),
           is_active = coalesce((p_product->>'is_active')::boolean, true)
     where product_id = v_id;
    if v_old.price <> (p_product->>'price')::numeric then
      perform log_audit(p_emp, 'Change price', 'product', v_id, v_old.price::text, p_product->>'price');
    end if;
    if v_old.is_active <> coalesce((p_product->>'is_active')::boolean, true) then
      perform log_audit(p_emp, 'Toggle product availability', 'product', v_id, v_old.is_active::text, p_product->>'is_active');
    end if;
  end if;

  delete from recipe where product_id = v_id;
  for r in select * from jsonb_array_elements(coalesce(p_product->'recipes', '[]'::jsonb)) loop
    insert into recipe (product_id, size, ingredient_id, qty_per_serve)
    values (v_id, r->>'size', (r->>'ingredient_id')::int, (r->>'qty_per_serve')::numeric);
  end loop;
  perform log_audit(p_emp, 'Update recipe', 'product', v_id, null, jsonb_array_length(coalesce(p_product->'recipes', '[]'::jsonb)) || ' recipe rows');
  return v_id;
end $$;

create or replace function list_employees(p_emp int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform assert_role(p_emp, array['owner']);
  return coalesce((select jsonb_agg(jsonb_build_object('employee_id', employee_id, 'name', name, 'role', role, 'status', status) order by employee_id)
                     from employee), '[]'::jsonb);
end $$;

create or replace function upsert_employee(p_emp int, p_data jsonb) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare o employee; v_id int; v_old employee%rowtype; v_pw text;
begin
  o := assert_role(p_emp, array['owner']);
  v_pw := nullif(p_data->>'password', '');
  if nullif(trim(p_data->>'name'), '') is null then raise exception 'Name is required'; end if;
  if v_pw is not null and length(v_pw) < 6 then raise exception 'Password must be at least 6 characters'; end if;

  v_id := nullif(p_data->>'employee_id', '')::int;
  if v_id is null then
    if v_pw is null then raise exception 'Password is required for a new employee'; end if;
    insert into employee (branch_id, name, role, password_hash, status)
    values (o.branch_id, trim(p_data->>'name'), p_data->>'role', crypt(v_pw, gen_salt('bf')), coalesce(p_data->>'status', 'active'))
    returning employee_id into v_id;
    perform log_audit(p_emp, 'Create employee', 'employee', v_id, null, (p_data->>'name') || ' / ' || (p_data->>'role'));
  else
    select * into v_old from employee where employee_id = v_id and branch_id = o.branch_id;
    if not found then raise exception 'Employee not found'; end if;
    if v_id = p_emp and (p_data->>'role' <> 'owner' or coalesce(p_data->>'status', 'active') <> 'active') then
      raise exception 'You cannot demote or deactivate your own account';
    end if;
    update employee set name = trim(p_data->>'name'), role = p_data->>'role', status = coalesce(p_data->>'status', 'active'),
           password_hash = case when v_pw is null then password_hash else crypt(v_pw, gen_salt('bf')) end
     where employee_id = v_id;
    perform log_audit(p_emp, 'Update employee', 'employee', v_id,
      v_old.role || ' / ' || v_old.status,
      (p_data->>'role') || ' / ' || coalesce(p_data->>'status', 'active') || case when v_pw is null then '' else ' / password reset' end);
  end if;
  return v_id;
end $$;

create or replace function list_promotions(p_emp int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform assert_role(p_emp, array['owner']);
  return coalesce((select jsonb_agg(to_jsonb(p) order by promotion_id desc) from promotion p), '[]'::jsonb);
end $$;

create or replace function upsert_promotion(p_emp int, p_data jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_id int;
begin
  perform assert_role(p_emp, array['owner']);
  v_id := nullif(p_data->>'promotion_id', '')::int;
  if v_id is null then
    insert into promotion (name, discount_type, value, condition, start_date, end_date, status)
    values (trim(p_data->>'name'), p_data->>'discount_type', (p_data->>'value')::numeric, nullif(p_data->>'condition', ''),
            (p_data->>'start_date')::date, (p_data->>'end_date')::date, coalesce(p_data->>'status', 'active'))
    returning promotion_id into v_id;
    perform log_audit(p_emp, 'Create promotion', 'promotion', v_id, null, p_data->>'name');
  else
    update promotion set name = trim(p_data->>'name'), discount_type = p_data->>'discount_type', value = (p_data->>'value')::numeric,
           condition = nullif(p_data->>'condition', ''), start_date = (p_data->>'start_date')::date,
           end_date = (p_data->>'end_date')::date, status = coalesce(p_data->>'status', 'active')
     where promotion_id = v_id;
    if not found then raise exception 'Promotion not found'; end if;
    perform log_audit(p_emp, 'Update promotion', 'promotion', v_id, null, p_data->>'name');
  end if;
  return v_id;
end $$;

create or replace function get_audit_log(p_emp int, p_limit int default 200) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform assert_role(p_emp, array['owner']);
  return coalesce((
    select jsonb_agg(r) from (
      select a.log_id, a.created_at, e.name as employee, a.action, a.table_name, a.record_id, a.old_value, a.new_value
        from audit_log a join employee e using (employee_id)
       order by a.log_id desc limit least(p_limit, 1000)) r), '[]'::jsonb);
end $$;

insert into supplier (name, contact_name, phone_number)
select 'Default Supplier', 'Sales', '0800000000' where not exists (select 1 from supplier);
insert into supplier_ingredient (supplier_id, ingredient_id, unit_price, lead_time_days)
select (select min(supplier_id) from supplier), i.ingredient_id,
       case i.name when 'Coffee Beans' then 0.80 when 'Fresh Milk' then 0.04 when 'Simple Syrup' then 0.05
                   when 'Green Tea Powder' then 2.50 when 'Oat Milk' then 0.09 else 20 end, 3
  from ingredient i
on conflict do nothing;
