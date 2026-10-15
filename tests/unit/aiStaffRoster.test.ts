// فريق سبق الذكي — سلامة السجل الافتراضي:
// كل موظف يشير إلى ميزات بوابة حقيقية (لا مفاتيح متخيلة)، والهويات فريدة،
// ولا يتقاسم موظفان مفتاحًا (لا عدّ مزدوجًا في المؤشرات والتكاليف).
import { describe, expect, it } from "vitest";
import {
  AI_STAFF_DEPARTMENTS,
  AI_STAFF_ROSTER,
  AI_STAFF_TRIGGER_MODES,
  staffOwnsFeatureKey,
} from "../../shared/aiStaffRoster";
import { DEFAULT_FEATURES } from "../../server/ai/gateway/defaults";

const KNOWN_FEATURE_KEYS = new Set(DEFAULT_FEATURES.map((f) => f.featureKey));

// مفاتيح تُسجَّل وقت التشغيل ولا تظهر في كتالوج defaults.ts — البوابة تقبل
// المفتاح المجهول بسلسلة النصوص القياسية (انظر getDefaultFeatureConfig):
// radar-develop يستخدمه server/services/radar/developer.ts.
const RUNTIME_ONLY_KEYS = new Set(["radar-develop"]);

describe("AI staff roster integrity", () => {
  it("has unique slugs and employee codes", () => {
    const slugs = AI_STAFF_ROSTER.map((m) => m.slug);
    const codes = AI_STAFF_ROSTER.map((m) => m.employeeCode);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("uses only known departments and trigger modes", () => {
    for (const m of AI_STAFF_ROSTER) {
      expect(AI_STAFF_DEPARTMENTS[m.departmentKey]).toBeDefined();
      expect(AI_STAFF_TRIGGER_MODES).toContain(m.triggerMode);
    }
  });

  it("references only real gateway feature keys", () => {
    for (const m of AI_STAFF_ROSTER) {
      for (const key of m.featureKeys) {
        expect(
          KNOWN_FEATURE_KEYS.has(key) || RUNTIME_ONLY_KEYS.has(key),
          `${m.slug}: unknown feature key "${key}"`,
        ).toBe(true);
      }
    }
  });

  it("never assigns one exact feature key to two members", () => {
    const seen = new Map<string, string>();
    for (const m of AI_STAFF_ROSTER) {
      for (const key of m.featureKeys) {
        expect(seen.has(key), `key "${key}" owned by both ${seen.get(key)} and ${m.slug}`).toBe(false);
        seen.set(key, m.slug);
      }
    }
  });

  it("managerSlug always points at an existing member", () => {
    const slugs = new Set(AI_STAFF_ROSTER.map((m) => m.slug));
    for (const m of AI_STAFF_ROSTER) {
      if (m.managerSlug !== null) {
        expect(slugs.has(m.managerSlug), `${m.slug}: manager "${m.managerSlug}" missing`).toBe(true);
      }
    }
  });

  it("pending members carry no gateway keys; gateway members carry at least one", () => {
    for (const m of AI_STAFF_ROSTER) {
      const keyCount = m.featureKeys.length + m.featureKeyPrefixes.length;
      if (m.metricsSource === "pending") expect(keyCount).toBe(0);
      else expect(keyCount).toBeGreaterThan(0);
    }
  });

  it("staffOwnsFeatureKey matches exact keys and prefixes only", () => {
    const qalam = AI_STAFF_ROSTER.find((m) => m.slug === "qalam")!;
    expect(staffOwnsFeatureKey(qalam, "editorial-unified-edit")).toBe(true);
    expect(staffOwnsFeatureKey(qalam, "seo-generator")).toBe(true);
    expect(staffOwnsFeatureKey(qalam, "radar")).toBe(false);

    const rased = AI_STAFF_ROSTER.find((m) => m.slug === "rased")!;
    expect(staffOwnsFeatureKey(rased, "radar")).toBe(true);
    // "radar-develop" ملك موثّق — البادئات غير مستخدمة هنا فلا يجوز التقاطها
    expect(staffOwnsFeatureKey(rased, "radar-develop")).toBe(false);
  });
});
