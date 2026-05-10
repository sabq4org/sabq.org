import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { ChevronUp, Filter, Share2, Clock, Volume2, VolumeX, Zap, Pin, Home, ChevronLeft, Radio, Shield } from "lucide-react";
// import GulfLiveStatsBar from "@/components/GulfLiveStatsBar";

const COUNTRY_MAP: Record<string, { name: string; flag: string }> = {
  saudi_arabia: { name: "السعودية", flag: "🇸🇦" },
  uae: { name: "الإمارات", flag: "🇦🇪" },
  bahrain: { name: "البحرين", flag: "🇧🇭" },
  kuwait: { name: "الكويت", flag: "🇰🇼" },
  qatar: { name: "قطر", flag: "🇶🇦" },
  oman: { name: "عُمان", flag: "🇴🇲" },
  yemen: { name: "اليمن", flag: "🇾🇪" },
};

const EVENT_TYPE_MAP: Record<string, { label: string; color: string }> = {
  drone_intercepted: { label: "صد مسيّرة", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  ballistic_intercepted: { label: "صد صاروخ باليستي", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  cruise_intercepted: { label: "صد صاروخ كروز", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  ballistic_and_drone: { label: "صد صاروخ باليستي ومسيّرة", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  debris_fallen: { label: "سقوط شظايا", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  no_damage: { label: "لا أضرار", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  injuries: { label: "إصابات", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  martyrdom: { label: "استشهاد", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  official_statement: { label: "بيان رسمي", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  official_comment: { label: "تصريح مسؤول", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  military_action: { label: "تحرك عسكري", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  international_condemnation: { label: "إدانة دولية", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300" },
};

const SOURCE_MAP: Record<string, string> = {
  official_statement: "بيان رسمي",
  official_news_agency: "وكالة أنباء رسمية",
  sabq_correspondent: "مراسل سبق",
  international_agencies: "وكالات دولية",
  informed_sources: "مصادر مطلعة",
  other: "مصدر آخر",
};

function timeAgo(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "الآن";
  if (diffMin < 60) return `قبل ${diffMin} د`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `قبل ${diffHrs} س`;
  const diffDays = Math.floor(diffHrs / 24);
  return `قبل ${diffDays} يوم`;
}

const SAUDI_TZ = "Asia/Riyadh";

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: SAUDI_TZ });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const dayName = d.toLocaleDateString("ar-SA-u-ca-gregory", { weekday: "long", timeZone: SAUDI_TZ });
  const day = parseInt(d.toLocaleDateString("en-US", { day: "numeric", timeZone: SAUDI_TZ }));
  const monthName = d.toLocaleDateString("ar-SA-u-ca-gregory", { month: "long", timeZone: SAUDI_TZ });
  const year = parseInt(d.toLocaleDateString("en-US", { year: "numeric", timeZone: SAUDI_TZ }));
  return `${dayName} ${day} ${monthName} ${year}`;
}

function groupByDate(events: any[]) {
  const groups: Record<string, any[]> = {};
  for (const event of events) {
    const dateKey = new Date(event.publishedAt).toLocaleDateString("en-CA", { timeZone: SAUDI_TZ });
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(event);
  }
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

export default function GulfLiveCoverage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [newEventAlert, setNewEventAlert] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const lastTopEventIdRef = useRef<string | null>(null);
  const pollInitializedRef = useRef(false);

  // Polling replaces SSE to avoid keeping Autoscale instances alive.
  const { data: eventsData } = useQuery<{ events: any[]; total: number }>({
    queryKey: ["/api/gulf-events", selectedCountry],
    queryFn: async () => {
      const params = selectedCountry !== "all" ? `?country=${selectedCountry}` : "";
      const res = await fetch(`/api/gulf-events${params}`);
      return res.json();
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  // Detect newly arrived events between polls to trigger alert + stats refresh.
  useEffect(() => {
    const topId: string | null = eventsData?.events?.[0]?.id ?? null;
    if (!topId) return;

    if (!pollInitializedRef.current) {
      pollInitializedRef.current = true;
      lastTopEventIdRef.current = topId;
      return;
    }

    if (topId !== lastTopEventIdRef.current) {
      lastTopEventIdRef.current = topId;
      queryClient.invalidateQueries({ queryKey: ["/api/gulf-events/stats"] });
      setNewEventAlert(true);
      if (soundEnabled) {
        try { new Audio("/notification.mp3").play().catch(() => {}); } catch {}
      }
    }
  }, [eventsData, soundEnabled, queryClient]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth" });
    setNewEventAlert(false);
  }, []);

  const events = eventsData?.events || [];
  const dateGroups = groupByDate(events);

  const handleShare = async (event: any) => {
    const text = `${COUNTRY_MAP[event.country]?.flag} ${COUNTRY_MAP[event.country]?.name} | ${EVENT_TYPE_MAP[event.eventType]?.label}\n${event.content}\n\nالمصدر: صحيفة سبق`;
    if (navigator.share) {
      try { await navigator.share({ title: "البث الحي — سبق", text, url: window.location.href }); } catch {}
    } else {
      navigator.clipboard.writeText(text);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" ref={scrollRef}>
      <Header user={user || undefined} />
      <NavigationBar />
      <div ref={topRef} />

      <div className="border-b bg-muted/30">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 md:py-6">
          <div className="flex items-center gap-2 mb-3 text-muted-foreground text-xs sm:text-sm">
            <Link href="/" data-testid="link-home">
              <span className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
                <Home className="w-3.5 h-3.5" />
                الرئيسية
              </span>
            </Link>
            <ChevronLeft className="w-3 h-3" />
            <span className="text-foreground">البث الحي</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg md:text-xl font-bold leading-tight truncate" data-testid="text-page-title">البث الحي — الاعتداءات على دول الخليج</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                <span className="text-xs text-muted-foreground">مباشر</span>
                {events.length > 0 && (
                  <span className="text-xs text-muted-foreground mr-2">
                    <Clock className="w-3 h-3 inline ml-1" />
                    آخر تحديث: {timeAgo(events[0].publishedAt)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* <GulfLiveStatsBar /> */}

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 md:py-6 flex-1 w-full">
        <div className="flex items-center gap-2 mb-4 sm:mb-6">
          <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-1.5 min-w-max">
              <button
                onClick={() => setSelectedCountry("all")}
                className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${selectedCountry === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                data-testid="filter-all"
              >
                الكل
              </button>
              {Object.entries(COUNTRY_MAP).map(([key, { name, flag }]) => (
                <button
                  key={key}
                  onClick={() => setSelectedCountry(key)}
                  className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${selectedCountry === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  data-testid={`filter-${key}`}
                >
                  {flag} {name}
                </button>
              ))}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="flex-shrink-0"
            onClick={() => setSoundEnabled(!soundEnabled)}
            data-testid="button-toggle-sound"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </Button>
        </div>

        {events.length === 0 ? (
          <Card className="p-8 text-center">
            <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">لا توجد أحداث حالياً</p>
          </Card>
        ) : (
          <div className="relative">
            <div className="absolute right-[13px] sm:right-5 top-0 bottom-0 w-0.5 bg-border" />

            {dateGroups.map(([dateKey, dayEvents]) => (
              <div key={dateKey}>
                <div className="relative flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6 mt-6 sm:mt-8 first:mt-0">
                  <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-muted flex items-center justify-center z-10">
                    <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                  </div>
                  <div className="text-xs sm:text-sm font-semibold text-muted-foreground bg-background px-2.5 sm:px-3 py-1 rounded-full border">
                    {formatDate(dayEvents[0].publishedAt)}
                  </div>
                </div>

                {dayEvents.map((event: any) => (
                  <div
                    key={event.id}
                    className={`relative flex gap-2 sm:gap-3 mb-3 sm:mb-4 pr-1 ${event.priority === "urgent" ? "animate-pulse-subtle" : ""}`}
                    data-testid={`event-card-${event.id}`}
                  >
                    <div className={`w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center z-10 flex-shrink-0 ${
                      event.priority === "urgent" ? "bg-red-500 text-white" : "bg-background border-2 border-border"
                    }`}>
                      {event.isPinned ? (
                        <Pin className="w-4 h-4" />
                      ) : event.priority === "urgent" ? (
                        <Zap className="w-4 h-4" />
                      ) : (
                        <span className="text-lg">{COUNTRY_MAP[event.country]?.flag}</span>
                      )}
                    </div>

                    <Card className={`flex-1 p-3 sm:p-4 ${
                      event.priority === "urgent"
                        ? "border-red-500 dark:border-red-700 bg-red-50/50 dark:bg-red-950/20"
                        : event.isPinned
                        ? "border-primary/30 bg-primary/5"
                        : ""
                    }`}>
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-2">
                        <span className="text-[11px] sm:text-xs text-muted-foreground font-mono">
                          {formatTime(event.publishedAt)}
                        </span>
                        {event.priority === "urgent" && (
                          <Badge variant="destructive" className="text-xs">
                            <Zap className="w-3 h-3 ml-1" />
                            عاجل
                          </Badge>
                        )}
                        {event.isPinned && (
                          <Badge variant="secondary" className="text-xs">
                            <Pin className="w-3 h-3 ml-1" />
                            مثبّت
                          </Badge>
                        )}
                        {event.isUpdate && (
                          <Badge variant="outline" className="text-xs">
                            تحديث
                          </Badge>
                        )}
                        <Badge className={`text-xs ${EVENT_TYPE_MAP[event.eventType]?.color || ""}`}>
                          {EVENT_TYPE_MAP[event.eventType]?.label || event.eventType}
                        </Badge>
                      </div>

                      <div className="flex items-start gap-2 mb-2">
                        <span className="text-lg">{COUNTRY_MAP[event.country]?.flag}</span>
                        <div>
                          <span className="text-sm font-semibold text-muted-foreground">{COUNTRY_MAP[event.country]?.name}</span>
                          <p className="text-sm md:text-base leading-relaxed mt-1" data-testid={`text-event-content-${event.id}`}>
                            {event.content}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2 mt-3">
                        <div className="flex items-center gap-1">
                          {event.editedAt && (
                            <span className="text-xs text-muted-foreground">
                              تم التحديث {timeAgo(event.editedAt)}
                            </span>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => handleShare(event)} data-testid={`button-share-${event.id}`}>
                            <Share2 className="w-3 h-3 ml-1" />
                            شارك
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <Footer />

      {newEventAlert && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 cursor-pointer"
          onClick={scrollToTop}
          data-testid="button-new-event-alert"
        >
          <Badge className="bg-red-600 text-white px-4 py-2 text-sm shadow-lg">
            <ChevronUp className="w-4 h-4 ml-1" />
            حدث جديد — اضغط للعودة للأعلى
          </Badge>
        </div>
      )}

      {showScrollTop && !newEventAlert && (
        <Button
          className="fixed bottom-6 left-6 z-50 rounded-full shadow-lg"
          size="icon"
          onClick={scrollToTop}
          data-testid="button-scroll-top"
        >
          <ChevronUp className="w-5 h-5" />
        </Button>
      )}
    </div>
  );
}
