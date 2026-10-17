import { useState } from 'react'
import { Link } from 'react-router-dom'
import { errMsg, fmtDateTime, rpc } from '../lib/api'
import { money } from '../lib/pos'

interface Summary {
  name: string
  tier: string
  points: number
  masked_phone: string
  history: { order_id: number; order_date: string; total_price: number; status: 'paid' | 'cancelled'; points: number; items: string | null }[]
}

type Step = 'phone' | 'otp' | 'summary'

/** [S18 เว็บตรวจแต้ม] เบอร์โทร + OTP -> แต้มและประวัติการซื้อ (อ่านอย่างเดียว) */
export default function Member() {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [demoCode, setDemoCode] = useState('')
  const [token, setToken] = useState('')
  const [data, setData] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const requestOtp = () =>
    run(async () => {
      const r = await rpc<{ demo_code: string }>('request_otp', { p_phone: phone })
      setDemoCode(r.demo_code)
      setCode('')
      setStep('otp')
    })

  const verify = () =>
    run(async () => {
      const t = await rpc<string | null>('verify_otp', { p_phone: phone, p_code: code })
      if (!t) throw new Error('Incorrect code, please try again')
      setToken(t)
      setData(await rpc<Summary>('get_member_summary', { p_token: t }))
      setStep('summary')
    })

  async function logout() {
    if (token) await rpc('member_logout', { p_token: token }).catch(() => {})
    setToken(''); setData(null); setPhone(''); setCode(''); setDemoCode(''); setError(''); setStep('phone')
  }

  return (
    <div className="login-wrap">
      <div className="login-inner" style={{ maxWidth: step === 'summary' ? 480 : 384 }}>
        <div className="login-head">
          <p className="login-kicker">Member Portal</p>
          <h1 className="login-title">Aroma Brew</h1>
        </div>

        <div className="login-card">
          {step === 'phone' && (
            <form onSubmit={(e) => { e.preventDefault(); requestOtp() }}>
              <h2>Check your points</h2>
              <label className="dark-field">
                <span>Phone number</span>
                <input type="tel" inputMode="numeric" maxLength={10} autoFocus placeholder="0812345678" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
              </label>
              {error && <p className="alert-dark" role="alert">{error}</p>}
              <button className="btn-amber" disabled={busy || phone.length !== 10}>{busy ? 'Sending…' : 'Send code'}</button>
              <p className="member-note">We verify your phone number with a 6-digit code before showing any data.</p>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={(e) => { e.preventDefault(); verify() }}>
              <h2>Enter the code</h2>
              <p className="member-note" style={{ marginTop: -12 }}>Sent to {phone.slice(0, 2)}x-xxx-{phone.slice(-4)} · valid for 5 minutes</p>
              {/* DEMO ONLY: ของจริงต้องส่ง SMS/LINE และลบกล่องนี้ */}
              <p className="demo-otp">Demo code: <b>{demoCode}</b></p>
              <label className="dark-field">
                <span>6-digit code</span>
                <input inputMode="numeric" maxLength={6} autoFocus autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              </label>
              {error && <p className="alert-dark" role="alert">{error}</p>}
              <button className="btn-amber" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Verify'}</button>
              <button type="button" className="member-link" disabled={busy} onClick={requestOtp}>Resend code</button>
              <button type="button" className="member-link" onClick={() => { setStep('phone'); setError('') }}>Use a different number</button>
            </form>
          )}

          {step === 'summary' && data && (
            <>
              <p className="member-note" style={{ margin: 0 }}>{data.masked_phone}</p>
              <h2 style={{ margin: '2px 0 16px' }}>{data.name}</h2>
              <div className="pts-box">
                <span>Your points</span>
                <b>{data.points.toLocaleString()}</b>
                <small>{data.tier} member · 50 Baht = 1 point</small>
              </div>
              <p className="member-note" style={{ margin: '20px 0 8px' }}>RECENT PURCHASES</p>
              {data.history.length === 0 && <p className="member-note">No purchases yet</p>}
              {data.history.map((h) => (
                <div className={h.status === 'cancelled' ? 'hist cancelled-h' : 'hist'} key={h.order_id}>
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
              <button className="member-link" style={{ marginTop: 16 }} onClick={logout}>Log out</button>
            </>
          )}
        </div>
        {step !== 'summary' && <p className="member-back"><Link to="/login">← Staff log in</Link></p>}
      </div>
    </div>
  )
}
