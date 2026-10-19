-- 10: Roll back multi-method payment (split bill + reference no.)
-- 1) Remove the 7-argument checkout (with p_payments)
drop function if exists checkout(int, int, varchar, int, jsonb, varchar, jsonb);

-- 2) Restore the original single-method checkout (from 01_02)
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

-- 3) Restore the original get_orders (from 04): one payment method per bill
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

-- 4) Remove the reference number column
--    (any card / PromptPay reference numbers already saved are deleted with it)
alter table payment drop column if exists reference_no;
