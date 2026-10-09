export type SerialQueue = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Runs tasks one at a time, in the order they were added: each starts after
 * the one before it settles. A failed task does not stop the ones after it.
 */
export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return (task) => {
    const run = tail.then(task);
    tail = run.catch(() => {});
    return run;
  };
}
