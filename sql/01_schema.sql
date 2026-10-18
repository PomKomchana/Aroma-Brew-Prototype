create extension if not exists pgcrypto with schema extensions;

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
  status        varchar(10)  not null default 'active' check (status in ('active','inactive'))
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

create table product (
  product_id int generated always as identity primary key,
  name       varchar(100) not null,
  category   varchar(20)  not null,
  image      varchar(255),
  price      decimal(8,2) not null check (price >= 0),
  is_active  boolean      not null default true
);

create table ingredient (
  ingredient_id     int generated always as identity primary key,
  branch_id         int not null references branch,
  name              varchar(100) not null,
  unit              varchar(20)  not null,
  stock_qty         decimal(10,2) not null default 0 check (stock_qty >= 0),
  reorder_point     decimal(10,2) not null default 0,
  expiry_alert_days int not null default 7
);

create table recipe (
  recipe_id     int generated always as identity primary key,
  product_id    int not null references product,
  size          varchar(10) not null,
  ingredient_id int not null references ingredient,
  qty_per_serve decimal(8,3) not null check (qty_per_serve > 0),
  unique (product_id, size, ingredient_id)
);

create table modifier (
  modifier_id int generated always as identity primary key,
  name        varchar(50) not null,
  type        varchar(20) not null,
  extra_price decimal(8,2) not null default 0 check (extra_price >= 0)
);

create table modifier_ingredient (
  modifier_ingredient_id int generated always as identity primary key,
  modifier_id   int not null references modifier,
  ingredient_id int not null references ingredient,
  extra_qty     decimal(8,3) not null,
  check (extra_qty <> 0),
  unique (modifier_id, ingredient_id)
);

create table supplier (
  supplier_id  int generated always as identity primary key,
  name         varchar(100) not null,
  contact_name varchar(100),
  phone_number varchar(15),
  address      varchar(255)
);

create table supplier_ingredient (
  supplier_ingredient_id int generated always as identity primary key,
  supplier_id    int not null references supplier,
  ingredient_id  int not null references ingredient,
  unit_price     decimal(8,2) not null check (unit_price >= 0),
  lead_time_days int,
  unique (supplier_id, ingredient_id)
);

create table purchase_order (
  po_id       int generated always as identity primary key,
  branch_id   int not null references branch,
  supplier_id int not null references supplier,
  employee_id int not null references employee,
  order_date  timestamp not null default now(),
  status      varchar(10) not null default 'draft' check (status in ('draft','sent','received','cancelled')),
  total_cost  decimal(10,2) not null default 0
);

create table po_detail (
  po_detail_id int generated always as identity primary key,
  po_id         int not null references purchase_order,
  ingredient_id int not null references ingredient,
  qty_ordered   decimal(10,2) not null check (qty_ordered > 0),
  qty_received  decimal(10,2) not null default 0,
  unit_price    decimal(8,2)  not null
);

create table ingredient_lot (
  lot_id        int generated always as identity primary key,
  ingredient_id int not null references ingredient,
  po_id         int references purchase_order,
  qty_received  decimal(10,2) not null check (qty_received > 0),
  unit_cost     decimal(8,2),
  expiry_date   date
);

create table customer (
  phone_number    varchar(10) primary key check (phone_number ~ '^[0-9]{10}$'),
  name            varchar(100) not null,
  membership_tier varchar(20)  not null default 'standard',
  points          int not null default 0 check (points >= 0),
  line_user_id    varchar(50),
  otp_verified_at timestamp
);

create table promotion (
  promotion_id  int generated always as identity primary key,
  name          varchar(100) not null,
  discount_type varchar(10)  not null check (discount_type in ('percent','fixed')),
  value         decimal(8,2) not null check (value > 0),
  condition     varchar(255),
  start_date    date not null,
  end_date      date not null,
  status        varchar(10) not null default 'active' check (status in ('active','inactive')),
  check (end_date >= start_date)
);

create table orders (
  order_id        int generated always as identity primary key,
  branch_id       int not null references branch,
  shift_id        int not null references shift,
  customer_phone  varchar(10) references customer,
  employee_id     int not null references employee,
  promotion_id    int references promotion,
  order_date      timestamp not null default now(),
  discount_amount decimal(10,2) not null default 0 check (discount_amount >= 0),
  total_price     decimal(10,2) not null default 0 check (total_price >= 0),
  status          varchar(10) not null default 'paid' check (status in ('paid','cancelled')),
  cancel_reason   varchar(200)
);

create table order_detail (
  order_detail_id int generated always as identity primary key,
  order_id   int not null references orders,
  product_id int not null references product,
  size       varchar(10) not null,
  quantity   int not null check (quantity > 0),
  price      decimal(8,2) not null
);

create table order_detail_modifier (
  order_detail_modifier_id int generated always as identity primary key,
  order_detail_id int not null references order_detail,
  modifier_id     int not null references modifier,
  price_at_sale   decimal(8,2) not null
);

create table payment (
  payment_id int generated always as identity primary key,
  order_id   int not null references orders,
  method     varchar(10) not null check (method in ('cash','card','promptpay')),
  amount     decimal(10,2) not null check (amount >= 0),
  paid_at    timestamp not null default now()
);

create table point_transaction (
  point_transaction_id int generated always as identity primary key,
  customer_phone   varchar(10) not null references customer,
  order_id         int references orders,
  transaction_type varchar(10) not null check (transaction_type in ('earn','redeem','adjust')),
  points           int not null,
  transaction_date timestamp not null default now()
);

create table stock_movement (
  movement_id     bigint generated always as identity primary key,
  branch_id       int not null references branch,
  ingredient_id   int not null references ingredient,
  movement_type   varchar(10) not null check (movement_type in ('sale','receive','adjust','waste','return')),
  quantity_change decimal(10,2) not null check (quantity_change <> 0),
  reference_type  varchar(20),
  reference_id    int,
  reason          varchar(200),
  movement_date   timestamp not null default now(),
  employee_id     int not null references employee
);

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

-- index ที่ใช้บ่อย
create index on orders (shift_id);
create index on orders (order_date);
create index on stock_movement (ingredient_id, movement_date);
create index on order_detail (order_id);

create function trg_apply_stock_movement() returns trigger
language plpgsql as $$
begin
  update ingredient
     set stock_qty = stock_qty + new.quantity_change
   where ingredient_id = new.ingredient_id;
  return new;
end $$;

create trigger apply_stock_movement
after insert on stock_movement
for each row execute function trg_apply_stock_movement();

create function trg_immutable() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only: update/delete is not allowed', tg_table_name;
end $$;

create trigger stock_movement_immutable before update or delete on stock_movement
for each row execute function trg_immutable();
create trigger audit_log_immutable before update or delete on audit_log
for each row execute function trg_immutable();

create function trg_guard_stock_qty() returns trigger
language plpgsql as $$
begin
  if new.stock_qty is distinct from old.stock_qty and pg_trigger_depth() < 2 then
    raise exception 'stock_qty can only change through stock_movement';
  end if;
  return new;
end $$;

create trigger guard_stock_qty before update on ingredient
for each row execute function trg_guard_stock_qty();

create view v_stock_check as
select i.ingredient_id, i.name, i.stock_qty,
       coalesce(sum(m.quantity_change), 0) as movement_sum
from ingredient i
left join stock_movement m using (ingredient_id)
group by i.ingredient_id, i.name, i.stock_qty
having i.stock_qty <> coalesce(sum(m.quantity_change), 0);

create function login(p_employee_id int, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare e employee%rowtype;
begin
  select * into e from employee
   where employee_id = p_employee_id and status = 'active'
     and password_hash = crypt(p_password, password_hash);
  if not found then return null; end if;
  return jsonb_build_object('employee_id', e.employee_id, 'name', e.name, 'role', e.role, 'branch_id', e.branch_id);
end $$;

create function open_shift(p_employee_id int, p_opening_cash numeric) returns int
language plpgsql security definer set search_path = public as $$
declare v_id int;
begin
  perform 1 from shift where employee_id = p_employee_id and close_time is null;
  if found then raise exception 'มีกะที่ยังไม่ปิดอยู่แล้ว'; end if;
  insert into shift (employee_id, opening_cash) values (p_employee_id, p_opening_cash)
  returning shift_id into v_id;
  return v_id;
end $$;

create function checkout(
  p_employee_id    int,
  p_shift_id       int,
  p_customer_phone varchar,
  p_promotion_id   int,
  p_items          jsonb,
  p_method         varchar
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_branch int; v_order_id int; v_item jsonb; v_prod product%rowtype;
  v_detail_id int; v_mod_id int; v_mod_price numeric;
  v_qty int; v_size varchar; v_line numeric;
  v_subtotal numeric := 0; v_discount numeric := 0; v_total numeric; v_pts int;
  v_promo promotion%rowtype;
begin
  select branch_id into v_branch from employee
   where employee_id = p_employee_id and status = 'active';
  if not found then raise exception 'ไม่พบพนักงาน หรือบัญชีถูกปิด'; end if;

  perform 1 from shift where shift_id = p_shift_id and employee_id = p_employee_id and close_time is null;
  if not found then raise exception 'กะนี้ไม่ได้เปิดอยู่'; end if;

  if p_customer_phone is not null then
    perform 1 from customer where phone_number = p_customer_phone;
    if not found then raise exception 'ไม่พบสมาชิกเบอร์นี้'; end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'ตะกร้าว่าง';
  end if;

  insert into orders (branch_id, shift_id, customer_phone, employee_id)
  values (v_branch, p_shift_id, p_customer_phone, p_employee_id)
  returning order_id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty  := (v_item->>'quantity')::int;
    v_size := coalesce(v_item->>'size', 'M');
    if v_qty is null or v_qty <= 0 then raise exception 'จำนวนไม่ถูกต้อง'; end if;

    select * into v_prod from product
     where product_id = (v_item->>'product_id')::int and is_active;
    if not found then raise exception 'ไม่พบสินค้า หรือสินค้าถูกปิดขาย'; end if;

    insert into order_detail (order_id, product_id, size, quantity, price)
    values (v_order_id, v_prod.product_id, v_size, v_qty, v_prod.price)
    returning order_detail_id into v_detail_id;

    v_line := v_prod.price;

    insert into stock_movement (branch_id, ingredient_id, movement_type, quantity_change, reference_type, reference_id, movement_date, employee_id)
    select v_branch, r.ingredient_id, 'sale', -(r.qty_per_serve * v_qty),
           'order', v_order_id, now(), p_employee_id
      from recipe r
     where r.product_id = v_prod.product_id and r.size = v_size;

    for v_mod_id in
      select (jsonb_array_elements_text(coalesce(v_item->'modifier_ids', '[]'::jsonb)))::int
    loop
      select extra_price into v_mod_price from modifier where modifier_id = v_mod_id;
      if not found then raise exception 'ไม่พบ modifier %', v_mod_id; end if;

      insert into order_detail_modifier (order_detail_id, modifier_id, price_at_sale)
      values (v_detail_id, v_mod_id, v_mod_price);
      v_line := v_line + v_mod_price;

      insert into stock_movement (branch_id, ingredient_id, movement_type, quantity_change, reference_type, reference_id, movement_date, employee_id)
      select v_branch, mi.ingredient_id, 'sale', -(mi.extra_qty * v_qty),
             'order', v_order_id, now(), p_employee_id
        from modifier_ingredient mi
       where mi.modifier_id = v_mod_id;
    end loop;

    v_subtotal := v_subtotal + v_line * v_qty;
  end loop;

  if p_promotion_id is not null then
    select * into v_promo from promotion
     where promotion_id = p_promotion_id and status = 'active'
       and current_date between start_date and end_date;
    if not found then raise exception 'โปรโมชันนี้ใช้ไม่ได้'; end if;
    v_discount := case v_promo.discount_type
                    when 'percent' then round(v_subtotal * v_promo.value / 100, 2)
                    else v_promo.value end;
    v_discount := least(v_discount, v_subtotal);
  end if;
  v_total := v_subtotal - v_discount;

  update orders set promotion_id = p_promotion_id, discount_amount = v_discount, total_price = v_total
   where order_id = v_order_id;

  insert into payment (order_id, method, amount) values (v_order_id, p_method, v_total);

  if p_customer_phone is not null then
    v_pts := floor(v_total / 50);
    if v_pts > 0 then
      insert into point_transaction (customer_phone, order_id, transaction_type, points)
      values (p_customer_phone, v_order_id, 'earn', v_pts);
      update customer set points = points + v_pts where phone_number = p_customer_phone;
    end if;
  end if;

  return v_order_id;
end $$;

create function close_shift(p_shift_id int, p_counted_cash numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_open numeric; v_sales numeric; v_cash numeric; v_expected numeric;
begin
  select opening_cash into v_open from shift where shift_id = p_shift_id and close_time is null;
  if not found then raise exception 'ไม่พบกะ หรือปิดไปแล้ว'; end if;

  select coalesce(sum(o.total_price), 0) into v_sales
    from orders o where o.shift_id = p_shift_id and o.status = 'paid';
  select coalesce(sum(p.amount), 0) into v_cash
    from payment p join orders o using (order_id)
   where o.shift_id = p_shift_id and o.status = 'paid' and p.method = 'cash';

  v_expected := v_open + v_cash;
  update shift set close_time = now(), total_sales = v_sales, counted_cash = p_counted_cash, cash_diff = p_counted_cash - v_expected
   where shift_id = p_shift_id;

  return jsonb_build_object(
    'total_sales', v_sales, 'cash_sales', v_cash, 'expected_cash', v_expected,
    'counted_cash',    p_counted_cash, 'cash_diff', p_counted_cash - v_expected
    );
end $$;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create policy read_product    on product    for select using (true);
create policy read_modifier   on modifier   for select using (true);
create policy read_promotion  on promotion  for select using (status = 'active');
create policy read_ingredient on ingredient for select using (true);

insert into branch (name, address, phone_number)
values ('Aroma Brew สาขาหลัก', 'กรุงเทพฯ', '021234567');

insert into employee (branch_id, name, role, password_hash) values
 (1, 'เจ้าของร้าน',   'owner',   extensions.crypt('owner1234',   extensions.gen_salt('bf'))),
 (1, 'แคชเชียร์ 1',  'cashier', extensions.crypt('cashier1234', extensions.gen_salt('bf'))),
 (1, 'พนักงานคลัง',  'stock',   extensions.crypt('stock1234',   extensions.gen_salt('bf')));

insert into ingredient (branch_id, name, unit, reorder_point) values
 (1, 'เมล็ดกาแฟ',  'g',    500),
 (1, 'นมสด',       'ml',  2000),
 (1, 'น้ำเชื่อม',   'ml',   500),
 (1, 'ผงชาเขียว',  'g',    200),
 (1, 'นมโอ๊ต',     'ml',  1000),
 (1, 'ครัวซองต์ (สำเร็จรูป)', 'ชิ้น', 10);

insert into stock_movement (branch_id, ingredient_id, movement_type, quantity_change, reference_type, reason, employee_id)
values
 (1,1,'receive', 3000,'opening','ยอดยกมา',3),
 (1,2,'receive',10000,'opening','ยอดยกมา',3),
 (1,3,'receive', 2000,'opening','ยอดยกมา',3),
 (1,4,'receive',  800,'opening','ยอดยกมา',3),
 (1,5,'receive', 4000,'opening','ยอดยกมา',3),
 (1,6,'receive',   40,'opening','ยอดยกมา',3);

insert into product (name, category, price) values
 ('Americano',    'coffee', 60),
 ('Latte',        'coffee', 75),
 ('Matcha Latte', 'tea',    80),
 ('Croissant',    'bakery', 65);

insert into recipe (product_id, size, ingredient_id, qty_per_serve) values
 (1,'M',1,18), (1,'L',1,22),
 (2,'M',1,18), (2,'M',2,180), (2,'L',1,22), (2,'L',2,240),
 (3,'M',4,6),  (3,'M',2,180), (3,'L',4,8),  (3,'L',2,240),
 (4,'M',6,1),  (4,'L',6,1);

insert into modifier (name, type, extra_price) values
 ('หวานน้อย',   'sweet', 0),
 ('หวานปกติ',   'sweet', 0),
 ('นมโอ๊ต',     'milk',  15),
 ('เพิ่มช็อต',   'extra', 20);

insert into modifier_ingredient (modifier_id, ingredient_id, extra_qty) values
 (2,3,15),
 (3,5,60),
 (4,1,9);

insert into customer (phone_number, name) values
 ('0812345678', 'สมชาย ใจดี'),
 ('0898765432', 'มาลี สวยงาม');

insert into promotion (name, discount_type, value, start_date, end_date) values
 ('ลด 10%', 'percent', 10, current_date - 1, current_date + 365);
