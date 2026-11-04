import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBasket } from './basketContext'
import { ProductInfo } from '../components/ProductInfo'
import { POINT_RATE, SIZE_LABEL, SINGLE_GROUPS, groupsFor, isDrink, money } from '../lib/pos'
import ProductCard from './ProductCard'
import { bigImg, catLabel, useMenu } from './useMenu'

const GROUP: Record<string, string> = { sweet: 'Sweetness', milk: 'Milk', extra: 'Extras', bakery: 'Serving' }

export default function ProductPage() {
  const { id } = useParams()
  const { data, error } = useMenu()
  const { add } = useBasket()
  const [size, setSize] = useState('')
  const [mods, setMods] = useState<number[]>([])
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const p = data?.products.find((x) => String(x.product_id) === id)

  if (error) return <div className="cs-wrap cs-page"><p className="error">{error}</p></div>
  if (!data) return <div className="cs-wrap cs-page"><p className="cs-muted">Loading…</p></div>
  if (!p) return (
    <div className="cs-wrap cs-page">
      <h1 className="cs-h1">We could not find that item</h1>
      <Link className="cs-more" to="/menu">← Back to menu</Link>
    </div>
  )

  const img = bigImg(p.image)
  const groups = groupsFor(p.category)
    .map((g) => ({ g, items: data.modifiers.filter((m) => m.type === g) }))
    .filter((x) => x.items.length)
  const sizes = isDrink(p.category) ? data.sizes[p.product_id] ?? [] : []
  const curSize = size && sizes.includes(size) ? size : sizes.includes('M') ? 'M' : sizes[0] ?? 'M'
  const unit = Number(p.price) + mods.reduce((t, id) => t + Number(data.modifiers.find((m) => m.modifier_id === id)?.extra_price ?? 0), 0)
  function toggle(id: number, type: string) {
    setAdded(false)
    setMods((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      const same = SINGLE_GROUPS.includes(type) ? data!.modifiers.filter((m) => m.type === type).map((m) => m.modifier_id) : []
      return [...prev.filter((x) => !same.includes(x)), id]
    })
  }
  function addToBasket() {
    add({ product_id: p!.product_id, size: curSize, modifier_ids: mods, qty })
    setAdded(true)
  }
  const related = data.products.filter((x) => x.category === p.category && x.product_id !== p.product_id).slice(0, 4)

  return (
    <div className="cs-wrap cs-page">
      <Link className="cs-back" to="/menu">← Menu</Link>
      <div className="cs-detail">
        <div className="cs-detail-img" style={img ? { backgroundImage: `url(${img})` } : undefined} role="img" aria-label={p.name} />
        <div>
          <p className="cs-kicker">{catLabel(p.category)}</p>
          <h1 className="cs-h1">{p.name}</h1>
          <p className="cs-price">{money(Number(p.price))}</p>

          <ProductInfo product={p} ingredients={data.ingredientsOf[p.product_id] ?? []} />

          {sizes.length > 0 && (
            <div className="cs-opt">
              <p className="sec-label">Size</p>
              <div className="cs-chips">{sizes.map((x) => <button key={x} aria-pressed={curSize === x} className={curSize === x ? 'cs-chip pick on' : 'cs-chip pick'} onClick={() => setSize(x)}>{SIZE_LABEL[x] ?? x}</button>)}</div>
            </div>
          )}
          {groups.map(({ g, items }) => (
            <div className="cs-opt" key={g}>
              <p className="sec-label">{GROUP[g] ?? g}</p>
              <div className="cs-chips">
                {items.map((m) => {
                  const on = mods.includes(m.modifier_id)
                  return (
                    <button key={m.modifier_id} aria-pressed={on} className={on ? 'cs-chip pick on' : 'cs-chip pick'} onClick={() => toggle(m.modifier_id, m.type)}>
                      {m.name}{Number(m.extra_price) > 0 ? ` +${money(Number(m.extra_price))}` : ''}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="cs-add">
            <div className="cs-qty">
              <button aria-label="Fewer" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
              <span aria-live="polite">{qty}</span>
              <button aria-label="More" onClick={() => setQty(Math.min(20, qty + 1))}>+</button>
            </div>
            <button className="cs-auth-btn" onClick={addToBasket}>Add to order · {money(unit * qty)}</button>
            {added && <Link className="cs-more" to="/basket">Added. View basket →</Link>}
          </div>

          <div className="cs-note">
            Order ahead and pay at the counter when you pick up. Sign in to earn 1 point for every {`฿${POINT_RATE}`}.
            {' '}<Link to="/rewards">How points work</Link>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="cs-related">
          <h2 className="cs-h2">More {catLabel(p.category).toLowerCase()}</h2>
          <div className="cs-grid">{related.map((x) => <ProductCard key={x.product_id} p={x} />)}</div>
        </section>
      )}
    </div>
  )
}
