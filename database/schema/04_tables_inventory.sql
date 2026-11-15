-- 04 inventory tables: supplier, supplier_ingredient, purchase_order, po_detail,
--                      ingredient_lot, stock_movement
-- Stock only moves through stock_movement (append-only ledger). ingredient.stock_qty is
-- just the running total that the trigger keeps up to date.

create table supplier (
  supplier_id  int generated always as identity primary key,
  name         varchar(100) not null,
  contact_name varchar(100),
  phone_number varchar(15),
  address      varchar(255),
  is_active    boolean not null default true
);

create table supplier_ingredient (
  supplier_ingredient_id int generated always as identity primary key,
  supplier_id    int not null references supplier,
  ingredient_id  int not null references ingredient,
  unit_price     decimal(8,2) not null check (unit_price >= 0),
  lead_time_days int,
  unique (supplier_id, ingredient_id)
);

-- draft -> sent -> partial -> received   (draft/sent can be cancelled)
create table purchase_order (
  po_id       int generated always as identity primary key,
  branch_id   int not null references branch,
  supplier_id int not null references supplier,
  employee_id int not null references employee,
  order_date  timestamp not null default now(),
  status      varchar(10) not null default 'draft'
              constraint purchase_order_status_check check (status in ('draft','sent','partial','received','cancelled')),
  total_cost  decimal(10,2) not null default 0,
  expected_date date,
  note          varchar(200),
  sent_at       timestamp,
  closed_at     timestamp
);

create table po_detail (
  po_detail_id int generated always as identity primary key,
  po_id         int not null references purchase_order,
  ingredient_id int not null references ingredient,
  qty_ordered   decimal(10,2) not null check (qty_ordered > 0),
  qty_received  decimal(10,2) not null default 0,
  unit_price    decimal(8,2)  not null
);

-- one row per delivery, so every batch keeps its own cost and expiry date
create table ingredient_lot (
  lot_id        int generated always as identity primary key,
  ingredient_id int not null references ingredient,
  po_id         int references purchase_order,
  qty_received  decimal(10,2) not null check (qty_received > 0),
  unit_cost     decimal(8,2),
  expiry_date   date,
  received_at   timestamp not null default now()
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
