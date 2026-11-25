# GitHub Pages + 现有 Supabase 部署

已于 2026-11-25 发布：[用户抽奖页](https://sherlockedjim.github.io/sweet-lucky-draw/) · [管理员后台](https://sherlockedjim.github.io/sweet-lucky-draw/#/admin) · [GitHub 仓库](https://github.com/Sherlockedjim/sweet-lucky-draw)。已在浏览器实际打开两个入口，首页、JS 和 CSS 请求均返回 200。

包含密码找回的功能版本 `0aa64c0752a1e09f98c3e01c3f60b8f8d7f5a080` 的 [Verify](https://github.com/Sherlockedjim/sweet-lucky-draw/actions/runs/45562165608) 与 [Deploy GitHub Pages](https://github.com/Sherlockedjim/sweet-lucky-draw/actions/runs/45562165516) 均成功。账号所有者已确认重置密码并登录，代理已实际验收后台生成、复制、CSV 导出、查奖和刷新记录保留。

## 当前连接和接续方式

官方 GitHub CLI 与 Supabase CLI 均已登录，真实数据库审计已经完成。两个公开 Actions Variables 已配置。生产兼容迁移已获用户明确批准，并于 2026-11-25 应用、读回验证；原有管理员和数据保留。

现有项目控制台：<https://supabase.com/dashboard/project/turzcmepfvzwxiraopbd>。确认组织仍是 `SYSU university`，项目名仍是 `sweet-lucky-draw`。不要点击 New Project。

## 数据库审计和迁移

1. 进入现有项目 → SQL Editor → 新建查询。
2. 粘贴并运行 `supabase/audit.sql`，保留输出。
3. 根据 `docs/SECURITY.md` 审查真实函数和策略，并适配迁移预检要求。发现实际问题时先记录修复方案。
4. 确认兼容后运行 `supabase/migrations/20261124094234_secure_existing_hashed_invites.sql`。该文件已按真实哈希结构适配并通过测试，已于 2026-11-25 获用户明确批准并应用，读回核验成功。
5. 再运行审计，核对管理员和行数不减少，并检查授权、函数与约束。

`tests/fixtures/database.sql` 只供本地临时测试数据库使用，**不能**在现有项目执行。Actions 不运行迁移，不使用数据库密码。

## 获取公开连接配置

Supabase 项目 → Project Settings → API Keys 获取 **Publishable key**，旧的 anon key 也支持。项目 URL 已在 `.env.example` 中填好。不要选择 secret 或 service_role。

在本地复制 `.env.example` 为 `.env.local`，仅填公开 URL 和 key。`.env.local` 被 Git 和源码打包程序排除。

```sh
npm ci
npm test
npm run build
npm run check:secrets
npm run dev
```

## 真实接口验收

在 `.env.local` 添加现有管理员和一个**不在 admin_users 中**的普通测试 Auth 用户的测试凭据；变量名见 `.env.example`，不带 `VITE_` 前缀。只在本机输入，不提交，不贴入聊天。

```sh
npm run test:db
```

该脚本通过公开 key + 正常 Auth 登录测试，不使用管理密钥。它会生成 2 个新邀请码，核销其中一个，另一个由两个独立客户端同时请求；验证仅一个成功、一条记录、刷新恢复一致。测试产生的数据保留，不删除已有记录。本次还在真实数据库管理员 claims 下验证 1/500 边界和唯一性，并回滚该测试事务，没有留下 501 个额外邀请码。具体证据范围见 TEST-RESULTS.md。

退出码 `0` 表示已执行的全部验收通过；`1` 表示失败；`2` 表示存在缺失配置或未执行项目。缺失账号时不能将 SKIPPED 计为通过。实际手机和电脑同时操作同一码仍应在最终验收中核对。

## GitHub 仓库与发布

当前使用 `Sherlockedjim/sweet-lucky-draw` 公开仓库，main 已推送，下面的 Variables 和 Pages 配置均已完成。后续更新源码后推送 main 即自动发布。不要上传 `.env.local`、缓存或 credentials。[GitHub Pages 自定义工作流文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

进入仓库：

1. **Settings → Secrets and variables → Actions → Variables → New repository variable**。
2. 创建 `VITE_SUPABASE_URL`，值为现有项目 URL。
3. 创建 `VITE_SUPABASE_PUBLISHABLE_KEY`，值为 Publishable/anon key。这两个配置会编译到前端，是公开配置。
4. **Settings → Pages → Build and deployment → Source → GitHub Actions**。
5. **Actions → Deploy GitHub Pages → Run workflow**，或者推送到 main 自动触发。
6. 等待 build、deploy 全部成功，读取 deploy 环境给出的准确网址。访问首页和 `#/admin`，刷新两个入口并完成真实抽奖验收。

工作流使用最低所需权限：构建仅 contents: read；发布任务具有 pages: write、id-token: write。只上传 dist，不公开源文件和配置文件。[GitHub 部署工作流要求](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

若已安装并登录 GitHub CLI，可用辅助脚本设置新公开仓库、公开变量和 Pages：

```sh
# 先检查/提交本地源码，main 必须是干净工作区
gh auth status
node --env-file=.env.local scripts/deploy-github.mjs sweet-lucky-draw
```

脚本拒绝覆盖没有与当前目录关联的同名仓库；不会应用数据库迁移，也不会把“推送成功”当作“部署成功”。`gh` 不存在时使用插件或 GitHub 网页即可。

已验证的正式地址是 `https://sherlockedjim.github.io/sweet-lucky-draw/`，管理员地址追加 `#/admin`。Hash 路由避免仓库子路径和管理员入口刷新产生 404。

## Supabase Auth 配置

本项目使用已有管理员账号，不开放前台注册。登录页提供邮箱找回密码；重置后仍使用原账号，管理员权限继续由数据库核验。

已于 2026-11-25 将 Auth Site URL 从默认 localhost 更新为正式网站，并增加精确回调 `https://sherlockedjim.github.io/sweet-lucky-draw/?recovery=1`。配置见 `supabase/config.toml`，CLI v3 仅推送其中显式声明的这两项 Auth 属性。读回差异确认这两项已一致，其余认证属性保留。

找回入口是 `#/admin/reset-password`。重置邮件回到现有 Pages 首页的查询参数入口，SDK 只处理恢复回调；有效会话经 Auth 验证后展示新密码表单。成功后清空密码输入并退出该页面会话，要求重新使用新密码登录。密码只由账号所有者在页面提交；账号所有者已确认完成重置，代理实际观察了随后登录的真实后台。

Supabase 默认 SMTP 仅向项目组织成员邮箱发信，并有邮件速率限制。若真实邮箱不在允许范围，需要由项目所有者配置自有 SMTP；不要通过关闭邮箱验证解决发送问题。[Supabase SMTP 文档](https://supabase.com/docs/guides/auth/auth-smtp)。

如果普通用户能成功调用管理 RPC、一个邀请码出现两条记录，或者审计权限结果与方案不一致，应先修复并复测，再发布活动。不要以隐藏管理入口替代数据库权限。
