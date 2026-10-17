import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Shell } from '../components/Shell'
import { errMsg, fmtDateTime, fmtQty, rpc, todayStr } from '../lib/api'
import type { IngredientRow, MovementRow } from '../lib/types'

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
  const [tab, setTab] = useState<Tab>('list')
  const [rows, setRows] = useState<IngredientRow[]>([])
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(() => {
    rpc<IngredientRow[]>('get_ingredients', { p_emp: emp })
      .then(setRows)
      .catch((e) => setError(errMsg(e)))
  }, [emp])
  useEffect(load, [load])

  const alerts = rows.filter((r) => r.low || r.near_expiry).length

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

        {tab === 'list' && <List rows={rows} />}
        {tab === 'receive' && <Receive rows={rows} emp={emp} onDone={(m) => { setMsg(m); load() }} />}
        {tab === 'count' && <Count rows={rows} emp={emp} onDone={(m) => { setMsg(m); load() }} />}
        {tab === 'history' && <History rows={rows} emp={emp} />}
      </div>
    </Shell>
  )
}

/** S10 */
function List({ rows }: { rows: IngredientRow[] }) {
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr><th>Ingredient</th><th className="num">In stock</th><th className="num">Reorder point</th><th>Nearest expiry</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5} className="tbl-empty">No ingredients</td></tr>}
          {rows.map((r) => (
            <tr key={r.ingredient_id}>
              <td>{r.name}</td>
              <td className="num">{fmtQty(r.stock_qty)} {r.unit}</td>
              <td className="num">{fmtQty(r.reorder_point)} {r.unit}</td>
              <td>{r.nearest_expiry ?? '–'}</td>
              <td>
                {!r.low && !r.near_expiry && <span className="badge ok">Normal</span>}{' '}
                {r.low && <span className="badge bad">⚠ Below reorder point</span>}{' '}
                {r.near_expiry && <span className="badge warn">⏰ Expiring soon</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** S11 */
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
