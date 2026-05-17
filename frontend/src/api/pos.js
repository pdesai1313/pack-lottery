import api from './axios'

export const fetchPosData = (date) => api.get(`/pos/fetch?date=${date}`).then((r) => r.data)
export const getPosImports = (from, to) => api.get(`/pos?from=${from}&to=${to}`).then((r) => r.data)
export const savePosImport = (data) => api.post('/pos', data).then((r) => r.data)
export const deletePosImport = (id) => api.delete(`/pos/${id}`).then((r) => r.data)
