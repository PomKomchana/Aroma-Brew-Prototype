-- 06 system tables: audit_log, member_otp, member_session, offline_order_log
-- None of these are read directly from the browser (RLS on, no policies) - only through functions.

create table audit_log (
  log_id      int generated always as identity primary key,
  employee_id int not null references employee,
  action      varchar(100) not null,
  table_name  varchar(100) not null,
  record_id   int,
  old_value   text,
  new_value   text,
  created_at  timestamp not null default now()
);

-- customer sign-in on the member site: phone -> OTP -> session token
create table member_otp (
  phone_number varchar(10) primary key references customer,
  code_hash    text not null,
  expires_at   timestamp not null,
  attempts     int not null default 0,
  requested_at timestamp not null default now()
);

create table member_session (
  token        uuid primary key default gen_random_uuid(),
  phone_number varchar(10) not null references customer,
  expires_at   timestamp not null
);

-- remembers which offline sales were already synced, so a retry can't create the bill twice
create table offline_order_log (
  client_id   uuid primary key,
  order_id    int not null references orders,
  employee_id int not null references employee,
  offline_at  timestamp not null,
  synced_at   timestamp not null default now()
);
