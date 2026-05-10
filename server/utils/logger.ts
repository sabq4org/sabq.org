/**
 * Lightweight log-level gate.
 * - In production, info() is silent unless LOG_VERBOSE=1.
 * - warn() and error() always print.
 * - debug() only prints when LOG_VERBOSE=1.
 *
 * Reduces logging volume and Replit logging quota usage.
 */
const isProd = process.env.NODE_ENV === 'production';
const verbose = process.env.LOG_VERBOSE === '1';

export const log = {
  info: (...args: any[]) => {
    if (!isProd || verbose) console.log(...args);
  },
  debug: (...args: any[]) => {
    if (verbose) console.log(...args);
  },
  warn: (...args: any[]) => console.warn(...args),
  error: (...args: any[]) => console.error(...args),
};
