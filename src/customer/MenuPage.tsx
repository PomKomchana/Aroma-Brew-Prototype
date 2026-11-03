import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ALLERGEN_LABEL } from '../lib/pos'
import ProductCard from './ProductCard'
import { catLabel, useMenu } from './useMenu'

/* Menu with category tabs, search, and allergen filters. */
export default function MenuPage() {
  const { data, error } = useMenu()
  const [sp, setSp] = useSearchParams()
  const [q, setQ] = useState('')
  const [avoid, setAvoid] = useState<string[]>([])
  const cat = sp.get('cat') ?? 'all'

  const products = data?.products ?? []
  const cats = Array.from(new Set(products.map((p) => p.category)))
  const inCat = products.filter((p) => (cat === 'all' || p.category === cat) && p.name.toLowerCase().includes(q.trim().toLowerCase()))
  const shown = inCat.filter((p) => !avoid.some((a) => (p.allergens ?? []).includes(a)))
  const toggle = (a: string) => setAvoid(avoid.includes(a) ? avoid.filter((x) => x !== a) : [...avoid, a])

  return (
    <div className="cs-wrap cs-page">
      <p className="cs-kicker">Aroma Brew</p>
      <h1 className="cs-h1">Menu</h1>

      <div className="cs-tabs" role="tablist" aria-label="Categories">
        {['all', ...cats].map((c) => (
          <button key={c} role="tab" aria-selected={cat === c} className={cat === c ? 'cs-tab on' : 'cs-tab'} onClick={() => setSp(c === 'all' ? {} : { cat: c })}>
            {c === 'all' ? 'All' : catLabel(c)}
          </button>
        ))}
      </div>

      <div className="cs-filter">
        <input className="cs-search" type="search" placeholder="Search the menu" aria-label="Search the menu" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="cs-chips" aria-label="Avoid allergens">
          <span className="cs-chips-label">Avoid:</span>
          {Object.entries(ALLERGEN_LABEL).map(([k, v]) => (
            <button key={k} aria-pressed={avoid.includes(k)} className={avoid.includes(k) ? 'cs-chip on' : 'cs-chip'} onClick={() => toggle(k)}>{v}</button>
          ))}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="cs-muted">Loading menu…</p>}
      {data && avoid.length > 0 && inCat.length !== shown.length && (
        <p className="cs-muted">{inCat.length - shown.length} item(s) hidden because they contain what you want to avoid.</p>
      )}
      {data && shown.length === 0 && <p className="cs-muted">Nothing matches. Try a different search or clear the filters.</p>}
      <div className="cs-grid">{shown.map((p) => <ProductCard key={p.product_id} p={p} />)}</div>
    </div>
  )
}
