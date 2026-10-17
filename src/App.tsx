import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireRole } from './auth/RequireRole'
import Login from './pages/Login'
import OpenShift from './pages/OpenShift'
import Pos from './pages/Pos'
import CloseShift from './pages/CloseShift'
import Placeholder from './pages/Placeholder'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/shift" element={<RequireRole roles={['cashier']}><OpenShift /></RequireRole>} />
          <Route path="/pos" element={<RequireRole roles={['cashier']}><Pos /></RequireRole>} />
          <Route path="/close-shift" element={<RequireRole roles={['cashier']}><CloseShift /></RequireRole>} />
          <Route
            path="/stock"
            element={<RequireRole roles={['stock', 'owner']}><Placeholder title="Inventory" note="Done on the 3rd day (S10–S12)" /></RequireRole>}
          />
          <Route
            path="/dashboard"
            element={<RequireRole roles={['owner']}><Placeholder title="Reports" note="Done on the 3rd day (S13–S17)" /></RequireRole>}
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
