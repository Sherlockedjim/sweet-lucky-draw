export interface ParticipantProfile { nickname: string; avatar: string | null; }
export const emptyProfile = (): ParticipantProfile => ({ nickname: '', avatar: null });
export const PROFILE_STORAGE_KEY = 'sweet-receipt-profile-v1';
export const MAX_AVATAR_FILE_BYTES = 8 * 1024 * 1024;
const MAX_AVATAR_DATA_LENGTH = 120000;

export function normalizeNickname(value: string, trim = true): string {
  const bounded = Array.from(value.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f]/g, '')).slice(0, 256).join('');
  const clean = trim ? bounded.trim() : bounded;
  if (typeof Intl.Segmenter === 'function') return [...new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(clean)].slice(0, 24).map(v => v.segment).join('');
  return Array.from(clean).slice(0, 24).join('');
}

export function safeProfile(value: unknown): ParticipantProfile {
  if (!value || typeof value !== 'object') return emptyProfile();
  const input = value as Record<string, unknown>;
  return {
    nickname: typeof input.nickname === 'string' ? normalizeNickname(input.nickname) : '',
    avatar: typeof input.avatar === 'string' && input.avatar.length <= MAX_AVATAR_DATA_LENGTH && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.avatar) ? input.avatar : null,
  };
}

export const hasProfile = (profile: ParticipantProfile) => !!(profile.nickname || profile.avatar);

export function isCompleteProfile(profile: ParticipantProfile): boolean {
  const clean = safeProfile(profile);
  return !!(clean.nickname && clean.avatar);
}

export function saveReceiptProfile(receiptId: string, profile: ParticipantProfile): boolean {
  try {
    const clean = safeProfile(profile);
    if (hasProfile(clean)) localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ version: 1, receiptId, profile: clean }));
    else localStorage.removeItem(PROFILE_STORAGE_KEY);
    return true;
  } catch { return false; }
}

export function readReceiptProfile(receiptId: string): ParticipantProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw || raw.length > MAX_AVATAR_DATA_LENGTH + 2000) return null;
    const saved = JSON.parse(raw);
    if (saved?.version !== 1 || saved.receiptId !== receiptId) return null;
    const clean = safeProfile(saved.profile);
    return hasProfile(clean) ? clean : null;
  } catch { return null; }
}

export function clearReceiptProfile() {
  try { localStorage.removeItem(PROFILE_STORAGE_KEY); } catch { /* Private browsing may disable storage. */ }
}

export function imageMime(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if ([137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n)) return 'image/png';
  if (String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return 'image/webp';
  return null;
}

function readBlob(blob: Blob, dataUrl: boolean): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const timer = setTimeout(() => reader.abort(), 10000);
    reader.onload = () => { clearTimeout(timer); reader.result === null ? reject(new Error('图片读取失败，请重新选择。')) : resolve(reader.result); };
    reader.onerror = reader.onabort = () => { clearTimeout(timer); reject(new Error('图片读取失败，请重新选择。')); };
    if (dataUrl) reader.readAsDataURL(blob); else reader.readAsArrayBuffer(blob);
  });
}

export async function prepareAvatar(file: File): Promise<string> {
  if (!file.size || file.size > MAX_AVATAR_FILE_BYTES) throw new Error('请选择不超过 8MB 的图片。');
  if (file.type && !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('头像支持 JPG、PNG、WebP 图片。');
  const mime = imageMime(new Uint8Array(await readBlob(file.slice(0,12), false) as ArrayBuffer));
  if (!mime || file.type && file.type !== mime) throw new Error('图片格式无法识别，请选择 JPG、PNG 或 WebP。');
  const source = await readBlob(new Blob([file], { type: mime }), true) as string;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('图片处理超时，请换一张较小的图片。')), 12000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('图片无法打开，请重新选择。')); };
    img.src = source;
  });
  const width = image.naturalWidth, height = image.naturalHeight;
  if (!width || !height || width * height > 40000000) throw new Error('图片尺寸过大，请先缩小图片。');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器暂时无法处理头像。');
  context.fillStyle = '#fffbef'; context.fillRect(0,0,256,256);
  const side = Math.min(width,height);
  context.drawImage(image,(width-side)/2,(height-side)/2,side,side,0,0,256,256);
  const avatar = canvas.toDataURL('image/jpeg',0.82);
  if (!safeProfile({ avatar }).avatar) throw new Error('头像处理失败，请换一张图片。');
  return avatar;
}
