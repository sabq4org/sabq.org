import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { presentMawaeed } from "@shared/mawaeed/present";
import type { OccurrenceRecord, SeriesRecord } from "@shared/mawaeed/model";

const mocks = vi.hoisted(() => ({
  getPublicPage: vi.fn(),
  renderServiceOgPng: vi.fn(),
}));

vi.mock("../../server/services/mawaeedService", () => ({ getPublicPage: mocks.getPublicPage }));
vi.mock("../../server/services/servicePageOgImage", () => ({ renderServiceOgPng: mocks.renderServiceOgPng }));

import router from "../../server/routes/servicePages";

const NOW = new Date("2026-10-15T12:00:00+03:00");

const school: SeriesRecord = {
  id: "s-school",
  slug: "school-calendar-1448",
  kind: "school_holiday",
  titleAr: "التقويم الدراسي 1448",
  summaryAr: "ملخص",
  sortOrder: 1,
  published: true,
  contentUpdatedAt: "2026-09-27T00:00:00.000+03:00",
};

function row(id: string, titleAr: string, startsOn: string, regionGroup: OccurrenceRecord["regionGroup"]): OccurrenceRecord {
  return {
    id,
    seriesId: school.id,
    titleAr,
    startsOn,
    endsOn: null,
    sourceUrl: "https://moe.gov.sa",
    sourceTitle: "وزارة التعليم",
    certainty: "confirmed",
    status: "scheduled",
    published: true,
    regionGroup,
    hijriLabel: null,
    publicNote: null,
    ruleNote: null,
  };
}

const occurrences = [
  row("riyadh", "الإجازة الإضافية (الرياض)", "2026-10-25", "riyadh_most"),
  row("autumn", "إجازة الخريف", "2026-11-20", "all"),
];

const app = express();
app.use(router);
const server = createServer(app);
let base = "";

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  mocks.getPublicPage.mockReset();
  mocks.renderServiceOgPng.mockReset();
  mocks.getPublicPage.mockImplementation(async (slug: string, region: string | null) => {
    const presented = presentMawaeed({ pageSlug: slug, region, now: NOW, series: [school], occurrences });
    return presented.notFound ? null : presented.view;
  });
  mocks.renderServiceOgPng.mockResolvedValue(Buffer.from("png"));
});

describe("service pages API region", () => {
  it("passes the region through JSON, calendar and share image", async () => {
    const json = await (await fetch(`${base}/api/service-pages/school-calendar-date?region=makkah`)).json();
    expect(mocks.getPublicPage).toHaveBeenCalledWith("school-calendar-1448", "makkah");
    expect(json.region).toBe("makkah");
    expect(json.next.startsOn).toBe("2026-11-20");

    const ics = await fetch(`${base}/api/service-pages/school-calendar-date/calendar.ics?region=makkah`);
    expect(ics.headers.get("content-disposition")).toContain("school-calendar-date-makkah.ics");
    const body = await ics.text();
    expect(body).not.toContain("DTSTART;VALUE=DATE:20261025");

    await fetch(`${base}/api/service-pages/school-calendar-date/og.png?region=makkah`);
    expect(mocks.renderServiceOgPng).toHaveBeenCalledWith(expect.objectContaining({ gregorianLabel: expect.stringContaining("20") }));
    expect(mocks.renderServiceOgPng.mock.calls[0][0].gregorianLabel).toContain("نوفمبر");
  });

  it("defaults to Riyadh without a region and for pages that do not vary by region", async () => {
    const json = await (await fetch(`${base}/api/service-pages/school-calendar-date`)).json();
    expect(json.region).toBe("riyadh");
    expect(json.next.startsOn).toBe("2026-10-25");
    await fetch(`${base}/api/service-pages/school-calendar-date?region=../../etc`);
    expect(mocks.getPublicPage).toHaveBeenLastCalledWith("school-calendar-1448", "riyadh");
  });
});
