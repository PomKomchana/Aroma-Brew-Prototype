-- UPDATE: TH Languge ===> ENGLISH Language [01_schema]
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

update branch set name = 'Aroma Brew Main Branch', address = 'Bangkok'
 where name = 'Aroma Brew สาขาหลัก';

update employee set name = 'Owner'       where name = 'เจ้าของร้าน';
update employee set name = 'Cashier 1'   where name = 'แคชเชียร์ 1';
update employee set name = 'Stock Staff' where name = 'พนักงานคลัง';

update ingredient set name = 'Coffee beans'  where name = 'เมล็ดกาแฟ';
update ingredient set name = 'Fresh milk'    where name = 'นมสด';
update ingredient set name = 'Syrup'         where name = 'น้ำเชื่อม';
update ingredient set name = 'Matcha powder' where name = 'ผงชาเขียว';
update ingredient set name = 'Oat milk'      where name = 'นมโอ๊ต';
update ingredient set name = 'Croissant (ready-made)', unit = 'pcs'
 where name = 'ครัวซองต์ (สำเร็จรูป)';

update modifier set name = 'Sweet 50%'    where name = 'หวานน้อย';
update modifier set name = 'Sweet 100%' where name = 'หวานปกติ';
update modifier set name = 'Oat milk'      where name = 'นมโอ๊ต';
update modifier set name = 'Extra shot'    where name = 'เพิ่มช็อต';

update customer set name = 'Somchai Jaidee' where phone_number = '0812345678';
update customer set name = 'Malee Suayngam' where phone_number = '0898765432';

update promotion set name = '10% off' where name = 'ลด 10%';

-- stock_movement is append-only, so temporarily disable the trigger
alter table stock_movement disable trigger stock_movement_immutable;
update stock_movement set reason = 'Opening balance' where reason = 'ยอดยกมา';
alter table stock_movement enable trigger stock_movement_immutable;
