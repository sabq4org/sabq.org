/**
 * مشغّل «نشرة سَبْق» واحد للتطبيق كله: عنصر الصوت يعيش خارج React حتى يستمر
 * التشغيل عند التنقل بين الصفحات (الهيدر يُعاد تركيبه في كل صفحة).
 */
import { useSyncExternalStore } from "react";

export interface AudioBulletinChapter {
  start: number;
  label: string;
  href: string | null;
}

export interface AudioBulletin {
  id: string;
  title: string;
  publishedAt: string;
  audioUrl: string;
  durationSec: number;
  chapters: AudioBulletinChapter[];
}

export interface PlayerSnapshot {
  bulletinId: string | null;
  playing: boolean;
  /** True once the listener pressed play for this bulletin; keeps the bar on other pages. */
  started: boolean;
  currentTime: number;
  duration: number;
  error: boolean;
}

let audio: HTMLAudioElement | null = null;
let snapshot: PlayerSnapshot = { bulletinId: null, playing: false, started: false, currentTime: 0, duration: 0, error: false };
const listeners = new Set<() => void>();

function set(patch: Partial<PlayerSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

function element(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "none";
  audio.addEventListener("play", () => set({ playing: true, started: true, error: false }));
  audio.addEventListener("pause", () => set({ playing: false }));
  audio.addEventListener("ended", () => set({ playing: false, currentTime: 0, started: false }));
  audio.addEventListener("timeupdate", () => set({ currentTime: audio!.currentTime }));
  audio.addEventListener("loadedmetadata", () => {
    if (Number.isFinite(audio!.duration)) set({ duration: audio!.duration });
  });
  audio.addEventListener("error", () => set({ playing: false, error: true }));
  return audio;
}

function load(bulletin: AudioBulletin) {
  const el = element();
  if (snapshot.bulletinId === bulletin.id) return el;
  el.pause();
  el.src = bulletin.audioUrl;
  set({ bulletinId: bulletin.id, playing: false, started: false, currentTime: 0, duration: bulletin.durationSec, error: false });
  return el;
}

export const audioBulletinPlayer = {
  toggle(bulletin: AudioBulletin) {
    const el = load(bulletin);
    if (el.paused) void el.play().catch(() => set({ playing: false, error: true }));
    else el.pause();
  },
  seek(bulletin: AudioBulletin, seconds: number) {
    const el = load(bulletin);
    el.currentTime = Math.max(0, Math.min(seconds, (snapshot.duration || bulletin.durationSec) - 0.25));
    set({ currentTime: el.currentTime });
    if (el.paused) void el.play().catch(() => set({ playing: false, error: true }));
  },
  stop() {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    set({ playing: false, started: false, currentTime: 0 });
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAudioBulletinPlayer(): PlayerSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

/** Index of the chapter playing at `time` (chapters are sorted by start). */
export function chapterAt(chapters: AudioBulletinChapter[], time: number): number {
  let index = 0;
  chapters.forEach((chapter, i) => { if (time >= chapter.start) index = i; });
  return index;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
