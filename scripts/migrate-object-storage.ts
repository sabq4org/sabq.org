#!/usr/bin/env tsx
/**
 * Object Storage Migration Script
 * 
 * هذا السكريبت ينقل جميع الملفات من bucket قديم إلى bucket جديد
 * مفيد عند التحويل من Autoscale إلى Reserved VM
 * 
 * الاستخدام:
 * tsx scripts/migrate-object-storage.ts
 */

import { objectStorageClient } from "../server/objectStorage";
import * as readline from "readline";

interface MigrationConfig {
  sourceBucket: string;
  targetBucket: string;
  folders: string[];
}

// إنشاء readline interface للتفاعل مع المستخدم
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

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
): Promise<void> {
  const source = objectStorageClient.bucket(sourceBucket).file(filePath);
  const destination = objectStorageClient.bucket(targetBucket).file(filePath);

  // التحقق من وجود الملف المصدر
  const [exists] = await source.exists();
  if (!exists) {
    console.log(`⚠️  الملف غير موجود: ${filePath}`);
    return;
  }

  // نسخ الملف مع metadata
  await source.copy(destination);
  console.log(`✅ تم نسخ: ${filePath}`);
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
  let failCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      await copyFile(sourceBucket, targetBucket, file);
      successCount++;
      
      // عرض التقدم
      const progress = ((i + 1) / files.length * 100).toFixed(1);
      console.log(`📊 التقدم: ${i + 1}/${files.length} (${progress}%)`);
    } catch (error) {
      console.error(`❌ فشل نسخ ${file}:`, error);
      failCount++;
    }
  }

  console.log(`\n✅ نجح: ${successCount} ملف`);
  if (failCount > 0) {
    console.log(`❌ فشل: ${failCount} ملف`);
  }

  return successCount;
}

async function extractBucketName(path: string): Promise<string> {
  // استخراج اسم الـ bucket من المسار
  // مثال: /bucket-name/public -> bucket-name
  const match = path.match(/^\/([^\/]+)/);
  if (!match) {
    throw new Error(`مسار غير صحيح: ${path}`);
  }
  return match[1];
}

async function main() {
  console.log("=" .repeat(60));
  console.log("🚀 Object Storage Migration Tool");
  console.log("=" .repeat(60));

  // قراءة الإعدادات الحالية
  const currentPublicPath = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
  const currentPrivatePath = process.env.PRIVATE_OBJECT_DIR || "";

  console.log("\n📋 الإعدادات الحالية:");
  console.log(`   PUBLIC_OBJECT_SEARCH_PATHS: ${currentPublicPath}`);
  console.log(`   PRIVATE_OBJECT_DIR: ${currentPrivatePath}`);

  // استخراج اسم الـ bucket القديم
  let sourceBucket: string;
  try {
    sourceBucket = await extractBucketName(currentPublicPath || currentPrivatePath);
    console.log(`\n📦 Bucket المصدر (القديم): ${sourceBucket}`);
  } catch (error) {
    console.error("❌ فشل استخراج اسم bucket المصدر");
    const manualSource = await question("\nأدخل اسم bucket المصدر يدوياً: ");
    sourceBucket = manualSource.trim();
  }

  // طلب اسم الـ bucket الجديد
  console.log("\n📝 من فضلك أدخل اسم bucket الهدف (الجديد)");
  console.log("   مثال: sabq-production أو replit-objstore-xxxxx");
  const targetBucket = await question("\nاسم bucket الهدف: ");

  if (!targetBucket.trim()) {
    console.error("❌ يجب إدخال اسم bucket الهدف");
    rl.close();
    return;
  }

  // التحقق من وجود الـ buckets
  console.log("\n🔍 التحقق من الـ buckets...");
  
  try {
    const [sourceBucketExists] = await objectStorageClient.bucket(sourceBucket).exists();
    const [targetBucketExists] = await objectStorageClient.bucket(targetBucket.trim()).exists();

    if (!sourceBucketExists) {
      console.error(`❌ bucket المصدر غير موجود: ${sourceBucket}`);
      rl.close();
      return;
    }

    if (!targetBucketExists) {
      console.error(`❌ bucket الهدف غير موجود: ${targetBucket.trim()}`);
      console.log("\nيرجى إنشاء bucket جديد أولاً من:");
      console.log("   Object Storage -> Create new bucket");
      rl.close();
      return;
    }

    console.log("✅ كلا الـ buckets موجودان");

  } catch (error) {
    console.error("❌ خطأ في التحقق من الـ buckets:", error);
    rl.close();
    return;
  }

  // تأكيد العملية
  console.log("\n⚠️  تحذير: هذه العملية ستنسخ جميع الملفات من:");
  console.log(`   المصدر: ${sourceBucket}`);
  console.log(`   الهدف: ${targetBucket.trim()}`);
  console.log("\n   المجلدات: public, .private");
  
  const confirm = await question("\nهل أنت متأكد؟ (yes/no): ");

  if (confirm.toLowerCase() !== "yes" && confirm.toLowerCase() !== "y") {
    console.log("❌ تم إلغاء العملية");
    rl.close();
    return;
  }

  // بدء النقل
  console.log("\n🚀 بدء عملية النقل...");
  const startTime = Date.now();

  const config: MigrationConfig = {
    sourceBucket: sourceBucket,
    targetBucket: targetBucket.trim(),
    folders: ["public", ".private"],
  };

  let totalFiles = 0;

  for (const folder of config.folders) {
    const count = await migrateFolder(
      config.sourceBucket,
      config.targetBucket,
      folder
    );
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
  console.log(`      PUBLIC_OBJECT_SEARCH_PATHS=/${config.targetBucket}/public`);
  console.log(`      PRIVATE_OBJECT_DIR=/${config.targetBucket}/.private`);
  console.log("   2. أعد نشر التطبيق (Redeploy)");
  console.log("   3. تحقق من أن الصور تظهر بشكل صحيح");
  console.log("=".repeat(60));

  rl.close();
}

// تشغيل البرنامج
main().catch((error) => {
  console.error("\n❌ خطأ فادح:", error);
  rl.close();
  process.exit(1);
});
