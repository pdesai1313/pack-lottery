import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Shifts from './pages/Shifts'
import LiveScan from './pages/LiveScan'
import CommitShift from './pages/CommitShift'
import DailySummary from './pages/DailySummary'
import Exceptions from './pages/Exceptions'
import PackManagement from './pages/PackManagement'
import Settings from './pages/Settings'
import Reports from './pages/Reports'
import Users from './pages/Users'
import Grocery from './pages/Grocery'
import AuditLog from './pages/AuditLog'
import Dashboard from './pages/Dashboard'

function AuthRedirect() {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  return user ? <Navigate to="/shifts" replace /> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<AuthRedirect />} />

      <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
      <Route path="/shifts" element={<ProtectedRoute><Layout><Shifts /></Layout></ProtectedRoute>} />
      <Route path="/shifts/:id/scan" element={<ProtectedRoute><Layout><LiveScan /></Layout></ProtectedRoute>} />
      <Route path="/shifts/:id/commit" element={<ProtectedRoute roles={['ADMIN','REVIEWER']}><Layout><CommitShift /></Layout></ProtectedRoute>} />
      <Route path="/shifts/:id/exceptions" element={<ProtectedRoute roles={['ADMIN','REVIEWER']}><Layout><Exceptions /></Layout></ProtectedRoute>} />
      <Route path="/daily" element={<ProtectedRoute><Layout><DailySummary /></Layout></ProtectedRoute>} />
      <Route path="/packs" element={<ProtectedRoute roles={['ADMIN']}><Layout><PackManagement /></Layout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute roles={['ADMIN']}><Layout><Settings /></Layout></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute roles={['ADMIN','REVIEWER']}><Layout><Reports /></Layout></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute roles={['ADMIN']}><Layout><Users /></Layout></ProtectedRoute>} />
      <Route path="/grocery" element={<ProtectedRoute roles={['ADMIN','REVIEWER','OPERATOR']}><Layout><Grocery /></Layout></ProtectedRoute>} />
      <Route path="/audit" element={<ProtectedRoute roles={['ADMIN']}><Layout><AuditLog /></Layout></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
