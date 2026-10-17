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
