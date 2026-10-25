import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.js';

afterEach(() => vi.unstubAllGlobals());

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
});
