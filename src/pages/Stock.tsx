import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Shell } from '../components/Shell'
import StockAlertBanner from '../components/StockAlertBanner'
import { errMsg, fmtDate, fmtDateTime, fmtQty, poNo, rpc, todayStr } from '../lib/api'
import { refreshStockAlerts } from '../lib/stockAlerts'
import { money } from '../lib/pos'
import type { IngredientRow, MovementRow, PurchaseOrder } from '../lib/types'

type Tab = 'list' | 'receive' | 'count' | 'history'
const TABS: { id: Tab; label: string }[] = [
  { id: 'list', label: 'Ingredients' },
  { id: 'receive', label: 'Receive Goods' },
  { id: 'count', label: 'Stock Count' },
  { id: 'history', label: 'History' },
]
const MOVE_LABEL: Record<string, string> = { sale: 'Sale', receive: 'Received', adjust: 'Adjusted', waste: 'Waste', return: 'Returned' }

/** [S10 สต็อกวัตถุดิบ] -> [S11 รับของเข้าคลัง] / [S12 ตรวจนับสต็อก] */
export default function Stock() {
  const { employee } = useAuth()
  const emp = employee!.employee_id
  const [params] = useSearchParams()
  const poParam = Number(params.get('po')) || null
  const [tab, setTab] = useState<Tab>(poParam ? 'receive' : 'list')
  const [rows, setRows] = useState<IngredientRow[]>([])
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(() => {
    rpc<IngredientRow[]>('get_ingredients', { p_emp: emp })
      .then(setRows)
      .catch((e) => setError(errMsg(e)))
  }, [emp])
  useEffect(load, [load])

  const alerts = rows.filter((r) => r.low || r.near_expiry || Number(r.stock_qty) <= 0).length
  const changed = (m: string) => {
    setMsg(m)
    load()
    void refreshStockAlerts(emp)
  }

  return (
    <Shell>
      <div className="page">
        <div className="page-head">
          <div>
            <h2>Inventory</h2>
            <p className="sub">Ingredient stock, goods receiving and stock counts</p>
          </div>
        </div>
        <div className="tabs flat" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab on' : 'tab'} onClick={() => { setTab(t.id); setMsg('') }}>
              {t.label}
              {t.id === 'list' && alerts > 0 && ` (${alerts})`}
            </button>
          ))}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {msg && <p className="notice" role="status">{msg}</p>}

        {tab === 'list' && (
          <>
            <StockAlertBanner />
            <List rows={rows} emp={emp} onChanged={changed} />
          </>
        )}
        {tab === 'receive' && <ReceiveTab rows={rows} emp={emp} initialPo={poParam} onDone={changed} />}
        {tab === 'count' && <Count rows={rows} emp={emp} onDone={changed} />}
        {tab === 'history' && <History rows={rows} emp={emp} />}
      </div>
    </Shell>
  )
}

/** S10 */
function List({ rows, emp, onChanged }: { rows: IngredientRow[]; emp: number; onChanged: (m: string) => void }) {
  const [edit, setEdit] = useState<IngredientRow | null>(null)
  const [reorder, setReorder] = useState('')
  const [days, setDays] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function open(r: IngredientRow) {
    setEdit(r)
    setReorder(String(r.reorder_point))
    setDays(String(r.expiry_alert_days))
    setError('')
  }

  async function save() {
    if (!edit) return
    setBusy(true)
    setError('')
    try {
      await rpc('set_reorder_point', { p_emp: emp, p_ingredient: edit.ingredient_id, p_reorder: Number(reorder), p_expiry_days: Number(days) })
      setEdit(null)
      onChanged(`Alert settings updated for ${edit.name}`)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Ingredient</th><th className="num">In stock</th><th className="num">Reorder point</th><th>Nearest expiry</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="tbl-empty">No ingredients</td></tr>}
            {rows.map((r) => {
              const out = Number(r.stock_qty) <= 0
              return (
                <tr key={r.ingredient_id}>
                  <td>{r.name}</td>
                  <td className="num">{fmtQty(r.stock_qty)} {r.unit}</td>
                  <td className="num">{fmtQty(r.reorder_point)} {r.unit}</td>
                  <td>{r.nearest_expiry ? fmtDate(r.nearest_expiry) : '–'}</td>
                  <td>
                    {!r.low && !r.near_expiry && !out && <span className="badge ok">Normal</span>}{' '}
                    {out && <span className="badge bad">⚠ Out of stock</span>}
                    {r.low && !out && <span className="badge bad">⚠ Below reorder point</span>}{' '}
                    {r.near_expiry && <span className="badge warn">⏰ Expiring soon</span>}
                  </td>
                  <td><button className="link-btn" onClick={() => open(r)}>Alert settings</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {edit && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h3 className="modal-title" style={{ marginBottom: 16 }}>Alert settings · {edit.name}</h3>
            <label className="field"><span>Reorder point ({edit.unit})</span><input inputMode="decimal" value={reorder} onChange={(e) => setReorder(e.target.value)} /><p className="hint">You get a warning when stock falls below this amount.</p></label>
            <label className="field"><span>Warn before expiry (days)</span><input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="modal-actions">
              <button className="btn btn-dark" style={{ flex: 1 }} onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn" style={{ flex: 1 }} disabled={busy || reorder === '' || days === '' || !(Number(reorder) >= 0) || !(Number(days) >= 0)} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** S11: รับของเข้าคลัง — อ้างอิงใบสั่งซื้อ หรือรับโดยไม่มีใบสั่งซื้อ */
function ReceiveTab({ rows, emp, initialPo, onDone }: { rows: IngredientRow[]; emp: number; initialPo: number | null; onDone: (m: string) => void }) {
  const [mode, setMode] = useState<'po' | 'manual'>('po')
  return (
    <>
      <div className="tabs flat" role="tablist" style={{ paddingBottom: 12 }}>
        <button role="tab" aria-selected={mode === 'po'} className={mode === 'po' ? 'tab on' : 'tab'} onClick={() => setMode('po')}>Against purchase order</button>
        <button role="tab" aria-selected={mode === 'manual'} className={mode === 'manual' ? 'tab on' : 'tab'} onClick={() => setMode('manual')}>Without purchase order</button>
      </div>
      {mode === 'po' ? <ReceivePo emp={emp} initialPo={initialPo} onDone={onDone} /> : <Receive rows={rows} emp={emp} onDone={onDone} />}
    </>
  )
}

function ReceivePo({ emp, initialPo, onDone }: { emp: number; initialPo: number | null; onDone: (m: string) => void }) {
  const [pos, setPos] = useState<PurchaseOrder[] | null>(null)
  const [sel, setSel] = useState<number | null>(initialPo)
  const [qty, setQty] = useState<Record<number, string>>({})
  const [cost, setCost] = useState<Record<number, string>>({})
  const [exp, setExp] = useState<Record<number, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    rpc<PurchaseOrder[]>('list_purchase_orders', { p_emp: emp, p_statuses: ['sent', 'partial'] })
      .then(setPos)
      .catch((e) => setError(errMsg(e)))
  }, [emp])
  useEffect(load, [load])

  const po = pos?.find((p) => p.po_id === sel) ?? null
  const remaining = (l: PurchaseOrder['lines'][number]) => Math.max(0, Number(l.qty_ordered) - Number(l.qty_received))
  const entered = po ? po.lines.filter((l) => Number(qty[l.po_detail_id]) > 0) : []

  function pick(id: number | null) {
    setSel(id)
    setQty({})
    setCost({})
    setExp({})
    setError('')
  }

  async function submit() {
    if (!po) return
    setBusy(true)
    setError('')
    try {
      const lines = entered.map((l) => ({
        po_detail_id: l.po_detail_id,
        qty_received: Number(qty[l.po_detail_id]),
        unit_cost: Number(cost[l.po_detail_id] ?? l.unit_price),
        expiry_date: exp[l.po_detail_id] || null,
      }))
      const r = await rpc<{ status: string; lots: number }>('receive_po', { p_emp: emp, p_po: po.po_id, p_lines: lines })
      onDone(`Received ${r.lots} line${r.lots > 1 ? 's' : ''} against ${poNo(po.po_id)} · order is now ${r.status === 'received' ? 'fully received' : 'partially received'}`)
      pick(r.status === 'received' ? null : po.po_id)
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  if (pos === null) return error ? <p className="error" role="alert">{error}</p> : <p className="muted">Loading…</p>

  return (
    <>
      {pos.length === 0 && (
        <div className="card form-card">
          <p style={{ marginTop: 0 }}>No purchase orders are waiting for goods.</p>
          <p className="muted" style={{ marginBottom: 0 }}>Create one and mark it as sent in <Link to="/purchasing" className="alert-link">Purchase Orders</Link>, or use “Without purchase order”.</p>
        </div>
      )}
      {pos.length > 0 && (
        <>
          <label className="field" style={{ maxWidth: 480 }}>
            <span>Purchase order</span>
            <select value={sel ?? ''} onChange={(e) => pick(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Select a purchase order…</option>
              {pos.map((p) => <option key={p.po_id} value={p.po_id}>{poNo(p.po_id)} · {p.supplier} · {p.status === 'partial' ? 'partly received' : 'sent'}</option>)}
            </select>
          </label>
          {initialPo && !po && sel === initialPo && <p className="notice warn">{poNo(initialPo)} is not waiting for goods (it may be fully received or not sent yet).</p>}
        </>
      )}

      {po && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            {po.supplier}{po.expected_date ? ` · expected ${fmtDate(po.expected_date)}` : ''} · ordered {money(Number(po.total_cost))}. Enter what actually arrived; leave a line blank if it was not delivered.
          </p>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ingredient</th><th className="num">Ordered</th><th className="num">Received so far</th><th className="num">Remaining</th>
                  <th style={{ width: 130 }}>Received now</th><th style={{ width: 130 }}>Cost / unit (฿)</th><th style={{ width: 160 }}>Lot expiry</th>
                </tr>
              </thead>
              <tbody>
                {po.lines.map((l) => {
                  const id = l.po_detail_id
                  const left = remaining(l)
                  const over = Number(qty[id]) > left
                  const priceDiff = qty[id] && cost[id] !== undefined && Number(cost[id]) !== Number(l.unit_price)
                  return (
                    <tr key={id}>
                      <td>{l.ingredient}</td>
                      <td className="num">{fmtQty(l.qty_ordered)} {l.unit}</td>
                      <td className="num">{fmtQty(l.qty_received)}</td>
                      <td className="num">{fmtQty(left)}</td>
                      <td>
                        <input className="input" inputMode="decimal" aria-label={`Received ${l.ingredient}`} placeholder={left > 0 ? String(left) : '0'} value={qty[id] ?? ''} onChange={(e) => setQty({ ...qty, [id]: e.target.value })} />
                        {over && <small className="hint-warn">more than ordered</small>}
                      </td>
                      <td>
                        <input className="input" inputMode="decimal" aria-label={`Cost per unit ${l.ingredient}`} value={cost[id] ?? String(l.unit_price)} onChange={(e) => setCost({ ...cost, [id]: e.target.value })} />
                        {priceDiff && <small className="hint-warn">differs from order ({money(Number(l.unit_price))})</small>}
                      </td>
                      <td><input className="input" type="date" min={todayStr()} aria-label={`Expiry ${l.ingredient}`} value={exp[id] ?? ''} onChange={(e) => setExp({ ...exp, [id]: e.target.value })} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {error && <p className="error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
          <div className="row" style={{ marginTop: 16, maxWidth: 520 }}>
            <button className="btn btn-dark" onClick={() => setQty(Object.fromEntries(po.lines.filter((l) => remaining(l) > 0).map((l) => [l.po_detail_id, String(remaining(l))])))}>Fill remaining</button>
            <button className="btn" style={{ flex: 1 }} disabled={busy || entered.length === 0} onClick={submit}>{busy ? 'Saving…' : `Receive into stock${entered.length ? ` (${entered.length} line${entered.length > 1 ? 's' : ''})` : ''}`}</button>
          </div>
        </>
      )}
    </>
  )
}

/** รับของโดยไม่มีใบสั่งซื้อ */
function Receive({ rows, emp, onDone }: { rows: IngredientRow[]; emp: number; onDone: (m: string) => void }) {
  const [ing, setIng] = useState('')
  const [qty, setQty] = useState('')
  const [cost, setCost] = useState('')
  const [expiry, setExpiry] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const sel = rows.find((r) => String(r.ingredient_id) === ing)

  async function submit() {
    setBusy(true)
    setError('')
    try {
      await rpc('receive_stock', { p_emp: emp, p_ingredient: Number(ing), p_qty: Number(qty), p_unit_cost: cost === '' ? null : Number(cost), p_expiry: expiry || null })
      onDone(`Received ${fmtQty(Number(qty))} ${sel?.unit} of ${sel?.name}`)
      setQty(''); setCost(''); setExpiry('')
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card form-card">
      <label className="field">
        <span>Ingredient</span>
        <select value={ing} onChange={(e) => setIng(e.target.value)}>
          <option value="">Select ingredient…</option>
          {rows.map((r) => <option key={r.ingredient_id} value={r.ingredient_id}>{r.name}</option>)}
        </select>
      </label>
      <div className="form-grid">
        <label className="field"><span>Quantity received {sel ? `(${sel.unit})` : ''}</span><input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        <label className="field"><span>Cost per unit (Baht)</span><input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
        <label className="field full"><span>Expiry date (optional)</span><input type="date" min={todayStr()} value={expiry} onChange={(e) => setExpiry(e.target.value)} /></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-block" disabled={busy || !ing || !(Number(qty) > 0)} onClick={submit}>{busy ? 'Saving…' : 'Receive into stock'}</button>
    </div>
  )
}

/** S12: นับจริงแล้วกรอก ระบบคำนวณผลต่างและสร้าง movement 'adjust' */
function Count({ rows, emp, onDone }: { rows: IngredientRow[]; emp: number; onDone: (m: string) => void }) {
  const [counted, setCounted] = useState<Record<number, string>>({})
  const [reason, setReason] = useState<Record<number, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const changed = rows.filter((r) => counted[r.ingredient_id] !== undefined && counted[r.ingredient_id] !== '' && Number(counted[r.ingredient_id]) !== Number(r.stock_qty))
  const missingReason = changed.some((r) => !reason[r.ingredient_id]?.trim())

  async function submit() {
    setBusy(true)
    setError('')
    try {
      const payload = rows
        .filter((r) => counted[r.ingredient_id] !== undefined && counted[r.ingredient_id] !== '')
        .map((r) => ({ ingredient_id: r.ingredient_id, counted_qty: Number(counted[r.ingredient_id]), reason: reason[r.ingredient_id] ?? '' }))
      const n = await rpc<number>('count_stock', { p_emp: emp, p_counts: payload })
      onDone(n === 0 ? 'Count matches the system – nothing to adjust' : `Adjusted ${n} item(s) and recorded in the audit log`)
      setCounted({}); setReason({})
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Ingredient</th><th className="num">System</th><th style={{ width: 150 }}>Counted</th><th className="num">Difference</th><th>Reason (required if different)</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const c = counted[r.ingredient_id]
              const diff = c === undefined || c === '' ? null : Number(c) - Number(r.stock_qty)
              return (
                <tr key={r.ingredient_id}>
                  <td>{r.name}</td>
                  <td className="num">{fmtQty(r.stock_qty)} {r.unit}</td>
                  <td><input className="input" inputMode="decimal" aria-label={`Counted ${r.name}`} value={c ?? ''} onChange={(e) => setCounted({ ...counted, [r.ingredient_id]: e.target.value })} /></td>
                  <td className={'num ' + (diff === null || diff === 0 ? '' : 'diff-bad')}>{diff === null ? '–' : (diff > 0 ? '+' : '') + fmtQty(diff)}</td>
                  <td>{diff !== null && diff !== 0 && <input className="input" aria-label={`Reason ${r.name}`} placeholder="e.g. spillage, miscount" value={reason[r.ingredient_id] ?? ''} onChange={(e) => setReason({ ...reason, [r.ingredient_id]: e.target.value })} />}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {error && <p className="error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
      <div style={{ marginTop: 16, maxWidth: 360 }}>
        <button className="btn btn-block" disabled={busy || Object.values(counted).every((v) => v === '') || missingReason} onClick={submit}>
          {busy ? 'Saving…' : `Confirm count${changed.length ? ` (${changed.length} to adjust)` : ''}`}
        </button>
      </div>
    </>
  )
}

function History({ rows, emp }: { rows: IngredientRow[]; emp: number }) {
  const [ing, setIng] = useState('')
  const [data, setData] = useState<MovementRow[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    rpc<MovementRow[]>('get_stock_movements', { p_emp: emp, p_ingredient: ing ? Number(ing) : null, p_limit: 100 })
      .then(setData)
      .catch((e) => setError(errMsg(e)))
  }, [emp, ing])
  return (
    <>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <select className="input-select" style={{ width: 240 }} value={ing} onChange={(e) => setIng(e.target.value)} aria-label="Filter ingredient">
          <option value="">All ingredients</option>
          {rows.map((r) => <option key={r.ingredient_id} value={r.ingredient_id}>{r.name}</option>)}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Time</th><th>Ingredient</th><th>Type</th><th className="num">Change</th><th>Reason</th><th>By</th></tr></thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={6} className="tbl-empty">No movements</td></tr>}
            {data.map((m) => (
              <tr key={m.movement_id}>
                <td>{fmtDateTime(m.movement_date)}</td>
                <td>{m.ingredient}</td>
                <td><span className="badge">{MOVE_LABEL[m.movement_type]}</span></td>
                <td className={'num ' + (m.quantity_change < 0 ? 'diff-bad' : 'diff-ok')}>{m.quantity_change > 0 ? '+' : ''}{fmtQty(m.quantity_change)} {m.unit}</td>
                <td>{m.reason ?? '–'}</td>
                <td>{m.employee}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
