import { useState } from 'react'
import { errMsg, fmtDateTime, rpc } from '../lib/api'
import { PAYMENT_LABEL, money, type PaymentMethod } from '../lib/pos'
import type { OrderRow } from '../lib/types'

/** ตารางบิล + ปุ่มยกเลิกบิล [FR-25] ใช้ร่วมกันที่ S08 [cashier] และ S17 [owner] */
export default function OrdersTable({ rows, emp, canCancel, onChanged }: { rows: OrderRow[]; emp: number; canCancel: (o: OrderRow) => boolean; onChanged: () => void }) {
  const [target, setTarget] = useState<OrderRow | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function cancel() {
    if (!target) return
    setBusy(true)
    setError('')
    try {
      await rpc('void_order', { p_emp: emp, p_order: target.order_id, p_reason: reason })
      setTarget(null)
      setReason('')
      onChanged()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Bill</th><th>Time</th><th>Items</th><th>Cashier</th><th>Payment</th><th className="num">Total</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="tbl-empty">No bills</td></tr>}
            {rows.map((o) => (
              <tr key={o.order_id} className={o.status === 'cancelled' ? 'cancelled' : ''}>
                <td>#{o.order_id}</td>
                <td>{fmtDateTime(o.order_date)}</td>
                <td style={{ maxWidth: 260 }}>{o.items}</td>
                <td>{o.cashier}</td>
                <td>{o.method ? PAYMENT_LABEL[o.method as PaymentMethod] ?? o.method : '–'}</td>
                <td className="num">{money(Number(o.total_price))}</td>
                <td>
                  {o.status === 'paid' ? <span className="badge ok">Paid</span> : <span className="badge bad" title={o.cancel_reason ?? ''}>Cancelled</span>}
                </td>
                <td>{o.status === 'paid' && canCancel(o) && <button className="link-btn danger" onClick={() => { setTarget(o); setReason(''); setError('') }}>Cancel bill</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {target && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h3 className="modal-title" style={{ marginBottom: 8 }}>Cancel bill #{target.order_id}?</h3>
            <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>{money(Number(target.total_price))} · ingredients are returned to stock and any member points earned are reversed. This is recorded in the audit log.</p>
            <label className="field"><span>Reason (required)</span><input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="modal-actions">
              <button className="btn btn-dark" style={{ flex: 1 }} onClick={() => setTarget(null)}>Keep bill</button>
              <button className="btn" style={{ flex: 1, background: 'var(--danger)' }} disabled={busy || !reason.trim()} onClick={cancel}>{busy ? 'Cancelling…' : 'Cancel bill'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
