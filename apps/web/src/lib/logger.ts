import { Logger } from 'tslog'

const minLevel = (() => {
  const envLevel = process.env.LOG_LEVEL
  if (envLevel === 'debug') return 0
  if (envLevel === 'info') return 3
  if (envLevel === 'warn') return 4
  if (envLevel === 'error') return 5

  // Default based on environment
  return process.env.NODE_ENV === 'production' ? 3 : 0
})()

export const logger = new Logger({
  minLevel,
  type: process.env.NODE_ENV === 'production' ? 'json' : 'pretty',
  name: 'diffread',
})
