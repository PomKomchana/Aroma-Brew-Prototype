import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { cartKey } from '../lib/pos'

/** Only ids are stored; names and prices always come from the live menu */
export interface BasketLine { key: string; product_id: number; size: string; modifier_ids: number[]; qty: number }
const KEY = 'aroma-brew-basket-v1'

interface BasketState {
  lines: BasketLine[]
  count: number
  add: (l: Omit<BasketLine, 'key'>) => void
  setQty: (key: string, qty: number) => void
  remove: (key: string) => void
  clear: () => void
}
const Ctx = createContext<BasketState | null>(null)

function load(): BasketLine[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

export function BasketProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<BasketLine[]>(load)
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(lines)) } catch { /* ignore */ } }, [lines])

  const add = useCallback((l: Omit<BasketLine, 'key'>) => {
    const key = cartKey(l.product_id, l.size, l.modifier_ids)
    setLines((prev) => prev.some((x) => x.key === key)
      ? prev.map((x) => x.key === key ? { ...x, qty: Math.min(20, x.qty + l.qty) } : x)
      : [...prev, { ...l, key, qty: Math.min(20, l.qty) }])
  }, [])
  const setQty = useCallback((key: string, qty: number) =>
    setLines((p) => p.map((x) => x.key === key ? { ...x, qty: Math.max(1, Math.min(20, qty)) } : x)), [])
  const remove = useCallback((key: string) => setLines((p) => p.filter((x) => x.key !== key)), [])
  const clear = useCallback(() => setLines([]), [])

  return <Ctx.Provider value={{ lines, count: lines.reduce((s, l) => s + l.qty, 0), add, setQty, remove, clear }}>{children}</Ctx.Provider>
}

export function useBasket(): BasketState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useBasket must be used within BasketProvider')
  return v
}
