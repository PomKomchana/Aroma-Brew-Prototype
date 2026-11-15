-- reset.sql - wipes everything this project created in the "public" schema.
-- DEV ONLY. It deletes all data. Never run it on a database that has real data.
-- Afterwards run again: schema/ -> functions/ -> security/ -> seed/

drop schema public cascade;
create schema public;

-- Supabase expects these grants on public after it is recreated
grant usage on schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
