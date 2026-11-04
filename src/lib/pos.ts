import type { Member, Modifier, Product, Promotion } from './types'

export const POINT_RATE = 50 // 50 baht = 1 point [FR-12]. Must match the checkout function in the database

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
/** Modifier groups where only one option can be chosen */
export const SINGLE_GROUPS = ['sweet', 'milk']

const DRINK_GROUPS = ['sweet', 'milk', 'extra']
export const GROUPS_BY_CATEGORY: Record<string, string[]> = {
  coffe: DRINK_GROUPS,
  tea: DRINK_GROUPS,
  bakery: ['bakery'],
}
MODIFIER_GROUP_LABEL.bakery = 'Serving'

export const isDrink = (category: string) => category !== 'bakery'
export const groupsFor = (category: string) => GROUPS_BY_CATEGORY[category] ?? DRINK_GROUPS

export const ALLERGEN_LABEL: Record<string, string> = {
  gluten: 'Gluten (wheat)', milk: 'Milk', egg: 'Egg', soy: 'Soy',
  nuts: 'Tree nuts', peanut: 'Peanuts', sesame: 'Sesame',
}

const ALLERGEN_RULES: [string, RegExp, RegExp][] = [
  ['gluten', /\b(wheat|flour|bread|croissant|pastry|dough|bun|cake|cookie|biscuit|cracker|pasta|noodle|barley|rye|oat|malt|brownie|muffin|toast|waffle|pancake|scone|donut|doughnut)(?:s|es)?\b/, /แป้ง|ข้าวสาลี|ขนมปัง|ครัวซองต์|เค้ก|คุกกี้|ข้าวโอ๊ต/],
  ['milk', /\b(milk|cream|butter|cheese|yogurt|yoghurt|whey|custard|ghee|latte|cappuccino|croissant)(?:s|es)?\b/, /นม|เนย|ครีม|ชีส|โยเกิร์ต/],
  ['egg', /\b(egg|mayonnaise|meringue|custard|croissant)(?:s|es)?\b/, /ไข่(?!มุก)/],
  ['soy', /\b(soy|soya|tofu|edamame|miso|lecithin)(?:s|es)?\b/, /ถั่วเหลือง|เต้าหู้/],
  ['nuts', /\b(almond|walnut|cashew|pistachio|hazelnut|pecan|macadamia)(?:s|es)?\b/, /อัลมอนด์|วอลนัท|เม็ดมะม่วง|พิสทาชิโอ|เฮเซลนัท/],
  ['peanut', /\b(peanut|groundnut)(?:s|es)?\b/, /ถั่วลิสง/],
  ['sesame', /\b(sesame|tahini)(?:s|es)?\b/, /งา/],
]

/** Guesses allergens from text (name / description / ingredients). This is only a suggestion; the owner must verify it. Each rule has an English and a Thai pattern. */
export function detectAllergens(texts: string[]): string[] {
  const t = texts
    .join(' ')
    .toLowerCase()
    .replace(/\b(oat|soy|soya|almond|coconut|rice)\s+milk\b/g, '$1')
    .replace(/\b(peanut|almond|cashew|cocoa|shea)\s+butter\b/g, '$1')
  return ALLERGEN_RULES.filter(([, en, th]) => en.test(t) || th.test(t)).map(([k]) => k)
}

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
  orderId: number | string // offline bills use 'OFF-0001' until they are synced
  pending?: boolean
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

/** Picks the promotion that gives the biggest discount today [automatic discount, S06] */
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
  if (message.includes('ingredient_stock_qty_check')) return 'Not enough ingredient stock for this order'
  return message
}
