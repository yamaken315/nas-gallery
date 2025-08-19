export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  const { getImageById } = require('../../utils/db') as typeof import('../../utils/db')
  const img = getImageById(id)
  if (!img) throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  return img
})
