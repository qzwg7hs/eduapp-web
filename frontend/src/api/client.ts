import axios from 'axios'

// In local dev this stays '/api' and goes through the Vite proxy to the local
// backend (see vite.config.ts). In production, set VITE_API_URL to the full
// deployed backend URL (e.g. "https://api.your-domain.com/api") since the
// frontend and backend are hosted on different origins there.
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
