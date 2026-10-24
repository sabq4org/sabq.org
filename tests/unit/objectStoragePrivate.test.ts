import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const aws = vi.hoisted(() => ({ clients: [] as Array<{ config: unknown }>, sends: [] as unknown[], signed: [] as unknown[] }));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(public config: unknown) { aws.clients.push({ config }); }
    async send(command: unknown) { aws.sends.push(command); return {}; }
  },
  PutObjectCommand: class { constructor(public input: Record<string, unknown>) {} },
  GetObjectCommand: class { constructor(public input: Record<string, unknown>) {} },
  HeadObjectCommand: class { constructor(public input: Record<string, unknown>) {} },
  DeleteObjectCommand: class { constructor(public input: Record<string, unknown>) {} },
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async (client: { config: unknown }, command: { input: Record<string, unknown> }, options: unknown) => {
    aws.signed.push({ config: client.config, input: command.input, options });
    return `https://signed.example/${command.input.Bucket}`;
  }),
}));

let storageModule: typeof import("../../server/objectStorage");

const envNames = [
  "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME",
  "NEWS_IMAGES_R2_ACCOUNT_ID", "NEWS_IMAGES_R2_ACCESS_KEY_ID",
  "NEWS_IMAGES_R2_SECRET_ACCESS_KEY", "NEWS_IMAGES_R2_BUCKET_NAME",
  "NEWS_IMAGES_R2_PUBLIC_URL", "R2_PUBLIC_URL",
  "S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY",
  "STORAGE_PROVIDER", "OBJECT_STORAGE_FORCE_S3", "REPL_ID", "REPL_SLUG", "REPLIT_DEPLOYMENT",
];

function setR2Credentials() {
  vi.stubEnv("R2_ACCOUNT_ID", "private-account");
  vi.stubEnv("R2_ACCESS_KEY_ID", "private-access");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "private-secret");
  vi.stubEnv("NEWS_IMAGES_R2_ACCOUNT_ID", "public-account");
  vi.stubEnv("NEWS_IMAGES_R2_ACCESS_KEY_ID", "public-access");
  vi.stubEnv("NEWS_IMAGES_R2_SECRET_ACCESS_KEY", "public-secret");
  vi.stubEnv("NEWS_IMAGES_R2_BUCKET_NAME", "sabq-news-images");
}

beforeEach(async () => {
  vi.resetModules();
  aws.clients.length = 0;
  aws.sends.length = 0;
  aws.signed.length = 0;
  for (const name of envNames) vi.stubEnv(name, "");
  storageModule = await import("../../server/objectStorage");
});

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("private R2 object storage", () => {
  it("fails closed when the dedicated bucket is missing, even with stale S3 configured", async () => {
    setR2Credentials();
    vi.stubEnv("STORAGE_PROVIDER", "s3");
    vi.stubEnv("OBJECT_STORAGE_FORCE_S3", "1");
    vi.stubEnv("S3_ENDPOINT", "https://legacy.example");
    vi.stubEnv("S3_BUCKET", "legacy-bucket");
    vi.stubEnv("S3_ACCESS_KEY_ID", "legacy-access");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "legacy-secret");
    vi.resetModules();
    storageModule = await import("../../server/objectStorage");

    expect(storageModule.isPrivateObjectStorageConfigured()).toBe(false);
    await expect(new storageModule.ObjectStorageService().uploadPrivateDocument(
      "licenses/file.pdf", Buffer.from("private"), "application/pdf",
    )).rejects.toThrow("R2_BUCKET_NAME");
    expect(aws.sends).toHaveLength(0);
  });

  it.each(["", "   ", "sabq-news-images", " sabq-news-images ", "sabq-media"]) (
    "rejects a missing or public news bucket name (%j)", async (bucket) => {
      setR2Credentials();
      vi.stubEnv("R2_BUCKET_NAME", bucket);
      vi.resetModules();
      storageModule = await import("../../server/objectStorage");
      expect(storageModule.isPrivateObjectStorageConfigured()).toBe(false);
      await expect(new storageModule.ObjectStorageService().uploadFile(
        "licenses/file.pdf", Buffer.from("private"), "application/pdf", "private",
      )).rejects.toThrow("R2_BUCKET_NAME");
      expect(aws.sends).toHaveLength(0);
    },
  );

  it("uploads and signs private documents from the same dedicated bucket despite FORCE_S3", async () => {
    setR2Credentials();
    vi.stubEnv("R2_BUCKET_NAME", "  sabq-private-documents  ");
    vi.stubEnv("STORAGE_PROVIDER", "s3");
    vi.stubEnv("OBJECT_STORAGE_FORCE_S3", "1");
    vi.stubEnv("S3_ENDPOINT", "https://legacy.example");
    vi.stubEnv("S3_BUCKET", "legacy-bucket");
    vi.stubEnv("S3_ACCESS_KEY_ID", "legacy-access");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "legacy-secret");
    vi.resetModules();
    storageModule = await import("../../server/objectStorage");

    const service = new storageModule.ObjectStorageService();
    const uploaded = await service.uploadPrivateDocument(
      "licenses/file.pdf", Buffer.from("private"), "application/pdf",
    );
    const signedUrl = await service.getPrivateFileDownloadURL(uploaded.path, 300);

    expect(uploaded).toMatchObject({ path: ".private/licenses/file.pdf" });
    expect(aws.sends[0]).toMatchObject({ input: {
      Bucket: "sabq-private-documents", Key: ".private/licenses/file.pdf",
    } });
    expect(aws.signed[0]).toMatchObject({ input: {
      Bucket: "sabq-private-documents", Key: ".private/licenses/file.pdf",
    }, config: { credentials: {
      accessKeyId: "private-access", secretAccessKey: "private-secret",
    } } });
    expect(signedUrl).toContain("sabq-private-documents");
    expect(aws.clients[0].config).toMatchObject({ credentials: {
      accessKeyId: "private-access", secretAccessKey: "private-secret",
    } });
  });

  it("keeps public uploads and presigned PUTs on the news bucket and credentials", async () => {
    setR2Credentials();
    vi.stubEnv("R2_BUCKET_NAME", "sabq-private-documents");
    vi.stubEnv("STORAGE_PROVIDER", "r2");
    vi.stubEnv("NEWS_IMAGES_R2_PUBLIC_URL", "https://media.sabq.org/");
    vi.resetModules();
    storageModule = await import("../../server/objectStorage");
    const service = new storageModule.ObjectStorageService();

    const uploaded = await service.uploadFile("images/photo.jpg", Buffer.from("public"), "image/jpeg", "public");
    await service.getObjectEntityUploadURL();

    expect(uploaded.url).toBe("https://media.sabq.org/public/images/photo.jpg");
    expect(aws.sends[0]).toMatchObject({ input: {
      Bucket: "sabq-news-images", Key: "public/images/photo.jpg",
    } });
    expect(aws.signed[0]).toMatchObject({ input: {
      Bucket: "sabq-news-images", Key: expect.stringMatching(/^public\/uploads\//),
    } });
    expect(aws.clients[0].config).toMatchObject({ credentials: {
      accessKeyId: "public-access", secretAccessKey: "public-secret",
    } });
  });

  it("does not mix a partial generic R2 credential set with complete news credentials", async () => {
    setR2Credentials();
    vi.stubEnv("R2_ACCOUNT_ID", "partial-private-account");
    vi.stubEnv("R2_ACCESS_KEY_ID", "");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "");
    vi.stubEnv("R2_BUCKET_NAME", "sabq-private-documents");
    vi.stubEnv("STORAGE_PROVIDER", "r2");
    vi.stubEnv("S3_ENDPOINT", "https://legacy.example");
    vi.stubEnv("S3_BUCKET", "legacy-bucket");
    vi.stubEnv("S3_ACCESS_KEY_ID", "legacy-access");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "legacy-secret");
    vi.resetModules();
    storageModule = await import("../../server/objectStorage");
    const service = new storageModule.ObjectStorageService();

    await expect(service.uploadPrivateDocument(
      "licenses/file.pdf", Buffer.from("private"), "application/pdf",
    )).rejects.toThrow("Missing R2 credentials");
    const publicUpload = await service.uploadFile(
      "images/photo.jpg", Buffer.from("public"), "image/jpeg", "public",
    );
    expect(publicUpload.url).toBe("https://sabq-news-images.r2.dev/public/images/photo.jpg");
    expect(aws.sends).toHaveLength(1);
    expect(aws.sends[0]).toMatchObject({ input: { Bucket: "sabq-news-images" } });
    expect(aws.clients[0].config).toMatchObject({ credentials: {
      accessKeyId: "public-access", secretAccessKey: "public-secret",
    } });
  });

  it("keeps the legacy default public bucket public-only when no private bucket is configured", async () => {
    vi.stubEnv("R2_ACCOUNT_ID", "public-account");
    vi.stubEnv("R2_ACCESS_KEY_ID", "public-access");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "public-secret");
    vi.stubEnv("STORAGE_PROVIDER", "r2");
    vi.resetModules();
    storageModule = await import("../../server/objectStorage");
    const service = new storageModule.ObjectStorageService();

    expect(storageModule.isPrivateObjectStorageConfigured()).toBe(false);
    const uploaded = await service.uploadFile(
      "images/photo.jpg", Buffer.from("public"), "image/jpeg", "public",
    );
    expect(uploaded.url).toBe("https://sabq-media.r2.dev/public/images/photo.jpg");
    expect(aws.sends[0]).toMatchObject({ input: { Bucket: "sabq-media" } });
    await expect(service.uploadPrivateDocument(
      "licenses/file.pdf", Buffer.from("private"), "application/pdf",
    )).rejects.toThrow("R2_BUCKET_NAME");
    expect(aws.sends).toHaveLength(1);
  });

  it("uses the configured S3 bucket for private files when no R2 credentials exist", async () => {
    vi.stubEnv("STORAGE_PROVIDER", "s3");
    vi.stubEnv("S3_ENDPOINT", "https://s3.example");
    vi.stubEnv("S3_BUCKET", "private-s3-bucket");
    vi.stubEnv("S3_ACCESS_KEY_ID", "s3-access");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "s3-secret");
    vi.resetModules();
    storageModule = await import("../../server/objectStorage");
    const service = new storageModule.ObjectStorageService();

    expect(storageModule.isPrivateObjectStorageConfigured()).toBe(true);
    const uploaded = await service.uploadPrivateDocument(
      "licenses/file.pdf", Buffer.from("private"), "application/pdf",
    );
    await service.getPrivateFileDownloadURL(uploaded.path, 300);
    expect(aws.sends[0]).toMatchObject({ input: {
      Bucket: "private-s3-bucket", Key: ".private/licenses/file.pdf",
    } });
    expect(aws.signed[0]).toMatchObject({ input: {
      Bucket: "private-s3-bucket", Key: ".private/licenses/file.pdf",
    } });
  });

  it("rejects the old default public bucket when no news bucket is configured", async () => {
    vi.stubEnv("R2_ACCOUNT_ID", "private-account");
    vi.stubEnv("R2_ACCESS_KEY_ID", "private-access");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "private-secret");
    vi.stubEnv("R2_BUCKET_NAME", " sabq-media ");
    vi.stubEnv("STORAGE_PROVIDER", "r2");
    vi.resetModules();
    storageModule = await import("../../server/objectStorage");
    expect(storageModule.isPrivateObjectStorageConfigured()).toBe(false);
    await expect(new storageModule.ObjectStorageService().uploadPrivateDocument(
      "licenses/file.pdf", Buffer.from("private"), "application/pdf",
    )).rejects.toThrow("R2_BUCKET_NAME");
    expect(aws.sends).toHaveLength(0);
  });

  it("does not use an out-of-runtime GCS selection for private uploads or downloads", async () => {
    vi.stubEnv("STORAGE_PROVIDER", "gcs");
    vi.resetModules();
    storageModule = await import("../../server/objectStorage");
    const service = new storageModule.ObjectStorageService();

    expect(storageModule.isPrivateObjectStorageConfigured()).toBe(false);
    await expect(service.uploadFile(
      "licenses/file.pdf", Buffer.from("private"), "application/pdf", "private",
    )).rejects.toThrow("No usable storage backend");
    await expect(service.getPrivateFileDownloadURL(".private/licenses/file.pdf"))
      .rejects.toThrow("Private download unavailable");
  });
});
