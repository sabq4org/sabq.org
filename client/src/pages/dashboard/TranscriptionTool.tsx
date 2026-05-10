import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardLayout } from "@/components/DashboardLayout";
import { 
  FileAudio, 
  Upload, 
  Loader2,
  CheckCircle,
  XCircle,
  Copy,
  Download,
  FileText,
  Clock,
  User,
  Languages
} from "lucide-react";
import { useDropzone } from "react-dropzone";

type TranscriptionResult = {
  success: boolean;
  text: string;
  words: Array<{
    text: string;
    start: number;
    end: number;
    speaker?: string;
  }>;
  speakers: Array<{
    speaker: string;
    start: number;
    end: number;
  }>;
  languageCode: string;
  audioEvents: Array<{
    type: string;
    start: number;
    end: number;
  }>;
};

const LANGUAGE_OPTIONS = [
  { value: "ara", label: "العربية" },
  { value: "eng", label: "English" },
  { value: "urd", label: "اردو" },
  { value: "", label: "اكتشاف تلقائي" },
];

export default function TranscriptionTool() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [languageCode, setLanguageCode] = useState("ara");
  const [diarize, setDiarize] = useState(false);
  const [tagAudioEvents, setTagAudioEvents] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState<TranscriptionResult | null>(null);

  const transcribeMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/elevenlabs/transcribe", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "فشل في تفريغ المقطع");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setTranscriptionResult(data);
      toast({
        title: "تم التفريغ بنجاح",
        description: "تم تحويل المقطع إلى نص",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file && (file.type.startsWith("audio/") || file.type.startsWith("video/"))) {
      setUploadedFile(file);
      setTranscriptionResult(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "audio/*": [".mp3", ".wav", ".m4a", ".ogg", ".flac"],
      "video/*": [".mp4", ".mov", ".avi", ".webm"],
    },
    maxFiles: 1,
  });

  const handleTranscribe = async () => {
    if (!uploadedFile) {
      toast({
        title: "خطأ",
        description: "يرجى رفع ملف صوتي أو فيديو",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", uploadedFile);
    formData.append("languageCode", languageCode);
    formData.append("diarize", String(diarize));
    formData.append("tagAudioEvents", String(tagAudioEvents));

    transcribeMutation.mutate(formData);
  };

  const copyToClipboard = async () => {
    if (transcriptionResult?.text) {
      await navigator.clipboard.writeText(transcriptionResult.text);
      toast({
        title: "تم النسخ",
        description: "تم نسخ النص إلى الحافظة",
      });
    }
  };

  const downloadAsText = () => {
    if (transcriptionResult?.text) {
      const blob = new Blob([transcriptionResult.text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transcription-${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const allowedRoles = ["admin", "superadmin", "editor", "writer", "reporter"];
  if (!user || !allowedRoles.includes(user.role || "")) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Card className="p-8 text-center">
            <XCircle className="h-16 w-16 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-bold mb-2">غير مصرح</h2>
            <p className="text-muted-foreground">ليس لديك صلاحية الوصول لهذه الصفحة</p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileAudio className="h-7 w-7 text-primary" />
            تفريغ المقاطع
          </h1>
          <p className="text-muted-foreground mt-1">
            تحويل الملفات الصوتية والفيديو إلى نص مكتوب
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">رفع الملف</CardTitle>
              <CardDescription>
                ارفع ملف صوتي أو فيديو للتفريغ
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                }`}
                data-testid="dropzone-transcribe-file"
              >
                <input {...getInputProps()} />
                <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  {isDragActive ? "أفلت الملف هنا..." : "اسحب الملف أو انقر للاختيار"}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  MP3, WAV, MP4, MOV - حتى 25 MB
                </p>
              </div>

              {uploadedFile && (
                <div className="flex items-center justify-between bg-muted/50 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    <FileAudio className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium truncate max-w-[200px]">{uploadedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setUploadedFile(null);
                      setTranscriptionResult(null);
                    }}
                    data-testid="button-remove-file"
                  >
                    <XCircle className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              )}

              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>لغة المقطع</Label>
                  <Select value={languageCode} onValueChange={setLanguageCode}>
                    <SelectTrigger data-testid="select-language">
                      <SelectValue placeholder="اختر اللغة" />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGE_OPTIONS.map((lang) => (
                        <SelectItem key={lang.value || "auto"} value={lang.value || "auto"}>
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>تمييز المتحدثين</Label>
                    <p className="text-xs text-muted-foreground">تحديد من يتكلم</p>
                  </div>
                  <Switch
                    checked={diarize}
                    onCheckedChange={setDiarize}
                    data-testid="switch-diarize"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>تمييز الأحداث الصوتية</Label>
                    <p className="text-xs text-muted-foreground">مثل التصفيق والضحك</p>
                  </div>
                  <Switch
                    checked={tagAudioEvents}
                    onCheckedChange={setTagAudioEvents}
                    data-testid="switch-audio-events"
                  />
                </div>
              </div>

              <Button
                className="w-full"
                onClick={handleTranscribe}
                disabled={!uploadedFile || transcribeMutation.isPending}
                data-testid="button-transcribe"
              >
                {transcribeMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    جاري التفريغ...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 ml-2" />
                    تفريغ المقطع
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">النص المفرغ</CardTitle>
                  <CardDescription>
                    نتيجة التفريغ
                  </CardDescription>
                </div>
                {transcriptionResult && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyToClipboard}
                      data-testid="button-copy-text"
                    >
                      <Copy className="h-4 w-4 ml-1" />
                      نسخ
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={downloadAsText}
                      data-testid="button-download-text"
                    >
                      <Download className="h-4 w-4 ml-1" />
                      تحميل
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {transcriptionResult ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 text-sm">
                    <Badge variant="outline" className="gap-1">
                      <Languages className="h-3 w-3" />
                      {LANGUAGE_OPTIONS.find(l => l.value === transcriptionResult.languageCode)?.label || transcriptionResult.languageCode}
                    </Badge>
                    {transcriptionResult.speakers.length > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <User className="h-3 w-3" />
                        {transcriptionResult.speakers.length} متحدث
                      </Badge>
                    )}
                    {transcriptionResult.words.length > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(transcriptionResult.words[transcriptionResult.words.length - 1]?.end || 0)}
                      </Badge>
                    )}
                  </div>

                  <Textarea
                    value={transcriptionResult.text}
                    readOnly
                    className="min-h-[300px] text-base leading-relaxed"
                    data-testid="textarea-transcription-result"
                  />

                  {transcriptionResult.audioEvents.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">الأحداث الصوتية:</p>
                      <div className="flex flex-wrap gap-2">
                        {transcriptionResult.audioEvents.map((event, index) => (
                          <Badge key={index} variant="secondary" className="gap-1">
                            {event.type} ({formatTime(event.start)})
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <FileText className="h-12 w-12 mb-3 opacity-50" />
                  <p className="text-sm">ارفع ملفاً لبدء التفريغ</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
