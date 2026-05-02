import api from './axios'

export const getGroceryEntries = (from, to) =>
  api.get('/grocery', { params: { from, to } }).then(r => r.data)

export const createGroceryEntry = (data) =>
  api.post('/grocery', data).then(r => r.data)

export const updateGroceryEntry = (id, data) =>
  api.put(`/grocery/${id}`, data).then(r => r.data)

export const deleteGroceryEntry = (id) =>
  api.delete(`/grocery/${id}`).then(r => r.data)
