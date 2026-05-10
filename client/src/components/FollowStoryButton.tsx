import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Bell, BellOff, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface FollowStoryButtonProps {
  storyId: string;
  storyTitle: string;
}

export default function FollowStoryButton({ storyId, storyTitle }: FollowStoryButtonProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [level, setLevel] = useState<string>("all");
  const [channels, setChannels] = useState<string[]>(["inapp"]);

  // Check if following
  const { data: followStatus } = useQuery<{ isFollowing: boolean }>({
    queryKey: ["/api/stories", storyId, "is-following"],
    enabled: !!storyId,
  });

  const isFollowing = followStatus?.isFollowing || false;

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/stories/${storyId}/follow`, {
        method: "POST",
        body: JSON.stringify({ level, channels }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stories", storyId, "is-following"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stories/my-follows"] });
      toast({
        title: "تمت المتابعة",
        description: `ستتلقى إشعارات عن: ${storyTitle}`,
      });
      setIsSettingsOpen(false);
    },
    onError: () => {
      toast({
        title: "فشلت العملية",
        description: "حاول مرة أخرى",
        variant: "destructive",
      });
    },
  });

  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/stories/${storyId}/follow`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stories", storyId, "is-following"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stories/my-follows"] });
      toast({
        title: "تم إلغاء المتابعة",
        description: `لن تتلقى إشعارات عن: ${storyTitle}`,
      });
    },
    onError: () => {
      toast({
        title: "فشلت العملية",
        description: "حاول مرة أخرى",
        variant: "destructive",
      });
    },
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/stories/follows/${storyId}`, {
        method: "PUT",
        body: JSON.stringify({ level, channels }),
      });
    },
    onSuccess: () => {
      toast({
        title: "تم التحديث",
        description: "تم تحديث إعدادات المتابعة",
      });
      setIsSettingsOpen(false);
    },
    onError: () => {
      toast({
        title: "فشل التحديث",
        description: "حاول مرة أخرى",
        variant: "destructive",
      });
    },
  });

  const handleToggleFollow = () => {
    if (isFollowing) {
      unfollowMutation.mutate();
    } else {
      setIsSettingsOpen(true);
    }
  };

  const handleSaveSettings = () => {
    if (isFollowing) {
      updateSettingsMutation.mutate();
    } else {
      followMutation.mutate();
    }
  };

  const toggleChannel = (channel: string) => {
    setChannels(prev => 
      prev.includes(channel) 
        ? prev.filter(c => c !== channel)
        : [...prev, channel]
    );
  };

  return (
    <>
      <Button
        onClick={handleToggleFollow}
        variant={isFollowing ? "outline" : "default"}
        size="sm"
        disabled={followMutation.isPending || unfollowMutation.isPending}
        data-testid={`button-${isFollowing ? 'unfollow' : 'follow'}-story`}
      >
        {isFollowing ? (
          <>
            <BellOff className="h-4 w-4 ml-2" />
            إلغاء المتابعة
          </>
        ) : (
          <>
            <Bell className="h-4 w-4 ml-2" />
            متابعة القصة
          </>
        )}
      </Button>

      {isFollowing && (
        <Button
          onClick={() => setIsSettingsOpen(true)}
          variant="ghost"
          size="icon"
          data-testid="button-story-settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      )}

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إعدادات المتابعة</DialogTitle>
            <DialogDescription>
              اختر نوع الإشعارات التي تريد تلقيها عن هذه القصة
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-3">
              <Label>مستوى المتابعة</Label>
              <RadioGroup value={level} onValueChange={setLevel}>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="all" id="all" data-testid="radio-level-all" />
                  <Label htmlFor="all">جميع التحديثات</Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="breaking" id="breaking" data-testid="radio-level-breaking" />
                  <Label htmlFor="breaking">الأخبار العاجلة فقط</Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="analysis" id="analysis" data-testid="radio-level-analysis" />
                  <Label htmlFor="analysis">التحليلات فقط</Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="official" id="official" data-testid="radio-level-official" />
                  <Label htmlFor="official">المصادر الرسمية فقط</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <Label>قنوات الإشعار</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="inapp"
                    checked={channels.includes("inapp")}
                    onCheckedChange={() => toggleChannel("inapp")}
                    data-testid="checkbox-channel-inapp"
                  />
                  <Label htmlFor="inapp">داخل التطبيق</Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="email"
                    checked={channels.includes("email")}
                    onCheckedChange={() => toggleChannel("email")}
                    disabled
                    data-testid="checkbox-channel-email"
                  />
                  <Label htmlFor="email" className="text-muted-foreground">
                    البريد الإلكتروني (قريباً)
                  </Label>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSaveSettings}
                disabled={
                  followMutation.isPending || 
                  updateSettingsMutation.isPending || 
                  channels.length === 0
                }
                className="flex-1"
                data-testid="button-save-follow-settings"
              >
                حفظ
              </Button>
              <Button
                onClick={() => setIsSettingsOpen(false)}
                variant="outline"
                className="flex-1"
                data-testid="button-cancel-follow-settings"
              >
                إلغاء
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
