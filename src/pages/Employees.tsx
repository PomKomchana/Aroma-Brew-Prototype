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
  const [del, setDel] = useState<EmployeeRow | null>(null)
  const [notice, setNotice] = useState('')

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

  async function remove() {
    if (!del) return
    setBusy(true)
    setError('')
    try {
      const result = await rpc<'deleted' | 'archived'>('delete_employee', { p_emp: emp, p_target: del.employee_id })
      setNotice(
        result === 'deleted'
          ? `${del.name}'s account was deleted.`
          : `${del.name}'s account was deleted. Past bills and stock records are kept under their name so reports stay accurate.`,
      )
      setDel(null)
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
          <div><h2>Employees</h2><p className="sub">Accounts and roles. Deactivate to block login temporarily; delete to remove a cashier or stock account.</p></div>
          <button className="btn" onClick={() => { setError(''); setEdit({ employee_id: null, name: '', role: 'cashier', status: 'active', password: '' }) }}>+ New employee</button>
        </div>
        {notice && <p className="notice" role="status">{notice}</p>}
        {error && !edit && !del && <p className="error" role="alert">{error}</p>}
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employee_id}>
                  <td>{r.employee_id}</td><td>{r.name}</td><td>{r.role}</td>
                  <td><span className={r.status === 'active' ? 'badge ok' : 'badge'}>{r.status}</span></td>
                  <td>
                    <button className="link-btn" onClick={() => { setError(''); setNotice(''); setEdit({ ...r, password: '' }) }}>Edit</button>
                    {r.role !== 'owner' && r.employee_id !== emp && (
                      <button className="link-btn danger" onClick={() => { setError(''); setNotice(''); setDel(r) }}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {del && (
          <div className="overlay" role="dialog" aria-modal="true">
            <div className="modal">
              <h3 className="modal-title" style={{ marginBottom: 8 }}>Delete {del.name}?</h3>
              <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
                {del.role === 'cashier' ? 'Cashier' : 'Stock'} account #{del.employee_id} will no longer be able to log in, and it disappears from this list.
                If this person already has bills or stock records, those are kept (under their name) so reports and the audit log stay correct.
                This is recorded in the audit log and cannot be undone.
              </p>
              {error && <p className="error" role="alert">{error}</p>}
              <div className="modal-actions">
                <button className="btn btn-dark" style={{ flex: 1 }} onClick={() => setDel(null)}>Keep account</button>
                <button className="btn" style={{ flex: 1, background: 'var(--danger)' }} disabled={busy} onClick={remove}>{busy ? 'Deleting…' : 'Delete account'}</button>
              </div>
            </div>
          </div>
        )}
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
