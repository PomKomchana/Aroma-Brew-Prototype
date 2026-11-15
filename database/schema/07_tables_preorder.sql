-- 07 pre-order tables: preorder_setting, preorder, preorder_item, preorder_item_modifier
-- A pre-order is not a bill. It becomes a real order only when the cashier collects payment
-- (complete_preorder -> checkout), so stock and sales are not touched before that.
-- flow: placed -> preparing -> ready -> collected   (cancelled / no_show can end it early)

create table preorder_setting (
  branch_id               int primary key references branch,
  is_enabled              boolean not null default true,
  open_time               time    not null default '07:00',
  close_time              time    not null default '20:00',
  slot_minutes            int     not null default 15 check (slot_minutes between 5 and 60),
  min_lead_minutes        int     not null default 15 check (min_lead_minutes between 0 and 240),
  max_orders_per_slot     int     not null default 6  check (max_orders_per_slot between 1 and 100),
  max_active_per_customer int     not null default 3  check (max_active_per_customer between 1 and 20),
  check (close_time > open_time)
);

create table preorder (
  preorder_id     int generated always as identity primary key,
  branch_id       int not null references branch,
  customer_phone  varchar(10) not null references customer,
  pickup_time     timestamptz not null,
  status          varchar(10) not null default 'placed'
                  check (status in ('placed','preparing','ready','collected','cancelled','no_show')),
  note            varchar(200),
  subtotal        decimal(10,2) not null check (subtotal >= 0),
  discount_amount decimal(10,2) not null default 0 check (discount_amount >= 0),
  total_price     decimal(10,2) not null check (total_price >= 0),
  promotion_id    int references promotion,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  ready_at        timestamptz,
  order_id        int references orders,      -- set when the cashier collects payment
  cancel_reason   varchar(200)
);

create table preorder_item (
  preorder_item_id int generated always as identity primary key,
  preorder_id      int not null references preorder,
  product_id       int not null references product,
  size             varchar(10) not null,
  quantity         int not null check (quantity between 1 and 20),
  price            decimal(8,2) not null      -- unit price when ordered (modifiers are separate rows)
);

create table preorder_item_modifier (
  preorder_item_modifier_id int generated always as identity primary key,
  preorder_item_id int not null references preorder_item,
  modifier_id      int not null references modifier,
  price_at_order   decimal(8,2) not null
);
