import cron from "../leaderCron";
import {
  isImageRelocationEnabled,
  processRelocationQueue,
  relocateRecentArticleImages,
} from "../services/imageRelocationService";
import { newsImageStorageService } from "../services/newsImageStorageService";

// دفعات صغيرة: كل صورة = تنزيل + توليد نسخ WebP + رفع، والمهمة تعمل على
// النسخة القائدة مع بقية الطلبات.
const QUEUE_BATCH = 6;
const ARTICLE_BATCH = 6;

async function runImageRelocation() {
  if (!isImageRelocationEnabled() || !newsImageStorageService.isR2Configured()) return;
  try {
    const recent = await relocateRecentArticleImages(ARTICLE_BATCH);
    const queue = await processRelocationQueue(QUEUE_BATCH);
    if (recent.swapped || recent.failed || queue.done || queue.failed) {
      console.log(
        `[Image Relocation] articles swapped=${recent.swapped} failed=${recent.failed} | queue done=${queue.done} failed=${queue.failed}`,
      );
    }
  } catch (error) {
    console.error("[Image Relocation] run failed:", error);
  }
}

export function startImageRelocationJob() {
  cron.schedule("*/2 * * * *", runImageRelocation);
  console.log("[Image Relocation] job started (every 2 minutes, leader only)");
}
