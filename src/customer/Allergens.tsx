import { Link } from 'react-router-dom'
import { ALLERGEN_LABEL } from '../lib/pos'
import { catLabel, useMenu } from './useMenu'

/** Allergen guide page for customers */
export default function Allergens() {
  const { data, error } = useMenu()
  const keys = Object.keys(ALLERGEN_LABEL)
  return (
    <div className="cs-wrap cs-page">
      <p className="cs-kicker">Good to know</p>
      <h1 className="cs-h1">Allergen guide</h1>
      <p className="cs-lead dark">A tick means the item contains that allergen. Tap an item for its ingredients. If you have a severe allergy, please tell our staff when you order.</p>
      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="cs-muted">Loading…</p>}
      {data && (
        <div className="table-wrap">
          <table className="tbl cs-allergy">
            <thead>
              <tr><th>Item</th>{keys.map((k) => <th key={k} className="num">{ALLERGEN_LABEL[k]}</th>)}</tr>
            </thead>
            <tbody>
              {data.products.map((p) => (
                <tr key={p.product_id}>
                  <td><Link to={`/menu/${p.product_id}`}><b>{p.name}</b></Link><br /><small className="muted">{catLabel(p.category)}</small></td>
                  {keys.map((k) => {
                    const has = (p.allergens ?? []).includes(k)
                    return <td key={k} className="num" aria-label={has ? 'Contains' : 'Does not contain'}>{has ? <span className="allergen">✓</span> : <span className="muted">–</span>}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
