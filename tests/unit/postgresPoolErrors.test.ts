import { EventEmitter } from "node:events";
import { Pool, type PoolConfig } from "pg";
import { describe, expect, it, vi } from "vitest";
import { installPostgresPoolErrorHandling } from "../../server/utils/postgresPoolErrors";

describe("installPostgresPoolErrorHandling", () => {
  it("keeps the application listener on a real pg-pool client during checkout", async () => {
    class FakeClient extends EventEmitter {
      connect(callback: (error?: Error) => void): void {
        callback();
      }

      end(callback?: () => void): void {
        this.emit("end");
        callback?.();
      }

      ref(): void {}
      unref(): void {}
    }

    const pool = new Pool({ Client: FakeClient } as unknown as PoolConfig);
    const onError = vi.fn();
    installPostgresPoolErrorHandling(pool, onError);

    const client = await pool.connect();
    const disconnect = new Error("Connection terminated unexpectedly");

    expect(() => client.emit("error", disconnect)).not.toThrow();
    expect(onError).toHaveBeenCalledWith(disconnect);

    client.release(disconnect);
    await pool.end();
  });

  it("handles errors emitted while a pool client is checked out", () => {
    const pool = new EventEmitter();
    const client = new EventEmitter();
    const onError = vi.fn();

    installPostgresPoolErrorHandling(pool, onError);
    pool.emit("connect", client);

    const disconnect = new Error("Connection terminated unexpectedly");
    expect(() => client.emit("error", disconnect)).not.toThrow();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(disconnect);
  });

  it("deduplicates an idle-client error forwarded by the pool", () => {
    const pool = new EventEmitter();
    const client = new EventEmitter();
    const onError = vi.fn();

    installPostgresPoolErrorHandling(pool, onError);
    pool.emit("connect", client);

    const disconnect = new Error("Connection terminated unexpectedly");
    client.emit("error", disconnect);
    pool.emit("error", disconnect);

    expect(onError).toHaveBeenCalledOnce();
  });

  it("still handles errors emitted directly by the pool", () => {
    const pool = new EventEmitter();
    const onError = vi.fn();

    installPostgresPoolErrorHandling(pool, onError);
    const disconnect = new Error("connection reset");

    expect(() => pool.emit("error", disconnect)).not.toThrow();
    expect(onError).toHaveBeenCalledWith(disconnect);
  });
});
