// Bounds for the waits of a design loaded without the studio (`loadDesignSession`): a request that
// never answers must not hold the load forever, and a cancel must stop it at once.

/**
 * `work`, or `fallback` when it has not settled within `ms`. With a `signal`, an abort ends the
 * wait at once with a rejection (the signal's reason). However the wait ends (settled, timed out,
 * aborted) its timer and its abort listener are released at once.
 */
export function within<T>(
  work: Promise<T>,
  ms: number,
  fallback: T,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const release = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      release();
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      release();
      resolve(fallback);
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        release();
        resolve(value);
      },
      (error: unknown) => {
        release();
        reject(error);
      },
    );
  });
}

/** `work`, unless `signal` aborts first: then a rejection with the signal's reason. */
export function abortable<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return work;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
