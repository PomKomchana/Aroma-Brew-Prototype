-- 06 suppliers and purchase orders
-- draft -> sent -> partial -> received (draft/sent -> cancelled).

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

-- create/edit a supplier together with the list of ingredients it sells
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

-- create or edit a draft purchase order; unit price defaults to the supplier list price
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

-- allowed status changes only: draft->sent, draft/sent->cancelled, partial->received (closed short)
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

-- null p_statuses = all
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

-- receive goods against a purchase order. Each line makes its own lot (own cost and expiry) and a receive movement; the PO becomes partial or received
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
