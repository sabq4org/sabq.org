import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const SOURCE_BUCKET = "sabq-news-images";
export const DESTINATION_BUCKET = "sabq-private-documents";
export const MAX_REFERENCES = 10_000;
export const MAX_OBJECT_BYTES = 25 * 1024 * 1024;

const PREFIXES = [
  ["double-private-official-letters", ".private/.private/official-letters/"],
  ["correspondent-docs", ".private/correspondent-docs/"],
  ["opinion-author-docs", ".private/opinion-author-docs/"],
  ["staff-docs", ".private/staff-docs/"],
  ["official-letters", ".private/official-letters/"],
  ["reporter-media-licenses", ".private/reporter-media-licenses/"],
  ["writer-media-licenses", ".private/writer-media-licenses/"],
];

export const REFERENCES_SQL = `
  SELECT source, object_key FROM (
    SELECT 'users.media_license_file_key' AS source, media_license_file_key AS object_key FROM users
    UNION ALL SELECT 'correspondent_applications.license_file_key', license_file_key FROM correspondent_applications
    UNION ALL SELECT 'correspondent_applications.cv_file_key', cv_file_key FROM correspondent_applications
    UNION ALL SELECT 'opinion_author_applications.license_file_key', license_file_key FROM opinion_author_applications
    UNION ALL SELECT 'staff_profiles.cv_file_key', cv_file_key FROM staff_profiles
    UNION ALL SELECT 'staff_profiles.national_id_file_key', national_id_file_key FROM staff_profiles
    UNION ALL SELECT 'staff_profiles.contract_file_key', contract_file_key FROM staff_profiles
    UNION ALL SELECT 'staff_profiles.media_license_file_key', media_license_file_key FROM staff_profiles
    UNION ALL SELECT 'official_letters.file_key', file_key FROM official_letters
  ) refs
  WHERE object_key IS NOT NULL AND btrim(object_key) <> ''
  ORDER BY source, object_key
  LIMIT $1
`;

export class MigrationError extends Error {
  constructor(code, rowIndex) {
    super(code);
    this.name = "MigrationError";
    this.code = code;
    this.rowIndex = rowIndex;
  }
}

export function classifyKey(key) {
  if (typeof key !== "string" || !key || key.trim() !== key) {
    throw new MigrationError("INVALID_KEY");
  }
  if (/[\u0000-\u001f\u007f?#\\%]/u.test(key) || key.startsWith("/") || key.endsWith("/")) {
    throw new MigrationError("INVALID_KEY");
  }
  const segments = key.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.trim() !== segment)) {
    throw new MigrationError("INVALID_KEY");
  }
  for (const [category, prefix] of PREFIXES) {
    if (key.startsWith(prefix) && key.length > prefix.length) return category;
  }
  throw new MigrationError("UNALLOWLISTED_KEY");
}

async function readReferences(db) {
  const client = await db.connect();
  let inTransaction = false;
  try {
    await client.query("BEGIN READ ONLY");
    inTransaction = true;
    await client.query("SET LOCAL statement_timeout = '30s'");
    const result = await client.query(REFERENCES_SQL, [MAX_REFERENCES + 1]);
    if (result.rows.length > MAX_REFERENCES) throw new MigrationError("REFERENCE_LIMIT_EXCEEDED");
    return result.rows.map((row, index) => {
      try {
        return { source: row.source, key: row.object_key, category: classifyKey(row.object_key) };
      } catch (error) {
        if (error instanceof MigrationError) throw new MigrationError(error.code, index + 1);
        throw error;
      }
    });
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    throw new MigrationError("DATABASE_READ_FAILED");
  } finally {
    if (inTransaction) {
      try { await client.query("ROLLBACK"); } catch { /* read-only transaction cleanup */ }
    }
    client.release();
  }
}

function canonicalManifest(entries) {
  return entries
    .map(({ key, etag, size }) => `${key}\t${etag}\t${size}`)
    .sort((a, b) => a.localeCompare(b, "en"))
    .join("\n");
}

export function manifestDigest(entries) {
  return createHash("sha256").update(canonicalManifest(entries)).digest("hex");
}

function metadataSize(metadata) {
  const size = Number(metadata?.ContentLength);
  if (!Number.isSafeInteger(size) || size < 0) throw new MigrationError("SOURCE_METADATA_INVALID");
  if (size > MAX_OBJECT_BYTES) throw new MigrationError("OBJECT_SIZE_LIMIT_EXCEEDED");
  return size;
}

async function inventory({ db, source }) {
  const refs = await readReferences(db);
  const byKey = new Map();
  for (const ref of refs) {
    const current = byKey.get(ref.key) || { key: ref.key, category: ref.category, references: 0 };
    current.references += 1;
    byKey.set(ref.key, current);
  }
  const objects = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key, "en"));
  const entries = [];
  for (let i = 0; i < objects.length; i += 1) {
    try {
      const head = await source.head(objects[i].key);
      const size = metadataSize(head);
      const etag = head?.ETag;
      if (typeof etag !== "string" || !etag) throw new MigrationError("SOURCE_METADATA_INVALID", i + 1);
      entries.push({ ...objects[i], size, etag, contentType: head.ContentType || "application/octet-stream" });
    } catch (error) {
      if (error instanceof MigrationError) {
        if (error.rowIndex) throw error;
        throw new MigrationError(error.code, i + 1);
      }
      throw new MigrationError("SOURCE_HEAD_FAILED", i + 1);
    }
  }
  return { refs, entries };
}

function summarize(refs, entries) {
  const byCategory = {};
  for (const { category } of entries) byCategory[category] = (byCategory[category] || 0) + 1;
  const bySource = {};
  for (const { source } of refs) bySource[source] = (bySource[source] || 0) + 1;
  return {
    references: refs.length,
    objects: entries.length,
    bytes: entries.reduce((sum, item) => sum + item.size, 0),
    categories: byCategory,
    referenceColumns: bySource,
    manifest: manifestDigest(entries),
  };
}

async function objectBytes(response, expectedSize) {
  let body = response?.Body;
  if (body && typeof body[Symbol.asyncIterator] === "function") {
    const chunks = [];
    let size = 0;
    for await (const chunk of body) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_OBJECT_BYTES || size > expectedSize) throw new MigrationError("OBJECT_SIZE_LIMIT_EXCEEDED");
      chunks.push(bytes);
    }
    return Buffer.concat(chunks, size);
  }
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    const bytes = Buffer.from(body);
    if (bytes.length > MAX_OBJECT_BYTES) throw new MigrationError("OBJECT_SIZE_LIMIT_EXCEEDED");
    return bytes;
  }
  throw new MigrationError("OBJECT_BODY_INVALID");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readAndHash(storage, key, etag, expectedSize, side) {
  try {
    const response = await storage.get(key, etag);
    const bytes = await objectBytes(response, expectedSize);
    if (bytes.length !== expectedSize) throw new MigrationError("OBJECT_SIZE_MISMATCH");
    return { bytes, digest: sha256(bytes), contentType: response.ContentType };
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    throw new MigrationError(`${side}_GET_FAILED`);
  }
}

async function compareDestination(entry, sourceDigest, destination) {
  let head;
  try {
    head = await destination.head(entry.key);
  } catch {
    throw new MigrationError("DESTINATION_OBJECT_MISSING");
  }
  const destinationSize = Number(head?.ContentLength);
  if (!Number.isSafeInteger(destinationSize) || destinationSize !== entry.size) {
    throw new MigrationError("DESTINATION_MISMATCH");
  }
  const dest = await readAndHash(destination, entry.key, undefined, entry.size, "DESTINATION");
  if (dest.digest !== sourceDigest) throw new MigrationError("DESTINATION_MISMATCH");
}

async function copyEntries(entries, { source, destination }) {
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    try {
      let sourceObject;
      try {
        sourceObject = await readAndHash(source, entry.key, entry.etag, entry.size, "SOURCE");
      } catch (error) {
        if (error instanceof MigrationError && error.code === "SOURCE_GET_FAILED") {
          try {
            const current = await source.head(entry.key);
            if (current.ETag !== entry.etag || metadataSize(current) !== entry.size) {
              throw new MigrationError("SOURCE_CHANGED_DURING_COPY");
            }
          } catch (headError) {
            if (headError instanceof MigrationError && headError.code === "SOURCE_CHANGED_DURING_COPY") throw headError;
          }
        }
        throw error;
      }
      let created = false;
      try {
        await destination.putIfAbsent(entry.key, sourceObject.bytes, {
          contentType: entry.contentType,
          cacheControl: "private, no-store",
        });
        created = true;
      } catch {
        // A failed conditional put may mean the key already exists; inspect it below.
      }
      await compareDestination(entry, sourceObject.digest, destination);
      const after = await source.head(entry.key);
      if (after.ETag !== entry.etag || metadataSize(after) !== entry.size) {
        throw new MigrationError("SOURCE_CHANGED_DURING_COPY");
      }
      entry.copied = created;
    } catch (error) {
      if (error instanceof MigrationError) throw new MigrationError(error.code, i + 1);
      throw new MigrationError("COPY_FAILED", i + 1);
    }
  }
}

async function verifyEntries(entries, { source, destination }) {
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    try {
      const from = await readAndHash(source, entry.key, entry.etag, entry.size, "SOURCE");
      await compareDestination(entry, from.digest, destination);
      const after = await source.head(entry.key);
      if (after.ETag !== entry.etag || metadataSize(after) !== entry.size) {
        throw new MigrationError("SOURCE_CHANGED_DURING_VERIFY");
      }
    } catch (error) {
      if (error instanceof MigrationError) throw new MigrationError(error.code, i + 1);
      throw new MigrationError("VERIFY_FAILED", i + 1);
    }
  }
}

export async function runMigration({ mode = "audit", db, source, destination, expectedManifest }) {
  if (!["audit", "copy", "verify"].includes(mode)) throw new MigrationError("INVALID_MODE");
  if (!db || !source || (mode !== "audit" && !destination)) throw new MigrationError("DEPENDENCY_MISSING");
  const first = await inventory({ db, source });
  const digest = manifestDigest(first.entries);
  if (mode === "copy") {
    if (!expectedManifest || digest !== expectedManifest) throw new MigrationError("MANIFEST_MISMATCH");
    await copyEntries(first.entries, { source, destination });
    const after = await inventory({ db, source });
    if (manifestDigest(after.entries) !== digest) throw new MigrationError("REFERENCES_CHANGED_AFTER_COPY");
  } else if (mode === "verify") {
    if (!expectedManifest || digest !== expectedManifest) throw new MigrationError("MANIFEST_MISMATCH");
    await verifyEntries(first.entries, { source, destination });
    const after = await inventory({ db, source });
    if (manifestDigest(after.entries) !== digest) throw new MigrationError("REFERENCES_CHANGED_DURING_VERIFY");
  }
  return { ...summarize(first.refs, first.entries), mode };
}

function envValue(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new MigrationError("CONFIGURATION_MISSING");
  return value;
}

export function resolveMigrationDatabaseUrl(env = process.env) {
  return env.NEON_DATABASE_URL || env.DATABASE_URL;
}

function parseArgs(argv) {
  let mode = "audit";
  let expectedManifest;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--copy" && mode === "audit") mode = "copy";
    else if (argv[i] === "--verify" && mode === "audit") mode = "verify";
    else if (argv[i] === "--expected-manifest" && argv[i + 1]) expectedManifest = argv[++i];
    else throw new MigrationError("INVALID_ARGUMENTS");
  }
  if (expectedManifest && !/^[a-f0-9]{64}$/u.test(expectedManifest)) throw new MigrationError("INVALID_MANIFEST");
  if (mode !== "audit" && !expectedManifest) throw new MigrationError("EXPECTED_MANIFEST_REQUIRED");
  return { mode, expectedManifest };
}

function createS3Adapter(client, commands, bucket) {
  const send = (command) => client.send(command, { abortSignal: AbortSignal.timeout(30_000) });
  return {
    head: (key) => send(new commands.HeadObjectCommand({ Bucket: bucket, Key: key })),
    get: (key, etag) => send(new commands.GetObjectCommand({ Bucket: bucket, Key: key, ...(etag ? { IfMatch: etag } : {}) })),
    async putIfAbsent(key, body, options) {
      await send(new commands.PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
        CacheControl: options.cacheControl,
        IfNoneMatch: "*",
      }));
    },
  };
}

async function runCli(argv, env = process.env) {
  const { mode, expectedManifest } = parseArgs(argv);
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const { Pool } = require("pg");
  const commands = require("@aws-sdk/client-s3");
  const databaseUrl = resolveMigrationDatabaseUrl(env);
  if (!databaseUrl) throw new MigrationError("CONFIGURATION_MISSING");
  const accountId = envValue(env, "NEWS_IMAGES_R2_ACCOUNT_ID");
  const sourceCredentials = {
    accessKeyId: envValue(env, "NEWS_IMAGES_R2_ACCESS_KEY_ID"),
    secretAccessKey: envValue(env, "NEWS_IMAGES_R2_SECRET_ACCESS_KEY"),
  };
  const sourceBucket = envValue(env, "NEWS_IMAGES_R2_BUCKET_NAME");
  if (sourceBucket !== SOURCE_BUCKET) throw new MigrationError("SOURCE_BUCKET_NOT_ALLOWED");
  const destinationCredentials = mode === "audit" ? undefined : {
    accessKeyId: envValue(env, "MIGRATION_R2_ACCESS_KEY_ID"),
    secretAccessKey: envValue(env, "MIGRATION_R2_SECRET_ACCESS_KEY"),
  };
  const db = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
    query_timeout: 30_000,
  });
  // pg pool errors can contain connection details; consume them without serialization.
  db.on("error", () => {});
  db.on("connect", (client) => client.on("error", () => {}));
  const sourceClient = new commands.S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: sourceCredentials,
  });
  let destinationClient;
  try {
    const source = createS3Adapter(sourceClient, commands, SOURCE_BUCKET);
    let destination;
    if (mode !== "audit") {
      destinationClient = new commands.S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: destinationCredentials,
      });
      destination = createS3Adapter(destinationClient, commands, DESTINATION_BUCKET);
    }
    const result = await runMigration({ mode, db, source, destination, expectedManifest });
    console.log(JSON.stringify(result));
  } finally {
    await db.end().catch(() => {});
    sourceClient.destroy();
    destinationClient?.destroy();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch((error) => {
    const code = error instanceof MigrationError ? error.code : "UNEXPECTED_FAILURE";
    const row = error instanceof MigrationError && error.rowIndex ? ` row=${error.rowIndex}` : "";
    console.error(`PRIVATE_MIGRATION_ERROR ${code}${row}`);
    process.exitCode = 1;
  });
}
