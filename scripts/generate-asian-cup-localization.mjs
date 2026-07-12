#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

const TARGETS = {
  ur: "Urdu", ja: "Japanese", ko: "Korean", "zh-Hans": "Simplified Chinese",
  vi: "Vietnamese", th: "Thai", id: "Indonesian", ms: "Malay", hi: "Hindi",
  uz: "Uzbek (Latin)", tg: "Tajik", ky: "Kyrgyz", bn: "Bengali",
};

const code = process.argv[2];
if (!code || !TARGETS[code]) {
  process.stderr.write(`Usage: node scripts/generate-asian-cup-localization.mjs <${Object.keys(TARGETS).join("|")}>\n`);
  process.exit(2);
}
if (!process.env.OPENAI_API_KEY) {
  process.stderr.write("OPENAI_API_KEY is required\n");
  process.exit(2);
}

const root = process.cwd();
const sourcePath = path.join(root, "asian-cup app ios/AsianCup/Localization/en.json");
const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await client.chat.completions.create({
  model: process.env.AC_TRANSLATION_MODEL || "gpt-4o-mini",
  temperature: 0.1,
  response_format: { type: "json_object" },
  messages: [
    {
      role: "system",
      content: `You are a professional sports-product localizer. Translate every JSON value into ${TARGETS[code]} for the AFC Asian Cup 2027 app. Return one flat JSON object with exactly the same keys. Preserve placeholders such as {age}, {rank}, {correct}, {exact}, {acc} byte-for-byte. Keep brand names Sabq, Apple, TheSports and VAR unchanged. Use concise native mobile UI language. Do not translate footballer names or invent facts. No commentary.`,
    },
    { role: "user", content: JSON.stringify(source) },
  ],
});

const raw = response.choices[0]?.message?.content;
if (!raw) throw new Error("Translation model returned no content");
const translated = JSON.parse(raw);
const sourceKeys = Object.keys(source).sort();
const translatedKeys = Object.keys(translated).sort();
if (JSON.stringify(sourceKeys) !== JSON.stringify(translatedKeys)) {
  const missing = sourceKeys.filter((key) => !(key in translated));
  const extra = translatedKeys.filter((key) => !(key in source));
  throw new Error(`Key mismatch; missing=${missing.join(",")} extra=${extra.join(",")}`);
}

const placeholders = (value) => [...String(value).matchAll(/\{[^}]+\}/g)].map((m) => m[0]).sort();
for (const key of sourceKeys) {
  if (typeof translated[key] !== "string" || translated[key].trim() === "") {
    throw new Error(`Empty/non-string translation: ${key}`);
  }
  if (JSON.stringify(placeholders(source[key])) !== JSON.stringify(placeholders(translated[key]))) {
    throw new Error(`Placeholder mismatch: ${key}`);
  }
}

const relative = path.join(root, `asian-cup app ios/AsianCup/Localization/${code}.json`);
const json = `${JSON.stringify(translated, null, 2)}\n`;
process.stdout.write(`*** Begin Patch\n*** Add File: ${relative}\n`);
for (const line of json.split("\n").slice(0, -1)) process.stdout.write(`+${line}\n`);
process.stdout.write("*** End Patch\n");
