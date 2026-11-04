import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { errMsg, rpc } from '../lib/api'
import { money } from '../lib/pos'
import { STATUS_LABEL, fmtPickup, isActive, orderNo } from '../lib/preorders'
import type { Preorder } from '../lib/types'
import { useMember } from './member'

export default function MyOrders() {
  const { token, clear } = useMember()
  const [rows, setRows] = useState<Preorder[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    rpc<Preorder[]>('get_my_preorders', { p_token: token }).then(setRows).catch((e) => {
      const m = errMsg(e)
      if (/session expired/i.test(m)) clear()
      setError(m)
    })
  }, [token, clear])

  if (!token) return <Navigate to="/signin?next=/my-orders" replace />
  return (
    <div className="cs-wrap cs-page">
      <p className="cs-kicker">Order ahead</p>
      <h1 className="cs-h1">My pre-orders</h1>
      {error && <p className="error">{error}</p>}
      {!rows && !error && <p className="cs-muted">Loading…</p>}
      {rows && rows.length === 0 && <><p className="cs-muted">You have not pre-ordered yet.</p><Link className="cs-btn" to="/menu">View menu</Link></>}
      <div style={{ maxWidth: 640 }}>
        {(rows ?? []).map((o) => (
          <Link key={o.preorder_id} to={`/my-orders/${o.preorder_id}`} className="cs-hist" style={{ textDecoration: 'none' }}>
            <div>
              <b>{orderNo(o.preorder_id)} · {o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</b>
              <small>Pickup {fmtPickup(o.pickup_time)} · <span className={o.status === 'ready' ? 'cs-status ready' : o.status === 'cancelled' || o.status === 'no_show' ? 'cs-status bad' : 'cs-status'}>{STATUS_LABEL[o.status]}</span></small>
            </div>
            <div style={{ textAlign: 'right' }}><b>{money(Number(o.total_price))}</b>{isActive(o.status) && <small>Active</small>}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
