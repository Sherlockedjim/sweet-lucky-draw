# 安全设计与实际审计

现有项目为 SYSU university / sweet-lucky-draw（turzcmepfvzwxiraopbd）。2026-11-24 通过官方 CLI 完成只读审计，基线为 1 位管理员、0 个邀请码、0 条中奖记录。原始审计输出保存在被 Git 忽略的本机目录，不随前端或源码包发布。

## 现有保护

三张表已启用 RLS，anon/authenticated 没有直接表级或列级授权；管理员 RPC 在数据库核对 auth.uid() 与 admin_users。抽奖使用行锁和同一事务，draw_records.invite_id 有唯一约束。所有四个 RPC 的所有者均为 postgres，search_path 固定为空，PUBLIC 执行权已经撤销。

邀请码只存 code_hash（SHA-256）和 code_suffix，不存完整明文。内部奖品值为 cake / milk_tea / snack；中奖时间列为 drawn_at。不会按早期未审计假设重新创建或转换成明文表。

## 已应用的兼容变更

迁移文件是 supabase/migrations/20261124094234_secure_existing_hashed_invites.sql，完整影响说明见 DATABASE-REVIEW.md。首次执行曾被自动审批审查拒绝；用户于 2026-11-25 明确批准后，迁移已应用并读回验证。原管理员及既有行数保留。

- 原表、数据、Auth 用户及管理员成员全部保留。
- 原有四个 RPC 移至非公开 sweet_legacy schema，保留定义；同名新接口统一返回前端所需 JSONB。
- 保留哈希存储；完整邀请码仅从生成调用返回一次。历史列表只返回末 4 位，不返回哈希。
- 增加只读 get_draw_result：持有完整已使用邀请码的人可以找回对应奖品、时间和编号，不返回身份或其他邀请码。
- 核销与中奖记录写入仍在一笔事务中；任意写入失败整笔回滚，唯一约束提供额外保护。
- 使用密码学随机 UUID 的随机位生成 8 位 base32 邀请码；奖品用拒绝采样精确等概率选取。客户端不能决定奖品。
- 管理员每次调用都校验 auth.uid()，普通 Auth 用户不会因登录而自动成为管理员。
- 显式控制函数 EXECUTE 和表/列权限，保留 RLS，固定 search_path 并完整限定数据库对象名称。

## 凭据与发布

前端只连接 Publishable/anon key。构建校验拒绝 secret key 或 role 为 service_role 的 JWT，源码扫描检查密钥和数据库连接密码。GitHub Actions 仅构建并上传 dist，环境文件、SQL、测试 fixture、CLI 凭据和缓存不在前端发布内容中。

Supabase CLI 与 GitHub CLI 用于部署的凭据保存在本机安全配置/密钥存储中，没有写入前端或仓库。管理员密码不读取、不记录；登录由 Supabase Auth 校验，访问令牌保存在标签页 sessionStorage（禁止存储时仅在内存）。

浏览器只缓存用于刷新找回结果的邀请码，不把缓存奖品当作服务器记录。CSV 转义并防止公式注入，React 以文本方式渲染用户输入。

## 官方检查结果的解释

安全检查对可执行的 SECURITY DEFINER 函数提示人工审查。抽奖与结果找回是有意向持有邀请码的参与者开放的接口；管理员入口在数据库逐次验证名单。不能仅为消除提示改为 SECURITY INVOKER，因为浏览器没有直接表权限。

原项目的 rls_auto_enable 是 Supabase 的事件触发器函数，本次没有修改其行为。另有未开启泄露密码保护的 Auth 提示，该设置保留。密码找回仅更新正式站点与精确回调网址；密码由账号所有者本人重置，代理未读取或代填密码，原账号及管理员权限保留。

2026-11-26 六礼盒变更只增加私有槽位映射与 `happy` 结果，不扩大公共 API 权限。检查仍提示人工审查公开 SECURITY DEFINER RPC，以及表开启 RLS 但无直接访问策略（本项目使用禁止直接表访问、由 RPC 提供受控入口的设计）。参考：[公开函数执行提示](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)、[RLS 无策略提示](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)、[泄露密码保护](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)。

选填昵称与头像只用于本机展示，不新增数据库字段、Storage 桶或上传接口，也不改变 RPC 参数。图片同时检查大小、MIME 和文件签名；仅支持 JPEG/PNG/WebP，重新绘制为 256×256 JPEG 后才保存。缓存只接受有长度上限的 JPEG data URL，昵称通过 React 文本渲染。读取时必须匹配服务器返回的回执编号，避免将另一份回执的资料混入。存储失败只提示个人资料未保存，不改变抽奖结果或触发重复核销。

依据：[Supabase 函数安全](https://supabase.com/docs/guides/database/functions)、[API 安全](https://supabase.com/docs/guides/api/securing-your-api)、[API key 类型](https://supabase.com/docs/guides/getting-started/api-keys)。
