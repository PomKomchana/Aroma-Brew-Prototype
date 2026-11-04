import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Shell } from '../components/Shell'
import { errMsg, rpc } from '../lib/api'
import { PAYMENT_LABEL, friendlyError, money, type PaymentMethod } from '../lib/pos'
import { STATUS_LABEL, fmtPickup, orderNo } from '../lib/preorders'
import type { Preorder, PreorderSettings } from '../lib/types'

const METHODS = Object.keys(PAYMENT_LABEL) as PaymentMethod[]

/** Pre-order queue: prepare, mark ready, collect & pay (becomes a normal bill), cancel / no-show. Owner also sets opening hours. */
export default function Preorders() {
  const { employee, shiftId } = useAuth()
  const isCashier = employee!.role === 'cashier'
  const [rows, setRows] = useState<Preorder[]>([])
  const [error, setError] = useState('')
  const [pay, setPay] = useState<Preorder | null>(null)
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const [cash, setCash] = useState('')
  const [cancel, setCancel] = useState<Preorder | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  const load = useCallback(() => {
    rpc<Preorder[]>('get_preorders', { p_emp: employee!.employee_id, p_scope: 'active' }).then(setRows).catch((e) => setError(errMsg(e)))
  }, [employee])
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t) }, [load])

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await fn(); load() } catch (e) { setError(friendlyError(errMsg(e))) } finally { setBusy(false) }
  }
  const setStatus = (o: Preorder, s: string, r?: string) =>
    act(() => rpc('set_preorder_status', { p_emp: employee!.employee_id, p_id: o.preorder_id, p_status: s, p_reason: r ?? null }))

  const total = pay ? Number(pay.total_price) : 0
  const received = Number(cash)
  const cashShort = method === 'cash' && (cash === '' || received < total)

  async function collect() {
    if (!pay || !method || !shiftId) return
    setBusy(true); setError('')
    try {
      const bill = await rpc<number>('complete_preorder', { p_emp: employee!.employee_id, p_shift: shiftId, p_id: pay.preorder_id, p_method: method })
      setDone(`${orderNo(pay.preorder_id)} collected, bill #${bill}${method === 'cash' && cash ? `, change ${money(Math.max(0, received - total))}` : ''}`)
      setPay(null); setMethod(null); setCash(''); load()
    } catch (e) { setError(friendlyError(errMsg(e))) } finally { setBusy(false) }
  }

  const late = (o: Preorder) => Date.now() > new Date(o.pickup_time).getTime()
  return (
    <Shell>
      <div className="page">
        <div className="page-head">
          <div><h2>Pre-orders</h2><p className="sub">Customers who ordered ahead · they pay here when they collect</p></div>
          <button className="btn btn-dark" onClick={load}>Refresh</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {done && <p className="badge ok" role="status" style={{ marginBottom: 12 }}>{done}</p>}
        {isCashier && !shiftId && <p className="badge warn" style={{ marginBottom: 12 }}>Open a shift to collect payment</p>}

        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>No.</th><th>Pickup</th><th>Customer</th><th>Items</th><th className="num">Total</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="tbl-empty">No pre-orders waiting</td></tr>}
              {rows.map((o) => (
                <tr key={o.preorder_id}>
                  <td><b>{orderNo(o.preorder_id)}</b></td>
                  <td>{fmtPickup(o.pickup_time)}{late(o) && <span className="badge bad" style={{ marginLeft: 6 }}>late</span>}</td>
                  <td>{o.customer_name}<br /><small className="muted">{o.masked_phone}</small></td>
                  <td style={{ maxWidth: 300 }}>
                    {o.items.map((i, k) => <div key={k}>{i.quantity}× {i.name} ({i.size}){i.modifiers.length > 0 && <small className="muted"> · {i.modifiers.join(', ')}</small>}</div>)}
                    {o.note && <small className="muted">Note: {o.note}</small>}
                  </td>
                  <td className="num">{money(Number(o.total_price))}</td>
                  <td><span className={o.status === 'ready' ? 'badge ok' : o.status === 'placed' ? 'badge warn' : 'badge'}>{STATUS_LABEL[o.status]}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {o.status === 'placed' && <button className="link-btn" disabled={busy} onClick={() => setStatus(o, 'preparing')}>Start</button>}
                    {o.status !== 'ready' && <button className="link-btn" disabled={busy} onClick={() => setStatus(o, 'ready')}>Ready</button>}
                    {isCashier && <button className="link-btn" disabled={busy || !shiftId} onClick={() => { setPay(o); setMethod(null); setCash(''); setError('') }}>Collect &amp; pay</button>}
                    {late(o) && <button className="link-btn danger" disabled={busy} onClick={() => setStatus(o, 'no_show')}>No-show</button>}
                    <button className="link-btn danger" disabled={busy} onClick={() => { setCancel(o); setReason(''); setError('') }}>Cancel</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {employee!.role === 'owner' && <SettingsCard emp={employee!.employee_id} />}

        {pay && (
          <div className="overlay" role="dialog" aria-modal="true">
            <div className="modal">
              <h3 className="modal-title" style={{ marginBottom: 8 }}>Collect {orderNo(pay.preorder_id)} · {pay.customer_name}</h3>
              <p className="muted" style={{ marginTop: 0 }}>{pay.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</p>
              <div className="sum-row total"><span>Total to collect</span><span>{money(total)}</span></div>
              {pay.promo_name && <p className="muted" style={{ fontSize: 13 }}>Includes {pay.promo_name} (−{money(Number(pay.discount_amount))})</p>}
              <div className="pay-grid" style={{ margin: '12px 0' }}>
                {METHODS.map((m) => <button key={m} className={method === m ? 'pay on' : 'pay'} onClick={() => setMethod(m)}>{PAYMENT_LABEL[m]}</button>)}
              </div>
              {method === 'cash' && <input className="input" style={{ width: '100%' }} type="number" inputMode="decimal" placeholder="Cash received" value={cash} onChange={(e) => setCash(e.target.value)} />}
              {method === 'cash' && cash !== '' && <p>{cashShort ? `Short by ${money(total - received)}` : `Change ${money(received - total)}`}</p>}
              {error && <p className="error" role="alert">{error}</p>}
              <div className="modal-actions">
                <button className="btn btn-dark" style={{ flex: 1 }} onClick={() => setPay(null)}>Back</button>
                <button className="btn" style={{ flex: 1 }} disabled={busy || !method || cashShort} onClick={collect}>{busy ? 'Confirming…' : 'Confirm payment'}</button>
              </div>
            </div>
          </div>
        )}

        {cancel && (
          <div className="overlay" role="dialog" aria-modal="true">
            <div className="modal">
              <h3 className="modal-title" style={{ marginBottom: 8 }}>Cancel {orderNo(cancel.preorder_id)}?</h3>
              <label className="field"><span>Reason (required, the customer can see it)</span><input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></label>
              {error && <p className="error" role="alert">{error}</p>}
              <div className="modal-actions">
                <button className="btn btn-dark" style={{ flex: 1 }} onClick={() => setCancel(null)}>Keep</button>
                <button className="btn" style={{ flex: 1, background: 'var(--danger)' }} disabled={busy || !reason.trim()}
                  onClick={async () => { await setStatus(cancel, 'cancelled', reason); setCancel(null) }}>Cancel order</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}

function SettingsCard({ emp }: { emp: number }) {
  const [s, setS] = useState<PreorderSettings | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { rpc<PreorderSettings>('get_preorder_settings', { p_emp: emp }).then(setS).catch((e) => setMsg(errMsg(e))) }, [emp])
  if (!s) return msg ? <p className="error">{msg}</p> : null
  const num = (k: keyof PreorderSettings, label: string) => (
    <label className="field"><span>{label}</span>
      <input type="number" value={Number(s[k])} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} /></label>
  )
  async function save() {
    setMsg('')
    try {
      await rpc('update_preorder_settings', { p_emp: emp, p_enabled: s!.is_enabled, p_open: s!.open_time, p_close: s!.close_time,
        p_slot_minutes: s!.slot_minutes, p_lead_minutes: s!.min_lead_minutes, p_max_per_slot: s!.max_orders_per_slot, p_max_active: s!.max_active_per_customer })
      setMsg('Saved')
    } catch (e) { setMsg(errMsg(e)) }
  }
  return (
    <div className="card" style={{ marginTop: 24, padding: 20, maxWidth: 560 }}>
      <h3 style={{ marginTop: 0 }}>Pre-order settings</h3>
      <label className="field"><span>Accept pre-orders</span>
        <input type="checkbox" checked={s.is_enabled} onChange={(e) => setS({ ...s, is_enabled: e.target.checked })} style={{ width: 'auto' }} /></label>
      <label className="field"><span>Opens</span><input type="time" value={s.open_time} onChange={(e) => setS({ ...s, open_time: e.target.value })} /></label>
      <label className="field"><span>Last pickups end at</span><input type="time" value={s.close_time} onChange={(e) => setS({ ...s, close_time: e.target.value })} /></label>
      {num('slot_minutes', 'Slot length (minutes)')}
      {num('min_lead_minutes', 'Minimum notice (minutes)')}
      {num('max_orders_per_slot', 'Max orders per slot')}
      {num('max_active_per_customer', 'Max active orders per customer')}
      <button className="btn" onClick={save}>Save settings</button> {msg && <span style={{ marginLeft: 12 }}>{msg}</span>}
    </div>
  )
}
