import React, { useState } from 'react';
import { useArticleSummaryAudio } from '../../client/src/hooks/useArticleSummaryAudio';
import { SummaryAudioAttribution } from '../../client/src/components/SummaryAudioAttribution';
import { LanguageProvider } from '../../client/src/contexts/LanguageContext';
import { LiveRegionProvider } from '../../client/src/contexts/LiveRegionContext';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../client/src/lib/queryClient';
import { SummaryAudioSettings } from '../../client/src/components/admin/SummaryAudioSettings';
import { Toaster } from '../../client/src/components/ui/toaster';
import '../../client/src/index.css';
function PlaybackFixture() {
  const [slug, setSlug] = useState('humain');
  const { provider, isLoadingAudio, handlePlayAudio } = useArticleSummaryAudio(slug, '1', true);
  return <section className="space-y-4 rounded-lg border p-4" dir="rtl">
    <div className="flex items-center gap-2"><button disabled={isLoadingAudio} onClick={handlePlayAudio}>استماع للموجز</button><SummaryAudioAttribution provider={provider} /></div>
    <div className="flex gap-3">{['humain', 'elevenlabs', 'google', 'unknown', 'failed'].map(value => <button key={value} onClick={() => setSlug(value)}>{value}</button>)}</div>
  </section>;
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}><LanguageProvider><LiveRegionProvider>
    <main className="mx-auto max-w-5xl p-4 sm:p-8"><h1 className="mb-6 text-2xl font-bold">إعدادات النظام</h1>{window.location.hash === '#playback' ? <PlaybackFixture /> : <SummaryAudioSettings />}</main><Toaster />
  </LiveRegionProvider></LanguageProvider></QueryClientProvider>,
);
