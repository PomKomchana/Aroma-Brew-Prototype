import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Shell } from '../components/Shell'
import { errMsg, rpc } from '../lib/api'
import type { EmployeeRow, Role } from '../lib/types'

const ROLES: Role[] = ['owner', 'cashier', 'stock']
type Draft = { employee_id: number | null; name: string; role: Role; status: 'active' | 'inactive'; password: string }

/** [S15 พนักงาน] */
export default function Employees() {
  const { employee } = useAuth()
  const emp = employee!.employee_id
  const [rows, setRows] = useState<EmployeeRow[]>([])
  const [edit, setEdit] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    rpc<EmployeeRow[]>('list_employees', { p_emp: emp }).then(setRows).catch((e) => setError(errMsg(e)))
  }, [emp])
  useEffect(load, [load])

  async function save() {
    if (!edit) return
    setBusy(true)
    setError('')
    try {
      await rpc('upsert_employee', { p_emp: emp, p_data: edit })
      setEdit(null)
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <div className="page">
        <div className="page-head">
          <div><h2>Employees</h2><p className="sub">Accounts and roles (accounts are deactivated, never deleted)</p></div>
          <button className="btn" onClick={() => { setError(''); setEdit({ employee_id: null, name: '', role: 'cashier', status: 'active', password: '' }) }}>+ New employee</button>
        </div>
        {error && !edit && <p className="error" role="alert">{error}</p>}
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employee_id}>
                  <td>{r.employee_id}</td><td>{r.name}</td><td>{r.role}</td>
                  <td><span className={r.status === 'active' ? 'badge ok' : 'badge'}>{r.status}</span></td>
                  <td><button className="link-btn" onClick={() => { setError(''); setEdit({ ...r, password: '' }) }}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {edit && (
          <div className="overlay" role="dialog" aria-modal="true">
            <div className="modal">
              <h3 className="modal-title" style={{ marginBottom: 16 }}>{edit.employee_id ? `Edit employee #${edit.employee_id}` : 'New employee'}</h3>
              <label className="field"><span>Name</span><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
              <label className="field"><span>Role</span><select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
              <label className="field"><span>Status</span><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as 'active' | 'inactive' })}><option>active</option><option>inactive</option></select></label>
              <label className="field"><span>{edit.employee_id ? 'New password (leave blank to keep)' : 'Password'}</span><input type="password" autoComplete="new-password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /><p className="hint">At least 6 characters. Stored as a bcrypt hash.</p></label>
              {error && <p className="error" role="alert">{error}</p>}
              <div className="modal-actions">
                <button className="btn btn-dark" style={{ flex: 1 }} onClick={() => setEdit(null)}>Cancel</button>
                <button className="btn" style={{ flex: 1 }} disabled={busy || !edit.name.trim() || (!edit.employee_id && edit.password.length < 6)} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}
