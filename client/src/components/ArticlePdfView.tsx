import { Eye, Heart, Share2, MessageSquare, Clock } from "lucide-react";
import { formatSaudiDateTime } from "@/lib/pdf/exportClient";
import type { ArticleWithDetails } from "@shared/schema";

interface ArticlePdfViewProps {
  article: ArticleWithDetails;
  articleUrl: string;
}

/**
 * مكون قالب الطباعة لتصدير المقالات إلى PDF
 * يتم استخدامه كعنصر مخفي في الصفحة ويُحوّل إلى PDF عند الطلب
 */
export function ArticlePdfView({ article, articleUrl }: ArticlePdfViewProps) {
  const printDate = formatSaudiDateTime(new Date());
  const publishDate = article.publishedAt 
    ? formatSaudiDateTime(new Date(article.publishedAt))
    : '';

  return (
    <div
      id="article-pdf-content"
      className="print:block"
      style={{
        position: 'fixed',
        left: '-9999px',
        top: '0',
        width: '1200px',
        backgroundColor: 'white',
        color: 'black',
        direction: 'rtl',
        fontFamily: 'Noto Naskh Arabic, Arial, sans-serif',
        zIndex: -1,
      }}
    >
      {/* ترويسة PDF */}
      <header className="pdf-header border-b-2 border-gray-800 pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h1 className="text-3xl font-extrabold mb-2">صبق Smart</h1>
            {article.category && (
              <p className="text-lg text-gray-600">
                قسم: {article.category.nameAr || article.category.nameEn}
              </p>
            )}
          </div>
          
          <div className="text-left">
            <img
              data-qr-placeholder="true"
              alt="QR Code"
              className="w-24 h-24 border border-gray-300"
            />
            <p className="text-xs text-gray-500 mt-1">رابط المقال</p>
          </div>
        </div>
        
        <div className="mt-3 text-sm text-gray-600">
          <p>تاريخ الطباعة: {printDate}</p>
          <p className="text-xs mt-1">{articleUrl}</p>
        </div>
      </header>

      {/* غلاف المقال */}
      <section className="pdf-cover mb-8">
        {/* عنوان المقال */}
        <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-6">
          {article.title}
        </h1>

        {/* الصورة الرئيسية */}
        {article.imageUrl && (
          <div className="mb-6">
            <img
              src={article.imageUrl}
              alt={article.title}
              className="w-full h-auto max-h-96 object-cover rounded-lg border border-gray-200"
              crossOrigin="anonymous"
            />
          </div>
        )}

        {/* الملخص */}
        {article.excerpt && (
          <p className="text-xl text-gray-700 leading-relaxed mb-6 border-r-4 border-primary pr-4">
            {article.excerpt}
          </p>
        )}

        {/* معلومات المقال */}
        <div className="flex flex-wrap gap-4 text-sm text-gray-600 pb-6 border-b border-gray-300">
          {article.author && (
            <div className="flex items-center gap-2">
              <span className="font-semibold">الكاتب:</span>
              <span>
                {article.author.firstName && article.author.lastName
                  ? `${article.author.firstName} ${article.author.lastName}`
                  : article.author.email}
              </span>
            </div>
          )}
          
          {publishDate && (
            <div className="flex items-center gap-2">
              <span className="font-semibold">تاريخ النشر:</span>
              <span>{publishDate}</span>
            </div>
          )}
        </div>
      </section>

      {/* محتوى المقال */}
      <article className="pdf-content mb-8">
        <div
          className="prose prose-lg max-w-none"
          style={{
            fontSize: '16px',
            lineHeight: '1.75',
            color: '#1a1a1a',
          }}
          dangerouslySetInnerHTML={{ __html: article.content }}
        />
      </article>

      {/* قسم الإحصائيات */}
      <section className="pdf-stats border-t-2 border-gray-300 pt-6 mb-8">
        <h2 className="text-2xl font-bold mb-4">إحصائيات التفاعل</h2>
        
        <div className="grid grid-cols-3 gap-4">
          {/* المشاهدات */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 mb-2">
              <Eye className="h-5 w-5 text-blue-600" />
              <span className="text-sm text-gray-600">المشاهدات</span>
            </div>
            <p className="text-2xl font-bold">
              {(article.views || 0).toLocaleString('en-US')}
            </p>
          </div>

          {/* التفاعلات */}
          <div className="bg-pink-50 p-4 rounded-lg border border-pink-200">
            <div className="flex items-center gap-2 mb-2">
              <Heart className="h-5 w-5 text-pink-600" />
              <span className="text-sm text-gray-600">التفاعلات</span>
            </div>
            <p className="text-2xl font-bold">
              {(article.reactionsCount || 0).toLocaleString('en-US')}
            </p>
          </div>

          {/* التعليقات */}
          <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="h-5 w-5 text-purple-600" />
              <span className="text-sm text-gray-600">التعليقات</span>
            </div>
            <p className="text-2xl font-bold">
              {(article.commentsCount || 0).toLocaleString('en-US')}
            </p>
          </div>
        </div>
      </section>

      {/* تذييل PDF */}
      <footer className="pdf-footer border-t-2 border-gray-800 pt-4 mt-8">
        <div className="flex justify-between items-center text-sm text-gray-600">
          <div>
            <p className="font-semibold">© 2026 صبق Smart - جميع الحقوق محفوظة</p>
            <p className="text-xs mt-1">
              هذا المحتوى محمي بموجب قوانين حقوق النشر والملكية الفكرية
            </p>
          </div>
          
          <div className="text-left">
            <p className="text-xs">معرّف المقال: {article.id}</p>
            {article.slug && (
              <p className="text-xs">Slug: {article.slug}</p>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
