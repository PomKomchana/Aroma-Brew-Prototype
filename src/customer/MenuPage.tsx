import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HoverCard, type HoverState } from '../components/ProductInfo'
import { ALLERGEN_LABEL } from '../lib/pos'
import type { Product } from '../lib/types'
import ProductCard from './ProductCard'
import { catLabel, useMenu } from './useMenu'

/* Menu page: category list on the left, product tiles on the right, grouped by category. */
export default function MenuPage() {
  const { data, error } = useMenu()
  const [sp, setSp] = useSearchParams()
  const [q, setQ] = useState('')
  const [avoid, setAvoid] = useState<string[]>([])
  const [hover, setHover] = useState<HoverState | null>(null)
  const cat = sp.get('cat') ?? 'all'

  // Popup follows the mouse like the cashier screen; keyboard focus shows it beside the card
  function showHover(e: React.PointerEvent<HTMLElement> | React.FocusEvent<HTMLElement>, product: Product) {
    const item = e.currentTarget.getBoundingClientRect()
    if ('pointerType' in e) {
      if (e.pointerType !== 'mouse') return
      const side = item.left + item.width / 2 > window.innerWidth / 2 ? 'left' : 'right'
      setHover({ product, x: e.clientX, y: e.clientY, side })
    } else {
      setHover({ product, x: item.right, y: item.top + item.height / 2, side: 'right' })
    }
  }
  useEffect(() => {
    const clear = () => setHover(null)
    window.addEventListener('scroll', clear, { passive: true })
    return () => window.removeEventListener('scroll', clear)
  }, [])

  const products = data?.products ?? []
  const cats = Array.from(new Set(products.map((p) => p.category)))
  const inCat = products.filter((p) => (cat === 'all' || p.category === cat) && p.name.toLowerCase().includes(q.trim().toLowerCase()))
  const shown = inCat.filter((p) => !avoid.some((a) => (p.allergens ?? []).includes(a)))
  const groups = (cat === 'all' ? cats : [cat]).map((c) => ({ c, items: shown.filter((p) => p.category === c) })).filter((g) => g.items.length > 0)
  const toggle = (a: string) => setAvoid(avoid.includes(a) ? avoid.filter((x) => x !== a) : [...avoid, a])

  return (
    <div className="cs-wrap cs-menu">
      <aside className="cs-side" aria-label="Menu filters">
        <p className="cs-side-title">View menu</p>
        <input className="cs-search" type="search" placeholder="Search the menu" aria-label="Search the menu" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="cs-cats" role="tablist" aria-label="Categories">
          {['all', ...cats].map((c) => (
            <button key={c} role="tab" aria-selected={cat === c} className={cat === c ? 'cs-cat on' : 'cs-cat'} onClick={() => setSp(c === 'all' ? {} : { cat: c })}>
              <span>{c === 'all' ? 'All' : catLabel(c)}</span>
              <i>{c === 'all' ? products.length : products.filter((p) => p.category === c).length}</i>
            </button>
          ))}
        </div>
        <details className="cs-acc" open={avoid.length > 0 || undefined}>
          <summary>Avoid allergens{avoid.length > 0 ? ` (${avoid.length})` : ''}</summary>
          <div className="cs-chips" aria-label="Avoid allergens">
            {Object.entries(ALLERGEN_LABEL).map(([k, v]) => (
              <button key={k} aria-pressed={avoid.includes(k)} className={avoid.includes(k) ? 'cs-chip on' : 'cs-chip'} onClick={() => toggle(k)}>{v}</button>
            ))}
          </div>
        </details>
      </aside>

      <section className="cs-menu-main">
        <h1 className="cs-menu-h1">Menu</h1>
        {error && <p className="error">{error}</p>}
        {!data && !error && <p className="cs-muted">Loading menu…</p>}
        {data && avoid.length > 0 && inCat.length !== shown.length && (
          <p className="cs-muted">{inCat.length - shown.length} item(s) hidden because they contain what you want to avoid.</p>
        )}
        {data && shown.length === 0 && <p className="cs-muted">Nothing matches. Try a different search or clear the filters.</p>}
        {hover && data && <HoverCard hover={hover} ingredients={data.ingredientsOf[hover.product.product_id] ?? []} />}
        {groups.map(({ c, items }) => (
          <div className="cs-menu-group" key={c}>
            <h2 className="cs-menu-h2">{catLabel(c)} <span>({items.length})</span></h2>
            <div className="cs-menu-grid">
              {items.map((p) => <ProductCard key={p.product_id} p={p} onShow={showHover} onHide={() => setHover(null)} />)}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
