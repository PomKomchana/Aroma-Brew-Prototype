import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { HOME_BY_ROLE, type Role } from '../lib/types'

/** กั้นหน้าตามบทบาท (Permission Matrix ฝั่งหน้าจอ) */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { employee } = useAuth()
  if (!employee) return <Navigate to="/login" replace />
  if (!roles.includes(employee.role)) return <Navigate to={HOME_BY_ROLE[employee.role]} replace />
  return <>{children}</>
}
