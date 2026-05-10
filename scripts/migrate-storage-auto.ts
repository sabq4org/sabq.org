#!/usr/bin/env tsx
/**
 * نسخة تلقائية من Object Storage Migration Script
 * تعمل بدون تفاعل - للتشغيل التلقائي
 */

import { objectStorageClient } from "../server/objectStorage";

async function listAllFiles(bucketName: string, prefix: string): Promise<string[]> {
  console.log(`\n🔍 جاري البحث عن الملفات في: ${bucketName}/${prefix}`);
  
  const bucket = objectStorageClient.bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix });
  
  const filePaths = files.map(file => file.name);
  console.log(`✅ تم العثور على ${filePaths.length} ملف`);
  
  return filePaths;
}

async function copyFile(
  sourceBucket: string,
  targetBucket: string,
  filePath: string
): Promise<boolean> {
  try {
    const source = objectStorageClient.bucket(sourceBucket).file(filePath);
    const destination = objectStorageClient.bucket(targetBucket).file(filePath);

    const [exists] = await source.exists();
    if (!exists) {
      console.log(`⚠️  الملف غير موجود: ${filePath}`);
      return false;
    }

    await source.copy(destination);
    console.log(`✅ تم نسخ: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`❌ فشل نسخ ${filePath}:`, error);
    return false;
  }
}

async function migrateFolder(
  sourceBucket: string,
  targetBucket: string,
  folder: string
): Promise<number> {
  console.log(`\n📁 جاري نقل المجلد: ${folder}`);
  
  const files = await listAllFiles(sourceBucket, folder);
  
  if (files.length === 0) {
    console.log(`ℹ️  لا توجد ملفات في ${folder}`);
    return 0;
  }

  let successCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const success = await copyFile(sourceBucket, targetBucket, file);
    if (success) {
      successCount++;
    }
    
    const progress = ((i + 1) / files.length * 100).toFixed(1);
    console.log(`📊 التقدم: ${i + 1}/${files.length} (${progress}%)`);
  }

  console.log(`\n✅ نجح: ${successCount} من ${files.length} ملف`);
  return successCount;
}

async function main() {
  console.log("=".repeat(60));
  console.log("🚀 Object Storage Migration - التشغيل التلقائي");
  console.log("=".repeat(60));

  // الإعدادات
  const sourceBucket = "replit-objstore-b1f39c51-f362-497c-846b-74ce14cc0e52";
  const targetBucket = "sabq-production-bucket";
  const folders = ["public", ".private"];

  console.log(`\n📦 Bucket المصدر: ${sourceBucket}`);
  console.log(`📦 Bucket الهدف: ${targetBucket}`);
  console.log(`📁 المجلدات: ${folders.join(", ")}`);

  // التحقق من وجود الـ buckets
  console.log("\n🔍 التحقق من الـ buckets...");
  
  try {
    const [sourceBucketExists] = await objectStorageClient.bucket(sourceBucket).exists();
    const [targetBucketExists] = await objectStorageClient.bucket(targetBucket).exists();

    if (!sourceBucketExists) {
      console.error(`❌ bucket المصدر غير موجود: ${sourceBucket}`);
      process.exit(1);
    }

    if (!targetBucketExists) {
      console.error(`❌ bucket الهدف غير موجود: ${targetBucket}`);
      console.log("\nيرجى إنشاء bucket جديد أولاً من:");
      console.log("   Object Storage -> Create new bucket");
      process.exit(1);
    }

    console.log("✅ كلا الـ buckets موجودان");

  } catch (error: any) {
    console.error("❌ خطأ في التحقق من الـ buckets:", error.message);
    process.exit(1);
  }

  // بدء النقل
  console.log("\n🚀 بدء عملية النقل...");
  const startTime = Date.now();

  let totalFiles = 0;

  for (const folder of folders) {
    const count = await migrateFolder(sourceBucket, targetBucket, folder);
    totalFiles += count;
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log("\n" + "=".repeat(60));
  console.log("🎉 اكتملت عملية النقل!");
  console.log("=".repeat(60));
  console.log(`✅ تم نقل ${totalFiles} ملف`);
  console.log(`⏱️  الوقت المستغرق: ${duration} ثانية`);
  console.log("\n📝 الخطوات التالية:");
  console.log("   1. حدّث المتغيرات البيئية في بيئة الإنتاج:");
  console.log(`      PUBLIC_OBJECT_SEARCH_PATHS=/${targetBucket}/public`);
  console.log(`      PRIVATE_OBJECT_DIR=/${targetBucket}/.private`);
  console.log("   2. أعد نشر التطبيق (Redeploy)");
  console.log("   3. تحقق من أن الصور تظهر بشكل صحيح");
  console.log("=".repeat(60));
}

main().catch((error) => {
  console.error("\n❌ خطأ فادح:", error);
  process.exit(1);
});
