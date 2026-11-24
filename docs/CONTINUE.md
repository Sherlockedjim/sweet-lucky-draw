# 下一轮接续说明

用户已要求完成开发、联调、GitHub Pages 发布；已经授权这些工作，不要重复要求许可。2026-11-24 用户又确认已连接 GitHub 和 Supabase。插件搜索确认两者 installed=true，但本轮可用工具中没有 GitHub/Supabase 提供商方法，因此未执行远程修改。

用户随后在新一轮明确 @ GitHub、@ Supabase 请求继续部署。提供商接口仍未出现，插件管理服务返回网络传输错误。已准备官方 CLI 备用通道，正在等待用户完成交互登录。不要再要求重复安装插件。

## 已完成且应保留

- 完整 React/TypeScript/Vite 用户端和独立管理员端；原始 `sweet_lucky_draw.html` 保留，不参与生产构建。
- 48 项本地测试通过，其中 15 项在临时 PGlite PostgreSQL 实际执行 SQL；不是远程 Supabase 测试。
- Vite/Vitest 已升级到修复已知漏洞的版本；npm 审计 0 个已知漏洞。
- GitHub CI / Pages workflow、仅接受公开 key 的部署配置校验、凭据扫描、真实集成验收脚本、部署辅助脚本。
- `supabase/audit.sql` 只读；`supabase/migrations/202611240001_harden_existing_draw.sql` 是受结构检查保护的**未应用草案**。
- 用户页 1440 / 390 / 320px，登录页 1440 / 390px 浏览器检查完成，无横向溢出。截图位于 artifacts/screenshots。
- 本地 Git 已初始化；依赖和凭据、缓存、artifacts 均被排除。源码压缩包不含环境文件和 Git 元数据。

## 远程事实

- 组织：SYSU university。
- 项目：sweet-lucky-draw。
- Project ref：turzcmepfvzwxiraopbd。
- URL：https://turzcmepfvzwxiraopbd.supabase.co。
- 浏览器控制台可访问项目，只读 select 1 曾返回 1；完整真实表/函数定义尚未取得。
- 不存在已创建的 GitHub 远程地址或成功部署地址；不要伪造。
- 没有读取、保存、提交 Service Role Key、数据库密码或私人令牌，也没有删除账号或已有数据。

## 继续执行顺序

1. 发现刚连接的 Supabase/GitHub 工具，分别验证账号、项目和仓库权限。优先用插件，不重复创建 Supabase 项目。
2. 对既有项目执行 audit.sql，检查完整字段、函数体、权限、RLS、约束、计数。实际旧 RPC 可能已经具备部分保护，不能预设有漏洞。
3. 记录审计发现和最小修复方案；按真实结构适配迁移草案和测试 fixture。特别核对 `invite_id` / `created_by` / `is_used` / `created_at` 的真实名字与类型。
4. 测试后应用安全修复，再读回验证管理员、数据和授权。不要运行 tests/fixtures/database.sql 到真实项目。
5. 获取现有项目的 Publishable/anon key 配置前端；通过正常 Auth 登录测试真实管理员/普通账号。不要索取或使用 Service Role Key，不重置管理员密码。
6. 运行 scripts/test-live.mjs。两个独立客户端同时使用同一码，必须一个成功、另一 CODE_USED，并仅有一条记录。测试创建的数据保留。
7. 创建/关联用户的 GitHub 仓库，设置两个公开 Variables，Pages Source=GitHub Actions，推送 main。
8. 持续跟进 Actions 至明确成功或具体失败，读取准确 page_url，实际访问用户与管理员入口并复核。更新 README / TEST-RESULTS / DEPLOYMENT 为真实最终状态，重新打包源码。

## 本机运行时

Node 在 `/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`。普通 PATH 中无 node/npm，可临时将该目录加到 PATH。

npm 的本机临时入口 `.cache/npm/bin/npm-cli.js`，例如 `node .cache/npm/bin/npm-cli.js test`。标准安装了 Node/npm 的环境直接使用 README 中的 npm 命令。不要提交 .cache。

GitHub 官方 CLI 已下载到 `.cache/tools/gh`（通过官方发行摘要核验）。本任务用 `GH_CONFIG_DIR="$PWD/.local/gh"`，检查登录时保持相同设置。Supabase 官方 CLI v3 的入口为 `node .cache/supabase-cli/node_modules/supabase/dist/supabase.js`，登录使用默认安全配置目录；不要打印令牌。

CLI v3 已通过 --help 核实的只读审计命令：`supabase db query --remote=turzcmepfvzwxiraopbd --read-only --file supabase/audit.sql --output-format json`。公开 key 元数据可用 `supabase projects api-keys --remote=turzcmepfvzwxiraopbd --output-format json`，不要使用 --reveal。交互登录需要 `login --no-browser --agent no --output-format text`，否则自动 agent JSON 模式禁止提示输入。

真实 Supabase 集成命令缺少配置时退出码为 2（SKIPPED），不能当作通过。本地预览服务器在结束时停止，需要预览再运行 npm run dev。
