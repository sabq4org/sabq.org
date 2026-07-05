import { Modality } from "@google/genai";
import { createGoogleGenAI } from "../../utils/googleGenAi";

// On Replit: AI_INTEGRATIONS_GEMINI_API_KEY + AI_INTEGRATIONS_GEMINI_BASE_URL
// hit Replit's AI Integrations proxy. Off Replit (e.g. Railway): use a real
// Gemini API key from https://aistudio.google.com via GEMINI_API_KEY and
// let the SDK use its default baseUrl + apiVersion.
const replitProxyUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
const apiKey =
  process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY;

export const ai = createGoogleGenAI({
  apiKey,
  ...(replitProxyUrl
    ? {
        httpOptions: {
          apiVersion: "",
          baseUrl: replitProxyUrl,
        },
      }
    : {}),
});

/**
 * Generate an image and return as base64 data URL.
 * Uses gemini-2.5-flash-image model via Replit AI Integrations.
 */
export async function generateImage(prompt: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response");
  }

  const mimeType = imagePart.inlineData.mimeType || "image/png";
  return `data:${mimeType};base64,${imagePart.inlineData.data}`;
}

