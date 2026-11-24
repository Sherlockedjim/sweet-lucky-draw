# GitHub Pages + 现有 Supabase 部署

目前没有 GitHub 仓库地址和已部署公网网址。以下是已配置好的发布路径；只有 Actions 成功并实际打开页面后，才能将对应 URL 认定为可用。

## 当前连接和接续方式

GitHub 和 Supabase 插件已安装，用户已完成连接操作。但本轮正在运行的聊天尚未加载两者的接口，因此真实授权和项目访问仍待验证。重新打开此聊天，在输入框用 @ 选择 GitHub 和 Supabase 后发送“继续部署”，从真实只读审计接着做。无需重复安装或发送密码、Service Role Key。

现有项目控制台：<https://supabase.com/dashboard/project/turzcmepfvzwxiraopbd>。确认组织仍是 `SYSU university`，项目名仍是 `sweet-lucky-draw`。不要点击 New Project。

## 数据库审计和迁移

1. 进入现有项目 → SQL Editor → 新建查询。
2. 粘贴并运行 `supabase/audit.sql`，保留输出。
3. 根据 `docs/SECURITY.md` 审查真实函数和策略，并适配迁移预检要求。发现实际问题时先记录修复方案。
4. 确认兼容后运行 `supabase/migrations/202611240001_harden_existing_draw.sql`。该文件当前是未应用的草案。
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

该脚本通过公开 key + 正常 Auth 登录测试，不使用管理密钥。它会生成 2 个新邀请码，核销其中一个，另一个由两个独立客户端同时请求；验证仅一个成功、一条记录、刷新恢复一致。测试产生的数据保留，不删除已有记录。1/500 边界和事务回滚另外在临时数据库测试，避免给现有活动制造 500 条测试邀请码。

退出码 `0` 表示已执行的全部验收通过；`1` 表示失败；`2` 表示存在缺失配置或未执行项目。缺失账号时不能将 SKIPPED 计为通过。实际手机和电脑同时操作同一码仍应在最终验收中核对。

## GitHub 仓库与发布

建议仓库名 `sweet-lucky-draw`。在账号中创建新仓库并推送本地源码。源码可公开；不要上传 `.env.local`、缓存或 credentials。GitHub Free 的 Pages 支持公开仓库。[GitHub Pages 自定义工作流文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

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

最终地址格式通常是 `https://<账号>.github.io/sweet-lucky-draw/`，管理员地址追加 `#/admin`。这只是格式示例，**不是本项目已部署的地址**。

## Supabase Auth 配置

本项目仅使用已有管理员账号的邮箱/密码登录，不开放前台注册，也不会重建已有管理员。Auth 的 Site URL 应设置为最终 Pages URL；如果以后使用密码重置、邮件链接等功能，再将实际回调 URL 加入允许列表。当前密码登录不依赖 OAuth 回调。

如果普通用户能成功调用管理 RPC、一个邀请码出现两条记录，或者审计权限结果与方案不一致，应先修复并复测，再发布活动。不要以隐藏管理入口替代数据库权限。
