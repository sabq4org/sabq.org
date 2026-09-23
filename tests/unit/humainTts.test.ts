import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const fixture = vi.hoisted(() => ({ path: '' }));
vi.mock('node:module', () => ({ createRequire: () => ({ resolve: () => fixture.path }) }));
import { pcmToWav, splitHumainText, synthesizeHumain, isContentRejection, HumainTtsError } from '../../server/services/humainTts';
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'humain-worker-test-')); fixture.path = join(dir, 'sdk.mjs');
  vi.stubEnv('HUMAIN_VOICE_API_KEY', 'unit-test-key');
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
async function sdk(body: string) { await writeFile(fixture.path, `export class TTSClient { constructor(o) { this.options = o; } async connect() {} async close() {} ${body} }`); }

describe('HUMAIN bounded worker', () => {
  it('builds a valid 24 kHz, 16 bit mono WAV only after the complete stream', async () => {
    await sdk(`async *synthesizeStream(text, opts) { if (opts.voice_id !== 'selected') throw Error('wrong voice'); yield {audio: new Uint8Array([1,0]), is_last: false}; yield {audio: new Uint8Array([2,0]), is_last: true}; }`);
    const wav = await synthesizeHumain('نشرة أخبار', 'selected', 2000);
    expect(wav.subarray(0, 4).toString()).toBe('RIFF'); expect(wav.subarray(8, 12).toString()).toBe('WAVE');
    expect(wav.readUInt32LE(24)).toBe(24000); expect(wav.readUInt16LE(22)).toBe(1); expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(4); expect(wav.subarray(44)).toEqual(Buffer.from([1,0,2,0]));
  });
  it('loads the official SDK CommonJS entry exposed as a default export', async () => {
    fixture.path = join(dir, 'sdk.cjs');
    await writeFile(fixture.path, `module.exports = { TTSClient: class { async connect() {} async close() {} async *synthesizeStream() { yield {audio: new Uint8Array([1,0]), is_last:true}; } } };`);
    expect((await synthesizeHumain('نص', 'voice', 2000)).length).toBe(46);
  });
  it('concatenates all text chunks under one WAV header', async () => {
    await sdk(`async *synthesizeStream(text) { yield {audio: new Uint8Array([1,0]), is_last: true}; }`);
    const text = 'خبر مهم. '.repeat(100);
    const wav = await synthesizeHumain(text, 'voice', 2000);
    expect(wav.length).toBe(44 + splitHumainText(text).length * 2);
  });
  it.each([
    ['missing final marker', `yield {audio: new Uint8Array([1,0]), is_last: false};`],
    ['empty audio', `yield {audio: new Uint8Array(), is_last: true};`],
    ['partial sample', `yield {audio: new Uint8Array([1]), is_last: true};`],
  ])('rejects %s instead of returning partial success', async (_name, body) => {
    await sdk(`async *synthesizeStream() { ${body} }`);
    await expect(synthesizeHumain('نص', 'voice', 2000)).rejects.toThrow('TTS_INCOMPLETE_AUDIO');
  });
  it('propagates structured moderation rejection even when the SDK throws a generic error', async () => {
    await sdk(`async *synthesizeStream(text, options) { options.onError({code: 'TTS_INPUT_NOT_ALLOWED'}); throw Error('generic'); }`);
    await expect(synthesizeHumain('نص', 'voice', 2000)).rejects.toMatchObject({ code: 'TTS_INPUT_NOT_ALLOWED' });
  });
  it('terminates a hung handshake within the overall deadline', async () => {
    await writeFile(fixture.path, `export class TTSClient { async connect() { await new Promise(() => { setInterval(() => {}, 10); }); } }`);
    const started = Date.now();
    await expect(synthesizeHumain('نص', 'voice', 150)).rejects.toThrow('TTS_DEADLINE_EXCEEDED');
    expect(Date.now() - started).toBeLessThan(1500);
  });
  it('terminates a stalled stream and discards its partial audio', async () => {
    await sdk(`async *synthesizeStream() { yield {audio: new Uint8Array([1,0]), is_last: false}; await new Promise(() => { setInterval(() => {}, 10); }); }`);
    await expect(synthesizeHumain('نص', 'voice', 150)).rejects.toThrow('TTS_DEADLINE_EXCEEDED');
  });
});
describe('Arabic text and PCM validation', () => {
  it('splits normalized code points without losing news text or splitting emoji surrogates', () => {
    const text = 'أخبار الرياض 📻 اليوم. '.repeat(65).trim();
    const chunks = splitHumainText(text);
    expect(chunks.every(c => Array.from(c).length <= 450)).toBe(true);
    expect(chunks.join(' ')).toBe(text);
  });
  it('counts expanded number words and rejects empty/oversized text without truncation', () => {
    expect(splitHumainText('بلغت النسبة 25%').join(' ')).not.toMatch(/25/);
    expect(() => splitHumainText(' ')).toThrow(); expect(() => splitHumainText('س'.repeat(4001))).toThrow();
  });
  it('rejects malformed PCM', () => { expect(() => pcmToWav(Buffer.from([1]))).toThrow(); expect(() => pcmToWav(Buffer.alloc(0))).toThrow(); });
  it('distinguishes content rejection from technical outages', () => {
    expect(isContentRejection(new HumainTtsError('TTS_INPUT_NOT_ALLOWED'))).toBe(true);
    expect(isContentRejection(new HumainTtsError('TTS_DEADLINE_EXCEEDED'))).toBe(false);
  });
});
