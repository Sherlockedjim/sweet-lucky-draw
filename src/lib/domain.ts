export const PRIZES = ['蛋糕', '奶茶', '小吃'] as const;
export const HAPPY_MESSAGE = '送你一天的开心～' as const;
export type Prize = typeof PRIZES[number] | typeof HAPPY_MESSAGE;
export const BOX_CONTENTS: readonly Prize[] = [...PRIZES, HAPPY_MESSAGE, HAPPY_MESSAGE, HAPPY_MESSAGE];
export const CODE_PATTERN = /^[A-Z0-9]{8}$/;
export const validCode = (code: string) => CODE_PATTERN.test(code);
export const normalizeCode = (code: string) => code.trim().toUpperCase();

export function randomInt(max: number): number {
  if (!Number.isSafeInteger(max) || max < 1 || max > 0x100000000) throw new Error('Invalid range');
  const value = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return value[0] % max;
}

export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// The chosen box always receives the database award. Other positions are decorative.
export function revealOrder(prize: Prize, selected: number): Prize[] {
  if (!Number.isInteger(selected) || selected < 0 || selected >= BOX_CONTENTS.length) throw new Error('INVALID_SELECTION');
  const remaining = [...BOX_CONTENTS];
  const match = remaining.indexOf(prize);
  if (match < 0) throw new Error('INVALID_SERVER_RESULT');
  // Remove exactly one occurrence: a happy result still leaves two other happy boxes.
  remaining.splice(match, 1);
  const rest = shuffle(remaining);
  rest.splice(selected, 0, prize);
  return rest;
}

export interface DrawResult { id: string; prize: Prize; created_at: string; }
export interface Invite { id: string; code: string; created_at: string; used_at: string | null; is_used: boolean; }
export interface DrawRecord extends DrawResult { code: string; }

export function parseDraw(value: unknown): DrawResult {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || typeof raw !== 'object') throw new Error('INVALID_SERVER_RESULT');
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !BOX_CONTENTS.includes(r.prize as Prize) || typeof r.created_at !== 'string' || Number.isNaN(Date.parse(r.created_at))) {
    throw new Error('INVALID_SERVER_RESULT');
  }
  return { id: r.id, prize: r.prize as Prize, created_at: r.created_at };
}

export function formatTime(date: string | null): string {
  if (!date || Number.isNaN(Date.parse(date))) return '—';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai', hour12: false }).format(new Date(date));
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const cell = (value: unknown) => {
    let str = String(value ?? '');
    // Neutralize spreadsheet formulas, including whitespace-prefixed expressions.
    if (/^[\s]*[=+\-@]/.test(str)) str = "'" + str;
    return '"' + str.replaceAll('"', '""') + '"';
  };
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
}

export function downloadCsv(name: string, headers: string[], rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? '');
  if (/INVALID_CODE|CODE_NOT_FOUND/i.test(message)) return '这个邀请码暂时找不到，请核对后再试一次。';
  if (/CODE_USED/i.test(message)) return '这个邀请码已经拆过盲盒了，每个邀请码只能使用一次。';
  if (/NOT_ADMIN|permission denied|42501/i.test(message)) return '当前账号没有管理员权限，请联系活动管理员。';
  if (/Invalid login credentials|invalid_credentials/i.test(message)) return '邮箱或密码不正确，请核对后重试。';
  if (/RATE_LIMIT|too many requests/i.test(message)) return '操作有些频繁，请稍等片刻再试。';
  if (/COUNT_OUT_OF_RANGE/i.test(message)) return '生成数量需要是 1 到 500 之间的整数。';
  if (/Failed to fetch|NetworkError|network|timeout|AbortError/i.test(message)) return '网络暂时没有回应，请检查网络后重试。';
  if (/CONFIG_MISSING/i.test(message)) return '活动正在准备中，请稍后再来。';
  if (/PGRST202|function.*not.*find|does not exist/i.test(message)) return '活动服务还未准备好，请联系管理员。';
  if (/INVALID_SERVER_RESULT/i.test(message)) return '结果还未确认，请点击“找回抽奖结果”，不要重复拆盒。';
  return '暂时没能完成操作，请稍后重试。';
}
