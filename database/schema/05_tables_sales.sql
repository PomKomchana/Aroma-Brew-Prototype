-- 05 sales tables: customer, promotion, orders, order_detail, order_detail_modifier,
--                  payment, point_transaction

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
