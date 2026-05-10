/**
 * Multi-process smoke test for the cross-pod Redis pub/sub bridges added to
 * `server/memoryCache.ts` (sseConnectionManager.broadcast) and
 * `server/notificationBus.ts` (notificationBus.emit).
 *
 * Spawns two child processes that simulate two app instances ("pods"):
 *   - Pod A subscribes via the in-process bus (no HTTP).
 *   - Pod B emits/broadcasts via the in-process bus.
 * The parent collects results over IPC and exits non-zero if either channel
 * fails to deliver across processes within the timeout.
 *
 * Run with:
 *   REDIS_URL=... npx tsx server/scripts/testCrossPodPubSub.ts
 */
import { fork, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ReadyMessage {
  type: 'ready';
}
interface ResultMessage {
  type: 'result';
  sseBroadcastSeen: boolean;
  notificationSeen: boolean;
}
interface PublishedMessage {
  type: 'published';
}
type ChildMessage = ReadyMessage | ResultMessage | PublishedMessage;

interface CrossPodTestPayload {
  type?: unknown;
  attempt?: unknown;
  kind?: unknown;
}

function isCrossPodTestSseData(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return (value as CrossPodTestPayload).type === 'cross-pod-test';
}

function isCrossPodTestNotification(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return (value as CrossPodTestPayload).kind === 'cross-pod-test';
}

function isWorker(): boolean {
  return (
    process.env.CROSS_POD_TEST_ROLE === 'subscriber' ||
    process.env.CROSS_POD_TEST_ROLE === 'publisher'
  );
}

async function runSubscriber(): Promise<void> {
  // Importing eagerly initialises Redis pub/sub.
  const { sseConnectionManager } = await import('../memoryCache');
  const { notificationBus } = await import('../notificationBus');

  const expectedUserId = process.env.CROSS_POD_TEST_USER_ID || 'cross-pod-test-user';
  let sseBroadcastSeen = false;
  let notificationSeen = false;

  const off = sseConnectionManager.onBroadcast((data, fromRemotePod) => {
    if (fromRemotePod && isCrossPodTestSseData(data)) {
      sseBroadcastSeen = true;
      maybeReport();
    }
  });

  notificationBus.subscribe(expectedUserId, (n: unknown) => {
    if (isCrossPodTestNotification(n)) {
      notificationSeen = true;
      maybeReport();
    }
  });

  function maybeReport(): void {
    if (sseBroadcastSeen && notificationSeen) {
      const result: ResultMessage = { type: 'result', sseBroadcastSeen, notificationSeen };
      process.send?.(result);
    }
  }

  // Tell the parent we're ready to receive.
  // Allow ~1s for Redis SUBSCRIBE acknowledgement.
  setTimeout(() => {
    const ready: ReadyMessage = { type: 'ready' };
    process.send?.(ready);
  }, 1000);

  // Final fallback report so the parent always gets something to inspect.
  setTimeout(() => {
    const result: ResultMessage = { type: 'result', sseBroadcastSeen, notificationSeen };
    process.send?.(result);
    off();
  }, 8000);
}

async function runPublisher(): Promise<void> {
  const { sseConnectionManager } = await import('../memoryCache');
  const { notificationBus } = await import('../notificationBus');

  const expectedUserId = process.env.CROSS_POD_TEST_USER_ID || 'cross-pod-test-user';

  // Wait for Redis pub/sub to be ready before publishing.
  await new Promise((r) => setTimeout(r, 1500));

  // Emit a few times to defeat any race with the subscriber's SUBSCRIBE
  // acknowledgement on the other process.
  for (let i = 0; i < 3; i++) {
    sseConnectionManager.broadcast({ type: 'cross-pod-test', attempt: i });
    notificationBus.emit(expectedUserId, { kind: 'cross-pod-test', attempt: i });
    await new Promise((r) => setTimeout(r, 400));
  }

  const published: PublishedMessage = { type: 'published' };
  process.send?.(published);

  // Hold open briefly so Redis flushes the publish, then exit.
  setTimeout(() => process.exit(0), 1500);
}

async function runWorker(): Promise<void> {
  if (process.env.CROSS_POD_TEST_ROLE === 'subscriber') {
    await runSubscriber();
  } else if (process.env.CROSS_POD_TEST_ROLE === 'publisher') {
    await runPublisher();
  }
}

function isChildMessage(value: unknown): value is ChildMessage {
  if (!value || typeof value !== 'object') return false;
  const t = (value as { type?: unknown }).type;
  return t === 'ready' || t === 'result' || t === 'published';
}

async function runParent(): Promise<void> {
  if (!process.env.REDIS_URL) {
    console.error('❌ REDIS_URL is not set — cross-pod test cannot run.');
    process.exit(2);
  }

  const userId = `cross-pod-test-${Date.now()}`;
  const scriptPath = path.resolve(__dirname, 'testCrossPodPubSub.ts');

  function spawn(role: 'subscriber' | 'publisher'): ChildProcess {
    return fork(scriptPath, [], {
      env: {
        ...process.env,
        CROSS_POD_TEST_ROLE: role,
        CROSS_POD_TEST_USER_ID: userId,
      },
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
  }

  console.log('▶ spawning subscriber pod...');
  const subscriber = spawn('subscriber');

  let subscriberReady = false;
  const subscriberDone = new Promise<{ sseBroadcastSeen: boolean; notificationSeen: boolean }>(
    (resolve) => {
      subscriber.on('message', (msg: unknown) => {
        if (!isChildMessage(msg)) return;
        if (msg.type === 'ready') {
          subscriberReady = true;
          console.log('✓ subscriber pod ready');
        } else if (msg.type === 'result') {
          resolve({
            sseBroadcastSeen: msg.sseBroadcastSeen,
            notificationSeen: msg.notificationSeen,
          });
        }
      });
      subscriber.on('exit', (code) => {
        if (!subscriberReady) {
          console.error('❌ subscriber exited before becoming ready (code', code, ')');
          resolve({ sseBroadcastSeen: false, notificationSeen: false });
        }
      });
    },
  );

  // Wait for subscriber to signal ready (or timeout).
  await Promise.race([
    new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (subscriberReady) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    }),
    new Promise<void>((resolve) => setTimeout(resolve, 6000)),
  ]);

  if (!subscriberReady) {
    console.error('❌ subscriber did not become ready in time');
    subscriber.kill();
    process.exit(1);
  }

  console.log('▶ spawning publisher pod...');
  const publisher = spawn('publisher');

  publisher.on('message', (msg: unknown) => {
    if (isChildMessage(msg) && msg.type === 'published') {
      console.log('✓ publisher reported it broadcast/emitted');
    }
  });

  const result = await Promise.race([
    subscriberDone,
    new Promise<{ sseBroadcastSeen: boolean; notificationSeen: boolean }>((resolve) =>
      setTimeout(() => resolve({ sseBroadcastSeen: false, notificationSeen: false }), 12000),
    ),
  ]);

  // Tear down children.
  try {
    publisher.kill();
  } catch {
    // ignore
  }
  try {
    subscriber.kill();
  } catch {
    // ignore
  }

  console.log('---');
  console.log('SSE broadcast cross-pod delivery:', result.sseBroadcastSeen ? '✅ pass' : '❌ fail');
  console.log('Notification bus cross-pod delivery:', result.notificationSeen ? '✅ pass' : '❌ fail');

  if (result.sseBroadcastSeen && result.notificationSeen) {
    console.log('🎉 cross-pod pub/sub is working');
    setTimeout(() => process.exit(0), 200);
  } else {
    console.error('❌ cross-pod pub/sub failed for at least one channel');
    setTimeout(() => process.exit(1), 200);
  }
}

if (isWorker()) {
  runWorker().catch((e: unknown) => {
    const msg = e instanceof Error ? e.stack || e.message : String(e);
    console.error('worker error:', msg);
    process.exit(1);
  });
} else {
  runParent().catch((e: unknown) => {
    const msg = e instanceof Error ? e.stack || e.message : String(e);
    console.error('parent error:', msg);
    process.exit(1);
  });
}
