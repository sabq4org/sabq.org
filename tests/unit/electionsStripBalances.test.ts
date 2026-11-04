import { describe, expect, it } from "vitest";
import { parseElectionBalances as spa } from "../../client/src/components/ElectionsLiveStrip";
import { parseElectionBalances as ssr } from "../../web-next/components/ElectionsLiveStrip";

const balance = (d: unknown, r: unknown) => ({ balance: { D: { seats: d }, R: { seats: r } } });
const live = (senate = balance(45, 36), house = balance(101, 55)) => ({ demo: false, fetchedAt: new Date().toISOString(), offices: { senate, house } });

for (const [name, parse] of [["SPA", spa], ["SSR", ssr]] as const) {
  describe(`${name} election strip`, () => {
    it("reads both chambers independently and preserves real zero seats", () => {
      expect(parse(live())).toEqual({ senate: { d: 45, r: 36 }, house: { d: 101, r: 55 } });
      expect(parse(live(balance(0, 0)))).toEqual({ senate: { d: 0, r: 0 }, house: { d: 101, r: 55 } });
    });
    it("does not present demo or missing data as live results", () => {
      for (const data of [null, undefined, {}, { ...live(), demo: true }, { offices: live().offices }]) {
        expect(parse(data)).toEqual({ senate: null, house: null });
      }
    });
    it("rejects nonnumeric, nonfinite, negative, fractional, or impossible totals", () => {
      for (const [d, r] of [["45", 36], [NaN, 36], [Infinity, 0], [-1, 36], [45.5, 36], [51, 50], [0, null]]) {
        expect(parse(live(balance(d, r)))).toEqual({ senate: null, house: { d: 101, r: 55 } });
      }
      expect(parse(live(undefined, balance(218, 218)))).toEqual({ senate: { d: 45, r: 36 }, house: null });
    });
    it("rejects old, missing, invalid, or implausibly future timestamps", () => {
      const now = Date.now();
      for (const fetchedAt of [undefined, "invalid", new Date(now - 900001).toISOString(), new Date(now + 300001).toISOString()]) {
        expect(parse({ ...live(), fetchedAt }, now)).toEqual({ senate: null, house: null });
      }
      expect(parse({ ...live(), fetchedAt: new Date(now - 900000).toISOString() }, now).senate).toEqual({ d: 45, r: 36 });
    });
    it("keeps the valid chamber when the other is unavailable", () => {
      expect(parse({ ...live(), offices: { house: balance(218, 200) } })).toEqual({ senate: null, house: { d: 218, r: 200 } });
    });
  });
}
