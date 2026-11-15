import api from './axios'

export const getLotterySettings = () => api.get('/lottery/settings').then((r) => r.data)
export const updateLotterySettings = (data) => api.put('/lottery/settings', data).then((r) => r.data)
export const testLotteryConnection = () => api.post('/lottery/test').then((r) => r.data)
