import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), listInvites: vi.fn(), listDraws: vi.fn(), generate: vi.fn(), recover: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ configured: true, supabase: { auth: { getSession: mocks.getSession, getUser: mocks.getUser, signInWithPassword: mocks.signIn, signOut: mocks.signOut, onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) } } }));
vi.mock('../src/lib/api', () => ({ listInvites: mocks.listInvites, listDraws: mocks.listDraws, generateCodes: mocks.generate, recover: mocks.recover }));
import AdminPage from '../src/pages/AdminPage';

const invite = { id: 'invite-id', code: 'ABCD1234', created_at: '2026-11-24T08:00:00Z', used_at: null, is_used: false };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-id', email: 'admin@example.test' } }, error: null });
  mocks.signIn.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.listInvites.mockResolvedValue([invite]);
  mocks.listDraws.mockResolvedValue([]);
  mocks.recover.mockResolvedValue(null);
});

async function login() {
  await screen.findByLabelText('邮箱地址');
  fireEvent.change(screen.getByLabelText('邮箱地址'), { target: { value: 'admin@example.test' } });
  fireEvent.change(screen.getByLabelText('登录密码'), { target: { value: 'only-in-memory' } });
  fireEvent.click(screen.getByRole('button', { name: '登录管理后台' }));
}

describe('admin session and permissions', () => {
  it('shows no management data before authorization', async () => {
    render(<AdminPage/>);
    await screen.findByRole('button', { name: '登录管理后台' });
    expect(mocks.listInvites).not.toHaveBeenCalled();
    expect(screen.queryByText('ABCD1234')).not.toBeInTheDocument();
  });
  it('requires a server identity and both admin RPCs before showing the dashboard', async () => {
    render(<AdminPage/>); await login();
    expect(await screen.findByText('今天，也在派送快乐。')).toBeVisible();
    expect(mocks.getUser).toHaveBeenCalled();
    expect(mocks.listInvites).toHaveBeenCalledTimes(1);
    expect(mocks.listDraws).toHaveBeenCalledTimes(1);
    expect(screen.getByText('ABCD1234')).toBeVisible();
  });
  it('rejects an authenticated ordinary user denied by the admin RPC', async () => {
    mocks.listInvites.mockRejectedValue({ message: 'NOT_ADMIN' });
    render(<AdminPage/>); await login();
    expect(await screen.findByRole('alert')).toHaveTextContent('没有管理员权限');
    expect(mocks.signOut).toHaveBeenCalled();
    expect(screen.queryByText('今天，也在派送快乐。')).not.toBeInTheDocument();
  });
  it('clears rendered private data on logout', async () => {
    render(<AdminPage/>); await login();
    await screen.findByText('ABCD1234');
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
    expect(await screen.findByRole('button', { name: '登录管理后台' })).toBeVisible();
    expect(screen.queryByText('ABCD1234')).not.toBeInTheDocument();
  });
  it('generates a batch and retains the returned codes without a second fetch', async () => {
    mocks.generate.mockResolvedValue([{ ...invite, id: 'new-id', code: 'NEWC1234' }]);
    render(<AdminPage/>); await login();
    fireEvent.click(await screen.findByRole('button', { name: '生成邀请码' }));
    fireEvent.change(screen.getByLabelText('生成数量'), { target: { value: '1' } });
    const buttons = screen.getAllByRole('button', { name: '生成邀请码' });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(await screen.findByLabelText('本次生成的邀请码')).toHaveValue('NEWC1234');
    expect(mocks.generate).toHaveBeenCalledWith(1);
    expect(screen.getByRole('button', { name: '复制全部' })).toBeEnabled();
  });
  it('searches invitation codes case-insensitively', async () => {
    render(<AdminPage/>); await login(); await screen.findByText('ABCD1234');
    fireEvent.change(screen.getByLabelText('搜索邀请码或奖品'), { target: { value: 'abcd' } });
    expect(screen.getByText('ABCD1234')).toBeVisible();
    fireEvent.change(screen.getByLabelText('搜索邀请码或奖品'), { target: { value: 'other' } });
    await waitFor(() => expect(screen.queryByText('ABCD1234')).not.toBeInTheDocument());
  });
  it('looks up the exact saved result using a full invitation', async () => {
    mocks.recover.mockResolvedValue({ id: 'saved-record-id', prize: '奶茶', created_at: '2026-11-24T08:00:00Z' });
    render(<AdminPage/>); await login(); await screen.findByText('ABCD1234');
    fireEvent.change(screen.getByLabelText('完整邀请码'), { target: { value: 'abcd1234' } });
    fireEvent.click(screen.getByRole('button', { name: '查询结果' }));
    expect(await screen.findByText('saved-record-id')).toBeVisible();
    expect(mocks.recover).toHaveBeenCalledWith('ABCD1234');
    expect(screen.getByRole('region', { name: '该邀请码的中奖结果' })).toHaveTextContent('奶茶');
  });
});
