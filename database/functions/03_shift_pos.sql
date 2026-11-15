-- 03 shift, POS and bills
-- Open shift -> sell -> close shift (S02-S09).

-- one open shift per employee at a time
create or replace function open_shift(p_employee_id int, p_opening_cash numeric) returns int
language plpgsql security definer set search_path = public as $$
declare v_id int;
begin
  perform 1 from shift where employee_id = p_employee_id and close_time is null;
  if found then raise exception 'There is already an open shift'; end if;
  insert into shift (employee_id, opening_cash) values (p_employee_id, p_opening_cash)
  returning shift_id into v_id;
  return v_id;
end $$;

create or replace function get_open_shift(p_employee_id int) returns int
language sql security definer set search_path = public as $$
  select shift_id from shift
   where employee_id = p_employee_id and close_time is null
   order by open_time desc limit 1;
$$;

-- counts expected cash (opening cash + cash sales) against the counted cash
create or replace function close_shift(p_shift_id int, p_counted_cash numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_open numeric; v_sales numeric; v_cash numeric; v_expected numeric;
begin
  select opening_cash into v_open from shift where shift_id = p_shift_id and close_time is null;
  if not found then raise exception 'Shift not found or already closed'; end if;

  select coalesce(sum(o.total_price), 0) into v_sales
    from orders o where o.shift_id = p_shift_id and o.status = 'paid';
  select coalesce(sum(p.amount), 0) into v_cash
    from payment p join orders o using (order_id)
   where o.shift_id = p_shift_id and o.status = 'paid' and p.method = 'cash';

  v_expected := v_open + v_cash;
  update shift set close_time = now(), total_sales = v_sales, counted_cash = p_counted_cash,
                   cash_diff = p_counted_cash - v_expected
   where shift_id = p_shift_id;

  return jsonb_build_object(
    'total_sales', v_sales, 'cash_sales', v_cash, 'expected_cash', v_expected,
    'counted_cash', p_counted_cash, 'cash_diff', p_counted_cash - v_expected
  );
end $$;

-- sales of a shift split by payment method (close-shift screen)
create or replace function get_shift_summary(p_shift_id int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s shift%rowtype; v_orders int; v_total numeric; v_by jsonb;
begin
  select * into s from shift where shift_id = p_shift_id;
  if not found then raise exception 'Shift not found'; end if;

  select count(*), coalesce(sum(total_price),0) into v_orders, v_total
    from orders where shift_id = p_shift_id and status = 'paid';

  select coalesce(jsonb_object_agg(method, amt), '{}'::jsonb) into v_by from (
    select p.method, sum(p.amount) as amt
      from payment p join orders o using (order_id)
     where o.shift_id = p_shift_id and o.status = 'paid'
     group by p.method) t;

  return jsonb_build_object(
    'shift_id', s.shift_id, 'open_time', s.open_time, 'opening_cash', s.opening_cash,
    'orders', v_orders, 'total_sales', v_total, 'by_method', v_by,
    'closed', s.close_time is not null);
end $$;

-- looks a member up by phone; returns the phone masked (08x-xxx-5678) because customer is behind RLS
create or replace function find_member(p_phone varchar) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c customer%rowtype;
begin
  select * into c from customer where phone_number = p_phone;
  if not found then return null; end if;
  return jsonb_build_object(
    'phone_number', c.phone_number,
    'masked_phone', substr(c.phone_number,1,2) || 'x-xxx-' || right(c.phone_number,4),
    'name', c.name,
    'points', c.points,
    'tier', c.membership_tier);
end $$;

-- the main sale transaction: bill + order lines + modifiers + recipe-based stock deduction + promotion + payment + member points, all in one call. Any error rolls back everything
create or replace function checkout(
  p_employee_id    int,
  p_shift_id       int,
  p_customer_phone varchar,
  p_promotion_id   int,
  p_items          jsonb,
  p_method         varchar
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_branch int; v_order_id int; v_item jsonb; v_prod product%rowtype;
  v_detail_id int; v_mod_id int; v_mod_price numeric;
  v_qty int; v_size varchar; v_line numeric;
  v_subtotal numeric := 0; v_discount numeric := 0; v_total numeric; v_pts int;
  v_promo promotion%rowtype;
begin
  select branch_id into v_branch from employee
   where employee_id = p_employee_id and status = 'active';
  if not found then raise exception 'Employee not found or account is inactive'; end if;

  perform 1 from shift where shift_id = p_shift_id and employee_id = p_employee_id and close_time is null;
  if not found then raise exception 'This shift is not open'; end if;

  if p_customer_phone is not null then
    perform 1 from customer where phone_number = p_customer_phone;
    if not found then raise exception 'No member found with this phone number'; end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  insert into orders (branch_id, shift_id, customer_phone, employee_id)
  values (v_branch, p_shift_id, p_customer_phone, p_employee_id)
  returning order_id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty  := (v_item->>'quantity')::int;
    v_size := coalesce(v_item->>'size', 'M');
    if v_qty is null or v_qty <= 0 then raise exception 'Invalid quantity'; end if;

    select * into v_prod from product
     where product_id = (v_item->>'product_id')::int and is_active;
    if not found then raise exception 'Product not found or no longer on sale'; end if;

    insert into order_detail (order_id, product_id, size, quantity, price)
    values (v_order_id, v_prod.product_id, v_size, v_qty, v_prod.price)
    returning order_detail_id into v_detail_id;

    v_line := v_prod.price;

    insert into stock_movement (branch_id, ingredient_id, movement_type, quantity_change, reference_type, reference_id, movement_date, employee_id)
    select v_branch, r.ingredient_id, 'sale', -(r.qty_per_serve * v_qty),
           'order', v_order_id, now(), p_employee_id
      from recipe r
     where r.product_id = v_prod.product_id and r.size = v_size;

    for v_mod_id in
      select (jsonb_array_elements_text(coalesce(v_item->'modifier_ids', '[]'::jsonb)))::int
    loop
      select extra_price into v_mod_price from modifier where modifier_id = v_mod_id;
      if not found then raise exception 'Modifier % not found', v_mod_id; end if;

      insert into order_detail_modifier (order_detail_id, modifier_id, price_at_sale)
      values (v_detail_id, v_mod_id, v_mod_price);
      v_line := v_line + v_mod_price;

      insert into stock_movement (branch_id, ingredient_id, movement_type, quantity_change, reference_type, reference_id, movement_date, employee_id)
      select v_branch, mi.ingredient_id, 'sale', -(mi.extra_qty * v_qty),
             'order', v_order_id, now(), p_employee_id
        from modifier_ingredient mi
       where mi.modifier_id = v_mod_id;
    end loop;

    v_subtotal := v_subtotal + v_line * v_qty;
  end loop;

  if p_promotion_id is not null then
    select * into v_promo from promotion
     where promotion_id = p_promotion_id and status = 'active'
       and current_date between start_date and end_date;
    if not found then raise exception 'This promotion is not available'; end if;
    v_discount := case v_promo.discount_type
                    when 'percent' then round(v_subtotal * v_promo.value / 100, 2)
                    else v_promo.value end;
    v_discount := least(v_discount, v_subtotal);
  end if;
  v_total := v_subtotal - v_discount;

  update orders set promotion_id = p_promotion_id, discount_amount = v_discount, total_price = v_total
   where order_id = v_order_id;

  insert into payment (order_id, method, amount) values (v_order_id, p_method, v_total);

  if p_customer_phone is not null then
    v_pts := floor(v_total / 50);
    if v_pts > 0 then
      insert into point_transaction (customer_phone, order_id, transaction_type, points)
      values (p_customer_phone, v_order_id, 'earn', v_pts);
      update customer set points = points + v_pts where phone_number = p_customer_phone;
    end if;
  end if;

  return v_order_id;
end $$;

-- bill list. A cashier only sees the bills of their own shift; the owner can search by date
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

-- cancel a bill: puts the stock back (return movements), takes the earned points back, writes the audit log. A cashier can only cancel while their shift is still open
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
