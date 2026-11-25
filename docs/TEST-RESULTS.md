# 测试结果

日期：2026-11-25（Asia/Shanghai）。不把等待用户验证的项目计为通过。

## 本地验证

60 项 Vitest 测试通过：domain 20、draw 7、admin 7、database 16、password-recovery 10。数据库测试在隔离的 PGlite PostgreSQL 中验证真实字段、哈希存储、RLS/列权限、管理员身份、事务回滚和唯一约束。生产构建通过，凭据扫描通过。

新增恢复测试覆盖：Pages 路径与回调、忽略非恢复 token、页面加载不自动发信、手动发送请求、邮件权限失败、失效会话拦截、密码确认、更新成功后的清理与重新登录、密码规则拒绝。邮件和密码写入测试使用 mock，不计为真实邮件送达或真实账号密码已更新。

## 真实 Supabase 验证

项目 turzcmepfvzwxiraopbd，使用公开 Publishable key 进行 HTTP 测试；没有使用 Service Role Key。

| 验收 | 结果与证据范围 |
| --- | --- |
| 匿名访问三个管理 RPC | 真实 HTTP 返回权限拒绝，通过 |
| 匿名直接读取三张业务表 | 严格核验权限拒绝/无可访问行，通过；网络错误不计为权限通过 |
| 非法格式邀请码 | 真实 HTTP 拒绝，通过 |
| 格式正确但不存在的邀请码 | 只读确认号码不存在，再由真实 HTTP 返回 INVALID_CODE，通过 |
| 正确邀请码 | 真实 HTTP 返回服务端奖品和持久记录，通过 |
| 重复使用 | 独立客户端被 CODE_USED 拒绝，通过 |
| 两客户端并发同一码 | 两个独立 HTTP 客户端同时请求：一个成功，另一个 CODE_USED，通过 |
| 并发记录一致性 | 数据库读回两张测试码均 used，且每张恰好 1 条记录，通过 |
| 刷新/新会话恢复 | 新建客户端查回完全相同的奖品、时间及记录 ID，通过 |
| 普通 authenticated 用户越权 | 真实数据库中模拟普通角色和 JWT claims，三个接口均 NOT_ADMIN，通过；不等同真实 Auth 密码登录 |
| 批量 1 和 500、唯一性、非法数量 | 真实数据库中以现有管理员 claims 测试，通过；整个测试事务 ROLLBACK，不留下 501 个额外码 |
| 管理员密码登录 | 账号所有者反馈不记得原密码；已提供找回页面，真实密码恢复及登录仍待本人完成 |

临时创建的 2 个邀请码及 2 条中奖记录保留，现有管理员未删除。最初网络失败的生成请求已读回确认未提交后才重试。对可能产生写入的有效核销请求不自动重试。

本机原始 HTTP 报告位于 artifacts/live-public-api-results.json（13 项通过）和 artifacts/live-negative-api-results.json（加强后的 10 项通过）；合计覆盖 14 种不重复检查。数据库审计与测试结果保存在被 Git 忽略的 .local/audits/。这些报告不含前端私密密钥。

## 浏览器

本地用户页 1440 / 390 / 320px、登录页 1440 / 390px 已实际渲染检查，无横向溢出。活动说明与独立管理员路由检查通过；完整邀请码精确查询有对应组件测试。

正式公网首页和 `#/admin` 已在浏览器实际打开；刷新后用户界面正常，三种奖品展示顺序重新随机，管理员入口显示独立登录页。正式页面截图位于 artifacts/screenshots/published-draw-desktop.jpg 和 published-admin-login-desktop.jpg。真实管理员密码登录仍待账号所有者本人完成。

## 部署

已明确批准并成功应用生产迁移，读回确认 RLS 开启、直接表/列权限为空，原管理员保留。

- 用户页：https://sherlockedjim.github.io/sweet-lucky-draw/
- 管理员页：https://sherlockedjim.github.io/sweet-lucky-draw/#/admin
- [Verify 45546203741](https://github.com/Sherlockedjim/sweet-lucky-draw/actions/runs/45546203741)：成功。
- [Deploy GitHub Pages 45546203718，第二次执行](https://github.com/Sherlockedjim/sweet-lucky-draw/actions/runs/45546203718)：build/deploy 成功。
- 实际 HTTP 验证：首页 200、JS 200、CSS 200，证据 artifacts/deployment-http-check.json。

两个独立 HTTP 客户端的并发请求已通过；没有把它称为两台物理设备的人工操作测试。普通用户的真实 Auth 密码登录也未执行，当前越权证据为真实数据库 authenticated 角色/JWT claims 校验。
