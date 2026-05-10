import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useBehaviorTracking } from "@/hooks/useBehaviorTracking";
import {
  Share2,
  Copy,
  Check,
  Facebook,
  Linkedin,
  MessageCircle,
  Send,
} from "lucide-react";
import { SiX } from "react-icons/si";

interface SocialShareBarProps {
  title: string;
  url: string;
  description?: string;
  articleId?: string;
  className?: string;
  layout?: "horizontal" | "vertical";
  showLabels?: boolean;
}

export function SocialShareBar({
  title,
  url,
  description = "",
  articleId,
  className = "",
  layout = "horizontal",
  showLabels = false,
}: SocialShareBarProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { logBehavior } = useBehaviorTracking();

  const shareUrl = url.startsWith("http") ? url : `https://sabq.org${url}`;
  const shareText = `${title}${description ? `\n\n${description}` : ""}`;

  const trackShare = (platform: string) => {
    if (articleId) {
      logBehavior("social_share", {
        articleId,
        platform,
        url: shareUrl,
      });
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      trackShare("copy_link");
      toast({
        title: "تم النسخ",
        description: "تم نسخ الرابط إلى الحافظة",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل نسخ الرابط",
        variant: "destructive",
      });
    }
  };

  const shareLinks = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(shareUrl)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(title)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
  };

  const handlePlatformShare = (platform: keyof typeof shareLinks) => {
    trackShare(platform);
    window.open(shareLinks[platform], "_blank", "noopener,noreferrer,width=600,height=600");
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: description,
          url: shareUrl,
        });
        trackShare("native_share");
      } catch (error) {
        // User cancelled share or error occurred
        console.log("Share cancelled or failed:", error);
      }
    }
  };

  const containerClass = layout === "vertical" 
    ? "flex flex-col gap-2" 
    : "flex flex-wrap items-center gap-2";

  const buttonSize = showLabels ? "default" : "icon";

  return (
    <div className={`${containerClass} ${className}`} dir="rtl">
      {/* WhatsApp - الأهم للسوق العربي */}
      <Button
        variant="outline"
        size={buttonSize}
        onClick={() => handlePlatformShare("whatsapp")}
        className="bg-[#25D366]/10 hover:bg-[#25D366]/20 border-[#25D366]/30 text-[#25D366] dark:text-[#25D366]"
        data-testid="button-share-whatsapp"
        title="مشاركة عبر واتساب"
      >
        <MessageCircle className="h-4 w-4" />
        {showLabels && <span>واتساب</span>}
      </Button>

      {/* Twitter/X */}
      <Button
        variant="outline"
        size={buttonSize}
        onClick={() => handlePlatformShare("twitter")}
        className="bg-foreground/5 hover:bg-foreground/10 border-foreground/20"
        data-testid="button-share-twitter"
        title="مشاركة عبر تويتر"
      >
        <SiX className="h-3.5 w-3.5" />
        {showLabels && <span>تويتر</span>}
      </Button>

      {/* Telegram */}
      <Button
        variant="outline"
        size={buttonSize}
        onClick={() => handlePlatformShare("telegram")}
        className="bg-[#0088cc]/10 hover:bg-[#0088cc]/20 border-[#0088cc]/30 text-[#0088cc] dark:text-[#0088cc]"
        data-testid="button-share-telegram"
        title="مشاركة عبر تيليجرام"
      >
        <Send className="h-4 w-4" />
        {showLabels && <span>تيليجرام</span>}
      </Button>

      {/* Facebook */}
      <Button
        variant="outline"
        size={buttonSize}
        onClick={() => handlePlatformShare("facebook")}
        className="bg-[#1877F2]/10 hover:bg-[#1877F2]/20 border-[#1877F2]/30 text-[#1877F2] dark:text-[#1877F2]"
        data-testid="button-share-facebook"
        title="مشاركة عبر فيسبوك"
      >
        <Facebook className="h-4 w-4" />
        {showLabels && <span>فيسبوك</span>}
      </Button>

      {/* LinkedIn */}
      <Button
        variant="outline"
        size={buttonSize}
        onClick={() => handlePlatformShare("linkedin")}
        className="bg-[#0A66C2]/10 hover:bg-[#0A66C2]/20 border-[#0A66C2]/30 text-[#0A66C2] dark:text-[#0A66C2]"
        data-testid="button-share-linkedin"
        title="مشاركة عبر لينكد إن"
      >
        <Linkedin className="h-4 w-4" />
        {showLabels && <span>لينكد إن</span>}
      </Button>

      {/* Copy Link */}
      <Button
        variant="outline"
        size={buttonSize}
        onClick={handleCopyLink}
        className={copied ? "bg-success/10 border-success/30 text-success" : ""}
        data-testid="button-copy-link"
        title="نسخ الرابط"
      >
        {copied ? (
          <Check className="h-4 w-4" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
        {showLabels && <span>{copied ? "تم النسخ" : "نسخ"}</span>}
      </Button>

      {/* Native Share (Mobile) */}
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <Button
          variant="outline"
          size={buttonSize}
          onClick={handleNativeShare}
          className="md:hidden"
          data-testid="button-native-share"
          title="مشاركة"
        >
          <Share2 className="h-4 w-4" />
          {showLabels && <span>مشاركة</span>}
        </Button>
      )}
    </div>
  );
}
