-- 01 extensions
-- pgcrypto is used for password hashing (crypt / gen_salt) in login, upsert_employee and OTP.
-- Supabase keeps extensions in their own schema, so functions that call crypt()
-- have "extensions" in their search_path.
create extension if not exists pgcrypto with schema extensions;
