import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Header } from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Users,
  UserPlus,
  UserMinus,
  TrendingUp,
  FileText,
  Shield,
  AlertCircle,
} from "lucide-react";
import type { User as UserType } from "@shared/schema";
import NotFound from "@/pages/not-found";
import { MobileOptimizedKpiCard } from "@/components/MobileOptimizedKpiCard";

export default function PublicProfile() {
  const { toast } = useToast();
  const [, params] = useRoute("/profile/:userId");
  const userId = params?.userId;
  const [activeTab, setActiveTab] = useState("followers");

  // Fetch current user
  const { data: currentUser } = useQuery<UserType>({
    queryKey: ["/api/auth/user"],
  });

  // Fetch public user profile
  const { data: profileUser, isLoading: isLoadingUser, error: userError } = useQuery<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    firstNameEn: string | null;
    lastNameEn: string | null;
    bio: string | null;
    avatarUrl: string | null;
    isVerified: boolean;
    createdAt: string;
    followersCount: number;
    followingCount: number;
    articlesPublished: number;
    articlesRead: number;
  }>({
    queryKey: ["/api/users", userId, "public"],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/public`);
      if (!res.ok) throw new Error('Failed to fetch public profile');
      return res.json();
    },
    enabled: !!userId,
  });

  // Check if current user follows this profile
  const { data: isFollowingData, isLoading: isLoadingIsFollowing } = useQuery<{
    isFollowing: boolean;
  }>({
    queryKey: ["/api/social/is-following", userId],
    enabled: !!userId && !!currentUser,
  });

  // Fetch followers
  const { data: followersRaw, isLoading: isLoadingFollowers } = useQuery<
    Array<{
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      bio: string | null;
      profileImageUrl: string | null;
    }>
  >({
    queryKey: ["/api/social/followers", userId],
    queryFn: async () => {
      const res = await fetch(`/api/social/followers/${userId}?limit=50`);
      if (!res.ok) throw new Error('Failed to fetch followers');
      return res.json();
    },
    enabled: !!userId && activeTab === "followers",
  });
  const followers = Array.isArray(followersRaw) ? followersRaw : [];

  // Fetch following
  const { data: followingRaw, isLoading: isLoadingFollowing } = useQuery<
    Array<{
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      bio: string | null;
      profileImageUrl: string | null;
    }>
  >({
    queryKey: ["/api/social/following", userId],
    queryFn: async () => {
      const res = await fetch(`/api/social/following/${userId}?limit=50`);
      if (!res.ok) throw new Error('Failed to fetch following');
      return res.json();
    },
    enabled: !!userId && activeTab === "following",
  });
  const following = Array.isArray(followingRaw) ? followingRaw : [];

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/social/follow", {
        method: "POST",
        body: JSON.stringify({ followingId: userId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social/is-following", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/followers", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/following", currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/stats", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/stats", currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId, "public"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", currentUser?.id, "public"] });
      toast({
        title: "تمت المتابعة",
        description: "أصبحت تتابع هذا المستخدم",
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

  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/social/unfollow/${userId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social/is-following", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/followers", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/following", currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/stats", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/social/stats", currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId, "public"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", currentUser?.id, "public"] });
      toast({
        title: "تم إلغاء المتابعة",
        description: "لم تعد تتابع هذا المستخدم",
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

  const getInitials = (user: typeof profileUser) => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
    }
    if (user?.firstName) {
      return (user.firstName?.[0] || 'م').toUpperCase();
    }
    return "م";
  };

  const getUserDisplayName = (user: typeof profileUser) => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user?.firstName) {
      return user.firstName;
    }
    if (user?.lastName) {
      return user.lastName;
    }
    return "مستخدم";
  };

  const isOwnProfile = currentUser?.id === userId;
  const isFollowing = isFollowingData?.isFollowing || false;

  // Loading state
  if (isLoadingUser) {
    return (
      <div className="min-h-screen bg-background">
        <Header user={currentUser} />
        <div className="relative">
          <div className="h-48 bg-gradient-to-br from-primary/10 to-accent/10" />
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative -mt-20 pb-6">
              <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-end mb-8">
                <Skeleton className="h-32 w-32 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-8 w-64" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-96" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state - user not found
  if (userError || !profileUser) {
    return <NotFound />;
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header user={currentUser} />

      {/* Hero Header with Cover */}
      <div className="relative">
        {/* Cover Image with Gradient */}
        <div className="h-48 bg-gradient-to-br from-primary/10 to-accent/10" />

        {/* Profile Info Section */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative -mt-20 pb-6">
            {/* Avatar + Basic Info */}
            <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-end mb-8">
              <Avatar className="h-32 w-32 border-4 border-background shadow-xl">
                <AvatarImage
                  src={profileUser.avatarUrl || ""}
                  alt={getUserDisplayName(profileUser)}
                  className="object-cover"
                  data-testid="img-profile-avatar"
                />
                <AvatarFallback className="bg-primary text-primary-foreground text-3xl">
                  {getInitials(profileUser)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <h1 className="text-3xl font-bold" data-testid="text-profile-name">
                    {getUserDisplayName(profileUser)}
                  </h1>
                  {profileUser.isVerified && (
                    <Badge variant="secondary" className="gap-1" data-testid="badge-verified">
                      <Shield className="h-3 w-3" />
                      موثق
                    </Badge>
                  )}
                </div>
                {profileUser.bio && (
                  <p className="text-foreground/80 max-w-2xl" data-testid="text-profile-bio">
                    {profileUser.bio}
                  </p>
                )}
              </div>

              {/* Follow/Unfollow Button */}
              <div className="shrink-0">
                {isOwnProfile ? (
                  <Alert className="max-w-sm" data-testid="alert-own-profile">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>هذا ملفك الشخصي</AlertDescription>
                  </Alert>
                ) : currentUser ? (
                  isFollowing ? (
                    <Button
                      variant="outline"
                      size="default"
                      onClick={() => unfollowMutation.mutate()}
                      disabled={unfollowMutation.isPending || isLoadingIsFollowing}
                      className="gap-2"
                      data-testid="button-unfollow"
                    >
                      <UserMinus className="h-4 w-4" />
                      إلغاء المتابعة
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      size="default"
                      onClick={() => followMutation.mutate()}
                      disabled={followMutation.isPending || isLoadingIsFollowing}
                      className="gap-2"
                      data-testid="button-follow"
                    >
                      <UserPlus className="h-4 w-4" />
                      متابعة
                    </Button>
                  )
                ) : null}
              </div>
            </div>

            {/* Quick Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
              <MobileOptimizedKpiCard
                label="المتابعون"
                value={(profileUser.followersCount || 0).toLocaleString('en-US')}
                icon={Users}
                iconColor="text-primary"
                iconBgColor="bg-primary/10"
                testId="text-stat-followers"
              />

              <MobileOptimizedKpiCard
                label="المتابَعون"
                value={(profileUser.followingCount || 0).toLocaleString('en-US')}
                icon={Users}
                iconColor="text-accent-foreground"
                iconBgColor="bg-accent/30"
                testId="text-stat-following"
              />

              <MobileOptimizedKpiCard
                label="مقالات منشورة"
                value={(profileUser.articlesPublished || 0).toLocaleString('en-US')}
                icon={FileText}
                iconColor="text-muted-foreground"
                iconBgColor="bg-muted"
                testId="text-stat-articles-published"
              />

              <MobileOptimizedKpiCard
                label="مقالات مقروءة"
                value={(profileUser.articlesRead || 0).toLocaleString('en-US')}
                icon={TrendingUp}
                iconColor="text-blue-500"
                iconBgColor="bg-blue-500/10"
                testId="text-stat-articles-read"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area - Tabs */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full sm:w-auto" data-testid="tabs-social">
            <TabsTrigger value="followers" className="flex-1 sm:flex-none" data-testid="tab-followers">
              المتابعون ({profileUser.followersCount || 0})
            </TabsTrigger>
            <TabsTrigger value="following" className="flex-1 sm:flex-none" data-testid="tab-following">
              المتابَعون ({profileUser.followingCount || 0})
            </TabsTrigger>
          </TabsList>

          {/* Followers Tab */}
          <TabsContent value="followers" className="mt-6">
            {isLoadingFollowers ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : followers.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {followers.map((follower) => (
                  <Card
                    key={follower.id}
                    className="hover-elevate transition-all cursor-pointer"
                    data-testid={`card-follower-${follower.id}`}
                  >
                    <CardContent className="p-4">
                      <Link href={`/profile/${follower.id}`}>
                        <a className="flex items-center gap-3">
                          <Avatar className="h-12 w-12">
                            <AvatarImage
                              src={follower.profileImageUrl || ""}
                              alt={`${follower.firstName || ""} ${follower.lastName || ""}`}
                              className="object-cover"
                            />
                            <AvatarFallback className="bg-primary text-primary-foreground">
                              {follower.firstName?.[0] || follower?.email?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate" data-testid={`text-follower-name-${follower.id}`}>
                              {follower.firstName && follower.lastName
                                ? `${follower.firstName} ${follower.lastName}`
                                : follower.firstName || follower.lastName || "مستخدم"}
                            </p>
                            <p className="text-sm text-muted-foreground truncate">
                              {follower.email}
                            </p>
                          </div>
                        </a>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-2">لا يوجد متابعون</p>
                  <p className="text-sm text-muted-foreground">
                    لا يتابع أحد هذا المستخدم بعد
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Following Tab */}
          <TabsContent value="following" className="mt-6">
            {isLoadingFollowing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : following.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {following.map((followedUser) => (
                  <Card
                    key={followedUser.id}
                    className="hover-elevate transition-all cursor-pointer"
                    data-testid={`card-following-${followedUser.id}`}
                  >
                    <CardContent className="p-4">
                      <Link href={`/profile/${followedUser.id}`}>
                        <a className="flex items-center gap-3">
                          <Avatar className="h-12 w-12">
                            <AvatarImage
                              src={followedUser.profileImageUrl || ""}
                              alt={`${followedUser.firstName || ""} ${followedUser.lastName || ""}`}
                              className="object-cover"
                            />
                            <AvatarFallback className="bg-primary text-primary-foreground">
                              {followedUser.firstName?.[0] || followedUser?.email?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate" data-testid={`text-following-name-${followedUser.id}`}>
                              {followedUser.firstName && followedUser.lastName
                                ? `${followedUser.firstName} ${followedUser.lastName}`
                                : followedUser.firstName || followedUser.lastName || "مستخدم"}
                            </p>
                            <p className="text-sm text-muted-foreground truncate">
                              {followedUser.email}
                            </p>
                          </div>
                        </a>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-2">لا يتابع أحدًا</p>
                  <p className="text-sm text-muted-foreground">
                    لا يتابع هذا المستخدم أي شخص بعد
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
