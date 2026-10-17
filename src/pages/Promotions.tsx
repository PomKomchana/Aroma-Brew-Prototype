import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Shell } from '../components/Shell'
import { errMsg, rpc, todayStr } from '../lib/api'
import { money } from '../lib/pos'
import type { Promotion } from '../lib/types'

type Row = Promotion & { condition: string | null }
type Draft = { promotion_id: number | null; name: string; discount_type: 'percent' | 'fixed'; value: string; condition: string; start_date: string; end_date: string; status: string }

/** [S16 โปรโมชัน] ระบบเลือกส่วนลดที่ดีที่สุดให้อัตโนมัติที่ POS */
export default function Promotions() {
  const { employee } = useAuth()
  const emp = employee!.employee_id
  const [rows, setRows] = useState<Row[]>([])
  const [edit, setEdit] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    rpc<Row[]>('list_promotions', { p_emp: emp }).then(setRows).catch((e) => setError(errMsg(e)))
  }, [emp])
  useEffect(load, [load])

  async function save() {
    if (!edit) return
    setBusy(true)
    setError('')
    try {
      await rpc('upsert_promotion', { p_emp: emp, p_data: { ...edit, value: Number(edit.value) } })
      setEdit(null)
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const today = todayStr()
  const state = (r: Row) => (r.status !== 'active' ? ['Inactive', 'badge'] : today < r.start_date ? ['Scheduled', 'badge warn'] : today > r.end_date ? ['Expired', 'badge'] : ['Running', 'badge ok'])

  return (
    <Shell>
      <div className="page">
        <div className="page-head">
          <div><h2>Promotions</h2><p className="sub">The POS automatically applies the best active discount</p></div>
          <button className="btn" onClick={() => { setError(''); setEdit({ promotion_id: null, name: '', discount_type: 'percent', value: '', condition: '', start_date: today, end_date: todayStr(30), status: 'active' }) }}>+ New promotion</button>
        </div>
        {error && !edit && <p className="error" role="alert">{error}</p>}
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Discount</th><th>Period</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="tbl-empty">No promotions</td></tr>}
              {rows.map((r) => {
                const [label, cls] = state(r)
                return (
                  <tr key={r.promotion_id}>
                    <td>{r.name}</td>
                    <td>{r.discount_type === 'percent' ? `${Number(r.value)}%` : money(Number(r.value))}</td>
                    <td>{r.start_date} → {r.end_date}</td>
                    <td><span className={cls}>{label}</span></td>
                    <td><button className="link-btn" onClick={() => { setError(''); setEdit({ promotion_id: r.promotion_id, name: r.name, discount_type: r.discount_type, value: String(r.value), condition: r.condition ?? '', start_date: r.start_date, end_date: r.end_date, status: r.status }) }}>Edit</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {edit && (
          <div className="overlay" role="dialog" aria-modal="true">
            <div className="modal">
              <h3 className="modal-title" style={{ marginBottom: 16 }}>{edit.promotion_id ? 'Edit promotion' : 'New promotion'}</h3>
              <label className="field"><span>Name</span><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
              <div className="form-grid">
                <label className="field"><span>Type</span><select value={edit.discount_type} onChange={(e) => setEdit({ ...edit, discount_type: e.target.value as 'percent' | 'fixed' })}><option value="percent">Percent (%)</option><option value="fixed">Fixed (Baht)</option></select></label>
                <label className="field"><span>Value</span><input inputMode="decimal" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} /></label>
                <label className="field"><span>Start</span><input type="date" value={edit.start_date} onChange={(e) => setEdit({ ...edit, start_date: e.target.value })} /></label>
                <label className="field"><span>End</span><input type="date" value={edit.end_date} onChange={(e) => setEdit({ ...edit, end_date: e.target.value })} /></label>
                <label className="field full"><span>Status</span><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option>active</option><option>inactive</option></select></label>
              </div>
              {error && <p className="error" role="alert">{error}</p>}
              <div className="modal-actions">
                <button className="btn btn-dark" style={{ flex: 1 }} onClick={() => setEdit(null)}>Cancel</button>
                <button className="btn" style={{ flex: 1 }} disabled={busy || !edit.name.trim() || !(Number(edit.value) > 0) || edit.end_date < edit.start_date} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}
