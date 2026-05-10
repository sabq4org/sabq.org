import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DashboardLayout } from "@/components/DashboardLayout";
import { 
  Mic, 
  Plus, 
  Trash2, 
  Upload, 
  Play, 
  Pause, 
  Volume2,
  Loader2,
  CheckCircle,
  XCircle,
  AudioWaveform
} from "lucide-react";
import { useDropzone } from "react-dropzone";

type Voice = {
  voice_id: string;
  name: string;
  category?: string;
  description?: string;
  labels?: Record<string, string>;
  preview_url?: string;
};

export default function VoiceManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isCloneDialogOpen, setIsCloneDialogOpen] = useState(false);
  const [voiceName, setVoiceName] = useState("");
  const [voiceDescription, setVoiceDescription] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const { data: voicesData, isLoading } = useQuery<{ voices: Voice[] }>({
    queryKey: ["/api/elevenlabs/voices"],
  });

  const cloneMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/elevenlabs/voices/clone", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "فشل في استنساخ الصوت");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/elevenlabs/voices"] });
      toast({
        title: "تم استنساخ الصوت",
        description: "تم إنشاء الصوت الجديد بنجاح",
      });
      resetCloneForm();
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (voiceId: string) => {
      return apiRequest(`/api/elevenlabs/voices/${voiceId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/elevenlabs/voices"] });
      toast({
        title: "تم الحذف",
        description: "تم حذف الصوت بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في حذف الصوت",
        variant: "destructive",
      });
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const audioFiles = acceptedFiles.filter(file => 
      file.type.startsWith("audio/") || 
      file.name.endsWith(".mp3") || 
      file.name.endsWith(".wav") ||
      file.name.endsWith(".m4a")
    );
    setUploadedFiles(prev => [...prev, ...audioFiles].slice(0, 25));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "audio/*": [".mp3", ".wav", ".m4a", ".ogg", ".flac"],
    },
    maxFiles: 25,
  });

  const resetCloneForm = () => {
    setVoiceName("");
    setVoiceDescription("");
    setUploadedFiles([]);
    setIsCloneDialogOpen(false);
  };

  const handleCloneVoice = async () => {
    if (!voiceName.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال اسم الصوت",
        variant: "destructive",
      });
      return;
    }

    if (uploadedFiles.length === 0) {
      toast({
        title: "خطأ",
        description: "يرجى رفع ملف صوتي واحد على الأقل",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("name", voiceName);
    if (voiceDescription) {
      formData.append("description", voiceDescription);
    }
    formData.append("labels", JSON.stringify({ source: "sabq", type: "cloned" }));
    
    uploadedFiles.forEach(file => {
      formData.append("files", file);
    });

    cloneMutation.mutate(formData);
  };

  const playPreview = (voice: Voice) => {
    if (playingVoice === voice.voice_id) {
      audioElement?.pause();
      setPlayingVoice(null);
      setAudioElement(null);
      return;
    }

    if (audioElement) {
      audioElement.pause();
    }

    if (voice.preview_url) {
      const audio = new Audio(voice.preview_url);
      audio.onended = () => {
        setPlayingVoice(null);
        setAudioElement(null);
      };
      audio.play();
      setPlayingVoice(voice.voice_id);
      setAudioElement(audio);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clonedVoices = voicesData?.voices?.filter(v => v.category === "cloned" || v.labels?.source === "sabq") || [];
  const presetVoices = voicesData?.voices?.filter(v => v.category !== "cloned" && !v.labels?.source) || [];

  const adminRoles = ["admin", "superadmin", "super_admin", "system_admin"];
  if (!user || !adminRoles.includes(user.role || "")) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Card className="p-8 text-center">
            <XCircle className="h-16 w-16 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-bold mb-2">غير مصرح</h2>
            <p className="text-muted-foreground">لا توجد لديك صلاحيات للوصول إلى هذه الخدمة</p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AudioWaveform className="h-7 w-7 text-primary" />
              إدارة الأصوات
            </h1>
            <p className="text-muted-foreground mt-1">
              استنساخ وإدارة أصوات المنصة
            </p>
          </div>
          
          <Dialog open={isCloneDialogOpen} onOpenChange={setIsCloneDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-clone-voice">
                <Plus className="h-4 w-4 ml-2" />
                استنساخ صوت جديد
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg" dir="rtl">
              <DialogHeader>
                <DialogTitle>استنساخ صوت جديد</DialogTitle>
                <DialogDescription>
                  ارفع عينات صوتية لإنشاء صوت مستنسخ خاص بالمنصة
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">اسم الصوت</label>
                  <Input
                    placeholder="مثال: صوت سبق الرسمي"
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value)}
                    data-testid="input-voice-name"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">الوصف (اختياري)</label>
                  <Textarea
                    placeholder="وصف مختصر للصوت..."
                    value={voiceDescription}
                    onChange={(e) => setVoiceDescription(e.target.value)}
                    data-testid="input-voice-description"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">العينات الصوتية</label>
                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                      isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                    }`}
                    data-testid="dropzone-voice-files"
                  >
                    <input {...getInputProps()} />
                    <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {isDragActive ? "أفلت الملفات هنا..." : "اسحب الملفات الصوتية أو انقر للاختيار"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      MP3, WAV, M4A - حتى 25 ملف
                    </p>
                  </div>

                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2 mt-3">
                      {uploadedFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <Mic className="h-4 w-4 text-primary" />
                            <span className="text-sm truncate max-w-[200px]">{file.name}</span>
                            <span className="text-xs text-muted-foreground">
                              ({(file.size / 1024 / 1024).toFixed(2)} MB)
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFile(index)}
                            data-testid={`button-remove-file-${index}`}
                          >
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={resetCloneForm}>
                  إلغاء
                </Button>
                <Button
                  onClick={handleCloneVoice}
                  disabled={cloneMutation.isPending}
                  data-testid="button-submit-clone"
                >
                  {cloneMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                      جاري الاستنساخ...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 ml-2" />
                      استنساخ الصوت
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {clonedVoices.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Mic className="h-5 w-5 text-primary" />
                  الأصوات المستنسخة ({clonedVoices.length})
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {clonedVoices.map((voice) => (
                    <Card key={voice.voice_id} data-testid={`card-voice-${voice.voice_id}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{voice.name}</CardTitle>
                            <CardDescription className="text-xs mt-1">
                              {voice.description || "صوت مستنسخ"}
                            </CardDescription>
                          </div>
                          <Badge variant="secondary">مستنسخ</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2">
                          {voice.preview_url && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => playPreview(voice)}
                              data-testid={`button-preview-${voice.voice_id}`}
                            >
                              {playingVoice === voice.voice_id ? (
                                <Pause className="h-4 w-4 ml-1" />
                              ) : (
                                <Play className="h-4 w-4 ml-1" />
                              )}
                              معاينة
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                data-testid={`button-delete-${voice.voice_id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent dir="rtl">
                              <AlertDialogHeader>
                                <AlertDialogTitle>حذف الصوت؟</AlertDialogTitle>
                                <AlertDialogDescription>
                                  هل أنت متأكد من حذف "{voice.name}"؟ لا يمكن التراجع عن هذا الإجراء.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(voice.voice_id)}
                                  className="bg-destructive hover:bg-destructive/90"
                                >
                                  حذف
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Volume2 className="h-5 w-5 text-muted-foreground" />
                الأصوات الجاهزة ({presetVoices.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {presetVoices.map((voice) => (
                  <Card key={voice.voice_id} className="bg-muted/30" data-testid={`card-preset-${voice.voice_id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-sm">{voice.name}</CardTitle>
                          <CardDescription className="text-xs mt-1">
                            {voice.category || "جاهز"}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {voice.preview_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => playPreview(voice)}
                          data-testid={`button-preview-preset-${voice.voice_id}`}
                        >
                          {playingVoice === voice.voice_id ? (
                            <Pause className="h-4 w-4 ml-1" />
                          ) : (
                            <Play className="h-4 w-4 ml-1" />
                          )}
                          معاينة
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
