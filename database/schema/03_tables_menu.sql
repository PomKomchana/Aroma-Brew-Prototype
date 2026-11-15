-- 03 menu tables: product, ingredient, recipe, modifier, modifier_ingredient
-- recipe says how much of each ingredient one serving uses (per size).
-- modifier_ingredient does the same for add-ons (extra shot, oat milk ...).

create table product (
  product_id int generated always as identity primary key,
  name       varchar(100) not null,
  category   varchar(20)  not null,
  image      varchar(255),
  price      decimal(8,2) not null check (price >= 0),
  is_active  boolean      not null default true,
  description text,
  allergens   text[] not null default '{}'
);

create table ingredient (
  ingredient_id     int generated always as identity primary key,
  branch_id         int not null references branch,
  name              varchar(100) not null,
  unit              varchar(20)  not null,
  -- never update this by hand: it is changed only by the stock_movement trigger
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
