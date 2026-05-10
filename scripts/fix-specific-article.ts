import { generateArticleThumbnail } from "../server/services/thumbnailService";

const articleId = "83ca1401-dee5-4582-9dbd-ac1ab628c19f";
const imageUrl = "/api/public-media/replit-objstore-3dc2325c-bbbe-4e54-9a00-e6f10b243138/public/ai-generated/news-1768332494350-wnmai_1768332494358.webp";

async function main() {
  console.log(`🖼️ Generating thumbnail for article: ${articleId}`);
  try {
    const thumbnailUrl = await generateArticleThumbnail(articleId, imageUrl);
    console.log(`✅ Generated: ${thumbnailUrl}`);
  } catch (err) {
    console.error(`❌ Failed:`, err);
  }
  process.exit(0);
}

main();
