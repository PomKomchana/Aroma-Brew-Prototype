import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABEL, type Role } from '../lib/types'
import { useOnline, useQueue, useSyncing } from '../lib/offlineQueue'
import { Icon, type IconName } from './Icon'
import { LangSwitch } from '../i18n/lang'
import SyncPanel from './SyncPanel'
import { useStockAlerts } from '../lib/stockAlerts'
import { usePreorderCounts } from '../lib/preorders'

const NAV: Record<Role, { to: string; icon: IconName; label: string }[]> = {
  cashier: [
    { to: '/pos', icon: 'pos', label: 'POS' },
    { to: '/preorders', icon: 'preorders', label: 'Pre-orders' },
    { to: '/orders', icon: 'orders', label: 'Orders' },
    { to: '/close-shift', icon: 'close', label: 'Close Shift' },
  ],
  owner: [
    { to: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { to: '/preorders', icon: 'preorders', label: 'Pre-orders' },
    { to: '/products', icon: 'products', label: 'Products & Recipes' },
    { to: '/stock', icon: 'stock', label: 'Inventory' },
    { to: '/purchasing', icon: 'purchasing', label: 'Purchase Orders' },
    { to: '/suppliers', icon: 'suppliers', label: 'Suppliers' },
    { to: '/promotions', icon: 'promotions', label: 'Promotions' },
    { to: '/employees', icon: 'employees', label: 'Employees' },
    { to: '/reports', icon: 'reports', label: 'Reports & Audit' },
  ],
  stock: [
    { to: '/stock', icon: 'stock', label: 'Inventory' },
    { to: '/purchasing', icon: 'purchasing', label: 'Purchase Orders' },
    { to: '/suppliers', icon: 'suppliers', label: 'Suppliers' },
  ],
}

/** Online/offline indicator in the sidebar, plus the number of bills waiting to sync [NFR-04] */
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
  const pre = usePreorderCounts(employee?.employee_id ?? null, !!employee && employee.role !== 'stock')
  if (!employee) return null
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-head">
          <p className="side-brand">Aroma <span>Brew</span></p>
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
              <Icon name={n.icon} />
              <span className="t">{n.label}</span>
              {n.to === '/preorders' && pre && pre.placed > 0 && (
                <span className="nav-badge" title={`${pre.placed} new pre-order(s)`} aria-label={`${pre.placed} new pre-orders`}>{pre.placed}</span>
              )}
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
            <Icon name="logout" size={16} /> Logout
          </button>
        </div>
      </aside>
      <main className="main">
        <LangSwitch tone="light" className="lang-float" />
        {children}
      </main>
    </div>
  )
}
