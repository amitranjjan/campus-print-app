import { createContext, useContext, useState, useEffect } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { auth, googleProvider } from '../services/firebaseConfig'
import api from '../services/api'

const AuthContext = createContext(null)

/**
 * Hook to access auth context values.
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

/**
 * AuthProvider listens to Firebase auth state changes and checks
 * admin role via the backend API.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        // Check admin status from backend
        try {
          const res = await api.get('/api/auth/verify-admin')
          setIsAdmin(res.data.isAdmin || false)
        } catch (err) {
          console.error('Failed to verify admin status:', err)
          setIsAdmin(false)
        }
      } else {
        setUser(null)
        setIsAdmin(false)
      }
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const loginWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider)
      return result.user
    } catch (error) {
      console.error('Google sign-in error:', error)
      throw error
    }
  }

  const logout = async () => {
    try {
      await signOut(auth)
    } catch (error) {
      console.error('Sign-out error:', error)
      throw error
    }
  }

  const value = {
    user,
    isAdmin,
    loading,
    loginWithGoogle,
    logout,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

