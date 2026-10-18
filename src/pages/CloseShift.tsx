import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { PAYMENT_LABEL, money, type PaymentMethod } from '../lib/pos'
import type { CloseResult, ShiftSummary } from '../lib/types'
import { Shell } from '../components/Shell'
import { useOnline, useQueue } from '../lib/offlineQueue'

/** [S09 ปิดกะ (นับเงินสด)] -> แสดงผลต่าง -> [กลับ S01] */
export default function CloseShift() {
  const { shiftId, setShiftId, logout } = useAuth()
  const nav = useNavigate()
  const [summary, setSummary] = useState<ShiftSummary | null>(null)
  const [counted, setCounted] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CloseResult | null>(null)
  const online = useOnline()
  const queue = useQueue()
  const blocked = !online || queue.length > 0 // ต้องซิงค์บิล offline ให้ครบก่อน ยอดปิดกะจึงจะถูก

  useEffect(() => {
    if (!shiftId) return
    supabase.rpc('get_shift_summary', { p_shift_id: shiftId }).then(({ data, error }) => {
      if (error) setError(error.message)
      else setSummary(data as ShiftSummary)
    })
  }, [shiftId, queue.length]) // โหลดสรุปใหม่เมื่อซิงค์บิลเสร็จ

  const cashSales = Number(summary?.by_method.cash ?? 0)
  const expected = Number(summary?.opening_cash ?? 0) + cashSales
  const countedNum = Number(counted)
  const diff = counted === '' ? null : countedNum - expected

  async function confirm() {
    if (!shiftId) return
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('close_shift', { p_shift_id: shiftId, p_counted_cash: countedNum })
    setBusy(false)
    if (error) setError(error.message)
    else setResult(data as CloseResult)
  }

  if (result) {
    const ok = Number(result.cash_diff) === 0
    return (
      <Shell>
        <div className="center-page">
          <div className="card card-narrow" style={{ textAlign: 'center' }}>
            <h2 className="display" style={{ fontWeight: 400, margin: '0 0 4px' }}>Shift Closed</h2>
            <p className="muted" style={{ fontSize: 14, margin: '0 0 16px' }}>Sales for this shift {money(Number(result.total_sales))}</p>
            <div className="stat-row"><span>Cash that should be in drawer</span><span>{money(Number(result.expected_cash))}</span></div>
            <div className="stat-row"><span>Cash counted</span><span>{money(Number(result.counted_cash))}</span></div>
            <div className={'stat-row ' + (ok ? 'diff-ok' : 'diff-bad')} style={{ fontWeight: 600 }}>
              <span>Difference</span>
              <span>{ok ? 'Match' : (Number(result.cash_diff) > 0 ? '+' : '') + money(Number(result.cash_diff))}</span>
            </div>
            <div className="row" style={{ marginTop: 20 }}>
              <button
                className="btn btn-dark"
                style={{ flex: 1 }}
                onClick={() => {
                  setShiftId(null)
                  nav('/shift', { replace: true })
                }}
              >
                Start New Shift
              </button>
              <button
                className="btn"
                style={{ flex: 1 }}
                onClick={() => {
                  logout()
                  nav('/login', { replace: true })
                }}
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      </Shell>
    )
  }

  if (!shiftId) return <Navigate to="/shift" replace />

  return (
    <Shell>
      <div className="page">
        <h2>Close Shift</h2>
        <p className="sub">Check sales and count cash in the drawer</p>

        {blocked && (
          <p className="notice warn" role="alert">
            {!online ? 'You are offline. Reconnect to close the shift.' : `${queue.length} offline bill(s) are waiting to sync. The shift can be closed once they are synced.`}
          </p>
        )}

        {error && <p className="error" role="alert">{error}</p>}
        {!summary && !error && <p className="muted">Loading shift summary...</p>}

        {summary && (
          <div className="two">
            <div className="card">
              <p className="sec-label">Sales for this shift</p>
              <div className="stat-row"><span>Number of receipts</span><span>{summary.orders}</span></div>
              {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                <div className="stat-row" key={m}>
                  <span>{PAYMENT_LABEL[m]}</span>
                  <span>{money(Number(summary.by_method[m] ?? 0))}</span>
                </div>
              ))}
              <div className="stat-row" style={{ fontWeight: 600 }}>
                <span>Total</span>
                <span>{money(Number(summary.total_sales))}</span>
              </div>
            </div>

            <div className="card">
              <p className="sec-label">Count Cash</p>
              <div className="stat-row"><span>Starting Cash</span><span>{money(Number(summary.opening_cash))}</span></div>
              <div className="stat-row"><span>Cash Sales</span><span>{money(cashSales)}</span></div>
              <div className="stat-row" style={{ fontWeight: 600 }}><span>Cash Expected</span><span>{money(expected)}</span></div>
              <label className="field" style={{ marginTop: 16 }}>
                <span>Cash Counted (Baht)</span>
                <input inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} />
              </label>
              {diff !== null && (
                <p className={diff === 0 ? 'diff-ok' : 'diff-bad'} style={{ margin: '0 0 12px', fontSize: 14 }}>
                  {diff === 0 ? 'Matches expected amount' : `Difference ${diff > 0 ? '+' : ''}${money(diff)}`}
                </p>
              )}
              <button className="btn btn-block" disabled={busy || blocked || counted === '' || !(countedNum >= 0)} onClick={confirm}>
                {busy ? 'Closing the shift...' : 'Confirmed shift closed'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}
