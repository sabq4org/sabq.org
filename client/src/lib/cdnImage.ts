// Moved to shared/cdnImage.ts so the server-side edge-meta homepage handler
// can build the SAME hero preload srcset the SPA renders (see that file's
// header comment). This re-export keeps every existing client import working.
export * from "@shared/cdnImage";
