import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { errMsg, rpc } from '../lib/api'
import { bestPromotion, money, SIZE_LABEL } from '../lib/pos'
import { fmtPickup } from '../lib/preorders'
import type { PickupSlots } from '../lib/types'
import { useBasket } from './basketContext'
import { useMember } from './member'
import { bigImg, useMenu } from './useMenu'

/* Basket + pickup time + place order. Payment happens at the counter when the customer collects. */
export default function Basket() {
  const { data } = useMenu()
  const { lines, setQty, remove, clear } = useBasket()
  const { token, clear: signOut } = useMember()
  const nav = useNavigate()
  const [slots, setSlots] = useState<PickupSlots | null>(null)
  const [pickup, setPickup] = useState('')
  const [note, setNote] = useState('')
  const [who, setWho] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    rpc<PickupSlots>('get_pickup_slots', {}).then(setSlots).catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => {
    if (!token) { setWho(''); return }
    rpc<{ name: string; masked_phone: string }>('get_member_summary', { p_token: token })
      .then((r) => setWho(`${r.name} · ${r.masked_phone}`)).catch(() => signOut())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const rows = lines.map((l) => {
    const p = data?.products.find((x) => x.product_id === l.product_id)
    const mods = l.modifier_ids.map((id) => data?.modifiers.find((m) => m.modifier_id === id)).filter((m) => !!m)
    const unit = p ? Number(p.price) + mods.reduce((s, m) => s + Number(m!.extra_price), 0) : 0
    return { l, p, mods, unit }
  })
  const unavailable = rows.some((r) => data && !r.p)
  const subtotal = rows.reduce((s, r) => s + r.unit * r.l.qty, 0)
  const promo = data ? bestPromotion(data.promos, subtotal) : null
  const total = subtotal - (promo?.amount ?? 0)
  const open = slots?.slots.filter((s) => s.available) ?? []
  const chosen = pickup || open[0]?.time || ''

  async function place() {
    setBusy(true); setError('')
    try {
      const id = await rpc<number>('place_preorder', {
        p_token: token, p_pickup: chosen, p_note: note.trim() || null,
        p_items: rows.map((r) => ({ product_id: r.l.product_id, size: r.l.size, quantity: r.l.qty, modifier_ids: r.l.modifier_ids })),
      })
      clear()
      nav(`/my-orders/${id}?new=1`, { replace: true })
    } catch (e) {
      const m = errMsg(e)
      if (/session expired/i.test(m)) signOut()
      setError(m)
      rpc<PickupSlots>('get_pickup_slots', {}).then(setSlots).catch(() => {})
    } finally { setBusy(false) }
  }

  if (lines.length === 0) return (
    <div className="cs-wrap cs-page">
      <h1 className="cs-h1">Your basket is empty</h1>
      <p className="cs-muted">Pick something from the menu and collect it at the counter without waiting.</p>
      <Link className="cs-btn" to="/menu">View menu</Link>
    </div>
  )

  return (
    <div className="cs-wrap cs-page">
      <p className="cs-kicker">Order ahead</p>
      <h1 className="cs-h1">Your order</h1>
      <div className="cs-order">
        <div>
          {rows.map(({ l, p, mods, unit }) => (
            <div className="cs-line" key={l.key}>
              <div className="cs-line-img" style={bigImg(p?.image) ? { backgroundImage: `url(${bigImg(p?.image)})` } : undefined} />
              <div>
                <h3>{p ? p.name : 'No longer available'}</h3>
                <small>{[p && p.category !== 'bakery' ? SIZE_LABEL[l.size] ?? l.size : '', ...mods.map((m) => m!.name)].filter(Boolean).join(' · ')}</small>
                <div className="cs-qty">
                  <button aria-label="Fewer" onClick={() => setQty(l.key, l.qty - 1)}>−</button>
                  <span>{l.qty}</span>
                  <button aria-label="More" onClick={() => setQty(l.key, l.qty + 1)}>+</button>
                  <button className="cs-auth-link" style={{ margin: '0 0 0 12px', minHeight: 44 }} onClick={() => remove(l.key)}>Remove</button>
                </div>
              </div>
              <b>{money(unit * l.qty)}</b>
            </div>
          ))}
          <p className="cs-note">You pay at the counter when you collect (cash, card or PromptPay). Final prices are confirmed when you order.</p>
        </div>

        <aside className="cs-panel">
          <h2>Pickup time · today</h2>
          {slots && !slots.enabled && <p className="cs-muted">Pre-orders are switched off right now. Please order at the counter.</p>}
          {slots && slots.enabled && open.length === 0 && <p className="cs-muted">No pickup times left today. Please order at the counter, or come back tomorrow.</p>}
          <div className="cs-slots" role="radiogroup" aria-label="Pickup time">
            {(slots?.slots ?? []).map((s, i) => (
              <button key={s.time} role="radio" aria-checked={chosen === s.time} disabled={!s.available}
                className={chosen === s.time ? 'cs-slot on' : 'cs-slot'} onClick={() => setPickup(s.time)}>
                {s.time === open[0]?.time && i >= 0 ? `ASAP ${fmtPickup(s.time)}` : fmtPickup(s.time)}
              </button>
            ))}
          </div>

          <label className="cs-auth-label" htmlFor="cs-note">Note for the barista (optional)</label>
          <textarea id="cs-note" className="cs-textarea" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />

          <div style={{ marginTop: 16 }}>
            <div className="cs-sum"><span>Subtotal</span><span>{money(subtotal)}</span></div>
            {promo && <div className="cs-sum promo"><span>{promo.promo.name}</span><span>−{money(promo.amount)}</span></div>}
            <div className="cs-sum total"><span>Total</span><span>{money(total)}</span></div>
          </div>

          {error && <p className="error" role="alert">{error}</p>}
          {unavailable && <p className="error">Remove the unavailable item to continue.</p>}
          {token ? (
            <>
              {who && <p className="cs-muted" style={{ fontSize: 13 }}>Ordering as {who}</p>}
              <button className="cs-auth-btn" style={{ width: '100%' }} disabled={busy || !chosen || unavailable || !slots?.enabled} onClick={place}>
                {busy ? 'Placing order…' : `Place order · ${money(total)}`}
              </button>
            </>
          ) : (
            <Link className="cs-auth-btn" style={{ width: '100%', marginTop: 8 }} to="/signin?next=/basket">Sign in to place order</Link>
          )}
        </aside>
      </div>
    </div>
  )
}
