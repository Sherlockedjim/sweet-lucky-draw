import { describe, expect, it } from 'vitest';
import { BOX_CONTENTS, HAPPY_MESSAGE, friendlyError, normalizeCode, parseDraw, PRIZES, randomInt, revealOrder, shuffle, toCsv, validCode } from '../src/lib/domain';
import { isPublicKey } from '../src/lib/supabase';

describe('invitation validation', () => {
  it.each(['ABCD1234', '00000000', 'ZZZZZZZZ'])('accepts %s', code => expect(validCode(code)).toBe(true));
  it.each(['ABC1234', 'ABCDE1234', 'abcd1234', 'ABCD 123', 'ABCDEFG!', 'ＡＢＣＤ１２３４', 'ABCDEFG\n', 'ABC\t1234'])('rejects %s', code => expect(validCode(code)).toBe(false));
  it('normalizes pasted input without removing invalid inner characters', () => {
    expect(normalizeCode(' abcd1234 ')).toBe('ABCD1234');
    expect(validCode(normalizeCode('abcd-123'))).toBe(false);
  });
});

describe('server authoritative rewards', () => {
  it('reveals each possible database prize at any selected position', () => {
    for (const prize of [...PRIZES, HAPPY_MESSAGE]) for (let index = 0; index < 6; index++) {
      const order = revealOrder(prize, index);
      expect(order[index]).toBe(prize);
      expect(order).toHaveLength(6);
      expect([...order].sort()).toEqual([...BOX_CONTENTS].sort());
      expect(order.filter(p => p === HAPPY_MESSAGE)).toHaveLength(3);
    }
  });
  it('rejects malformed or fabricated server awards', () => {
    for (const data of [null, {}, { id: '1', prize: '电脑', created_at: '2026-11-24' }, { id: '1', prize: '蛋糕', created_at: 'invalid' }]) expect(() => parseDraw(data)).toThrow('INVALID_SERVER_RESULT');
  });
  it('accepts the required database response contract', () => {
    const record = { id: 'uuid', prize: '蛋糕', created_at: '2026-11-24T08:00:00Z' };
    expect(parseDraw(record)).toEqual(record);
    expect(parseDraw({ ...record, prize: HAPPY_MESSAGE }).prize).toBe(HAPPY_MESSAGE);
  });
  it('accepts a saved participant but rejects incomplete and external-avatar receipts',()=>{
    const record={id:'uuid',prize:'奶茶',created_at:'2026-11-26T06:00:00Z'};
    const participant={nickname:'云朵',avatar:'data:image/jpeg;base64,/9j/2Q=='};
    expect(parseDraw({...record,participant})).toEqual({...record,participant});
    for(const p of [{nickname:'云朵',avatar:null},{nickname:'',avatar:participant.avatar},{nickname:'云朵',avatar:'https://example.test/avatar.jpg'}]) expect(()=>parseDraw({...record,participant:p})).toThrow('INVALID_SERVER_RESULT');
    expect(parseDraw({...record,participant:null})).toEqual(record);
  });
  it('rejects selections outside the six available boxes', () => {
    for (const selected of [-1, 6, 1.5]) expect(() => revealOrder('奶茶', selected)).toThrow('INVALID_SELECTION');
  });
  it('shuffles without mutating the prize pool', () => {
    const prizes = [...PRIZES];
    expect(shuffle(prizes).sort()).toEqual([...PRIZES].sort());
    expect(prizes).toEqual(PRIZES);
  });
  it('bounds random indexes and rejects unsupported ranges', () => {
    for (let i = 0; i < 50; i++) expect([0, 1, 2]).toContain(randomInt(3));
    expect(() => randomInt(0)).toThrow();
  });
});

describe('safe exports and client credentials', () => {
  it('escapes CSV and neutralizes spreadsheet formula payloads', () => {
    const csv = toCsv(['code', 'prize'], [['ABC12345', 'a,"b"'], ['=WEBSERVICE("bad")', '\t@SUM(1)']]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"a,""b"""');
    expect(csv).toContain('"\'=WEBSERVICE(');
    expect(csv).toContain('"\'\t@SUM(1)"');
  });
  it('accepts only publishable/anon credentials', () => {
    expect(isPublicKey('sb_publishable_example')).toBe(true);
    expect(isPublicKey('sb_secret_example')).toBe(false);
    const jwt = (role: string) => `e30.${btoa(JSON.stringify({ role }))}.signature`;
    expect(isPublicKey(jwt('anon'))).toBe(true);
    expect(isPublicKey(jwt('service_role'))).toBe(false);
    expect(isPublicKey('not-a-key')).toBe(false);
  });
  it('does not show raw database errors to visitors', () => {
    expect(friendlyError(new Error('private schema table admin_users failed'))).not.toContain('admin_users');
    expect(friendlyError({ message: 'CODE_USED' })).toContain('只能使用一次');
  });
});
