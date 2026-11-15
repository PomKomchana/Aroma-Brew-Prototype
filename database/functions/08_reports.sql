-- 08 dashboard, sales report, audit log
-- Owner only (S13, S17).

create or replace function get_dashboard(p_emp int, p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sales numeric; v_orders int; v_disc numeric; v_cost numeric; v_by_day jsonb; v_top jsonb; v_by_method jsonb; v_value numeric; v_low int;
begin
  perform assert_role(p_emp, array['owner']);
  if p_to - p_from > 366 then raise exception 'Date range is too long'; end if;

  select coalesce(sum(total_price),0), count(*), coalesce(sum(discount_amount),0)
    into v_sales, v_orders, v_disc
    from orders where status = 'paid' and order_date::date between p_from and p_to;

  -- sale + return movements of orders in this period (cancelled bills offset themselves)
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

-- sales by hour / day / month for a chosen period, with cost, profit, cancelled bills, top products and payment split
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
