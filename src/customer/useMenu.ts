import { useEffect, useState } from 'react'
import { loadMenu, type MenuData } from '../lib/menu'
import { todayStr, fmtDate } from '../lib/api'
import { money, CATEGORY_LABEL } from '../lib/pos'
import type { Promotion } from '../lib/types'

/* Load menu using loadMenu with offline caching. */
export function useMenu() {
  const [data, setData] = useState<MenuData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let on = true
    loadMenu()
      .then((r) => { if (on) setData(r.data) })
      .catch((e) => { if (on) setError(e instanceof Error ? e.message : 'Could not load the menu') })
    return () => { on = false }
  }, [])
  return { data, error }
}

/* Scale database images from 200x200 to 800x800. */
export const bigImg = (u: string | null | undefined): string | null =>
  u ? u.replace(/w=\d+&h=\d+/, 'w=800&h=800') : null

export const catLabel = (c: string): string => CATEGORY_LABEL[c] ?? c.charAt(0).toUpperCase() + c.slice(1)

export function activePromos(ps: Promotion[]): Promotion[] {
  const t = todayStr()
  return ps.filter((p) => p.status === 'active' && t >= p.start_date && t <= p.end_date)
}

export const promoText = (p: Promotion): string =>
  p.discount_type === 'percent' ? `${p.value}% off` : `${money(p.value)} off`

export const promoUntil = (p: Promotion): string => `Valid until ${fmtDate(p.end_date)}`
