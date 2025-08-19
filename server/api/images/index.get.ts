export default defineEventHandler((event) => {
  const q = getQuery(event)
  const page = Math.max(1, Number(q.page || 1))
  const pageSize = Math.min(200, Number(q.pageSize || 50))
  const offset = (page - 1) * pageSize
  const { listImages } = require('../../utils/db') as typeof import('../../utils/db')
  const items = listImages(offset, pageSize)
  return { page, pageSize, items }
})
