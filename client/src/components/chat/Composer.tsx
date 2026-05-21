import { useRef, useState, KeyboardEvent, useCallback } from "react";
import { ImagePlus, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EmojiPicker } from "./EmojiPicker";
import {
  appendOptimisticMessage,
  chatConversationsQueryKey,
  chatMessagesQueryKey,
} from "./hooks";
import type { ChatMessage } from "./types";

interface ComposerProps {
  conversationId: string;
  currentUserId: string;
}

interface PendingImage {
  clientKey: string;
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  mimeType: string | null;
  previewUrl: string;
}

interface UploadResponse {
  url: string;
  thumbnailUrl: string | null;
  sizeBytes: number;
  mimeType: string;
}

export function Composer({ conversationId, currentUserId }: ComposerProps) {
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  const insertAtCursor = useCallback((insertion: string) => {
    const el = textareaRef.current;
    if (!el) {
      setText((t) => t + insertion);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + insertion + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + insertion.length;
      el.setSelectionRange(cursor, cursor);
    });
  }, [text]);

  const handleFileChosen = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "نوع غير مدعوم", description: "يمكنك رفع الصور فقط", variant: "destructive" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "الصورة كبيرة", description: "الحد الأقصى 8 ميجابايت", variant: "destructive" });
      return;
    }
    const clientKey = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const previewUrl = URL.createObjectURL(file);

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await apiRequest<UploadResponse>("/api/chat/upload-image", {
        method: "POST",
        body: form,
        isFormData: true,
      });
      setPendingImages((prev) => [
        ...prev,
        {
          clientKey,
          url: result.url,
          thumbnailUrl: result.thumbnailUrl,
          width: null,
          height: null,
          sizeBytes: result.sizeBytes,
          mimeType: result.mimeType,
          previewUrl,
        },
      ]);
    } catch (err: any) {
      toast({ title: "فشل رفع الصورة", description: err?.message || "حاول مرة أخرى", variant: "destructive" });
      URL.revokeObjectURL(previewUrl);
    } finally {
      setUploading(false);
    }
  };

  const removePending = (clientKey: string) => {
    setPendingImages((prev) => {
      const target = prev.find((p) => p.clientKey === clientKey);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.clientKey !== clientKey);
    });
  };

  const handleSend = async () => {
    const body = text.trim();
    if (!body && pendingImages.length === 0) return;
    if (sending) return;

    const clientId = `cm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const optimistic: ChatMessage = {
      id: clientId,
      conversationId,
      senderId: currentUserId,
      body,
      createdAt: new Date().toISOString(),
      clientId,
      attachments: pendingImages.map((p) => ({
        id: p.clientKey,
        kind: "image",
        url: p.url,
        thumbnailUrl: p.thumbnailUrl,
        width: p.width,
        height: p.height,
        mimeType: p.mimeType,
      })),
      pending: true,
    };

    const rollback = appendOptimisticMessage(optimistic);
    const previousText = text;
    const previousImages = pendingImages;
    setText("");
    setPendingImages([]);
    setSending(true);

    try {
      const response = await apiRequest<{ message: ChatMessage }>(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            body,
            clientId,
            attachments: previousImages.map((p) => ({
              kind: "image" as const,
              url: p.url,
              thumbnailUrl: p.thumbnailUrl,
              width: p.width,
              height: p.height,
              sizeBytes: p.sizeBytes,
              mimeType: p.mimeType,
            })),
          }),
        },
      );

      // Swap optimistic for server payload (WebSocket may also do this, but
      // we want responsiveness even if WS is momentarily disconnected).
      queryClient.setQueryData<{ messages: ChatMessage[]; hasMore: boolean } | undefined>(
        chatMessagesQueryKey(conversationId),
        (old) => {
          if (!old) return old;
          const idx = old.messages.findIndex(
            (m) => m.clientId === clientId || m.id === clientId,
          );
          if (idx === -1) return old;
          const next = old.messages.slice();
          next[idx] = { ...response.message, pending: false };
          return { ...old, messages: next };
        },
      );
      previousImages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      // Touch the conversation list so it re-orders.
      queryClient.invalidateQueries({ queryKey: chatConversationsQueryKey() });
    } catch (err: any) {
      rollback();
      setText(previousText);
      setPendingImages(previousImages);
      toast({
        title: "تعذّر إرسال الرسالة",
        description: err?.message || "حاول مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="border-t bg-background">
      {pendingImages.length > 0 && (
        <div className="flex gap-2 p-3 flex-wrap border-b bg-muted/30">
          {pendingImages.map((p) => (
            <div key={p.clientKey} className="relative">
              <img
                src={p.previewUrl}
                alt="مرفق"
                className="h-20 w-20 object-cover rounded-lg border"
              />
              <button
                type="button"
                onClick={() => removePending(p.clientKey)}
                className="absolute -top-1.5 -left-1.5 bg-foreground text-background rounded-full p-0.5 shadow"
                aria-label="إزالة الصورة"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 p-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFileChosen(file);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-label="إرفاق صورة"
          data-testid="chat-upload-trigger"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
        </Button>
        <EmojiPicker onPick={insertAtCursor} />

        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="اكتب رسالتك… (Enter للإرسال، Shift+Enter لسطر جديد)"
          rows={1}
          className="resize-none min-h-[40px] max-h-40 flex-1"
          data-testid="chat-composer-input"
        />
        <Button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || (!text.trim() && pendingImages.length === 0)}
          className="h-10 gap-1 px-4"
          data-testid="chat-composer-send"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          إرسال
        </Button>
      </div>
    </div>
  );
}
