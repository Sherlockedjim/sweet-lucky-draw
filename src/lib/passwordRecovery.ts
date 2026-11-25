// Recovery returns to the existing Pages entry point so refreshing never needs a server route.
export function recoveryRedirect(href: string): string {
  const url = new URL(href);
  url.search = '?recovery=1';
  url.hash = '';
  return url.href;
}

export function isRecoveryReturn(url: URL): boolean {
  return url.searchParams.get('recovery') === '1' || new URLSearchParams(url.hash.slice(1)).get('type') === 'recovery';
}

export function acceptsRecoveryCallback(url: URL, params: Record<string, string>): boolean {
  return (url.searchParams.get('recovery') === '1' || params.type === 'recovery') &&
    Boolean(params.access_token || params.error || params.error_description || params.error_code);
}

export function recoveryError(error: unknown): string {
  const value = error as { code?: string; message?: string };
  const message = `${value?.code || ''} ${value?.message || ''}`;
  if (/rate_limit|too many|after.*seconds/i.test(message)) return '邮件请求有些频繁，请稍后再试，并检查是否已收到上一封邮件。';
  if (/email_address_not_authorized|not authorized|email.*not.*allowed/i.test(message)) return '项目暂不能向此邮箱发送邮件，请联系项目所有者检查 Supabase 邮件配置。';
  if (/weak_password|password.*(least|contain|short|weak)/i.test(message)) return '新密码未满足账号的密码要求，请使用更长的密码，并包含字母、数字和符号。';
  if (/same_password|different.*password/i.test(message)) return '新密码需要与原密码不同。';
  if (/fetch|network|timeout|abort/i.test(message)) return '网络暂时没有回应，请检查网络后重试。';
  return '暂时无法完成操作，请稍后重试；重置链接失效时请重新申请邮件。';
}
