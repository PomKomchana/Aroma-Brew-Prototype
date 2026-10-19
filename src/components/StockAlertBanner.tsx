import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { fmtDate, fmtQty } from '../lib/api'
import { useStockAlerts } from '../lib/stockAlerts'

const MAX_SHOWN = 5

/** Warning strip for ingredients that are low / out of stock or close to expiry */
export default function StockAlertBanner() {
  const { employee } = useAuth()
  const data = useStockAlerts(employee?.employee_id ?? null, !!employee && employee.role !== 'cashier')
  if (!data || data.count === 0) return null

  const out = data.low.filter((x) => x.level === 'out')
  const low = data.low.filter((x) => x.level === 'low')
  const rows = [...out, ...low]
  const more = rows.length - MAX_SHOWN

  return (
    <div className="alert-banner" role="alert">
      <div className="alert-head">
        <b>⚠ {data.count} ingredient{data.count > 1 ? 's' : ''} need attention</b>
        <Link to="/purchasing?new=1" className="alert-link">Create purchase order →</Link>
      </div>
      {rows.slice(0, MAX_SHOWN).map((x) => (
        <div className="alert-row" key={x.ingredient_id}>
          <span>{x.name}</span>
          <span>
            {x.level === 'out' ? <span className="badge bad">Out of stock</span> : <span className="badge warn">Running low</span>}{' '}
            {fmtQty(x.stock_qty)} {x.unit} left · reorder at {fmtQty(x.reorder_point)}
          </span>
        </div>
      ))}
      {more > 0 && <p className="alert-more">and {more} more below the reorder point</p>}
      {data.near_expiry.length > 0 && (
        <div className="alert-row">
          <span>Expiring soon</span>
          <span>{data.near_expiry.map((x) => `${x.name} (${fmtDate(x.nearest_expiry)})`).join(', ')}</span>
        </div>
      )}
    </div>
  )
}
