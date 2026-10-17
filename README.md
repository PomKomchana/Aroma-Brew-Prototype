# Aroma Brew (CPE230)

React + TypeScript + Vite / Supabase (PostgreSQL)

## ตั้งค่า
1. Supabase → SQL Editor → รัน `sql/01_schema.sql` (ถ้ายังไม่ได้รัน) แล้วรัน `sql/02_helpers.sql`
2. Supabase → Project Settings → API → คัดลอก Project URL และ anon public key
3. `cp .env.example .env` แล้วใส่สองค่านั้น
4. `npm install` แล้ว `npm run dev`

## Deploy (Vercel)
ใส่ Environment Variables `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` ในหน้า Settings ของโปรเจกต์ แล้ว Deploy

## บัญชีทดลอง
1 = owner1234 | 2 = cashier1234 | 3 = stock1234  (รหัสพนักงาน = เลขหน้าเครื่องหมาย =)
