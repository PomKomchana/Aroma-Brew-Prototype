import { useState } from 'react'
import { discardOrder, localLabel, retryFailed, syncQueue, useOnline, useQueue, useSyncing, type SyncReport } from '../lib/offlineQueue'
import { money } from '../lib/pos'

/** รายการบิลที่ขายตอนออฟไลน์และยังไม่ซิงค์ [NFR-04] */
export default function SyncPanel({ onClose }: { onClose: () => void }) {
  const queue = useQueue()
  const online = useOnline()
  const syncing = useSyncing()
  const [report, setReport] = useState<SyncReport | null>(null)

  async function run() {
    retryFailed()
    setReport(await syncQueue())
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" style={{ position: 'fixed' }}>
      <div className="modal modal-wide">
        <h3 className="modal-title" style={{ marginBottom: 4 }}>Offline bills</h3>
        <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
          {online ? 'Connected. Bills sync automatically every 30 seconds.' : 'No connection. Bills are saved on this device and will sync when you are back online.'}
        </p>
        {report && (
          <p className={report.failed || report.stopped ? 'notice warn' : 'notice'} role="status">
            Synced {report.synced}{report.failed ? ` · ${report.failed} failed` : ''}{report.stopped ? ' · connection lost, will retry' : ''}
            {report.notes.map((n) => <span key={n} style={{ display: 'block' }}>{n}</span>)}
          </p>
        )}
        {queue.length === 0 && <p className="muted">Nothing waiting to sync.</p>}
        {queue.map((q) => (
          <div className="rank" key={q.clientId} style={{ alignItems: 'center' }}>
            <span>
              <b>{localLabel(q.localNo)}</b> · {new Date(q.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {q.items.reduce((s, i) => s + i.quantity, 0)} items
              {q.status === 'failed' && <small style={{ display: 'block', color: 'var(--danger)' }}>{q.error}</small>}
            </span>
            <span>
              {money(q.total)}{' '}
              {q.status === 'failed' && (
                <button className="link-btn danger" onClick={() => window.confirm(`Discard ${localLabel(q.localNo)}? This sale will NOT be recorded.`) && discardOrder(q.clientId)}>Discard</button>
              )}
            </span>
          </div>
        ))}
        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-dark" style={{ flex: 1 }} onClick={onClose}>Close</button>
          <button className="btn" style={{ flex: 1 }} disabled={!online || syncing || queue.length === 0} onClick={run}>{syncing ? 'Syncing…' : 'Sync now'}</button>
        </div>
      </div>
    </div>
  )
}
