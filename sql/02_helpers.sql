create or replace function get_open_shift(p_employee_id int) returns int
language sql security definer set search_path = public as $$
  select shift_id from shift
   where employee_id = p_employee_id and close_time is null
   order by open_time desc limit 1;
$$;
