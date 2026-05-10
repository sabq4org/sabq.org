import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { IFoxCategoryTemplate } from "@/components/admin/ifox/IFoxCategoryTemplate";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Mic,
  Upload,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  FileAudio,
  ImagePlus,
  Plus,
  Save,
  Send,
  Clock,
  Users,
  Calendar,
  Link,
  Tag,
  X,
  Download,
  Trash2,
  Edit,
  Eye
} from "lucide-react";

const podcastSchema = z.object({
  title: z.string().min(5, "عنوان الحلقة يجب أن يكون 5 أحرف على الأقل"),
  description: z.string().min(20, "الوصف يجب أن يكون 20 حرف على الأقل"),
  guestName: z.string().optional(),
  guestBio: z.string().optional(),
  duration: z.string().optional(),
  transcriptUrl: z.string().url().optional().or(z.literal("")),
  audioFile: z.string().min(1, "يجب رفع ملف صوتي"),
  coverImage: z.string().optional(),
  tags: z.array(z.string()).optional(),
  publishDate: z.string().optional(),
  status: z.enum(["draft", "published", "scheduled"]).default("draft"),
});

type PodcastFormData = z.infer<typeof podcastSchema>;

interface PodcastEpisode {
  id: string;
  title: string;
  description: string;
  guestName?: string;
  duration: string;
  audioUrl: string;
  coverImage?: string;
  plays: number;
  publishDate: string;
  status: "draft" | "published" | "scheduled";
}

export default function IFoxVoice() {
  useRoleProtection("admin");
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [tagInput, setTagInput] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const form = useForm<PodcastFormData>({
    resolver: zodResolver(podcastSchema),
    defaultValues: {
      title: "",
      description: "",
      guestName: "",
      guestBio: "",
      duration: "",
      transcriptUrl: "",
      audioFile: "",
      coverImage: "",
      tags: [],
      status: "draft",
    },
  });

  // Fetch episodes
  const { data: episodes, isLoading } = useQuery<PodcastEpisode[]>({
    queryKey: ["/api/admin/ifox/voice/episodes"],
    queryFn: async () => {
      // Mock data for now
      return [
        {
          id: "1",
          title: "مستقبل الذكاء الاصطناعي مع د. أحمد المالكي",
          description: "نناقش في هذه الحلقة أحدث التطورات في مجال الذكاء الاصطناعي",
          guestName: "د. أحمد المالكي",
          duration: "45:32",
          audioUrl: "#",
          coverImage: "#",
          plays: 1234,
          publishDate: "2024-01-15",
          status: "published",
        },
        {
          id: "2",
          title: "أدوات AI للمطورين",
          description: "استعراض لأفضل أدوات الذكاء الاصطناعي للمطورين",
          duration: "32:15",
          audioUrl: "#",
          plays: 856,
          publishDate: "2024-01-14",
          status: "published",
        },
      ];
    },
  });

  // Save episode mutation
  const saveMutation = useMutation({
    mutationFn: async (data: PodcastFormData) => {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value) {
          if (key === "tags" && Array.isArray(value)) {
            formData.append(key, JSON.stringify(value));
          } else {
            formData.append(key, value.toString());
          }
        }
      });
      if (audioFile) formData.append("audio", audioFile);
      if (coverImage) formData.append("cover", coverImage);

      return apiRequest("/api/admin/ifox/voice/episodes", {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الحفظ",
        description: "تم حفظ حلقة البودكاست بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ifox/voice/episodes"] });
      form.reset();
      setAudioFile(null);
      setCoverImage(null);
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل حفظ الحلقة",
        variant: "destructive",
      });
    },
  });

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.type === "audio/mpeg" || file.type === "audio/wav")) {
      setAudioFile(file);
      form.setValue("audioFile", URL.createObjectURL(file));
      
      // Get duration from audio file
      const audio = new Audio(URL.createObjectURL(file));
      audio.addEventListener("loadedmetadata", () => {
        const minutes = Math.floor(audio.duration / 60);
        const seconds = Math.floor(audio.duration % 60);
        form.setValue("duration", `${minutes}:${seconds.toString().padStart(2, "0")}`);
      });
    } else {
      toast({
        title: "خطأ",
        description: "يرجى اختيار ملف صوتي بصيغة MP3 أو WAV",
        variant: "destructive",
      });
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setCoverImage(file);
      form.setValue("coverImage", URL.createObjectURL(file));
    } else {
      toast({
        title: "خطأ",
        description: "يرجى اختيار ملف صورة صالح",
        variant: "destructive",
      });
    }
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleAddTag = () => {
    if (tagInput.trim()) {
      const currentTags = form.getValues("tags") || [];
      form.setValue("tags", [...currentTags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    const currentTags = form.getValues("tags") || [];
    form.setValue("tags", currentTags.filter((t) => t !== tag));
  };

  const onSubmit = (data: PodcastFormData) => {
    saveMutation.mutate(data);
  };

  const stats = [
    { label: "إجمالي الحلقات", value: episodes?.length || 0, icon: Mic, trend: { value: 12, isPositive: true } },
    { label: "الاستماعات الكلية", value: "23.5K", icon: Users, trend: { value: 8.3, isPositive: true } },
    { label: "متوسط المدة", value: "38:45", icon: Clock },
    { label: "التقييم", value: "4.8", icon: Volume2, trend: { value: 0.2, isPositive: true } },
  ];

  const actions = [
    {
      label: "حلقة جديدة",
      icon: Plus,
      onClick: () => form.reset(),
      variant: "default" as const,
    },
  ];

  return (
    <IFoxCategoryTemplate
      title="AI Voice - البودكاست"
      description="إدارة حلقات البودكاست والمحتوى الصوتي"
      icon={Mic}
      gradient="bg-gradient-to-br from-violet-500 to-blue-600"
      iconColor="text-[hsl(var(--ifox-text-primary))]"
      stats={stats}
      actions={actions}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-gradient-to-br from-[hsl(var(--ifox-surface-overlay)/.1)] to-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] backdrop-blur-lg">
            <CardHeader>
              <CardTitle className="text-[hsl(var(--ifox-text-primary))] flex items-center gap-2">
                <FileAudio className="h-5 w-5 text-violet-400" />
                إضافة حلقة جديدة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <Tabs defaultValue="basic" className="w-full">
                    <TabsList className="w-full bg-[hsl(var(--ifox-surface-overlay)/.1)]">
                      <TabsTrigger value="basic" className="flex-1">المعلومات الأساسية</TabsTrigger>
                      <TabsTrigger value="guest" className="flex-1">الضيف</TabsTrigger>
                      <TabsTrigger value="media" className="flex-1">الوسائط</TabsTrigger>
                    </TabsList>

                    <TabsContent value="basic" className="space-y-4 mt-6">
                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[hsl(var(--ifox-text-primary))]">عنوان الحلقة *</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="أدخل عنوان الحلقة"
                                className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[hsl(var(--ifox-text-primary))]">وصف الحلقة *</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                rows={4}
                                placeholder="اكتب وصفاً تفصيلياً للحلقة"
                                className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="transcriptUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[hsl(var(--ifox-text-primary))]">رابط Transcript</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="url"
                                placeholder="https://..."
                                dir="ltr"
                                className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                              />
                            </FormControl>
                            <FormDescription className="text-[hsl(var(--ifox-text-secondary))]">
                              رابط النص المكتوب للحلقة (اختياري)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Tags */}
                      <div className="space-y-2">
                        <Label className="text-[hsl(var(--ifox-text-primary))]">الكلمات المفتاحية</Label>
                        <div className="flex gap-2">
                          <Input
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            placeholder="أضف كلمة مفتاحية"
                            onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                            className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                          />
                          <Button
                            type="button"
                            onClick={handleAddTag}
                            variant="outline"
                            className="border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {form.watch("tags")?.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="bg-violet-500/20 text-[hsl(var(--ifox-text-primary))] border-violet-500/30"
                            >
                              {tag}
                              <button
                                type="button"
                                onClick={() => handleRemoveTag(tag)}
                                className="ml-1 hover:text-red-400"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="guest" className="space-y-4 mt-6">
                      <FormField
                        control={form.control}
                        name="guestName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[hsl(var(--ifox-text-primary))]">اسم الضيف</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="أدخل اسم الضيف (إن وجد)"
                                className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="guestBio"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[hsl(var(--ifox-text-primary))]">نبذة عن الضيف</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                rows={4}
                                placeholder="اكتب نبذة عن الضيف"
                                className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TabsContent>

                    <TabsContent value="media" className="space-y-4 mt-6">
                      {/* Audio Upload */}
                      <div className="space-y-2">
                        <Label className="text-[hsl(var(--ifox-text-primary))]">الملف الصوتي *</Label>
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="border-2 border-dashed border-[hsl(var(--ifox-surface-overlay)/.2)] rounded-lg p-8 text-center cursor-pointer hover:border-violet-400 transition-colors bg-[hsl(var(--ifox-surface-overlay)/.05)]"
                        >
                          <FileAudio className="h-12 w-12 mx-auto text-[hsl(var(--ifox-text-secondary))] mb-3" />
                          <p className="text-[hsl(var(--ifox-text-secondary))]">اضغط لرفع ملف صوتي</p>
                          <p className="text-sm text-[hsl(var(--ifox-text-secondary))] mt-1">MP3, WAV (حد أقصى 500MB)</p>
                          {audioFile && (
                            <p className="text-violet-400 mt-2">{audioFile.name}</p>
                          )}
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="audio/mpeg,audio/wav"
                          onChange={handleAudioUpload}
                          className="hidden"
                        />
                      </div>

                      {/* Cover Image */}
                      <div className="space-y-2">
                        <Label className="text-[hsl(var(--ifox-text-primary))]">صورة الغلاف</Label>
                        <div
                          onClick={() => imageInputRef.current?.click()}
                          className="border-2 border-dashed border-[hsl(var(--ifox-surface-overlay)/.2)] rounded-lg p-8 text-center cursor-pointer hover:border-violet-400 transition-colors bg-[hsl(var(--ifox-surface-overlay)/.05)]"
                        >
                          <ImagePlus className="h-12 w-12 mx-auto text-[hsl(var(--ifox-text-secondary))] mb-3" />
                          <p className="text-[hsl(var(--ifox-text-secondary))]">اضغط لرفع صورة الغلاف</p>
                          <p className="text-sm text-[hsl(var(--ifox-text-secondary))] mt-1">JPG, PNG (1:1 نسبة مفضلة)</p>
                          {coverImage && (
                            <p className="text-violet-400 mt-2">{coverImage.name}</p>
                          )}
                        </div>
                        <input
                          ref={imageInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                        {form.watch("coverImage") && (
                          <img
                            src={form.watch("coverImage")}
                            alt="Cover"
                            className="w-32 h-32 object-cover rounded-lg mt-2"
                          />
                        )}
                      </div>

                      {/* Audio Player */}
                      {form.watch("audioFile") && (
                        <div className="bg-gradient-to-br from-violet-500/20 to-blue-500/10 rounded-lg p-4 border border-[hsl(var(--ifox-surface-overlay)/.1)]">
                          <audio
                            ref={audioRef}
                            src={form.watch("audioFile")}
                            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                          />
                          
                          <div className="flex items-center gap-3 mb-3">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={handlePlayPause}
                              className="text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                            >
                              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                            </Button>
                            
                            <div className="flex-1">
                              <Progress
                                value={(currentTime / duration) * 100 || 0}
                                className="h-2 bg-[hsl(var(--ifox-surface-overlay)/.2)]"
                              />
                              <div className="flex justify-between text-xs text-[hsl(var(--ifox-text-secondary))] mt-1">
                                <span>{Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, "0")}</span>
                                <span>{Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, "0")}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-3">
                    <Button
                      type="submit"
                      disabled={saveMutation.isPending}
                      className="bg-gradient-to-r from-violet-500 to-blue-600 hover:from-violet-600 hover:to-blue-700"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {saveMutation.isPending ? "جاري الحفظ..." : "حفظ الحلقة"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => form.setValue("status", "published")}
                      className="border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      نشر مباشرة
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        {/* Episodes List */}
        <div className="space-y-6">
          <Card className="bg-gradient-to-br from-[hsl(var(--ifox-surface-overlay)/.1)] to-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] backdrop-blur-lg">
            <CardHeader>
              <CardTitle className="text-[hsl(var(--ifox-text-primary))] flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Mic className="h-5 w-5 text-violet-400" />
                  الحلقات الأخيرة
                </span>
                <Badge variant="secondary" className="bg-violet-500/20 text-[hsl(var(--ifox-text-primary))]">
                  {episodes?.length || 0} حلقة
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-3">
                  {episodes?.map((episode, index) => (
                    <motion.div
                      key={episode.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Card className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)] transition-colors cursor-pointer">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            {episode.coverImage ? (
                              <img
                                src={episode.coverImage}
                                alt={episode.title}
                                className="w-16 h-16 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center">
                                <Mic className="h-6 w-6 text-violet-400" />
                              </div>
                            )}
                            
                            <div className="flex-1">
                              <h4 className="font-semibold text-[hsl(var(--ifox-text-primary))] text-sm mb-1 line-clamp-1">
                                {episode.title}
                              </h4>
                              <p className="text-xs text-[hsl(var(--ifox-text-secondary))] line-clamp-2 mb-2">
                                {episode.description}
                              </p>
                              <div className="flex items-center gap-3 text-xs text-[hsl(var(--ifox-text-secondary))]">
                                {episode.guestName && (
                                  <span className="flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {episode.guestName}
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {episode.duration}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Play className="h-3 w-3" />
                                  {episode.plays}
                                </span>
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <Badge
                                  variant={episode.status === "published" ? "default" : "secondary"}
                                  className={cn(
                                    "text-xs",
                                    episode.status === "published"
                                      ? "bg-green-500/20 text-green-400"
                                      : "bg-amber-500/20 text-amber-400"
                                  )}
                                >
                                  {episode.status === "published" ? "منشور" : "مسودة"}
                                </Badge>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-[hsl(var(--ifox-text-secondary))] hover:text-[hsl(var(--ifox-text-primary))]"
                                  >
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-[hsl(var(--ifox-text-secondary))] hover:text-[hsl(var(--ifox-text-primary))]"
                                  >
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-[hsl(var(--ifox-text-secondary))] hover:text-red-400"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </IFoxCategoryTemplate>
  );
}