// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

function mockAccount(role) {
  vi.stubGlobal('fetch', vi.fn(async url => {
    if (String(url).includes('/auth/me')) return { ok: true, status: 200, json: async () => ({ user: { username: 'rohit', role, settings: { theme: 'light' } } }) };
    if (String(url).includes('/dashboard/summary')) return { ok: true, status: 200, json: async () => ({ today: { spent: 0, learningMinutes: 0 }, week: { spent: 0, learningMinutes: 0 }, month: { spent: 0, learningMinutes: 0, activeDays: 0, sessions: 0 }, budget: { amount: 0, remaining: 0 }, categories: [], subjects: [], recent: [], trend: [] }) };
    return { ok: true, status: 200, json: async () => ({ item: { reflection: '' } }) };
  }));
}

describe('role based navigation', () => {
  it('shows Viewers only to the owner', async () => {
    mockAccount('owner');
    render(<BrowserRouter><App /></BrowserRouter>);
    expect(await screen.findByRole('link', { name: /viewers/i })).toBeTruthy();
  });

  it('hides Viewers from normal users', async () => {
    mockAccount('user');
    render(<BrowserRouter><App /></BrowserRouter>);
    await screen.findByRole('heading', { name: 'Good morning' });
    expect(screen.queryByRole('link', { name: /viewers/i })).toBeNull();
  });

  it('verifies the cookie with /auth/me before showing the app after login', async () => {
    let sessionChecks = 0;
    const fetch = vi.fn(async (url) => {
      const path = String(url);
      if (path.includes('/auth/me')) {
        sessionChecks += 1;
        return sessionChecks === 1
          ? { ok: false, status: 401, json: async () => ({ error: 'Please sign in to continue.' }) }
          : { ok: true, status: 200, json: async () => ({ user: { username: 'revanth', role: 'user', settings: { theme: 'light' } } }) };
      }
      if (path.includes('/auth/login')) return { ok: true, status: 200, json: async () => ({ user: { username: 'revanth', role: 'user' } }) };
      if (path.includes('/dashboard/summary')) return { ok: true, status: 200, json: async () => ({ today: { spent: 0, learningMinutes: 0 }, week: { spent: 0, learningMinutes: 0 }, month: { spent: 0, learningMinutes: 0, activeDays: 0, sessions: 0 }, budget: { amount: 0, remaining: 0 }, categories: [], subjects: [], recent: [], trend: [] }) };
      return { ok: true, status: 200, json: async () => ({ item: { reflection: '' } }) };
    });
    vi.stubGlobal('fetch', fetch);
    render(<BrowserRouter><App /></BrowserRouter>);
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'revanth' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'valid-password' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('revanth')).toBeTruthy();
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('/auth/me'))).toHaveLength(2);
    expect(fetch.mock.calls.every(([, options]) => options.credentials === 'include')).toBe(true);
  });

  it('shows subjects from the authenticated account on the Learning page', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('fetch', vi.fn(async url => {
      const path = String(url);
      if (path.includes('/auth/me')) return { ok: true, status: 200, json: async () => ({ user: { username: 'rohit', role: 'owner', settings: { theme: 'light' } } }) };
      if (path.includes('/dashboard/summary')) return { ok: true, status: 200, json: async () => ({ today: { spent: 0, learningMinutes: 0 }, week: { spent: 0, learningMinutes: 0 }, month: { spent: 0, learningMinutes: 0, activeDays: 0, sessions: 0 }, budget: { amount: 0, remaining: 0 }, categories: [], subjects: [], recent: [], trend: [] }) };
      if (path.endsWith('/learning/subjects')) return { ok: true, status: 200, json: async () => ({ items: [{ _id: '0123456789abcdef01234567', name: 'Java', description: 'Backend skills', color: '#334455', icon: 'Code2', archived: false, totalMinutes: 90, sessionCount: 2, weekMinutes: 60, lastStudied: '2026-10-25T10:00:00.000Z' }] }) };
      if (path.includes('/learning/overview')) return { ok: true, status: 200, json: async () => ({ allTimeMinutes: 90, allTimeSessions: 2, weekMinutes: 60, monthMinutes: 90, sessions: 2, totalMinutes: 90, bySubject: [{ subjectId: '0123456789abcdef01234567', name: 'Java', color: '#334455', minutes: 90 }], mostStudied: { name: 'Java', minutes: 90 }, trend: [] }) };
      return { ok: true, status: 200, json: async () => ({ item: { reflection: '' } }) };
    }));
    render(<BrowserRouter><App /></BrowserRouter>);
    fireEvent.click(await screen.findByRole('link', { name: /^learning$/i }));
    expect(await screen.findByRole('heading', { name: 'Your subjects' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Open Java' })).toBeTruthy();
    expect(screen.getByText('Backend skills')).toBeTruthy();
  });

  it('shows the pending approval screen after registration without entering the app', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => String(url).includes('/auth/me')
      ? { ok: false, status: 401, json: async () => ({ error: 'Please sign in to continue.' }) }
      : { ok: true, status: 201, json: async () => ({ username: 'new_viewer', status: 'pending_approval' }) }));
    render(<BrowserRouter><App /></BrowserRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /new here/i }));
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'new_viewer' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-test-password' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByRole('heading', { name: /you’re on the list/i })).toBeTruthy();
    expect(screen.getAllByText('Rohit Varma Kunaparaju').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /expenses/i })).toBeNull();
  });

  it('persists the light/dark toggle on the unauthenticated screen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Please sign in to continue.' }) })));
    render(<BrowserRouter><App /></BrowserRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /switch to dark mode/i }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('lifeledger-theme')).toBe('dark');
  });
});
