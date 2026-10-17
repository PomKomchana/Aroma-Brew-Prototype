import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABEL, type Role } from '../lib/types'

const NAV: Record<Role, { to: string; icon: string; label: string }[]> = {
  cashier: [
    { to: '/pos', icon: '☕', label: '[POS] Point of Sale' },
    { to: '/close-shift', icon: '🔓', label: 'Close Shift' },
  ],
  owner: [
    { to: '/dashboard', icon: '📊', label: 'Reports' },
    { to: '/stock', icon: '📦', label: 'Inventory' },
  ],
  stock: [{ to: '/stock', icon: '📦', label: 'Inventory' }],
}

/** สถานะออนไลน์/ออฟไลน์ที่มุมจอ (NFR-04) */
function Connection() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return (
    <div className={online ? 'conn' : 'conn off'} role="status">
      <i /> {online ? 'Online' : 'Offline'}
    </div>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const { employee, shiftId, logout } = useAuth()
  const nav = useNavigate()
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
