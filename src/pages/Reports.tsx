import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Shell } from '../components/Shell'
import OrdersTable from '../components/OrdersTable'
import { errMsg, fmtDate, fmtDateTime, rpc, todayStr } from '../lib/api'
import { PAYMENT_LABEL, money, type PaymentMethod } from '../lib/pos'
import type { AuditRow, OrderRow, ReportGroup, SalesReport } from '../lib/types'

type Mode = 'day' | 'month' | 'year' | 'custom'
const MODES: { id: Mode; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'custom', label: 'Custom range' },
]
const pad = (n: number) => String(n).padStart(2, '0')
const fmtYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const shiftDay = (s: string, n: number) => {
  const [y, m, d] = s.split('-').map(Number)
  return fmtYmd(new Date(y, m - 1, d + n))
}
const shiftMonth = (s: string, n: number) => {
  const [y, m] = s.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
const monthName = (key: string, long = false) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-GB', long ? { month: 'long', year: 'numeric' } : { month: 'short' })
}

/** Turn the picker state into the date range + bucket size the report function expects */
function periodRange(mode: Mode, day: string, month: string, year: number, from: string, to: string): { from: string; to: string; group: ReportGroup; label: string } | null {
  if (mode === 'day') return day ? { from: day, to: day, group: 'hour', label: fmtDate(day) } : null
  if (mode === 'month') {
    if (!/^\d{4}-\d{2}$/.test(month)) return null
    const [y, m] = month.split('-').map(Number)
    return { from: `${month}-01`, to: `${month}-${pad(new Date(y, m, 0).getDate())}`, group: 'day', label: monthName(month, true) }
  }
  if (mode === 'year') {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return null
    return { from: `${year}-01-01`, to: `${year}-12-31`, group: 'month', label: String(year) }
  }
  if (!from || !to || to < from) return null
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const days = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000)
  return { from, to, group: days === 0 ? 'hour' : days <= 92 ? 'day' : 'month', label: from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}` }
}

/** ยอดขายตามโหมด วัน / เดือน / ปี หรือเลือกช่วงเวลาเอง */
function SalesSummary({ emp }: { emp: number }) {
  const thisYear = new Date().getFullYear()
  const [mode, setMode] = useState<Mode>('month')
  const [day, setDay] = useState(todayStr())
  const [month, setMonth] = useState(todayStr().slice(0, 7))
  const [year, setYear] = useState(thisYear)
  const [from, setFrom] = useState(todayStr(-29))
  const [to, setTo] = useState(todayStr())
  const [data, setData] = useState<SalesReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const range = useMemo(() => periodRange(mode, day, month, year, from, to), [mode, day, month, year, from, to])

  useEffect(() => {
    if (!range) return
    let alive = true
    setLoading(true)
    setError('')
    rpc<SalesReport>('get_sales_report', { p_emp: emp, p_from: range.from, p_to: range.to, p_group: range.group })
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errMsg(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [emp, range?.from, range?.to, range?.group]) // eslint-disable-line react-hooks/exhaustive-deps

  const today = todayStr()
  const step = (n: number) => {
    if (mode === 'day') setDay((d) => shiftDay(d, n))
    else if (mode === 'month') setMonth((m) => shiftMonth(m, n))
    else if (mode === 'year') setYear((y) => y + n)
  }
  const nextDisabled = mode === 'day' ? day >= today : mode === 'month' ? month >= today.slice(0, 7) : year >= thisYear

  const buckets = data && range && data.from === range.from && data.to === range.to && data.group === range.group ? data.buckets : null
  const max = Math.max(1, ...(buckets?.map((b) => Number(b.sales)) ?? [0]))
  const best = buckets && buckets.reduce((a, b) => (Number(b.sales) > Number(a.sales) ? b : a), buckets[0])
  const label = (key: string) => (range?.group === 'hour' ? `${key}:00` : range?.group === 'month' ? monthName(key) : fmtDate(key).slice(0, 6))
  const barLabel = (key: string) => (range?.group === 'hour' ? key : range?.group === 'month' ? monthName(key) : key.slice(8))
  const unit = range?.group === 'hour' ? 'hour' : range?.group === 'month' ? 'month' : 'day'
  const margin = data && data.sales > 0 ? Math.round((data.profit / data.sales) * 100) : 0

  function exportCsv() {
    if (!data || !buckets) return
    const lines = [[unit, 'bills', 'sales'], ...buckets.map((b) => [b.key, b.orders, b.sales])]
    const blob = new Blob(['\ufeff' + lines.map((l) => l.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `sales-summary_${data.from}_${data.to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <div className="period-bar">
        <div className="tabs flat" role="tablist" style={{ padding: 0 }}>
          {MODES.map((m) => (
            <button key={m.id} role="tab" aria-selected={mode === m.id} className={mode === m.id ? 'tab on' : 'tab'} onClick={() => setMode(m.id)}>{m.label}</button>
          ))}
        </div>
        <div className="toolbar">
          {mode !== 'custom' && <button className="mini-btn" aria-label="Previous period" onClick={() => step(-1)}>‹</button>}
          {mode === 'day' && <input className="input" type="date" aria-label="Day" value={day} max={today} onChange={(e) => setDay(e.target.value)} />}
          {mode === 'month' && <input className="input" type="month" aria-label="Month" value={month} max={today.slice(0, 7)} onChange={(e) => setMonth(e.target.value)} />}
          {mode === 'year' && <input className="input" type="number" aria-label="Year" min={2000} max={thisYear} value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }} />}
          {mode === 'custom' && (
            <>
              <input className="input" type="date" aria-label="From" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              <span className="muted">→</span>
              <input className="input" type="date" aria-label="To" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
            </>
          )}
          {mode !== 'custom' && <button className="mini-btn" aria-label="Next period" disabled={nextDisabled} onClick={() => step(1)}>›</button>}
          <button className="mini-btn" onClick={exportCsv} disabled={!buckets}>Export CSV</button>
        </div>
      </div>

      {!range && <p className="muted">Pick a valid {mode === 'custom' ? 'date range' : mode} to see sales.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {range && !data && !error && <p className="muted">Loading…</p>}

      {range && data && buckets && (
        <div style={{ opacity: loading ? 0.5 : 1 }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Showing <b>{range.label}</b> · by {unit} · shop time (Bangkok)
          </p>
          <div className="kpis">
            <div className="kpi"><p>SALES</p><b>{money(Number(data.sales))}</b><small>{data.orders} bill{data.orders === 1 ? '' : 's'}</small></div>
            <div className="kpi"><p>AVERAGE BILL</p><b>{money(Number(data.avg_bill))}</b><small>{money(Number(data.discount))} in discounts</small></div>
            <div className="kpi accent"><p>GROSS PROFIT</p><b>{money(Math.round(Number(data.profit)))}</b><small>{margin}% margin · cost {money(Math.round(Number(data.cost)))}</small></div>
            <div className="kpi"><p>CANCELLED BILLS</p><b>{data.cancelled}</b><small>{money(Number(data.cancelled_amount))} not counted</small></div>
          </div>
          <div className="dash-grid">
            <div className="card">
              <p className="sec-label">Sales by {unit}</p>
              <div className="bars" role="img" aria-label={`Sales by ${unit}`}>
                {buckets.map((b, i) => (
                  <div className="bar-col" key={b.key} title={`${label(b.key)}: ${money(Number(b.sales))} · ${b.orders} bill${b.orders === 1 ? '' : 's'}`}>
                    <div className="bar" style={{ height: `${(Number(b.sales) / max) * 100}%` }} />
                    <span>{buckets.length > 24 && i % 2 === 1 ? '' : barLabel(b.key)}</span>
                  </div>
                ))}
              </div>
              {best && Number(best.sales) > 0 && <p className="muted" style={{ margin: '12px 0 0', fontSize: 13 }}>Best {unit}: {label(best.key)} · {money(Number(best.sales))}</p>}
            </div>
            <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
              <div className="card">
                <p className="sec-label">Best sellers</p>
                {data.top_products.length === 0 && <p className="muted" style={{ margin: 0 }}>No sales in this period</p>}
                {data.top_products.map((p, i) => (
                  <div className="rank" key={p.name}><span><i>{i + 1}</i>{p.name}</span><span>{p.qty} · {money(Number(p.revenue))}</span></div>
                ))}
              </div>
              <div className="card">
                <p className="sec-label">Payment channels</p>
                {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                  <div className="rank" key={m}><span>{PAYMENT_LABEL[m]}</span><span>{money(Number(data.by_method[m] ?? 0))}</span></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** [S17 รายงาน / Audit Log] */
export default function Reports() {
  const { employee } = useAuth()
  const emp = employee!.employee_id
  const [tab, setTab] = useState<'summary' | 'sales' | 'audit'>('summary')
  const [from, setFrom] = useState(todayStr(-6))
  const [to, setTo] = useState(todayStr())
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setError('')
    if (tab === 'summary') return
    if (tab === 'sales') rpc<OrderRow[]>('get_orders', { p_emp: emp, p_from: from, p_to: to, p_shift: null }).then(setOrders).catch((e) => setError(errMsg(e)))
    else rpc<AuditRow[]>('get_audit_log', { p_emp: emp, p_limit: 200 }).then(setAudit).catch((e) => setError(errMsg(e)))
  }, [tab, emp, from, to])
  useEffect(load, [load])

  const paid = orders.filter((o) => o.status === 'paid')
  const total = paid.reduce((s, o) => s + Number(o.total_price), 0)

  function exportCsv() {
    const lines = [['bill', 'time', 'cashier', 'payment', 'total', 'status', 'items'], ...orders.map((o) => [o.order_id, o.order_date, o.cashier, o.method ?? '', o.total_price, o.status, `"${(o.items ?? '').replace(/"/g, '""')}"`])]
    const blob = new Blob(['\ufeff' + lines.map((l) => l.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `sales_${from}_${to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <Shell>
      <div className="page">
        <div className="page-head">
          <div><h2>Reports</h2><p className="sub">Sales summary, bill history and audit trail (the log cannot be edited or deleted)</p></div>
          {tab === 'sales' && (
            <div className="toolbar">
              <input className="input" type="date" aria-label="From" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              <span className="muted">→</span>
              <input className="input" type="date" aria-label="To" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)} />
              <button className="mini-btn" onClick={exportCsv} disabled={orders.length === 0}>Export CSV</button>
            </div>
          )}
        </div>
        <div className="tabs flat" role="tablist">
          <button role="tab" aria-selected={tab === 'summary'} className={tab === 'summary' ? 'tab on' : 'tab'} onClick={() => setTab('summary')}>Summary</button>
          <button role="tab" aria-selected={tab === 'sales'} className={tab === 'sales' ? 'tab on' : 'tab'} onClick={() => setTab('sales')}>Bills</button>
          <button role="tab" aria-selected={tab === 'audit'} className={tab === 'audit' ? 'tab on' : 'tab'} onClick={() => setTab('audit')}>Audit Log</button>
        </div>
        {error && tab !== 'summary' && <p className="error" role="alert">{error}</p>}

        {tab === 'summary' && <SalesSummary emp={emp} />}

        {tab === 'sales' && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>{paid.length} paid bills · {money(total)}</p>
            <OrdersTable rows={orders} emp={emp} canCancel={() => true} onChanged={load} />
          </>
        )}

        {tab === 'audit' && (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Time</th><th>By</th><th>Action</th><th>Record</th><th>Before</th><th>After</th></tr></thead>
              <tbody>
                {audit.length === 0 && <tr><td colSpan={6} className="tbl-empty">No entries</td></tr>}
                {audit.map((a) => (
                  <tr key={a.log_id}>
                    <td>{fmtDateTime(a.created_at)}</td><td>{a.employee}</td><td>{a.action}</td>
                    <td>{a.table_name}{a.record_id ? ` #${a.record_id}` : ''}</td>
                    <td>{a.old_value ?? '–'}</td><td>{a.new_value ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  )
}
