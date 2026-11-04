import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMember } from './member'
import { errMsg, fmtDateTime, rpc } from '../lib/api'
import { POINT_RATE, money } from '../lib/pos'

interface Summary {
  name: string
  tier: string
  points: number
  masked_phone: string
  history: { order_id: number; order_date: string; total_price: number; status: 'paid' | 'cancelled'; points: number; items: string | null }[]
}
type Step = 'phone' | 'otp' | 'summary'

/* Pret-style sign-in: phone number → OTP → rewards. Non-members register at the cashier. Staff are redirected to staff login. */
/* Reuse existing /member RPCs: request_otp, verify_otp, get_member_summary, member_logout. */
export default function SignIn() {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [demoCode, setDemoCode] = useState('')
  const { token, setToken, clear } = useMember()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const next = sp.get('next')
  const goNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null
  const [data, setData] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const [notMember, setNotMember] = useState(false)
  const [busy, setBusy] = useState(false)

  // already signed in on this tab: go straight to the account (or back to where they came from)
  useEffect(() => {
    if (!token) return
    if (goNext) { nav(goNext, { replace: true }); return }
    let on = true
    rpc<Summary>('get_member_summary', { p_token: token })
      .then((r) => { if (on) { setData(r); setStep('summary') } })
      .catch(() => { if (on) clear() })
    return () => { on = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(''); setNotMember(false)
    try {
      await fn()
    } catch (e) {
      const m = errMsg(e)
      if (/not registered/i.test(m)) setNotMember(true)
      else setError(m)
    } finally {
      setBusy(false)
    }
  }

  const requestOtp = () => run(async () => {
    const r = await rpc<{ demo_code: string }>('request_otp', { p_phone: phone })
    setDemoCode(r.demo_code); setCode(''); setStep('otp')
  })

  const verify = () => run(async () => {
    const t = await rpc<string | null>('verify_otp', { p_phone: phone, p_code: code })
    if (!t) throw new Error('Incorrect code, please try again')
    setToken(t)
    if (goNext) { nav(goNext, { replace: true }); return }
    setData(await rpc<Summary>('get_member_summary', { p_token: t }))
    setStep('summary')
  })

  async function signOut() {
    if (token) await rpc('member_logout', { p_token: token }).catch(() => {})
    clear(); setData(null); setPhone(''); setCode(''); setDemoCode(''); setError(''); setNotMember(false); setStep('phone')
  }

  return (
    <div className="cs-auth">
      {step === 'phone' && (
        <>
          <Link className="cs-auth-back" to="/">‹ Back</Link>
          <h1 className="cs-auth-h">Welcome back.</h1>
          <form onSubmit={(e) => { e.preventDefault(); requestOtp() }}>
            <label className="cs-auth-label" htmlFor="cs-phone">Enter your phone number</label>
            <input id="cs-phone" className="cs-auth-input" type="tel" inputMode="numeric" maxLength={10} autoFocus placeholder="0812345678"
              value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
            {notMember && (
              <div className="cs-auth-alert" role="alert">
                <b>We could not find this number.</b> Please ask the cashier at the counter to create your member account, then come back and sign in.
              </div>
            )}
            {error && <p className="error" role="alert">{error}</p>}
            <button className="cs-auth-btn" disabled={busy || phone.length !== 10}>{busy ? 'Sending…' : 'Continue'}</button>
          </form>
          <p className="cs-auth-help">Don’t have an account yet? Ask the cashier when you order. They will set you up in a moment, and you will earn 1 point for every ฿{POINT_RATE}.</p>
          <div className="cs-auth-staff">
            <p>Are you a team member?</p>
            <Link className="cs-auth-btn ghost" to="/login">Staff log in →</Link>
          </div>
        </>
      )}

      {step === 'otp' && (
        <>
          <button type="button" className="cs-auth-back" onClick={() => { setStep('phone'); setError('') }}>‹ Back</button>
          <h1 className="cs-auth-h">Enter the code.</h1>
          <p className="cs-auth-help" style={{ marginTop: 0 }}>Sent to {phone.slice(0, 2)}x-xxx-{phone.slice(-4)} · valid for 5 minutes</p>
          <form onSubmit={(e) => { e.preventDefault(); verify() }}>
            {/* DEMO ONLY: ของจริงต้องส่ง SMS/LINE และลบกล่องนี้ */}
            <p className="cs-auth-demo">Demo code: <b>{demoCode}</b></p>
            <label className="cs-auth-label" htmlFor="cs-code">6-digit code</label>
            <input id="cs-code" className="cs-auth-input" inputMode="numeric" maxLength={6} autoFocus autoComplete="one-time-code"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            {error && <p className="error" role="alert">{error}</p>}
            <button className="cs-auth-btn" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Sign in'}</button>
          </form>
          <button type="button" className="cs-auth-link" disabled={busy} onClick={requestOtp}>Resend code</button>
        </>
      )}

      {step === 'summary' && data && (
        <>
          <p className="cs-auth-help" style={{ margin: 0 }}>{data.masked_phone}</p>
          <h1 className="cs-auth-h" style={{ marginBottom: 20 }}>Hi, {data.name}.</h1>
          <div className="pts-box">
            <span>Your points</span>
            <b>{data.points.toLocaleString()}</b>
            <small>{data.tier} member · {`฿${POINT_RATE}`} = 1 point</small>
          </div>
          <p className="cs-auth-label" style={{ margin: '28px 0 4px' }}>Recent purchases</p>
          {data.history.length === 0 && <p className="cs-auth-help" style={{ marginTop: 8 }}>No purchases yet</p>}
          {data.history.map((h) => (
            <div className={h.status === 'cancelled' ? 'cs-hist cancelled' : 'cs-hist'} key={h.order_id}>
              <div>
                <b>{h.items ?? `Bill #${h.order_id}`}</b>
                <small>{fmtDateTime(h.order_date)}{h.status === 'cancelled' ? ' · cancelled' : ''}</small>
              </div>
              <div style={{ textAlign: 'right' }}>
                <b>{money(Number(h.total_price))}</b>
                <small>{h.points !== 0 ? `${h.points > 0 ? '+' : ''}${h.points} pts` : ''}</small>
              </div>
            </div>
          ))}
          <Link className="cs-auth-btn" style={{ marginTop: 24, width: '100%' }} to="/my-orders">My pre-orders</Link>
          <button type="button" className="cs-auth-btn ghost" style={{ marginTop: 12, width: '100%' }} onClick={signOut}>Sign out</button>
        </>
      )}
    </div>
  )
}
