import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Shell } from '../components/Shell'
import { errMsg, fmtDate, fmtDateTime, fmtQty, poNo, rpc, todayStr } from '../lib/api'
import { money } from '../lib/pos'
import type { PoStatus, PurchaseOrder, Supplier } from '../lib/types'

const STATUS_LABEL: Record<PoStatus, string> = { draft: 'Draft', sent: 'Sent', partial: 'Partly received', received: 'Received', cancelled: 'Cancelled' }
const STATUS_BADGE: Record<PoStatus, string> = { draft: 'badge', sent: 'badge warn', partial: 'badge warn', received: 'badge ok', cancelled: 'badge bad' }
const STEPS: { key: PoStatus; label: string }[] = [
  { key: 'draft', label: 'Created' },
  { key: 'sent', label: 'Sent' },
  { key: 'partial', label: 'Receiving' },
  { key: 'received', label: 'Received' },
]
const STEP_INDEX: Record<PoStatus, number> = { draft: 0, sent: 1, partial: 2, received: 3, cancelled: -1 }

interface LineDraft { ingredient_id: string; qty: string; unit_price: string }
interface Draft { po_id: number | null; supplier_id: string; expected_date: string; note: string; lines: LineDraft[] }

const isOverdue = (po: PurchaseOrder) => (po.status === 'sent' || po.status === 'partial') && !!po.expected_date && po.expected_date.slice(0, 10) < todayStr()

/** สร้างและติดตามสถานะใบสั่งซื้อ: draft → sent → partial → received (หรือ cancelled) */
export default function PurchaseOrders() {
  const { employee } = useAuth()
  const emp = employee!.employee_id
  const [params, setParams] = useSearchParams()
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [filter, setFilter] = useState<'all' | PoStatus>('all')
  const [viewId, setViewId] = useState<number | null>(null)
  const [edit, setEdit] = useState<Draft | null>(null)
  const [confirming, setConfirming] = useState<'cancelled' | 'received' | null>(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    rpc<PurchaseOrder[]>('list_purchase_orders', { p_emp: emp, p_statuses: null }).then(setPos).catch((e) => setError(errMsg(e)))
  }, [emp])
  useEffect(load, [load])
  useEffect(() => {
    rpc<Supplier[]>('list_suppliers', { p_emp: emp }).then(setSuppliers).catch((e) => setError(errMsg(e)))
  }, [emp])

  // arriving from a stock alert: /purchasing?new=1 opens an empty order
  useEffect(() => {
    if (params.get('new')) {
      setEdit({ po_id: null, supplier_id: '', expected_date: '', note: '', lines: [] })
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  const view = pos.find((p) => p.po_id === viewId) ?? null
  const shown = pos.filter((p) => filter === 'all' || p.status === filter)
  const count = (s: PoStatus) => pos.filter((p) => p.status === s).length
  const supplierOf = (id: string) => suppliers.find((s) => String(s.supplier_id) === id)

  function openEditor(po: PurchaseOrder | null) {
    setError('')
    setMsg('')
    setEdit(
      po
        ? {
            po_id: po.po_id,
            supplier_id: String(po.supplier_id),
            expected_date: po.expected_date?.slice(0, 10) ?? '',
            note: po.note ?? '',
            lines: po.lines.map((l) => ({ ingredient_id: String(l.ingredient_id), qty: String(l.qty_ordered), unit_price: String(l.unit_price) })),
          }
        : { po_id: null, supplier_id: '', expected_date: '', note: '', lines: [] },
    )
  }

  function changeSupplier(id: string) {
    setEdit((d) => {
      if (!d) return d
      const sup = suppliers.find((s) => String(s.supplier_id) === id)
      // keep lines this supplier can deliver, with that supplier's price
      const lines = d.lines.flatMap((l) => {
        const si = sup?.ingredients.find((i) => String(i.ingredient_id) === l.ingredient_id)
        return si ? [{ ...l, unit_price: String(si.unit_price) }] : []
      })
      return { ...d, supplier_id: id, lines }
    })
  }

  function pickIngredient(i: number, ingredientId: string) {
    setEdit((d) => {
      if (!d) return d
      const si = supplierOf(d.supplier_id)?.ingredients.find((x) => String(x.ingredient_id) === ingredientId)
      return { ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ingredient_id: ingredientId, unit_price: si ? String(si.unit_price) : '' } : l)) }
    })
  }
  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setEdit((d) => d && { ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })

  async function save(send: boolean) {
    if (!edit) return
    setBusy(true)
    setError('')
    try {
      const id = await rpc<number>('save_po', {
        p_emp: emp,
        p_data: {
          po_id: edit.po_id,
          supplier_id: Number(edit.supplier_id),
          expected_date: edit.expected_date || null,
          note: edit.note,
          lines: edit.lines.map((l) => ({ ingredient_id: Number(l.ingredient_id), qty_ordered: Number(l.qty), unit_price: Number(l.unit_price) })),
        },
      })
      if (send) await rpc('set_po_status', { p_emp: emp, p_po: id, p_status: 'sent' })
      setMsg(`${poNo(id)} ${send ? 'saved and marked as sent' : 'saved as draft'}`)
      setEdit(null)
      setViewId(null)
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(po: PurchaseOrder, status: PoStatus) {
    setBusy(true)
    setError('')
    try {
      await rpc('set_po_status', { p_emp: emp, p_po: po.po_id, p_status: status })
      setConfirming(null)
      setMsg(`${poNo(po.po_id)} is now ${STATUS_LABEL[status].toLowerCase()}`)
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const draftTotal = edit ? edit.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0) : 0
  const draftValid =
    !!edit && edit.supplier_id !== '' && edit.lines.length > 0 &&
    edit.lines.every((l) => l.ingredient_id !== '' && Number(l.qty) > 0 && l.unit_price !== '' && Number(l.unit_price) >= 0)
  const editSup = edit ? supplierOf(edit.supplier_id) : undefined

  return (
    <Shell>
      <div className="page">
        <div className="page-head">
          <div><h2>Purchase Orders</h2><p className="sub">Order ingredients from suppliers and follow each order until the goods arrive</p></div>
          <div className="toolbar">
            <Link to="/suppliers" className="mini-btn" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Suppliers</Link>
            <button className="btn" onClick={() => openEditor(null)}>+ New purchase order</button>
          </div>
        </div>

        <div className="tabs flat" role="tablist">
          <button role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'tab on' : 'tab'} onClick={() => setFilter('all')}>All ({pos.length})</button>
          {(Object.keys(STATUS_LABEL) as PoStatus[]).map((s) => (
            <button key={s} role="tab" aria-selected={filter === s} className={filter === s ? 'tab on' : 'tab'} onClick={() => setFilter(s)}>{STATUS_LABEL[s]} ({count(s)})</button>
          ))}
        </div>
        {msg && <p className="notice" role="status">{msg}</p>}
        {error && !edit && !view && <p className="error" role="alert">{error}</p>}

        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>PO</th><th>Supplier</th><th>Created</th><th>Expected</th><th className="num">Items</th><th className="num">Total</th><th>Status</th><th /></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={8} className="tbl-empty">No purchase orders</td></tr>}
              {shown.map((p) => (
                <tr key={p.po_id}>
                  <td><b>{poNo(p.po_id)}</b></td>
                  <td>{p.supplier}</td>
                  <td>{fmtDateTime(p.order_date)}</td>
                  <td>{fmtDate(p.expected_date)}</td>
                  <td className="num">{p.lines.length}</td>
                  <td className="num">{money(Number(p.total_cost))}</td>
                  <td>
                    <span className={STATUS_BADGE[p.status]}>{STATUS_LABEL[p.status]}</span>{' '}
                    {isOverdue(p) && <span className="badge bad">Overdue</span>}
                  </td>
                  <td><button className="link-btn" onClick={() => { setError(''); setMsg(''); setConfirming(null); setViewId(p.po_id) }}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {view && !edit && (
          <div className="overlay" role="dialog" aria-modal="true">
            <div className="modal modal-xl">
              <div className="po-title">
                <h3 className="modal-title">{poNo(view.po_id)} · {view.supplier}</h3>
                <span className={STATUS_BADGE[view.status]}>{STATUS_LABEL[view.status]}</span>
                {isOverdue(view) && <span className="badge bad">Overdue</span>}
              </div>

              {view.status === 'cancelled' ? (
                <p className="muted" style={{ margin: '0 0 16px' }}>Cancelled {view.closed_at ? fmtDateTime(view.closed_at) : ''}</p>
              ) : (
                <ol className="steps" aria-label="Order progress">
                  {STEPS.map((st, i) => (
                    <li key={st.key} className={i < STEP_INDEX[view.status] ? 'done' : i === STEP_INDEX[view.status] ? 'now' : ''}>
                      <i>{i < STEP_INDEX[view.status] || view.status === 'received' ? '✓' : i + 1}</i>{st.label}
                    </li>
                  ))}
                </ol>
              )}

              <p className="muted" style={{ fontSize: 14, margin: '0 0 12px' }}>
                Created {fmtDateTime(view.order_date)} by {view.created_by}
                {view.sent_at && ` · sent ${fmtDateTime(view.sent_at)}`}
                {view.expected_date && ` · expected ${fmtDate(view.expected_date)}`}
                {view.status === 'received' && view.closed_at && ` · completed ${fmtDateTime(view.closed_at)}`}
              </p>
              {view.note && <p style={{ fontSize: 14, margin: '0 0 12px' }}>Note: {view.note}</p>}

              <div className="table-wrap" style={{ marginBottom: 16 }}>
                <table className="tbl">
                  <thead><tr><th>Ingredient</th><th className="num">Ordered</th><th className="num">Received</th><th className="num">Price / unit</th><th className="num">Line total</th></tr></thead>
                  <tbody>
                    {view.lines.map((l) => {
                      const done = Number(l.qty_received) >= Number(l.qty_ordered)
                      return (
                        <tr key={l.po_detail_id}>
                          <td>{l.ingredient}</td>
                          <td className="num">{fmtQty(l.qty_ordered)} {l.unit}</td>
                          <td className="num">{view.status === 'draft' ? '–' : <span className={done ? 'diff-ok' : ''}>{fmtQty(l.qty_received)} {l.unit}</span>}</td>
                          <td className="num">{money(Number(l.unit_price))}</td>
                          <td className="num">{money(Number(l.qty_ordered) * Number(l.unit_price))}</td>
                        </tr>
                      )
                    })}
                    <tr><td colSpan={4} className="num"><b>Total</b></td><td className="num"><b>{money(Number(view.total_cost))}</b></td></tr>
                  </tbody>
                </table>
              </div>

              {view.receipts.length > 0 && (
                <>
                  <p className="sec-label">Goods received (one lot per delivery)</p>
                  <div className="table-wrap" style={{ marginBottom: 16 }}>
                    <table className="tbl">
                      <thead><tr><th>Date</th><th>Ingredient</th><th className="num">Qty</th><th className="num">Cost / unit</th><th>Lot expiry</th></tr></thead>
                      <tbody>
                        {view.receipts.map((r) => (
                          <tr key={r.lot_id}>
                            <td>{fmtDateTime(r.received_at)}</td><td>{r.ingredient}</td>
                            <td className="num">{fmtQty(r.qty_received)} {r.unit}</td>
                            <td className="num">{r.unit_cost == null ? '–' : money(Number(r.unit_cost))}</td>
                            <td>{fmtDate(r.expiry_date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {confirming && (
                <p className="notice warn" role="alert">
                  {confirming === 'cancelled'
                    ? 'Cancel this purchase order? It cannot be sent or received afterwards.'
                    : 'Close this order as received? Items that have not arrived will no longer be expected.'}
                </p>
              )}
              {error && <p className="error" role="alert">{error}</p>}
              <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
                <button className="btn btn-dark" onClick={() => { setViewId(null); setConfirming(null) }}>Close</button>
                {confirming ? (
                  <>
                    <button className="btn btn-dark" onClick={() => setConfirming(null)}>Go back</button>
                    <button className="btn" style={{ background: confirming === 'cancelled' ? 'var(--danger)' : undefined }} disabled={busy} onClick={() => setStatus(view, confirming)}>
                      {busy ? 'Saving…' : confirming === 'cancelled' ? 'Yes, cancel order' : 'Yes, close order'}
                    </button>
                  </>
                ) : (
                  <>
                    {view.status === 'draft' && <button className="btn btn-dark" onClick={() => openEditor(view)}>Edit</button>}
                    {view.status === 'draft' && <button className="btn" disabled={busy} onClick={() => setStatus(view, 'sent')}>Mark as sent</button>}
                    {(view.status === 'sent' || view.status === 'partial') && <Link to={`/stock?po=${view.po_id}`} className="btn" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Receive goods</Link>}
                    {view.status === 'partial' && <button className="btn btn-dark" onClick={() => setConfirming('received')}>Close as received</button>}
                    {(view.status === 'draft' || view.status === 'sent') && <button className="link-btn danger" onClick={() => setConfirming('cancelled')}>Cancel order</button>}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {edit && (
          <div className="overlay" role="dialog" aria-modal="true">
            <div className="modal modal-xl">
              <h3 className="modal-title" style={{ marginBottom: 16 }}>{edit.po_id ? `Edit ${poNo(edit.po_id)}` : 'New purchase order'}</h3>
              <div className="form-grid">
                <label className="field"><span>Supplier</span>
                  <select value={edit.supplier_id} onChange={(e) => changeSupplier(e.target.value)}>
                    <option value="">Select supplier…</option>
                    {suppliers.filter((s) => s.is_active || String(s.supplier_id) === edit.supplier_id).map((s) => <option key={s.supplier_id} value={s.supplier_id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="field"><span>Expected delivery (optional)</span><input type="date" min={todayStr()} value={edit.expected_date} onChange={(e) => setEdit({ ...edit, expected_date: e.target.value })} /></label>
                <label className="field full"><span>Note (optional)</span><input maxLength={200} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></label>
              </div>

              <p className="sec-label">Ingredients</p>
              {edit.supplier_id === '' && <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>Choose a supplier first. You can only order what that supplier delivers.</p>}
              {editSup && editSup.ingredients.length === 0 && (
                <p className="notice warn">This supplier has no ingredients yet. Add them in <Link to="/suppliers" className="alert-link">Suppliers</Link>.</p>
              )}
              {editSup && edit.lines.map((l, i) => {
                const si = editSup.ingredients.find((x) => String(x.ingredient_id) === l.ingredient_id)
                const used = edit.lines.map((x) => x.ingredient_id)
                return (
                  <div className="recipe-row po-line" key={i}>
                    <select className="input-select" aria-label={`Ingredient ${i + 1}`} value={l.ingredient_id} onChange={(e) => pickIngredient(i, e.target.value)}>
                      <option value="">Select ingredient…</option>
                      {editSup.ingredients.filter((x) => String(x.ingredient_id) === l.ingredient_id || !used.includes(String(x.ingredient_id))).map((x) => <option key={x.ingredient_id} value={x.ingredient_id}>{x.ingredient}</option>)}
                    </select>
                    <input className="input" inputMode="decimal" placeholder={si ? `Qty (${si.unit})` : 'Qty'} aria-label="Quantity" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
                    <input className="input" inputMode="decimal" placeholder="Price / unit" aria-label="Price per unit" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} />
                    <span className="po-line-total">{money((Number(l.qty) || 0) * (Number(l.unit_price) || 0))}</span>
                    <button className="link-btn danger" aria-label="Remove line" onClick={() => setEdit({ ...edit, lines: edit.lines.filter((_, j) => j !== i) })}>✕</button>
                  </div>
                )
              })}
              {editSup && editSup.ingredients.length > edit.lines.length && (
                <button className="link-btn" style={{ paddingLeft: 0 }} onClick={() => setEdit({ ...edit, lines: [...edit.lines, { ingredient_id: '', qty: '', unit_price: '' }] })}>+ Add ingredient</button>
              )}
              <p className="po-total">Total <b>{money(draftTotal)}</b></p>

              {error && <p className="error" role="alert">{error}</p>}
              <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
                <button className="btn btn-dark" onClick={() => setEdit(null)}>Cancel</button>
                <button className="btn btn-dark" style={{ flex: 1 }} disabled={busy || !draftValid} onClick={() => save(false)}>{busy ? 'Saving…' : 'Save as draft'}</button>
                <button className="btn" style={{ flex: 1 }} disabled={busy || !draftValid} onClick={() => save(true)}>Save and mark as sent</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}
