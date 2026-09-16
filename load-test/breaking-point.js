// Breaking-point load test for Sabq's hot public read paths (k6).
//
// Ramps virtual users until error-rate / latency degrade — that inflection is
// your real connection + throughput ceiling. Use it to VERIFY the Neon -pooler
// fix (before: the pool saturates and 5xx climbs at a low VU count; after: it
// holds far higher). See docs/NEON_CONNECTION_SCALING.md.
//
// Run (install k6 first: https://k6.io/docs/get-started/installation):
//   BASE_URL=http://localhost:3000 k6 run load-test/breaking-point.js
//   BASE_URL=https://<staging-or-preview> ARTICLE_SLUG=<slug> k6 run load-test/breaking-point.js
//
// ⚠️ Do NOT run against production without a maintenance window — this is a
//    deliberate stress test and will generate real load.
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const ARTICLE_SLUG = __ENV.ARTICLE_SLUG || ""; // optional: exercise the article path too

const errorRate = new Rate("errors");
const liteLatency = new Trend("homepage_lite_ms", true);

export const options = {
  scenarios: {
    ramp: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "1m", target: 150 },
        { duration: "1m", target: 300 },
        { duration: "1m", target: 500 }, // push past the expected ceiling
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  // The run "fails" once the site degrades — that failure IS the breaking point.
  thresholds: {
    http_req_failed: ["rate<0.02"], // < 2% errors
    homepage_lite_ms: ["p(95)<1500"], // p95 under 1.5s
  },
};

export default function () {
  // Heaviest hot path — /api/homepage-lite fans out to ~6 parallel DB queries.
  const lite = http.get(`${BASE}/api/homepage-lite`, { tags: { name: "homepage-lite" } });
  liteLatency.add(lite.timings.duration);
  errorRate.add(lite.status !== 200);
  check(lite, { "homepage-lite 200": (r) => r.status === 200 });

  // SSR homepage shell.
  const home = http.get(`${BASE}/`, { tags: { name: "homepage" } });
  errorRate.add(home.status >= 400);
  check(home, { "homepage < 400": (r) => r.status < 400 });

  if (ARTICLE_SLUG) {
    const art = http.get(`${BASE}/article/${ARTICLE_SLUG}`, { tags: { name: "article" } });
    errorRate.add(art.status >= 400);
    check(art, { "article < 400": (r) => r.status < 400 });
  }

  sleep(1);
}
