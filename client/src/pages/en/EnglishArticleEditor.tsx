import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Save,
  Send,
  ArrowLeft,
  Sparkles,
  ImagePlus,
  Loader2,
  Upload,
  Zap,
  AlertCircle,
  Calendar,
  Hash,
  EyeOff,
  Image as ImageIcon,
  LayoutGrid,
} from "lucide-react";
import { EnglishDashboardLayout } from "@/components/en/EnglishDashboardLayout";
import { SeoPreview } from "@/components/SeoPreview";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Category, ArticleWithDetails, EnCategory } from "@shared/schema";
import { RichTextEditor } from "@/components/RichTextEditor";
import { TagInput } from "@/components/TagInput";
import { ReporterSelect } from "@/components/ReporterSelect";
import { OpinionAuthorSelect } from "@/components/OpinionAuthorSelect";
import { ImageFocalPointPicker } from "@/components/ImageFocalPointPicker";
import { SmartLinksPanel } from "@/components/SmartLinksPanel";
import { MediaLibraryPicker } from "@/components/dashboard/MediaLibraryPicker";
import { InlineHeadlineSuggestions } from "@/components/InlineHeadlineSuggestions";
import { AIImageGeneratorDialog } from "@/components/AIImageGeneratorDialog";
import { InfographicGeneratorDialog } from "@/components/InfographicGeneratorDialog";
import type { Editor } from "@tiptap/react";

export default function EnglishArticleEditor() {
  const params = useParams<{ id: string }>();
  const [location, navigate] = useLocation();
  
  // Extract pathname without query string
  const pathname = location.split('?')[0];
  const isNewArticle = pathname.endsWith('/new');
  
  // Extract id from params or pathname
  const id = params.id || pathname.split('/').pop();
  
  // Extract query parameters from URL
  const queryParams = new URLSearchParams(location.split('?')[1] || '');
  const typeParam = queryParams.get('type') as "news" | "opinion" | "analysis" | "column" | null;
  
  console.log('[EnglishArticleEditor] params:', params);
  console.log('[EnglishArticleEditor] location:', location);
  console.log('[EnglishArticleEditor] pathname:', pathname);
  console.log('[EnglishArticleEditor] extracted id:', id);
  console.log('[EnglishArticleEditor] isNewArticle:', isNewArticle);
  console.log('[EnglishArticleEditor] type query param:', typeParam);

  // Article fields (single language - English only)
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [categoryId, setCategoryId] = useState("");
  // 📰 Default reporter: صحيفة سبق (newspaper account) for new articles
  const NEWSPAPER_ACCOUNT_ID = 'RnP7eDOAl5T5rGpib9_8d';
  const [reporterId, setReporterId] = useState<string | null>(isNewArticle ? NEWSPAPER_ACCOUNT_ID : null);
  const [opinionAuthorId, setOpinionAuthorId] = useState<string | null>(null);
  const [articleType, setArticleType] = useState<"news" | "opinion" | "analysis" | "column">(
    typeParam || "news"
  );
  
  // Debug: Track reporterId changes
  useEffect(() => {
    console.log('[EnglishArticleEditor] reporterId state changed to:', reporterId);
  }, [reporterId]);
  
  const [imageUrl, setImageUrl] = useState("");
  const [imageFocalPoint, setImageFocalPoint] = useState<{ x: number; y: number } | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  
  // New fields
  const [newsType, setNewsType] = useState<"breaking" | "featured" | "regular">("regular");
  const [publishType, setPublishType] = useState<"instant" | "scheduled">("instant");
  const [scheduledAt, setScheduledAt] = useState("");
  const [hideFromHomepage, setHideFromHomepage] = useState(false);
  
  // SEO fields
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [republish, setRepublish] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isAnalyzingSEO, setIsAnalyzingSEO] = useState(false);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [showAIImageDialog, setShowAIImageDialog] = useState(false);
  const [showInfographicDialog, setShowInfographicDialog] = useState(false);

  const { toast } = useToast();

  // Check authentication and redirect if needed
  const { user, isLoading: isUserLoading } = useAuth({ redirectToLogin: true });

  // Fetch categories - using English endpoint
  const { data: allCategoriesRaw } = useQuery<EnCategory[]>({
    queryKey: ["/api/en/categories"],
  });
  const allCategories = Array.isArray(allCategoriesRaw) ? allCategoriesRaw : [];

  // Filter to show only core categories (exclude smart, dynamic, seasonal)
  const categories = allCategories.filter(cat => cat.type === "core" || !cat.type);

  // Fetch article - using English endpoint
  const { data: article } = useQuery<ArticleWithDetails>({
    queryKey: isNewArticle ? ["en-article-editor-new"] : ["/api/en/dashboard/articles", id],
    enabled: !isNewArticle && !!user,
    refetchOnMount: true, // Always fetch fresh data when opening editor
    staleTime: 0, // Consider data stale immediately to ensure fresh data
  });

  // Load article data when editing
  useEffect(() => {
    if (article && !isNewArticle) {
      console.log('[EnglishArticleEditor] Loading article data:', {
        articleId: article.id,
        reporterId: article.reporterId,
        reporterIdType: typeof article.reporterId,
        authorId: article.authorId,
        author: article.author,
      });
      setTitle(article.title);
      setSubtitle(article.subtitle || "");
      setSlug(article.slug);
      setContent(article.content);
      setExcerpt(article.excerpt || "");
      setCategoryId(article.categoryId || "");
      
      // Use reporterId as is - system supports various ID formats (nanoid, UUID, etc.)
      const validReporterId = article.reporterId || null;
      console.log('[EnglishArticleEditor] Setting reporterId:', {
        original: article.reporterId,
        validated: validReporterId,
      });
      setReporterId(validReporterId);
      
      // Set opinionAuthorId from article.authorId for opinion articles
      if (article.articleType === "opinion") {
        setOpinionAuthorId(article.authorId || null);
      }
      
      // Validate imageUrl - accept http/https URLs or relative paths starting with /
      const validImageUrl = article.imageUrl && (
        article.imageUrl.match(/^https?:\/\/.+/) || article.imageUrl.startsWith('/')
      ) ? article.imageUrl : "";
      setImageUrl(validImageUrl);
      setImageFocalPoint((article as any).imageFocalPoint || null);
      setArticleType((article.articleType as any) || "news");
      setNewsType((article.newsType as any) || "regular");
      setPublishType((article.publishType as any) || "instant");
      setScheduledAt(article.scheduledAt ? new Date(article.scheduledAt).toISOString().slice(0, 16) : "");
      setHideFromHomepage(article.hideFromHomepage || false);
      
      // Validate SEO fields - truncate if too long (legacy data cleanup)
      const validMetaTitle = article.seo?.metaTitle 
        ? article.seo.metaTitle.substring(0, 70) 
        : "";
      const validMetaDescription = article.seo?.metaDescription 
        ? article.seo.metaDescription.substring(0, 160) 
        : "";
      setMetaTitle(validMetaTitle);
      setMetaDescription(validMetaDescription);
      setKeywords(article.seo?.keywords || []);
      setStatus(article.status as any);
    }
  }, [article, isNewArticle]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Error",
        description: "Please select an image file only",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Image size must be less than 10MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingImage(true);

    try {
      const uploadData = await apiRequest("/api/objects/upload", {
        method: "POST",
      }) as { uploadURL: string };

      const uploadResponse = await fetch(uploadData.uploadURL, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload image");
      }

      // Extract the actual file path without query parameters
      const fileUrl = uploadData.uploadURL.split('?')[0];
      console.log("[Image Upload] File URL:", fileUrl);

      const aclData = await apiRequest("/api/article-images", {
        method: "PUT",
        body: JSON.stringify({ imageURL: fileUrl }),
        headers: {
          "Content-Type": "application/json",
        },
      }) as { objectPath: string };

      console.log("[Image Upload] ACL Response:", aclData);
      console.log("[Image Upload] Object Path:", aclData.objectPath);

      setImageUrl(aclData.objectPath);

      toast({
        title: "Upload Successful",
        description: `URL: ${aclData.objectPath.substring(0, 50)}...`,
      });
    } catch (error) {
      console.error("Error uploading image:", error);
      toast({
        title: "Error",
        description: "Failed to upload image",
        variant: "destructive",
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const saveArticleMutation = useMutation({
    mutationFn: async ({ publishNow }: { publishNow: boolean }) => {
      console.log('[Save Article] Starting save...', {
        isNewArticle,
        publishNow,
        title,
        slug,
        content: content?.substring(0, 50)
      });
      
      console.log('[Save Article] Current reporterId state:', {
        reporterId,
        reporterIdType: typeof reporterId,
        reporterIdIsNull: reporterId === null,
        reporterIdValue: JSON.stringify(reporterId)
      });

      // Use reporterId as is - no UUID validation needed since system uses various ID formats (nanoid, UUID, etc.)
      const validReporterId = reporterId || null;
      
      console.log('[Save Article] After validation:', {
        validReporterId,
        willSendAsNull: validReporterId === null
      });
      
      const articleData: any = {
        title,
        slug,
        content,
        excerpt,
        categoryId: categoryId || null,
        imageUrl: imageUrl || "",
        imageFocalPoint: imageFocalPoint || null,
        articleType,
        publishType,
        scheduledAt: publishType === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        hideFromHomepage,
        status: publishNow 
          ? (publishType === "scheduled" ? "scheduled" : "published")
          : "draft",
        seo: {
          metaTitle: metaTitle ? metaTitle.substring(0, 70) : (title ? title.substring(0, 70) : ""),
          metaDescription: metaDescription ? metaDescription.substring(0, 160) : (excerpt ? excerpt.substring(0, 160) : ""),
          keywords: keywords,
        },
      };

      // Add fields specific to news articles (not for opinion)
      if (articleType !== "opinion") {
        articleData.subtitle = subtitle;
        articleData.reporterId = validReporterId;
        articleData.newsType = newsType;
        articleData.isFeatured = newsType === "featured";
      } else {
        // Opinion articles always use regular newsType
        articleData.newsType = "regular";
        articleData.isFeatured = false;
        // Add opinionAuthorId for opinion articles
        if (opinionAuthorId) {
          articleData.opinionAuthorId = opinionAuthorId;
        }
      }

      // For new articles, set publishedAt based on publish settings
      if (isNewArticle) {
        if (publishNow && publishType === "instant") {
          articleData.publishedAt = new Date().toISOString();
        } else if (publishNow && publishType === "scheduled" && scheduledAt) {
          articleData.publishedAt = new Date(scheduledAt).toISOString();
        }
      } else {
        // For updates, include republish flag
        // Backend will handle publishedAt based on this flag
        articleData.republish = republish;
      }

      console.log('[Save Article] Article data prepared:', articleData);
      console.log('[Save Article] Detailed SEO data:', {
        metaTitle: articleData.seo.metaTitle,
        metaTitleLength: articleData.seo.metaTitle?.length,
        metaDescription: articleData.seo.metaDescription,
        metaDescLength: articleData.seo.metaDescription?.length,
        imageUrl: articleData.imageUrl,
        imageUrlType: typeof articleData.imageUrl,
        reporterId: articleData.reporterId,
        reporterIdType: typeof articleData.reporterId,
      });

      if (isNewArticle) {
        console.log('[Save Article] Creating NEW article via POST /api/en/articles');
        const result = await apiRequest("/api/en/articles", {
          method: "POST",
          body: JSON.stringify(articleData),
        });
        console.log('[Save Article] POST result:', result);
        return result;
      } else {
        console.log('[Save Article] Updating EXISTING article via PATCH /api/en/articles/' + id);
        const result = await apiRequest(`/api/en/articles/${id}`, {
          method: "PATCH",
          body: JSON.stringify(articleData),
        });
        console.log('[Save Article] PATCH result:', result);
        return result;
      }
    },
    onSuccess: (data, variables) => {
      // Invalidate all article-related queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/en/articles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/en/dashboard/articles"] });
      
      // If updating existing article, also invalidate its specific query
      if (!isNewArticle && id) {
        queryClient.invalidateQueries({ queryKey: ["/api/en/articles", id] });
      }
      
      toast({
        title: variables.publishNow ? "Published Successfully" : "Saved Successfully",
        description: variables.publishNow ? "Article published successfully" : "Article saved as draft",
      });
      
      // Navigate back to articles list
      setTimeout(() => {
        navigate("/en/dashboard/articles");
      }, 1000);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save article",
        variant: "destructive",
      });
    },
  });

  const generateSummaryMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/ai/summarize", {
        method: "POST",
        body: JSON.stringify({ content }),
      });
    },
    onSuccess: (data: { summary: string }) => {
      setExcerpt(data.summary);
      toast({
        title: "Summary Generated",
        description: "AI-generated summary created for the article",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate summary",
        variant: "destructive",
      });
    },
  });

  const generateTitlesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/ai/generate-titles", {
        method: "POST",
        body: JSON.stringify({ content, language: "en" }),
      });
    },
    onSuccess: (data: { titles: string[] }) => {
      if (data.titles.length > 0) {
        setTitle(data.titles[0]);
        setSlug(generateSlug(data.titles[0]));
        toast({
          title: "Titles Generated",
          description: `Suggestions: ${data.titles.join(" | ")}`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate titles",
        variant: "destructive",
      });
    },
  });

  const generateSeoMutation = useMutation({
    mutationFn: async () => {
      let articleId = id;
      
      // If new article (no id), auto-save as draft first
      if (!articleId && title && content) {
        const saveResponse = await apiRequest(`/api/en/articles`, {
          method: "POST",
          body: JSON.stringify({
            title,
            subtitle: subtitle || "",
            content,
            excerpt: excerpt || "",
            status: "draft",
            imageUrl: imageUrl || "",
            imageFocalPoint: imageFocalPoint || null,
            articleType,
            categoryId: categoryId || null,
            reporterId: reporterId || null,
            newsType,
            publishType: "instant",
            hideFromHomepage,
            seo: {
              metaTitle: metaTitle || title.substring(0, 70),
              metaDescription: metaDescription || excerpt.substring(0, 160),
              keywords: keywords,
            },
          }),
        });
        const savedArticle = await saveResponse.json();
        articleId = savedArticle.id;
        
        // Update URL to edit mode
        window.history.replaceState({}, '', `/dashboard/en/articles/edit/${articleId}`);
      }
      
      if (!articleId) {
        throw new Error("Title and content are required");
      }
      
      const response = await apiRequest(`/api/seo/generate`, {
        method: "POST",
        body: JSON.stringify({ articleId, language: "en" }),
      });
      return response;
    },
    onSuccess: (data: {
      seo: {
        metaTitle: string;
        metaDescription: string;
        keywords: string[];
      };
      provider: string;
      model: string;
    }) => {
      // Auto-fill SEO fields from data.seo object
      if (data.seo && data.seo.metaTitle) {
        setMetaTitle(data.seo.metaTitle);
        setMetaDescription(data.seo.metaDescription || "");
        setKeywords(data.seo.keywords || []);
      }
      
      // Invalidate queries to refetch article with updated SEO data
      queryClient.invalidateQueries({ queryKey: ['/api/en/articles', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/en/dashboard/articles', id] });
      
      // Show success toast
      toast({
        title: "SEO Generated Successfully",
        description: `Provider: ${data.provider} | Model: ${data.model}`,
      });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || error.message || "Generation failed";
      toast({
        title: "SEO Generation Failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const analyzeSEOMutation = useMutation({
    mutationFn: async () => {
      if (!id || isNewArticle) {
        throw new Error("Please save the article first before analyzing SEO");
      }
      setIsAnalyzingSEO(true);
      return await apiRequest(`/api/en/articles/${id}/analyze-seo`, {
        method: "POST",
        body: JSON.stringify({ applyChanges: false }),
      });
    },
    onSuccess: (data: {
      seoTitle: string;
      metaDescription: string;
      keywords: string[];
      socialTitle: string;
      socialDescription: string;
      imageAltText: string;
      suggestions: string[];
      score: number;
    }) => {
      setIsAnalyzingSEO(false);
      setMetaTitle(data.seoTitle);
      setMetaDescription(data.metaDescription);
      setKeywords(data.keywords);
      
      toast({
        title: `SEO Analysis - Score: ${data.score}/100`,
        description: `Article analyzed and recommendations applied. ${data.suggestions.length > 0 ? data.suggestions[0] : ''}`,
      });
    },
    onError: (error: Error) => {
      setIsAnalyzingSEO(false);
      toast({
        title: "SEO Analysis Error",
        description: error.message || "Failed to analyze SEO",
        variant: "destructive",
      });
    },
  });

  const generateSmartContentMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/articles/generate-content", {
        method: "POST",
        body: JSON.stringify({ content, language: "en" }),
      });
    },
    onSuccess: (data: {
      mainTitle: string;
      subTitle: string;
      smartSummary: string;
      keywords: string[];
      seo: { metaTitle: string; metaDescription: string };
      suggestedCategory?: string;
      translatedContent?: string;
    }) => {
      // If Arabic content was translated, update the content field
      if (data.translatedContent) {
        setContent(data.translatedContent);
        toast({
          title: "Translation Complete",
          description: "Arabic content translated to professional English",
        });
      }
      
      setTitle(data.mainTitle);
      setSubtitle(data.subTitle);
      setExcerpt(data.smartSummary);
      setKeywords(data.keywords);
      setMetaTitle(data.seo.metaTitle);
      setMetaDescription(data.seo.metaDescription);
      setSlug(generateSlug(data.mainTitle));
      
      // Auto-select reporter if not already set
      const autoSelections: string[] = [];
      if (!reporterId) {
        setReporterId(NEWSPAPER_ACCOUNT_ID);
        autoSelections.push("Reporter");
      }
      
      // Auto-select category based on AI suggestion
      if (data.suggestedCategory && !categoryId && categories.length > 0) {
        const suggestedSlug = data.suggestedCategory.toLowerCase();
        const matchedCategory = categories.find(
          (cat) => cat.slug?.toLowerCase() === suggestedSlug || 
                   cat.name?.toLowerCase().includes(suggestedSlug) ||
                   suggestedSlug.includes(cat.slug?.toLowerCase() || '')
        );
        if (matchedCategory) {
          setCategoryId(matchedCategory.id);
          autoSelections.push(`Category: ${matchedCategory.name}`);
        }
      }
      
      // Show toast with auto-selections
      if (autoSelections.length > 0) {
        toast({
          title: "Auto-Selected",
          description: autoSelections.join(" • "),
        });
      }
      
      toast({
        title: "Smart Generation Complete",
        description: data.translatedContent 
          ? "Arabic translated + all editorial elements generated" 
          : "All editorial elements automatically generated",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to generate smart content",
      });
    },
  });

  const generateSlug = (text: string) => {
    if (!text || typeof text !== 'string') return "";
    
    const slug = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "") // Keep English, numbers, spaces, hyphens
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
      .replace(/^-+|-+$/g, "") // Remove leading/trailing hyphens
      .substring(0, 150); // Limit to 150 characters
    
    return slug || ""; // Return slug or empty string
  };

  const handleTitleChange = (value: string) => {
    console.log('[handleTitleChange] Called with:', value);
    console.log('[handleTitleChange] isNewArticle:', isNewArticle);
    
    setTitle(value);
    
    // Always auto-generate slug for new articles as user types
    if (isNewArticle) {
      const generatedSlug = generateSlug(value);
      console.log('[Slug Generation] Title:', value, '-> Slug:', generatedSlug);
      setSlug(generatedSlug);
    } else {
      console.log('[Slug Generation] SKIPPED - not a new article');
    }
    
    if (!metaTitle) {
      setMetaTitle(value);
    }
  };

  const handleGenerateSummary = async () => {
    if (!content || typeof content !== 'string' || !content.trim()) return;
    generateSummaryMutation.mutate();
  };

  const handleGenerateTitle = async () => {
    if (!content || typeof content !== 'string' || !content.trim()) return;
    generateTitlesMutation.mutate();
  };

  const handleGenerateSmartContent = async () => {
    if (!content || typeof content !== 'string' || !content.trim()) {
      toast({
        title: "Notice",
        description: "Please write article content first",
        variant: "destructive",
      });
      return;
    }
    generateSmartContentMutation.mutate();
  };

  const handleSave = async (publishNow = false) => {
    // Check required fields
    const missingFields = [];
    
    if (!title || typeof title !== 'string' || !title.trim()) {
      missingFields.push("Title");
    }
    if (!slug || typeof slug !== 'string' || !slug.trim()) {
      missingFields.push("Slug");
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      missingFields.push("Content");
    }
    if (!categoryId) {
      missingFields.push("Category");
    }
    
    if (missingFields.length > 0) {
      toast({
        title: "Required Fields",
        description: `Please fill: ${missingFields.join(", ")}`,
        variant: "destructive",
      });
      return;
    }
    
    saveArticleMutation.mutate({ publishNow });
  };

  const handleAddLink = (suggestion: { text: string; position: number; length: number }, url: string) => {
    if (!editorInstance) {
      toast({
        title: "Error",
        description: "Editor not ready. Please try again",
        variant: "destructive",
      });
      return;
    }

    const searchText = suggestion.text.trim();
    
    let found = false;
    const { state } = editorInstance;
    
    state.doc.descendants((node, pos) => {
      if (found) return false;
      
      if (node.isText && node.text) {
        const textContent = node.text;
        const index = textContent.indexOf(searchText);
        
        if (index !== -1) {
          const from = pos + index;
          const to = from + searchText.length;
          
          editorInstance
            .chain()
            .focus()
            .setTextSelection({ from, to })
            .setLink({ href: url })
            .run();
          
          found = true;
          
          toast({
            title: "Link Added Successfully",
            description: `Linked "${searchText}" to suggested URL`,
          });
          
          return false;
        }
      }
      return true;
    });
    
    if (!found) {
      const editorText = state.doc.textContent;
      const index = editorText.indexOf(searchText);
      
      if (index !== -1) {
        let charCount = 0;
        let targetFrom = -1;
        
        state.doc.descendants((node, pos) => {
          if (targetFrom !== -1) return false;
          
          if (node.isText && node.text) {
            const nodeLength = node.text.length;
            if (charCount + nodeLength > index) {
              const localIndex = index - charCount;
              targetFrom = pos + localIndex;
              return false;
            }
            charCount += nodeLength;
          }
          return true;
        });
        
        if (targetFrom !== -1) {
          const targetTo = targetFrom + searchText.length;
          
          editorInstance
            .chain()
            .focus()
            .setTextSelection({ from: targetFrom, to: targetTo })
            .setLink({ href: url })
            .run();
          
          toast({
            title: "Link Added Successfully",
            description: `Linked "${searchText}" to suggested URL`,
          });
        } else {
          toast({
            title: "Text Not Found",
            description: `Text "${searchText}" not found in current content`,
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Text Not Found",
          description: `Text "${searchText}" not found in current content`,
          variant: "destructive",
        });
      }
    }
  };

  const isSaving = saveArticleMutation.isPending;
  const isGeneratingAI = generateSummaryMutation.isPending || generateTitlesMutation.isPending || generateSmartContentMutation.isPending;

  return (
    <EnglishDashboardLayout>
      <div className="container mx-auto px-4 py-6" dir="ltr">
        {/* Page Header with Actions */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              asChild
              data-testid="button-back-en"
            >
              <Link href="/en/dashboard/articles">
                <a className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </a>
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">
              {isNewArticle ? "New Article" : "Edit Article"}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => handleSave(false)}
              disabled={isSaving}
              className="gap-2"
              data-testid="button-save-draft-en"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save as Draft
            </Button>
            <Button
              onClick={() => handleSave(true)}
              disabled={isSaving}
              className="gap-2"
              data-testid="button-publish-en"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Publish
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
          {/* Main Content Area - 70% */}
          <div className="lg:col-span-7 space-y-6">
            {/* Title with AI */}
            <Card>
              <CardHeader>
                <CardTitle>Title</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Enter article title..."
                    className="flex-1"
                    data-testid="input-title-en"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleGenerateTitle}
                    disabled={isGeneratingAI || !content || typeof content !== 'string' || !content.trim()}
                    title="AI Suggestion"
                    data-testid="button-ai-title-en"
                  >
                    {isGeneratingAI ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <InlineHeadlineSuggestions
                  language="en"
                  editorInstance={editorInstance}
                  currentTitle={title}
                  onTitleChange={setTitle}
                />
                <p className="text-xs text-muted-foreground">
                  {(title || "").length}/200 characters
                </p>
              </CardContent>
            </Card>

            {/* Subtitle - Hidden for opinion articles */}
            {articleType !== "opinion" && (
              <Card>
                <CardHeader>
                  <CardTitle>Subtitle</CardTitle>
                </CardHeader>
                <CardContent>
                  <Input
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="Subtitle (optional)..."
                    maxLength={120}
                    data-testid="input-subtitle-en"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    {(subtitle || "").length}/120 characters
                    {(subtitle || "").length > 100 && (
                      <span className="text-amber-500 ml-2">Close to limit</span>
                    )}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Featured Image */}
            <Card>
              <CardHeader>
                <CardTitle>Featured Image</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {imageUrl && (
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg border">
                    <img
                      src={imageUrl}
                      alt="Preview"
                      className="h-full w-full object-cover"
                      data-testid="img-preview-en"
                    />
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={() => document.getElementById("image-upload-en")?.click()}
                    disabled={isUploadingImage}
                    className="gap-2"
                    data-testid="button-upload-image-en"
                  >
                    {isUploadingImage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Upload Image
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowMediaPicker(true)}
                    className="gap-2"
                    data-testid="button-library-en"
                  >
                    <ImageIcon className="h-4 w-4" />
                    Choose from Library
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowAIImageDialog(true)}
                    className="gap-2"
                    data-testid="button-ai-generate-en"
                  >
                    <Sparkles className="h-4 w-4 text-primary" />
                    Generate with AI
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowInfographicDialog(true)}
                    className="gap-2"
                    data-testid="button-generate-infographic-en"
                  >
                    <LayoutGrid className="h-4 w-4 text-primary" />
                    Infographic
                  </Button>
                  <input
                    id="image-upload-en"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Focal Point Picker - Show only when image is uploaded */}
            {imageUrl && (
              <ImageFocalPointPicker
                imageUrl={imageUrl}
                currentFocalPoint={imageFocalPoint || undefined}
                onFocalPointChange={(point) => setImageFocalPoint(point)}
              />
            )}

            {/* Content Editor */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Article Content</CardTitle>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleGenerateSmartContent}
                    disabled={isGeneratingAI || !content || typeof content !== 'string' || !content.trim()}
                    className="gap-2"
                    data-testid="button-smart-generate-en"
                    title="Auto-generate all editorial elements"
                  >
                    {generateSmartContentMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                    Smart Generate
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <RichTextEditor
                  content={content}
                  onChange={setContent}
                  placeholder="Start writing the article..."
                  editorRef={setEditorInstance}
                  dir="ltr"
                />
              </CardContent>
            </Card>

            {/* Excerpt */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Excerpt</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateSummary}
                    disabled={isGeneratingAI || !content || typeof content !== 'string' || !content.trim()}
                    className="gap-2"
                    data-testid="button-ai-summary-en"
                  >
                    <Sparkles className="h-4 w-4" />
                    Auto Generate
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={excerpt}
                  onChange={(e) => {
                    setExcerpt(e.target.value);
                    if (!metaDescription) {
                      setMetaDescription(e.target.value);
                    }
                  }}
                  placeholder="Short summary of the article..."
                  rows={4}
                  data-testid="textarea-excerpt-en"
                />
              </CardContent>
            </Card>

            {/* Smart Links Panel */}
            <div className="h-[600px]" data-testid="smart-links-container-en">
              <SmartLinksPanel
                articleContent={content}
                articleId={isNewArticle ? undefined : id}
                onAddLink={handleAddLink}
              />
            </div>
          </div>

          {/* Settings Sidebar - 30% */}
          <div className="lg:col-span-3 space-y-6">
            {/* Article Type */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  Content Type
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={articleType} onValueChange={(value: any) => setArticleType(value)}>
                  <SelectTrigger data-testid="select-article-type-en">
                    <SelectValue placeholder="Select content type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="news">News</SelectItem>
                    <SelectItem value="opinion">Opinion</SelectItem>
                    <SelectItem value="analysis">Analysis</SelectItem>
                    <SelectItem value="column">Column</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* News Type - Hidden for opinion articles */}
            {articleType !== "opinion" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    News Type
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <RadioGroup value={newsType} onValueChange={(value: any) => setNewsType(value)}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="breaking" id="breaking-en" />
                      <Label htmlFor="breaking-en" className="flex items-center gap-2 cursor-pointer">
                        Breaking News
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="featured" id="featured-en" />
                      <Label htmlFor="featured-en" className="flex items-center gap-2 cursor-pointer">
                        Featured
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="regular" id="regular-en" />
                      <Label htmlFor="regular-en" className="flex items-center gap-2 cursor-pointer">
                        Regular
                      </Label>
                    </div>
                  </RadioGroup>
                  
                  {/* Hide from Homepage Option */}
                  <div className="pt-4 border-t mt-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="hideFromHomepage-en"
                        checked={hideFromHomepage}
                        onCheckedChange={(checked) => setHideFromHomepage(checked as boolean)}
                        data-testid="checkbox-hide-from-homepage-en"
                      />
                      <Label htmlFor="hideFromHomepage-en" className="flex items-center gap-2 cursor-pointer text-sm">
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">Hide from Homepage</div>
                          <div className="text-xs text-muted-foreground">
                            Article will be published but won't appear on homepage
                          </div>
                        </div>
                      </Label>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Category */}
            <Card>
              <CardHeader>
                <CardTitle>Category</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger data-testid="select-category-en">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.icon && <span className="mr-2">{category.icon}</span>}
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* SEO Optimization */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>SEO Optimization</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => generateSeoMutation.mutate()}
                    disabled={generateSeoMutation.isPending || !title || !content}
                    title={!title || !content ? "Title and content are required" : "AI-powered smart SEO generation"}
                    data-testid="button-generate-seo"
                  >
                    <Sparkles className={`h-4 w-4 mr-1 ${generateSeoMutation.isPending ? 'text-muted-foreground animate-pulse' : 'text-primary'}`} />
                    <span className="text-sm">{generateSeoMutation.isPending ? 'Generating...' : 'Generate SEO'}</span>
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Meta Title (50-60 characters) - {metaTitle.length}/60</Label>
                  <Input
                    value={metaTitle}
                    onChange={(e) => setMetaTitle(e.target.value)}
                    placeholder="Optimized title for search engines"
                    maxLength={60}
                    data-testid="input-meta-title"
                  />
                </div>
                <div>
                  <Label>Meta Description (140-160 characters) - {metaDescription.length}/160</Label>
                  <Textarea
                    value={metaDescription}
                    onChange={(e) => setMetaDescription(e.target.value)}
                    placeholder="Compelling description for search engines"
                    maxLength={160}
                    rows={3}
                    data-testid="textarea-meta-description"
                  />
                </div>
                <div>
                  <Label>Keywords</Label>
                  <Input
                    value={keywords.join(", ")}
                    onChange={(e) => setKeywords(e.target.value.split(",").map(k => k.trim()).filter(Boolean))}
                    placeholder="keyword1, keyword2, keyword3"
                    data-testid="input-keywords"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Reporter - Hidden for opinion articles */}
            {articleType !== "opinion" && (
              <Card>
                <CardHeader>
                  <CardTitle>Reporter</CardTitle>
                </CardHeader>
                <CardContent>
                  <ReporterSelect
                    value={reporterId}
                    onChange={setReporterId}
                  />
                </CardContent>
              </Card>
            )}

            {/* Opinion Author - Shown only for opinion articles */}
            {articleType === "opinion" && (
              <Card>
                <CardHeader>
                  <CardTitle>Author</CardTitle>
                </CardHeader>
                <CardContent>
                  <OpinionAuthorSelect
                    value={opinionAuthorId}
                    onChange={setOpinionAuthorId}
                  />
                </CardContent>
              </Card>
            )}

            {/* Publishing */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Publishing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="publish-type-en">Schedule Publishing</Label>
                  <Switch
                    id="publish-type-en"
                    checked={publishType === "scheduled"}
                    onCheckedChange={(checked) => setPublishType(checked ? "scheduled" : "instant")}
                  />
                </div>
                
                {publishType === "scheduled" && (
                  <div className="space-y-2">
                    <Label>Date and Time</Label>
                    <Input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="w-full"
                      data-testid="input-scheduled-at-en"
                    />
                  </div>
                )}

                {publishType === "instant" && (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Will be published immediately
                  </div>
                )}

                {/* Republish Switch - Only show when editing a published article */}
                {!isNewArticle && article?.status === "published" && (
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="republish-en" className="cursor-pointer">
                        Republish with Current Time
                      </Label>
                      <Switch
                        id="republish-en"
                        checked={republish}
                        onCheckedChange={setRepublish}
                        data-testid="switch-republish-en"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      When enabled, publish time will be updated and article will appear at top
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Slug */}
            <Card>
              <CardHeader>
                <CardTitle>URL Slug</CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="article-slug"
                  data-testid="input-slug-en"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {isNewArticle ? "Auto-generated from title" : "Edit slug carefully"}
                </p>
              </CardContent>
            </Card>

            {/* SEO Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  SEO Settings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="seo" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="seo">Fields</TabsTrigger>
                    <TabsTrigger value="preview">Preview</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="seo" className="space-y-4">
                    {/* SEO AI Analysis Button */}
                    {!isNewArticle && (
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="text-sm">
                          <p className="font-medium">AI SEO Analysis</p>
                          <p className="text-xs text-muted-foreground">
                            Get optimization suggestions
                          </p>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => analyzeSEOMutation.mutate()}
                          disabled={isAnalyzingSEO}
                          className="gap-2"
                          data-testid="button-analyze-seo-en"
                        >
                          {isAnalyzingSEO ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                          Analyze
                        </Button>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Meta Title</Label>
                      <Input
                        value={metaTitle}
                        onChange={(e) => setMetaTitle(e.target.value)}
                        placeholder="SEO title (max 70 chars)"
                        maxLength={70}
                        data-testid="input-meta-title-en"
                      />
                      <p className="text-xs text-muted-foreground">
                        {(metaTitle || "").length}/70 characters
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Meta Description</Label>
                      <Textarea
                        value={metaDescription}
                        onChange={(e) => setMetaDescription(e.target.value)}
                        placeholder="SEO description (max 160 chars)"
                        maxLength={160}
                        rows={3}
                        data-testid="textarea-meta-description-en"
                      />
                      <p className="text-xs text-muted-foreground">
                        {(metaDescription || "").length}/160 characters
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Keywords</Label>
                      <TagInput
                        tags={keywords}
                        onTagsChange={setKeywords}
                        placeholder="Add keywords..."
                        testId="input-keywords-en"
                      />
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="preview" className="pt-4">
                    <SeoPreview
                      title={metaTitle || title}
                      description={metaDescription || excerpt}
                      slug={slug}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Media Library Picker Dialog */}
      <MediaLibraryPicker
        isOpen={showMediaPicker}
        onClose={() => setShowMediaPicker(false)}
        onSelect={(media) => {
          setImageUrl(media.url);
          setShowMediaPicker(false);
          toast({
            title: "Image Selected",
            description: "Image selected from library successfully",
          });
        }}
      />

      {/* AI Image Generator Dialog */}
      <AIImageGeneratorDialog
        open={showAIImageDialog}
        onClose={() => setShowAIImageDialog(false)}
        initialPrompt={title ? `Professional featured image for article titled: ${title}` : "Professional featured image for news article"}
        onImageGenerated={(url) => {
          setImageUrl(url);
          setShowAIImageDialog(false);
          toast({
            title: "Image Generated",
            description: "AI-generated image created successfully",
          });
        }}
      />

      {/* Infographic Generator Dialog */}
      <InfographicGeneratorDialog
        open={showInfographicDialog}
        onClose={() => setShowInfographicDialog(false)}
        language="en"
        initialContent={(() => {
          // Extract first 500 characters and remove HTML tags
          const plainText = content.replace(/<[^>]*>/g, '');
          return plainText.substring(0, 500);
        })()}
        onImageGenerated={(url) => {
          setImageUrl(url);
          setShowInfographicDialog(false);
          toast({
            title: "Infographic Generated",
            description: "Infographic created and set as featured image",
          });
        }}
      />
    </EnglishDashboardLayout>
  );
}
