import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import StudentView from './pages/StudentView'
import AdminView from './pages/AdminView'

export default function App() {
  const { user, isAdmin, loading } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* Student dashboard */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            {isAdmin ? <Navigate to="/admin" replace /> : <StudentView />}
          </ProtectedRoute>
        }
      />

      {/* Admin dashboard */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute adminOnly>
            <AdminView />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

