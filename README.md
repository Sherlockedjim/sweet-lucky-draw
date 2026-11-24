# Sweet Lucky Draw

浅鹅黄色的甜品盲盒抽奖屋。React + TypeScript + Vite，Supabase Auth / PostgreSQL RPC，GitHub Pages 静态部署。

**当前状态（2026-11-24）：前后台、50 项本地测试和构建已完成；真实数据库已审计，GitHub 仓库已创建。生产迁移等待用户明确批准，联调和公网部署尚未完成。**

现有项目 `SYSU university / sweet-lucky-draw` 已通过官方 CLI 只读审计：1 位管理员、0 个邀请码、0 条中奖记录。GitHub 仓库是 https://github.com/Sherlockedjim/sweet-lucky-draw ，源码待迁移获批后推送并发布。没有删除用户或已有数据。

审计确认原有 RLS、管理员校验、行锁、唯一约束均已具备。兼容迁移保留哈希存储，补充结果恢复和完整列表返回；详见 `docs/DATABASE-REVIEW.md`。

## 本地运行

要求 Node.js 24（或 Vite 支持的 Node 版本）和 npm。

```sh
npm ci
cp .env.example .env.local
# 编辑 .env.local，填入现有项目的 Publishable key 或旧 anon key
npm run dev
```

未配置连接时，页面明确显示“活动正在准备中”，不会模拟中奖。`sweet_lucky_draw.html` 是原始本地抽奖示例，保留作参考，**不参与生产构建**。

用户入口是站点根路径；管理员入口是 `/#/admin`。Hash 路由和相对资源路径可直接运行在 GitHub Pages 仓库子路径下。

## 已实现

- 8 位数字/大写字母邀请码，选择三只盲盒之一或随机挑选，手绘 SVG 甜品、礼花及中奖回执。
- 奖品由 PostgreSQL 决定；前端随机排列外观和未选中的奖品，不传入可操纵的奖品参数。
- 同一邀请码由行锁和唯一索引保护；核销和中奖记录写入在同一事务中。
- 请求超时后先查已有结果，刷新后也从数据库恢复，避免自动重复提交。
- 独立邮箱/密码管理员登录；同时经过 Auth 身份验证和数据库管理员名单校验。
- 1–500 个邀请码批量生成、复制、CSV 导出；状态、总数、时间、中奖记录、搜索、筛选、分页。
- 手机/电脑响应式布局、键盘焦点管理、减少动画偏好、屏幕阅读器状态提示。
- 前端只接受 Publishable/anon key；构建部署检查拒绝 secret/service-role key。

## 数据库：先审计，再适配

1. 在**现有项目** SQL Editor 的新查询中运行 `supabase/audit.sql`。该文件只读，不返回密码、JWT 或邀请码值。
2. 按 `docs/SECURITY.md` 审查真实结构、函数、所有 RLS 策略及权限。当前不能断言原函数有漏洞。
3. 对比 `supabase/migrations/20261124094234_secure_existing_hashed_invites.sql` 的结构预期，必要时按真实结果调整。草案不是现有数据库的结构声明。
4. 完成审查后才在现有项目应用迁移。不要执行测试 fixture，不要重新初始化项目，不要盲目 `db push`。
5. 按 `docs/DEPLOYMENT.md` 配置公开连接并执行真实接口验收。

迁移会保留原表、数据和管理员；将四个旧 RPC 移至禁用 API 访问的 `sweet_legacy` schema 后，安装相同 RPC 名称的安全实现。RPC 的返回格式统一为 JSONB。既有其他调用端需要一起核对。

| RPC | 调用方 | 返回 |
| --- | --- | --- |
| `redeem_and_draw(p_code text)` | anon / authenticated | `{ id, prize, created_at }` |
| `get_draw_result(p_code text)` | anon / authenticated | 相同结果，尚未抽取则 `null` |
| `admin_generate_codes(p_count integer)` | admin_users 内的 authenticated | 邀请码对象数组 |
| `admin_list_invites()` | 同上 | `{ id, code, is_used, created_at, used_at }[]`（code 为隐藏前 4 位的历史号码） |
| `admin_list_draws()` | 同上 | `{ id, code, prize, created_at }[]`（code 为隐藏前 4 位的历史号码） |

## 验证与部署

```sh
npm test
npm run build
npm run check:secrets
# 需要真实连接，以及测试用的现有账号；未配置会明确 SKIPPED 并返回退出码 2
npm run test:db
```

`npm test` 包含独立 PGlite PostgreSQL 测试，完全不连接现有 Supabase。它是单连接环境，不能替代真实的并发请求测试。

GitHub Pages 部署只上传 `dist/`。生产工作流不会自动执行数据库迁移。仓库 Variables 需要设置 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`；仓库 Settings → Pages → Source 选择 **GitHub Actions**。详见 `docs/DEPLOYMENT.md`。

后台使用：`docs/ADMIN-GUIDE.md`；源码：`src/`；数据库：`supabase/`；验收状态：`docs/TEST-RESULTS.md`；权限方案：`docs/SECURITY.md`。源码包可用 `node scripts/package-source.mjs` 生成，明确排除环境文件、缓存和 Git 元数据。
