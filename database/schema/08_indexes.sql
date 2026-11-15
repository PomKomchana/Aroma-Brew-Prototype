-- 08 indexes (primary keys / unique constraints already have their own)

-- sales
create index on orders (shift_id);
create index on orders (order_date);
create index on order_detail (order_id);

-- stock ledger
create index on stock_movement (ingredient_id, movement_date);

-- purchasing
create index purchase_order_status_idx on purchase_order (status);
create index ingredient_lot_po_idx     on ingredient_lot (po_id);

-- pre-orders
create index preorder_status_pickup_idx on preorder (status, pickup_time);
create index preorder_customer_idx      on preorder (customer_phone, preorder_id desc);
create index preorder_item_preorder_idx on preorder_item (preorder_id);
create index preorder_item_mod_item_idx on preorder_item_modifier (preorder_item_id);
