-- 01 row level security
-- Supabase exposes every table to the browser through the anon key, so RLS is switched on
-- for ALL tables. A table with RLS on and no policy can't be read or written from the browser
-- at all - the app has to go through the functions in database/functions (security definer).

alter table branch                 enable row level security;
alter table employee               enable row level security;
alter table shift                  enable row level security;
alter table attendance             enable row level security;
alter table work_schedule          enable row level security;
alter table product                enable row level security;
alter table ingredient             enable row level security;
alter table recipe                 enable row level security;
alter table modifier               enable row level security;
alter table modifier_ingredient    enable row level security;
alter table supplier               enable row level security;
alter table supplier_ingredient    enable row level security;
alter table purchase_order         enable row level security;
alter table po_detail              enable row level security;
alter table ingredient_lot         enable row level security;
alter table stock_movement         enable row level security;
alter table customer               enable row level security;
alter table promotion              enable row level security;
alter table orders                 enable row level security;
alter table order_detail           enable row level security;
alter table order_detail_modifier  enable row level security;
alter table payment                enable row level security;
alter table point_transaction      enable row level security;
alter table audit_log              enable row level security;
alter table member_otp             enable row level security;
alter table member_session         enable row level security;
alter table offline_order_log      enable row level security;
alter table preorder_setting       enable row level security;
alter table preorder               enable row level security;
alter table preorder_item          enable row level security;
alter table preorder_item_modifier enable row level security;

-- the only things the browser may read directly (the POS and the customer menu need them)
create policy read_product    on product    for select using (true);
create policy read_modifier   on modifier   for select using (true);
create policy read_recipe     on recipe     for select using (true);
create policy read_ingredient on ingredient for select using (true);
create policy read_promotion  on promotion  for select using (status = 'active');
