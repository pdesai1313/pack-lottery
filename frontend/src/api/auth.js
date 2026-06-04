import api from './axios'

export const login           = (email, password)     => api.post('/auth/login',           { email, password }).then((r) => r.data)
export const logout          = ()                    => api.post('/auth/logout').then((r) => r.data)
export const getMe           = ()                    => api.get('/auth/me').then((r) => r.data)
export const forgotPassword  = (email)               => api.post('/auth/forgot-password', { email }).then((r) => r.data)
export const resetPassword   = (token, password)     => api.post('/auth/reset-password',  { token, password }).then((r) => r.data)
