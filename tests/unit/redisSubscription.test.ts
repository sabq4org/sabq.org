import { EventEmitter } from "node:events";
import { createServer, type Socket } from "node:net";
import Redis from "ioredis";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRedisSubscription } from "../../server/utils/redisSubscription";

class FakeRedisSubscriber extends EventEmitter {
  status = "connecting";
  subscribe = vi.fn<(channel: string) => Promise<unknown>>();
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function readRespCommand(buffer: string): { command: string[]; rest: string } | null {
  const firstLineEnd = buffer.indexOf("\r\n");
  if (firstLineEnd < 0 || buffer[0] !== "*") return null;
  const itemCount = Number(buffer.slice(1, firstLineEnd));
  let offset = firstLineEnd + 2;
  const command: string[] = [];
  for (let index = 0; index < itemCount; index += 1) {
    const lengthEnd = buffer.indexOf("\r\n", offset);
    if (lengthEnd < 0 || buffer[offset] !== "$") return null;
    const length = Number(buffer.slice(offset + 1, lengthEnd));
    const valueStart = lengthEnd + 2;
    const valueEnd = valueStart + length;
    if (buffer.length < valueEnd + 2) return null;
    command.push(buffer.slice(valueStart, valueEnd));
    offset = valueEnd + 2;
  }
  return { command, rest: buffer.slice(offset) };
}

function handleRedisCommands(socket: Socket): void {
  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    while (true) {
      const parsed = readRespCommand(buffer);
      if (!parsed) return;
      buffer = parsed.rest;
      if (parsed.command[0]?.toLowerCase() === "subscribe") {
        const channel = parsed.command[1] ?? "events";
        const channelResp = `$${Buffer.byteLength(channel)}\r\n${channel}\r\n`;
        // Deliberately send the SUBSCRIBE acknowledgement and first message in
        // one packet. ioredis emits `message` before the subscribe promise
        // settles in this case.
        socket.write(
          `*3\r\n$9\r\nsubscribe\r\n${channelResp}:1\r\n` +
          `*3\r\n$7\r\nmessage\r\n${channelResp}$5\r\nhello\r\n`,
        );
      } else {
        socket.write("+OK\r\n");
      }
    }
  });
}

describe("createRedisSubscription", () => {
  afterEach(() => vi.useRealTimers());

  it("observes rejected subscribe promises and retries after a bounded delay", async () => {
    vi.useFakeTimers();
    const client = new FakeRedisSubscriber();
    const onSubscribeError = vi.fn();
    const unhandled = vi.fn();
    client.subscribe
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockRejectedValueOnce(new Error("rate limited"));
    client.subscribe.mockResolvedValueOnce(1);
    const subscription = createRedisSubscription(client, {
      channel: "events",
      retryBaseMs: 100,
      retryMaxMs: 400,
      onSubscribeError,
    }).start();
    process.on("unhandledRejection", unhandled);

    try {
      client.emit("ready");
      await flushPromises();
      expect(onSubscribeError).toHaveBeenCalledOnce();
      expect(subscription.isReady()).toBe(false);
      expect(client.subscribe).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(100);
      await flushPromises();
      expect(client.subscribe).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(199);
      expect(client.subscribe).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      await flushPromises();
      expect(client.subscribe).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(399);
      expect(client.subscribe).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(1);
      await flushPromises();
      expect(subscription.isReady()).toBe(true);
      expect(client.subscribe).toHaveBeenCalledTimes(4);
      expect(onSubscribeError).toHaveBeenCalledTimes(3);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
      subscription.stop();
    }
  });

  it("keeps one subscription in flight when ready fires repeatedly", async () => {
    let resolveSubscribe!: (value: number) => void;
    const client = new FakeRedisSubscriber();
    client.subscribe.mockImplementation(() => new Promise((resolve) => {
      resolveSubscribe = resolve;
    }));
    const subscription = createRedisSubscription(client, { channel: "events" }).start();

    client.emit("ready");
    client.emit("ready");
    await flushPromises();
    expect(client.subscribe).toHaveBeenCalledOnce();
    resolveSubscribe(1);
    await flushPromises();
    expect(subscription.isReady()).toBe(true);
    expect(client.subscribe).toHaveBeenCalledOnce();
    subscription.stop();
  });

  it("marks the subscriber unavailable on disconnect and subscribes on ready again", async () => {
    const client = new FakeRedisSubscriber();
    client.subscribe.mockResolvedValue(1);
    const readiness: boolean[] = [];
    const subscription = createRedisSubscription(client, {
      channel: "events",
      onReadyChange: (ready) => readiness.push(ready),
    }).start();

    client.emit("ready");
    await flushPromises();
    expect(subscription.isReady()).toBe(true);
    client.emit("reconnecting");
    expect(subscription.isReady()).toBe(false);
    client.emit("ready");
    await flushPromises();
    expect(subscription.isReady()).toBe(true);
    expect(client.subscribe).toHaveBeenCalledTimes(2);
    expect(readiness).toEqual([true, false, true]);
    subscription.stop();
  });

  it("stop clears retry timers and removes every listener", async () => {
    vi.useFakeTimers();
    const client = new FakeRedisSubscriber();
    client.subscribe.mockRejectedValue(new Error("rate limited"));
    const subscription = createRedisSubscription(client, {
      channel: "events",
      retryBaseMs: 100,
    }).start();

    client.emit("ready");
    await flushPromises();
    expect(client.subscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    subscription.stop();

    expect(vi.getTimerCount()).toBe(0);
    expect(client.listenerCount("ready")).toBe(0);
    expect(client.listenerCount("close")).toBe(0);
    expect(client.listenerCount("end")).toBe(0);
    expect(client.listenerCount("reconnecting")).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.subscribe).toHaveBeenCalledOnce();
  });

  it("delivers a message that arrives before the subscribe promise settles", async () => {
    const server = createServer(handleRedisCommands);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TCP test server has no port");

    const client = new Redis({
      host: "127.0.0.1",
      port: address.port,
      lazyConnect: true,
      enableReadyCheck: false,
      autoResubscribe: false,
      retryStrategy: () => null,
    });
    const subscription = createRedisSubscription(client, { channel: "events" }).start();
    const readyWhenMessageArrived = new Promise<boolean>((resolve) => {
      client.once("message", () => resolve(subscription.isReady()));
    });

    try {
      await client.connect();
      expect(await readyWhenMessageArrived).toBe(false);
      await flushPromises();
      expect(subscription.isReady()).toBe(true);
    } finally {
      subscription.stop();
      client.disconnect();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
