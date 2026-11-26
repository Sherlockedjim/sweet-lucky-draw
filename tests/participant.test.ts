import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearReceiptProfile, imageMime, isCompleteProfile, MAX_AVATAR_FILE_BYTES, normalizeNickname, prepareAvatar, PROFILE_STORAGE_KEY, readReceiptProfile, safeProfile, saveReceiptProfile } from '../src/lib/participant';

const avatar='data:image/jpeg;base64,/9j/2Q==';
beforeEach(()=>localStorage.clear());

describe('participant data',()=>{
  it('requires a nonempty normalized nickname and a valid local avatar together',()=>{
    expect(isCompleteProfile({nickname:' 云朵 ',avatar})).toBe(true);
    for (const profile of [
      {nickname:'',avatar:null}, {nickname:'云朵',avatar:null}, {nickname:'',avatar},
      {nickname:' \n\t ',avatar}, {nickname:'云朵',avatar:'https://example.test/avatar.jpg'},
    ]) expect(isCompleteProfile(profile)).toBe(false);
  });
  it('normalizes nickname controls and limits graphemes without splitting family emoji',()=>{
    expect(normalizeNickname('  云朵\n同学  ')).toBe('云朵同学');
    expect(normalizeNickname('Alex ',false)).toBe('Alex ');
    expect(normalizeNickname('👨‍👩‍👧‍👦'.repeat(25))).toBe('👨‍👩‍👧‍👦'.repeat(24));
  });
  it('allows compressed local JPEGs and rejects external or SVG avatar sources',()=>{
    expect(safeProfile({nickname:' 小甜 ',avatar})).toEqual({nickname:'小甜',avatar});
    for(const source of ['https://example.test/photo.jpg','javascript:alert(1)','data:image/svg+xml;base64,PHN2Zz4=','data:image/jpeg;base64,'+'A'.repeat(130000)]) {
      expect(safeProfile({nickname:'小甜',avatar:source}).avatar).toBeNull();
    }
  });
  it('restores only the profile belonging to the exact saved receipt',()=>{
    expect(saveReceiptProfile('receipt-one',{nickname:'云朵',avatar})).toBe(true);
    expect(readReceiptProfile('receipt-one')).toEqual({nickname:'云朵',avatar});
    expect(readReceiptProfile('receipt-two')).toBeNull();
  });
  it('clears saved personal data when both fields are removed',()=>{
    saveReceiptProfile('receipt-one',{nickname:'云朵',avatar});
    saveReceiptProfile('receipt-one',{nickname:'',avatar:null});
    expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBeNull();
    saveReceiptProfile('receipt-one',{nickname:'云朵',avatar});
    clearReceiptProfile();
    expect(readReceiptProfile('receipt-one')).toBeNull();
  });
  it('ignores corrupted storage and tolerates storage failures',()=>{
    localStorage.setItem(PROFILE_STORAGE_KEY,'{broken');
    expect(readReceiptProfile('receipt-one')).toBeNull();
    const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
    expect(saveReceiptProfile('receipt-one',{nickname:'云朵',avatar})).toBe(false);
    spy.mockRestore();
  });
});

describe('avatar input checks',()=>{
  it('recognizes raster signatures without trusting the filename',()=>{
    expect(imageMime(new Uint8Array([255,216,255]))).toBe('image/jpeg');
    expect(imageMime(new Uint8Array([137,80,78,71,13,10,26,10]))).toBe('image/png');
    expect(imageMime(new TextEncoder().encode('RIFF0000WEBP'))).toBe('image/webp');
    expect(imageMime(new TextEncoder().encode('<svg></svg>'))).toBeNull();
  });
  it('rejects oversized images and unsupported types before decoding',async()=>{
    await expect(prepareAvatar(new File([new Uint8Array(MAX_AVATAR_FILE_BYTES+1)],'large.jpg',{type:'image/jpeg'}))).rejects.toThrow('8MB');
    await expect(prepareAvatar(new File(['<svg/>'],'avatar.svg',{type:'image/svg+xml'}))).rejects.toThrow('JPG');
  });
  it('rejects a file whose raster contents do not match the declared image',async()=>{
    await expect(prepareAvatar(new File(['<svg/>'],'fake.png',{type:'image/png'}))).rejects.toThrow('图片格式无法识别');
    await expect(prepareAvatar(new File([new Uint8Array([255,216,255])],'fake.png',{type:'image/png'}))).rejects.toThrow('图片格式无法识别');
  });
});
