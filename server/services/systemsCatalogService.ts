// كتالوج أنظمة سبق — يقرأ docs/systems/registry.json ويجرد الملفات
// ويربط استهلاك AI اليوم بمفاتيح aiFeatureKeys (من ai_usage_logs).
//
// ملتزم بـ ADR-001: كل استعلامات DB هنا وليس في الـ route.

import fs from "node:fs";
import path from "node:path";
import { gte, sql } from "drizzle-orm";
import { db } from "../db";
import { aiUsageLogs } from "../../shared/schema";

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, "docs/systems/registry.json");
const SNAPSHOT_PATH = path.join(ROOT, "docs/systems/inventory-snapshot.json");

interface InventorySnapshot {
  generatedAt: string;
  systems: Array<{ id: string; fileCount: number; samplePaths?: string[] }>;
}

export type SystemStatus = "active" | "retired" | "experimental";

export interface RegistrySystem {
  id: string;
  nameAr: string;
  nameEn: string;
  status: SystemStatus;
  category: string;
  summary: string;
  docPath: string;
  relatedDocs?: string[];
  pathGlobs: string[];
  aiFeatureKeys?: string[];
  dashboardPath?: string | null;
  owners?: string[];
  lastReviewed?: string;
}

interface RegistryFile {
  version: number;
  updatedAt: string;
  systems: RegistrySystem[];
}

export interface SystemCatalogEntry {
  id: string;
  nameAr: string;
  nameEn: string;
  status: SystemStatus;
  category: string;
  summary: string;
  docPath: string;
  docExists: boolean;
  relatedDocs: string[];
  pathGlobs: string[];
  fileCount: number;
  samplePaths: string[];
  aiFeatureKeys: string[];
  dashboardPath: string | null;
  owners: string[];
  lastReviewed: string | null;
  aiToday: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  } | null;
}

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  let st: fs.Stats;
  try {
    st = fs.statSync(dir);
  } catch {
    return acc;
  }
  if (st.isFile()) {
    acc.push(dir);
    return acc;
  }
  if (!st.isDirectory()) return acc;
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of names) {
    if (name === "node_modules" || name === ".git" || name === "dist") continue;
    walkFiles(path.join(dir, name), acc);
  }
  return acc;
}

function globToRegExp(glob: string): RegExp {
  let i = 0;
  let out = "^";
  while (i < glob.length) {
    if (glob.startsWith("**/", i)) {
      out += "(?:.*/)?";
      i += 3;
      continue;
    }
    if (glob[i] === "*" && glob[i + 1] === "*") {
      out += ".*";
      i += 2;
      continue;
    }
    const ch = glob[i]!;
    if (ch === "*") out += "[^/]*";
    else if (ch === "?") out += "[^/]";
    else if ("+.^${}()|[]\\".includes(ch)) out += "\\" + ch;
    else out += ch;
    i += 1;
  }
  return new RegExp(out + "$");
}

function matchGlob(relPosix: string, glob: string): boolean {
  const normalizedGlob = glob.replace(/\\/g, "/");
  if (!/[*?]/.test(normalizedGlob)) {
    return (
      relPosix === normalizedGlob ||
      relPosix.startsWith(normalizedGlob.replace(/\/?$/, "/"))
    );
  }
  return globToRegExp(normalizedGlob).test(relPosix);
}

function countForGlobs(globs: string[]): { fileCount: number; samplePaths: string[] } {
  const matched = new Set<string>();
  for (const glob of globs) {
    const normalizedGlob = glob.replace(/\\/g, "/");
    const firstWild = normalizedGlob.search(/[*?]/);
    const slashBefore =
      firstWild === -1 ? -1 : normalizedGlob.lastIndexOf("/", firstWild);
    const literalPrefix =
      firstWild === -1
        ? normalizedGlob
        : slashBefore >= 0
          ? normalizedGlob.slice(0, slashBefore + 1)
          : "";
    const startDir = path.join(ROOT, literalPrefix || ".");
    const files = walkFiles(startDir);
    for (const abs of files) {
      const rel = path.relative(ROOT, abs).split(path.sep).join("/");
      if (matchGlob(rel, normalizedGlob)) matched.add(rel);
    }
  }
  const all = [...matched].sort();
  return { fileCount: all.length, samplePaths: all.slice(0, 8) };
}

export function loadRegistry(): RegistryFile {
  if (!fs.existsSync(REGISTRY_PATH)) {
    throw new Error("systems_registry_missing");
  }
  const raw = fs.readFileSync(REGISTRY_PATH, "utf8");
  const parsed = JSON.parse(raw) as RegistryFile;
  if (!Array.isArray(parsed.systems)) {
    throw new Error("invalid_systems_registry");
  }
  return parsed;
}

function loadSnapshot(): InventorySnapshot | null {
  if (!fs.existsSync(SNAPSHOT_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8")) as InventorySnapshot;
  } catch {
    return null;
  }
}

/** هل شجرة المصدر متاحة للجرد الحي؟ (محلياً نعم؛ صورة Railway غالباً لا) */
function canLiveInventory(): boolean {
  return fs.existsSync(path.join(ROOT, "server/services")) && fs.existsSync(path.join(ROOT, "client/src"));
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function loadAiUsageByFeature(
  featureKeys: string[],
): Promise<Map<string, { requests: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number }>> {
  const map = new Map<
    string,
    { requests: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number }
  >();
  if (featureKeys.length === 0) return map;

  try {
    const rows = await db
      .select({
        featureKey: aiUsageLogs.featureKey,
        requests: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${aiUsageLogs.inputTokens}), 0)::float8`,
        outputTokens: sql<number>`coalesce(sum(${aiUsageLogs.outputTokens}), 0)::float8`,
        estimatedCostUsd: sql<number>`coalesce(sum(${aiUsageLogs.estimatedCostUsd}), 0)::float8`,
      })
      .from(aiUsageLogs)
      .where(gte(aiUsageLogs.createdAt, startOfToday()))
      .groupBy(aiUsageLogs.featureKey);

    // صفّي إلى المفاتيح المطلوبة فقط (تجنب تسريب مفاتيح خارج الكتالوج)
    const wanted = new Set(featureKeys);
    for (const row of rows) {
      if (!wanted.has(row.featureKey)) continue;
      map.set(row.featureKey, {
        requests: Number(row.requests) || 0,
        inputTokens: Number(row.inputTokens) || 0,
        outputTokens: Number(row.outputTokens) || 0,
        estimatedCostUsd: Number(row.estimatedCostUsd) || 0,
      });
    }
  } catch (err) {
    console.warn("[SystemsCatalog] AI usage query failed:", (err as Error).message);
  }
  return map;
}

function aggregateAi(
  keys: string[],
  byFeature: Map<string, { requests: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number }>,
): SystemCatalogEntry["aiToday"] {
  if (keys.length === 0) return null;
  const acc = { requests: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };
  for (const key of keys) {
    const row = byFeature.get(key);
    if (!row) continue;
    acc.requests += row.requests;
    acc.inputTokens += row.inputTokens;
    acc.outputTokens += row.outputTokens;
    acc.estimatedCostUsd += row.estimatedCostUsd;
  }
  return acc;
}

function findDuplicateFeatureKeys(
  systems: Array<{ id: string; aiFeatureKeys?: string[] }>,
): Array<{ featureKey: string; systemIds: string[] }> {
  const owners = new Map<string, string[]>();
  for (const sys of systems) {
    for (const key of sys.aiFeatureKeys || []) {
      const list = owners.get(key) ?? [];
      list.push(sys.id);
      owners.set(key, list);
    }
  }
  return [...owners.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([featureKey, systemIds]) => ({ featureKey, systemIds }));
}

export async function getSystemsCatalog(): Promise<{
  updatedAt: string;
  generatedAt: string;
  count: number;
  inventoryMode: "live" | "snapshot" | "unavailable";
  snapshotGeneratedAt: string | null;
  /** مجموع AI لليوم بدون تكرار مفاتيح بين الأنظمة */
  aiTodayUnique: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    featureKeyCount: number;
  };
  duplicateFeatureKeys: Array<{ featureKey: string; systemIds: string[] }>;
  systems: SystemCatalogEntry[];
}> {
  const registry = loadRegistry();
  const duplicateFeatureKeys = findDuplicateFeatureKeys(registry.systems);
  const allFeatureKeys = [
    ...new Set(registry.systems.flatMap((s) => s.aiFeatureKeys || [])),
  ];
  const byFeature = await loadAiUsageByFeature(allFeatureKeys);
  const live = canLiveInventory();
  const snapshot = live ? null : loadSnapshot();
  const snapshotMap = new Map(
    (snapshot?.systems || []).map((s) => [s.id, s] as const),
  );

  const systems: SystemCatalogEntry[] = registry.systems.map((sys) => {
    let fileCount = 0;
    let samplePaths: string[] = [];
    if (live) {
      ({ fileCount, samplePaths } = countForGlobs(sys.pathGlobs || []));
    } else if (snapshotMap.has(sys.id)) {
      const snap = snapshotMap.get(sys.id)!;
      fileCount = snap.fileCount;
      samplePaths = snap.samplePaths || [];
    }
    const docAbs = path.join(ROOT, sys.docPath || "");
    const keys = sys.aiFeatureKeys || [];
    return {
      id: sys.id,
      nameAr: sys.nameAr,
      nameEn: sys.nameEn,
      status: sys.status,
      category: sys.category,
      summary: sys.summary,
      docPath: sys.docPath,
      docExists: Boolean(sys.docPath) && fs.existsSync(docAbs),
      relatedDocs: sys.relatedDocs || [],
      pathGlobs: sys.pathGlobs || [],
      fileCount,
      samplePaths,
      aiFeatureKeys: keys,
      dashboardPath: sys.dashboardPath ?? null,
      owners: sys.owners || [],
      lastReviewed: sys.lastReviewed ?? null,
      aiToday: aggregateAi(keys, byFeature),
    };
  });

  const inventoryMode: "live" | "snapshot" | "unavailable" = live
    ? "live"
    : snapshot
      ? "snapshot"
      : "unavailable";

  const aiTodayUnique = {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
    featureKeyCount: allFeatureKeys.length,
  };
  for (const key of allFeatureKeys) {
    const row = byFeature.get(key);
    if (!row) continue;
    aiTodayUnique.requests += row.requests;
    aiTodayUnique.inputTokens += row.inputTokens;
    aiTodayUnique.outputTokens += row.outputTokens;
    aiTodayUnique.estimatedCostUsd += row.estimatedCostUsd;
  }

  if (duplicateFeatureKeys.length) {
    console.warn(
      "[SystemsCatalog] duplicate aiFeatureKeys:",
      duplicateFeatureKeys.map((d) => `${d.featureKey}→${d.systemIds.join(",")}`).join("; "),
    );
  }

  return {
    updatedAt: registry.updatedAt,
    generatedAt: new Date().toISOString(),
    count: systems.length,
    inventoryMode,
    snapshotGeneratedAt: snapshot?.generatedAt ?? null,
    aiTodayUnique,
    duplicateFeatureKeys,
    systems,
  };
}

export async function getSystemById(id: string): Promise<SystemCatalogEntry | null> {
  const catalog = await getSystemsCatalog();
  return catalog.systems.find((s) => s.id === id) ?? null;
}
