const queues = new Map();

export async function serial(key, task) {
  const run = (queues.get(key) ?? Promise.resolve()).then(task);
  const settled = run.catch(() => {});
  queues.set(key, settled);
  try {
    return await run;
  } finally {
    if (queues.get(key) === settled) queues.delete(key);
  }
}
