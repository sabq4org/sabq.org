/**
 * وسم الصور المولدة بالذكاء الاصطناعي داخل الملف نفسه (IPTC عبر XMP).
 *
 * توثيق قوقل للبحث (using-gen-ai-content) يطلب الإبقاء على وسم IPTC
 * DigitalSourceType = trainedAlgorithmicMedia في الصور المولدة. كل تحويل عبر
 * sharp يحذف البيانات الوصفية افتراضيًا، فنعيد كتابة الوسم صراحةً في كل
 * نسخة WebP نُنتجها لصورة مولدة. الوسم الظاهر للقارئ («صورة مولدة بالذكاء
 * الاصطناعي») مستقل عن هذا ويبقى كما هو.
 */

import type { Sharp } from "sharp";

export const IPTC_TRAINED_ALGORITHMIC_MEDIA =
  "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";

export const AI_IMAGE_PROVENANCE_XMP = [
  '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
  '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
  '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
  '<rdf:Description rdf:about=""',
  ' xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"',
  ` Iptc4xmpExt:DigitalSourceType="${IPTC_TRAINED_ALGORITHMIC_MEDIA}"/>`,
  "</rdf:RDF>",
  "</x:xmpmeta>",
  '<?xpacket end="w"?>',
].join("");

/**
 * أغراض الرفع التي تعني أن الصورة مولدة بالكامل:
 * article-ai-generated (Nano Banana) و article-openai-generated (GPT Image).
 */
export function isAiGeneratedImagePurpose(purpose: unknown): boolean {
  if (typeof purpose !== "string") return false;
  return /-(ai|openai)-generated$/i.test(purpose.trim());
}

/** يضيف وسم IPTC للصورة المولدة إلى مخرجات sharp. */
export function withAiProvenance(pipeline: Sharp): Sharp {
  return pipeline.withXmp(AI_IMAGE_PROVENANCE_XMP);
}
