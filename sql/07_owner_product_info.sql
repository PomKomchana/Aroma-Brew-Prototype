create or replace function get_products_admin(p_emp int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform assert_role(p_emp, array['owner']);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'product_id', p.product_id, 'name', p.name, 'category', p.category, 'price', p.price,
      'image', p.image, 'is_active', p.is_active,
      'description', p.description, 'allergens', to_jsonb(p.allergens),
      'recipes', coalesce((select jsonb_agg(jsonb_build_object('size', r.size, 'ingredient_id', r.ingredient_id, 'qty_per_serve', r.qty_per_serve) order by r.size, r.ingredient_id)
                             from recipe r where r.product_id = p.product_id), '[]'::jsonb)
    ) order by p.product_id) from product p), '[]'::jsonb);
end $$;

create or replace function upsert_product(p_emp int, p_product jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_id int; v_old product%rowtype; r jsonb;
        v_desc text := nullif(trim(coalesce(p_product->>'description', '')), '');
        v_allergens text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_product->'allergens', '[]'::jsonb))), '{}');
begin
  perform assert_role(p_emp, array['owner']);
  if nullif(trim(p_product->>'name'), '') is null then raise exception 'Product name is required'; end if;
  if (p_product->>'price')::numeric < 0 then raise exception 'Price must not be negative'; end if;

  v_id := nullif(p_product->>'product_id', '')::int;
  if v_id is null then
    insert into product (name, category, price, image, is_active, description, allergens)
    values (trim(p_product->>'name'), p_product->>'category', (p_product->>'price')::numeric,
            nullif(p_product->>'image', ''), coalesce((p_product->>'is_active')::boolean, true), v_desc, v_allergens)
    returning product_id into v_id;
    perform log_audit(p_emp, 'Create product', 'product', v_id, null, p_product->>'name');
  else
    select * into v_old from product where product_id = v_id;
    if not found then raise exception 'Product not found'; end if;
    update product set name = trim(p_product->>'name'), category = p_product->>'category',
           price = (p_product->>'price')::numeric, image = nullif(p_product->>'image', ''),
           is_active = coalesce((p_product->>'is_active')::boolean, true),
           description = v_desc, allergens = v_allergens
     where product_id = v_id;
    if v_old.price <> (p_product->>'price')::numeric then
      perform log_audit(p_emp, 'Change price', 'product', v_id, v_old.price::text, p_product->>'price');
    end if;
    if v_old.is_active <> coalesce((p_product->>'is_active')::boolean, true) then
      perform log_audit(p_emp, 'Toggle product availability', 'product', v_id, v_old.is_active::text, p_product->>'is_active');
    end if;
    if v_old.allergens is distinct from v_allergens then
      perform log_audit(p_emp, 'Change allergens', 'product', v_id, array_to_string(v_old.allergens, ','), array_to_string(v_allergens, ','));
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
