--11: Customer Site
create or replace function get_branches() returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('name', name, 'address', address, 'phone', phone_number) order by branch_id),
    '[]'::jsonb)
  from branch;
$$;
grant execute on function get_branches() to anon, authenticated;
