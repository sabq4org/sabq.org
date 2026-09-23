import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { boundedPhase, drainServer, registerShutdownHook } from "../../server/shutdown";
describe("bounded graceful shutdown", () => {
  it("bounds a hung operation and reports failure", async () => {
    expect(await boundedPhase([new Promise(() => {})], 10)).toBe(false);
  });
  it("drains an active HTTP response before flushing and releasing ownership", async () => {
    const order: string[] = [];
    let started!: () => void;
    const accepted = new Promise<void>(r => { started = r; });
    const server = createServer((_req, res) => { started(); setTimeout(() => { order.push("response"); res.end("ok"); }, 30); });
    await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
    const response = fetch(`http://127.0.0.1:${(server.address() as any).port}`).then(r => r.text());
    await accepted;
    registerShutdownHook("test-flush", async () => { await new Promise(r => setTimeout(r, 10)); order.push("flush"); });
    registerShutdownHook("test-release", () => { order.push("release"); }, "release");
    expect(await drainServer(server, 1000)).toBe(true);
    expect(await response).toBe("ok"); expect(order).toEqual(["response", "flush", "release"]);
  });
});
