import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LangProvider } from './i18n/lang'
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
import Member from './pages/Member'
import Suppliers from './pages/Suppliers'
import PurchaseOrders from './pages/PurchaseOrders'
import { useAutoSync } from './lib/offlineQueue'
import CustomerLayout from './customer/CustomerLayout'
import Home from './customer/Home'
import MenuPage from './customer/MenuPage'
import ProductPage from './customer/ProductPage'
import Rewards from './customer/Rewards'
import Allergens from './customer/Allergens'
import Stores from './customer/Stores'
import SignIn from './customer/SignIn'
import Basket from './customer/Basket'
import MyOrders from './customer/MyOrders'
import OrderStatus from './customer/OrderStatus'
import Preorders from './pages/Preorders'
import { MemberProvider } from './customer/member'
import { BasketProvider } from './customer/basketContext'

/** Automatically sync offline bills on every page */
function SyncRunner() {
  useAutoSync()
  return null
}

export default function App() {
  return (
    <LangProvider>
    <AuthProvider>
      <MemberProvider>
      <BasketProvider>
      <BrowserRouter>
        <SyncRunner />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/shift" element={<RequireRole roles={['cashier']}><OpenShift /></RequireRole>} />
          <Route path="/pos" element={<RequireRole roles={['cashier']}><Pos /></RequireRole>} />
          <Route path="/close-shift" element={<RequireRole roles={['cashier']}><CloseShift /></RequireRole>} />
          <Route path="/orders" element={<RequireRole roles={['cashier']}><Orders /></RequireRole>} />
          <Route path="/preorders" element={<RequireRole roles={['cashier', 'owner']}><Preorders /></RequireRole>} />
          <Route path="/stock" element={<RequireRole roles={['stock', 'owner']}><Stock /></RequireRole>} />
          <Route path="/suppliers" element={<RequireRole roles={['stock', 'owner']}><Suppliers /></RequireRole>} />
          <Route path="/purchasing" element={<RequireRole roles={['stock', 'owner']}><PurchaseOrders /></RequireRole>} />
          <Route path="/dashboard" element={<RequireRole roles={['owner']}><Dashboard /></RequireRole>} />
          <Route path="/products" element={<RequireRole roles={['owner']}><Products /></RequireRole>} />
          <Route path="/employees" element={<RequireRole roles={['owner']}><Employees /></RequireRole>} />
          <Route path="/promotions" element={<RequireRole roles={['owner']}><Promotions /></RequireRole>} />
          <Route path="/reports" element={<RequireRole roles={['owner']}><Reports /></RequireRole>} />
          <Route path="/member" element={<Member />} />
          {/* Customer-facing website (style and features modelled on Pret) */}
          <Route element={<CustomerLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/menu" element={<MenuPage />} />
            <Route path="/menu/:id" element={<ProductPage />} />
            <Route path="/rewards" element={<Rewards />} />
            <Route path="/allergens" element={<Allergens />} />
            <Route path="/stores" element={<Stores />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/basket" element={<Basket />} />
            <Route path="/my-orders" element={<MyOrders />} />
            <Route path="/my-orders/:id" element={<OrderStatus />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
      </BasketProvider>
      </MemberProvider>
    </AuthProvider>
    </LangProvider>
  )
}
