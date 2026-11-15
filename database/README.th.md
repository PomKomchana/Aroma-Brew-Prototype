[English](README.md) | **ไทย**

# database

Schema PostgreSQL ของ Aroma Brew (Supabase) ทุกอย่างมีนิยามเดียว เป็นเวอร์ชันสุดท้าย

หน้าเว็บไม่เขียนลงตารางตรง ๆ แต่เรียกฟังก์ชันใน `functions/` ผ่าน `supabase.rpc()` และให้ฐานข้อมูลบังคับกฎเอง (สต็อก, สิทธิ์, audit)

## โฟลเดอร์และลำดับการรัน

```
schema/     ตาราง, index, trigger, view
functions/  logic ทั้งหมดที่หน้าเว็บเรียกผ่าน rpc
security/   RLS และสิทธิ์เรียกฟังก์ชัน
seed/       ข้อมูลตัวอย่าง
```

รันตามลำดับ **schema → functions → security → seed** และในแต่ละโฟลเดอร์ให้รันตามเลขหน้าไฟล์ ตารางมี foreign key ถึงกัน ถ้าสลับลำดับจะ error

### schema/

| ไฟล์ | มีอะไร |
|---|---|
| 01_extensions | pgcrypto (เข้ารหัสรหัสผ่าน) |
| 02_tables_core | branch, employee, shift, attendance, work_schedule |
| 03_tables_menu | product, ingredient, recipe, modifier, modifier_ingredient |
| 04_tables_inventory | supplier, supplier_ingredient, purchase_order, po_detail, ingredient_lot, stock_movement |
| 05_tables_sales | customer, promotion, orders, order_detail, order_detail_modifier, payment, point_transaction |
| 06_tables_system | audit_log, member_otp, member_session, offline_order_log |
| 07_tables_preorder | preorder_setting, preorder, preorder_item, preorder_item_modifier |
| 08_indexes | index |
| 09_triggers_views | trigger ตัดสต็อก, ตัวกัน `stock_qty`, log แบบเพิ่มได้อย่างเดียว, `v_stock_check` |

### functions/

| ไฟล์ | เกี่ยวกับ |
|---|---|
| 01_helpers | `assert_role` (เช็กสิทธิ์), `log_audit`, ต้นทุนวัตถุดิบ, แปลงเวลาไทย |
| 02_auth_employee | login, จัดการพนักงาน |
| 03_shift_pos | เปิด/ปิดกะ, `checkout`, ค้นหาสมาชิก, รายการบิล, ยกเลิกบิล |
| 04_offline_sync | ซิงก์บิลที่ขายตอนออฟไลน์ |
| 05_stock | สต็อก, แจ้งเตือน, รับของ, ตรวจนับ |
| 06_purchasing | ซัพพลายเออร์, ใบสั่งซื้อ, รับของตามใบสั่งซื้อ |
| 07_products_promotions | สินค้า/สูตร, โปรโมชัน |
| 08_reports | dashboard, รายงานยอดขาย, audit log |
| 09_member_portal | เข้าสู่ระบบด้วย OTP, ข้อมูลสมาชิก, รายชื่อสาขา |
| 10_preorder | สั่งล่วงหน้า (ฝั่งลูกค้า ฝั่งพนักงาน และตั้งค่า) |

ทุกไฟล์ใช้ `create or replace` รันซ้ำได้

### security/

- `01_rls` เปิด Row Level Security ทุกตาราง เบราว์เซอร์อ่านตรง ๆ ได้แค่ `product`, `modifier`, `recipe`, `ingredient` และ `promotion` ที่ active ที่เหลือต้องผ่านฟังก์ชัน
- `02_grants` กำหนดว่าเบราว์เซอร์เรียกฟังก์ชันไหนได้ ฟังก์ชันภายใน (`assert_role`, `log_audit`, `take_stock_offline`, `ingredient_unit_cost`, `to_local` และตัวช่วย `preorder_*`) ถูก revoke จาก `anon` / `authenticated` ถ้าเพิ่มฟังก์ชันที่ควรถูกเรียกโดยฟังก์ชันอื่นเท่านั้น ให้ revoke ที่ไฟล์นี้ด้วย เพราะ Supabase เปิดให้เรียกทุกฟังก์ชันใน `public` โดยปริยาย

### seed/

- `01_base_data` สาขา, บัญชีทดลอง 3 บัญชี, วัตถุดิบพร้อมยอดยกมา, เมนู, สูตร, modifier, ลูกค้าตัวอย่าง, โปรโมชัน
- `02_suppliers` ซัพพลายเออร์ 2 เจ้าและราคา

seed รันซ้ำไม่ได้ (จะ insert ซ้ำ)

## ตั้งค่าใน Supabase

1. เปิด **SQL Editor** → New query
2. วางทีละไฟล์ตามลำดับด้านบนแล้วกด Run (23 ไฟล์)

ถ้าอยากวางครั้งเดียว ให้รวมไฟล์ก่อน:

```bash
cat schema/*.sql functions/*.sql security/*.sql seed/*.sql > all.sql
```

(`all.sql` ใช้ส่งขึ้น Supabase อย่างเดียว ไม่ต้อง commit)

### เริ่มใหม่

`reset.sql` ลบและสร้าง schema `public` ใหม่ทั้งหมด **ข้อมูลหายหมด** ใช้กับฐานข้อมูล dev เท่านั้น แล้วรันทุกไฟล์ตามลำดับเดิมอีกรอบ

## เช็กว่าตั้งค่าถูก

```sql
-- ควรได้ 0 แถว ถ้ามีแถว แปลว่า stock_qty ไม่ตรงกับประวัติ stock_movement
select * from v_stock_check;

-- ได้ 31 ตาราง และทุกตัวเปิด RLS
select count(*), bool_and(rowsecurity) from pg_tables where schemaname = 'public';

-- ควรได้ json ของพนักงาน
select login(2, 'cashier1234');
```

## กฎที่ฐานข้อมูลบังคับ

- **สต็อกเปลี่ยนได้ทางเดียวคือผ่าน `stock_movement`** เพิ่มแถวแล้ว trigger จะอัปเดต `ingredient.stock_qty` ให้ ถ้า update `stock_qty` ตรง ๆ จะ error
- **`stock_movement` กับ `audit_log` เพิ่มได้อย่างเดียว** update/delete ถูก trigger กันไว้ ถ้าบันทึกผิดให้เพิ่มแถวมาแก้
- **`checkout` เป็น transaction เดียว:** บิล, รายการ, modifier, ตัดสต็อกตามสูตร, โปรโมชัน, ชำระเงิน และแต้มสมาชิก ถ้าขั้นไหน error จะ rollback ทั้งหมด
- **สั่งล่วงหน้าไม่ใช่บิล** `complete_preorder` เรียก `checkout` ตอนแคชเชียร์รับชำระเงิน สต็อก แต้ม โปรโมชัน และรายงานจึงทำงานเหมือนการขายปกติ
- **ฟังก์ชันฝั่งพนักงานรับ employee id เป็นอาร์กิวเมนต์แรก** แล้วเช็กด้วย `assert_role` ฟังก์ชันพนักงานตัวใหม่ควรขึ้นต้นด้วย `perform assert_role(p_emp, array[...])` (หรือ `e := assert_role(...)` ถ้าต้องใช้ข้อมูลพนักงาน)
- **ฟังก์ชันที่อ่าน/เขียนตารางเป็น `security definer`** และกำหนด `search_path` ไว้ ให้คง `set search_path = public` (เพิ่ม `extensions` ถ้าเรียก `crypt()`)
