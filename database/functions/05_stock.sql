-- 05 stock
-- Stock screen for owner and stock staff (S10-S12).

-- ingredient list with low-stock flag and the nearest expiry of the lots that are still on the shelf
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

-- low / out of stock and near-expiry items for the alert banner
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

-- owner/stock tunes the reorder point and expiry warning days per ingredient
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

-- receive goods without a purchase order: creates a lot + a receive movement
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

-- stock count: every changed item needs a reason, creates an adjust movement and an audit row
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

-- ledger history
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
