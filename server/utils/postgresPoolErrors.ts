type ErrorEmitter = {
  on(event: "error", listener: (error: unknown) => void): unknown;
};

type PoolEmitter = ErrorEmitter & {
  on(event: "connect", listener: (client: ErrorEmitter) => void): unknown;
};

/**
 * node-postgres removes its pool-owned error listener while a client is checked
 * out. Keep one application-owned listener on every connected client so a
 * transient socket close cannot become an uncaught `error` event between query
 * callbacks. The pool listener remains responsible for idle clients.
 */
export function installPostgresPoolErrorHandling(
  pool: PoolEmitter,
  onError: (error: unknown) => void,
): void {
  const handledErrors = new WeakSet<object>();

  const handleError = (error: unknown) => {
    if (typeof error === "object" && error !== null) {
      if (handledErrors.has(error)) return;
      handledErrors.add(error);
    }
    onError(error);
  };

  pool.on("error", handleError);
  pool.on("connect", (client) => {
    client.on("error", handleError);
  });
}
