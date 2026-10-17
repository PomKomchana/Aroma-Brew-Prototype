import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { HOME_BY_ROLE } from '../lib/types'

// Delete this in production, it is just for demo purposes
const DEMO = [
  { label: 'Owner', code: '01', pw: 'owner1234' },
  { label: 'Cashier', code: '02', pw: 'cashier1234' },
  { label: 'Stock Clerk', code: '3', pw: 'stock1234' },
]

/** [S01 ระบบล็อคอิน] */
export default function Login() {
  const { employee, login } = useAuth()
  const nav = useNavigate()
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (employee) return <Navigate to={HOME_BY_ROLE[employee.role]} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const id = Number(code)
    if (!Number.isInteger(id) || id <= 0) {
      setError('Please enter a valid employee ID')
      return
    }
    setBusy(true)
    try {
      const emp = await login(id, password)
      nav(HOME_BY_ROLE[emp.role], { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid employee ID or password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-inner">
        <p className="member-back">
          <Link to="/member">Member? Check your points →</Link>
          </p>
        <div className="login-head">
          <p className="login-kicker">Staff Management System</p>
          <h1 className="login-title">Aroma Brew</h1>
        </div>
        <div className="login-card">
          <h2>Log In</h2>
          <form onSubmit={submit}>
            <label className="dark-field">
              <span>Employee ID</span>
              <input inputMode="numeric" autoComplete="username" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
            </label>
            <label className="dark-field">
              <span>Password</span>
              <input type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && (
              <p className="alert-dark" role="alert">
                {error}
              </p>
            )}
            <button className="btn-amber" disabled={busy || !code || !password}>
              {busy ? 'Checking...' : 'Log In'}
            </button>
          </form>
          <div className="demo">
            <p>Demo Accounts:</p>
            {DEMO.map((d) => (
              <button
                key={d.code}
                type="button"
                onClick={() => {
                  setCode(d.code)
                  setPassword(d.pw)
                  setError('')
                }}
              >
                <b>{d.label}</b> — Employee ID {d.code}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
