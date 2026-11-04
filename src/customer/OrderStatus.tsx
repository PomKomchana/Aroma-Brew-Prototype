import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { errMsg, rpc } from '../lib/api'
import { money } from '../lib/pos'
import { STATUS_LABEL, fmtPickup, isActive, orderNo } from '../lib/preorders'
import type { Preorder } from '../lib/types'
import { useMember } from './member'

const STEPS = ['placed', 'preparing', 'ready'] as const

/* Order confirmation + live status. Refreshes every 10 seconds while the order is active. */
export default function OrderStatus() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const { token, clear } = useMember()
  const [o, setO] = useState<Preorder | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    rpc<Preorder>('get_my_preorder', { p_token: token, p_id: Number(id) }).then((r) => { setO(r); setError('') }).catch((e) => {
      const m = errMsg(e)
      if (/session expired/i.test(m)) clear()
      setError(m)
    })
  }, [token, id, clear])

  useEffect(() => { if (token) load() }, [token, load])
  useEffect(() => {
    if (!token || !o || !isActive(o.status)) return
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [token, o, load])

  async function cancel() {
    if (!window.confirm('Cancel this order?')) return
    setBusy(true)
    try { await rpc('cancel_my_preorder', { p_token: token, p_id: Number(id) }); load() } catch (e) { setError(errMsg(e)) } finally { setBusy(false) }
  }

  if (!token) return <Navigate to={`/signin?next=/my-orders/${id}`} replace />
  if (error && !o) return <div className="cs-wrap cs-page"><p className="error">{error}</p><Link className="cs-more" to="/my-orders">← My pre-orders</Link></div>
  if (!o) return <div className="cs-wrap cs-page"><p className="cs-muted">Loading…</p></div>

  const at = STEPS.indexOf(o.status as typeof STEPS[number])
  return (
    <div className="cs-wrap cs-page" style={{ maxWidth: 640 }}>
      <Link className="cs-back" to="/my-orders">← My pre-orders</Link>
      {sp.get('new') && o.status === 'placed' && <p className="cs-kicker">Order placed. Thank you!</p>}
      <p className="cs-kicker">Order number</p>
      <p className="cs-big-no">{orderNo(o.preorder_id)}</p>
      <p><b>Pickup today at {fmtPickup(o.pickup_time)}</b> · {STATUS_LABEL[o.status]}</p>

      {o.status === 'ready' && <div className="cs-ready" role="status">Your order is ready. Please collect it at the counter.</div>}
      {at >= 0 && (
        <div className="cs-steps-bar" aria-label="Order progress">
          {STEPS.map((s, i) => <div key={s} className={i < at ? 'done' : i === at ? 'now' : ''}>{STATUS_LABEL[s]}</div>)}
        </div>
      )}
      {(o.status === 'cancelled' || o.status === 'no_show') && <p className="error">{STATUS_LABEL[o.status]}{o.cancel_reason ? `: ${o.cancel_reason}` : ''}</p>}
      {o.status === 'collected' && <p className="cs-muted">Collected{o.points_earned > 0 ? ` · you earned ${o.points_earned} points` : ''}. Enjoy!</p>}

      <div style={{ marginTop: 16 }}>
        {o.items.map((i, k) => (
          <div className="cs-hist" key={k}>
            <div><b>{i.quantity}× {i.name}</b><small>{[i.size, ...i.modifiers].join(' · ')}</small></div>
            <b>{money(Number(i.unit_price) * i.quantity)}</b>
          </div>
        ))}
        {o.promo_name && <div className="cs-sum promo"><span>{o.promo_name}</span><span>−{money(Number(o.discount_amount))}</span></div>}
        <div className="cs-sum total"><span>Total</span><span>{money(Number(o.total_price))}</span></div>
        {o.note && <p className="cs-muted">Note: {o.note}</p>}
      </div>

      {isActive(o.status) && <p className="cs-note">Pay at the counter when you collect. Give your order number or phone number to the cashier.</p>}
      {o.can_cancel && <button className="cs-auth-btn ghost" disabled={busy} onClick={cancel}>Cancel order</button>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
