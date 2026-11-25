import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acceptsRecoveryCallback, isRecoveryReturn, recoveryRedirect } from '../src/lib/passwordRecovery';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn(), reset: vi.fn(), update: vi.fn(), signOut: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ configured: true, supabase: { auth: { getSession: mocks.getSession, getUser: mocks.getUser, resetPasswordForEmail: mocks.reset, updateUser: mocks.update, signOut: mocks.signOut } } }));
import PasswordResetPage from '../src/pages/PasswordResetPage';

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/sweet-lucky-draw/#/admin/reset-password');
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { email: 'admin@example.test' } }, error: null });
  mocks.reset.mockResolvedValue({ error: null });
  mocks.update.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

describe('recovery return URLs', () => {
  it('keeps the Pages repository path and discards unrelated query and fragments', () => {
    expect(recoveryRedirect('https://example.test/sweet-lucky-draw/?other=1#/admin')).toBe('https://example.test/sweet-lucky-draw/?recovery=1');
  });
  it('recognizes both explicit and Dashboard recovery returns', () => {
    expect(isRecoveryReturn(new URL('https://example.test/?recovery=1'))).toBe(true);
    expect(isRecoveryReturn(new URL('https://example.test/#type=recovery&access_token=example'))).toBe(true);
    expect(isRecoveryReturn(new URL('https://example.test/#/admin'))).toBe(false);
  });
  it('accepts recovery grants and errors, and ignores unrelated token-bearing URLs', () => {
    const root = new URL('https://example.test/');
    expect(acceptsRecoveryCallback(root, { type: 'recovery', access_token: 'example' })).toBe(true);
    expect(acceptsRecoveryCallback(new URL('https://example.test/?recovery=1'), { error: 'access_denied' })).toBe(true);
    expect(acceptsRecoveryCallback(root, { type: 'signup', access_token: 'example' })).toBe(false);
    expect(acceptsRecoveryCallback(root, { access_token: 'example' })).toBe(false);
    expect(acceptsRecoveryCallback(new URL('https://example.test/?recovery=1'), {})).toBe(false);
  });
});

describe('password recovery', () => {
  it('does not send email or change a password when the page opens', () => {
    render(<PasswordResetPage/>);
    expect(screen.getByLabelText('管理员邮箱')).toBeVisible();
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('requests email only after submission with the exact Pages recovery URL', async () => {
    render(<PasswordResetPage/>);
    fireEvent.change(screen.getByLabelText('管理员邮箱'), { target: { value: 'admin@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: '发送重置邮件' }));
    await screen.findByRole('status');
    expect(mocks.reset).toHaveBeenCalledWith('admin@example.test', { redirectTo: `${window.location.origin}/sweet-lucky-draw/?recovery=1` });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('reports email configuration failure without claiming the message was sent', async () => {
    mocks.reset.mockResolvedValue({ error: { code: 'email_address_not_authorized' } });
    render(<PasswordResetPage/>);
    fireEvent.change(screen.getByLabelText('管理员邮箱'), { target: { value: 'admin@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: '发送重置邮件' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('项目暂不能向此邮箱发送邮件');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('requires a verified current session before presenting the new password form', async () => {
    render(<PasswordResetPage recovering/>);
    expect(await screen.findByRole('alert')).toHaveTextContent('重置链接已失效');
    expect(screen.queryByLabelText('新密码')).not.toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('rejects mismatched confirmation and sends no password update', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'existing-user' } } }, error: null });
    render(<PasswordResetPage recovering/>);
    fireEvent.change(await screen.findByLabelText('新密码'), { target: { value: 'example-password-1' } });
    fireEvent.change(screen.getByLabelText('再次输入新密码'), { target: { value: 'example-password-2' } });
    fireEvent.click(screen.getByRole('button', { name: '保存新密码' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('两次输入的密码不一致');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('updates the current account only, clears the form, and requires a new login', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'existing-user' } } }, error: null });
    render(<PasswordResetPage recovering/>);
    fireEvent.change(await screen.findByLabelText('新密码'), { target: { value: 'example-password-1' } });
    fireEvent.change(screen.getByLabelText('再次输入新密码'), { target: { value: 'example-password-1' } });
    fireEvent.click(screen.getByRole('button', { name: '保存新密码' }));
    expect(await screen.findByRole('heading', { name: '新密码已保存' })).toBeVisible();
    expect(mocks.update).toHaveBeenCalledWith({ password: 'example-password-1' });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(screen.queryByLabelText('新密码')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回登录' })).toHaveAttribute('href', '/sweet-lucky-draw/#/admin');
  });
  it('preserves the form and shows a useful message when password policy rejects the update', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'existing-user' } } }, error: null });
    mocks.update.mockResolvedValue({ error: { code: 'weak_password' } });
    render(<PasswordResetPage recovering/>);
    fireEvent.change(await screen.findByLabelText('新密码'), { target: { value: 'example-password-1' } });
    fireEvent.change(screen.getByLabelText('再次输入新密码'), { target: { value: 'example-password-1' } });
    fireEvent.click(screen.getByRole('button', { name: '保存新密码' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('新密码未满足');
    await waitFor(() => expect(screen.getByRole('button', { name: '保存新密码' })).toBeEnabled());
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
