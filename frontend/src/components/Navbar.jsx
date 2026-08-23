import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { HiOutlinePrinter } from 'react-icons/hi2'
import { FiLogOut } from 'react-icons/fi'
import toast from 'react-hot-toast'

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout()
      toast.success('Signed out successfully')
      navigate('/login')
    } catch {
      toast.error('Failed to sign out')
    }
  }

  return (
    <nav className="navbar">
      <Link to={isAdmin ? '/admin' : '/'} className="navbar-brand">
        <div className="brand-icon">
          <HiOutlinePrinter />
        </div>
        Campus Print
      </Link>

      {user && (
        <div className="navbar-right">
          <div className="navbar-user">
            {user.photoURL && (
              <img
                src={user.photoURL}
                alt={user.displayName}
                className="navbar-avatar"
                referrerPolicy="no-referrer"
              />
            )}
            <div>
              <div className="navbar-name">{user.displayName}</div>
              <div className="navbar-role">{isAdmin ? 'Admin' : 'Student'}</div>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
            <FiLogOut />
            Logout
          </button>
        </div>
      )}
    </nav>
  )
}

