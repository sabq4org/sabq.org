import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, AudioLines } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { type AudioNewsBrief } from "@shared/schema";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";

export default function AudioBriefsDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: briefs, isLoading } = useQuery<AudioNewsBrief[]>({
    queryKey: ['/api/audio-briefs/admin'],
  });
  
  const deleteMutation = useMutation({
    mutationFn: (id: string) => 
      apiRequest(`/api/audio-briefs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/audio-briefs/admin'] });
      toast({ title: '✅ تم الحذف بنجاح' });
    },
  });
  
  const publishMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/audio-briefs/${id}/publish`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/audio-briefs/admin'] });
      toast({ title: '✅ تم النشر بنجاح' });
    },
  });
  
  const getStatusBadge = (status: string, genStatus: string) => {
    if (genStatus === 'processing') {
      return <Badge variant="outline">جاري التوليد...</Badge>;
    }
    if (genStatus === 'failed') {
      return <Badge variant="destructive">فشل التوليد</Badge>;
    }
    if (status === 'published') {
      return <Badge>منشور</Badge>;
    }
    return <Badge variant="secondary">مسودة</Badge>;
  };
  
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-6 pb-10" dir="rtl">
        <DashboardPageHeader
          icon={AudioLines}
          title="الأخبار الصوتية السريعة"
          description="أنشئ موجزات صوتية قصيرة وتابع جاهزيتها للنشر."
          actions={
          <Button
            onClick={() => setLocation('/dashboard/audio-briefs/create')}
            data-testid="button-create-audio-brief"
          >
            <Plus className="ml-2 h-4 w-4" />
            إنشاء خبر صوتي جديد
          </Button>
          }
        />
        
        {isLoading && <div>جاري التحميل...</div>}
        
        <div className="grid gap-4">
          {briefs?.map((brief) => (
            <div
              key={brief.id}
              className="space-y-3 rounded-xl border bg-card p-4 shadow-sm"
            >
              <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{brief.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                    {brief.content}
                  </p>
                </div>
                {getStatusBadge(brief.status, brief.generationStatus)}
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLocation(`/dashboard/audio-briefs/${brief.id}/edit`)}
                  data-testid={`button-edit-${brief.id}`}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                
                {brief.audioUrl && brief.status === 'draft' && (
                  <Button
                    size="sm"
                    onClick={() => publishMutation.mutate(brief.id)}
                    disabled={brief.generationStatus !== 'completed' || publishMutation.isPending}
                    data-testid={`button-publish-${brief.id}`}
                  >
                    نشر
                  </Button>
                )}
                
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deleteMutation.mutate(brief.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-${brief.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
