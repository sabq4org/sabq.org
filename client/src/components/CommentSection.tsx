import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, Send, CornerDownLeft, UserPlus, UserCheck, Sparkles, Clock, TrendingUp } from "lucide-react";
import type { CommentWithUser } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CommentSectionProps {
  articleId: string;
  comments: CommentWithUser[];
  currentUser?: { 
    id: string; 
    email?: string; 
    firstName?: string | null;
    lastName?: string | null;
  };
  onSubmitComment?: (content: string, parentId?: string) => void;
}

export function CommentSection({ 
  articleId, 
  comments,
  currentUser, 
  onSubmitComment 
}: CommentSectionProps) {
  const { toast } = useToast();
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [followingState, setFollowingState] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<"recent" | "popular">("recent");
  
  // Progressive loading: show 3 comments initially, add 5 more each click
  const INITIAL_COMMENTS = 3;
  const LOAD_MORE_COUNT = 5;
  const [visibleCount, setVisibleCount] = useState(INITIAL_COMMENTS);
  
  // Track expanded replies for each comment
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const INITIAL_REPLIES = 2;

  const followMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("/api/social/follow", {
        method: "POST",
        body: JSON.stringify({ followingId: userId }),
      });
    },
    onSuccess: (_, userId) => {
      setFollowingState(prev => ({ ...prev, [userId]: true }));
      queryClient.invalidateQueries({ queryKey: ["/api/social/stats", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/stats", currentUser?.id] });
      toast({
        title: "تمت المتابعة",
        description: "أصبحت تتابع هذا المعلّق",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشلت عملية المتابعة. حاول مرة أخرى.",
        variant: "destructive",
      });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest(`/api/social/unfollow/${userId}`, {
        method: "DELETE",
      });
    },
    onSuccess: (_, userId) => {
      setFollowingState(prev => ({ ...prev, [userId]: false }));
      queryClient.invalidateQueries({ queryKey: ["/api/social/stats", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/stats", currentUser?.id] });
      toast({
        title: "تم إلغاء المتابعة",
        description: "لم تعد تتابع هذا المعلّق",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشلت عملية إلغاء المتابعة. حاول مرة أخرى.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newComment.trim()) {
      onSubmitComment?.(newComment, undefined);
      setNewComment("");
    }
  };

  const handleReply = (parentId: string) => {
    if (replyContent.trim()) {
      onSubmitComment?.(replyContent, parentId);
      setReplyContent("");
      setReplyingTo(null);
    }
  };

  const getInitials = (firstName?: string | null, lastName?: string | null, email?: string) => {
    if (firstName && lastName) {
      return `${firstName?.[0]}${lastName?.[0]}`.toUpperCase();
    }
    if (firstName) return firstName?.[0].toUpperCase();
    if (email) return email[0].toUpperCase();
    return 'م';
  };

  const sortedComments = useMemo(() => {
    const topLevelComments = comments.filter(c => !c.parentId);
    if (sortBy === "popular") {
      return [...topLevelComments].sort((a, b) => {
        const aReplies = a.replies?.length || 0;
        const bReplies = b.replies?.length || 0;
        return bReplies - aReplies;
      });
    }
    return [...topLevelComments].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [comments, sortBy]);

  const renderComment = (comment: CommentWithUser, depth = 0) => {
    const repliesCount = comment.replies?.length || 0;
    const isReply = depth > 0;
    const maxDepth = 3;
    const canReply = depth < maxDepth;
    
    return (
      <div 
        key={comment.id} 
        className={`${isReply ? 'mr-8 mt-3 relative' : 'mb-4'}`}
        data-testid={`comment-${comment.id}`}
      >
        {isReply && (
          <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-primary/20" />
        )}
        <div className="flex gap-3">
          <Avatar className={`${isReply ? 'h-8 w-8' : 'h-10 w-10'} flex-shrink-0`}>
            <AvatarImage 
              src={comment.user.profileImageUrl || ""} 
              alt={`${comment.user.firstName || ""} ${comment.user.lastName || ""}`.trim() || comment.user.email || ""}
              className="object-cover"
            />
            <AvatarFallback className="bg-primary/10 text-primary text-sm">
              {getInitials(comment.user.firstName, comment.user.lastName, comment.user.email)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className={`${isReply ? 'bg-muted/50' : 'bg-muted'} rounded-lg p-4 relative`}>
              {isReply && (
                <Badge 
                  variant="secondary" 
                  className="absolute top-2 left-2 text-xs gap-1"
                  data-testid={`badge-reply-${comment.id}`}
                >
                  <CornerDownLeft className="h-3 w-3" />
                  رد
                </Badge>
              )}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`font-medium ${isReply ? 'text-xs' : 'text-sm'}`} data-testid={`text-comment-author-${comment.id}`}>
                  {comment.user.firstName && comment.user.lastName
                    ? `${comment.user.firstName} ${comment.user.lastName}`
                    : comment.user.email}
                </span>
                {currentUser && comment.user.id !== currentUser.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const isFollowing = followingState[comment.user.id];
                      if (isFollowing) {
                        unfollowMutation.mutate(comment.user.id);
                      } else {
                        followMutation.mutate(comment.user.id);
                      }
                    }}
                    disabled={followMutation.isPending || unfollowMutation.isPending}
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                    data-testid={`button-follow-commenter-${comment.id}`}
                  >
                    {followingState[comment.user.id] ? (
                      <>
                        <UserCheck className="h-3 w-3 ml-1" />
                        متابَع
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-3 w-3 ml-1" />
                        متابعة
                      </>
                    )}
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(comment.createdAt), {
                    addSuffix: true,
                    locale: arSA,
                  })}
                </span>
              </div>
              <p className={`${isReply ? 'text-xs' : 'text-sm'} leading-relaxed whitespace-pre-wrap`} data-testid={`text-comment-content-${comment.id}`}>
                {comment.content}
              </p>
              {comment.status === "approved" && comment.aiClassification === "safe" && (
                <div className="flex items-center gap-1 mt-2 text-xs text-green-600 dark:text-green-400" data-testid={`ai-approved-badge-${comment.id}`}>
                  <Sparkles className="h-3 w-3" />
                  <span>تمت الموافقة تلقائياً</span>
                </div>
              )}
            </div>

            {currentUser && canReply && (
              <div className="flex items-center gap-2 mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs hover-elevate gap-1"
                  onClick={() => setReplyingTo(comment.id)}
                  data-testid={`button-reply-${comment.id}`}
                >
                  <MessageCircle className="h-3 w-3" />
                  رد
                  {repliesCount > 0 && (
                    <span className="text-muted-foreground">({repliesCount.toLocaleString('en-US')})</span>
                  )}
                </Button>
              </div>
            )}

            {replyingTo === comment.id && (
              <div className="mt-3 flex gap-2">
                <Textarea
                  placeholder="اكتب ردك..."
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  className="min-h-[80px]"
                  data-testid={`textarea-reply-${comment.id}`}
                />
                <div className="flex flex-col gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleReply(comment.id)}
                    disabled={!replyContent.trim()}
                    data-testid={`button-submit-reply-${comment.id}`}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setReplyingTo(null);
                      setReplyContent("");
                    }}
                    data-testid={`button-cancel-reply-${comment.id}`}
                  >
                    إلغاء
                  </Button>
                </div>
              </div>
            )}

            {comment.replies && comment.replies.length > 0 && (
              <div className="mt-3">
                {/* Show first INITIAL_REPLIES or all if expanded */}
                {(expandedReplies[comment.id] 
                  ? comment.replies 
                  : comment.replies.slice(0, INITIAL_REPLIES)
                ).map((reply) => renderComment(reply, depth + 1))}
                
                {/* Show "view more replies" button if there are hidden replies */}
                {!expandedReplies[comment.id] && comment.replies.length > INITIAL_REPLIES && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mr-8 mt-2 text-xs text-primary hover:text-primary/80 gap-1"
                    onClick={() => setExpandedReplies(prev => ({ ...prev, [comment.id]: true }))}
                    data-testid={`button-show-more-replies-${comment.id}`}
                  >
                    <MessageCircle className="h-3 w-3" />
                    عرض {(comment.replies.length - INITIAL_REPLIES).toLocaleString('ar-SA')} ردود إضافية
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const commentsCount = comments.length;

  return (
    <Card id="comments" className="bg-background/80 backdrop-blur-sm border-primary/10">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2.5 rounded-full">
              <MessageCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">النقاش</h2>
              <p className="text-sm text-muted-foreground">
                {commentsCount === 0 
                  ? "كن أول من يشارك رأيه في هذا الخبر" 
                  : `${commentsCount.toLocaleString('ar-SA')} ${commentsCount <= 10 ? 'تعليقات' : 'تعليق'} من القراء`
                }
              </p>
            </div>
          </div>
          
          {commentsCount > 1 && (
            <Tabs value={sortBy} onValueChange={(v) => setSortBy(v as "recent" | "popular")}>
              <TabsList className="bg-muted/50">
                <TabsTrigger value="recent" className="gap-1.5 text-xs" data-testid="tab-recent-comments">
                  <Clock className="h-3.5 w-3.5" />
                  الأحدث
                </TabsTrigger>
                <TabsTrigger value="popular" className="gap-1.5 text-xs" data-testid="tab-popular-comments">
                  <TrendingUp className="h-3.5 w-3.5" />
                  الأبرز
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {currentUser ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex gap-3">
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {getInitials(currentUser.firstName, currentUser.lastName, currentUser.email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <Textarea
                  placeholder="ما رأيك في هذا الخبر؟ شاركنا وجهة نظرك..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="min-h-[100px] resize-none bg-muted/30 border-muted-foreground/20 focus:border-primary/50"
                  data-testid="textarea-new-comment"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button 
                type="submit" 
                disabled={!newComment.trim()}
                className="gap-2 px-6"
                data-testid="button-submit-comment"
              >
                <Send className="h-4 w-4" />
                نشر التعليق
              </Button>
            </div>
          </form>
        ) : (
          <div className="bg-muted/30 rounded-lg p-6 text-center">
            <MessageCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">سجل دخولك لتشارك رأيك في هذا الخبر</p>
            <Button variant="default" size="sm" onClick={() => window.location.href = '/login'} data-testid="button-login-to-comment">
              تسجيل الدخول
            </Button>
          </div>
        )}

        {commentsCount > 0 && (
          <div className="space-y-4 pt-4 border-t">
            {/* Show only visibleCount comments */}
            {sortedComments.slice(0, visibleCount).map((comment) => renderComment(comment))}
            
            {/* "Load More" button if there are more comments */}
            {sortedComments.length > visibleCount && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => setVisibleCount(prev => prev + LOAD_MORE_COUNT)}
                  className="gap-2"
                  data-testid="button-load-more-comments"
                >
                  <MessageCircle className="h-4 w-4" />
                  عرض المزيد ({(sortedComments.length - visibleCount).toLocaleString('ar-SA')} تعليق آخر)
                </Button>
              </div>
            )}
          </div>
        )}
        
        {commentsCount === 0 && currentUser && (
          <div className="text-center py-8 bg-muted/20 rounded-lg">
            <MessageCircle className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">لا توجد تعليقات بعد</p>
            <p className="text-muted-foreground text-xs mt-1">كن أول من يبدأ النقاش!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
