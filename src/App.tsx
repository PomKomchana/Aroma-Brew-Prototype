import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireRole } from './auth/RequireRole'
import Login from './pages/Login'
import OpenShift from './pages/OpenShift'
import Pos from './pages/Pos'
import CloseShift from './pages/CloseShift'
import Orders from './pages/Orders'
import Stock from './pages/Stock'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Employees from './pages/Employees'
import Promotions from './pages/Promotions'
import Reports from './pages/Reports'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/shift" element={<RequireRole roles={['cashier']}><OpenShift /></RequireRole>} />
          <Route path="/pos" element={<RequireRole roles={['cashier']}><Pos /></RequireRole>} />
          <Route path="/close-shift" element={<RequireRole roles={['cashier']}><CloseShift /></RequireRole>} />
          <Route path="/orders" element={<RequireRole roles={['cashier']}><Orders /></RequireRole>} />
          <Route path="/stock" element={<RequireRole roles={['stock', 'owner']}><Stock /></RequireRole>} />
          <Route path="/dashboard" element={<RequireRole roles={['owner']}><Dashboard /></RequireRole>} />
          <Route path="/products" element={<RequireRole roles={['owner']}><Products /></RequireRole>} />
          <Route path="/employees" element={<RequireRole roles={['owner']}><Employees /></RequireRole>} />
          <Route path="/promotions" element={<RequireRole roles={['owner']}><Promotions /></RequireRole>} />
          <Route path="/reports" element={<RequireRole roles={['owner']}><Reports /></RequireRole>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
