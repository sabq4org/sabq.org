/* eslint-disable no-console -- Existing editor diagnostics are outside this upload-routing change. */
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { TwitterEmbed } from "./editor-extensions/TwitterEmbed";
import { ImageGallery } from "./editor-extensions/ImageGallery";
import { VideoEmbed } from "./editor-extensions/VideoEmbed";
import { galleryStore } from "@/lib/galleryStore";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Link as LinkIcon,
  Image as ImageIcon,
  AlignRight,
  AlignCenter,
  AlignLeft,
  Code2,
  Palette,
  Smile,
  Twitter,
  Images,
  Youtube as YoutubeIcon,
  Video,
  Sparkles,
  Wand2,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import EmojiPicker, { EmojiClickData, Theme as EmojiPickerTheme } from 'emoji-picker-react';
import { ImageUploadDialog } from "./ImageUploadDialog";
import { AIImageGeneratorDialog } from "./AIImageGeneratorDialog";
import { useTheme } from "./ThemeProvider";

// Twitter widgets type declaration
declare global {
  interface Window {
    twttr?: {
      widgets: {
        load: (element?: HTMLElement) => void;
      };
    };
  }
}

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editorRef?: (editor: Editor | null) => void;
  dir?: "rtl" | "ltr";
  disabled?: boolean;
  imageUploadPurpose?: string;
}

function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  children,
  title
}: {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <Button
      type="button"
      variant={isActive ? "default" : "ghost"}
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="h-10 w-10 sm:h-8 sm:w-8 p-0 shrink-0"
      title={title}
      data-testid={`button-${title.replace(/\s+/g, '-')}`}
    >
      {children}
    </Button>
  );
}

export function RichTextEditor({ 
  content, 
  onChange, 
  placeholder = "ابدأ الكتابة...",
  editorRef,
  dir = "rtl",
  disabled = false,
  imageUploadPurpose,
}: RichTextEditorProps) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [twitterDialogOpen, setTwitterDialogOpen] = useState(false);
  const [twitterUrl, setTwitterUrl] = useState("");
  const [galleryDialogOpen, setGalleryDialogOpen] = useState(false);
  const [youtubeDialogOpen, setYoutubeDialogOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [aiImageDialogOpen, setAiImageDialogOpen] = useState(false);
  const [isSmartFormatting, setIsSmartFormatting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { theme } = useTheme();
  
  // Check if user is a reporter - reporters have restricted AI features
  const isReporter = user?.role === 'reporter' || (user?.roles && user.roles.some((r: any) => r.name === 'reporter' || r === 'reporter'));

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline",
          rel: "noopener noreferrer",
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "max-w-full h-auto rounded-md my-4",
        },
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Underline,
      TextStyle,
      Color,
      TwitterEmbed,
      ImageGallery.configure({ uploadPurpose: imageUploadPurpose }),
      VideoEmbed,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "rich-text-editor__content prose prose-sm sm:prose lg:prose-lg xl:prose-xl dark:prose-invert max-w-none focus:outline-none min-h-[300px] px-4 py-3",
        dir: dir,
        "data-testid": "rich-text-editor-content",
      },
    },
    onUpdate: ({ editor }) => {
      let html = editor.getHTML();
      console.log('[RichTextEditor] onUpdate called, HTML length:', html.length);
      
      // Update HTML with gallery data from the store (bypasses TipTap atom node issue)
      if (html.includes('data-image-gallery')) {
        console.log('[RichTextEditor] Found image gallery, updating from store');
        html = galleryStore.updateHtmlWithGalleryData(html);
        const match = html.match(/data-images="([^"]*)"/);
        console.log('[RichTextEditor] Gallery data-images after update:', match ? match[1].substring(0, 200) : 'not found');
      }
      onChange(html);
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  // Update editor editable state when disabled prop changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const loadTweets = () => {
      if (cancelled) return;
      const editorElement = editor.view.dom;
      const tweetBlocks = editorElement.querySelectorAll('blockquote.twitter-tweet');
      tweetBlocks.forEach((block) => block.setAttribute('data-theme', theme));
      if (tweetBlocks.length > 0) window.twttr?.widgets?.load(editorElement);
    };

    const pollForApi = (retries = 0) => {
      if (cancelled) return;
      if (window.twttr?.widgets) {
        loadTweets();
      } else if (retries < 20) {
        timers.push(setTimeout(() => pollForApi(retries + 1), 250));
      }
    };

    const existingScript = document.querySelector('script[src="https://platform.twitter.com/widgets.js"]');

    if (existingScript) {
      pollForApi();
    } else {
      const script = document.createElement('script');
      script.src = 'https://platform.twitter.com/widgets.js';
      script.async = true;
      script.charset = 'utf-8';
      script.onload = () => pollForApi();
      document.body.appendChild(script);
    }

    return () => {
      cancelled = true;
      timers.forEach(t => clearTimeout(t));
    };
  }, [editor, theme]);

  useEffect(() => {
    if (editorRef) {
      editorRef(editor);
    }
    return () => {
      if (editorRef) {
        editorRef(null);
      }
    };
  }, [editor, editorRef]);

  const handleSetLink = () => {
    if (linkUrl && editor) {
      editor.chain().focus().setLink({ href: linkUrl }).run();
      setLinkUrl("");
      setLinkDialogOpen(false);
    }
  };

  const handleUnsetLink = () => {
    if (editor) {
      editor.chain().focus().unsetLink().run();
    }
  };

  const handleImageUploaded = (url: string) => {
    if (editor) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const handleAIImageGenerated = (url: string, alt?: string) => {
    if (editor) {
      // Insert the AI-generated image with alt text
      editor.chain().focus().setImage({ 
        src: url,
        alt: alt || "صورة مولدة بالذكاء الاصطناعي",
        title: alt || "صورة مولدة بالذكاء الاصطناعي"
      }).run();
    }
  };


  const handleAddTwitter = () => {
    if (!twitterUrl || !editor) return;

    // Normalize URL: Convert x.com to twitter.com for compatibility
    let normalizedUrl = twitterUrl.trim();
    normalizedUrl = normalizedUrl.replace(/^https?:\/\/(www\.)?x\.com/, 'https://twitter.com');
    normalizedUrl = normalizedUrl.split('?')[0]; // Remove query parameters like ?s=46
    
    console.log('[RichTextEditor] Adding Twitter embed:', {
      original: twitterUrl,
      normalized: normalizedUrl
    });

    // Insert the tweet embed with normalized URL
    editor.chain().focus().setTwitterEmbed({ url: normalizedUrl }).run();
    setTwitterUrl("");
    setTwitterDialogOpen(false);

    // Wait for DOM to update, then render the tweet
    setTimeout(() => {
      const renderTweet = (retries = 0) => {
        const editorElement = editor.view.dom;
        const tweetBlocks = editorElement.querySelectorAll('blockquote.twitter-tweet');
        
        console.log(`[RichTextEditor] Found ${tweetBlocks.length} tweet blocks after insert`);
        
        tweetBlocks.forEach((block, index) => {
          block.setAttribute('data-theme', theme);
          const link = block.querySelector('a');
          const href = link?.getAttribute('href');
          console.log(`[RichTextEditor] Tweet block ${index + 1}:`, {
            theme,
            href,
            hasLink: !!link,
            blockHTML: block.outerHTML.substring(0, 200)
          });
        });
        
        if (window.twttr?.widgets) {
          console.log('[RichTextEditor] Calling widgets.load() to render tweets');
          window.twttr.widgets.load(editorElement);
          console.log('[RichTextEditor] ✅ widgets.load() called successfully');
        } else if (retries < 10) {
          console.warn(`[RichTextEditor] Twitter widgets not ready, retrying... (attempt ${retries + 1})`);
          setTimeout(() => renderTweet(retries + 1), 500);
        } else {
          console.error('[RichTextEditor] ❌ Twitter widgets failed to load after 5 seconds');
        }
      };

      renderTweet();
    }, 100);
  };

  const handleGalleryUploaded = (images: { src: string; caption?: string }[]) => {
    // Insert all gallery images with captions at once
    if (editor && images.length > 0) {
      const galleryId = galleryStore.generateId();
      editor.chain().focus().setImageGallery({ images, galleryId }).run();
      // Also store in galleryStore for immediate sync
      galleryStore.set(galleryId, images);
    }
  };

  const handleAddYoutube = () => {
    if (youtubeUrl && editor) {
      const result = editor.chain().focus().setVideoEmbed({ url: youtubeUrl }).run();
      if (result) {
        setYoutubeUrl("");
        setYoutubeDialogOpen(false);
      } else {
        alert("رابط الفيديو غير صحيح. يرجى التأكد من أن الرابط من YouTube أو Dailymotion.");
      }
    }
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    if (editor) {
      editor.chain().focus().insertContent(emojiData.emoji).run();
      setEmojiPickerOpen(false);
    }
  };

  // Smart AI Auto-Format handler
  const handleSmartFormat = async () => {
    if (!editor) return;
    
    const text = editor.getText();
    if (!text || text.trim().length < 20) {
      toast({
        title: "محتوى غير كافٍ",
        description: "يرجى كتابة نص أطول للتنسيق الذكي (20 حرف على الأقل)",
        variant: "destructive",
      });
      return;
    }

    setIsSmartFormatting(true);
    
    try {
      const response = await apiRequest<{
        strategy: string;
        formatted_text: string;
        highlights: Array<{
          text: string;
          type: string;
          reason: string;
          importance: number;
        }>;
      }>("/api/ai/auto-format", {
        method: "POST",
        body: JSON.stringify({
          text,
          rules: {
            bold_names: true,
            bold_numbers: true,
            bold_institutions: true,
            max_bold_per_paragraph: 5
          }
        }),
      });

      if (response.formatted_text) {
        // Convert Markdown bold (**text**) to HTML
        const htmlContent = response.formatted_text
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/\n/g, '<br/>');
        
        // Set the formatted content
        editor.commands.setContent(htmlContent);
        
        toast({
          title: "تم التنسيق بنجاح",
          description: `تم تطبيق ${response.highlights?.length || 0} تنسيق ذكي على النص`,
        });
      }
    } catch (error: any) {
      console.error("Smart format error:", error);
      toast({
        title: "فشل التنسيق",
        description: error.message || "حدث خطأ أثناء التنسيق الذكي",
        variant: "destructive",
      });
    } finally {
      setIsSmartFormatting(false);
    }
  };

  const textColors = [
    { name: 'أسود', value: '#000000' },
    { name: 'أحمر', value: '#ef4444' },
    { name: 'أزرق', value: '#3b82f6' },
    { name: 'أخضر', value: '#22c55e' },
    { name: 'أصفر', value: '#eab308' },
    { name: 'برتقالي', value: '#f97316' },
    { name: 'بنفسجي', value: '#a855f7' },
    { name: 'وردي', value: '#ec4899' },
  ];

  if (!editor) {
    return null;
  }

  return (
    <div
      className="rich-text-editor border rounded-md"
      dir={dir}
      data-editor-shell
      data-testid="rich-text-editor"
    >
      {/* Toolbar */}
      <div className="rich-text-editor__toolbar flex flex-wrap items-center gap-1 sm:gap-1 p-2 border-b">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="عريض"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="مائل"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
          title="تحته خط"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive("strike")}
          title="يتوسطه خط"
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          isActive={editor.isActive("code")}
          title="كود"
        >
          <Code className="h-4 w-4" />
        </ToolbarButton>

        {/* Text Color */}
        <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="لون النص"
              data-testid="button-text-color"
            >
              <Palette className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60">
            <div className="grid grid-cols-4 gap-2">
              {textColors.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  className="h-8 w-8 rounded border hover-elevate"
                  style={{ backgroundColor: color.value }}
                  onClick={() => {
                    editor.chain().focus().setColor(color.value).run();
                    setColorPickerOpen(false);
                  }}
                  title={color.name}
                  data-testid={`color-${color.name}`}
                />
              ))}
              <button
                type="button"
                className="h-8 w-8 rounded border bg-card hover-elevate flex items-center justify-center text-xs"
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
                  setColorPickerOpen(false);
                }}
                title="إزالة اللون"
                data-testid="color-reset"
              >
                ×
              </button>
            </div>
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive("heading", { level: 1 })}
          title="عنوان 1"
        >
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive("heading", { level: 2 })}
          title="عنوان 2"
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive("heading", { level: 3 })}
          title="عنوان 3"
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="قائمة نقطية"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="قائمة مرقمة"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive("codeBlock")}
          title="كتلة كود"
        >
          <Code2 className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive("blockquote")}
          title="اقتباس"
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          isActive={editor.isActive({ textAlign: "right" })}
          title="محاذاة لليمين"
        >
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          isActive={editor.isActive({ textAlign: "center" })}
          title="محاذاة للوسط"
        >
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          isActive={editor.isActive({ textAlign: "left" })}
          title="محاذاة لليسار"
        >
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarButton
          onClick={() => {
            const previousUrl = editor.getAttributes("link").href;
            setLinkUrl(previousUrl || "");
            setLinkDialogOpen(true);
          }}
          isActive={editor.isActive("link")}
          title="إضافة رابط"
        >
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => setImageDialogOpen(true)}
          title="إضافة صورة"
        >
          <ImageIcon className="h-4 w-4" />
        </ToolbarButton>

        {!isReporter && (
          <ToolbarButton
            onClick={() => setAiImageDialogOpen(true)}
            title="توليد صورة بالذكاء الاصطناعي"
          >
            <Sparkles className="h-4 w-4 text-primary" />
          </ToolbarButton>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleSmartFormat}
          disabled={isSmartFormatting}
          className="h-8 gap-1 px-2"
          title="تنسيق ذكي بالذكاء الاصطناعي"
          data-testid="button-smart-format"
        >
          {isSmartFormatting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4 text-purple-500" />
          )}
          <span className="text-xs hidden sm:inline">تنسيق ذكي</span>
        </Button>

        <ToolbarButton
          onClick={() => setGalleryDialogOpen(true)}
          title="ألبوم صور"
        >
          <Images className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => setYoutubeDialogOpen(true)}
          title="فيديو يوتيوب"
        >
          <YoutubeIcon className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => setTwitterDialogOpen(true)}
          title="تغريدة"
        >
          <Twitter className="h-4 w-4" />
        </ToolbarButton>

        {/* Emoji Picker */}
        <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="إيموجي"
              data-testid="button-emoji"
            >
              <Smile className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[350px] p-0" align="start" side="bottom">
            <div className="rounded-md overflow-hidden">
              <EmojiPicker
                onEmojiClick={handleEmojiClick}
                theme={theme === "dark" ? EmojiPickerTheme.DARK : EmojiPickerTheme.LIGHT}
                searchPlaceHolder="بحث..."
                width={350}
                height={350}
                previewConfig={{ showPreview: false }}
                skinTonesDisabled
                searchDisabled={false}
                lazyLoadEmojis={true}
              />
            </div>
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="تراجع"
        >
          <Undo className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="إعادة"
        >
          <Redo className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} className="rich-text-editor__surface" />

      {/* Link Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة رابط</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="link-url">عنوان الرابط (URL)</Label>
              <Input
                id="link-url"
                placeholder="https://example.com"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                dir="ltr"
                data-testid="input-link-url"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {editor.isActive("link") && (
              <Button
                variant="destructive"
                onClick={() => {
                  handleUnsetLink();
                  setLinkDialogOpen(false);
                }}
                data-testid="button-remove-link"
              >
                إزالة الرابط
              </Button>
            )}
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSetLink} disabled={!linkUrl} data-testid="button-add-link">
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Upload Dialog */}
      <ImageUploadDialog
        open={imageDialogOpen}
        onOpenChange={setImageDialogOpen}
        onImageUploaded={handleImageUploaded}
        multiple={false}
        uploadPurpose={imageUploadPurpose}
      />

      {/* Twitter Dialog */}
      <Dialog open={twitterDialogOpen} onOpenChange={setTwitterDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة تغريدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="twitter-url">رابط التغريدة</Label>
              <Input
                id="twitter-url"
                placeholder="https://twitter.com/username/status/1234567890"
                value={twitterUrl}
                onChange={(e) => setTwitterUrl(e.target.value)}
                dir="ltr"
                data-testid="input-twitter-url"
              />
              <p className="text-xs text-muted-foreground">
                الصق رابط التغريدة من تويتر (X) وستظهر التغريدة كاملة في المحتوى
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTwitterDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleAddTwitter} disabled={!twitterUrl} data-testid="button-add-twitter">
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Gallery Upload Dialog */}
      <ImageUploadDialog
        open={galleryDialogOpen}
        onOpenChange={setGalleryDialogOpen}
        onImageUploaded={() => {}}
        onGalleryImagesUploaded={handleGalleryUploaded}
        multiple={true}
        maxFiles={10}
        showCaptions={true}
        uploadPurpose={imageUploadPurpose ? `${imageUploadPurpose}-gallery` : undefined}
      />

      {/* YouTube Dialog */}
      <Dialog open={youtubeDialogOpen} onOpenChange={setYoutubeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة فيديو</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="youtube-url">رابط الفيديو (YouTube أو Dailymotion)</Label>
              <Input
                id="youtube-url"
                placeholder="https://www.youtube.com/watch?v=... أو https://www.dailymotion.com/video/..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                dir="ltr"
                data-testid="input-youtube-url"
              />
              <p className="text-xs text-muted-foreground">
                يدعم روابط YouTube و Dailymotion
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setYoutubeDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleAddYoutube} disabled={!youtubeUrl} data-testid="button-add-youtube">
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Image Generator Dialog */}
      <AIImageGeneratorDialog
        open={aiImageDialogOpen}
        onClose={() => setAiImageDialogOpen(false)}
        onImageGenerated={handleAIImageGenerated}
      />
    </div>
  );
}
