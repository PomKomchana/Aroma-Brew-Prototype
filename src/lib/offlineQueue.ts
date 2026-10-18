import { useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import type { PaymentMethod } from './pos'

/**
 * Offline queue [NFR-04]
 * - ตอนออฟไลน์: เก็บออเดอร์ที่ชำระแล้วลง localStorage (สูงสุด 500 บิล ตาม SRS)
 * - ตอนกลับมาออนไลน์: ส่งทีละบิลตามลำดับเวลาผ่าน RPC sync_offline_order (idempotent ด้วย clientId)
 * - error จากฐานข้อมูล (มี code) = บิลนี้ใช้ไม่ได้ -> status 'failed' รอคนตัดสิน
 *   error จากเครือข่าย (ไม่มี code) = หยุดและลองใหม่รอบหน้า ไม่ทิ้งบิล
 */

export const OFFLINE_METHODS: PaymentMethod[] = ['cash'] // ออฟไลน์รับเงินสดอย่างเดียว (บัตร/พร้อมเพย์ต้องใช้เครือข่าย)
export const MAX_QUEUE = 500
const QUEUE_KEY = 'aroma-brew-offline-queue-v1'
const SEQ_KEY = 'aroma-brew-offline-seq'

export interface QueuedOrder {
  clientId: string
  localNo: number
  employeeId: number
  shiftId: number
  createdAt: string
  phone: string | null
  promotionId: number | null
  items: { product_id: number; size: string; quantity: number; modifier_ids: number[] }[]
  method: PaymentMethod
  total: number
  status: 'pending' | 'failed'
  error?: string
}

export const localLabel = (n: number) => `OFF-${String(n).padStart(4, '0')}`

// ---------- storage + store ----------
const listeners = new Set<() => void>()
let snapshot: QueuedOrder[] = read()

function read(): QueuedOrder[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as QueuedOrder[]
  } catch {
    return []
  }
}

function write(next: QueuedOrder[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(next))
  } catch {
    throw new Error('Device storage is full, cannot save the bill offline')
  }
  snapshot = next
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useQueue = (): QueuedOrder[] => useSyncExternalStore(subscribe, () => snapshot)

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

// enqueue
export function enqueueOrder(o: Omit<QueuedOrder, 'clientId' | 'localNo' | 'createdAt' | 'status'>): QueuedOrder {
  if (snapshot.length >= MAX_QUEUE) {
    throw new Error(`Offline limit reached (${MAX_QUEUE} bills). Reconnect to the internet so the bills can sync.`)
  }
  let seq = 0
  try {
    seq = Number(localStorage.getItem(SEQ_KEY) ?? 0) + 1
    localStorage.setItem(SEQ_KEY, String(seq))
  } catch {
    seq = snapshot.reduce((m, q) => Math.max(m, q.localNo), 0) + 1
  }
  const order: QueuedOrder = { ...o, clientId: crypto.randomUUID(), localNo: seq, createdAt: new Date().toISOString(), status: 'pending' }
  write([...snapshot, order])
  return order
}

export function discardOrder(clientId: string) {
  write(snapshot.filter((q) => q.clientId !== clientId))
}

export function retryFailed() {
  write(snapshot.map((q) => (q.status === 'failed' ? { ...q, status: 'pending', error: undefined } : q)))
}

// sync
let syncing = false
const syncListeners = new Set<() => void>()
export const useSyncing = (): boolean =>
  useSyncExternalStore(
    (l) => {
      syncListeners.add(l)
      return () => syncListeners.delete(l)
    },
    () => syncing,
  )
function setSyncing(v: boolean) {
  syncing = v
  syncListeners.forEach((l) => l())
}

export interface SyncReport {
  synced: number
  failed: number
  stopped: boolean // หยุดกลางทางเพราะเครือข่าย
  notes: string[]
}

export async function syncQueue(): Promise<SyncReport> {
  const report: SyncReport = { synced: 0, failed: 0, stopped: false, notes: [] }
  if (syncing || !navigator.onLine) return report
  setSyncing(true)
  try {
    for (const q of snapshot.filter((x) => x.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const { data, error } = await supabase.rpc('sync_offline_order', {
        p_employee_id: q.employeeId,
        p_shift_id: q.shiftId,
        p_client_id: q.clientId,
        p_offline_at: q.createdAt,
        p_customer_phone: q.phone,
        p_promotion_id: q.promotionId,
        p_items: q.items,
        p_method: q.method,
        p_offline_total: q.total,
      })
      if (error) {
        if (!error.code) {
          report.stopped = true // เครือข่ายหลุด: ลองใหม่ทีหลัง
          break
        }
        write(snapshot.map((x) => (x.clientId === q.clientId ? { ...x, status: 'failed', error: error.message } : x)))
        report.failed++
        continue
      }
      const r = data as { member_skipped?: boolean; stock_short?: string[] }
      if (r.member_skipped) report.notes.push(`${localLabel(q.localNo)}: member not found, no points given`)
      if (r.stock_short && r.stock_short.length > 0) report.notes.push(`${localLabel(q.localNo)}: stock was short (see audit log)`)
      write(snapshot.filter((x) => x.clientId !== q.clientId))
      report.synced++
    }
  } finally {
    setSyncing(false)
  }
  return report
}

/** ซิงค์อัตโนมัติ: ตอนกลับมาออนไลน์ + ทุก 30 วินาทีถ้ายังค้าง (SRS: ซิงค์ภายใน 5 นาที) */
export function useAutoSync() {
  const queue = useQueue()
  const online = useOnline()
  const hasPending = queue.some((q) => q.status === 'pending')
  useEffect(() => {
    if (!online || !hasPending) return
    const first = setTimeout(() => void syncQueue(), 1000)
    const timer = setInterval(() => void syncQueue(), 30000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [online, hasPending])
}
