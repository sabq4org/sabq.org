export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryOn?: (error: any) => boolean;
}

const TRANSIENT_ERROR_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE',
  'EHOSTUNREACH', 'EAI_AGAIN', 'ENOTFOUND',
]);

function isTransientError(error: any): boolean {
  if (TRANSIENT_ERROR_CODES.has(error?.code)) return true;

  const status = error?.status || error?.statusCode || error?.response?.status;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return true;

  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('rate limit') || msg.includes('timeout') || msg.includes('econnreset') || 
      msg.includes('socket hang up') || msg.includes('network') || msg.includes('fetch failed')) {
    return true;
  }

  return false;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  label: string,
  options: RetryOptions = {}
): Promise<T> {
  const { 
    maxRetries = 3, 
    baseDelay = 1000, 
    maxDelay = 10000,
    retryOn = isTransientError,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt >= maxRetries || !retryOn(error)) {
        throw lastError;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      const jitter = Math.random() * delay * 0.1;
      console.warn(`[Retry] ${label}: attempt ${attempt}/${maxRetries} failed (${lastError.message}), retrying in ${Math.round(delay + jitter)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }

  throw lastError!;
}
