import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABEL, type Role } from '../lib/types'
import { useOnline, useQueue, useSyncing } from '../lib/offlineQueue'
import SyncPanel from './SyncPanel'
import { useStockAlerts } from '../lib/stockAlerts'

const NAV: Record<Role, { to: string; icon: string; label: string }[]> = {
  cashier: [
    { to: '/pos', icon: '☕', label: 'POS' },
    { to: '/orders', icon: '🧾', label: 'Orders' },
    { to: '/close-shift', icon: '🔓', label: 'Close Shift' },
  ],
  owner: [
    { to: '/dashboard', icon: '📊', label: 'Dashboard' },
    { to: '/products', icon: '🍰', label: 'Products & Recipes' },
    { to: '/stock', icon: '📦', label: 'Inventory' },
    { to: '/purchasing', icon: '📝', label: 'Purchase Orders' },
    { to: '/suppliers', icon: '🚚', label: 'Suppliers' },
    { to: '/promotions', icon: '🏷️', label: 'Promotions' },
    { to: '/employees', icon: '👥', label: 'Employees' },
    { to: '/reports', icon: '📑', label: 'Reports & Audit' },
  ],
  stock: [
    { to: '/stock', icon: '📦', label: 'Inventory' },
    { to: '/purchasing', icon: '📝', label: 'Purchase Orders' },
    { to: '/suppliers', icon: '🚚', label: 'Suppliers' },
  ],
}

/** สถานะออนไลน์/ออฟไลน์ที่มุมจอ + จำนวนบิลที่รอซิงค์ [NFR-04] */
function Connection() {
  const online = useOnline()
  const queue = useQueue()
  const syncing = useSyncing()
  const [open, setOpen] = useState(false)
  const failed = queue.filter((q) => q.status === 'failed').length
  const label = !online ? 'Offline' : syncing ? 'Syncing…' : 'Online'
  return (
    <>
      <div className={online ? 'conn' : 'conn off'} role="status">
        <i /> {label}
        {queue.length > 0 && (
          <button className="conn-pending" onClick={() => setOpen(true)} aria-label="Show offline bills">
            {queue.length} pending{failed > 0 ? ` · ${failed} failed` : ''}
          </button>
        )}
      </div>
      {open && <SyncPanel onClose={() => setOpen(false)} />}
    </>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const { employee, shiftId, logout } = useAuth()
  const nav = useNavigate()
  const alerts = useStockAlerts(employee?.employee_id ?? null, !!employee && employee.role !== 'cashier')
  if (!employee) return null
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-head">
          <p className="side-brand">Aroma Brew</p>
          <p className="side-name">{employee.name}</p>
          <p className="side-role">{ROLE_LABEL[employee.role]}</p>
          {employee.role === 'cashier' && shiftId && (
            <div className="side-shift">
              <span className="dot" /> Shift #{shiftId} is open
            </div>
          )}
        </div>
        <nav className="side-nav">
          {NAV[employee.role].map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
              <span>{n.icon}</span>
              <span className="t">{n.label}</span>
              {n.to === '/stock' && alerts && alerts.count > 0 && (
                <span className="nav-badge" title={`${alerts.count} ingredient(s) low, out of stock or expiring`} aria-label={`${alerts.count} stock alerts`}>{alerts.count}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <Connection />
          <button
            onClick={() => {
              logout()
              nav('/login', { replace: true })
            }}
          >
            ← Logout
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}
