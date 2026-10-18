import { useLayoutEffect, useRef, useState } from 'react'
import { ALLERGEN_LABEL, CATEGORY_LABEL, money } from '../lib/pos'
import type { Product } from '../lib/types'

export function ProductInfo({ product, ingredients }: { product: Product; ingredients: string[] }) {
  const allergens = product.allergens ?? []
  return (
    <div className="pinfo">
      {product.description && <p className="pinfo-desc">{product.description}</p>}
      <p className="sec-label">Ingredients</p>
      <p className="pinfo-text">{ingredients.length ? ingredients.join(', ') : 'No ingredient information yet'}</p>
      <p className="sec-label">Allergens</p>
      {allergens.length ? (
        <div className="allergens">
          {allergens.map((a) => <span key={a} className="allergen">⚠ {ALLERGEN_LABEL[a] ?? a}</span>)}
        </div>
      ) : (
        <p className="pinfo-text muted">No known allergens listed</p>
      )}
    </div>
  )
}

export interface HoverState {
  product: Product
  x: number
  y: number
  side: 'left' | 'right'
}

const GAP = 18
const MARGIN = 8

export function HoverCard({ hover, ingredients }: { hover: HoverState; ingredients: string[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: hover.x, top: hover.y, ready: false })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    let left = hover.side === 'right' ? hover.x + GAP : hover.x - GAP - w
    if (left + w > window.innerWidth - MARGIN) left = hover.x - GAP - w
    if (left < MARGIN) left = hover.x + GAP
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - w - MARGIN))
    const top = Math.max(MARGIN, Math.min(hover.y - 24, window.innerHeight - h - MARGIN))
    setPos({ left, top, ready: true })
  }, [hover.x, hover.y, hover.side, hover.product.product_id])

  const p = hover.product
  return (
    <div ref={ref} className="hover-card" role="tooltip" style={{ left: pos.left, top: pos.top, opacity: pos.ready ? 1 : 0 }}>
      {p.image && <img className="hover-img" src={p.image} alt="" />}
      <div className="hover-body">
        <div className="hover-head">
          <div>
            <p className="hover-name">{p.name}</p>
            <p className="hover-cat">{CATEGORY_LABEL[p.category] ?? p.category}</p>
          </div>
          <span className="hover-price">{money(Number(p.price))}</span>
        </div>
        <ProductInfo product={p} ingredients={ingredients} />
      </div>
    </div>
  )
}
