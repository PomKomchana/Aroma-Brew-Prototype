import type { Member, Modifier, Product, Promotion } from './types'

export const POINT_RATE = 50 // 50 บาท = 1 แต้ม (FR-12) ต้องตรงกับฟังก์ชัน checkout ในฐานข้อมูล

export const CATEGORY_LABEL: Record<string, string> = {
  coffee: 'Coffee',
  tea: 'Tea',
  bakery: 'Bakery',
}
export const SIZE_LABEL: Record<string, string> = { M: 'M (Regular)', L: 'L (Large)' }
export const MODIFIER_GROUP_LABEL: Record<string, string> = {
  sweet: ' sweetness',
  milk: 'milk type',
  extra: 'extra',
}
/** กลุ่มที่เลือกได้อย่างเดียว */
export const SINGLE_GROUPS = ['sweet', 'milk']

export const PAYMENT_LABEL = { cash: 'Cash', card: 'Card', promptpay: 'PromptPay' } as const
export type PaymentMethod = keyof typeof PAYMENT_LABEL

export interface CartLine {
  key: string
  product: Product
  size: string
  modifiers: Modifier[]
  unitPrice: number
  qty: number
}

export interface ReceiptData {
  orderId: number
  lines: CartLine[]
  subtotal: number
  discount: number
  promoName: string | null
  total: number
  method: PaymentMethod
  received: number | null
  change: number
  member: Member | null
  earnedPoints: number
  time: Date
}

export function money(n: number): string {
  return (
    '฿' +
    n.toLocaleString('en-US', {
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: 2,
    })
  )
}

export function cartKey(productId: number, size: string, modifierIds: number[]): string {
  return `${productId}-${size}-${[...modifierIds].sort((a, b) => a - b).join(',')}`
}

export function discountOf(subtotal: number, promo: Promotion): number {
  const raw = promo.discount_type === 'percent' ? (subtotal * promo.value) / 100 : promo.value
  return Math.min(Math.round(raw * 100) / 100, subtotal)
}

/** เลือกโปรโมชันที่ลดได้มากที่สุดในวันนี้ (ส่วนลดอัตโนมัติ S06) */
export function bestPromotion(
  promos: Promotion[],
  subtotal: number,
): { promo: Promotion; amount: number } | null {
  if (subtotal <= 0) return null
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  let best: { promo: Promotion; amount: number } | null = null
  for (const p of promos) {
    if (p.status !== 'active' || today < p.start_date || today > p.end_date) continue
    const amount = discountOf(subtotal, p)
    if (amount > 0 && (!best || amount > best.amount)) best = { promo: p, amount }
  }
  return best
}

export function friendlyError(message: string): string {
  if (message.includes('ingredient_stock_qty_check')) return 'วัตถุดิบในสต็อกไม่พอสำหรับออเดอร์นี้'
  return message
}
