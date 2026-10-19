/**
 * حفظ المسودة على الخادم: مقال قائم كل 45 ثانية، ومقال جديد عند أول محتوى ذي معنى.
 * لا يغيّر الحالة ولا الجدولة ولا ملاحظات المراجعة.
 */
import { useEffect, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";
import {
  AUTOSAVE_INTERVAL_MS,
  autosavePayloadSignature,
  buildDraftAutosavePatch,
  buildNewDraftCreateBody,
  canServerAutosaveExistingDraft,
  createManualSaveGate,
  hasMeaningfulDraftContent,
  stableLocalDraftKey,
  type AutosavedDraft,
  type DraftAutosaveFields,
} from "@/lib/articleAutosave";

type ServerAutosaveArgs = {
  enabled: boolean;
  isNewArticle: boolean;
  articleId?: string;
  userId?: string | null;
  status: string;
  reviewStatus: string | null;
  fields: DraftAutosaveFields;
  localDraftKey: string | null;
  onDraftCreated: (articleId: string) => void;
  onServerSaved: (updatedAt?: string) => void;
  onActivity: (phase: "saving" | "saved" | "idle") => void;
};

export function useArticleServerAutosave(args: ServerAutosaveArgs) {
  const argsRef = useRef(args);
  argsRef.current = args;
  const lockRef = useRef(false);
  const lastPayloadRef = useRef("");
  const blockedUntilRef = useRef(0);
  // حفظ يدوي (نشر/جدولة/حفظ) جارٍ: لا يُنشئ الحفظ التلقائي صفًا ثانيًا ولا يسابق PATCH النشر.
  const gateRef = useRef<ReturnType<typeof createManualSaveGate> | null>(null);
  if (!gateRef.current) gateRef.current = createManualSaveGate();
  const gate = gateRef.current;

  const flushRef = useRef<() => Promise<void>>(async () => {});
  flushRef.current = async () => {
    const current = argsRef.current;
    if (!current.enabled || !current.userId) return;
    if (gate.isPaused()) return;
    if (lockRef.current) return;
    if (Date.now() < blockedUntilRef.current) return;
    if (!hasMeaningfulDraftContent(current.fields.title, current.fields.content)) return;

    if (current.isNewArticle) {
      const body = buildNewDraftCreateBody(current.fields);
      if (!body) return;
      const signature = autosavePayloadSignature(body);
      if (signature === lastPayloadRef.current) return;
      lockRef.current = true;
      current.onActivity("saving");
      try {
        const result = await apiRequest<{ id?: string; updatedAt?: string }>("/api/admin/articles", {
          method: "POST",
          body: JSON.stringify(body),
          silent: true,
        });
        if (!result?.id) throw new Error("missing draft id");
        lastPayloadRef.current = signature;
        gate.recordCreated({
          id: result.id,
          updatedAt: typeof result.updatedAt === "string" ? result.updatedAt : undefined,
        });
        // Move the browser copy onto the new article (it may hold fields the create body
        // does not send) and drop "-new", which would otherwise prompt on every new article.
        if (current.localDraftKey) {
          try {
            const raw = localStorage.getItem(current.localDraftKey);
            if (raw) localStorage.setItem(stableLocalDraftKey(current.userId, result.id), raw);
            localStorage.removeItem(current.localDraftKey);
          } catch {
            // storage unavailable: nothing to move
          }
        }
        current.onActivity("saved");
        current.onServerSaved(typeof result.updatedAt === "string" ? result.updatedAt : undefined);
        current.onDraftCreated(result.id);
      } catch (err) {
        console.warn("[Auto-save] server draft create failed", err);
        blockedUntilRef.current = Date.now() + AUTOSAVE_INTERVAL_MS;
        current.onActivity("saved");
      } finally {
        lockRef.current = false;
      }
      return;
    }

    if (!current.articleId) return;
    if (!canServerAutosaveExistingDraft({
      status: current.status,
      reviewStatus: current.reviewStatus,
    })) return;

    const patch = buildDraftAutosavePatch(current.fields);
    if (!patch) return;
    const signature = autosavePayloadSignature(patch);
    if (signature === lastPayloadRef.current) return;
    lockRef.current = true;
    current.onActivity("saving");
    try {
      const result = await apiRequest<{ updatedAt?: string }>(
        `/api/admin/articles/${current.articleId}`,
        { method: "PATCH", body: JSON.stringify(patch), silent: true },
      );
      lastPayloadRef.current = signature;
      current.onActivity("saved");
      const updatedAt = result?.updatedAt;
      current.onServerSaved(typeof updatedAt === "string" ? updatedAt : undefined);
    } catch (err) {
      console.warn("[Auto-save] server draft update failed", err);
      blockedUntilRef.current = Date.now() + AUTOSAVE_INTERVAL_MS;
      current.onActivity("saved");
    } finally {
      lockRef.current = false;
    }
  };

  const runFlush = () => {
    void gate.run(() => flushRef.current());
  };

  /**
   * Called by a manual save before it sends anything: stops autosave, waits for a
   * request already on the wire, and returns the draft autosave created (if any) so a
   * save that still sees the article as new PATCHes that row instead of POSTing a twin.
   */
  const pauseForManualSave = (): Promise<AutosavedDraft | null> => gate.pause();

  /** Resume after a manual save failed; a successful one leaves the editor. */
  const resumeAfterManualSave = () => gate.resume();

  useEffect(() => {
    if (args.isNewArticle) gate.resetForNewArticle();
  }, [args.isNewArticle, gate]);

  useEffect(() => {
    if (!args.enabled || !args.userId) return;
    const interval = window.setInterval(() => {
      runFlush();
    }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [args.enabled, args.userId, args.isNewArticle, args.articleId]);

  useEffect(() => {
    if (!args.enabled || !args.userId || !args.isNewArticle) return;
    if (!hasMeaningfulDraftContent(args.fields.title, args.fields.content)) return;
    const timer = window.setTimeout(() => {
      runFlush();
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [args.enabled, args.userId, args.isNewArticle, args.fields.title, args.fields.content]);

  return { pauseForManualSave, resumeAfterManualSave };
}
