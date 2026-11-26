import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ draw: vi.fn(), recover: vi.fn(), pending: '', remember: vi.fn(), forget: vi.fn(), prepareAvatar: vi.fn(), saveProfile: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ configured: true }));
vi.mock('../src/lib/api', () => ({ draw: mocks.draw, recover: mocks.recover, saveDrawProfile: mocks.saveProfile, readPendingCode: () => mocks.pending, rememberCode: mocks.remember, forgetCode: mocks.forget }));
vi.mock('../src/lib/participant', async importOriginal => ({ ...await importOriginal<typeof import('../src/lib/participant')>(), prepareAvatar: mocks.prepareAvatar }));
import DrawPage from '../src/pages/DrawPage';
import { HAPPY_MESSAGE } from '../src/lib/domain';
import { PROFILE_STORAGE_KEY, saveReceiptProfile } from '../src/lib/participant';

const avatar = 'data:image/jpeg;base64,/9j/2Q==';
const legacyAward = { id: 'f85d6a52-3211-4be8-a1cd-24a56057420a', prize: '奶茶', created_at: '2026-11-24T08:00:00Z' };
const award = { ...legacyAward, participant: { nickname: '云朵同学', avatar } };
const choose = () => screen.getByRole('button', { name: '选择第 1 个幸运盲盒' });
async function uploadAvatar() {
  fireEvent.change(screen.getByLabelText('头像图片文件'), { target: { files: [new File(['photo'], 'avatar.jpg', { type: 'image/jpeg' })] } });
  await waitFor(() => expect(screen.getByRole('button', { name: '更换头像' })).toBeEnabled());
}
async function enterCode(code = 'ABCD1234') {
  const nickname = screen.getByLabelText('昵称') as HTMLInputElement;
  if (!nickname.value) fireEvent.change(nickname, { target: { value: '云朵同学' } });
  await uploadAvatar();
  fireEvent.change(screen.getByLabelText(/你的专属邀请码/), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: /开启好运/ }));
}

beforeEach(() => { localStorage.clear(); mocks.pending = ''; mocks.draw.mockReset(); mocks.recover.mockReset(); mocks.saveProfile.mockReset(); mocks.remember.mockReset(); mocks.forget.mockReset(); mocks.prepareAvatar.mockReset().mockResolvedValue(avatar); });

describe('draw user flow', () => {
  it('requires both nickname and avatar before accepting an invitation, including direct form submission', () => {
    render(<DrawPage/>);
    const input = screen.getByLabelText(/你的专属邀请码/);
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: /开启好运/ })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'ABCD1234' } });
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByRole('alert')).toHaveTextContent('请先填写昵称并上传头像');
    expect(choose()).toBeDisabled();
    expect(mocks.draw).not.toHaveBeenCalled();
  });
  it('keeps the invitation locked when only a nickname is filled', () => {
    render(<DrawPage/>);
    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '云朵同学' } });
    expect(screen.getByLabelText(/你的专属邀请码/)).toBeDisabled();
    expect(screen.getByRole('button', { name: /开启好运/ })).toBeDisabled();
    expect(choose()).toBeDisabled();
  });
  it('keeps the invitation locked when only an avatar is selected', async () => {
    render(<DrawPage/>); await uploadAvatar();
    expect(screen.getByLabelText(/你的专属邀请码/)).toBeDisabled();
    expect(screen.getByRole('button', { name: /开启好运/ })).toBeDisabled();
    expect(choose()).toBeDisabled();
  });
  it('locks the boxes again when required details are cleared after unlocking an invitation', async () => {
    render(<DrawPage/>); await enterCode();
    expect(choose()).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '清除资料' }));
    expect(screen.getByLabelText(/你的专属邀请码/)).toHaveValue('ABCD1234');
    expect(screen.getByLabelText(/你的专属邀请码/)).toBeDisabled();
    expect(choose()).toBeDisabled();
    expect(screen.getByRole('button', { name: /帮我挑一个/ })).toBeDisabled();
    fireEvent.click(choose());
    fireEvent.submit(screen.getByLabelText(/你的专属邀请码/).closest('form')!);
    expect(mocks.draw).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '云朵同学' } });
    await uploadAvatar();
    expect(choose()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /开启好运/ }));
    expect(choose()).toBeEnabled();
  });
  it('treats a whitespace-only nickname as missing even after the boxes were unlocked', async () => {
    render(<DrawPage/>); await enterCode();
    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '   ' } });
    expect(choose()).toBeDisabled();
    expect(screen.getByRole('button', { name: /开启好运/ })).toBeDisabled();
    expect(mocks.draw).not.toHaveBeenCalled();
  });
  it('blocks drawing while a replacement avatar is being processed', async () => {
    render(<DrawPage/>); await enterCode();
    let finish!: (value: string) => void;
    mocks.prepareAvatar.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
    fireEvent.change(screen.getByLabelText('头像图片文件'), { target: { files: [new File(['photo'], 'next.jpg', { type: 'image/jpeg' })] } });
    expect(choose()).toBeDisabled();
    expect(screen.getByRole('button', { name: /帮我挑一个/ })).toBeDisabled();
    fireEvent.click(choose());
    expect(mocks.draw).not.toHaveBeenCalled();
    await act(async () => finish(avatar));
    expect(choose()).toBeEnabled();
  });
  it('blocks boxes until an eight-character invitation is entered', async () => {
    render(<DrawPage/>);
    expect(choose()).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /^选择第 [1-6] 个幸运盲盒$/ })).toHaveLength(6);
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
    expect(mocks.draw).toHaveBeenCalledWith('ABCD1234', award.participant);
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
  it('opens the sixth box and reveals exactly three happy wishes without a redemption promise', async () => {
    mocks.draw.mockResolvedValue({ ...award, prize: HAPPY_MESSAGE });
    render(<DrawPage/>); await enterCode();
    fireEvent.click(screen.getByRole('button', { name:'选择第 6 个幸运盲盒' }));
    expect(await screen.findByRole('heading', { name:HAPPY_MESSAGE })).toBeVisible();
    const row = screen.getByLabelText('本次盲盒揭晓');
    expect(row.children).toHaveLength(6);
    expect([...row.children].filter(el=>el.textContent?.includes(HAPPY_MESSAGE))).toHaveLength(3);
    expect(row.children[5]).toHaveClass('chosen');
    expect(screen.queryByText('请保留这份记录，并联系活动管理员兑换奖品。')).not.toBeInTheDocument();
    expect(screen.getByText(/没有实物奖品的开心礼盒/)).toBeVisible();
    expect(mocks.draw).toHaveBeenCalledTimes(1);
  });
  it('restores a saved happy wish on refresh without another draw', async () => {
    mocks.pending='ABCD1234'; mocks.recover.mockResolvedValue({ ...award, prize:HAPPY_MESSAGE });
    render(<DrawPage/>);
    expect(await screen.findByRole('heading', { name:HAPPY_MESSAGE })).toBeVisible();
    expect(screen.getByLabelText('本次盲盒揭晓').children).toHaveLength(6);
    expect(mocks.draw).not.toHaveBeenCalled();
  });
  it('shows the required nickname and avatar on the result and sends the complete profile with the code',async()=>{
    mocks.draw.mockResolvedValue(award);
    render(<DrawPage/>);
    fireEvent.change(screen.getByLabelText('昵称'),{target:{value:'云朵同学'}});
    await enterCode(); fireEvent.click(choose());
    expect(await screen.findByRole('group',{name:'结果页个人资料'})).toHaveTextContent('云朵同学');
    expect(within(screen.getByRole('group',{name:'结果页个人资料'})).getByAltText('云朵同学的头像')).toHaveAttribute('src',avatar);
    expect(mocks.draw).toHaveBeenCalledWith('ABCD1234', award.participant);
    expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBeNull();
    expect(screen.getByText('昵称与头像已随中奖记录保存。')).toBeVisible();
  });
  it('offers the matching old browser profile for explicit historical backfill',async()=>{
    const avatar='data:image/jpeg;base64,/9j/2Q==';
    saveReceiptProfile(award.id,{nickname:'云朵同学',avatar});
    mocks.pending='ABCD1234';mocks.recover.mockResolvedValue(legacyAward);
    render(<DrawPage/>);
    expect(await screen.findByRole('group',{name:'结果页个人资料'})).toHaveTextContent('云朵同学');
    expect(within(screen.getByRole('group',{name:'结果页个人资料'})).getByAltText('云朵同学的头像')).toHaveAttribute('src',avatar);
    expect(mocks.draw).not.toHaveBeenCalled();
  });
  it('does not attach another receipts personal details to a recovered result',async()=>{
    saveReceiptProfile('other-receipt',{nickname:'其他参与者',avatar:null});
    mocks.pending='ABCD1234';mocks.recover.mockResolvedValue(legacyAward);
    render(<DrawPage/>);
    await screen.findByText(award.id);
    expect(screen.queryByRole('group',{name:'结果页个人资料'})).not.toBeInTheDocument();
  });
  it('keeps a successful draw visible if personal-data storage is unavailable',async()=>{
    mocks.draw.mockResolvedValue(award);
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
    render(<DrawPage/>);
    fireEvent.change(screen.getByLabelText('昵称'),{target:{value:'云朵同学'}});
    await enterCode();fireEvent.click(choose());
    expect(await screen.findByRole('heading',{name:/恭喜你，抽中了奶茶/})).toBeVisible();
    expect(screen.getByText('昵称与头像已随中奖记录保存。')).toBeVisible();
    expect(mocks.draw).toHaveBeenCalledTimes(1);
  });
  it('restores server profile on another browser without trusting older local details',async()=>{
    saveReceiptProfile(award.id,{nickname:'本地旧名字',avatar});
    mocks.pending='ABCD1234'; mocks.recover.mockResolvedValue(award);
    render(<DrawPage/>);
    expect(await screen.findByRole('group',{name:'结果页个人资料'})).toHaveTextContent('云朵同学');
    expect(screen.queryByText('本地旧名字')).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'清除资料'})).not.toBeInTheDocument();
    expect(mocks.draw).not.toHaveBeenCalled();
  });
  it('saves a historical profile only after explicit submission without another draw',async()=>{
    mocks.pending='ABCD1234'; mocks.recover.mockResolvedValue(legacyAward); mocks.saveProfile.mockResolvedValue(award);
    render(<DrawPage/>);
    const save=await screen.findByRole('button',{name:'补充到中奖记录'});
    expect(save).toBeDisabled(); expect(mocks.saveProfile).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('昵称'),{target:{value:'云朵同学'}}); await uploadAvatar();
    fireEvent.click(save);
    expect(await screen.findByText('昵称与头像已随中奖记录保存。')).toBeVisible();
    expect(mocks.saveProfile).toHaveBeenCalledWith('ABCD1234',award.participant);
    expect(screen.getByText(award.id)).toBeVisible();
    expect(mocks.draw).not.toHaveBeenCalled();
  });
  it('keeps the old result and retry form if profile backfill is not confirmed',async()=>{
    mocks.pending='ABCD1234'; mocks.recover.mockResolvedValue(legacyAward); mocks.saveProfile.mockRejectedValue(new Error('Failed to fetch'));
    render(<DrawPage/>); await screen.findByText(award.id);
    fireEvent.change(screen.getByLabelText('昵称'),{target:{value:'云朵同学'}}); await uploadAvatar();
    fireEvent.click(screen.getByRole('button',{name:'补充到中奖记录'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('网络');
    expect(screen.getByText(award.id)).toBeVisible();
    expect(screen.getByRole('button',{name:'补充到中奖记录'})).toBeEnabled();
    expect(mocks.draw).not.toHaveBeenCalled();
  });

});
