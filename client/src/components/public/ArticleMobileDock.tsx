import { useEffect, useState } from "react";
import { Bookmark, Heart, Share2 } from "lucide-react";
import { Drawer as DrawerPrimitive } from "vaul";
import { Drawer, DrawerDescription, DrawerOverlay, DrawerPortal, DrawerTitle } from "@/components/ui/drawer";
import { SocialShareBar } from "@/components/SocialShareBar";
import {
  ARTICLE_TEXT_SCALE_STEPS,
  articleTextScaleLabel,
} from "@/lib/articleTextScale";

interface ArticleMobileDockProps {
  title: string;
  shareUrl: string;
  copyUrl: string;
  description: string;
  articleId: string;
  hasReacted: boolean;
  reactionsCount: number;
  onReact: () => void;
  reactPending: boolean;
  isBookmarked: boolean;
  onBookmark: () => void;
  bookmarkPending: boolean;
  textScale: number;
  onTextScaleChange: (scale: number) => void;
  onShareIntent: () => void;
}

/**
 * Floating action pill for the article page on phones (hidden from lg up).
 * It appears once the top share row has scrolled away and hides again when the
 * bottom actions row is on screen, so the same buttons are never shown twice.
 * Share and text size open one bottom sheet (vaul: follows the finger, closes on
 * a downward flick). The dock and sheet only add shortcuts; the existing share
 * and engagement rows stay where they are.
 */
export function ArticleMobileDock(props: ArticleMobileDockProps) {
  const [visible, setVisible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    // Looked up on every frame of scrolling: the article body re-renders these
    // rows (ads, deferred sections), so a node captured once can go stale.
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = document.querySelector('[data-testid="article-top-share"]');
      const bottom = document.querySelector('[data-testid="article-actions"]');
      const topPassed = !!top && top.getBoundingClientRect().bottom < 0;
      const bottomRect = bottom?.getBoundingClientRect();
      const bottomShown = !!bottomRect && bottomRect.top < window.innerHeight && bottomRect.bottom > 0;
      setVisible(topPassed && !bottomShown);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  // The footer's floating back-to-top button sits where the dock does on phones.
  useEffect(() => {
    document.body.classList.toggle("article-dock-on", visible);
    return () => document.body.classList.remove("article-dock-on");
  }, [visible]);

  // iOS Safari only applies :active (the press feedback) when a touch listener exists.
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);

  const scaleIndex = Math.max(0, (ARTICLE_TEXT_SCALE_STEPS as readonly number[]).indexOf(props.textScale));

  return (
    <>
      <div className="article-dock lg:hidden" data-visible={visible ? "true" : "false"} aria-hidden={!visible}>
        <div className="article-dock-pill" role="toolbar" aria-label="أدوات الخبر">
          <button
            type="button"
            onClick={props.onReact}
            disabled={props.reactPending}
            aria-pressed={props.hasReacted}
            tabIndex={visible ? 0 : -1}
            data-active={props.hasReacted ? "true" : "false"}
            data-testid="dock-react"
          >
            <Heart className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">إعجاب</span>
            {props.reactionsCount > 0 && <span className="article-dock-count">{props.reactionsCount}</span>}
          </button>
          <button
            type="button"
            onClick={props.onBookmark}
            disabled={props.bookmarkPending}
            aria-pressed={props.isBookmarked}
            tabIndex={visible ? 0 : -1}
            data-active={props.isBookmarked ? "true" : "false"}
            data-testid="dock-bookmark"
          >
            <Bookmark className="h-5 w-5" aria-hidden="true" />
            <span>{props.isBookmarked ? "محفوظ" : "حفظ"}</span>
          </button>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            tabIndex={visible ? 0 : -1}
            aria-label="حجم الخط"
            data-testid="dock-text-size"
          >
            <span className="article-dock-aa" aria-hidden="true">Aa</span>
          </button>
          <button
            type="button"
            className="article-dock-primary"
            onClick={() => {
              props.onShareIntent();
              setSheetOpen(true);
            }}
            tabIndex={visible ? 0 : -1}
            data-testid="dock-share"
          >
            <Share2 className="h-5 w-5" aria-hidden="true" />
            <span>مشاركة</span>
          </button>
        </div>
      </div>

      <Drawer open={sheetOpen} onOpenChange={setSheetOpen} shouldScaleBackground={false}>
        <DrawerPortal>
          <DrawerOverlay className="bg-[#1B2B3A]/30" />
          <DrawerPrimitive.Content
            className="article-sheet fixed inset-x-0 bottom-0 z-50 flex flex-col bg-background"
            dir="rtl"
            data-testid="article-share-sheet"
          >
          <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-muted-foreground/25" aria-hidden="true" />
          <div className="article-sheet-body">
            <DrawerTitle className="article-sheet-title">مشاركة الخبر</DrawerTitle>
            <DrawerDescription className="article-sheet-hint">اسحب الورقة للأسفل لإغلاقها</DrawerDescription>
            <SocialShareBar
              title={props.title}
              url={props.shareUrl}
              copyUrl={props.copyUrl}
              description={props.description}
              articleId={props.articleId}
              className="article-sheet-share"
            />
            <div className="article-sheet-size">
              <div className="article-sheet-size-row">
                <label htmlFor="article-text-scale">حجم خط الخبر</label>
                <span className="article-sheet-size-value">{articleTextScaleLabel(props.textScale)}</span>
              </div>
              <input
                id="article-text-scale"
                type="range"
                min={0}
                max={ARTICLE_TEXT_SCALE_STEPS.length - 1}
                step={1}
                value={scaleIndex}
                onChange={(e) => props.onTextScaleChange(ARTICLE_TEXT_SCALE_STEPS[Number(e.target.value)] ?? 1)}
                data-testid="article-text-scale"
              />
            </div>
          </div>
          </DrawerPrimitive.Content>
        </DrawerPortal>
      </Drawer>
    </>
  );
}
