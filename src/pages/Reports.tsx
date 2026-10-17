import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Shell } from '../components/Shell'
import OrdersTable from '../components/OrdersTable'
import { errMsg, fmtDateTime, rpc, todayStr } from '../lib/api'
import { money } from '../lib/pos'
import type { AuditRow, OrderRow } from '../lib/types'

/** [S17 รายงาน / Audit Log] */
export default function Reports() {
  const { employee } = useAuth()
  const emp = employee!.employee_id
  const [tab, setTab] = useState<'sales' | 'audit'>('sales')
  const [from, setFrom] = useState(todayStr(-6))
  const [to, setTo] = useState(todayStr())
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setError('')
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
          <div><h2>Reports</h2><p className="sub">Sales history and audit trail (the log cannot be edited or deleted)</p></div>
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
          <button role="tab" aria-selected={tab === 'sales'} className={tab === 'sales' ? 'tab on' : 'tab'} onClick={() => setTab('sales')}>Sales</button>
          <button role="tab" aria-selected={tab === 'audit'} className={tab === 'audit' ? 'tab on' : 'tab'} onClick={() => setTab('audit')}>Audit Log</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}

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
