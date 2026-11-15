-- 01 base data for demo / testing
-- Not safe to run twice (it would insert everything again). To start over, run reset.sql first.
-- Run this AFTER schema/ and functions/ (stock_movement rows go through the trigger).

insert into branch (name, address, phone_number)
values ('Aroma Brew Main Branch', 'Bangkok', '021234567');

-- test accounts (login = employee id + password)
insert into employee (branch_id, name, role, password_hash) values
 (1, 'Owner',       'owner',   extensions.crypt('owner1234',   extensions.gen_salt('bf'))),
 (1, 'Cashier 1',   'cashier', extensions.crypt('cashier1234', extensions.gen_salt('bf'))),
 (1, 'Stock Staff', 'stock',   extensions.crypt('stock1234',   extensions.gen_salt('bf')));

insert into ingredient (branch_id, name, unit, reorder_point) values
 (1, 'Coffee beans',  'g',    500),
 (1, 'Fresh milk',    'ml',  2000),
 (1, 'Syrup',         'ml',   500),
 (1, 'Matcha powder', 'g',    200),
 (1, 'Oat milk',      'ml',  1000),
 (1, 'Croissant (ready-made)', 'pcs', 10);

-- opening balance (the trigger fills ingredient.stock_qty from these rows)
insert into stock_movement (branch_id, ingredient_id, movement_type, quantity_change, reference_type, reason, employee_id)
values
 (1,1,'receive', 3000,'opening','Opening balance',3),
 (1,2,'receive',10000,'opening','Opening balance',3),
 (1,3,'receive', 2000,'opening','Opening balance',3),
 (1,4,'receive',  800,'opening','Opening balance',3),
 (1,5,'receive', 4000,'opening','Opening balance',3),
 (1,6,'receive',   40,'opening','Opening balance',3);

insert into product (name, category, price, image, description, allergens) values
 ('Americano',    'coffee', 60, 'https://images.unsplash.com/photo-1551030173-122aabc4489c?w=200&h=200&fit=crop',
  'Espresso with hot water.', '{}'),
 ('Latte',        'coffee', 75, 'https://images.unsplash.com/photo-1542372147193-a7aca54189cd?w=200&h=200&fit=crop',
  'Espresso with steamed milk.', '{milk}'),
 ('Matcha Latte', 'tea',    80, 'https://images.unsplash.com/photo-1515823662972-da6a2e4d3002?w=200&h=200&fit=crop',
  'Japanese matcha whisked with milk.', '{milk}'),
 ('Croissant',    'bakery', 65, 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=200&h=200&fit=crop',
  'Flaky pastry made with wheat flour, butter and egg.', '{gluten,milk,egg}');

insert into recipe (product_id, size, ingredient_id, qty_per_serve) values
 (1,'M',1,18), (1,'L',1,22),
 (2,'M',1,18), (2,'M',2,180), (2,'L',1,22), (2,'L',2,240),
 (3,'M',4,6),  (3,'M',2,180), (3,'L',4,8),  (3,'L',2,240),
 (4,'M',6,1),  (4,'L',6,1);

insert into modifier (name, type, extra_price) values
 ('Sweet 50%',  'sweet',  0),
 ('Sweet 100%', 'sweet',  0),
 ('Oat milk',   'milk',  15),
 ('Extra shot', 'extra', 20),
 ('Warm it up', 'bakery', 0),
 ('Pack to go', 'bakery', 0);

-- modifiers that use extra ingredients (Sweet 100% = +15 ml syrup, Oat milk = +60 ml, Extra shot = +9 g beans)
insert into modifier_ingredient (modifier_id, ingredient_id, extra_qty) values
 (2,3,15),
 (3,5,60),
 (4,1,9);

insert into customer (phone_number, name) values
 ('0812345678', 'Somchai Jaidee'),
 ('0898765432', 'Malee Suayngam');

insert into promotion (name, discount_type, value, start_date, end_date)
values ('10% off', 'percent', 10, current_date - 1, current_date + 365);

-- pre-order opening hours / slot settings for the branch
insert into preorder_setting (branch_id) select branch_id from branch;
