export type EditAndGenerateStreamEventHandler = (event: string, data: unknown) => void;

export interface StreamEditAndGenerateOptions {
  content: string;
  url: string;
  csrfToken?: string | null;
  onEvent: EditAndGenerateStreamEventHandler;
  fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

/**
 * Returns null only when the stream route is explicitly absent (404/405).
 * Every other HTTP, protocol, or transport failure is surfaced so callers do
 * not start a second, paid generation request after an ambiguous outcome.
 */
export async function streamEditAndGenerate({
  content,
  url,
  csrfToken,
  onEvent,
  fetchImpl = fetch,
}: StreamEditAndGenerateOptions): Promise<Record<string, unknown> | null> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    credentials: "include",
    body: JSON.stringify({ content, language: "ar" }),
  });

  if (response.status === 404 || response.status === 405) return null;
  if (!response.ok) {
    throw createHttpError(`فشل بث التحرير والتوليد (HTTP ${response.status})`, response.status);
  }

  if (!response.headers.get("content-type")?.toLowerCase().includes("text/event-stream")) {
    throw new Error("استجابة بث التحرير والتوليد غير صالحة، يرجى المحاولة مرة أخرى");
  }
  if (!response.body) {
    throw new Error("استجابة بث التحرير والتوليد فارغة، يرجى المحاولة مرة أخرى");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let dataLines: string[] = [];
  let result: Record<string, unknown> | null = null;
  let hasResult = false;
  let eventError: Error | null = null;

  const dispatch = () => {
    if (!dataLines.length) {
      currentEvent = "";
      return;
    }

    let data: unknown;
    try {
      data = JSON.parse(dataLines.join("\n"));
    } catch {
      // Keep the legacy SSE behavior: malformed individual events are ignored;
      // an absent result still fails the whole request below.
      dataLines = [];
      currentEvent = "";
      return;
    }

    if (currentEvent === "result") {
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        eventError = new Error("نتيجة بث التحرير والتوليد غير صالحة، يرجى المحاولة مرة أخرى");
      } else {
        result = data as Record<string, unknown>;
        hasResult = true;
      }
    } else if (currentEvent === "error") {
      const message = (data as { message?: unknown } | null)?.message;
      eventError = new Error(typeof message === "string" ? message : "فشل في تحرير وتوليد المحتوى");
    } else if (currentEvent) {
      onEvent(currentEvent, data);
    }
    dataLines = [];
    currentEvent = "";
  };

  const processLine = (line: string) => {
    const normalized = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (normalized === "") {
      dispatch();
    } else if (normalized.startsWith(":")) {
      // SSE comment/heartbeat.
    } else if (normalized.startsWith("event:")) {
      currentEvent = normalized.slice(6).trim();
    } else if (normalized.startsWith("data:")) {
      dataLines.push(normalized.slice(5).trimStart());
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    }
    buffer += decoder.decode();
    if (buffer) processLine(buffer);
    // A final event does not have to end with the optional blank separator.
    dispatch();
  } catch (error) {
    throw new Error("انقطع الاتصال أثناء بث التحرير والتوليد، يرجى المحاولة مرة أخرى", { cause: error });
  }

  if (eventError) throw eventError;
  if (!hasResult) throw new Error("انقطع الاتصال قبل اكتمال التحرير، يرجى المحاولة مرة أخرى");
  return result;
}

function createHttpError(message: string, status: number): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}
