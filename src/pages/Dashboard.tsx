import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Shell } from '../components/Shell'
import StockAlertBanner from '../components/StockAlertBanner'
import { errMsg, rpc, todayStr } from '../lib/api'
import { PAYMENT_LABEL, money, type PaymentMethod } from '../lib/pos'
import type { DashboardData } from '../lib/types'

const RANGES = [
  { label: 'Today', days: 0 },
  { label: '7 days', days: 6 },
  { label: '30 days', days: 29 },
]

/** [S13 Dashboard] ยอดขาย ต้นทุน กำไร มูลค่าวัตถุดิบ สินค้าขายดี */
export default function Dashboard() {
  const { employee } = useAuth()
  const [days, setDays] = useState(6)
  const [d, setD] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setD(null)
    rpc<DashboardData>('get_dashboard', { p_emp: employee!.employee_id, p_from: todayStr(-days), p_to: todayStr() })
      .then(setD)
      .catch((e) => setError(errMsg(e)))
  }, [employee, days])

  const max = Math.max(1, ...(d?.by_day.map((x) => Number(x.sales)) ?? [0]))
  const margin = d && d.sales > 0 ? Math.round((d.profit / d.sales) * 100) : 0

  return (
    <Shell>
      <div className="page">
        <div className="page-head">
          <div><h2>Dashboard</h2><p className="sub">Sales, cost and profit overview</p></div>
          <div className="tabs flat" style={{ padding: 0 }}>
            {RANGES.map((r) => <button key={r.days} className={days === r.days ? 'tab on' : 'tab'} onClick={() => setDays(r.days)}>{r.label}</button>)}
          </div>
        </div>
        <StockAlertBanner />
        {error && <p className="error" role="alert">{error}</p>}
        {!d && !error && <p className="muted">Loading…</p>}
        {d && (
          <>
            <div className="kpis">
              <div className="kpi"><p>SALES</p><b>{money(Number(d.sales))}</b><small>{d.orders} orders</small></div>
              <div className="kpi"><p>COST (INGREDIENTS)</p><b>{money(Math.round(Number(d.cost)))}</b><small>from recipes × unit cost</small></div>
              <div className="kpi accent"><p>GROSS PROFIT</p><b>{money(Math.round(Number(d.profit)))}</b><small>{margin}% margin</small></div>
              <div className="kpi"><p>STOCK VALUE</p><b>{money(Math.round(Number(d.stock_value)))}</b><small>{d.low_stock > 0 ? `⚠ ${d.low_stock} below reorder point` : 'All above reorder point'}</small></div>
            </div>
            <div className="dash-grid">
              <div className="card">
                <p className="sec-label">Daily sales</p>
                <div className="bars" role="img" aria-label="Daily sales chart">
                  {d.by_day.map((x) => (
                    <div className="bar-col" key={x.day} title={`${x.day}: ${money(Number(x.sales))}`}>
                      <div className="bar" style={{ height: `${(Number(x.sales) / max) * 100}%` }} />
                      <span>{d.by_day.length > 10 ? x.day.slice(8) : x.day.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
                <div className="card">
                  <p className="sec-label">Best sellers</p>
                  {d.top_products.length === 0 && <p className="muted" style={{ margin: 0 }}>No sales yet</p>}
                  {d.top_products.map((p, i) => (
                    <div className="rank" key={p.name}><span><i>{i + 1}</i>{p.name}</span><span>{p.qty} · {money(Number(p.revenue))}</span></div>
                  ))}
                </div>
                <div className="card">
                  <p className="sec-label">Payment channels</p>
                  {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                    <div className="rank" key={m}><span>{PAYMENT_LABEL[m]}</span><span>{money(Number(d.by_method[m] ?? 0))}</span></div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Shell>
  )
}
