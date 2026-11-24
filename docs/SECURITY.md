# 数据库审计与拟议修复方案

## 当前证据和边界

已在现有 Supabase 控制台看到正确的组织、项目和健康状态，且只读 `select 1` 探测成功。完整的表字段、约束、策略和四个 RPC 函数体尚未可靠取得。因此**尚未判定现有函数是否存在漏洞，也没有应用任何远程修复**。

请先运行 `supabase/audit.sql`。不要把 Auth 密码、数据库密码、service-role/secret key 或个人令牌贴入报告或仓库。

## 审查内容

| 对象 | 需要确认 |
| --- | --- |
| 三张表 | 真实字段、类型、默认值、外键、唯一约束、现有行数、RLS 开关 |
| 权限 | PUBLIC / anon / authenticated 的表级、列级授权及全部策略 |
| 四个 RPC | 签名、返回类型、所有者、调用授权、SECURITY DEFINER、固定 search_path |
| 其他 definer 函数 | 是否另有可直接读写这三张表的外部入口 |
| 管理接口 | 每次调用是否在数据库通过 `auth.uid()` 查询 `admin_users`，而非信任客户端邮箱或参数 |
| 抽奖函数 | 是否先行锁定邀请码，是否原子核销与写记录，是否存在一个邀请码多条中奖记录 |

Supabase 的 RLS 不直接保护函数执行权限；definer 函数需要单独审查 EXECUTE 授权与固定 search_path。[Supabase 函数安全文档](https://supabase.com/docs/guides/database/functions)、[API 安全文档](https://supabase.com/docs/guides/api/securing-your-api)。

## 迁移草案的兼容预期

草案**尚未应用**。它仅支持以下已明确约定的结构；不符合时整笔中止，不能以这份草案推断真实数据库的字段名称。

- `admin_users.user_id uuid`。
- `invite_codes`：`id uuid, code text, is_used boolean, created_by uuid, created_at timestamptz, used_at timestamptz`。
- `draw_records`：`id uuid, invite_id uuid, prize text, created_at timestamptz`。
- 如果原表使用 `invite_code_id`、`drawn_at` 或其他字段，需先据审计结果适配。额外的无默认值必填字段也会触发中止。
- 原函数签名应为 `(text)`、`(integer)`、`()`、`()`。存在重载或命名冲突时中止。
- 已有重复数据、无中奖记录的已用邀请码、不一致的状态或不支持的奖品值，均要求人工核对；脚本不会通过删除/改写这些行强行通过。

## 拟议修复的实际效果

1. 在一笔事务中锁定三张表并预检；不创建、清空或重建现有业务表。
2. 四个原 RPC 迁往 `sweet_legacy`，保留定义与依赖对象。API 角色失去该 schema 的访问与旧函数执行权限。
3. 开启 RLS，撤销三张表的表级和列级直接授权。现有 RLS 策略不删除，但浏览器仅能通过规定 RPC 操作。
4. 新 RPC 均固定空 search_path，并对表、Auth 和辅助函数使用完整限定名称；所有者为 postgres。
5. 管理员函数每次核对 `auth.uid()` 与现有 `admin_users.user_id`。普通 Auth 用户也不能读取或生成邀请码。
6. 公开抽奖 RPC 校验严格的 8 位格式，`SELECT ... FOR UPDATE` 锁行后检查使用状态。核销和记录写入一起提交；写记录异常会回滚核销。
7. 每个邀请码唯一、每个邀请码最多一条中奖记录的索引再提供一层约束。
8. 基于密码学随机 UUID 的随机字节，使用拒绝采样得到三种奖品的精确等概率分布。邀请码用 40 位随机量编码成 8 个大写字母/数字，冲突时重试。
9. `get_draw_result` 只读并只返回奖品、记录编号和抽奖时间。持有已使用邀请码的人可以找回对应结果，不返回邮箱、管理员身份或其他邀请码。

邀请码是一次性持有凭证，应该只分发给预期参与者。中奖回执由服务器记录确认；截图或浏览器展示本身不是不可伪造的兑奖凭证。管理员应在后台核对记录编号和奖品。

前端的随机洗牌仅控制位置和展示，用户选择的盒子展示服务器奖品，另两格随机放置剩余两种奖品。客户端不能选择奖品或控制概率。

## 凭据和发布

前端配置仅含项目 URL 与 Publishable/anon key。[Supabase API key 文档](https://supabase.com/docs/guides/getting-started/api-keys) 将浏览器用的公开 key 与能绕过 RLS 的服务端密钥区分开。

- 构建检查拒绝 secret key 和 JWT role 为 service_role 的 key。
- 不保存数据库密码，不需要 Service Role Key，源码与 Actions 均没有此类配置项。
- 管理员登录令牌由 Supabase SDK 管理，存在当前标签页的 sessionStorage；浏览器禁止存储时仅存在内存。
- 管理员密码不写文件或日志，登录后立即清空输入状态。
- 刷新恢复仅缓存邀请码，再调用数据库查询；不把缓存奖品当作服务器记录。
- CSV 对文本转义，防止表格公式注入；前端渲染使用 React 文本转义。
- 生产站点只发布 `dist/`，SQL、测试 fixture、环境文件和原始演示文件均不发布。

## 回溯与恢复

应用前保留只读审计输出，并记录三张表的计数和原始授权。迁移失败时事务回滚；成功后旧函数保留在 `sweet_legacy`。如需回退，应先保存新函数定义、在维护窗口审查依赖与授权，再恢复旧实现；不要直接删除业务表或管理员。旧函数可能具有原有安全问题，不应未经审查重新开放。
