import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks=vi.hoisted(()=>({prepare:vi.fn()}));
vi.mock('../src/lib/participant',async()=>({...await vi.importActual<typeof import('../src/lib/participant')>('../src/lib/participant'),prepareAvatar:mocks.prepare}));
import { ParticipantEditor, RecipientBadge } from '../src/components/ParticipantProfile';
import { emptyProfile, type ParticipantProfile } from '../src/lib/participant';

const avatar='data:image/jpeg;base64,/9j/2Q==';
function Editor({initial=emptyProfile()}:{initial?:ParticipantProfile}) {
  const [value,setValue]=useState(initial);
  return <><ParticipantEditor value={value} onChange={setValue} onBusyChange={()=>{}}/><RecipientBadge profile={value}/></>;
}
beforeEach(()=>{mocks.prepare.mockReset();});
describe('participant editor',()=>{
  it('is optional and renders nickname as escaped text',()=>{
    render(<Editor/>);
    expect(screen.queryByRole('group',{name:'结果页个人资料'})).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('昵称'),{target:{value:'<script>小甜</script>'}});
    const badge=screen.getByRole('group',{name:'结果页个人资料'});
    expect(badge).toHaveTextContent('<script>小甜</script>');
    expect(badge.querySelector('script')).toBeNull();
  });
  it('displays a processed avatar and permits clearing both fields',async()=>{
    mocks.prepare.mockResolvedValue(avatar);
    render(<Editor initial={{nickname:'云朵',avatar:null}}/>);
    fireEvent.change(screen.getByLabelText('头像图片文件'),{target:{files:[new File(['photo'],'avatar.jpg',{type:'image/jpeg'})]}});
    expect((await screen.findAllByAltText('云朵的头像'))[0]).toHaveAttribute('src',avatar);
    fireEvent.click(screen.getByRole('button',{name:'清除资料'}));
    expect(screen.getByLabelText('昵称')).toHaveValue('');
    expect(screen.queryByRole('group',{name:'结果页个人资料'})).not.toBeInTheDocument();
  });
  it('keeps the previous avatar when a new image fails',async()=>{
    mocks.prepare.mockRejectedValue(new Error('图片无法打开，请重新选择。'));
    render(<Editor initial={{nickname:'云朵',avatar}}/>);
    fireEvent.change(screen.getByLabelText('头像图片文件'),{target:{files:[new File(['bad'],'bad.jpg',{type:'image/jpeg'})]}});
    expect(await screen.findByRole('alert')).toHaveTextContent('图片无法打开');
    expect(screen.getAllByAltText('云朵的头像')[0]).toHaveAttribute('src',avatar);
  });
  it('ignores a late image result after the user clears the profile',async()=>{
    let resolve!:(value:string)=>void;
    mocks.prepare.mockImplementation(()=>new Promise(r=>{resolve=r;}));
    render(<Editor initial={{nickname:'云朵',avatar:null}}/>);
    fireEvent.change(screen.getByLabelText('头像图片文件'),{target:{files:[new File(['photo'],'avatar.jpg',{type:'image/jpeg'})]}});
    expect(screen.getByLabelText('昵称')).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'清除资料'}));
    await act(async()=>resolve(avatar));
    expect(screen.getByLabelText('昵称')).toHaveValue('');
    expect(screen.queryByAltText('我的头像')).not.toBeInTheDocument();
    expect(screen.queryByRole('group',{name:'结果页个人资料'})).not.toBeInTheDocument();
  });
});
