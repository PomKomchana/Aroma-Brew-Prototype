import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import type { Member, Modifier, Product, Promotion } from '../lib/types'
import {
  CATEGORY_LABEL,
  PAYMENT_LABEL,
  POINT_RATE,
  SIZE_LABEL,
  bestPromotion,
  cartKey,
  friendlyError,
  money,
  type CartLine,
  type PaymentMethod,
  type ReceiptData,
} from '../lib/pos'
import { Shell } from '../components/Shell'
import ProductModal from '../components/ProductModal'
import Receipt from '../components/Receipt'
import { HoverCard, type HoverState } from '../components/ProductInfo'

/** [S03 POS หลัก] + [S05 ค้นหาสมาชิก] + [S06 ชำระเงิน] */
export default function Pos() {
  const { employee, shiftId } = useAuth()

  const [products, setProducts] = useState<Product[]>([])
  const [modifiers, setModifiers] = useState<Modifier[]>([])
  const [promos, setPromos] = useState<Promotion[]>([])
  const [sizes, setSizes] = useState<Record<number, string[]>>({})
  const [ingredientsOf, setIngredientsOf] = useState<Record<number, string[]>>({})
  const [hover, setHover] = useState<HoverState | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [cat, setCat] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [modalProduct, setModalProduct] = useState<Product | null>(null)

  const [phone, setPhone] = useState('')
  const [member, setMember] = useState<Member | null>(null)
  const [memberError, setMemberError] = useState('')

  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const [cashInput, setCashInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [payError, setPayError] = useState('')
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('product').select('*').eq('is_active', true).order('product_id'),
      supabase.from('modifier').select('*').order('modifier_id'),
      supabase.from('recipe').select('product_id,size, ingredient_id'),
      supabase.from('promotion').select('*'),
      supabase.from('ingredient').select('ingredient_id,name'),
    ]).then(([p, m, r, pr, ing]) => {
      const err = p.error ?? m.error ?? r.error ?? pr.error ?? ing.error
      if (err) {
        setLoadError('Failed to load data: ' + err.message)
      } else {
        const prods = (p.data ?? []) as Product[]
        setProducts(prods)
        setModifiers((m.data ?? []) as Modifier[])
        setPromos((pr.data ?? []) as Promotion[])
        const map: Record<number, string[]> = {}
        const names = new Map(((ing.data ?? []) as { ingredient_id: number; name: string }[]).map((i) => [i.ingredient_id, i.name]))
        const ingMap: Record<number, string[]> = {}
        for (const row of (r.data ?? []) as { product_id: number; size: string; ingredient_id: number }[]) {
          const list = (map[row.product_id] ??= [])
          if (!list.includes(row.size)) list.push(row.size)
          const n = names.get(row.ingredient_id)
          const il = (ingMap[row.product_id] ??= [])
          if (n && !il.includes(n)) il.push(n)
        }
        setIngredientsOf(ingMap)
        for (const k of Object.keys(map)) map[Number(k)].sort()
        setSizes(map)
        setCat(prods[0]?.category ?? '')
      }
      setLoading(false)
    })
  }, [])

  const categories = useMemo(() => [...new Set(products.map((x) => x.category))], [products])
  const shown = products.filter((x) => x.category === cat)

  const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0)
  const promo = bestPromotion(promos, subtotal)
  const discount = promo?.amount ?? 0
  const total = subtotal - discount
  const earned = member ? Math.floor(total / POINT_RATE) : 0
  const received = Number(cashInput)
  const change = method === 'cash' && cashInput !== '' ? Math.max(0, received - total) : 0
  const cashShort = method === 'cash' && (cashInput === '' || received < total)
  const canPay = cart.length > 0 && method !== null && !cashShort && !busy

  if (!shiftId) return <Navigate to="/shift" replace />

  function addLine(product: Product, size: string, mods: Modifier[]) {
    const key = cartKey(product.product_id, size, mods.map((m) => m.modifier_id))
    const unitPrice = Number(product.price) + mods.reduce((s, m) => s + Number(m.extra_price), 0)
    setCart((prev) =>
      prev.some((l) => l.key === key)
        ? prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l))
        : [...prev, { key, product, size, modifiers: mods, unitPrice, qty: 1 }],
    )
    setModalProduct(null)
  }

  function showHover(e: React.PointerEvent<HTMLButtonElement>, product: Product) {
    if (e.pointerType !== 'mouse' || modalProduct) return
    const item = e.currentTarget.getBoundingClientRect()
    const grid = e.currentTarget.parentElement!.getBoundingClientRect()
    const side = item.left + item.width / 2 > grid.left + grid.width / 2 ? 'left' : 'right'
    setHover({ product, x: e.clientX, y: e.clientY, side })
  }

  function changeQty(key: string, delta: number) {
    setCart((prev) => prev.flatMap((l) => (l.key !== key ? [l] : l.qty + delta <= 0 ? [] : [{ ...l, qty: l.qty + delta }])))
  }

  async function lookupMember() {
    setMemberError('')
    if (!/^[0-9]{10}$/.test(phone)) {
      setMemberError('Please enter a 10-digit phone number')
      return
    }
    const { data, error } = await supabase.rpc('find_member', { p_phone: phone })
    if (error) setMemberError(error.message)
    else if (!data) setMemberError('Member not found')
    else setMember(data as Member)
  }

  async function confirm() {
    if (!employee || !shiftId || !method) return
    setBusy(true)
    setPayError('')
    const { data, error } = await supabase.rpc('checkout', {
      p_employee_id: employee.employee_id,
      p_shift_id: shiftId,
      p_customer_phone: member?.phone_number ?? null,
      p_promotion_id: promo?.promo.promotion_id ?? null,
      p_items: cart.map((l) => ({
        product_id: l.product.product_id,
        size: l.size,
        quantity: l.qty,
        modifier_ids: l.modifiers.map((m) => m.modifier_id),
      })),
      p_method: method,
    })
    setBusy(false)
    if (error) {
      setPayError(friendlyError(error.message))
      return
    }
    setReceipt({
      orderId: data as number,
      lines: cart,
      subtotal,
      discount,
      promoName: promo?.promo.name ?? null,
      total,
      method,
      received: method === 'cash' ? received : null,
      change,
      member,
      earnedPoints: earned,
      time: new Date(),
    })
  }

  function reset() {
    setCart([])
    setMember(null)
    setPhone('')
    setMemberError('')
    setMethod(null)
    setCashInput('')
    setPayError('')
    setReceipt(null)
  }

  if (receipt) {
    return (
      <Shell>
        <Receipt data={receipt} onNext={reset} />
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="pos">
        {/* Left Side: เมนู */}
        <div className="pos-left">
          <div className="tabs" role="tablist">
            {categories.map((c) => (
              <button key={c} role="tab" aria-selected={cat === c} className={cat === c ? 'tab on' : 'tab'} onClick={() => setCat(c)}>
                {CATEGORY_LABEL[c] ?? c}
              </button>
            ))}
          </div>
          {loading && <p className="muted" style={{ padding: 16 }}>Loading Menu...</p>}
          {loadError && (
            <p className="error" role="alert" style={{ padding: 16 }}>
              {loadError}
            </p>
          )}
          <div className="grid">
            {shown.map((p) => (
              <button key={p.product_id} className="menu-item"
                  onClick={() => { setHover(null); setModalProduct(p) }}
                  onPointerEnter={(e) => showHover(e, p)}
                  onPointerMove={(e) => showHover(e, p)}
                  onPointerLeave={() => setHover(null)}
                  onBlur={() => setHover(null)}
              >
                <div className="menu-img">{p.image ? <img src={p.image} alt="" /> : '☕'}</div>
                <span className="menu-name">{p.name}</span>
                <span className="menu-price">{money(Number(p.price))}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right Side: ตะกร้า */}
        <aside className="cart">
          <div className="cart-head">Order List</div>
          <div className="cart-items">
            {cart.length === 0 && <p className="cart-empty">No items in cart</p>}
            {cart.map((l) => (
              <div className="line" key={l.key}>
                <div className="line-info">
                  <p className="line-name">
                    {l.product.name}
                    {(sizes[l.product.product_id]?.length ?? 0) > 1 && ` (${SIZE_LABEL[l.size]?.split(' ')[0] ?? l.size})`}
                  </p>
                  {l.modifiers.length > 0 && <p className="line-mod">{l.modifiers.map((m) => m.name).join(', ')}</p>}
                  <p className="line-price">{money(l.unitPrice * l.qty)}</p>
                </div>
                <div className="qty">
                  <button aria-label="ลดจำนวน" onClick={() => changeQty(l.key, -1)}>−</button>
                  <span>{l.qty}</span>
                  <button className="plus" aria-label="เพิ่มจำนวน" onClick={() => changeQty(l.key, 1)}>+</button>
                </div>
              </div>
            ))}
          </div>

          <div className="cart-sec">
            <p className="sec-label">Member</p>
            {member ? (
              <div className="member">
                <div>
                  <b>{member.name}</b>
                  <small>
                    {member.masked_phone} · {member.points.toLocaleString()} points
                  </small>
                </div>
                <button
                  className="member-x"
                  aria-label="Remove member"
                  onClick={() => {
                    setMember(null)
                    setPhone('')
                  }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="row">
                <input
                  className="input"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="Phone number (10 digits)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && lookupMember()}
                />
                <button className="mini-btn" onClick={lookupMember}>
                  Search
                </button>
              </div>
            )}
            {memberError && <p className="error" style={{ margin: '6px 0 0' }}>{memberError}</p>}
          </div>

          <div className="cart-sec">
            <p className="sec-label">Payment Method</p>
            <div className="pay-grid">
              {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                <button key={m} className={method === m ? 'pay on' : 'pay'} onClick={() => setMethod(m)}>
                  {PAYMENT_LABEL[m]}
                </button>
              ))}
            </div>
            {method === 'cash' && (
              <input
                className="input"
                style={{ width: '100%', marginTop: 8 }}
                type="number"
                inputMode="decimal"
                placeholder="รับเงินมา..."
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
              />
            )}
          </div>

          <div className="sum">
            <div className="sum-row">
              <span>Total</span>
              <span>{money(subtotal)}</span>
            </div>
            {promo && (
              <div className="sum-row promo">
                <span>{promo.promo.name}</span>
                <span>−{money(discount)}</span>
              </div>
            )}
            <div className="sum-row total">
              <span>Net Total</span>
              <span>{money(total)}</span>
            </div>
            {method === 'cash' && cashInput !== '' && (
              <div className="sum-row">
                <span>{cashShort ? 'Insufficient Funds' : 'Change'}</span>
                <span>{cashShort ? `Short by ${money(total - received)}` : money(change)}</span>
              </div>
            )}
            {payError && (
              <p className="error" role="alert" style={{ margin: '4px 0 0' }}>
                {payError}
              </p>
            )}
            <button className="confirm" disabled={!canPay} onClick={confirm}>
              {busy ? 'Confirming...' : 'Confirm Payment'}
            </button>
          </div>
        </aside>

        {modalProduct && (
          <ProductModal
            product={modalProduct}
            ingredients={ingredientsOf[modalProduct.product_id] ?? []}
            sizes={sizes[modalProduct.product_id] ?? ['M']}
            modifiers={modifiers}
            onClose={() => setModalProduct(null)}
            onAdd={(size, mods) => addLine(modalProduct, size, mods)}
          />
        )}

        {hover && !modalProduct && <HoverCard hover={hover} ingredients={ingredientsOf[hover.product.product_id] ?? []} />}
      </div>
    </Shell>
  )
}
