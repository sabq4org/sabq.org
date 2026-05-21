import { useState } from "react";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Curated emoji palette — a fast inline grid, no third-party lib. The OS
// keyboard still lets the user type any other unicode emoji they want.
const EMOJI_GROUPS: Array<{ label: string; emojis: string[] }> = [
  {
    label: "وجوه",
    emojis: [
      "😀", "😄", "😁", "😆", "🥹", "😅", "🤣", "😂", "🙂", "🙃",
      "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙",
      "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫",
      "🤔", "🫡", "🤐", "🤨", "😐", "😑", "😶", "🫥", "😏", "😒",
      "🙄", "😬", "🤥", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕",
    ],
  },
  {
    label: "حركات",
    emojis: [
      "👍", "👎", "👏", "🙏", "🤝", "🤲", "🙌", "👌", "✌️", "🤞",
      "🤟", "🤘", "👈", "👉", "👆", "👇", "☝️", "🫵", "💪", "🦾",
      "🫶", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎",
      "💔", "❣️", "💯", "✨", "🎉", "🎊", "🔥", "⭐", "🌟", "💫",
    ],
  },
  {
    label: "أشياء",
    emojis: [
      "📰", "📝", "📌", "📍", "📎", "🔗", "📅", "🗓", "⏰", "⏱",
      "📞", "📱", "💻", "🖥", "⌨️", "🖱", "🖨", "📧", "✉️", "📨",
      "💡", "🔍", "🔎", "📊", "📈", "📉", "🗂", "📁", "📂", "📒",
      "✅", "❌", "⚠️", "‼️", "❓", "❗", "💬", "💭", "🗯", "💡",
    ],
  },
];

interface EmojiPickerProps {
  onPick: (emoji: string) => void;
}

export function EmojiPicker({ onPick }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label="اختر إيموجي"
          data-testid="chat-emoji-trigger"
        >
          <Smile className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-80 p-0 max-h-80 overflow-y-auto"
      >
        {EMOJI_GROUPS.map((group) => (
          <div key={group.label} className="p-3 border-b last:border-b-0">
            <div className="text-[11px] text-muted-foreground mb-2">
              {group.label}
            </div>
            <div className="grid grid-cols-10 gap-1">
              {group.emojis.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="text-xl leading-none p-1 rounded hover:bg-muted transition-colors"
                  onClick={() => {
                    onPick(e);
                    setOpen(false);
                  }}
                  aria-label={`أضف ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
