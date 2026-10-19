import { useEffect, useSyncExternalStore } from 'react'
import { rpc } from './api'
import type { StockAlerts } from './types'

/**
 * Low-stock / near-expiry alerts shared by the sidebar badge and the banners.
 * One fetch serves every subscriber; refreshStockAlerts() is called after anything that changes stock.
 */
let state: StockAlerts | null = null
let inflight = false
let again = false
const subs = new Set<() => void>()
const subscribe = (l: () => void) => {
  subs.add(l)
  return () => subs.delete(l)
}

export async function refreshStockAlerts(emp: number): Promise<void> {
  if (inflight) {
    again = true
    return
  }
  inflight = true
  try {
    state = await rpc<StockAlerts>('get_stock_alerts', { p_emp: emp })
    subs.forEach((l) => l())
  } catch {
    // keep the last known state (e.g. offline)
  } finally {
    inflight = false
    if (again) {
      again = false
      void refreshStockAlerts(emp)
    }
  }
}

export function useStockAlerts(emp: number | null, enabled: boolean): StockAlerts | null {
  const data = useSyncExternalStore(subscribe, () => state)
  useEffect(() => {
    if (!enabled || emp == null) return
    void refreshStockAlerts(emp)
    const t = setInterval(() => void refreshStockAlerts(emp), 60_000)
    return () => clearInterval(t)
  }, [emp, enabled])
  return enabled ? data : null
}
