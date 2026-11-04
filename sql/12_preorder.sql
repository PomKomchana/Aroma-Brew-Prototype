-- 12: Pre-order (order ahead on the customer site, pay and pick up at the counter)

-- Flow:  placed -> preparing -> ready -> collected          (cancelled / no_show can end it early)
-- A pre-order is NOT a bill. Nothing touches stock or sales until the cashier presses
-- "Collect & pay": complete_preorder() calls the existing checkout(), so the real bill, the
-- recipe-based stock deduction, the promotion, the payment and the member points all come from
-- the same code path as a normal POS sale.
-- Safe to run more than once.

-- 1. Tables
create table if not exists preorder_setting (
  branch_id               int primary key references branch,
  is_enabled              boolean not null default true,
  open_time               time    not null default '07:00',
  close_time              time    not null default '20:00',
  slot_minutes            int     not null default 15 check (slot_minutes between 5 and 60),
  min_lead_minutes        int     not null default 15 check (min_lead_minutes between 0 and 240),
  max_orders_per_slot     int     not null default 6  check (max_orders_per_slot between 1 and 100),
  max_active_per_customer int     not null default 3  check (max_active_per_customer between 1 and 20),
  check (close_time > open_time)
);

create table if not exists preorder (
  preorder_id     int generated always as identity primary key,
  branch_id       int not null references branch,
  customer_phone  varchar(10) not null references customer,
  pickup_time     timestamptz not null,
  status          varchar(10) not null default 'placed'
                  check (status in ('placed','preparing','ready','collected','cancelled','no_show')),
  note            varchar(200),
  subtotal        decimal(10,2) not null check (subtotal >= 0),
  discount_amount decimal(10,2) not null default 0 check (discount_amount >= 0),
  total_price     decimal(10,2) not null check (total_price >= 0),
  promotion_id    int references promotion,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  ready_at        timestamptz,
  order_id        int references orders,      -- set when the cashier collects payment
  cancel_reason   varchar(200)
);

create table if not exists preorder_item (
  preorder_item_id int generated always as identity primary key,
  preorder_id      int not null references preorder,
  product_id       int not null references product,
  size             varchar(10) not null,
  quantity         int not null check (quantity between 1 and 20),
  price            decimal(8,2) not null      -- unit price when ordered (modifiers are separate rows)
);

create table if not exists preorder_item_modifier (
  preorder_item_modifier_id int generated always as identity primary key,
  preorder_item_id int not null references preorder_item,
  modifier_id      int not null references modifier,
  price_at_order   decimal(8,2) not null
);

create index if not exists preorder_status_pickup_idx on preorder (status, pickup_time);
create index if not exists preorder_customer_idx      on preorder (customer_phone, preorder_id desc);
create index if not exists preorder_item_preorder_idx on preorder_item (preorder_id);
create index if not exists preorder_item_mod_item_idx on preorder_item_modifier (preorder_item_id);

-- Same rule as member_otp / member_session: no direct table access, only through the functions below
alter table preorder_setting       enable row level security;
alter table preorder               enable row level security;
alter table preorder_item          enable row level security;
alter table preorder_item_modifier enable row level security;

insert into preorder_setting (branch_id) select branch_id from branch on conflict do nothing;

-- 2. Internal helpers (not callable from the browser, see the revokes at the bottom)
create or replace function preorder_cfg(p_branch int) returns preorder_setting
language plpgsql security definer set search_path = public as $$
declare c preorder_setting;
begin
  insert into preorder_setting (branch_id) values (p_branch) on conflict do nothing;
  select * into c from preorder_setting where branch_id = p_branch;
  return c;
end $$;

-- Pickup slots for today (store time, Asia/Bangkok). A slot is "available" when it is far enough
-- ahead (min_lead_minutes) and not full (max_orders_per_slot).
create or replace function preorder_slots(p_branch int)
returns table (slot_start timestamptz, taken int, capacity int, available boolean)
language plpgsql security definer set search_path = public as $$
declare c preorder_setting; v_now timestamp := now() at time zone 'Asia/Bangkok';
        v_day date; v_first timestamp; v_last timestamp; v_earliest timestamp;
begin
  c := preorder_cfg(p_branch);
  if not c.is_enabled then return; end if;
  v_day      := v_now::date;
  v_first    := v_day + c.open_time;
  v_last     := v_day + c.close_time;
  v_earliest := v_now + make_interval(mins => c.min_lead_minutes);

  return query
    select (g.ts at time zone 'Asia/Bangkok')                       as slot_start,
           coalesce(t.n, 0)::int                                    as taken,
           c.max_orders_per_slot                                    as capacity,
           (g.ts >= v_earliest and coalesce(t.n, 0) < c.max_orders_per_slot) as available
      from generate_series(v_first, v_last - make_interval(mins => c.slot_minutes),
                           make_interval(mins => c.slot_minutes)) as g(ts)
      left join lateral (
        select count(*) as n from preorder p
         where p.branch_id = p_branch
           and p.status in ('placed','preparing','ready')
           and p.pickup_time = (g.ts at time zone 'Asia/Bangkok')
      ) t on true
     order by g.ts;
end $$;

-- Ingredients that every active (not yet collected) pre-order will need, per pre-order
create or replace function preorder_needs()
returns table (preorder_id int, ingredient_id int, qty numeric)
language sql stable security definer set search_path = public as $$
  select p.preorder_id, x.ingredient_id, sum(x.qty)
    from preorder p
    join preorder_item i on i.preorder_id = p.preorder_id
   cross join lateral (
     select r.ingredient_id, r.qty_per_serve * i.quantity as qty
       from recipe r where r.product_id = i.product_id and r.size = i.size
     union all
     select mi.ingredient_id, mi.extra_qty * i.quantity
       from preorder_item_modifier pm
       join modifier_ingredient mi on mi.modifier_id = pm.modifier_id
      where pm.preorder_item_id = i.preorder_item_id
   ) x
   where p.status in ('placed','preparing','ready')
   group by p.preorder_id, x.ingredient_id;
$$;

-- Same rule as the POS (bestPromotion in src/lib/pos.ts): the active promotion that discounts the most
create or replace function best_promotion(p_subtotal numeric) returns promotion
language sql stable security definer set search_path = public as $$
  select pr.*
    from promotion pr
   where pr.status = 'active'
     and (now() at time zone 'Asia/Bangkok')::date between pr.start_date and pr.end_date
     and p_subtotal > 0
   order by least(case pr.discount_type when 'percent' then round(p_subtotal * pr.value / 100, 2) else pr.value end,
                  p_subtotal) desc, pr.promotion_id
   limit 1;
$$;

-- One pre-order as jsonb (shared by the customer and staff views)
create or replace function preorder_json(p_id int, p_staff boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p preorder%rowtype; c customer%rowtype; v jsonb;
begin
  select * into p from preorder where preorder_id = p_id;
  if not found then return null; end if;

  v := jsonb_build_object(
    'preorder_id', p.preorder_id, 'status', p.status, 'pickup_time', p.pickup_time,
    'created_at', p.created_at, 'ready_at', p.ready_at, 'note', p.note,
    'subtotal', p.subtotal, 'discount_amount', p.discount_amount, 'total_price', p.total_price,
    'promo_name', (select name from promotion where promotion_id = p.promotion_id),
    'cancel_reason', p.cancel_reason, 'order_id', p.order_id,
    'points_earned', case when p.order_id is null then 0 else coalesce((
        select sum(points) from point_transaction where order_id = p.order_id and transaction_type = 'earn'), 0) end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', pr.name, 'size', i.size, 'quantity', i.quantity,
               'unit_price', i.price + coalesce((select sum(m.price_at_order) from preorder_item_modifier m
                                                  where m.preorder_item_id = i.preorder_item_id), 0),
               'modifiers', coalesce((select jsonb_agg(md.name order by m.preorder_item_modifier_id)
                                        from preorder_item_modifier m join modifier md using (modifier_id)
                                       where m.preorder_item_id = i.preorder_item_id), '[]'::jsonb))
             order by i.preorder_item_id)
        from preorder_item i join product pr using (product_id)
       where i.preorder_id = p.preorder_id), '[]'::jsonb));

  if p_staff then
    select * into c from customer where phone_number = p.customer_phone;
    v := v || jsonb_build_object('customer_name', c.name,
                                 'masked_phone', substr(c.phone_number, 1, 2) || 'x-xxx-' || right(c.phone_number, 4));
  end if;
  return v;
end $$;

-- 3. Customer side (identified by the member session token from the phone + OTP sign-in)
create or replace function member_phone(p_token uuid) returns varchar
language plpgsql security definer set search_path = public as $$
declare v_phone varchar;
begin
  select phone_number into v_phone from member_session where token = p_token and expires_at > now();
  if not found then raise exception 'Session expired, please sign in again'; end if;
  return v_phone;
end $$;

-- Today's pickup slots + opening hours (public, no sign-in needed to look)
create or replace function get_pickup_slots() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_branch int; c preorder_setting;
begin
  select branch_id into v_branch from branch order by branch_id limit 1;
  c := preorder_cfg(v_branch);
  return jsonb_build_object(
    'enabled', c.is_enabled, 'open_time', c.open_time, 'close_time', c.close_time,
    'lead_minutes', c.min_lead_minutes,
    'slots', coalesce((select jsonb_agg(jsonb_build_object('time', s.slot_start, 'available', s.available,
      'remaining', greatest(s.capacity - s.taken, 0))
        order by s.slot_start)
        from preorder_slots(v_branch) s), '[]'::jsonb));
end $$;

create or replace function place_preorder(p_token uuid, p_pickup timestamptz, p_items jsonb, p_note text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_phone varchar; v_branch int; c preorder_setting; v_id int; v_item jsonb; v_prod product%rowtype;
  v_qty int; v_size varchar; v_mid int; v_mprice numeric; v_line numeric; v_item_id int;
  v_subtotal numeric := 0; v_disc numeric := 0; v_promo promotion; v_slot_ok boolean;
begin
  v_phone := member_phone(p_token);

  select branch_id into v_branch from branch order by branch_id limit 1;
  c := preorder_cfg(v_branch);
  if not c.is_enabled then raise exception 'Pre-orders are not available right now'; end if;

  -- one order at a time per branch, so slot capacity and stock checks cannot race each other
  perform pg_advisory_xact_lock(7012, v_branch);

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your order is empty';
  end if;
  if jsonb_array_length(p_items) > 30 then raise exception 'Too many items in one order'; end if;

  if (select count(*) from preorder where customer_phone = v_phone and status in ('placed','preparing','ready'))
       >= c.max_active_per_customer then
    raise exception 'You already have % active pre-orders. Please collect or cancel one first', c.max_active_per_customer;
  end if;

  select s.available into v_slot_ok from preorder_slots(v_branch) s where s.slot_start = p_pickup;
  if v_slot_ok is null then raise exception 'Please choose a pickup time from the list'; end if;
  if not v_slot_ok then raise exception 'That pickup time is no longer available, please choose another'; end if;

  insert into preorder (branch_id, customer_phone, pickup_time, note, subtotal, total_price)
  values (v_branch, v_phone, p_pickup, nullif(left(trim(coalesce(p_note, '')), 200), ''), 0, 0)
  returning preorder_id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty  := (v_item->>'quantity')::int;
    v_size := coalesce(v_item->>'size', 'M');
    if v_qty is null or v_qty < 1 or v_qty > 20 then raise exception 'Invalid quantity'; end if;

    select * into v_prod from product where product_id = (v_item->>'product_id')::int and is_active;
    if not found then raise exception 'An item in your order is no longer on sale'; end if;

    perform 1 from recipe where product_id = v_prod.product_id and size = v_size;
    if not found then raise exception 'Size % is not available for %', v_size, v_prod.name; end if;

    -- prices always come from the database, never from the browser
    insert into preorder_item (preorder_id, product_id, size, quantity, price)
    values (v_id, v_prod.product_id, v_size, v_qty, v_prod.price)
    returning preorder_item_id into v_item_id;
    v_line := v_prod.price;

    for v_mid in
      select distinct e.val::int
        from jsonb_array_elements_text(coalesce(v_item->'modifier_ids', '[]'::jsonb)) as e(val)
       order by 1
    loop
      select extra_price into v_mprice from modifier where modifier_id = v_mid;
      if not found then raise exception 'An option in your order is no longer available'; end if;
      insert into preorder_item_modifier (preorder_item_id, modifier_id, price_at_order)
      values (v_item_id, v_mid, v_mprice);
      v_line := v_line + v_mprice;
    end loop;

    v_subtotal := v_subtotal + v_line * v_qty;
  end loop;

  v_promo := best_promotion(v_subtotal);
  if v_promo.promotion_id is not null then
    v_disc := least(case v_promo.discount_type when 'percent' then round(v_subtotal * v_promo.value / 100, 2)
                                               else v_promo.value end, v_subtotal);
  end if;

  update preorder
     set subtotal = v_subtotal, discount_amount = v_disc, total_price = v_subtotal - v_disc,
         promotion_id = v_promo.promotion_id
   where preorder_id = v_id;

  -- enough ingredients for this order on top of everything already promised to other pre-orders?
  if exists (
    select 1
      from (select ingredient_id, sum(qty) as q from preorder_needs() group by ingredient_id) a
      join ingredient i on i.ingredient_id = a.ingredient_id
     where i.stock_qty < a.q
       and a.ingredient_id in (select n.ingredient_id from preorder_needs() n where n.preorder_id = v_id)
  ) then
    raise exception 'Sorry, we are running low on ingredients for this order. Please reduce the quantity or choose different items';
  end if;

  return v_id;
end $$;

create or replace function get_my_preorders(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_phone varchar := member_phone(p_token);
begin
  return coalesce((
    select jsonb_agg(preorder_json(r.preorder_id) order by (r.status in ('placed','preparing','ready')) desc,
                     r.pickup_time desc, r.preorder_id desc)
      from (select preorder_id, status, pickup_time from preorder
             where customer_phone = v_phone order by preorder_id desc limit 20) r), '[]'::jsonb);
end $$;

create or replace function get_my_preorder(p_token uuid, p_id int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_phone varchar := member_phone(p_token); p preorder%rowtype;
begin
  select * into p from preorder where preorder_id = p_id and customer_phone = v_phone;
  if not found then raise exception 'Order not found'; end if;
  return preorder_json(p_id) || jsonb_build_object('can_cancel', p.status = 'placed');
end $$;

create or replace function cancel_my_preorder(p_token uuid, p_id int) returns void
language plpgsql security definer set search_path = public as $$
declare v_phone varchar := member_phone(p_token); p preorder%rowtype;
begin
  select * into p from preorder where preorder_id = p_id and customer_phone = v_phone for update;
  if not found then raise exception 'Order not found'; end if;
  if p.status <> 'placed' then
    raise exception 'The store has already started on this order. Please ask at the counter to cancel it';
  end if;
  update preorder set status = 'cancelled', cancel_reason = 'Cancelled by customer', updated_at = now()
   where preorder_id = p_id;
end $$;

-- 4. Staff side (same trust model as the other staff functions: assert_role on the employee id)
-- scope 'active' = still waiting for the customer, 'today' = everything that was due today (store time)
create or replace function get_preorders(p_emp int, p_scope text default 'active') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_role(p_emp, array['owner','cashier']);
  return coalesce((
    select jsonb_agg(preorder_json(r.preorder_id, true) order by r.pickup_time, r.preorder_id)
      from (
        select preorder_id, pickup_time from preorder
         where (p_scope <> 'today' and status in ('placed','preparing','ready'))
            or (p_scope = 'today'  and (pickup_time at time zone 'Asia/Bangkok')::date
                                       = (now() at time zone 'Asia/Bangkok')::date)
         order by pickup_time, preorder_id limit 200) r), '[]'::jsonb);
end $$;

create or replace function get_preorder_counts(p_emp int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_role(p_emp, array['owner','cashier']);
  return jsonb_build_object(
    'placed',    (select count(*) from preorder where status = 'placed'),
    'preparing', (select count(*) from preorder where status = 'preparing'),
    'ready',     (select count(*) from preorder where status = 'ready'));
end $$;

create or replace function set_preorder_status(p_emp int, p_id int, p_status text, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare p preorder%rowtype; v_reason text := nullif(left(trim(coalesce(p_reason, '')), 200), '');
begin
  perform assert_role(p_emp, array['owner','cashier']);
  select * into p from preorder where preorder_id = p_id for update;
  if not found then raise exception 'Pre-order not found'; end if;
  if p.status not in ('placed','preparing','ready') then
    raise exception 'This pre-order is already %', p.status;
  end if;

  if p_status = 'preparing' then
    if p.status <> 'placed' then raise exception 'This pre-order is already %', p.status; end if;
    update preorder set status = 'preparing', updated_at = now() where preorder_id = p_id;

  elsif p_status = 'ready' then
    update preorder set status = 'ready', ready_at = now(), updated_at = now() where preorder_id = p_id;

  elsif p_status = 'cancelled' then
    if v_reason is null then raise exception 'Please give a reason'; end if;
    update preorder set status = 'cancelled', cancel_reason = v_reason, updated_at = now() where preorder_id = p_id;
    perform log_audit(p_emp, 'Cancel pre-order', 'preorder', p_id, p.status, 'cancelled: ' || left(v_reason, 100));

  elsif p_status = 'no_show' then
    if now() < p.pickup_time then raise exception 'The pickup time has not passed yet'; end if;
    update preorder set status = 'no_show', cancel_reason = coalesce(v_reason, 'Customer did not collect'),
                        updated_at = now() where preorder_id = p_id;
    perform log_audit(p_emp, 'Pre-order no-show', 'preorder', p_id, p.status, 'no_show');

  else
    raise exception 'Invalid status';
  end if;
end $$;

-- Collect & pay: turns the pre-order into a real bill through the normal checkout()
create or replace function complete_preorder(p_emp int, p_shift int, p_id int, p_method varchar) returns int
language plpgsql security definer set search_path = public as $$
declare p preorder%rowtype; v_items jsonb; v_order int; v_total numeric;
begin
  perform assert_role(p_emp, array['cashier']);
  if p_method is null or p_method not in ('cash','card','promptpay') then raise exception 'Please choose a payment method'; end if;

  select * into p from preorder where preorder_id = p_id for update;
  if not found then raise exception 'Pre-order not found'; end if;
  if p.status not in ('placed','preparing','ready') then
    raise exception 'This pre-order is already %', p.status;
  end if;

  select jsonb_agg(jsonb_build_object(
           'product_id', i.product_id, 'size', i.size, 'quantity', i.quantity,
           'modifier_ids', coalesce((select jsonb_agg(m.modifier_id order by m.preorder_item_modifier_id)
                                       from preorder_item_modifier m where m.preorder_item_id = i.preorder_item_id),
                                    '[]'::jsonb)) order by i.preorder_item_id)
    into v_items from preorder_item i where i.preorder_id = p_id;

  v_order := checkout(p_emp, p_shift, p.customer_phone, p.promotion_id, v_items, p_method);

  -- the customer was quoted a price when ordering; never charge a different amount silently
  select total_price into v_total from orders where order_id = v_order;
  if v_total <> p.total_price then
    raise exception 'Prices changed after this order was placed (quoted %, now %). Please cancel it and ask the customer to order again',
                    p.total_price, v_total;
  end if;

  update preorder set status = 'collected', order_id = v_order, updated_at = now() where preorder_id = p_id;
  return v_order;
end $$;

create or replace function get_preorder_settings(p_emp int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c preorder_setting; v_branch int;
begin
  perform assert_role(p_emp, array['owner','cashier']);
  select branch_id into v_branch from branch order by branch_id limit 1;
  c := preorder_cfg(v_branch);
  return jsonb_build_object(
    'is_enabled', c.is_enabled, 'open_time', to_char(c.open_time, 'HH24:MI'), 'close_time', to_char(c.close_time, 'HH24:MI'),
    'slot_minutes', c.slot_minutes, 'min_lead_minutes', c.min_lead_minutes,
    'max_orders_per_slot', c.max_orders_per_slot, 'max_active_per_customer', c.max_active_per_customer);
end $$;

create or replace function update_preorder_settings(
  p_emp int, p_enabled boolean, p_open time, p_close time, p_slot_minutes int, p_lead_minutes int,
  p_max_per_slot int, p_max_active int) returns void
language plpgsql security definer set search_path = public as $$
declare v_branch int; old preorder_setting;
begin
  perform assert_role(p_emp, array['owner']);
  if p_close <= p_open then raise exception 'Closing time must be after opening time'; end if;
  select branch_id into v_branch from branch order by branch_id limit 1;
  old := preorder_cfg(v_branch);
  update preorder_setting
     set is_enabled = p_enabled, open_time = p_open, close_time = p_close, slot_minutes = p_slot_minutes,
         min_lead_minutes = p_lead_minutes, max_orders_per_slot = p_max_per_slot, max_active_per_customer = p_max_active
   where branch_id = v_branch;
  perform log_audit(p_emp, 'Change pre-order settings', 'preorder_setting', v_branch,
    format('%s %s-%s', case when old.is_enabled then 'on' else 'off' end, to_char(old.open_time, 'HH24:MI'), to_char(old.close_time, 'HH24:MI')),
    format('%s %s-%s', case when p_enabled then 'on' else 'off' end, to_char(p_open, 'HH24:MI'), to_char(p_close, 'HH24:MI')));
end $$;

-- 5. Permissions
--    Supabase lets the anon key execute every function in "public" by default, so the helpers that
--    would reveal other customers' orders are revoked explicitly. (The functions below are called
--    by other security-definer functions, which run as the owner and are not affected.)
revoke execute on function preorder_cfg(int)              from public, anon, authenticated;
revoke execute on function preorder_slots(int)            from public, anon, authenticated;
revoke execute on function preorder_needs()               from public, anon, authenticated;
revoke execute on function best_promotion(numeric)        from public, anon, authenticated;
revoke execute on function preorder_json(int, boolean)    from public, anon, authenticated;
revoke execute on function member_phone(uuid)             from public, anon, authenticated;

grant execute on function get_pickup_slots()                                    to anon, authenticated;
grant execute on function place_preorder(uuid, timestamptz, jsonb, text)       to anon, authenticated;
grant execute on function get_my_preorders(uuid)                                to anon, authenticated;
grant execute on function get_my_preorder(uuid, int)                            to anon, authenticated;
grant execute on function cancel_my_preorder(uuid, int)                         to anon, authenticated;
grant execute on function get_preorders(int, text)                              to anon, authenticated;
grant execute on function get_preorder_counts(int)                              to anon, authenticated;
grant execute on function set_preorder_status(int, int, text, text)            to anon, authenticated;
grant execute on function complete_preorder(int, int, int, varchar)            to anon, authenticated;
grant execute on function get_preorder_settings(int)                            to anon, authenticated;
grant execute on function update_preorder_settings(int, boolean, time, time, int, int, int, int) to anon, authenticated;
