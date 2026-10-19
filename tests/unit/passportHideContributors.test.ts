import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));

import {
  hidePassportContributors,
  type PassportResponse,
} from "../../server/services/articlePassportService";

const person = { id: "u1", firstName: "أحمد", lastName: "علي" } as never;

function passport(): PassportResponse {
  return {
    people: {
      author: person,
      submitter: person,
      reporter: person,
      reviewer: person,
      verifier: person,
      publisherApprover: person,
    },
    publisher: null,
    timeline: [
      { id: "c", eventType: "created", summary: "s", createdAt: "2026-10-01", actor: person, source: "synthetic", details: null },
      { id: "p", eventType: "published", summary: "s", createdAt: "2026-10-02", actor: person, source: "article_events", details: { a: 1 } },
      { id: "u", eventType: "updated", summary: "s", createdAt: "2026-10-03", actor: person, source: "audit_log", details: null },
    ],
  } as unknown as PassportResponse;
}

describe("hidePassportContributors", () => {
  it("clears every person while keeping the people object for old app decoders", () => {
    const out = hidePassportContributors(passport());
    expect(out.people).toEqual({
      author: null,
      submitter: null,
      reporter: null,
      reviewer: null,
      verifier: null,
      publisherApprover: null,
    });
  });

  it("keeps only the publish milestone, without actor, summary or details", () => {
    const out = hidePassportContributors(passport());
    expect(out.timeline).toEqual([
      { id: "p", eventType: "published", summary: null, createdAt: "2026-10-02", actor: null, source: "article_events", details: null },
    ]);
  });

  it("accepts the audit-log \"publish\" alias and normalizes it", () => {
    const p = passport();
    p.timeline = p.timeline.map((e) => (e.id === "p" ? { ...e, eventType: "PUBLISH" } : e));
    const out = hidePassportContributors(p);
    expect(out.timeline).toHaveLength(1);
    expect(out.timeline[0]).toMatchObject({ id: "p", eventType: "published", actor: null });
  });

  it("returns an empty timeline when there is no publish event", () => {
    const p = passport();
    p.timeline = p.timeline.filter((e) => e.eventType !== "published");
    expect(hidePassportContributors(p).timeline).toEqual([]);
  });
});
