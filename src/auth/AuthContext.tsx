import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Employee } from '../lib/types'

interface AuthState {
  employee: Employee | null
  shiftId: number | null
  login: (employeeId: number, password: string) => Promise<Employee>
  logout: () => void
  openShift: (openingCash: number) => Promise<void>
  setShiftId: (id: number | null) => void
}

const KEY = 'aroma-brew-session'
const Ctx = createContext<AuthState | null>(null)

function load(): { employee: Employee | null; shiftId: number | null } {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { employee: null, shiftId: null }
}

function save(employee: Employee | null, shiftId: number | null) {
  try {
    if (employee) sessionStorage.setItem(KEY, JSON.stringify({ employee, shiftId }))
    else sessionStorage.removeItem(KEY)
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initial = load()
  const [employee, setEmployee] = useState<Employee | null>(initial.employee)
  const [shiftId, setShift] = useState<number | null>(initial.shiftId)

  const setShiftId = useCallback(
    (id: number | null) => {
      setShift(id)
      save(employee, id)
    },
    [employee],
  )

  const login = useCallback(async (employeeId: number, password: string) => {
    const { data, error } = await supabase.rpc('login', {
      p_employee_id: employeeId,
      p_password: password,
    })
    if (error) throw new Error('Failed to connect to database: ' + error.message)
    if (!data) throw new Error('Invalid employee ID or password')

    const emp = data as Employee
    let openShift: number | null = null
    if (emp.role === 'cashier') {
      const res = await supabase.rpc('get_open_shift', { p_employee_id: emp.employee_id })
      if (res.error) throw new Error(res.error.message)
      openShift = (res.data as number | null) ?? null
    }
    setEmployee(emp)
    setShift(openShift)
    save(emp, openShift)
    return emp
  }, [])

  const logout = useCallback(() => {
    setEmployee(null)
    setShift(null)
    save(null, null)
  }, [])

  const openShift = useCallback(
    async (openingCash: number) => {
      if (!employee) throw new Error('You are not signed in')
      const { data, error } = await supabase.rpc('open_shift', {
        p_employee_id: employee.employee_id,
        p_opening_cash: openingCash,
      })
      if (error) throw new Error(error.message)
      setShift(data as number)
      save(employee, data as number)
    },
    [employee],
  )

  return (
    <Ctx.Provider value={{ employee, shiftId, login, logout, openShift, setShiftId }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used within an AuthProvider')
  return v
}
