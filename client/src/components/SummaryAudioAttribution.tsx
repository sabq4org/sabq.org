export function SummaryAudioAttribution({ provider }: { provider: string | null }) {
  if (provider !== 'humain') return null;
  return <span className="text-[11px] font-normal text-green-800 dark:text-green-400" data-testid="summary-audio-attribution" dir="rtl">الصوت عبر <bdi>HUMAIN</bdi></span>;
}
