# 接续部署

用户原目标仍是完成抽奖站开发、真实联调和 GitHub Pages 发布。已有代码、生产配置和 50 项本地测试；不需要重新建项目或重复登录。

## 当前连接与仓库

- GitHub CLI 已登录 Sherlockedjim，凭据在系统 keyring。每次保持 GH_CONFIG_DIR="$PWD/.local/gh"。
- 官方 gh 位于 .cache/tools/gh。为避开偶发 Go HTTP EOF，.local/github-api.mjs 用官方 CLI 获取的凭据在内存里调用 GitHub REST，不打印或保存 token。
- 已创建 https://github.com/Sherlockedjim/sweet-lucky-draw ，本地 origin 已关联。源码尚未推送。
- 已配置两个公开 Actions Variables：VITE_SUPABASE_URL、VITE_SUPABASE_PUBLISHABLE_KEY。
- Supabase CLI 已登录。入口为 node .cache/supabase-cli/node_modules/supabase/dist/supabase.js；Node 绝对路径为 /Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node。
- 现有 Supabase ref 是 turzcmepfvzwxiraopbd，项目名 sweet-lucky-draw，组织 SYSU university。
- .env.local 仅含已核验的公开 URL / Publishable key。不要读取或发布 secret/service_role key。

## 真实数据库已审计

只读审计保存在 .local/audits/before-decoded.json。基线 1 位管理员、0 个邀请码、0 条记录。三表 RLS 已启用，直接 API 表/列授权为空；RPC 有管理员检查和固定 search_path，抽奖已有行锁和唯一约束。

实际表是哈希邀请码结构，中奖时间为 drawn_at。正式迁移由 CLI 生成：supabase/migrations/20261124094234_secure_existing_hashed_invites.sql。旧的未审计明文假设草案已删除。新迁移与真实结构对应，PGlite 测试 16 项；总计 50 项本地测试通过，生产构建通过。

## 生产迁移仍需明确批准

首次执行被自动审批审查拒绝。拒绝理由：生产锁表、权限调整和函数替换需要用户明确批准具体变更。已经向用户展示 SQL 和 docs/DATABASE-REVIEW.md 并请求批准。

**用户随后问管理员注册、邀请码生成和查结果流程，这不是批准。不得将该问题当作同意。** 当前远程数据库未修改。若用户明确批准该迁移及继续部署，才可重新提交原命令；不要换工具或间接执行绕过审查。

命令：supabase db query --remote=turzcmepfvzwxiraopbd --file supabase/migrations/20261124094234_secure_existing_hashed_invites.sql --yes --output-format json。

## 用户最新问题的完成情况

已通过只读查询核对存在的管理员邮箱并已确认，相关私密信息只保存在 .local/admin-identity.json，不写公开文档。用户使用创建 Auth 用户时设置的密码；系统无法读取原密码，未重置或删除账号。

后台代码已新增 AdminLookup，输入完整 8 位邀请码，通过 get_draw_result 精确找回奖品、时间、编号，并可定位对应记录。生成后要复制或导出本批完整码；刷新后历史只显示末 4 位。操作说明在 docs/ADMIN-GUIDE.md。

## 继续顺序

1. 解答用户账号/生成/查询问题，并等待明确的生产迁移批准。
2. 批准后执行上述兼容迁移；网络错误时先读回状态再考虑重试。
3. 执行 supabase/audit.sql 再次核对 RLS、权限、管理员计数和函数；运行 db advisors --remote=turzcmepfvzwxiraopbd --type security。
4. 使用公开 key 执行真实 HTTP 验收；管理员实际密码登录需要用户本人在页面输入，不能伪造为通过。可在事务内模拟 authenticated 普通 UID 检查数据库权限，但须在报告里区分真实 Auth 登录。
5. 真实并发测试用两个独立 HTTP 客户端对同一码并发调用，验证一个成功、一条记录。保留生成的测试数据，不删原始数据。
6. 提交源码、推送 main，配置 Pages Source=GitHub Actions，跟进工作流到真实成功并读取准确 page_url。Pages 尚未启用，没有公网成功地址。
7. 更新 README、DEPLOYMENT、SECURITY、TEST-RESULTS、DATABASE-REVIEW 为真实最终状态；重新打包源码。不要把等待批准、SKIPPED 或仅推送成功当作部署成功。

本机 npm 入口 .cache/npm/bin/npm-cli.js；常规环境按 README 用 npm。源码包脚本拒绝嵌套环境文件、CLI .temp、.local、.cache 和符号链接。原始 sweet_lucky_draw.html 保留但不进入生产 dist。
