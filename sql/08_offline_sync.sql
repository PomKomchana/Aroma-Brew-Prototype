-- 08: Offline mode (NFR-04)
create table if not exists offline_order_log (
  client_id   uuid primary key,
  order_id    int not null references orders,
  employee_id int not null references employee,
  offline_at  timestamp not null,
  synced_at   timestamp not null default now()
);
alter table offline_order_log enable row level security;

-- Deduct available stock only; return the shortage (0 = fully fulfilled)
create or replace function take_stock_offline(
  p_branch int, p_ingredient int, p_need numeric, p_order int, p_emp int, p_at timestamp
) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_have numeric; v_take numeric;
begin
  select stock_qty into v_have from ingredient where ingredient_id = p_ingredient for update;
  v_take := least(p_need, greatest(coalesce(v_have, 0), 0));
  if v_take > 0 then
    insert into stock_movement (branch_id, ingredient_id, movement_type, quantity_change, reference_type, reference_id, reason, movement_date, employee_id)
    values (p_branch, p_ingredient, 'sale', -v_take, 'order', p_order, 'Offline sale (synced)', p_at, p_emp);
  end if;
  return p_need - v_take;
end $$;

create or replace function sync_offline_order(
  p_employee_id    int,
  p_shift_id       int,
  p_client_id      uuid,
  p_offline_at     timestamptz,
  p_customer_phone varchar,
  p_promotion_id   int,
  p_items          jsonb,
  p_method         varchar,
  p_offline_total  numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_branch int; v_order_id int; v_item jsonb; v_prod product%rowtype; v_detail_id int;
  v_mod_id int; v_mod_price numeric; v_qty int; v_size varchar; v_line numeric;
  v_subtotal numeric := 0; v_discount numeric := 0; v_total numeric; v_pts int;
  v_promo promotion%rowtype; v_at timestamp; v_phone varchar := p_customer_phone;
  v_member_skipped boolean := false; v_short numeric; v_shorts text[] := '{}'; r record;
  v_existing int;
begin
-- Prevent duplicate simultaneous submissions
  perform pg_advisory_xact_lock(hashtext(p_client_id::text));
  select order_id into v_existing from offline_order_log where client_id = p_client_id;
  if found then
    return jsonb_build_object('order_id', v_existing, 'duplicate', true, 'member_skipped', false, 'stock_short', '[]'::jsonb);
  end if;

  select branch_id into v_branch from employee where employee_id = p_employee_id and status = 'active';
  if not found then raise exception 'Employee not found or account is inactive'; end if;

  perform 1 from shift where shift_id = p_shift_id and employee_id = p_employee_id and close_time is null;
  if not found then raise exception 'This shift is no longer open'; end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Cart is empty'; end if;
  if p_method not in ('cash','card','promptpay') then raise exception 'Invalid payment method'; end if;

-- Use the actual sale time (must not be in the future)
  v_at := least(p_offline_at, now())::timestamp;

  if v_phone is not null then
    perform 1 from customer where phone_number = v_phone;
    if not found then v_phone := null; v_member_skipped := true; end if;
  end if;

  insert into orders (branch_id, shift_id, customer_phone, employee_id, order_date)
  values (v_branch, p_shift_id, v_phone, p_employee_id, v_at)
  returning order_id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty  := (v_item->>'quantity')::int;
    v_size := coalesce(v_item->>'size', 'M');
    if v_qty is null or v_qty <= 0 then raise exception 'Invalid quantity'; end if;

    select * into v_prod from product where product_id = (v_item->>'product_id')::int;
    if not found then raise exception 'Product not found'; end if;   -- สินค้าปิดขายแล้วก็ยังรับ เพราะขายไปก่อนหน้า

    insert into order_detail (order_id, product_id, size, quantity, price)
    values (v_order_id, v_prod.product_id, v_size, v_qty, v_prod.price)
    returning order_detail_id into v_detail_id;
    v_line := v_prod.price;

    for r in select ingredient_id, qty_per_serve * v_qty as need from recipe where product_id = v_prod.product_id and size = v_size loop
      v_short := take_stock_offline(v_branch, r.ingredient_id, r.need, v_order_id, p_employee_id, v_at);
      if v_short > 0 then v_shorts := v_shorts || ((select name from ingredient where ingredient_id = r.ingredient_id) || ' short ' || v_short); end if;
    end loop;

    for v_mod_id in select (jsonb_array_elements_text(coalesce(v_item->'modifier_ids', '[]'::jsonb)))::int loop
      select extra_price into v_mod_price from modifier where modifier_id = v_mod_id;
      if not found then raise exception 'Modifier % not found', v_mod_id; end if;
      insert into order_detail_modifier (order_detail_id, modifier_id, price_at_sale) values (v_detail_id, v_mod_id, v_mod_price);
      v_line := v_line + v_mod_price;

      for r in select ingredient_id, extra_qty * v_qty as need from modifier_ingredient where modifier_id = v_mod_id loop
        v_short := take_stock_offline(v_branch, r.ingredient_id, r.need, v_order_id, p_employee_id, v_at);
        if v_short > 0 then v_shorts := v_shorts || ((select name from ingredient where ingredient_id = r.ingredient_id) || ' short ' || v_short); end if;
      end loop;
    end loop;

    v_subtotal := v_subtotal + v_line * v_qty;
  end loop;

-- Promotions: Validate against the sale date; skip invalid promotions without rejecting the sale.
  if p_promotion_id is not null then
    select * into v_promo from promotion
     where promotion_id = p_promotion_id and status = 'active' and v_at::date between start_date and end_date;
    if found then
      v_discount := case v_promo.discount_type when 'percent' then round(v_subtotal * v_promo.value / 100, 2) else v_promo.value end;
      v_discount := least(v_discount, v_subtotal);
    else
      p_promotion_id := null;
    end if;
  end if;
  v_total := v_subtotal - v_discount;

  update orders set promotion_id = p_promotion_id, discount_amount = v_discount, total_price = v_total where order_id = v_order_id;
  insert into payment (order_id, method, amount, paid_at) values (v_order_id, p_method, v_total, v_at);

  if v_phone is not null then
    v_pts := floor(v_total / 50);
    if v_pts > 0 then
      insert into point_transaction (customer_phone, order_id, transaction_type, points, transaction_date)
      values (v_phone, v_order_id, 'earn', v_pts, v_at);
      update customer set points = points + v_pts where phone_number = v_phone;
    end if;
  end if;

  insert into offline_order_log (client_id, order_id, employee_id, offline_at) values (p_client_id, v_order_id, p_employee_id, v_at);

  if array_length(v_shorts, 1) > 0 then
    perform log_audit(p_employee_id, 'Offline sale: stock shortfall', 'orders', v_order_id, null, left(array_to_string(v_shorts, '; '), 500));
  end if;
  if p_offline_total is not null and p_offline_total <> v_total then
    perform log_audit(p_employee_id, 'Offline sale: total differs', 'orders', v_order_id, p_offline_total::text, v_total::text);
  end if;

  return jsonb_build_object('order_id', v_order_id, 'duplicate', false, 'member_skipped', v_member_skipped,
                            'stock_short', to_jsonb(v_shorts), 'total', v_total);
end $$;

-- Fix seed supplier prices (file 04 bug: renamed ingredients caused mismatches, setting all prices to 20) Safe to rerun
update supplier_ingredient si
   set unit_price = case
         when i.name ilike 'oat milk%'  then 0.09
         when i.name ilike '%coffee%'   then 0.80
         when i.name ilike '%matcha%'   then 2.50
         when i.name ilike '%syrup%'    then 0.05
         when i.name ilike '%milk%'     then 0.04
         else si.unit_price end
  from ingredient i
 where i.ingredient_id = si.ingredient_id and si.unit_price = 20 and i.name not ilike '%croissant%';
 