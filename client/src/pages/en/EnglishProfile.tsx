import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { EnglishLayout } from "@/components/en/EnglishLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Heart, 
  Bookmark, 
  FileText, 
  Settings,
  Bell,
  Shield,
  Loader2,
  Upload,
  TrendingUp,
  LayoutDashboard,
  Trophy,
  Coins,
  Star,
  ChevronDown,
  Tag,
  X,
} from "lucide-react";
import { ArticleCard } from "@/components/ArticleCard";
import { SmartInterestsBlock } from "@/components/SmartInterestsBlock";
import { TwoFactorSettings } from "@/components/TwoFactorSettings";
import type { ArticleWithDetails, User as UserType, UserPointsTotal } from "@shared/schema";
import { hasRole } from "@/hooks/useAuth";

const updateUserSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters").optional(),
  lastName: z.string().min(2, "Last name must be at least 2 characters").optional(),
  bio: z.string().max(500, "Bio must not exceed 500 characters").optional(),
  phoneNumber: z.string().regex(/^[0-9+\-\s()]*$/, "Invalid phone number").optional(),
  profileImageUrl: z.string().url("Invalid image URL").optional().or(z.literal("")),
});

type UpdateUserFormData = z.infer<typeof updateUserSchema>;

export default function EnglishProfile() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("bookmarks");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: user } = useQuery<UserType>({
    queryKey: ["/api/auth/user"],
  });

  const form = useForm<UpdateUserFormData>({
    resolver: zodResolver(updateUserSchema),
    values: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      bio: user?.bio || "",
      phoneNumber: user?.phoneNumber || "",
      profileImageUrl: user?.profileImageUrl || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateUserFormData) => {
      return apiRequest("/api/auth/user", {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Successfully updated",
        description: "Your personal information has been saved",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update information. Please try again.",
        variant: "destructive",
      });
    },
  });

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "Please select an image file", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "Image must be under 5 MB", variant: "destructive" });
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entityType", "profile-avatar");
      const uploaded = (await apiRequest("/api/media/upload", {
        method: "POST",
        body: formData,
        isFormData: true,
      })) as { url: string };

      await apiRequest("/api/profile/image", {
        method: "PUT",
        body: JSON.stringify({ profileImageUrl: uploaded.url }),
      });

      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

      toast({
        title: "Successfully updated",
        description: "Your profile picture has been updated",
      });
    } catch (error: any) {
      console.error("[Profile] Error saving image:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const onSubmit = (data: UpdateUserFormData) => {
    updateMutation.mutate(data);
  };

  const { data: likedArticlesRaw, isLoading: isLoadingLiked } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/en/user/liked"],
    enabled: !!user,
  });
  const likedArticles = Array.isArray(likedArticlesRaw) ? likedArticlesRaw : [];

  const { data: bookmarkedArticlesRaw, isLoading: isLoadingBookmarks } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/en/user/bookmarks"],
    enabled: !!user,
  });
  const bookmarkedArticles = Array.isArray(bookmarkedArticlesRaw) ? bookmarkedArticlesRaw : [];

  const { data: readingHistoryRaw, isLoading: isLoadingHistory } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/en/user/history"],
    enabled: !!user,
  });
  const readingHistory = Array.isArray(readingHistoryRaw) ? readingHistoryRaw : [];

  const { data: loyaltyPoints } = useQuery<UserPointsTotal>({
    queryKey: ["/api/loyalty/points"],
    enabled: !!user,
  });

  const { data: followedKeywordsRaw, isLoading: isLoadingKeywords } = useQuery<
    Array<{ tagId: string; tagName: string; notify: boolean; articleCount: number }>
  >({
    queryKey: ["/api/user/followed-keywords"],
    enabled: !!user,
  });
  const followedKeywords = Array.isArray(followedKeywordsRaw) ? followedKeywordsRaw : [];

  const unfollowKeywordMutation = useMutation({
    mutationFn: async (tagId: string) => {
      return await apiRequest(`/api/keywords/unfollow/${tagId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/followed-keywords"] });
      toast({
        title: "Unfollowed",
        description: "You will no longer receive notifications about this keyword",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to unfollow",
        variant: "destructive",
      });
    },
  });

  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName?.[0]}${user.lastName?.[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user?.email?.[0].toUpperCase();
    }
    return 'U';
  };

  const getUserDisplayName = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user?.firstName) {
      return user.firstName;
    }
    if (user?.lastName) {
      return user.lastName;
    }
    return "User";
  };

  const getRoleBadge = (role?: string) => {
    const labels: Record<string, string> = {
      admin: "Admin",
      editor: "Editor",
      reader: "Reader",
    };
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      admin: "default",
      editor: "secondary",
      reader: "outline",
    };
    return (
      <Badge variant={variants[role || "reader"] || "outline"}>
        {labels[role || "reader"] || role}
      </Badge>
    );
  };

  const getRankIcon = (rank?: string) => {
    switch (rank) {
      case "سفير سبق":
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case "العضو الذهبي":
        return <Star className="h-5 w-5 text-amber-500" />;
      case "المتفاعل":
        return <TrendingUp className="h-5 w-5 text-blue-500" />;
      default:
        return <Coins className="h-5 w-5 text-gray-500" />;
    }
  };

  const getRankColor = (rank?: string) => {
    switch (rank) {
      case "سفير سبق":
        return "from-yellow-500/20 to-amber-500/20 border-yellow-500/30";
      case "العضو الذهبي":
        return "from-amber-500/20 to-orange-500/20 border-amber-500/30";
      case "المتفاعل":
        return "from-blue-500/20 to-cyan-500/20 border-blue-500/30";
      default:
        return "from-gray-500/20 to-slate-500/20 border-gray-500/30";
    }
  };

  if (!user) {
    return (
      <EnglishLayout>
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4">Login Required</h1>
            <p className="text-muted-foreground mb-8">
              Please log in to view your profile
            </p>
            <Button 
              onClick={() => window.location.href = "/login"} 
              data-testid="button-login-profile"
            >
              Log In
            </Button>
          </div>
        </main>
      </EnglishLayout>
    );
  }

  return (
    <EnglishLayout>
      {/* Hero Header with Cover */}
      <div className="relative">
        {/* Cover Image with Gradient */}
        <div className="h-48 bg-gradient-to-br from-primary/10 to-accent/10" />
        
        {/* Profile Info Section */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative -mt-20 pb-6">
            {/* Avatar + Basic Info */}
            <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-end mb-8">
              <div className="relative">
                <Avatar className="h-32 w-32 border-4 border-background shadow-xl">
                  <AvatarImage 
                    src={user.profileImageUrl || ""} 
                    alt={getUserDisplayName()}
                    className="object-cover"
                    data-testid="img-profile-avatar"
                  />
                  <AvatarFallback className="bg-primary text-primary-foreground text-3xl">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
                
                <div className="absolute bottom-0 right-0">
                  <input
                    id="en-avatar-file-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={handleAvatarFileChange}
                    disabled={isUploadingAvatar}
                    data-testid="input-en-avatar-file"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-full shadow-lg"
                    disabled={isUploadingAvatar}
                    onClick={() => document.getElementById("en-avatar-file-input")?.click()}
                    data-testid="button-upload-en-avatar"
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                  <p className="absolute -bottom-8 right-0 text-xs text-muted-foreground whitespace-nowrap">
                    JPG, PNG, WEBP (up to 10MB)
                  </p>
                </div>
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <h1 className="text-3xl font-bold" data-testid="text-profile-name">
                    {getUserDisplayName()}
                  </h1>
                  {getRoleBadge(user.role)}
                </div>
                <p className="text-muted-foreground" data-testid="text-profile-email">
                  {user.email}
                </p>
                {user.bio && (
                  <p className="text-foreground/80 max-w-2xl">
                    {user.bio}
                  </p>
                )}
              </div>
            </div>

            {/* Quick Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="hover-elevate transition-all">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Heart className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">Likes</p>
                      <p className="text-2xl font-bold" data-testid="text-stat-likes">
                        {likedArticles.length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover-elevate transition-all">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-accent/30 flex items-center justify-center">
                      <Bookmark className="h-6 w-6 text-accent-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">Bookmarks</p>
                      <p className="text-2xl font-bold" data-testid="text-stat-bookmarks">
                        {bookmarkedArticles.length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover-elevate transition-all">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                      <TrendingUp className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">Reading History</p>
                      <p className="text-2xl font-bold" data-testid="text-stat-history">
                        {readingHistory.length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[30%_70%] gap-6">
          {/* Sidebar */}
          <aside className="space-y-4 lg:space-y-6">
            {/* Smart Interests - Mobile Collapsible */}
            <div className="lg:block">
              <Collapsible defaultOpen={false} className="lg:hidden">
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover-elevate p-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Your Interests</CardTitle>
                        <ChevronDown className="h-5 w-5 transition-transform duration-200 data-[state=open]:rotate-180" />
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4">
                      <SmartInterestsBlock userId={user.id} />
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
              
              {/* Desktop - Always visible */}
              <div className="hidden lg:block">
                <SmartInterestsBlock userId={user.id} />
              </div>
            </div>

            {/* Followed Keywords - Mobile Collapsible */}
            <Collapsible defaultOpen={false} className="lg:hidden">
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover-elevate p-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Tag className="h-4 w-4" />
                        Followed Keywords
                      </CardTitle>
                      <ChevronDown className="h-5 w-5 transition-transform duration-200 data-[state=open]:rotate-180" />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="p-4 pt-0">
                    {isLoadingKeywords ? (
                      <div className="space-y-2">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                      </div>
                    ) : followedKeywords.length > 0 ? (
                      <div className="space-y-2">
                        {followedKeywords.map((keyword) => (
                          <div
                            key={keyword.tagId}
                            className="flex items-center justify-between gap-2 p-2 rounded-md hover-elevate"
                          >
                            <Link href={`/keyword/${keyword.tagName}`}>
                              <span className="flex items-center gap-2 flex-1 cursor-pointer" data-testid={`link-keyword-${keyword.tagId}`}>
                                <Tag className="h-3.5 w-3.5 text-primary" />
                                <span className="text-sm font-medium">{keyword.tagName}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {keyword.articleCount}
                                </Badge>
                              </span>
                            </Link>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => unfollowKeywordMutation.mutate(keyword.tagId)}
                              disabled={unfollowKeywordMutation.isPending}
                              data-testid={`button-unfollow-keyword-${keyword.tagId}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <Tag className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          You haven't followed any keywords yet
                        </p>
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Desktop Followed Keywords - Always visible */}
            <Card className="hidden lg:block">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Followed Keywords
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingKeywords ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : followedKeywords.length > 0 ? (
                  <div className="space-y-2">
                    {followedKeywords.map((keyword) => (
                      <div
                        key={keyword.tagId}
                        className="flex items-center justify-between gap-2 p-2 rounded-md hover-elevate"
                      >
                        <Link href={`/keyword/${keyword.tagName}`}>
                          <span className="flex items-center gap-2 flex-1 cursor-pointer" data-testid={`link-keyword-${keyword.tagId}`}>
                            <Tag className="h-3.5 w-3.5 text-primary" />
                            <span className="text-sm font-medium">{keyword.tagName}</span>
                            <Badge variant="secondary" className="text-xs">
                              {keyword.articleCount}
                            </Badge>
                          </span>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => unfollowKeywordMutation.mutate(keyword.tagId)}
                          disabled={unfollowKeywordMutation.isPending}
                          data-testid={`button-unfollow-keyword-${keyword.tagId}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Tag className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      You haven't followed any keywords yet
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Loyalty Program - Mobile Collapsible */}
            <Collapsible defaultOpen={false} className="lg:hidden">
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover-elevate p-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        {getRankIcon(loyaltyPoints?.currentRank)}
                        Loyalty Program
                      </CardTitle>
                      <ChevronDown className="h-5 w-5 transition-transform duration-200 data-[state=open]:rotate-180" />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-3 p-4 pt-0">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-muted-foreground">Current Rank</span>
                        <Badge variant="secondary">
                          {loyaltyPoints?.currentRank || "Beginner"}
                        </Badge>
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Total Points</span>
                        <span className="font-bold">{loyaltyPoints?.totalPoints || 0}</span>
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Desktop Loyalty Program - Always visible */}
            <Card className={`hidden lg:block overflow-hidden bg-gradient-to-br ${getRankColor(loyaltyPoints?.currentRank)}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {getRankIcon(loyaltyPoints?.currentRank)}
                  Loyalty Program
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-muted-foreground">Current Rank</span>
                    <Badge variant="secondary">
                      {loyaltyPoints?.currentRank || "Beginner"}
                    </Badge>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total Points</span>
                    <span className="font-bold">{loyaltyPoints?.totalPoints || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Dashboard Links - Mobile Collapsible */}
            {user && hasRole(user, ["admin", "editor"]) && (
              <>
                <Collapsible defaultOpen={false} className="lg:hidden">
                  <Card>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover-elevate p-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            <LayoutDashboard className="h-4 w-4" />
                            Dashboard
                          </CardTitle>
                          <ChevronDown className="h-5 w-5 transition-transform duration-200 data-[state=open]:rotate-180" />
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="space-y-2 p-4 pt-0">
                        <Button variant="outline" className="w-full justify-start" asChild>
                          <Link href="/en/dashboard">
                            <LayoutDashboard className="h-4 w-4 mr-2" />
                            Dashboard
                          </Link>
                        </Button>
                        <Button variant="outline" className="w-full justify-start" asChild>
                          <Link href="/en/dashboard/articles">
                            <FileText className="h-4 w-4 mr-2" />
                            Articles
                          </Link>
                        </Button>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>

                {/* Desktop Dashboard Links - Always visible */}
                <Card className="hidden lg:block">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <LayoutDashboard className="h-4 w-4" />
                      Dashboard
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button variant="outline" className="w-full justify-start" asChild>
                      <Link href="/en/dashboard">
                        <LayoutDashboard className="h-4 w-4 mr-2" />
                        Dashboard
                      </Link>
                    </Button>
                    <Button variant="outline" className="w-full justify-start" asChild>
                      <Link href="/en/dashboard/articles">
                        <FileText className="h-4 w-4 mr-2" />
                        Articles
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </>
            )}
          </aside>

          {/* Main Content */}
          <main>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Profile</CardTitle>
              </CardHeader>
              <CardContent className="p-0 sm:p-6">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <div className="px-4 sm:px-0">
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="bookmarks" data-testid="tab-bookmarks">
                        <Bookmark className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">Bookmarks</span>
                      </TabsTrigger>
                      <TabsTrigger value="liked" data-testid="tab-liked">
                        <Heart className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">Liked</span>
                      </TabsTrigger>
                      <TabsTrigger value="history" data-testid="tab-history">
                        <FileText className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">History</span>
                      </TabsTrigger>
                      <TabsTrigger value="settings" data-testid="tab-settings">
                        <Settings className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">Settings</span>
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <div className="px-4 sm:px-0 mt-6">
                    <TabsContent value="bookmarks">
                      {isLoadingBookmarks ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="space-y-3">
                              <Skeleton className="aspect-[16/9] w-full" />
                              <Skeleton className="h-4 w-3/4" />
                              <Skeleton className="h-3 w-full" />
                              <Skeleton className="h-3 w-2/3" />
                            </div>
                          ))}
                        </div>
                      ) : bookmarkedArticles.length > 0 ? (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.3 }}
                          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                        >
                          <AnimatePresence>
                            {bookmarkedArticles.map((article, index) => (
                              <motion.div
                                key={article.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.3, delay: index * 0.05 }}
                              >
                                <ArticleCard
                                  article={article}
                                  variant="grid"
                                />
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </motion.div>
                      ) : (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className="text-center py-16"
                        >
                          <div className="h-20 w-20 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                            <Bookmark className="h-10 w-10 text-muted-foreground" />
                          </div>
                          <h3 className="text-lg font-semibold mb-2">No bookmarks yet</h3>
                          <p className="text-muted-foreground mb-6">
                            Bookmark articles to read them later
                          </p>
                          <Button asChild data-testid="button-browse-articles-bookmarks">
                            <Link href="/en/news">
                              <a>Browse Articles</a>
                            </Link>
                          </Button>
                        </motion.div>
                      )}
                    </TabsContent>

                    <TabsContent value="liked">
                      {isLoadingLiked ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="space-y-3">
                              <Skeleton className="aspect-[16/9] w-full" />
                              <Skeleton className="h-4 w-3/4" />
                              <Skeleton className="h-3 w-full" />
                              <Skeleton className="h-3 w-2/3" />
                            </div>
                          ))}
                        </div>
                      ) : likedArticles.length > 0 ? (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.3 }}
                          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                        >
                          <AnimatePresence>
                            {likedArticles.map((article, index) => (
                              <motion.div
                                key={article.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.3, delay: index * 0.05 }}
                              >
                                <ArticleCard
                                  article={article}
                                  variant="grid"
                                />
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </motion.div>
                      ) : (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className="text-center py-16"
                        >
                          <div className="h-20 w-20 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                            <Heart className="h-10 w-10 text-muted-foreground" />
                          </div>
                          <h3 className="text-lg font-semibold mb-2">You haven't liked any articles yet</h3>
                          <p className="text-muted-foreground mb-6">
                            Discover featured articles and show your appreciation
                          </p>
                          <Button asChild data-testid="button-browse-articles-liked">
                            <Link href="/en/news">
                              <a>Browse Articles</a>
                            </Link>
                          </Button>
                        </motion.div>
                      )}
                    </TabsContent>

                    <TabsContent value="history">
                      {isLoadingHistory ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="space-y-3">
                              <Skeleton className="aspect-[16/9] w-full" />
                              <Skeleton className="h-4 w-3/4" />
                              <Skeleton className="h-3 w-full" />
                              <Skeleton className="h-3 w-2/3" />
                            </div>
                          ))}
                        </div>
                      ) : readingHistory.length > 0 ? (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.3 }}
                          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                        >
                          <AnimatePresence>
                            {readingHistory.map((article, index) => (
                              <motion.div
                                key={article.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.3, delay: index * 0.05 }}
                              >
                                <ArticleCard
                                  article={article}
                                  variant="grid"
                                />
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </motion.div>
                      ) : (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className="text-center py-16"
                        >
                          <div className="h-20 w-20 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                            <FileText className="h-10 w-10 text-muted-foreground" />
                          </div>
                          <h3 className="text-lg font-semibold mb-2">No reading history</h3>
                          <p className="text-muted-foreground mb-6">
                            Start reading and your history will appear here
                          </p>
                          <Button asChild data-testid="button-browse-articles-history">
                            <Link href="/en/news">
                              <a>Browse Articles</a>
                            </Link>
                          </Button>
                        </motion.div>
                      )}
                    </TabsContent>

                    <TabsContent value="settings" className="space-y-6">
                      <div>
                        <h3 className="text-lg font-semibold mb-4">Update Personal Information</h3>
                        <p className="text-sm text-muted-foreground mb-6">
                          Update your personal information. All fields are optional.
                        </p>
                        
                        <Form {...form}>
                          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <div className="grid gap-6 md:grid-cols-2">
                              <FormField
                                control={form.control}
                                name="firstName"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>First Name</FormLabel>
                                    <FormControl>
                                      <Input 
                                        placeholder="Enter first name" 
                                        {...field} 
                                        data-testid="input-firstName"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name="lastName"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Last Name</FormLabel>
                                    <FormControl>
                                      <Input 
                                        placeholder="Enter last name" 
                                        {...field}
                                        data-testid="input-lastName"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>

                            <FormField
                              control={form.control}
                              name="phoneNumber"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Phone Number</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="+966 123 456 789" 
                                      {...field}
                                      data-testid="input-phoneNumber"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="profileImageUrl"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Profile Picture URL</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="https://example.com/image.jpg" 
                                      {...field}
                                      data-testid="input-profileImageUrl"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="bio"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Bio</FormLabel>
                                  <FormControl>
                                    <Textarea
                                      placeholder="Write a short bio about yourself..."
                                      className="resize-none min-h-[120px]"
                                      {...field}
                                      data-testid="input-bio"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                  <p className="text-xs text-muted-foreground">
                                    {field.value?.length || 0} / 500 characters
                                  </p>
                                </FormItem>
                              )}
                            />

                            <div className="flex justify-end gap-3 pt-4">
                              <Button
                                type="submit"
                                disabled={updateMutation.isPending}
                                data-testid="button-save"
                              >
                                {updateMutation.isPending ? (
                                  <>
                                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                                    Saving...
                                  </>
                                ) : (
                                  <>
                                    <FileText className="ml-2 h-4 w-4" />
                                    Save Changes
                                  </>
                                )}
                              </Button>
                            </div>
                          </form>
                        </Form>
                      </div>
                    </TabsContent>

                    <TabsContent value="security" className="space-y-6">
                      <div>
                        <h3 className="text-lg font-semibold mb-4">Security & Protection</h3>
                        <p className="text-sm text-muted-foreground mb-6">
                          Secure your account with an additional layer of protection using two-factor authentication
                        </p>
                        
                        <TwoFactorSettings />
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    </EnglishLayout>
  );
}
