import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

async function main() {
  const { runWorldCupNewsCycle } = await import("./server/services/worldCupNewsGenerator");
  console.log("=== WC news test cycle starting ===");
  const summary = await runWorldCupNewsCycle();
  console.log("=== summary ===", summary);
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
