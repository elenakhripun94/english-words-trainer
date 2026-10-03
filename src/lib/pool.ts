/** Runs async tasks with a concurrency cap. Results keep the original order. */
export async function pool<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  if (limit < 1) throw new Error('pool_limit')
  const results = new Array<T>(tasks.length)
  let next = 0

  async function worker() {
    while (next < tasks.length) {
      const index = next
      next += 1
      results[index] = await tasks[index]()
    }
  }

  const workers = Math.min(limit, tasks.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}
