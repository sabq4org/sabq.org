// تجربة كاشف تركيز الصور على روابط صور دون كتابة أي شيء في قاعدة البيانات.
//   npx tsx scripts/image-focus/try-detector.ts <imageUrl> [imageUrl...]
//   npx tsx scripts/image-focus/try-detector.ts --homepage   (صور البارزة وأول 12 من «لك» في api.sabq.org)
// يحتاج GEMINI_API_KEY في البيئة. يطبع النتيجة JSON سطرًا لكل صورة.
import { detectImageFocus } from "../../server/services/imageFocusDetector";

async function homepageUrls(): Promise<string[]> {
  const res = await fetch("https://api.sabq.org/api/homepage-lite");
  const data = (await res.json()) as Record<string, Array<{ imageUrl?: string | null }>>;
  const urls = [...(data.hero ?? []), ...(data.forYou ?? []).slice(0, 12)]
    .map((a) => a.imageUrl)
    .filter((u): u is string => typeof u === "string" && u.startsWith("https://"));
  return Array.from(new Set(urls));
}

async function main() {
  const args = process.argv.slice(2);
  const urls = args.includes("--homepage") ? await homepageUrls() : args;
  if (!urls.length) {
    console.error("usage: try-detector.ts <imageUrl...> | --homepage");
    process.exit(1);
  }
  for (const url of urls) {
    const started = Date.now();
    try {
      const r = await detectImageFocus(url);
      console.log(JSON.stringify({ url, ms: Date.now() - started, ...r }));
    } catch (error) {
      console.log(JSON.stringify({ url, error: error instanceof Error ? error.message : String(error) }));
    }
  }
}

main();
