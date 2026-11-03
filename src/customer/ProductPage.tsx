import { Link, useParams } from 'react-router-dom'
import { ProductInfo } from '../components/ProductInfo'
import { POINT_RATE, SIZE_LABEL, groupsFor, isDrink, money } from '../lib/pos'
import ProductCard from './ProductCard'
import { bigImg, catLabel, useMenu } from './useMenu'

const GROUP: Record<string, string> = { sweet: 'Sweetness', milk: 'Milk', extra: 'Extras', bakery: 'Serving' }

export default function ProductPage() {
  const { id } = useParams()
  const { data, error } = useMenu()
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
              <p className="sec-label">Sizes</p>
              <div className="cs-chips">{sizes.map((s) => <span key={s} className="cs-chip static">{SIZE_LABEL[s] ?? s}</span>)}</div>
            </div>
          )}
          {groups.map(({ g, items }) => (
            <div className="cs-opt" key={g}>
              <p className="sec-label">{GROUP[g] ?? g}</p>
              <div className="cs-chips">
                {items.map((m) => (
                  <span key={m.modifier_id} className="cs-chip static">{m.name}{Number(m.extra_price) > 0 ? ` +${money(Number(m.extra_price))}` : ''}</span>
                ))}
              </div>
            </div>
          ))}

          <div className="cs-note">
            Order at the counter and give your phone number to earn 1 point for every {`฿${POINT_RATE}`}.
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
