import axios from 'axios'

// VITE_API_BASE_URL is set to the Render backend URL in production.
// In local dev it's empty and Vite's proxy handles /api → localhost:4000.
const api = axios.create({ baseURL: (import.meta.env.VITE_API_BASE_URL || '') + '/api', withCredentials: true })

let isRefreshing = false
let failedQueue = []

function processQueue(error) {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve()))
  failedQueue = []
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry && !original.url.startsWith('/auth/')) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then(() => api(original)).catch((e) => Promise.reject(e))
      }

      original._retry = true
      isRefreshing = true

      try {
        await api.post('/auth/refresh')
        processQueue(null)
        return api(original)
      } catch (refreshError) {
        processQueue(refreshError)
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  }
)

export default api
