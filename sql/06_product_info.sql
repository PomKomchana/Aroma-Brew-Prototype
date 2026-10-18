-- 06: Product description + allergens + bakery options
alter table product add column if not exists description text;
alter table product add column if not exists allergens text[] not null default '{}';

update product set description='Espresso with hot water.', allergens='{}' where name='Americano';
update product set description='Espresso with steamed milk.', allergens='{milk}' where name='Latte';
update product set description='Japanese matcha whisked with milk.', allergens='{milk}' where name='Matcha Latte';
update product set description='Flaky pastry made with wheat flour, butter and egg.', allergens='{gluten,milk,egg}' where name='Croissant';

insert into modifier (name, type, extra_price)
select v.name, 'bakery', 0
from (values ('Warm it up'), ('Pack to go')) as v(name)
where not exists (select 1 from modifier m where m.name = v.name and m.type = 'bakery');
