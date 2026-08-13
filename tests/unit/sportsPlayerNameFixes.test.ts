/**
 * تصحيح خلط «عبدالعزيز الضويحي» (الحزم) بـ«عبدالعزيز البيشي» (الاتحاد)،
 * وتعريب «همام الهمامي» (الشباب) الذي شوّهه التباس حرف H (حادثتا 2026-08-13).
 */
import { describe, expect, it } from "vitest";
import {
  AL_HAZEM_TEAM_ID,
  PLAYER_AR_AL_BISHI,
  PLAYER_AR_AL_DWEHE,
  PLAYER_AR_AL_HAMAMI,
  correctSportsPlayerName,
  resolveTsEventPlayerName,
} from "../../server/services/sportsPlayerNameFixes";
import { SPL_PLAYER_AR } from "../../server/services/saudiLeagueNames";

const ITTIHAD_TEAM_ID = 2938;

describe("correctSportsPlayerName — الضويحي ≠ البيشي", () => {
  it.each([
    "Abdulaziz Al-Dwehe",
    "Abdulaziz Al Dwehe",
    "Abdulaziz Al-Dhuwayhi",
    "Abdulaziz Aldhuwayhi",
    "A. Al-Dwehe",
    "Abdul Aziz Al-Dhuwayhi",
  ])("يعرّب %s إلى عبدالعزيز الضويحي", (source) => {
    expect(correctSportsPlayerName(source, PLAYER_AR_AL_BISHI)).toBe(PLAYER_AR_AL_DWEHE);
  });

  it("لا يبقي تعريبًا آليًا خاطئًا من الكاش عندما المصدر ضويحي", () => {
    expect(correctSportsPlayerName("Abdulaziz Al-Dwehe", "عبدالعزيز البيشي")).toBe(
      PLAYER_AR_AL_DWEHE,
    );
  });

  it("يبقي عبدالعزيز البيشي عندما المصدر لاتيني صريح", () => {
    expect(correctSportsPlayerName("Abdulaziz Al-Bishi", PLAYER_AR_AL_BISHI)).toBe(
      PLAYER_AR_AL_BISHI,
    );
    expect(correctSportsPlayerName("Abdulaziz Al-Bishi", PLAYER_AR_AL_BISHI, {
      teamId: ITTIHAD_TEAM_ID,
    })).toBe(PLAYER_AR_AL_BISHI);
  });

  it("على الحزم: الاسم العربي البيشي بلا لقب لاتيني bishi = الضويحي", () => {
    expect(
      correctSportsPlayerName("عبدالعزيز البيشي", "عبدالعزيز البيشي", {
        teamId: AL_HAZEM_TEAM_ID,
      }),
    ).toBe(PLAYER_AR_AL_DWEHE);
    expect(
      correctSportsPlayerName(null, "عبدالعزيز البيشي", { teamId: AL_HAZEM_TEAM_ID }),
    ).toBe(PLAYER_AR_AL_DWEHE);
  });

  it("على الاتحاد: البيشي يبقى البيشي", () => {
    expect(
      correctSportsPlayerName("عبدالعزيز البيشي", "عبدالعزيز البيشي", {
        teamId: ITTIHAD_TEAM_ID,
      }),
    ).toBe(PLAYER_AR_AL_BISHI);
  });

  it("يفضّل التصحيح التحريري على name_aa من TheSports", () => {
    expect(
      resolveTsEventPlayerName(
        "Abdulaziz Al-Dhuwayhi",
        PLAYER_AR_AL_BISHI,
        PLAYER_AR_AL_BISHI,
        AL_HAZEM_TEAM_ID,
      ),
    ).toBe(PLAYER_AR_AL_DWEHE);
  });
});

describe("correctSportsPlayerName — همام الهمامي (التباس H هاء/حاء)", () => {
  it.each([
    "Hamam Al-Hamami",
    "Hamam Al Hamami",
    "Hammam Al-Hamami",
    "H. Al-Hamami",
    "H. Al Hamami",
  ])("يعرّب %s إلى همام الهمامي", (source) => {
    expect(correctSportsPlayerName(source, null)).toBe(PLAYER_AR_AL_HAMAMI);
  });

  it("يصحّح التعريب الخاطئ المكاش «ح. الحمامي» عندما المصدر لاتيني", () => {
    expect(correctSportsPlayerName("H. Al-Hamami", "ح. الحمامي")).toBe(PLAYER_AR_AL_HAMAMI);
  });

  it("يصحّح صيغة «حمام الحمامي» القادمة من name_aa بلا مصدر لاتيني", () => {
    expect(correctSportsPlayerName(null, "حمام الحمامي")).toBe(PLAYER_AR_AL_HAMAMI);
    expect(correctSportsPlayerName("حمام الحمامي", "حمام الحمامي")).toBe(PLAYER_AR_AL_HAMAMI);
  });

  it("لا يمسّ لاعبًا تونسيًا لقبه Hammami بلا أداة التعريف", () => {
    expect(correctSportsPlayerName("H. Hammami", "ح. حمامي")).toBe("ح. حمامي");
  });

  it("عبر مسار أحداث TheSports يتقدّم على name_aa", () => {
    expect(
      resolveTsEventPlayerName("H. Al-Hamami", "حمام الحمامي", "ح. الحمامي", 2940),
    ).toBe(PLAYER_AR_AL_HAMAMI);
  });
});

describe("SPL_PLAYER_AR — تغطية هويتَي الهمامي المزدوجتين وأسماء افتتاح روشن", () => {
  it("معرّفا الهمامي (التشكيلة والأحداث) يعيدان الاسم المعتمد نفسه", () => {
    expect(SPL_PLAYER_AR[463864]).toBe(PLAYER_AR_AL_HAMAMI);
    expect(SPL_PLAYER_AR[543065]).toBe(PLAYER_AR_AL_HAMAMI);
  });

  it("أحمد الكسار ومامادو باري مثبتان بالمعرّف", () => {
    expect(SPL_PLAYER_AR[44449]).toBe("أحمد الكسار");
    expect(SPL_PLAYER_AR[465786]).toBe("مامادو باري");
  });
});
