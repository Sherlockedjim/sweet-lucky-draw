import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ draw: vi.fn(), recover: vi.fn(), pending: '', remember: vi.fn(), forget: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ configured: true }));
vi.mock('../src/lib/api', () => ({ draw: mocks.draw, recover: mocks.recover, readPendingCode: () => mocks.pending, rememberCode: mocks.remember, forgetCode: mocks.forget }));
import DrawPage from '../src/pages/DrawPage';

const award = { id: 'f85d6a52-3211-4be8-a1cd-24a56057420a', prize: '奶茶', created_at: '2026-11-24T08:00:00Z' };
const choose = () => screen.getByRole('button', { name: '选择第 1 个幸运盲盒' });
async function enterCode(code = 'ABCD1234') {
  fireEvent.change(screen.getByLabelText(/你的专属邀请码/), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: /开启好运/ }));
}

beforeEach(() => { mocks.pending = ''; mocks.draw.mockReset(); mocks.recover.mockReset(); mocks.remember.mockReset(); mocks.forget.mockReset(); });

describe('draw user flow', () => {
  it('blocks boxes until an eight-character invitation is entered', async () => {
    render(<DrawPage/>);
    expect(choose()).toBeDisabled();
    await enterCode('ABCD!234');
    expect(screen.getByRole('alert')).toHaveTextContent('只能包含大写英文字母和数字');
    expect(mocks.draw).not.toHaveBeenCalled();
  });
  it('shows only the server award and submits once on rapid double clicks', async () => {
    let resolve!: (v: unknown) => void;
    mocks.draw.mockImplementation(() => new Promise(r => { resolve = r; }));
    render(<DrawPage/>); await enterCode();
    const button = choose();
    fireEvent.click(button); fireEvent.click(button);
    expect(mocks.draw).toHaveBeenCalledTimes(1);
    expect(mocks.draw).toHaveBeenCalledWith('ABCD1234');
    expect(mocks.remember).toHaveBeenCalledWith('ABCD1234');
    await act(async () => resolve(award));
    expect(await screen.findByRole('heading', { name: /恭喜你，抽中了奶茶/ })).toBeVisible();
    expect(screen.getByText(award.id)).toBeVisible();
    expect(screen.queryByRole('button', { name: '选择第 1 个幸运盲盒' })).not.toBeInTheDocument();
  });
  it('handles an incorrect invitation from the database', async () => {
    mocks.draw.mockRejectedValue({ message: 'INVALID_CODE' });
    render(<DrawPage/>); await enterCode(); fireEvent.click(choose());
    expect(await screen.findByRole('alert')).toHaveTextContent('邀请码暂时找不到');
    expect(choose()).toBeDisabled();
    expect(screen.getByLabelText(/你的专属邀请码/)).not.toBeDisabled();
  });
  it('handles reuse without drawing again and recovers the existing result', async () => {
    mocks.draw.mockRejectedValue({ message: 'CODE_USED' }); mocks.recover.mockResolvedValue(award);
    render(<DrawPage/>); await enterCode(); fireEvent.click(choose());
    expect(await screen.findByRole('alert')).toHaveTextContent('已经拆过盲盒');
    expect(choose()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /找回抽奖结果/ }));
    expect(await screen.findByRole('heading', { name: /恭喜你，抽中了奶茶/ })).toBeVisible();
    expect(mocks.draw).toHaveBeenCalledTimes(1);
  });
  it('recovers committed results after an ambiguous timeout before allowing more mutations', async () => {
    mocks.draw.mockRejectedValue(new Error('Failed to fetch')); mocks.recover.mockResolvedValue(award);
    render(<DrawPage/>); await enterCode(); fireEvent.click(choose());
    await screen.findByRole('alert');
    expect(choose()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /找回抽奖结果/ }));
    expect(await screen.findByRole('heading', { name: /恭喜你，抽中了奶茶/ })).toBeVisible();
    expect(mocks.draw).toHaveBeenCalledTimes(1);
  });
  it('refresh recovers the receipt from the server without redeeming again', async () => {
    mocks.pending = 'ABCD1234'; mocks.recover.mockResolvedValue(award);
    render(<DrawPage/>);
    expect(await screen.findByRole('heading', { name: /恭喜你，抽中了奶茶/ })).toBeVisible();
    expect(mocks.recover).toHaveBeenCalledWith('ABCD1234');
    expect(mocks.draw).not.toHaveBeenCalled();
  });
  it('keeps recovery available when refreshing offline', async () => {
    mocks.pending = 'ABCD1234'; mocks.recover.mockRejectedValue(new Error('Failed to fetch'));
    render(<DrawPage/>);
    expect(await screen.findByRole('alert')).toHaveTextContent('网络');
    await waitFor(() => expect(screen.getByRole('button', { name: /找回抽奖结果/ })).toBeEnabled());
    expect(mocks.draw).not.toHaveBeenCalled();
  });
});
