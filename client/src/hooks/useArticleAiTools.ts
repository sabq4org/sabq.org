// Extracted from pages/ArticleEditor.tsx (refactor: article-editor-split).
// All AI-assisted editor tools: summarize, proofread (title/content), title
// generation, auto-classification, SEO generation/analysis, all-in-one
// generation, edit+generate, social cards, and smart content.
//
// Mutation bodies are verbatim from the original inline implementation.
// The hook receives the editor's state values and setters explicitly so the
// data flow is visible at the call site.
/* eslint-disable no-console -- legacy debug logging preserved from the
   original inline code; stripped from prod builds by vite esbuild.pure. */
import type { Dispatch, SetStateAction } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { generateSlug } from "@/lib/slug";
import type { Category } from "@shared/schema";

export interface TitleProofreadResult {
  original: string;
  suggestion: string;
  hasIssues: boolean;
  notes: Array<{ type?: string; explanation?: string }>;
}

export interface ProofreadIssue {
  original: string;
  suggestion: string;
  type: string;
  explanation: string;
}

export interface SocialCards {
  twitter?: string;
  instagram?: string;
  facebook?: string;
  whatsapp?: string;
  linkedin?: string;
}

interface UseArticleAiToolsArgs {
  // Identity
  id: string | undefined;
  isNewArticle: boolean;
  categories: Category[];
  // Current editor state (read by the mutations)
  title: string;
  subtitle: string;
  content: string;
  excerpt: string;
  categoryId: string;
  keywords: string[];
  metaTitle: string;
  metaDescription: string;
  newsletterSubtitle: string;
  newsletterExcerpt: string;
  imageUrl: string;
  thumbnailUrl: string;
  status: "draft" | "published" | "scheduled" | "archived";
  generatedSocialCards: SocialCards | null;
  // State setters (written by the mutations)
  setTitle: Dispatch<SetStateAction<string>>;
  setSubtitle: Dispatch<SetStateAction<string>>;
  setSlug: Dispatch<SetStateAction<string>>;
  setContent: Dispatch<SetStateAction<string>>;
  setExcerpt: Dispatch<SetStateAction<string>>;
  setCategoryId: Dispatch<SetStateAction<string>>;
  setKeywords: Dispatch<SetStateAction<string[]>>;
  setMetaTitle: Dispatch<SetStateAction<string>>;
  setMetaDescription: Dispatch<SetStateAction<string>>;
  setNewsletterSubtitle: Dispatch<SetStateAction<string>>;
  setNewsletterExcerpt: Dispatch<SetStateAction<string>>;
  setTitleProofreadResult: Dispatch<SetStateAction<TitleProofreadResult | null>>;
  setShowTitleProofreadDialog: Dispatch<SetStateAction<boolean>>;
  setProofreadIssues: Dispatch<SetStateAction<ProofreadIssue[]>>;
  setShowProofreadDialog: Dispatch<SetStateAction<boolean>>;
  setIsClassifying: Dispatch<SetStateAction<boolean>>;
  setIsAnalyzingSEO: Dispatch<SetStateAction<boolean>>;
  setIsGeneratingSocialCards: Dispatch<SetStateAction<boolean>>;
  setGeneratedSocialCards: Dispatch<SetStateAction<SocialCards | null>>;
}

export function useArticleAiTools({
  id,
  isNewArticle,
  categories,
  title,
  subtitle,
  content,
  excerpt,
  categoryId,
  keywords,
  metaTitle,
  metaDescription,
  newsletterSubtitle,
  newsletterExcerpt,
  imageUrl,
  thumbnailUrl,
  status,
  generatedSocialCards,
  setTitle,
  setSubtitle,
  setSlug,
  setContent,
  setExcerpt,
  setCategoryId,
  setKeywords,
  setMetaTitle,
  setMetaDescription,
  setNewsletterSubtitle,
  setNewsletterExcerpt,
  setTitleProofreadResult,
  setShowTitleProofreadDialog,
  setProofreadIssues,
  setShowProofreadDialog,
  setIsClassifying,
  setIsAnalyzingSEO,
  setIsGeneratingSocialCards,
  setGeneratedSocialCards,
}: UseArticleAiToolsArgs) {
  const { toast } = useToast();

  const generateSummaryMutation = useMutation({
    mutationFn: async () => {
      // Validation
      if (!content) {
        throw new Error("يجب إدخال المحتوى أولاً");
      }
      
      if (content.length < 100) {
        throw new Error("المحتوى يجب أن يكون 100 حرف على الأقل");
      }
      
      return await apiRequest("/api/ai/summarize", {
        method: "POST",
        body: JSON.stringify({ content }),
      });
    },
    onSuccess: (data: { summary: string }) => {
      setExcerpt(data.summary);
      toast({
        title: "تم التلخيص",
        description: "تم إنشاء ملخص تلقائي للمقال",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في توليد الملخص",
        variant: "destructive",
      });
    },
  });

  const proofreadTitleMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/ai/proofread-title", {
        method: "POST",
        body: JSON.stringify({ title }),
      });
    },
    onSuccess: (data: any) => {
      setTitleProofreadResult({
        original: data?.original || title,
        suggestion: data?.suggestion || title,
        hasIssues: !!data?.hasIssues,
        notes: Array.isArray(data?.notes) ? data.notes : [],
      });
      setShowTitleProofreadDialog(true);
      if (!data?.hasIssues) {
        toast({
          title: "العنوان سليم لغوياً",
          description: "لم يُعثر على أخطاء تستوجب التصحيح",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "خطأ في تدقيق العنوان",
        description: error?.message || "فشل في تدقيق العنوان",
        variant: "destructive",
      });
    },
  });

  const proofreadMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/ai/proofread", {
        method: "POST",
        body: JSON.stringify({ content }),
      });
    },
    onSuccess: (data: any) => {
      const issues = Array.isArray(data?.issues) ? data.issues : [];
      setProofreadIssues(issues);
      setShowProofreadDialog(true);
      toast({
        title: issues.length === 0 ? "لا توجد أخطاء إملائية" : `تم العثور على ${issues.length} ملاحظة`,
        description: issues.length === 0
          ? "النص سليم إملائياً"
          : "راجع الاقتراحات يدوياً — لن يتم تعديل النص تلقائياً",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ في التدقيق",
        description: error?.message || "فشل في تدقيق النص",
        variant: "destructive",
      });
    },
  });

  const generateTitlesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/ai/generate-titles", {
        method: "POST",
        body: JSON.stringify({ content, language: "ar" }),
      });
    },
    onSuccess: (data: { titles: string[] }) => {
      if (data.titles.length > 0) {
        setTitle(data.titles[0]);
        setSlug(generateSlug(data.titles[0]));
        toast({
          title: "تم توليد العناوين",
          description: `اقتراح: ${data.titles.join(" | ")}`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في توليد العناوين",
        variant: "destructive",
      });
    },
  });

  const autoClassifyMutation = useMutation({
    mutationFn: async () => {
      // Validation
      if (!title || !content) {
        throw new Error("يجب إدخال العنوان والمحتوى أولاً");
      }
      
      if (title.length < 10) {
        throw new Error("العنوان يجب أن يكون 10 أحرف على الأقل");
      }
      
      if (content.length < 100) {
        throw new Error("المحتوى يجب أن يكون 100 حرف على الأقل");
      }
      
      setIsClassifying(true);
      
      // If editing existing article, use old endpoint
      if (!isNewArticle && id) {
        console.log('[Classification] Using saved endpoint for existing article:', id);
        return await apiRequest(`/api/articles/${id}/auto-categorize`, {
          method: "POST",
        });
      }
      
      // If new article, use draft endpoint (no save to DB)
      console.log('[Classification] Using draft endpoint for new article');
      return await apiRequest(`/api/articles/auto-classify-draft`, {
        method: "POST",
        body: JSON.stringify({
          title,
          content,
          language: "ar",
        }),
      });
    },
    onSuccess: (data: {
      primaryCategory: {
        categoryId: string;
        categoryName: string;
        confidence: number;
        reasoning: string;
      };
      suggestedCategories: Array<{
        categoryId: string;
        categoryName: string;
        confidence: number;
        reasoning: string;
      }>;
      provider: string;
      model: string;
    }) => {
      setIsClassifying(false);
      setCategoryId(data.primaryCategory.categoryId);
      
      const suggestedText = data.suggestedCategories?.length > 0
        ? `\n\nتصنيفات مقترحة أخرى: ${data.suggestedCategories.map(c => `${c.categoryName} (${Math.round(c.confidence * 100)}%)`).join(', ')}`
        : '';
      
      toast({
        title: "تم التصنيف بنجاح",
        description: `التصنيف: ${data.primaryCategory.categoryName} (${Math.round(data.primaryCategory.confidence * 100)}% ثقة)${suggestedText}`,
      });
    },
    onError: (error: Error) => {
      setIsClassifying(false);
      toast({
        title: "خطأ في التصنيف",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateSeoMutation = useMutation({
    mutationFn: async () => {
      // Validation
      if (!title || !content) {
        throw new Error("يجب إدخال العنوان والمحتوى أولاً");
      }
      
      if (title.length < 10) {
        throw new Error("العنوان يجب أن يكون 10 أحرف على الأقل");
      }
      
      if (content.length < 100) {
        throw new Error("المحتوى يجب أن يكون 100 حرف على الأقل");
      }
      
      // If editing existing article, use saved mode
      if (!isNewArticle && id) {
        console.log('[SEO] Using saved mode for existing article:', id);
        return await apiRequest(`/api/seo/generate`, {
          method: "POST",
          body: JSON.stringify({
            mode: "saved",
            articleId: id,
            language: "ar"
          }),
        });
      }
      
      // If new article, use draft mode (no save to DB)
      console.log('[SEO] Using draft mode for new article');
      return await apiRequest(`/api/seo/generate`, {
        method: "POST",
        body: JSON.stringify({
          mode: "draft",
          draftData: {
            title,
            content,
            excerpt: excerpt || undefined,
          },
          language: "ar"
        }),
      });
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
      // Auto-fill SEO fields
      if (data.seo) {
        setMetaTitle(data.seo.metaTitle);
        setMetaDescription(data.seo.metaDescription || "");
        setKeywords(data.seo.keywords || []);
      }
      
      // Only invalidate queries if editing existing article
      if (!isNewArticle && id) {
        queryClient.invalidateQueries({ queryKey: ['/api/articles', id] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard/articles', id] });
      }
      
      toast({
        title: "تم توليد بيانات SEO",
        description: `تم إنشاء عنوان SEO ووصف وكلمات مفتاحية بواسطة ${data.provider}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ في توليد SEO",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateAllInOneMutation = useMutation({
    mutationFn: async () => {
      // Validation - Only require content (title will be generated!)
      if (!content) {
        throw new Error("يجب إدخال المحتوى أولاً");
      }
      
      if (content.length < 100) {
        throw new Error("المحتوى يجب أن يكون 100 حرف على الأقل");
      }
      
      console.log('[All-in-One AI] Starting comprehensive AI generation...');
      console.log('[All-in-One AI] Current title:', title || '(سيتم توليده)');
      
      // Execute all AI tools in PARALLEL for speed
      const [
        headlinesResult,
        classificationResult,
        seoResult,
        summaryResult,
        newsletterResult,
        smartContentResult,
      ] = await Promise.all([
        // 1. Headline Suggestions (will generate title from content)
        (async () => {
          try {
            console.log('[All-in-One AI] 1️⃣ Generating headlines...');
            const result = await apiRequest("/api/ai/generate-titles", {
              method: "POST",
              body: JSON.stringify({ content, language: "ar" }),
            });
            console.log('[All-in-One AI] ✅ Headlines result:', result);
            return result;
          } catch (err: any) {
            console.error('[All-in-One AI] ❌ Headlines failed:', err);
            console.error('[All-in-One AI] Error details:', err.message, err.status);
            return { titles: [] };
          }
        })(),
        
        // 2. Smart Classification (use generated title or placeholder)
        (async () => {
          try {
            console.log('[All-in-One AI] 2️⃣ Classifying article...');
            const effectiveTitle = title || "عنوان مؤقت";
            const result = !isNewArticle && id
              ? await apiRequest(`/api/articles/${id}/auto-categorize`, { method: "POST" })
              : await apiRequest(`/api/articles/auto-classify-draft`, {
                  method: "POST",
                  body: JSON.stringify({ title: effectiveTitle, content, language: "ar" }),
                });
            console.log('[All-in-One AI] ✅ Classification result:', result);
            return result;
          } catch (err: any) {
            console.error('[All-in-One AI] ❌ Classification failed:', err);
            console.error('[All-in-One AI] Error details:', err.message, err.status);
            return null;
          }
        })(),
        
        // 3. SEO Generator (use generated title or placeholder)
        (async () => {
          try {
            console.log('[All-in-One AI] 3️⃣ Generating SEO...');
            const effectiveTitle = title || "عنوان مؤقت";
            const result = !isNewArticle && id
              ? await apiRequest(`/api/seo/generate`, {
                  method: "POST",
                  body: JSON.stringify({ mode: "saved", articleId: id, language: "ar" }),
                })
              : await apiRequest(`/api/seo/generate`, {
                  method: "POST",
                  body: JSON.stringify({
                    mode: "draft",
                    draftData: { title: effectiveTitle, content, excerpt: excerpt || undefined },
                    language: "ar"
                  }),
                });
            console.log('[All-in-One AI] ✅ SEO result:', result);
            return result;
          } catch (err: any) {
            console.error('[All-in-One AI] ❌ SEO failed:', err);
            console.error('[All-in-One AI] Error details:', err.message, err.status);
            return null;
          }
        })(),
        
        // 4. Smart Summary
        (async () => {
          try {
            console.log('[All-in-One AI] 4️⃣ Generating summary...');
            const result = await apiRequest("/api/ai/summarize", {
              method: "POST",
              body: JSON.stringify({ content }),
            });
            console.log('[All-in-One AI] ✅ Summary result:', result);
            return result;
          } catch (err: any) {
            console.error('[All-in-One AI] ❌ Summary failed:', err);
            console.error('[All-in-One AI] Error details:', err.message, err.status);
            return { summary: "" };
          }
        })(),
        
        // 5. Newsletter Subtitle/Excerpt for smart email distribution
        (async () => {
          try {
            console.log('[All-in-One AI] 5️⃣ Generating newsletter content...');
            const effectiveTitle = title || "عنوان مؤقت";
            const result = await apiRequest("/api/smart-classification/newsletter-subtitle", {
              method: "POST",
              body: JSON.stringify({ 
                title: effectiveTitle, 
                content,
                excerpt: excerpt || undefined 
              }),
            });
            console.log('[All-in-One AI] ✅ Newsletter result:', result);
            return result;
          } catch (err: any) {
            console.error('[All-in-One AI] ❌ Newsletter failed:', err);
            console.error('[All-in-One AI] Error details:', err.message, err.status);
            return { subtitle: "", excerpt: "" };
          }
        })(),

        // 6. Smart Content (same engine as "تحرير وتوليد شامل") — used for accurate editorial keywords
        (async () => {
          try {
            console.log('[All-in-One AI] 6️⃣ Generating smart content (for editorial keywords)...');
            const result = await apiRequest("/api/articles/generate-content", {
              method: "POST",
              body: JSON.stringify({ content, language: "ar" }),
            });
            console.log('[All-in-One AI] ✅ Smart content result:', result);
            return result;
          } catch (err: any) {
            console.error('[All-in-One AI] ❌ Smart content failed:', err);
            console.error('[All-in-One AI] Error details:', err.message, err.status);
            return null;
          }
        })(),
      ]);
      
      return {
        headlines: headlinesResult,
        classification: classificationResult,
        seo: seoResult,
        summary: summaryResult,
        newsletter: newsletterResult,
        smartContent: smartContentResult,
      };
    },
    onSuccess: (data) => {
      console.log('[All-in-One AI] Results:', data);
      
      let successCount = 0;
      let failCount = 0;
      const details: string[] = [];
      
      // Apply Headlines (if available)
      if (data.headlines?.titles?.length > 0) {
        const firstHeadline = data.headlines.titles[0];
        setTitle(firstHeadline);
        setSlug(generateSlug(firstHeadline));
        successCount++;
        details.push(`✓ عنوان: ${firstHeadline.substring(0, 30)}...`);
      } else {
        failCount++;
      }
      
      // Apply Classification (if available)
      if (data.classification?.primaryCategory) {
        setCategoryId(data.classification.primaryCategory.categoryId);
        successCount++;
        details.push(`✓ تصنيف: ${data.classification.primaryCategory.categoryName}`);
      } else {
        failCount++;
      }
      
      // Apply SEO meta fields (title + description only — keywords come from smart content below)
      if (data.seo?.seo) {
        setMetaTitle(data.seo.seo.metaTitle);
        setMetaDescription(data.seo.seo.metaDescription || "");
        successCount++;
        details.push(`✓ SEO: تم توليد البيانات`);
      } else {
        failCount++;
      }

      // Apply editorial keywords from smart content (same engine as "تحرير وتوليد شامل")
      // Fallback to SEO keywords if smart content failed
      const editorialKeywords = data.smartContent?.keywords;
      const fallbackKeywords = data.seo?.seo?.keywords;
      if (editorialKeywords && editorialKeywords.length > 0) {
        setKeywords(editorialKeywords);
        successCount++;
        details.push(`✓ ${editorialKeywords.length} كلمة مفتاحية تحريرية`);
      } else if (fallbackKeywords && fallbackKeywords.length > 0) {
        setKeywords(fallbackKeywords);
        successCount++;
        details.push(`✓ ${fallbackKeywords.length} كلمة مفتاحية`);
      } else {
        failCount++;
      }
      
      // Apply Summary (if available)
      if (data.summary?.summary) {
        setExcerpt(data.summary.summary);
        successCount++;
        details.push(`✓ موجز: ${data.summary.summary.substring(0, 30)}...`);
      } else {
        failCount++;
      }
      
      // Apply Newsletter Content (if available)
      if (data.newsletter?.subtitle) {
        setNewsletterSubtitle(data.newsletter.subtitle);
        setNewsletterExcerpt(data.newsletter.excerpt || "");
        successCount++;
        details.push(`✓ بريد ذكي: ${data.newsletter.subtitle.substring(0, 25)}...`);
      } else {
        failCount++;
      }
      
      // Show comprehensive toast
      toast({
        title: `✨ توليد ذكي شامل (${successCount}/${successCount + failCount})`,
        description: details.join("\n"),
        duration: 5000,
      });
    },
    onError: (error: Error) => {
      console.error('[All-in-One AI] Critical error:', error);
      toast({
        title: "خطأ في التوليد الشامل",
        description: error.message || "فشل في التوليد الذكي",
        variant: "destructive",
      });
    },
  });

  // Edit and Generate All-in-One Mutation
  // This rewrites the content first, then generates all metadata
  const editAndGenerateMutation = useMutation({
    mutationFn: async () => {
      if (!content) {
        throw new Error("يجب إدخال المحتوى أولاً");
      }
      
      if (content.length < 100) {
        throw new Error("المحتوى يجب أن يكون 100 حرف على الأقل");
      }
      
      console.log('[Edit+Generate] Starting comprehensive edit and generation...');
      console.log('[Edit+Generate] Original content length:', content.length);
      
      const result = await apiRequest("/api/articles/edit-and-generate", {
        method: "POST",
        body: JSON.stringify({ 
          content, 
          language: "ar" 
        }),
      });
      
      console.log('[Edit+Generate] Result received:', result);
      return result;
    },
    onSuccess: (data: {
      editedContent: string;
      editedLead?: string;
      qualityScore?: number;
      detectedCategory?: string;
      hasNewsValue?: boolean;
      issues?: string[];
      suggestions?: string[];
      mainTitle: string;
      subTitle: string;
      smartSummary: string;
      keywords: string[];
      seo: {
        metaTitle: string;
        metaDescription: string;
      };
      newsletterSubtitle?: string;
      newsletterExcerpt?: string;
    }) => {
      console.log('[Edit+Generate] Applying results...');
      
      const changes: string[] = [];
      
      // Apply edited content
      if (data.editedContent) {
        setContent(data.editedContent);
        changes.push("✓ تم تحرير المحتوى");
      }
      
      // Apply title
      if (data.mainTitle) {
        setTitle(data.mainTitle);
        setSlug(generateSlug(data.mainTitle));
        changes.push(`✓ العنوان: ${data.mainTitle.substring(0, 25)}...`);
      }
      
      // Apply subtitle
      if (data.subTitle) {
        setSubtitle(data.subTitle);
        changes.push("✓ العنوان الفرعي");
      }
      
      // Apply summary/excerpt
      if (data.smartSummary) {
        setExcerpt(data.smartSummary);
        changes.push("✓ الموجز الذكي");
      }
      
      // Apply keywords
      if (data.keywords?.length > 0) {
        setKeywords(data.keywords);
        changes.push(`✓ ${data.keywords.length} كلمة مفتاحية`);
      }
      
      // Apply SEO
      if (data.seo) {
        setMetaTitle(data.seo.metaTitle);
        setMetaDescription(data.seo.metaDescription);
        changes.push("✓ بيانات SEO");
      }
      
      // Apply detected category (match by Arabic name with normalized comparison)
      if (data.detectedCategory && categories.length > 0) {
        const detectedCat = data.detectedCategory.trim();
        
        // 1. First try exact match (case-insensitive, trimmed)
        let matchedCategory = categories.find(cat => 
          cat.nameAr?.trim() === detectedCat || 
          cat.nameEn?.trim().toLowerCase() === detectedCat.toLowerCase()
        );
        
        // 2. Fallback: detected category contains the canonical name (e.g., "الاقتصاد والأسواق" contains "اقتصاد")
        if (!matchedCategory) {
          matchedCategory = categories.find(cat => 
            (cat.nameAr && detectedCat.includes(cat.nameAr)) ||
            (cat.nameEn && detectedCat.toLowerCase().includes(cat.nameEn.toLowerCase()))
          );
        }
        
        // 3. Fallback: canonical name contains the detected category (e.g., "تقنية المعلومات" contains "تقنية")
        if (!matchedCategory) {
          matchedCategory = categories.find(cat => 
            (cat.nameAr && cat.nameAr.includes(detectedCat)) ||
            (cat.nameEn && cat.nameEn.toLowerCase().includes(detectedCat.toLowerCase()))
          );
        }
        
        if (matchedCategory) {
          setCategoryId(matchedCategory.id);
          changes.push(`✓ التصنيف: ${matchedCategory.nameAr}`);
        } else {
          console.log('[Edit+Generate] Category not matched:', detectedCat, 'Available:', categories.map(c => c.nameAr).join(', '));
        }
      }
      
      // Apply lead if available
      if (data.editedLead) {
        changes.push("✓ المقدمة");
      }
      
      // Apply Newsletter Content (if available)
      if (data.newsletterSubtitle) {
        setNewsletterSubtitle(data.newsletterSubtitle);
        setNewsletterExcerpt(data.newsletterExcerpt || "");
        changes.push(`✓ بريد ذكي: ${data.newsletterSubtitle.substring(0, 25)}...`);
      }
      
      toast({
        title: `✨ تحرير وتوليد شامل${data.qualityScore ? ` (${data.qualityScore}/100)` : ''}`,
        description: changes.join("\n"),
        duration: 6000,
      });
      
      // Show quality insights if available
      if (data.issues && data.issues.length > 0) {
        console.log('[Edit+Generate] Quality issues:', data.issues);
      }
      if (data.suggestions && data.suggestions.length > 0) {
        console.log('[Edit+Generate] Suggestions:', data.suggestions);
      }
    },
    onError: (error: Error) => {
      console.error('[Edit+Generate] Error:', error);
      toast({
        title: "خطأ في التحرير والتوليد",
        description: error.message || "فشل في تحرير وتوليد المحتوى",
        variant: "destructive",
      });
    },
  });

  const analyzeSEOMutation = useMutation({
    mutationFn: async () => {
      if (!id || isNewArticle) {
        throw new Error("يجب حفظ المقال أولاً قبل تحليل SEO");
      }
      setIsAnalyzingSEO(true);
      return await apiRequest(`/api/articles/${id}/analyze-seo`, {
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
        title: `تحليل SEO - النتيجة: ${data.score}/100`,
        description: `تم تحليل المقال وتطبيق التوصيات. ${data.suggestions.length > 0 ? data.suggestions[0] : ''}`,
      });
    },
    onError: (error: Error) => {
      setIsAnalyzingSEO(false);
      toast({
        title: "خطأ في تحليل SEO",
        description: error.message || "فشل في تحليل SEO",
        variant: "destructive",
      });
    },
  });

  // Generate Social Media Cards mutation
  const generateSocialCardsMutation = useMutation({
    mutationFn: async () => {
      if (!id || isNewArticle) {
        throw new Error("يجب حفظ المقال أولاً قبل توليد البطاقات");
      }
      
      console.log('[Social Cards] Starting generation for article:', id);
      setIsGeneratingSocialCards(true);
      
      const requestBody = {
        articleId: id,
        articleTitle: title || "عنوان المقال",
        articleSummary: excerpt || metaDescription || subtitle || "ملخص المقال",
        category: categories.find(c => c.id === categoryId)?.nameAr || "أخبار",
        language: "ar",
        platform: "all"
      };
      
      console.log('[Social Cards] Request body:', requestBody);
      
      try {
        const response = await apiRequest(`/api/visual-ai/generate-social-cards`, {
          method: "POST",
          body: JSON.stringify(requestBody),
        });
        
        console.log('[Social Cards] Response:', response);
        return response;
      } catch (error) {
        console.error('[Social Cards] API Error:', error);
        setIsGeneratingSocialCards(false);
        throw error;
      }
    },
    onSuccess: (data: {
      cards?: Array<{
        platform: string;
        imageUrl: string;
        thumbnailUrl?: string;
      }>;
      message?: string;
    }) => {
      console.log('[Social Cards] Success:', data);
      setIsGeneratingSocialCards(false);
      
      if (data.cards && data.cards.length > 0) {
        const cardsMap: typeof generatedSocialCards = {};
        data.cards.forEach(card => {
          cardsMap[card.platform as keyof typeof cardsMap] = card.imageUrl;
        });
        setGeneratedSocialCards(cardsMap);
        
        const generatedPlatforms = data.cards.map(c => c.platform);
        
        toast({
          title: "تم توليد بطاقات السوشال ميديا",
          description: `تم توليد ${generatedPlatforms.length} بطاقات بنجاح`,
        });
      } else {
        toast({
          title: "تم بدء عملية التوليد",
          description: data.message || "جاري معالجة الطلب...",
        });
      }
    },
    onError: (error: Error) => {
      console.error('[Social Cards] Mutation Error:', error);
      setIsGeneratingSocialCards(false);
      toast({
        title: "خطأ في توليد البطاقات",
        description: error.message || "فشل في توليد بطاقات السوشال ميديا",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Ensure loading state is always reset
      setIsGeneratingSocialCards(false);
    }
  });

  const generateSmartContentMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/articles/generate-content", {
        method: "POST",
        body: JSON.stringify({ content }),
      });
    },
    onSuccess: (data: {
      mainTitle: string;
      subTitle: string;
      smartSummary: string;
      keywords: string[];
      seo: { metaTitle: string; metaDescription: string };
    }) => {
      setTitle(data.mainTitle);
      setSubtitle(data.subTitle);
      setExcerpt(data.smartSummary);
      setKeywords(data.keywords);
      setMetaTitle(data.seo.metaTitle);
      setMetaDescription(data.seo.metaDescription);
      setSlug(generateSlug(data.mainTitle));
      
      toast({
        title: "✨ تم التوليد الذكي",
        description: "تم إنشاء جميع العناصر التحريرية تلقائياً",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: error.message || "فشل توليد المحتوى الذكي",
      });
    },
  });

  return {
    generateSummaryMutation,
    proofreadTitleMutation,
    proofreadMutation,
    generateTitlesMutation,
    autoClassifyMutation,
    generateSeoMutation,
    generateAllInOneMutation,
    editAndGenerateMutation,
    analyzeSEOMutation,
    generateSocialCardsMutation,
    generateSmartContentMutation,
  };
}
