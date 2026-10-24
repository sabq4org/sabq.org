import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// db وهمي: كل select يُرجع الدفعة التالية من الطابور، ويُسجَّل شرط where
// لنتحقق من الأرقام المرسلة فعلًا إلى SQL.
const selectQueue: unknown[][] = [];
const whereParams: unknown[][] = [];
const updates: Record<string, unknown>[] = [];
const dialect = new PgDialect();

function selectChain() {
  const rows = selectQueue.shift() ?? [];
  const chain = {
    from: () => chain,
    where: (cond: any) => {
      whereParams.push(dialect.sqlToQuery(cond).params);
      return chain;
    },
    limit: async () => rows,
  };
  return chain;
}

vi.mock("../../server/db", () => ({
  db: {
    select: () => selectChain(),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return {
          where: () => ({ returning: async () => [{ id: "staff-1", ...values }] }),
        };
      },
    }),
  },
}));

import { findAndBackfillStaffByAlternatePhone } from "../../server/services/phoneAuth";

beforeEach(() => {
  selectQueue.length = 0;
  whereParams.length = 0;
  updates.length = 0;
});

describe("findAndBackfillStaffByAlternatePhone", () => {
  it("matches alternate phone sources by the full number, never by the last 9 digits", async () => {
    selectQueue.push([], [], []);
    const result = await findAndBackfillStaffByAlternatePhone("+1202564255999");

    expect(result).toBeNull();
    expect(whereParams).toHaveLength(3);
    for (const params of whereParams) {
      expect(params).not.toContain("564255999");
      expect(params).not.toContain("0564255999");
      expect(params).toContain("1202564255999");
    }
  });

  it("does not replace a staff account's different existing phone", async () => {
    selectQueue.push(
      [{ createdUserId: "staff-1", phone: "+966564255999" }],
      [{ id: "staff-1", status: "active", phoneNumber: "+966500000001", phoneVerified: true }],
    );
    const result = await findAndBackfillStaffByAlternatePhone("+966564255999");

    expect(result).toBeNull();
    expect(updates).toHaveLength(0);
  });

  it("backfills the verified phone onto a staff account that has none", async () => {
    selectQueue.push(
      [{ createdUserId: "staff-1", phone: "0564255999" }],
      [{ id: "staff-1", status: "active", phoneNumber: null, phoneVerified: false }],
    );
    const result = await findAndBackfillStaffByAlternatePhone("+966564255999");

    expect(updates).toEqual([{ phoneNumber: "+966564255999", phoneVerified: true }]);
    expect(result).toMatchObject({ id: "staff-1", phoneNumber: "+966564255999" });
  });
});
