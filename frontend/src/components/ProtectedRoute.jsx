import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Route guard component.
 * Redirects to /login if unauthenticated.
 * Redirects to / if adminOnly is true but user is not an admin.
 */
export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, isAdmin, loading } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />
  }

  return children
}

