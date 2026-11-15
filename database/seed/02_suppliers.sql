-- 02 suppliers and what each one sells (price per unit, lead time in days)
-- Run after 01_base_data.sql.

insert into supplier (name, contact_name, phone_number)
values ('Default Supplier', 'Sales', '0800000000');

insert into supplier (name, contact_name, phone_number, address)
values ('Bean & Leaf Trading', 'Khun Ploy', '0891112222', 'Bangkok');

-- Default Supplier sells everything
insert into supplier_ingredient (supplier_id, ingredient_id, unit_price, lead_time_days)
select 1, i.ingredient_id,
       case i.name when 'Coffee beans'  then 0.80
                   when 'Fresh milk'    then 0.04
                   when 'Syrup'         then 0.05
                   when 'Matcha powder' then 2.50
                   when 'Oat milk'      then 0.09
                   else 20 end,   -- croissant, per piece
       3
  from ingredient i;

-- Bean & Leaf only sells coffee beans and matcha (slightly different price, faster delivery)
insert into supplier_ingredient (supplier_id, ingredient_id, unit_price, lead_time_days)
select 2, i.ingredient_id, case when i.name = 'Matcha powder' then 2.40 else 0.85 end, 2
  from ingredient i
 where i.name in ('Coffee beans', 'Matcha powder');
