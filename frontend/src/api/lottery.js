import api from './axios'

export const getLotterySettings = () => api.get('/lottery/settings').then((r) => r.data)
export const updateLotterySettings = (data) => api.put('/lottery/settings', data).then((r) => r.data)
export const testLotteryConnection = () => api.post('/lottery/test').then((r) => r.data)
// Accepts either { weeks } for a rolling count or { startDate, endDate } for
// an explicit range; pass refresh to re-pull the range from the portal.
export const getCommissions = ({ weeks, startDate, endDate, refresh } = {}) => {
  const q = new URLSearchParams()
  if (startDate && endDate) {
    q.set('startDate', startDate)
    q.set('endDate', endDate)
  } else if (weeks) {
    q.set('weeks', String(weeks))
  }
  if (refresh) q.set('refresh', 'true')
  return api.get(`/lottery/commissions?${q}`).then((r) => r.data)
}
