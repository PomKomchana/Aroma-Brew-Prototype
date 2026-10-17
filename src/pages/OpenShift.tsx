import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Shell } from '../components/Shell'

/** [S02 เปิดกะ] */
export default function OpenShift() {
  const { employee, shiftId, openShift } = useAuth()
  const nav = useNavigate()
  const [cash, setCash] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (shiftId) return <Navigate to="/pos" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const amount = Number(cash)
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Please enter a valid amount (0 or more)')
      return
    }
    setBusy(true)
    try {
      await openShift(amount)
      nav('/pos', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open shift')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <div className="center-page">
        <form className="card card-narrow" onSubmit={submit}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div className="avatar">{employee?.name[0]}</div>
            <p style={{ fontWeight: 600, margin: 0 }}>{employee?.name}</p>
            <p className="muted" style={{ fontSize: 13, margin: '2px 0 0' }}>
              Counting cash in the drawer, please enter the starting amount to begin your shift.
            </p>
          </div>
          <label className="field">
            <span>Starting cash (Baht)</span>
            <input inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} autoFocus />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-block" disabled={busy || cash === ''}>
            {busy ? 'Opening shift...' : 'Opening shift, starting sales'}
          </button>
        </form>
      </div>
    </Shell>
  )
}
