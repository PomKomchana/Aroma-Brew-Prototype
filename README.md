# Aroma Brew (CPE230)

ระบบจัดการร้านกาแฟและเบเกอรี่ (Recipe-based Inventory + POS) — Prototype สำหรับวิชา CPE230 การออกแบบและการจัดการระบบฐานขอมูล

**Stack:** React 18 + Vite + TypeScript · Supabase (PostgreSQL + RPC) · Vercel (deploy)

## ตั้งค่า

1. Supabase → SQL Editor → รันไฟล์ในโฟลเดอร์ `sql/` **ตามลำดับ**

   | ไฟล์ | เนื้อหา |
   |---|---|
   | `01_schema.sql` | 24 ตาราง, trigger (ตัดสต็อก, กัน stock_qty ถูกแก้ตรง, log แก้/ลบไม่ได้), RLS, RPC หลัก (`login`, `open_shift`, `checkout`, `close_shift`), ข้อมูลตัวอย่าง |
   | `02_helpers.sql` | `get_open_shift` |
   | `03_pos_functions.sql` | `find_member`, `get_shift_summary`, รูปเมนูตัวอย่าง |
   | `04_stock_owner_functions.sql` | Stock, Owner, Orders/ยกเลิกบิล, Audit Log, ราคาซัพพลายเออร์ตัวอย่าง |
   | `05`–`08` | เว็บสมาชิก (OTP), ข้อมูลสินค้า, Owner แก้ข้อมูลสินค้า, Offline sync |
   | `09_requirements.sql` | แจ้งเตือนสต็อก, ลบบัญชีพนักงาน, รับของตามใบสั่งซื้อ, รายงานวัน/เดือน/ปี, ซัพพลายเออร์, ใบสั่งซื้อ (รันซ้ำได้) |

   > `01_schema.sql` และส่วน seed ท้าย `04` รันซ้ำไม่ได้ (สร้างตาราง/insert ซ้ำ) ถ้าจะเริ่มใหม่ให้ reset schema ก่อน ส่วนฟังก์ชันใน `02`–`04` ใช้ `create or replace` รันซ้ำได้

2. Supabase → Project Settings → API → คัดลอก Project URL และ anon public key
3. `cp .env.example .env` แล้วใส่สองค่านั้น
4. `npm install` แล้ว `npm run dev`

## บัญชีทดลอง

ล็อกอินด้วยรหัสพนักงาน (ตัวเลข) + รหัสผ่าน

| รหัสพนักงาน | รหัสผ่าน | บทบาท |
|---|---|---|
| 1 | `owner1234` | Owner |
| 2 | `cashier1234` | Cashier |
| 3 | `stock1234` | Stock Clerk |

(ลบปุ่มบัญชีทดลองใน `src/pages/Login.tsx` ก่อนใช้งานจริง)

## หน้าจอ (อ้างอิง S01–S18 ในสไลด์ Submission 2)

| บทบาท | หน้า | Route | สถานะ |
|---|---|---|---|
| ทุกบทบาท | S01 Login | `/login` | ✅ |
| Cashier | S02 เปิดกะ | `/shift` | ✅ |
| Cashier | S03–S07 POS, Modifier, ค้นหาสมาชิก, ชำระเงิน, ใบเสร็จ | `/pos` | ✅ |
| Cashier | S08 คิวออเดอร์ / ยกเลิกบิล (เฉพาะกะที่เปิด) | `/orders` | ✅ |
| Cashier | S09 ปิดกะ (นับเงินสด) | `/close-shift` | ✅ |
| Stock / Owner | S10–S12 สต็อก, รับของเข้า (อ้างอิงใบสั่งซื้อ / ไม่มีใบสั่งซื้อ), ตรวจนับ, ประวัติ movement, ตั้งจุดสั่งซื้อ + แจ้งเตือนใกล้หมด | `/stock` | ✅ |
| Stock / Owner | ซัพพลายเออร์ + วัตถุดิบที่ส่งแต่ละราย (ราคา/หน่วย, lead time) | `/suppliers` | ✅ |
| Stock / Owner | ใบสั่งซื้อ: draft → sent → partial → received / cancelled | `/purchasing` | ✅ |
| Owner | S13 Dashboard | `/dashboard` | ✅ |
| Owner | S14 สินค้า/สูตร | `/products` | ✅ (ยังไม่มีหน้าแก้ Modifier) |
| Owner | S15 พนักงาน (เพิ่ม/แก้/ปิดใช้งาน/**ลบ** cashier และ stock) | `/employees` | ✅ |
| Owner | S16 โปรโมชัน | `/promotions` | ✅ |
| Owner | S17 รายงานยอดขายแยกโหมด วัน/เดือน/ปี/ช่วงเวลาเอง (+CSV), รายการบิล, Audit Log, ยกเลิกบิลหลังปิดกะ | `/reports` | ✅ |
| ลูกค้า | S18 เว็บตรวจแต้ม (เบอร์ + OTP) | `/member` | — | ✅ |
| ทุกบทบาท | Offline queue + sync (NFR-04) | — | ✅|

นอกขอบเขต SRS (ที่ตัดออก): จองโต๊ะ, Pre-order, ลงเวลางาน (Attendance มีตารางไว้สำหรับเฟส 2 แต่ยังไม่มีหน้าจอ)

## โครงสร้างโปรเจกต์

```
sql/                      สคริปต์ฐานข้อมูล (รันตามลำดับด้านบน)
src/
  auth/                   AuthContext (session + กะ), RequireRole (กั้นหน้าตามบทบาท)
  components/             Shell (sidebar + สถานะ Online), ProductModal, Receipt, OrdersTable
  lib/
    supabase.ts           client
    api.ts                rpc() helper + format วันที่/จำนวน
    pos.ts                ค่าคงที่และฟังก์ชันคำนวณฝั่ง POS (POINT_RATE, ส่วนลด ฯลฯ)
    types.ts              type ของข้อมูลทั้งหมด
  pages/                  หน้าจอตามตารางด้านบน
  styles.css              สไตล์ทั้งหมด (palette espresso/amber/cream ตาม Figma เดิม)
```

## หลักการออกแบบที่ใช้

- **Frontend เรียกผ่าน RPC** ทุกการเขียนข้อมูลทำใน PostgreSQL function (`security definer`) ไม่ insert ตรงจากหน้าเว็บ
- **ตัดสต็อกตามสูตร**: `checkout` สร้าง `stock_movement` ประเภท `sale` ใน transaction เดียวกับการชำระเงินและแต้ม (ล้มเหลวก็ rollback ทั้งหมด)
- **`stock_qty` เป็นค่า derived**: เปลี่ยนได้ผ่าน `stock_movement` เท่านั้น (trigger กัน) ตรวจความตรงกันได้ด้วย `select * from v_stock_check;` (ต้องว่างเสมอ)
- **Audit trail**: ยกเลิกบิล, เปลี่ยนราคา, ปรับสต็อก, จัดการพนักงาน/โปรโมชัน บันทึกใน `audit_log` และ `audit_log` / `stock_movement` แก้หรือลบไม่ได้
- **Soft delete**: สินค้าใช้ `is_active`, ซัพพลายเออร์ใช้ `is_active`
- **ลบบัญชีพนักงาน** (`delete_employee`, Owner เท่านั้น, เฉพาะ cashier/stock): ถ้าไม่เคยมีประวัติจะลบแถวจริง ถ้ามีบิล/กะ/movement/audit log อ้างอิงอยู่ จะเก็บเข้าคลัง (`status = 'deleted'`, สุ่มรหัสผ่านใหม่, ซ่อนจากรายการ) เพื่อไม่ให้ประวัติเสีย
- **ใบสั่งซื้อ**: `draft → sent → partial → received` (ยกเลิกได้ตอน draft/sent, ปิดแบบรับไม่ครบได้ตอน partial) `receive_po` สร้าง lot ต่อการรับแต่ละครั้ง พร้อมจำนวนจริง ราคาต่อหน่วยจริง และวันหมดอายุ ต้นทุนใน Dashboard ใช้ราคาจริงจาก lot
- **ยกเลิกบิล**: cashier ทำได้เฉพาะบิลตัวเองในกะที่ยังเปิด หลังปิดกะต้องเป็น Owner; ระบบคืนสต็อก (`return`) และหักแต้มที่ได้ให้อัตโนมัติ
- **ต้นทุน/กำไร (Dashboard)**: ต้นทุนวัตถุดิบ = ปริมาณตามสูตรที่ใช้จริง × ต้นทุนต่อหน่วย (ค่าเฉลี่ยถ่วงน้ำหนักของ lot ที่รับเข้า ถ้ายังไม่มี lot ใช้ราคา supplier) จึงเป็นค่าประมาณ

## ข้อจำกัดของ Prototype

- **ไม่ได้ใช้ Supabase Auth**: login เป็น RPC ที่ตรวจรหัสผ่านด้วย bcrypt และ client ส่ง `employee_id` มาเอง ฟังก์ชันตรวจ role ฝั่งฐานข้อมูล (`assert_role`) แต่เชื่อ id ที่ส่งมา ผู้ที่ถือ anon key และรู้ id สามารถเรียก RPC ตรงได้ ถ้าขึ้น production ต้องเปลี่ยนเป็น Supabase Auth/JWT และใช้ `auth.uid()` แทน
- ฟังก์ชัน `find_member` ส่งเบอร์แบบปิดบังบางส่วน (08x-xxx-1234) ตามหัวข้อ Privacy
- วันหมดอายุคำนวณจาก lot ล่าสุดที่ยังครอบคลุมยอดคงเหลือ (ไม่ได้ติดตามยอดคงเหลือราย lot)
- ยังไม่มีการล็อกบัญชีชั่วคราวเมื่อกรอกรหัสผิดหลายครั้ง และ session ยังไม่หมดอายุ (อยู่ใน `sessionStorage` จนปิดแท็บ)

- รายงานยอดขายแบ่ง วัน/เดือน ตามเวลาท้องถิ่น `Asia/Bangkok` (ฟังก์ชัน `to_local` ใน `09`) ขณะที่ Dashboard และแท็บ Bills เดิมยังใช้วันที่ตามเขตเวลาของฐานข้อมูล (UTC บน Supabase) บิลช่วง 00:00–07:00 น. เวลาไทยอาจอยู่คนละวันระหว่างสองหน้านี้
- ยังไม่มีหน้าเพิ่ม/แก้ชื่อวัตถุดิบ (ใบสั่งซื้อและซัพพลายเออร์เลือกจากวัตถุดิบที่มีอยู่แล้ว)

## Deploy (Vercel)

ใส่ Environment Variables `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` ในหน้า Settings ของโปรเจกต์ แล้ว Deploy (ใช้ `vercel.json` ที่มีให้)

> อย่า commit ไฟล์ `.env` — ตรวจว่าอยู่ใน `.gitignore`
