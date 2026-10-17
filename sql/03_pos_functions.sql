-- POS: Functions/read permissions required at the POS + menu image

-- The POS system must know the size of each product (retrieved from the recipe table)
create policy read_recipe on recipe for select using (true);

-- Find member by phone number (S05) - Customer table is secured with RLS, so we read through a function
-- and return the phone number with partial masking (08x-xxx-5678) according to Privacy in the slides
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

-- Shift Summary [S09 ปิดกะ]: Sales breakdown by payment channel
create or replace function get_shift_summary(p_shift_id int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s shift%rowtype; v_orders int; v_total numeric; v_by jsonb;
begin
  select * into s from shift where shift_id = p_shift_id;
  if not found then raise exception 'ไม่พบกะ'; end if;

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

-- Menu Images (Example)
update product set image = 'https://images.unsplash.com/photo-1551030173-122aabc4489c?w=200&h=200&fit=crop' where name = 'Americano';
update product set image = 'https://images.unsplash.com/photo-1542372147193-a7aca54189cd?w=200&h=200&fit=crop' where name = 'Latte';
update product set image = 'https://images.unsplash.com/photo-1515823662972-da6a2e4d3002?w=200&h=200&fit=crop' where name = 'Matcha Latte';
update product set image = 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=200&h=200&fit=crop' where name = 'Croissant';
