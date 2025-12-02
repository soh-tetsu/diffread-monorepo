type ConcurrencyEnv = {
  sessionWorker?: string
  pendingWorker?: string
}

function parseConcurrency(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback
  }
  return Math.floor(parsed)
}

const concurrencyEnv: ConcurrencyEnv = {
  sessionWorker: process.env.SESSION_WORKER_CONCURRENCY,
  pendingWorker: process.env.PENDING_WORKER_CONCURRENCY,
}

export const concurrencyConfig = {
  sessionWorkers: parseConcurrency(concurrencyEnv.sessionWorker, 5),
  pendingWorkers: parseConcurrency(concurrencyEnv.pendingWorker, 1),
}
