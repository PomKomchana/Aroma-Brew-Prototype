export type Role = 'owner' | 'cashier' | 'stock'

export interface Employee {
  employee_id: number
  name: string
  role: Role
  branch_id: number
}

export interface Product {
  product_id: number
  name: string
  category: string
  price: number
  image: string | null
  is_active: boolean
}

export interface Modifier {
  modifier_id: number
  name: string
  type: string
  extra_price: number
}

export interface Promotion {
  promotion_id: number
  name: string
  discount_type: 'percent' | 'fixed'
  value: number
  start_date: string
  end_date: string
  status: string
}

export interface Member {
  phone_number: string
  masked_phone: string
  name: string
  points: number
  tier: string
}

export interface ShiftSummary {
  shift_id: number
  open_time: string
  opening_cash: number
  orders: number
  total_sales: number
  by_method: Partial<Record<'cash' | 'card' | 'promptpay', number>>
  closed: boolean
}

export interface CloseResult {
  total_sales: number
  cash_sales: number
  expected_cash: number
  counted_cash: number
  cash_diff: number
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'owner',
  cashier: 'cashier',
  stock: 'stock',
}

export const HOME_BY_ROLE: Record<Role, string> = {
  owner: '/dashboard',
  cashier: '/shift',
  stock: '/stock',
}

// Stock [S10-S12]
export interface IngredientRow {
  ingredient_id: number
  name: string
  unit: string
  stock_qty: number
  reorder_point: number
  expiry_alert_days: number
  low: boolean
  near_expiry: boolean
  nearest_expiry: string | null
}

export interface MovementRow {
  movement_id: number
  movement_date: string
  ingredient: string
  unit: string
  movement_type: 'sale' | 'receive' | 'adjust' | 'waste' | 'return'
  quantity_change: number
  reason: string | null
  employee: string
}

// Orders / Reports
export interface OrderRow {
  order_id: number
  order_date: string
  status: 'paid' | 'cancelled'
  total_price: number
  discount_amount: number
  cancel_reason: string | null
  has_member: boolean
  cashier: string
  shift_id: number
  method: string | null
  items: string | null
  shift_closed: boolean
}

export interface AuditRow {
  log_id: number
  created_at: string
  employee: string
  action: string
  table_name: string
  record_id: number | null
  old_value: string | null
  new_value: string | null
}

// Owner
export interface DashboardData {
  sales: number
  orders: number
  discount: number
  cost: number
  profit: number
  by_day: { day: string; sales: number; orders: number }[]
  top_products: { name: string; qty: number; revenue: number }[]
  by_method: Partial<Record<'cash' | 'card' | 'promptpay', number>>
  stock_value: number
  low_stock: number
}

export interface RecipeRow {
  size: string
  ingredient_id: number
  qty_per_serve: number
}

export interface AdminProduct {
  product_id: number
  name: string
  category: string
  price: number
  image: string | null
  is_active: boolean
  recipes: RecipeRow[]
}

export interface EmployeeRow {
  employee_id: number
  name: string
  role: Role
  status: 'active' | 'inactive'
}
