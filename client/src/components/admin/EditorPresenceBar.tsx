import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const trimmed = name.trim();
  const at = trimmed.indexOf("@");
  // Email local-part fallback only — keep Arabic/full names as-is
  return at > 0 ? trimmed.slice(0, at) : trimmed;
}

function initials(name: string) {
  const clean = prettifyName(name);
  const parts = clean.trim().split(/\s+/);
  if (parts.length === 0) return "م";
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return (first + last).slice(0, 2) || "م";
}

/** Compact header chip: live count + popover list of editors currently writing. */
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
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-xs font-medium"
          data-testid="editor-presence-bar"
          aria-live="polite"
          aria-label={`${others.length} محررون يكتبون الآن`}
          title="محررون يكتبون الآن"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
          </span>
          <PenLine className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="tabular-nums">{others.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" data-testid="editor-presence-popover">
        <div className="border-b border-border px-3 py-2">
          <p className="text-sm font-semibold text-foreground">محررون يكتبون الآن</p>
          <p className="text-xs text-muted-foreground">{others.length} نشط الآن</p>
        </div>
        <ul className="max-h-72 overflow-y-auto py-1">
          {others.map((editor) => {
            const displayName = prettifyName(editor.userName);
            const title = (editor.articleTitle || "").trim();
            const href = editor.articleId
              ? `/dashboard/articles/${editor.articleId}/edit`
              : null;
            const row = (
              <div
                className="flex items-start gap-2.5 px-3 py-2.5 text-start hover:bg-muted/60"
                data-testid={`presence-editor-${editor.userId}`}
                title={editor.articleSummary || title}
              >
                <Avatar className="mt-0.5 h-7 w-7 shrink-0">
                  {editor.userAvatar ? (
                    <AvatarImage src={editor.userAvatar} alt={displayName} />
                  ) : null}
                  <AvatarFallback className="bg-muted text-[10px] text-foreground">
                    {initials(editor.userName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {title || "يكتب الآن"}
                  </p>
                </div>
              </div>
            );
            return (
              <li key={editor.userId}>
                {href ? (
                  <Link href={href} className="block outline-none focus-visible:bg-muted/60">
                    {row}
                  </Link>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export default EditorPresenceBar;
