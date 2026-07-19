import http from "node:http";
import { pool } from "./db";
import {
  startNewsletterDeliveryWorker,
  stopNewsletterDeliveryWorker,
} from "./services/newsletterDeliveryQueue";

const port = Number.parseInt(process.env.PORT || "5000", 10);

async function main(): Promise<void> {
  const deliveryEnabled = process.env.ENABLE_NEWSLETTER_DELIVERY_WORKER === "true";
  const schedulerEnabled = process.env.ENABLE_NEWSLETTER_SCHEDULER === "true";

  if (deliveryEnabled) {
    await startNewsletterDeliveryWorker();
  } else {
    console.log("[NewsletterWorker] Delivery disabled; queued jobs will remain paused");
  }

  if (schedulerEnabled) {
    const { newsletterScheduler } = await import("./services/newsletterScheduler");
    newsletterScheduler.start();
    console.log("[NewsletterWorker] Scheduler enabled");
  } else {
    console.log("[NewsletterWorker] Scheduler disabled; queued deliveries only");
  }

  // Railway يحتاج health endpoint حتى للـ worker غير العام.
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        process: "newsletter-worker",
        deliveryEnabled,
        schedulerEnabled,
      }));
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(port, "0.0.0.0", () => {
    console.log(`[NewsletterWorker] Health server listening on ${port}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[NewsletterWorker] Received ${signal}; stopping`);
    stopNewsletterDeliveryWorker();
    server.close(async () => {
      await pool?.end?.();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  console.error(`[NewsletterWorker] Fatal startup error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
