/**
 * Example: How to use useArticleVoiceCommands in an Article Detail Page
 * 
 * This example shows how to integrate voice commands for article reading
 * in any article detail page component.
 */

import { useArticleVoiceCommands } from "@/hooks/useArticleVoiceCommands";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX } from "lucide-react";
import DOMPurify from "isomorphic-dompurify";

export function ArticleDetailExample() {
  // Example article data
  const article = {
    title: "عنوان المقالة",
    content: "<p>هذا هو محتوى المقالة...</p>",
  };
  
  // Use the article voice commands hook
  const { isReading, startReading, stopReading } = useArticleVoiceCommands(
    article.content,
    article.title
  );

  return (
    <article>
      <header>
        <h1>{article.title}</h1>
        
        {/* Optional: Manual control buttons */}
        <div className="flex gap-2">
          {!isReading ? (
            <Button
              onClick={startReading}
              variant="outline"
              size="sm"
              data-testid="button-start-reading"
            >
              <Volume2 className="h-4 w-4 mr-2" />
              Read Article / اقرأ المقالة
            </Button>
          ) : (
            <Button
              onClick={stopReading}
              variant="outline"
              size="sm"
              data-testid="button-stop-reading"
            >
              <VolumeX className="h-4 w-4 mr-2" />
              Stop Reading / إيقاف القراءة
            </Button>
          )}
        </div>
      </header>
      
      <div 
        className="article-content"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.content || '') }}
      />
      
      {/* Voice commands are automatically available:
        - "اقرأ المقالة" / "read article" - Start reading
        - "توقف عن القراءة" / "stop reading" - Stop reading
      */}
    </article>
  );
}

/**
 * Usage Notes:
 * 
 * 1. Import the hook:
 *    import { useArticleVoiceCommands } from "@/hooks/useArticleVoiceCommands";
 * 
 * 2. Call the hook with article content and title:
 *    const { isReading, startReading, stopReading } = useArticleVoiceCommands(
 *      articleContent,
 *      articleTitle
 *    );
 * 
 * 3. Voice commands are automatically registered:
 *    - Arabic: "اقرأ المقالة", "اقرأ", "توقف عن القراءة", "توقف"
 *    - English: "read article", "read this", "stop reading", "stop"
 * 
 * 4. Optional: Add manual control buttons using the returned state and functions
 * 
 * 5. The hook automatically:
 *    - Strips HTML tags before reading
 *    - Provides toast notifications
 *    - Cleans up commands on unmount
 *    - Stops reading when component unmounts
 */
