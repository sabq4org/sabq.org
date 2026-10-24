import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  manifestDigest,
  MAX_OBJECT_BYTES,
  resolveMigrationDatabaseUrl,
  runMigration,
} from "../../scripts/private-document-migration.mjs";

function makeDb(rowsOrFactory: any) {
  const statements: string[] = [];
  let selectCount = 0;
  const client = {
    async query(sql: string) {
      statements.push(sql);
      if (sql.includes("SELECT source, object_key")) {
        const rows = typeof rowsOrFactory === "function" ? rowsOrFactory(selectCount++) : rowsOrFactory;
        return { rows };
      }
      return { rows: [] };
    },
    release() {},
  };
  return { db: { async connect() { return client; } }, statements };
}

function makeStore(initial: Record<string, Buffer> = {}) {
  const objects = new Map(Object.entries(initial).map(([key, body]) => [key, {
    body,
    etag: etagFor(body),
    contentType: "application/pdf",
  }]));
  const calls: any[] = [];
  return {
    calls,
    objects,
    async head(key: string) {
      calls.push(["head", key]);
      const value = objects.get(key);
      if (!value) throw new Error("missing");
      return { ContentLength: value.body.length, ETag: value.etag, ContentType: value.contentType };
    },
    async get(key: string, etag?: string) {
      calls.push(["get", key, etag]);
      const value = objects.get(key);
      if (!value || (etag && value.etag !== etag)) throw new Error("missing or changed");
      return { Body: value.body, ContentType: value.contentType };
    },
    async putIfAbsent(key: string, body: Buffer, options: any) {
      calls.push(["put", key, options]);
      if (objects.has(key)) throw new Error("exists");
      objects.set(key, { body: Buffer.from(body), etag: etagFor(body), contentType: options.contentType });
    },
  };
}

function etagFor(body: Buffer) {
  return `"${createHash("sha256").update(body).digest("hex")}"`;
}

describe("private document migration", () => {
  it("prefers the app's NEON_DATABASE_URL and falls back to DATABASE_URL", () => {
    expect(resolveMigrationDatabaseUrl({ NEON_DATABASE_URL: "neon", DATABASE_URL: "fallback" })).toBe("neon");
    expect(resolveMigrationDatabaseUrl({ DATABASE_URL: "fallback" })).toBe("fallback");
    expect(resolveMigrationDatabaseUrl({})).toBeUndefined();
  });

  it("audits all referenced source objects read-only and preserves repeated prefixes literally", async () => {
    const rows = [
      { source: "users.media_license_file_key", object_key: ".private/reporter-media-licenses/u/1.pdf" },
      { source: "official_letters.file_key", object_key: ".private/.private/official-letters/SBQ-1.pdf" },
    ];
    const { db, statements } = makeDb(rows);
    const source = makeStore({
      ".private/reporter-media-licenses/u/1.pdf": Buffer.from("license"),
      ".private/.private/official-letters/SBQ-1.pdf": Buffer.from("letter"),
    });
    const result = await runMigration({ mode: "audit", db, source });

    expect(result.objects).toBe(2);
    expect(result.references).toBe(2);
    expect(result.categories["double-private-official-letters"]).toBe(1);
    expect(result.manifest).toMatch(/^[a-f0-9]{64}$/);
    expect(source.calls.filter(([kind]) => kind === "head")).toHaveLength(2);
    expect(source.calls.some(([kind]) => kind === "get" || kind === "put")).toBe(false);
    expect(statements[0]).toBe("BEGIN READ ONLY");
    expect(statements[1]).toContain("statement_timeout");
    expect(statements.at(-1)).toBe("ROLLBACK");
  });

  it("rejects public uploads and unsafe keys before touching source storage", async () => {
    for (const [objectKey, code] of [
      [".private/uploads/photo.jpg", "UNALLOWLISTED_KEY"],
      [".private/staff-docs/id%2Fsecret.pdf", "INVALID_KEY"],
      [".private/staff-docs/../secret.pdf", "INVALID_KEY"],
      [".private/staff-docs/id.pdf?download=1", "INVALID_KEY"],
    ]) {
      const { db } = makeDb([{ source: "x", object_key: objectKey }]);
      const source = makeStore();
      await expect(runMigration({ db, source })).rejects.toMatchObject({ code, rowIndex: 1 });
      expect(source.calls).toHaveLength(0);
    }
  });

  it("fails the full audit on a missing source object", async () => {
    const { db } = makeDb([{ source: "x", object_key: ".private/staff-docs/one.pdf" }]);
    const source = makeStore();
    await expect(runMigration({ db, source })).rejects.toMatchObject({ code: "SOURCE_HEAD_FAILED", rowIndex: 1 });
    expect(source.calls.filter(([kind]) => kind === "head")).toHaveLength(1);
  });

  it("copies only after matching the audited manifest and verifies the bytes", async () => {
    const key = ".private/correspondent-docs/cv.pdf";
    const rows = [{ source: "correspondent_applications.cv_file_key", object_key: key }];
    const { db } = makeDb(rows);
    const source = makeStore({ [key]: Buffer.from("cv-bytes") });
    const destination = makeStore();
    const entry = { key, etag: etagFor(Buffer.from("cv-bytes")), size: 8 };
    const expectedManifest = manifestDigest([entry]);
    const result = await runMigration({ mode: "copy", db, source, destination, expectedManifest });

    expect(result.mode).toBe("copy");
    expect(destination.objects.get(key)?.body.toString()).toBe("cv-bytes");
    const put = destination.calls.find(([kind]) => kind === "put");
    expect(put[2]).toMatchObject({ cacheControl: "private, no-store", contentType: "application/pdf" });
    expect(source.calls.some(([kind, objectKey, etag]) => kind === "get" && objectKey === key && etag === entry.etag)).toBe(true);
  });

  it("refuses an existing destination object with different content", async () => {
    const key = ".private/staff-docs/id-contract.pdf";
    const { db } = makeDb([{ source: "staff_profiles.contract_file_key", object_key: key }]);
    const source = makeStore({ [key]: Buffer.from("source") });
    const destination = makeStore({ [key]: Buffer.from("different") });
    const entry = { key, etag: etagFor(Buffer.from("source")), size: 6 };

    await expect(runMigration({ mode: "copy", db, source, destination, expectedManifest: manifestDigest([entry]) }))
      .rejects.toMatchObject({ code: "DESTINATION_MISMATCH", rowIndex: 1 });
    expect(destination.objects.get(key)?.body.toString()).toBe("different");
  });

  it("accepts an identical existing destination object without overwriting it", async () => {
    const key = ".private/staff-docs/id-cv.pdf";
    const body = Buffer.from("same bytes");
    const { db } = makeDb([{ source: "staff_profiles.cv_file_key", object_key: key }]);
    const source = makeStore({ [key]: body });
    const destination = makeStore({ [key]: body });
    const entry = { key, etag: etagFor(body), size: body.length };

    await runMigration({ mode: "copy", db, source, destination, expectedManifest: manifestDigest([entry]) });
    expect(destination.calls.some(([kind]) => kind === "put")).toBe(true);
    expect(destination.objects.get(key)?.body).toBe(body);
  });

  it("requires manifest agreement before any destination operation", async () => {
    const key = ".private/opinion-author-docs/license.pdf";
    const { db } = makeDb([{ source: "opinion_author_applications.license_file_key", object_key: key }]);
    const source = makeStore({ [key]: Buffer.from("license") });
    const destination = makeStore();
    await expect(runMigration({ mode: "copy", db, source, destination, expectedManifest: "0".repeat(64) }))
      .rejects.toMatchObject({ code: "MANIFEST_MISMATCH" });
    expect(destination.calls).toHaveLength(0);
  });

  it("reports reference drift after copying so the caller cannot treat the run as complete", async () => {
    const key = ".private/reporter-media-licenses/user/a.pdf";
    const added = ".private/writer-media-licenses/user/b.pdf";
    const { db } = makeDb((read) => read === 0
      ? [{ source: "users.media_license_file_key", object_key: key }]
      : [
          { source: "users.media_license_file_key", object_key: key },
          { source: "users.media_license_file_key", object_key: added },
        ]);
    const source = makeStore({ [key]: Buffer.from("a"), [added]: Buffer.from("b") });
    const destination = makeStore();
    const entry = { key, etag: etagFor(Buffer.from("a")), size: 1 };

    await expect(runMigration({ mode: "copy", db, source, destination, expectedManifest: manifestDigest([entry]) }))
      .rejects.toMatchObject({ code: "REFERENCES_CHANGED_AFTER_COPY" });
    expect(destination.objects.has(key)).toBe(true);
    expect(destination.objects.has(added)).toBe(false);
  });

  it("verify compares source and destination hashes without writing", async () => {
    const key = ".private/official-letters/SBQ-2.pdf";
    const rows = [{ source: "official_letters.file_key", object_key: key }];
    const { db } = makeDb(rows);
    const body = Buffer.from("same");
    const source = makeStore({ [key]: body });
    const destination = makeStore({ [key]: body });
    const entry = { key, etag: etagFor(body), size: body.length };
    await runMigration({ mode: "verify", db, source, destination, expectedManifest: manifestDigest([entry]) });
    expect(destination.calls.some(([kind]) => kind === "put")).toBe(false);
    expect(destination.calls.some(([kind]) => kind === "get")).toBe(true);
  });

  it("caps streamed response bodies before buffering beyond the object limit", async () => {
    const key = ".private/staff-docs/large.pdf";
    const rows = [{ source: "staff_profiles.cv_file_key", object_key: key }];
    const { db } = makeDb(rows);
    const largeBody = Buffer.alloc(MAX_OBJECT_BYTES, 1);
    const source = makeStore({ [key]: largeBody });
    const destination = makeStore();
    const entry = { key, etag: etagFor(largeBody), size: MAX_OBJECT_BYTES };
    const originalGet = source.get;
    source.get = async (objectKey: string, etag?: string) => {
      await originalGet(objectKey, etag);
      async function* body() {
        yield largeBody;
        yield Buffer.from([2]);
      }
      return { Body: body() };
    };

    await expect(runMigration({ mode: "copy", db, source, destination, expectedManifest: manifestDigest([entry]) }))
      .rejects.toMatchObject({ code: "OBJECT_SIZE_LIMIT_EXCEEDED", rowIndex: 1 });
    expect(destination.calls.some(([kind]) => kind === "put")).toBe(false);
  });

  it("stops when a source changes during the conditional GET", async () => {
    const key = ".private/staff-docs/id-license.pdf";
    const body = Buffer.from("stable");
    const { db } = makeDb([{ source: "staff_profiles.media_license_file_key", object_key: key }]);
    const source = makeStore({ [key]: body });
    const destination = makeStore();
    const entry = { key, etag: etagFor(body), size: body.length };
    source.get = async () => {
      const existing = source.objects.get(key)!;
      source.objects.set(key, { ...existing, etag: '"changed"' });
      throw new Error("If-Match failed");
    };

    await expect(runMigration({ mode: "copy", db, source, destination, expectedManifest: manifestDigest([entry]) }))
      .rejects.toMatchObject({ code: "SOURCE_CHANGED_DURING_COPY", rowIndex: 1 });
    expect(destination.calls.some(([kind]) => kind === "put")).toBe(false);
  });

  it("stops when the source changes after copy verification", async () => {
    const key = ".private/official-letters/SBQ-3.pdf";
    const body = Buffer.from("letter");
    const { db } = makeDb([{ source: "official_letters.file_key", object_key: key }]);
    const source = makeStore({ [key]: body });
    const destination = makeStore();
    const entry = { key, etag: etagFor(body), size: body.length };
    const originalHead = source.head;
    let headCount = 0;
    source.head = async (objectKey: string) => {
      const result = await originalHead(objectKey);
      headCount += 1;
      return headCount === 1 ? result : { ...result, ETag: '"changed"' };
    };

    await expect(runMigration({ mode: "copy", db, source, destination, expectedManifest: manifestDigest([entry]) }))
      .rejects.toMatchObject({ code: "SOURCE_CHANGED_DURING_COPY", rowIndex: 1 });
    expect(destination.objects.has(key)).toBe(true);
  });

  it("requires the audited manifest and checks reference drift during verification", async () => {
    const key = ".private/official-letters/SBQ-4.pdf";
    const added = ".private/staff-docs/late.pdf";
    const { db } = makeDb((read) => read === 0
      ? [{ source: "official_letters.file_key", object_key: key }]
      : [
          { source: "official_letters.file_key", object_key: key },
          { source: "staff_profiles.cv_file_key", object_key: added },
        ]);
    const source = makeStore({ [key]: Buffer.from("letter"), [added]: Buffer.from("late") });
    const destination = makeStore({ [key]: Buffer.from("letter") });
    const entry = { key, etag: etagFor(Buffer.from("letter")), size: 6 };

    await expect(runMigration({ mode: "verify", db, source, destination, expectedManifest: manifestDigest([entry]) }))
      .rejects.toMatchObject({ code: "REFERENCES_CHANGED_DURING_VERIFY" });
  });
});
