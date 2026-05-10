import { MessageCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface RecentCommenter {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
}

interface CommentsTeaserProps {
  articleId: string;
  commentsCount: number;
  recentCommenters: RecentCommenter[];
}

export function CommentsTeaser({ 
  articleId, 
  commentsCount, 
  recentCommenters 
}: CommentsTeaserProps) {
  const scrollToComments = () => {
    const element = document.getElementById("comments");
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    if (firstName && lastName) {
      return `${firstName?.[0]}${lastName?.[0]}`.toUpperCase();
    }
    if (firstName) return firstName?.[0].toUpperCase();
    return 'م';
  };

  return (
    <Card 
      className="bg-background/80 backdrop-blur-sm border-primary/10 hover:border-primary/20 transition-all duration-300 group hover:shadow-md cursor-pointer mb-6 overflow-hidden"
      onClick={scrollToComments}
      data-testid={`comments-teaser-${articleId}`}
    >
      <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-primary/10 p-2.5 rounded-full text-primary group-hover:scale-110 transition-transform duration-300">
            <MessageCircle className="h-5 w-5" />
          </div>
          
          <div className="flex flex-col">
            <span className="text-sm font-semibold" data-testid="text-comments-count">
              {commentsCount === 0 ? (
                "كن أول من يشارك رأيه"
              ) : (
                <>
                  {commentsCount.toLocaleString('ar-SA')} {commentsCount <= 10 ? 'تعليقات' : 'تعليق'}
                  <span className="text-muted-foreground font-normal mr-1">من القراء</span>
                </>
              )}
            </span>
            {commentsCount > 0 && (
              <span className="text-xs text-muted-foreground">
                انضم إلى النقاش الدائر حول هذا المقال
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6">
          {recentCommenters.length > 0 && (
            <div className="flex -space-x-3 rtl:space-x-reverse items-center" data-testid="avatar-stack">
              {recentCommenters.slice(0, 3).map((commenter, i) => (
                <Avatar 
                  key={commenter.id} 
                  className="h-8 w-8 border-2 border-background ring-2 ring-transparent group-hover:ring-primary/20 transition-all"
                  style={{ zIndex: 3 - i }}
                >
                  <AvatarImage src={commenter.profileImageUrl || ""} />
                  <AvatarFallback className="text-[10px] bg-muted">
                    {getInitials(commenter.firstName, commenter.lastName)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {commentsCount > 3 && (
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center border-2 border-background text-[10px] font-medium z-0 mr-[-12px] rtl:mr-0 rtl:ml-[-12px]">
                  +{ (commentsCount - 3).toLocaleString('ar-SA') }
                </div>
              )}
            </div>
          )}

          <Button 
            variant="default" 
            size="sm"
            className="font-bold px-6"
            data-testid="button-share-opinion"
          >
            شارك رأيك
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
