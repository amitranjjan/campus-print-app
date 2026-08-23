import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEffect } from 'react'
import { HiOutlinePrinter } from 'react-icons/hi2'
import { FcGoogle } from 'react-icons/fc'
import toast from 'react-hot-toast'

export default function Login() {
  const { user, isAdmin, loading, loginWithGoogle } = useAuth()
  const navigate = useNavigate()

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      navigate(isAdmin ? '/admin' : '/', { replace: true })
    }
  }, [user, isAdmin, loading, navigate])

  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle()
      toast.success('Signed in successfully!')
    } catch (error) {
      if (error.code !== 'auth/popup-closed-by-user') {
        toast.error('Sign-in failed. Please try again.')
      }
    }
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <HiOutlinePrinter />
        </div>

        <h1>KARE Campus Print</h1>
        <p className="login-tagline">
          Skip the queue. Upload your document, get a token, and pick up your prints when ready.
        </p>

        <button className="btn btn-google btn-lg" onClick={handleGoogleLogin} style={{ width: '100%' }}>
          <FcGoogle size={22} />
          Sign in with Google
        </button>

        <p className="login-footer">
          Use your college email for the best experience
        </p>
      </div>
    </div>
  )
}

