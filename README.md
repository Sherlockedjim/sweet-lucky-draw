# Sweet Lucky Draw

浅鹅黄色的甜品盲盒抽奖屋。React + TypeScript + Vite，Supabase Auth / PostgreSQL RPC，GitHub Pages 静态部署。

**当前版本（2026-11-26）：六礼盒抽奖，须先填写昵称、选择头像，再使用邀请码；结果页展示昵称和头像。114 项本地测试、构建和凭据扫描通过。昵称头像随中奖记录保存在 Supabase，后台展示并支持昵称搜索；本版采用手动填写，未接入微信授权。**

用户网址：[甜甜抽奖屋](https://sherlockedjim.github.io/sweet-lucky-draw/) · 管理员网址：[管理后台](https://sherlockedjim.github.io/sweet-lucky-draw/#/admin) · [GitHub 源码](https://github.com/Sherlockedjim/sweet-lucky-draw)。

沿用现有项目 `SYSU university / sweet-lucky-draw`。迁移前为 1 位管理员、0 个邀请码、0 条中奖记录；保留原管理员和联调产生的 2 个已使用测试码、2 条记录。管理员随后自行生成 2 个未使用码，验收时后台共显示 4 个邀请码、2 条中奖记录。没有删除用户或已有数据。

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

- 8 位数字/大写字母邀请码，选择六只盲盒之一或随机挑选；三种实物各占 1/6，三个开心空盒合计占 1/2。
- 空盒揭晓显示“送你一天的开心～”，使用笑脸太阳插画，保存结果并消耗该邀请码，刷新可恢复。
- 昵称与头像均为抽奖前必填；缺任一项、昵称只有空白或图片正在处理时，邀请码及礼盒入口锁定。清空资料后重新锁定。头像在浏览器居中裁剪为 256×256 JPEG。结果页展示已保存的资料，持原邀请码可跨设备恢复。
- 昵称、头像与奖品在同一事务中保存，后台中奖记录展示头像和昵称；CSV 包含昵称和头像保存状态。历史缺失显示“历史未记录”，参与者可凭原邀请码补填一次。
- 奖品由 PostgreSQL 决定；前端随机排列外观和未选中的奖品，不传入可操纵的奖品参数。
- 同一邀请码由行锁和唯一索引保护；核销和中奖记录写入在同一事务中。
- 请求超时后先查已有结果，刷新后也从数据库恢复，避免自动重复提交。
- 独立邮箱/密码管理员登录；同时经过 Auth 身份验证和数据库管理员名单校验。
- 登录页提供“忘记密码”，邮箱验证后可设置原账号的新密码；回调兼容 GitHub Pages，成功后重新登录。
- 1–500 个邀请码批量生成、复制、CSV 导出；状态、总数、时间、中奖记录、搜索、筛选、分页。
- 手机/电脑响应式布局、键盘焦点管理、减少动画偏好、屏幕阅读器状态提示。
- 前端只接受 Publishable/anon key；构建部署检查拒绝 secret/service-role key。

## 数据库审查与迁移

1. 在**现有项目** SQL Editor 的新查询中运行 `supabase/audit.sql`。该文件只读，不返回密码、JWT 或邀请码值。
2. 按 `docs/SECURITY.md` 审查真实结构、函数、所有 RLS 策略及权限。原函数的管理员校验、行锁和唯一约束已核验。
3. 兼容迁移是 `supabase/migrations/20261124094234_secure_existing_hashed_invites.sql`，已按真实哈希字段适配。
4. 本项目已于 2026-11-25 应用迁移并读回验证，无需重复执行。不要执行测试 fixture 或重新初始化项目。
5. 按 `docs/DEPLOYMENT.md` 配置公开连接并执行真实接口验收。

六礼盒增量文件为 `supabase/migrations/20261126023841_six_boxes_with_happy_messages.sql`。先发布兼容四种结果的前端，再应用该文件；不要重新执行旧迁移或重新初始化项目。它扩展奖品检查约束和私有随机/显示函数，不更改已有中奖结果。

迁移保留原表、数据和管理员；四个旧 RPC 保存在禁用 API 访问的 `sweet_legacy` schema，新实现的返回格式统一为 JSONB。既有其他调用端需要一起核对。

| RPC | 调用方 | 返回 |
| --- | --- | --- |
| `redeem_and_draw(p_code text,p_nickname text,p_avatar text)` | anon / authenticated | `{ id, prize, created_at, participant }` |
| `get_draw_result(p_code text)` | anon / authenticated | 相同结果，尚未抽取则 `null` |
| `save_draw_profile(p_code text,p_nickname text,p_avatar text)` | 持有原邀请码者 | 仅为历史空资料补填，返回相同回执 |
| `admin_generate_codes(p_count integer)` | admin_users 内的 authenticated | 邀请码对象数组 |
| `admin_list_invites()` | 同上 | `{ id, code, is_used, created_at, used_at }[]`（code 为隐藏前 4 位的历史号码） |
| `admin_list_draws()` | 同上 | `{ id, code, prize, created_at, participant }[]`（code 为隐藏前 4 位的历史号码） |

昵称头像入库增量迁移：`supabase/migrations/20261126064040_persist_participant_profiles.sql`。保留历史记录；详情见 `docs/PROFILE-RECORDS.md`。旧的一参数抽奖实现不再对 API 角色开放。

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
