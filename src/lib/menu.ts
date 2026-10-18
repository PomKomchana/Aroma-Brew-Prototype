import { supabase } from './supabase'
import type { Modifier, Product, Promotion } from './types'

/** ข้อมูลที่ POS ต้องใช้ขายของ เก็บสำเนาไว้ในเครื่องเพื่อใช้ตอนออฟไลน์ [NFR-04] */
export interface MenuData {
  products: Product[]
  modifiers: Modifier[]
  promos: Promotion[]
  sizes: Record<number, string[]>
  ingredientsOf: Record<number, string[]>
}

export interface MenuResult {
  data: MenuData
  fromCache: boolean
  cachedAt: string | null
}

const KEY = 'aroma-brew-menu-v1'
const TIMEOUT_MS = 8000

function withTimeout<T>(p: PromiseLike<T>): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Request timed out')), TIMEOUT_MS)),
  ])
}

async function fetchMenu(): Promise<MenuData> {
  const [p, m, r, pr, ing] = await withTimeout(
    Promise.all([
      supabase.from('product').select('*').eq('is_active', true).order('product_id'),
      supabase.from('modifier').select('*').order('modifier_id'),
      supabase.from('recipe').select('product_id,size, ingredient_id'),
      supabase.from('promotion').select('*'),
      supabase.from('ingredient').select('ingredient_id,name'),
    ]),
  )
  const err = p.error ?? m.error ?? r.error ?? pr.error ?? ing.error
  if (err) throw new Error(err.message)

  const sizes: Record<number, string[]> = {}
  const ingredientsOf: Record<number, string[]> = {}
  const names = new Map(((ing.data ?? []) as { ingredient_id: number; name: string }[]).map((i) => [i.ingredient_id, i.name]))
  for (const row of (r.data ?? []) as { product_id: number; size: string; ingredient_id: number }[]) {
    const list = (sizes[row.product_id] ??= [])
    if (!list.includes(row.size)) list.push(row.size)
    const n = names.get(row.ingredient_id)
    const il = (ingredientsOf[row.product_id] ??= [])
    if (n && !il.includes(n)) il.push(n)
  }
  for (const k of Object.keys(sizes)) sizes[Number(k)].sort()

  return {
    products: (p.data ?? []) as Product[],
    modifiers: (m.data ?? []) as Modifier[],
    promos: (pr.data ?? []) as Promotion[],
    sizes,
    ingredientsOf,
  }
}

/**
 * โหลดเมนู: ออนไลน์ -> ดึงจาก Supabase แล้วอัปเดตสำเนาในเครื่อง
 *            ออฟไลน์/ดึงไม่ได้ -> ใช้สำเนาล่าสุด (ถ้าไม่เคยโหลดเลยจะ throw)
 */
export async function loadMenu(): Promise<MenuResult> {
  if (navigator.onLine) {
    try {
      const data = await fetchMenu()
      try {
        localStorage.setItem(KEY, JSON.stringify({ data, cachedAt: new Date().toISOString() }))
      } catch {
        /* เต็ม/ปิดใช้ localStorage: ใช้งานออนไลน์ต่อได้ แค่ไม่มีสำเนา */
      }
      return { data, fromCache: false, cachedAt: null }
    } catch (e) {
      const cached = readCache()
      if (cached) return cached
      throw e
    }
  }
  const cached = readCache()
  if (cached) return cached
  throw new Error('No saved menu on this device yet. Connect to the internet and open the POS once.')
}

function readCache(): MenuResult | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const { data, cachedAt } = JSON.parse(raw) as { data: MenuData; cachedAt: string }
    return { data, fromCache: true, cachedAt }
  } catch {
    return null
  }
}
