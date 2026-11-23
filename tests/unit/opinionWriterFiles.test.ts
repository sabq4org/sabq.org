import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPdfContentDisposition,
  isValidPdfBuffer,
} from "../../shared/opinionWriterFiles";
import { getMeetingTimingInfo } from "../../client/src/components/meetings/meetingNoticeTiming";

describe("opinionWriterFilesService helpers", () => {
  it("accepts genuine PDF buffers and rejects non-PDF content", () => {
    expect(isValidPdfBuffer(Buffer.from("%PDF-1.7\n1 0 obj\n", "ascii"))).toBe(true);
    expect(isValidPdfBuffer(Buffer.from("", "ascii"))).toBe(false);
    expect(isValidPdfBuffer(Buffer.from("<html>not pdf</html>", "utf8"))).toBe(false);
    expect(isValidPdfBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe(false);
  });

  it("builds safe Content-Disposition for Arabic titles and strips header injection chars", () => {
    const header = buildPdfContentDisposition("محضر لقاء كتّاب الرأي\r\n/..\\2026", "abc12345-def");
    expect(header).toContain("attachment;");
    expect(header).toContain(".pdf");
    expect(header).toContain("filename*=UTF-8''");
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toContain(encodeURIComponent("محضر لقاء كتّاب الرأي .. 2026.pdf"));
  });

  it("includes additive table, index, and sabq_runtime grants in the migration SQL", () => {
    const sqlPath = path.resolve(
      import.meta.dirname,
      "../../migrations/20261123_opinion_writer_files.sql",
    );
    const sql = readFileSync(sqlPath, "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS opinion_writer_files");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE ON TABLE opinion_writer_files TO sabq_runtime");
    expect(sql).toContain("has_table_privilege('sabq_runtime', 'public.opinion_writer_files'");
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
  });
});

describe("UpcomingMeetingNotice timing helpers", () => {
  it("flags a meeting scheduled later today with a countdown badge", () => {
    const now = new Date(2026, 10, 23, 14, 0, 0).getTime();
    const meetingIso = new Date(2026, 10, 23, 19, 30, 0).toISOString();
    const info = getMeetingTimingInfo(meetingIso, now);
    expect(info.isToday).toBe(true);
    expect(info.isTomorrow).toBe(false);
    expect(info.dayBadge).toBe("اجتماع اليوم");
    expect(info.countdownLabel).toBe("يبدأ بعد 5 ساعات");
  });

  it("flags a meeting starting in 25 minutes", () => {
    const now = new Date(2026, 10, 23, 19, 5, 0).getTime();
    const meetingIso = new Date(2026, 10, 23, 19, 30, 0).toISOString();
    const info = getMeetingTimingInfo(meetingIso, now);
    expect(info.isToday).toBe(true);
    expect(info.countdownLabel).toBe("يبدأ خلال 25 دقيقة");
  });

  it("flags a meeting tomorrow without a same-day countdown", () => {
    const now = new Date(2026, 10, 23, 14, 0, 0).getTime();
    const meetingIso = new Date(2026, 10, 24, 19, 30, 0).toISOString();
    const info = getMeetingTimingInfo(meetingIso, now);
    expect(info.isToday).toBe(false);
    expect(info.isTomorrow).toBe(true);
    expect(info.dayBadge).toBe("اجتماع غداً");
    expect(info.countdownLabel).toBeNull();
  });

  it("returns neutral timing for meetings more than a day away", () => {
    const now = new Date(2026, 10, 23, 14, 0, 0).getTime();
    const meetingIso = new Date(2026, 10, 28, 19, 30, 0).toISOString();
    const info = getMeetingTimingInfo(meetingIso, now);
    expect(info.isToday).toBe(false);
    expect(info.isTomorrow).toBe(false);
    expect(info.dayBadge).toBeNull();
    expect(info.countdownLabel).toBeNull();
  });
});
