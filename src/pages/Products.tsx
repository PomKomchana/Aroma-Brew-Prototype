import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Shell } from '../components/Shell'
import { errMsg, rpc } from '../lib/api'
import { CATEGORY_LABEL, money } from '../lib/pos'
import type { AdminProduct, IngredientRow, RecipeRow } from '../lib/types'

const EMPTY: AdminProduct = { product_id: 0, name: '', category: 'coffee', price: 0, image: '', is_active: true, recipes: [] }

/** [S14 สินค้า/สูตร] */
export default function Products() {
  const { employee } = useAuth()
  const emp = employee!.employee_id
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [ings, setIngs] = useState<IngredientRow[]>([])
  const [edit, setEdit] = useState<AdminProduct | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    Promise.all([rpc<AdminProduct[]>('get_products_admin', { p_emp: emp }), rpc<IngredientRow[]>('get_ingredients', { p_emp: emp })])
      .then(([p, i]) => { setProducts(p); setIngs(i) })
      .catch((e) => setError(errMsg(e)))
  }, [emp])
  useEffect(load, [load])

  return (
    <Shell>
      <div className="page">
        <div className="page-head">
          <div><h2>Products & Recipes</h2><p className="sub">Menu items and the ingredients deducted per serving</p></div>
          <button className="btn" onClick={() => setEdit({ ...EMPTY })}>+ New product</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Category</th><th className="num">Price</th><th>Recipe</th><th>Status</th><th /></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.product_id}>
                  <td>{p.name}</td>
                  <td>{CATEGORY_LABEL[p.category] ?? p.category}</td>
                  <td className="num">{money(Number(p.price))}</td>
                  <td>{p.recipes.length === 0 ? <span className="badge warn">No recipe</span> : `${p.recipes.length} lines`}</td>
                  <td><span className={p.is_active ? 'badge ok' : 'badge'}>{p.is_active ? 'On sale' : 'Hidden'}</span></td>
                  <td><button className="link-btn" onClick={() => setEdit(p)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {edit && <ProductDialog init={edit} ings={ings} emp={emp} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
      </div>
    </Shell>
  )
}

function ProductDialog({ init, ings, emp, onClose, onSaved }: { init: AdminProduct; ings: IngredientRow[]; emp: number; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState(init)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const setRecipe = (i: number, patch: Partial<RecipeRow>) => setP({ ...p, recipes: p.recipes.map((r, k) => (k === i ? { ...r, ...patch } : r)) })

  async function save() {
    setBusy(true)
    setError('')
    try {
      await rpc('upsert_product', { p_emp: emp, p_product: { ...p, product_id: p.product_id || null, price: Number(p.price) } })
      onSaved()
    } catch (e) {
      setError(errMsg(e))
      setBusy(false)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="modal modal-wide">
        <h3 className="modal-title" style={{ marginBottom: 16 }}>{p.product_id ? 'Edit product' : 'New product'}</h3>
        <div className="form-grid">
          <label className="field full"><span>Name</span><input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
          <label className="field"><span>Category</span>
            <select value={p.category} onChange={(e) => setP({ ...p, category: e.target.value })}>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="field"><span>Price (Baht)</span><input inputMode="decimal" value={p.price} onChange={(e) => setP({ ...p, price: e.target.value as unknown as number })} /></label>
          <label className="field full"><span>Image URL (optional)</span><input value={p.image ?? ''} onChange={(e) => setP({ ...p, image: e.target.value })} /></label>
        </div>
        <p className="sec-label">Recipe per serving</p>
        {p.recipes.map((r, i) => {
          const unit = ings.find((x) => x.ingredient_id === r.ingredient_id)?.unit ?? ''
          return (
            <div className="recipe-row" key={i}>
              <select className="input-select" aria-label="Size" value={r.size} onChange={(e) => setRecipe(i, { size: e.target.value })}><option>M</option><option>L</option></select>
              <select className="input-select" aria-label="Ingredient" value={r.ingredient_id} onChange={(e) => setRecipe(i, { ingredient_id: Number(e.target.value) })}>
                {ings.map((x) => <option key={x.ingredient_id} value={x.ingredient_id}>{x.name}</option>)}
              </select>
              <input className="input" aria-label={`Quantity ${unit}`} placeholder={unit || 'qty'} inputMode="decimal" value={r.qty_per_serve || ''} onChange={(e) => setRecipe(i, { qty_per_serve: e.target.value as unknown as number })} />
              <button className="link-btn danger" aria-label="Remove line" onClick={() => setP({ ...p, recipes: p.recipes.filter((_, k) => k !== i) })}>✕</button>
            </div>
          )
        })}
        <button className="link-btn" style={{ paddingLeft: 0 }} onClick={() => setP({ ...p, recipes: [...p.recipes, { size: 'M', ingredient_id: ings[0]?.ingredient_id ?? 0, qty_per_serve: 0 }] })}>+ Add ingredient</button>
        <label className="row" style={{ alignItems: 'center', margin: '12px 0', minHeight: 44 }}>
          <input type="checkbox" checked={p.is_active} onChange={(e) => setP({ ...p, is_active: e.target.checked })} style={{ width: 20, height: 20 }} />
          <span>Available for sale (uncheck to hide from POS – history is kept)</span>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="btn btn-dark" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn" style={{ flex: 1 }} disabled={busy || !p.name.trim() || p.recipes.some((r) => !(Number(r.qty_per_serve) > 0))} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
