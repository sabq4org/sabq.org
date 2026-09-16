/**
 * اشتراك SSE في تحديثات الاقتصاد: عند أي حدث يُبطل استعلامات اللقطة/القصة
 * فتتحدث البطاقات دون إعادة تحميل، ويُعاد المفتاح المتغيّر لوميض بصري قصير.
 */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/queryClient";

export interface EconomyUpdateEvent {
  kind: string;
  key: string;
  value?: number | null;
  previous?: number | null;
  at: string;
}

export function useEconomyStream(enabled = true): { last: EconomyUpdateEvent | null; connected: boolean } {
  const qc = useQueryClient();
  const [last, setLast] = useState<EconomyUpdateEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const retry = useRef(0);

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const open = () => {
      es = new EventSource(apiUrl("/api/economy/stream"));
      es.addEventListener("hello", () => { retry.current = 0; setConnected(true); });
      es.addEventListener("update", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as EconomyUpdateEvent;
          setLast(data);
          qc.invalidateQueries({ queryKey: ["/api/economy/snapshot"] });
          if (data.kind === "report") qc.invalidateQueries({ queryKey: ["/api/economy/weekly-story"] });
          if (data.kind === "fx") qc.invalidateQueries({ queryKey: ["/api/economy/fx"] });
        } catch { /* تجاهل إطارًا مشوّهًا */ }
      });
      es.onerror = () => {
        setConnected(false);
        es?.close();
        if (closed) return;
        const delay = Math.min(60_000, 2_000 * 2 ** retry.current++);
        timer = setTimeout(open, delay);
      };
    };
    open();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [enabled, qc]);

  return { last, connected };
}
