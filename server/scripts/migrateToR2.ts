import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Storage } from "@google-cloud/storage";
import { Readable } from "stream";

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function migrateToR2() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const r2Bucket = process.env.R2_BUCKET_NAME || 'sabq-media';
  const gcsBucket = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  
  if (!accountId || !accessKeyId || !secretAccessKey) {
    console.error('Missing R2 credentials');
    process.exit(1);
  }
  
  if (!gcsBucket) {
    console.error('Missing GCS bucket ID (DEFAULT_OBJECT_STORAGE_BUCKET_ID)');
    process.exit(1);
  }
  
  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  
  const gcs = new Storage();
  const bucket = gcs.bucket(gcsBucket);
  
  console.log(`Migrating from GCS bucket "${gcsBucket}" to R2 bucket "${r2Bucket}"...`);
  
  const [files] = await bucket.getFiles({ prefix: 'public/' });
  console.log(`Found ${files.length} files to migrate`);
  
  let migrated = 0;
  let errors = 0;
  
  for (const file of files) {
    try {
      const [metadata] = await file.getMetadata();
      const stream = file.createReadStream();
      const buffer = await streamToBuffer(stream);
      
      await r2.send(new PutObjectCommand({
        Bucket: r2Bucket,
        Key: file.name,
        Body: buffer,
        ContentType: metadata.contentType || 'application/octet-stream',
      }));
      
      migrated++;
      if (migrated % 50 === 0) {
        console.log(`Migrated ${migrated}/${files.length} files...`);
      }
    } catch (error) {
      console.error(`Error migrating ${file.name}:`, error);
      errors++;
    }
  }
  
  console.log(`Migration complete: ${migrated} succeeded, ${errors} failed out of ${files.length} total`);
}

migrateToR2().catch(console.error);
