-- 02 login and employee management
-- Login and the owner's employee screen (S01, S15).

-- returns the employee as json if id + password match an active account, otherwise null
create or replace function login(p_employee_id int, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare e employee%rowtype;
begin
  select * into e from employee
   where employee_id = p_employee_id and status = 'active'
     and password_hash = crypt(p_password, password_hash);
  if not found then return null; end if;
  return jsonb_build_object('employee_id', e.employee_id, 'name', e.name, 'role', e.role, 'branch_id', e.branch_id);
end $$;

create or replace function list_employees(p_emp int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform assert_role(p_emp, array['owner']);
  return coalesce((select jsonb_agg(jsonb_build_object('employee_id', employee_id, 'name', name, 'role', role, 'status', status) order by employee_id)
                     from employee where status <> 'deleted'), '[]'::jsonb);
end $$;

-- create or edit an employee. Deleted accounts cannot be edited or revived; status is only active/inactive here
create or replace function upsert_employee(p_emp int, p_data jsonb) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare o employee; v_id int; v_old employee%rowtype; v_pw text; v_status text;
begin
  o := assert_role(p_emp, array['owner']);
  v_pw := nullif(p_data->>'password', '');
  v_status := coalesce(p_data->>'status', 'active');
  if nullif(trim(p_data->>'name'), '') is null then raise exception 'Name is required'; end if;
  if v_status not in ('active','inactive') then raise exception 'Invalid status'; end if;
  if v_pw is not null and length(v_pw) < 6 then raise exception 'Password must be at least 6 characters'; end if;

  v_id := nullif(p_data->>'employee_id', '')::int;
  if v_id is null then
    if v_pw is null then raise exception 'Password is required for a new employee'; end if;
    insert into employee (branch_id, name, role, password_hash, status)
    values (o.branch_id, trim(p_data->>'name'), p_data->>'role', crypt(v_pw, gen_salt('bf')), v_status)
    returning employee_id into v_id;
    perform log_audit(p_emp, 'Create employee', 'employee', v_id, null, (p_data->>'name') || ' / ' || (p_data->>'role'));
  else
    select * into v_old from employee where employee_id = v_id and branch_id = o.branch_id and status <> 'deleted';
    if not found then raise exception 'Employee not found'; end if;
    if v_id = p_emp and (p_data->>'role' <> 'owner' or v_status <> 'active') then
      raise exception 'You cannot demote or deactivate your own account';
    end if;
    update employee set name = trim(p_data->>'name'), role = p_data->>'role', status = v_status,
           password_hash = case when v_pw is null then password_hash else crypt(v_pw, gen_salt('bf')) end
     where employee_id = v_id;
    perform log_audit(p_emp, 'Update employee', 'employee', v_id,
      v_old.role || ' / ' || v_old.status,
      (p_data->>'role') || ' / ' || v_status || case when v_pw is null then '' else ' / password reset' end);
  end if;
  return v_id;
end $$;

-- owner deletes a cashier/stock account. If old bills still reference it, it is archived (status = deleted) instead of removed
create or replace function delete_employee(p_emp int, p_target int) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare o employee; t employee%rowtype; v_result text;
begin
  o := assert_role(p_emp, array['owner']);
  if p_target = p_emp then raise exception 'You cannot delete your own account'; end if;

  select * into t from employee where employee_id = p_target and branch_id = o.branch_id and status <> 'deleted';
  if not found then raise exception 'Employee not found'; end if;
  if t.role not in ('cashier','stock') then raise exception 'Only cashier and stock accounts can be deleted'; end if;

  perform 1 from shift where employee_id = p_target and close_time is null;
  if found then raise exception 'This cashier still has an open shift. Close the shift first.'; end if;

  begin
    delete from employee where employee_id = p_target;
    v_result := 'deleted';
  exception when foreign_key_violation then
    update employee set status = 'deleted', password_hash = crypt(gen_random_uuid()::text, gen_salt('bf'))
     where employee_id = p_target;
    v_result := 'archived';
  end;

  perform log_audit(p_emp, 'Delete employee', 'employee', p_target, t.name || ' / ' || t.role || ' / ' || t.status, v_result);
  return v_result;
end $$;
