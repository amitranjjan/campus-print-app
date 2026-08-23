import axios from 'axios'
import { auth } from './firebaseConfig'

const rawBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_BASE_URL = (rawBaseUrl || '').trim().replace(/\/+$/, '') || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Attach Firebase JWT token to every request
api.interceptors.request.use(async (config) => {
  try {
    if (auth?.authStateReady) {
      await auth.authStateReady()
    }
    const user = auth.currentUser
    if (user) {
      const token = await user.getIdToken()
      config.headers.Authorization = `Bearer ${token}`
    }
  } catch (err) {
    console.warn('Could not retrieve Firebase ID token:', err)
  }
  return config
})

// Handle common error responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error('Unauthorized (401) – token may be expired or missing on backend')
    } else if (error.response?.status === 500) {
      console.error('Backend Server Error (500):', error.response?.data)
    } else if (!error.response) {
      console.error('Network Error – Check if backend is reachable at:', API_BASE_URL)
    }
    return Promise.reject(error)
  }
)

export default api

