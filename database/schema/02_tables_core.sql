-- 02 core tables: branch, employee, shift, attendance, work_schedule
-- Everything else hangs off these (who works where, and when).

create table branch (
  branch_id    int generated always as identity primary key,
  name         varchar(100) not null,
  address      varchar(255),
  phone_number varchar(15)
);

create table employee (
  employee_id   int generated always as identity primary key,
  branch_id     int not null references branch,
  name          varchar(100) not null,
  role          varchar(20)  not null check (role in ('owner','cashier','stock')),
  password_hash varchar(255) not null,
  -- 'deleted' = archived account (kept because old bills still point to it)
  status        varchar(10)  not null default 'active' check (status in ('active','inactive','deleted'))
);

create table shift (
  shift_id      int generated always as identity primary key,
  employee_id   int not null references employee,
  open_time     timestamp not null default now(),
  close_time    timestamp,
  opening_cash  decimal(10,2) not null default 0 check (opening_cash >= 0),
  total_sales   decimal(10,2),
  counted_cash  decimal(10,2),
  cash_diff     decimal(10,2)
);

create table attendance (
  att_id      int generated always as identity primary key,
  employee_id int not null references employee,
  branch_id   int not null references branch,
  clock_in    timestamp not null default now(),
  clock_out   timestamp
);

create table work_schedule (
  schedule_id int generated always as identity primary key,
  employee_id int not null references employee,
  work_date   date not null,
  start_time  time not null,
  end_time    time not null
);
