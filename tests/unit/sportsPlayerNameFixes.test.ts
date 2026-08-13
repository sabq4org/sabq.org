/**
 * تصحيح خلط «عبدالعزيز الضويحي» (الحزم) بـ«عبدالعزيز البيشي» (الاتحاد).
 */
import { describe, expect, it } from "vitest";
import {
  AL_HAZEM_TEAM_ID,
  PLAYER_AR_AL_BISHI,
  PLAYER_AR_AL_DWEHE,
  correctSportsPlayerName,
  resolveTsEventPlayerName,
} from "../../server/services/sportsPlayerNameFixes";

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
