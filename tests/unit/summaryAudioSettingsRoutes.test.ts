import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
const mocks = vi.hoisted(() => ({ getSystemSetting: vi.fn(), upsertSystemSetting: vi.fn(), preview: vi.fn() }));
vi.mock('../../server/storage', () => ({ storage: mocks }));
vi.mock('../../server/services/summaryAudioService', () => ({ previewSummaryVoice: mocks.preview }));
vi.mock('../../server/rbac', () => ({
  requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => req.headers['x-test-user'] ? next() : res.sendStatus(401),
  requirePermission: (permission: string) => (req: express.Request, res: express.Response, next: express.NextFunction) => req.headers['x-test-permission'] === permission ? next() : res.sendStatus(403),
}));
import router from '../../server/routes/summaryAudioSettings';
import { DEFAULT_SUMMARY_AUDIO_SETTINGS as defaults } from '../../server/services/summaryAudioSettings';
const app = express(); app.use(express.json()); app.use(router);
const server = createServer(app);
let base: string;
const admin = { 'x-test-user': 'admin', 'x-test-permission': 'system.manage_settings', 'Content-Type': 'application/json' };
beforeAll(async () => { await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/system/summary-audio-settings`; });
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('HUMAIN_VOICE_API_KEY', 'test-key-not-public'); });
afterEach(() => vi.unstubAllEnvs());
describe('private summary settings API', () => {
  it('requires authentication and system.manage_settings for every operation', async () => {
    for (const [method, suffix] of [['GET',''], ['PUT',''], ['POST','/preview']]) {
      expect((await fetch(base + suffix, { method })).status).toBe(401);
      expect((await fetch(base + suffix, { method, headers: { 'x-test-user': 'reader' } })).status).toBe(403);
    }
    expect(mocks.getSystemSetting).not.toHaveBeenCalled(); expect(mocks.preview).not.toHaveBeenCalled();
  });
  it('returns catalog and configuration status without keys or public caching', async () => {
    const response = await fetch(base, { headers: admin });
    expect(response.headers.get('cache-control')).toContain('no-store');
    const json = await response.json(); expect(json.humainVoices).toHaveLength(4); expect(json.configured.humain).toBe(true);
    expect(JSON.stringify(json)).not.toContain('test-key-not-public');
  });
  it('saves a valid choice privately and rejects unknown fields', async () => {
    expect((await fetch(base, { method: 'PUT', headers: admin, body: JSON.stringify(defaults) })).status).toBe(200);
    expect(mocks.upsertSystemSetting).toHaveBeenCalledWith('summary_audio_settings', defaults, 'tts', false);
    expect((await fetch(base, { method: 'PUT', headers: admin, body: JSON.stringify({ ...defaults, apiKey: 'secret' }) })).status).toBe(400);
    expect(mocks.upsertSystemSetting).toHaveBeenCalledTimes(1);
  });
  it('preview rejects arbitrary text and cross-provider voice IDs', async () => {
    for (const body of [{ provider: 'humain', voiceId: defaults.humainVoiceId, text: 'unbounded text' }, { provider: 'humain', voiceId: defaults.elevenlabsVoiceId }]) {
      expect((await fetch(base + '/preview', { method: 'POST', headers: admin, body: JSON.stringify(body) })).status).toBe(400);
    }
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it('preview serves the actual MIME and never saves', async () => {
    mocks.preview.mockResolvedValue({ buffer: Buffer.from('RIFFtest'), provider: 'humain', contentType: 'audio/wav' });
    const response = await fetch(base + '/preview', { method: 'POST', headers: admin, body: JSON.stringify({ provider: 'humain', voiceId: defaults.humainVoiceId }) });
    expect(response.status).toBe(200); expect(response.headers.get('content-type')).toContain('audio/wav');
    expect(mocks.preview).toHaveBeenCalledWith('humain', defaults.humainVoiceId); expect(mocks.upsertSystemSetting).not.toHaveBeenCalled();
  });
  it('reports a provider outage without returning fake preview audio', async () => {
    mocks.preview.mockRejectedValue(new Error('offline'));
    const response = await fetch(base + '/preview', { method: 'POST', headers: admin, body: JSON.stringify({ provider: 'humain', voiceId: defaults.humainVoiceId }) });
    expect(response.status).toBe(503);
  });
});
