import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { PenLine } from "lucide-react";

interface EditorPresence {
  userId: string;
  userName: string;
  userAvatar: string | null;
  articleId: string | null;
  articleTitle: string;
  articleSummary: string;
  updatedAt: number;
}

interface PublishedEvent {
  articleId: string;
  articleTitle: string;
  articleSlug: string | null;
  publisherName: string;
  publishedAt: string;
}

function prettifyName(name: string) {
  if (!name) return "محرر";
  // Strip @domain if it's an email-shaped fallback
  const at = name.indexOf("@");
  return at > 0 ? name.slice(0, at) : name;
}

function initials(name: string) {
  const clean = prettifyName(name);
  const parts = clean.trim().split(/\s+/);
  if (parts.length === 0) return "م";
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return (first + last).slice(0, 2) || "م";
}

export function EditorPresenceBar() {
  const { user } = useAuth();
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [editors, setEditors] = useState<EditorPresence[]>([]);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!user) return;
    const source = new EventSource("/api/editor-presence/stream", {
      withCredentials: true,
    } as EventSourceInit);
    sourceRef.current = source;

    source.addEventListener("presence_update", (event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data);
        if (Array.isArray(parsed?.editors)) {
          setEditors(parsed.editors as EditorPresence[]);
        }
      } catch {
        // ignore
      }
    });

    source.addEventListener("article_published", (event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data) as PublishedEvent;
        const publisher = prettifyName(parsed.publisherName);
        const title = (parsed.articleTitle || "خبر بدون عنوان").trim();
        toastRef.current({
          title: `📰 ${publisher} نشر خبراً جديداً`,
          description: title,
          duration: 7000,
        });
      } catch {
        // ignore
      }
    });

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [user]);

  const others = editors.filter((e) => e.userId !== user?.id);
  if (others.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/40"
      data-testid="editor-presence-bar"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-emerald-900 dark:text-emerald-100">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
        </span>
        <PenLine className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
        <span>محررون يكتبون الآن</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {others.map((editor) => {
          const displayName = prettifyName(editor.userName);
          const title = (editor.articleTitle || "").trim();
          return (
            <div
              key={editor.userId}
              className="flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-2 py-1 text-xs text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-50"
              data-testid={`presence-editor-${editor.userId}`}
              title={editor.articleSummary || title}
            >
              <Avatar className="h-6 w-6 ring-2 ring-emerald-400 dark:ring-emerald-600">
                {editor.userAvatar ? (
                  <AvatarImage src={editor.userAvatar} alt={displayName} />
                ) : null}
                <AvatarFallback className="bg-emerald-600 text-[10px] text-white">
                  {initials(editor.userName)}
                </AvatarFallback>
              </Avatar>
              <span className="max-w-[120px] truncate font-semibold">
                {displayName}
              </span>
              {title ? (
                <>
                  <span className="text-emerald-500 dark:text-emerald-400">·</span>
                  <span className="max-w-[220px] truncate text-emerald-700 dark:text-emerald-200">
                    {title}
                  </span>
                </>
              ) : (
                <span className="hidden text-emerald-700 dark:text-emerald-300 sm:inline">
                  يكتب الآن
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default EditorPresenceBar;
