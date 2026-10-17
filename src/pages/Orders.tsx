import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Shell } from '../components/Shell'
import OrdersTable from '../components/OrdersTable'
import { errMsg, rpc } from '../lib/api'
import type { OrderRow } from '../lib/types'

/** [S08 คิวออเดอร์] บิลของกะที่เปิดอยู่ ยกเลิกได้เฉพาะกะนี้ */
export default function Orders() {
  const { employee, shiftId } = useAuth()
  const [rows, setRows] = useState<OrderRow[]>([])
  const [error, setError] = useState('')

  const load = useCallback(() => {
    if (!shiftId) return
    rpc<OrderRow[]>('get_orders', { p_emp: employee!.employee_id, p_from: null, p_to: null, p_shift: shiftId })
      .then(setRows)
      .catch((e) => setError(errMsg(e)))
  }, [employee, shiftId])
  useEffect(load, [load])

  if (!shiftId) return <Navigate to="/shift" replace />
  return (
    <Shell>
      <div className="page">
        <div className="page-head">
          <div><h2>Orders</h2><p className="sub">Bills for this shift · after closing, only the owner can cancel a bill</p></div>
          <button className="btn btn-dark" onClick={load}>Refresh</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <OrdersTable rows={rows} emp={employee!.employee_id} canCancel={() => true} onChanged={load} />
      </div>
    </Shell>
  )
}
