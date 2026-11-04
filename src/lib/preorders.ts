import { useEffect, useState } from 'react'
import { rpc } from './api'
import type { PreorderStatus } from './types'

export const STATUS_LABEL: Record<PreorderStatus, string> = {
  placed: 'Received', preparing: 'Preparing', ready: 'Ready for pickup',
  collected: 'Collected', cancelled: 'Cancelled', no_show: 'Not collected',
}
export const isActive = (s: PreorderStatus) => s === 'placed' || s === 'preparing' || s === 'ready'

/** Store time (Asia/Bangkok) so the time is the same on every device */
export const fmtPickup = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })

export const orderNo = (id: number): string => `#${String(id).padStart(4, '0')}`

/** Counts for the staff nav badge; polls every 20s */
export function usePreorderCounts(emp: number | null, enabled: boolean) {
  const [c, setC] = useState<{ placed: number; preparing: number; ready: number } | null>(null)
  useEffect(() => {
    if (!enabled || emp == null) return
    let on = true
    const load = () => rpc<{ placed: number; preparing: number; ready: number }>('get_preorder_counts', { p_emp: emp })
      .then((r) => on && setC(r)).catch(() => {})
    load()
    const t = setInterval(load, 20000)
    return () => { on = false; clearInterval(t) }
  }, [emp, enabled])
  return c
}
