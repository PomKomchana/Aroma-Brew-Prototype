create table if not exists member_otp (
  phone_number varchar(10) primary key references customer,
  code_hash    text not null,
  expires_at   timestamp not null,
  attempts     int not null default 0,
  requested_at timestamp not null default now()
);

create table if not exists member_session (
  token        uuid primary key default gen_random_uuid(),
  phone_number varchar(10) not null references customer,
  expires_at   timestamp not null
);

alter table member_otp enable row level security;
alter table member_session enable row level security;

create or replace function request_otp(p_phone varchar) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_code text; v_last timestamp;
begin
  if p_phone !~ '^[0-9]{10}$' then raise exception 'Please enter a 10-digit phone number'; end if;
  perform 1 from customer where phone_number = p_phone;
  if not found then raise exception 'This phone number is not registered as a member'; end if;

  select requested_at into v_last from member_otp where phone_number = p_phone;
  if v_last is not null and v_last > now() - interval '30 seconds' then
    raise exception 'Please wait 30 seconds before requesting a new code';
  end if;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into member_otp (phone_number, code_hash, expires_at, attempts, requested_at)
  values (p_phone, crypt(v_code, gen_salt('bf')), now() + interval '5 minutes', 0, now())
  on conflict (phone_number) do update
    set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, requested_at = now();

  -- DEMO ONLY: Show code on screen (production must send via SMS/LINE)
  return jsonb_build_object('demo_code', v_code, 'expires_in', 300);
end $$;

create or replace function verify_otp(p_phone varchar, p_code varchar) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare o member_otp%rowtype; v_token uuid;
begin
  select * into o from member_otp where phone_number = p_phone for update;
  if not found or o.expires_at < now() then raise exception 'The code has expired, please request a new one'; end if;
  if o.attempts >= 5 then raise exception 'Too many attempts, please request a new code'; end if;

  if o.code_hash <> crypt(p_code, o.code_hash) then
    -- ห้าม raise ตรงนี้: exception จะ rollback การนับ attempts ทิ้ง จึงคืน null แทน
    update member_otp set attempts = attempts + 1 where phone_number = p_phone;
    return null;
  end if;

  delete from member_otp where phone_number = p_phone;
  delete from member_session where expires_at < now();
  update customer set otp_verified_at = now() where phone_number = p_phone;
  insert into member_session (phone_number, expires_at) values (p_phone, now() + interval '30 minutes')
  returning token into v_token;
  return v_token;
end $$;

create or replace function get_member_summary(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_phone varchar; c customer%rowtype;
begin
  select phone_number into v_phone from member_session where token = p_token and expires_at > now();
  if not found then raise exception 'Session expired, please sign in again'; end if;
  select * into c from customer where phone_number = v_phone;

  return jsonb_build_object(
    'name', c.name, 'tier', c.membership_tier, 'points', c.points,
    'masked_phone', substr(c.phone_number, 1, 2) || 'x-xxx-' || right(c.phone_number, 4),
    'history', coalesce((
      select jsonb_agg(r) from (
        select o.order_id, o.order_date, o.total_price, o.status,
               coalesce((select sum(points) from point_transaction t where t.order_id = o.order_id), 0) as points,
               (select string_agg(d.quantity || '× ' || pr.name, ', ' order by d.order_detail_id)
                  from order_detail d join product pr using (product_id) where d.order_id = o.order_id) as items
          from orders o where o.customer_phone = v_phone
         order by o.order_id desc limit 20) r), '[]'::jsonb));
end $$;

create or replace function member_logout(p_token uuid) returns void
language sql security definer set search_path = public as $$
  delete from member_session where token = p_token;
$$;
