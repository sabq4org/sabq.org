import { describe, expect, it } from "vitest";
import {
  EDITOR_HIDDEN_TIMEOUT_MS,
  EDITOR_IDLE_TIMEOUT_MS,
  getNextPresenceCheckDelayMs,
  shouldMaintainEditorPresence,
} from "../../client/src/lib/editorPresencePolicy";
import {
  evaluateLegacyHeartbeat,
  LEGACY_GAP_RESET_MS,
  LEGACY_UNCHANGED_MAX_MS,
  pruneLegacyTracker,
  type LegacyHeartbeatRecord,
} from "../../server/services/editorPresenceGuard";

describe("editorPresencePolicy", () => {
  it("keeps presence active while visible and recently active", () => {
    const t0 = 1_000_000;
    expect(
      shouldMaintainEditorPresence(
        { lastActivityAt: t0, hiddenSince: null },
        t0 + EDITOR_IDLE_TIMEOUT_MS - 1,
      ),
    ).toBe(true);
  });

  it("drops presence once idle reaches EDITOR_IDLE_TIMEOUT_MS", () => {
    const t0 = 1_000_000;
    expect(
      shouldMaintainEditorPresence(
        { lastActivityAt: t0, hiddenSince: null },
        t0 + EDITOR_IDLE_TIMEOUT_MS,
      ),
    ).toBe(false);
  });

  it("allows brief tab switches under EDITOR_HIDDEN_TIMEOUT_MS and drops after", () => {
    const t0 = 1_000_000;
    expect(
      shouldMaintainEditorPresence(
        { lastActivityAt: t0, hiddenSince: t0 },
        t0 + EDITOR_HIDDEN_TIMEOUT_MS - 1,
      ),
    ).toBe(true);

    expect(
      shouldMaintainEditorPresence(
        { lastActivityAt: t0, hiddenSince: t0 },
        t0 + EDITOR_HIDDEN_TIMEOUT_MS,
      ),
    ).toBe(false);
  });

  it("computes the earliest upcoming expiry delay", () => {
    const t0 = 1_000_000;
    expect(
      getNextPresenceCheckDelayMs(
        { lastActivityAt: t0, hiddenSince: null },
        t0 + 10_000,
      ),
    ).toBe(EDITOR_IDLE_TIMEOUT_MS - 10_000);

    expect(
      getNextPresenceCheckDelayMs(
        { lastActivityAt: t0, hiddenSince: t0 + 5_000 },
        t0 + 10_000,
      ),
    ).toBe(EDITOR_HIDDEN_TIMEOUT_MS - 5_000);
  });
});

describe("editorPresenceGuard (legacy clients)", () => {
  it("never suppresses idleAware clients and clears prior legacy tracking", () => {
    const tracker = new Map<string, LegacyHeartbeatRecord>();
    const t0 = 5_000_000;

    evaluateLegacyHeartbeat(tracker, "u1:s1", "a1\0title\0sum", t0, false);
    expect(tracker.size).toBe(1);

    const decision = evaluateLegacyHeartbeat(
      tracker,
      "u1:s1",
      "a1\0title\0sum",
      t0 + LEGACY_UNCHANGED_MAX_MS + 10_000,
      true,
    );
    expect(decision).toEqual({ suppress: false, newlySuppressed: false });
    expect(tracker.size).toBe(0);
  });

  it("suppresses pre-fix clients repeating the exact same payload past LEGACY_UNCHANGED_MAX_MS", () => {
    const tracker = new Map<string, LegacyHeartbeatRecord>();
    const t0 = 5_000_000;
    const stepMs = 5 * 60 * 1000; // within LEGACY_GAP_RESET_MS (10m)

    for (let elapsed = 0; elapsed < LEGACY_UNCHANGED_MAX_MS; elapsed += stepMs) {
      expect(
        evaluateLegacyHeartbeat(tracker, "u1:s1", "a1\0old\0sum", t0 + elapsed, false),
      ).toEqual({ suppress: false, newlySuppressed: false });
    }

    expect(
      evaluateLegacyHeartbeat(
        tracker,
        "u1:s1",
        "a1\0old\0sum",
        t0 + LEGACY_UNCHANGED_MAX_MS,
        false,
      ),
    ).toEqual({ suppress: true, newlySuppressed: true });

    // Subsequent identical pings stay suppressed without re-triggering leave broadcasts
    expect(
      evaluateLegacyHeartbeat(
        tracker,
        "u1:s1",
        "a1\0old\0sum",
        t0 + LEGACY_UNCHANGED_MAX_MS + 20_000,
        false,
      ),
    ).toEqual({ suppress: true, newlySuppressed: false });
  });

  it("resets when content changes or after a gap exceeding LEGACY_GAP_RESET_MS", () => {
    const tracker = new Map<string, LegacyHeartbeatRecord>();
    const t0 = 5_000_000;
    const stepMs = 5 * 60 * 1000;

    for (let elapsed = 0; elapsed < LEGACY_UNCHANGED_MAX_MS; elapsed += stepMs) {
      evaluateLegacyHeartbeat(tracker, "u1:s1", "a1\0old\0sum", t0 + elapsed, false);
    }
    expect(
      evaluateLegacyHeartbeat(
        tracker,
        "u1:s1",
        "a1\0old\0sum",
        t0 + LEGACY_UNCHANGED_MAX_MS,
        false,
      ),
    ).toEqual({ suppress: true, newlySuppressed: true });

    // Content change resets tracking
    expect(
      evaluateLegacyHeartbeat(
        tracker,
        "u1:s1",
        "a1\0edited title\0sum",
        t0 + LEGACY_UNCHANGED_MAX_MS + 5_000,
        false,
      ),
    ).toEqual({ suppress: false, newlySuppressed: false });

    // Trigger suppression again with periodic heartbeats, then return after > LEGACY_GAP_RESET_MS
    const t1 = t0 + LEGACY_UNCHANGED_MAX_MS + 5_000;
    for (let elapsed = stepMs; elapsed < LEGACY_UNCHANGED_MAX_MS; elapsed += stepMs) {
      evaluateLegacyHeartbeat(tracker, "u1:s1", "a1\0edited title\0sum", t1 + elapsed, false);
    }
    expect(
      evaluateLegacyHeartbeat(
        tracker,
        "u1:s1",
        "a1\0edited title\0sum",
        t1 + LEGACY_UNCHANGED_MAX_MS,
        false,
      ),
    ).toEqual({ suppress: true, newlySuppressed: true });

    expect(
      evaluateLegacyHeartbeat(
        tracker,
        "u1:s1",
        "a1\0edited title\0sum",
        t1 + LEGACY_UNCHANGED_MAX_MS + LEGACY_GAP_RESET_MS + 1,
        false,
      ),
    ).toEqual({ suppress: false, newlySuppressed: false });
  });

  it("prunes stale legacy tracker entries", () => {
    const tracker = new Map<string, LegacyHeartbeatRecord>();
    const t0 = 5_000_000;
    evaluateLegacyHeartbeat(tracker, "stale:s1", "sig", t0, false);
    evaluateLegacyHeartbeat(tracker, "fresh:s2", "sig", t0 + LEGACY_GAP_RESET_MS, false);

    pruneLegacyTracker(tracker, t0 + LEGACY_GAP_RESET_MS + 1);
    expect(tracker.has("stale:s1")).toBe(false);
    expect(tracker.has("fresh:s2")).toBe(true);
  });
});
