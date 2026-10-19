import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Shell } from '../components/Shell'
import { errMsg, rpc } from '../lib/api'
import { money } from '../lib/pos'
import type { IngredientRow, Supplier } from '../lib/types'

interface LineDraft { ingredient_id: string; unit_price: string; lead_time_days: string }
interface Draft {
  supplier_id: number | null
  name: string
  contact_name: string
  phone_number: string
  address: string
  is_active: boolean
  ingredients: LineDraft[]
}

const blank: Draft = { supplier_id: null, name: '', contact_name: '', phone_number: '', address: '', is_active: true, ingredients: [] }

/** ข้อมูลซัพพลายเออร์ + รายการวัตถุดิบที่จัดส่งแต่ละราย (ราคา/หน่วย, lead time) */
export default function Suppliers() {
  const { employee } = useAuth()
  const emp = employee!.employee_id
  const [rows, setRows] = useState<Supplier[]>([])
  const [ings, setIngs] = useState<IngredientRow[]>([])
  const [edit, setEdit] = useState<Draft | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    rpc<Supplier[]>('list_suppliers', { p_emp: emp }).then(setRows).catch((e) => setError(errMsg(e)))
  }, [emp])
  useEffect(load, [load])
  useEffect(() => {
    rpc<IngredientRow[]>('get_ingredients', { p_emp: emp }).then(setIngs).catch((e) => setError(errMsg(e)))
  }, [emp])

  function open(s: Supplier | null) {
    setError('')
    setMsg('')
    setEdit(
      s
        ? {
            supplier_id: s.supplier_id,
            name: s.name,
            contact_name: s.contact_name ?? '',
            phone_number: s.phone_number ?? '',
            address: s.address ?? '',
            is_active: s.is_active,
            ingredients: s.ingredients.map((i) => ({ ingredient_id: String(i.ingredient_id), unit_price: String(i.unit_price), lead_time_days: i.lead_time_days == null ? '' : String(i.lead_time_days) })),
          }
        : { ...blank },
    )
  }

  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setEdit((d) => d && { ...d, ingredients: d.ingredients.map((l, j) => (j === i ? { ...l, ...patch } : l)) })

  async function save() {
    if (!edit) return
    setBusy(true)
    setError('')
    try {
      await rpc('upsert_supplier', {
        p_emp: emp,
        p_data: {
          supplier_id: edit.supplier_id,
          name: edit.name,
          contact_name: edit.contact_name,
          phone_number: edit.phone_number,
          address: edit.address,
          is_active: edit.is_active,
          ingredients: edit.ingredients.map((l) => ({
            ingredient_id: Number(l.ingredient_id),
            unit_price: Number(l.unit_price),
            lead_time_days: l.lead_time_days === '' ? null : Number(l.lead_time_days),
          })),
        },
      })
      setMsg(`Saved ${edit.name}`)
      setEdit(null)
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const usedIds = edit?.ingredients.map((l) => l.ingredient_id) ?? []
  const validLines = !!edit && edit.ingredients.every((l) => l.ingredient_id !== '' && l.unit_price !== '' && Number(l.unit_price) >= 0 && (l.lead_time_days === '' || Number(l.lead_time_days) >= 0))
  const shown = rows.filter((s) => showInactive || s.is_active)
  const inactiveCount = rows.filter((s) => !s.is_active).length

  return (
    <Shell>
      <div className="page">
        <div className="page-head">
          <div><h2>Suppliers</h2><p className="sub">Who we buy from and which ingredients each supplier delivers</p></div>
          <div className="toolbar">
            <Link to="/purchasing" className="mini-btn" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Purchase orders</Link>
            <button className="btn" onClick={() => open(null)}>+ New supplier</button>
          </div>
        </div>
        {msg && <p className="notice" role="status">{msg}</p>}
        {error && !edit && <p className="error" role="alert">{error}</p>}
        {inactiveCount > 0 && (
          <label className="split-toggle" style={{ marginBottom: 12, display: 'inline-flex' }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show {inactiveCount} inactive
          </label>
        )}

        <div className="stack">
          {shown.length === 0 && <p className="muted">No suppliers yet.</p>}
          {shown.map((s) => (
            <div className="card sup-card" key={s.supplier_id}>
              <div className="sup-head">
                <div>
                  <h3 className="modal-title">{s.name} {!s.is_active && <span className="badge">Inactive</span>}</h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 14 }}>
                    {[s.contact_name, s.phone_number, s.address].filter(Boolean).join(' · ') || 'No contact details'}
                  </p>
                </div>
                <button className="link-btn" onClick={() => open(s)}>Edit</button>
              </div>
              {s.ingredients.length === 0 ? (
                <p className="muted" style={{ margin: '12px 0 0', fontSize: 14 }}>No ingredients linked yet. Edit this supplier to add what they deliver.</p>
              ) : (
                <table className="tbl sup-tbl">
                  <thead><tr><th>Ingredient</th><th className="num">Price / unit</th><th className="num">Lead time</th></tr></thead>
                  <tbody>
                    {s.ingredients.map((i) => (
                      <tr key={i.supplier_ingredient_id}>
                        <td>{i.ingredient}</td>
                        <td className="num">{money(Number(i.unit_price))} / {i.unit}</td>
                        <td className="num">{i.lead_time_days == null ? '–' : `${i.lead_time_days} day${i.lead_time_days === 1 ? '' : 's'}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>

        {edit && (
          <div className="overlay" role="dialog" aria-modal="true">
            <div className="modal modal-xl">
              <h3 className="modal-title" style={{ marginBottom: 16 }}>{edit.supplier_id ? `Edit ${edit.name || 'supplier'}` : 'New supplier'}</h3>
              <div className="form-grid">
                <label className="field"><span>Supplier name</span><input value={edit.name} maxLength={100} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></label>
                <label className="field"><span>Contact person</span><input value={edit.contact_name} maxLength={100} onChange={(e) => setEdit({ ...edit, contact_name: e.target.value })} /></label>
                <label className="field"><span>Phone</span><input value={edit.phone_number} maxLength={15} inputMode="tel" onChange={(e) => setEdit({ ...edit, phone_number: e.target.value })} /></label>
                <label className="field"><span>Status</span>
                  <select value={edit.is_active ? 'active' : 'inactive'} onChange={(e) => setEdit({ ...edit, is_active: e.target.value === 'active' })}>
                    <option value="active">Active</option><option value="inactive">Inactive (hidden from new purchase orders)</option>
                  </select>
                </label>
                <label className="field full"><span>Address</span><input value={edit.address} maxLength={255} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></label>
              </div>

              <p className="sec-label">Ingredients this supplier delivers</p>
              {edit.ingredients.length === 0 && <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>None yet.</p>}
              {edit.ingredients.map((l, i) => {
                const unit = ings.find((x) => String(x.ingredient_id) === l.ingredient_id)?.unit
                return (
                  <div className="recipe-row sup-line" key={i}>
                    <select className="input-select" aria-label={`Ingredient ${i + 1}`} value={l.ingredient_id} onChange={(e) => setLine(i, { ingredient_id: e.target.value })}>
                      <option value="">Select ingredient…</option>
                      {ings.filter((x) => String(x.ingredient_id) === l.ingredient_id || !usedIds.includes(String(x.ingredient_id))).map((x) => <option key={x.ingredient_id} value={x.ingredient_id}>{x.name}</option>)}
                    </select>
                    <input className="input" inputMode="decimal" placeholder={unit ? `Price per ${unit} (฿)` : 'Price (฿)'} aria-label="Unit price" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} />
                    <input className="input" inputMode="numeric" placeholder="Lead time (days)" aria-label="Lead time in days" value={l.lead_time_days} onChange={(e) => setLine(i, { lead_time_days: e.target.value })} />
                    <button className="link-btn danger" aria-label="Remove ingredient" onClick={() => setEdit({ ...edit, ingredients: edit.ingredients.filter((_, j) => j !== i) })}>✕</button>
                  </div>
                )
              })}
              <button className="link-btn" style={{ paddingLeft: 0 }} onClick={() => setEdit({ ...edit, ingredients: [...edit.ingredients, { ingredient_id: '', unit_price: '', lead_time_days: '' }] })}>+ Add ingredient</button>

              {error && <p className="error" role="alert">{error}</p>}
              <div className="modal-actions">
                <button className="btn btn-dark" style={{ flex: 1 }} onClick={() => setEdit(null)}>Cancel</button>
                <button className="btn" style={{ flex: 1 }} disabled={busy || !edit.name.trim() || !validLines} onClick={save}>{busy ? 'Saving…' : 'Save supplier'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}
