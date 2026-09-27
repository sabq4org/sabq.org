/**
 * قراءة ملف البذرة وتصنيف الصفوف.
 * «يحتاج تحقق» مسودة غير منشورة. «محسوب» مع «مؤكد» يُعرض بشارة «متوقع».
 */

import { classifySeed, regionGroupForSeed, seedKey, type Certainty, type RegionGroup } from "./model";

export type SeedRow = {
  section: string;
  eventNameAr: string;
  dateHijri: string;
  dateGregorian: string;
  ruleOrNote: string;
  officialSourceName: string;
  officialSourceUrl: string;
  verifiedOn: string;
  confidence: string;
  seedKey: string;
  published: boolean;
  certainty: Certainty;
  regionGroup: RegionGroup;
};

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (char !== "\r") cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.trim() !== ""));
}

export function parseSeedCsv(text: string): SeedRow[] {
  const table = parseCsv(text);
  const [header, ...body] = table;
  if (!header || header[0] !== "section") {
    throw new Error("mawaeed seed csv header missing");
  }
  return body.map((columns) => {
    const [section, eventNameAr, dateHijri, dateGregorian, ruleOrNote, officialSourceName, officialSourceUrl, verifiedOn, confidence] = columns;
    if (!section || !eventNameAr || !dateGregorian || !officialSourceUrl || !confidence) {
      throw new Error(`mawaeed seed row incomplete: ${columns.join("|")}`);
    }
    const classified = classifySeed(confidence, ruleOrNote || "");
    return {
      section: section.trim(),
      eventNameAr: eventNameAr.trim(),
      dateHijri: (dateHijri || "").trim(),
      dateGregorian: dateGregorian.trim(),
      ruleOrNote: (ruleOrNote || "").trim(),
      officialSourceName: (officialSourceName || "").trim(),
      officialSourceUrl: officialSourceUrl.trim(),
      verifiedOn: (verifiedOn || "").trim(),
      confidence: confidence.trim(),
      seedKey: seedKey(section.trim(), dateGregorian.trim(), eventNameAr.trim()),
      published: classified.published,
      certainty: classified.certainty,
      regionGroup: regionGroupForSeed(section.trim(), eventNameAr.trim()),
    };
  });
}
