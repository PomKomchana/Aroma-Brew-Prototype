import { supabase } from './supabase'
import { friendlyError } from './pos'

/** เรียก RPC แล้วโยน Error ข้อความอ่านง่าย [ใช้กับฟังก์ชันใน sql/04] */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(friendlyError(error.message))
  return data as T
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong'
}

export const todayStr = (offset = 0): string => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const fmtDateTime = (s: string): string =>
  new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export const fmtQty = (n: number): string => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })
