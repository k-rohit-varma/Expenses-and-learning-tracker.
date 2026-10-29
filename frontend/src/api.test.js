import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, download } from './api.js';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('API client', () => {
  it('sends JSON content type and credentialed requests', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetch);
    await api('/expenses', { method: 'POST', body: JSON.stringify({ amount: 12 }) });
    expect(fetch.mock.calls[0][1]).toMatchObject({
      credentials: 'include',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  });
  it('sends credentials on protected downloads too', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(['csv']) });
    vi.stubGlobal('fetch', fetch);
    await download('/export/expenses');
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
  });
  it('keeps production API calls on the same-origin proxy', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_API_BASE_URL', 'https://lifeledger-api.onrender.com/api');
    vi.resetModules();
    const { api: productionApi } = await import('./api.js');
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ user: {} }) });
    vi.stubGlobal('fetch', fetch);
    await productionApi('/auth/me');
    expect(fetch.mock.calls[0][0]).toBe('/api/auth/me');
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
  });
});
