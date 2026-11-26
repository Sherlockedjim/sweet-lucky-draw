# 测试结果

最近更新：2026-11-26（Asia/Shanghai）。下列原版真实联调记录来自 2026-11-25；六礼盒变更单独列出。

## 本地验证

69 项 Vitest 测试通过：domain 21、draw 9、admin 7、database 16、password-recovery 10、six-box-database 6。数据库测试在隔离的 PGlite PostgreSQL 中验证真实字段、哈希存储、RLS/列权限、管理员身份、事务回滚和唯一约束。生产构建通过，凭据扫描通过。

## 六礼盒变更

新增测试验证六个揭晓位置均包含原三种实物及三个开心结果；选中第六个礼盒也能正确提交；开心结果不提示兑换实物，刷新恢复时不重复核销。数据库测试确认六个等概率槽位中三种实物各一格、开心结果三格，252 个可接受随机字节映射为 42/42/42/126 次；开心结果仅核销一次，管理员可查，旧实物记录及权限保留，迁移可重复执行。

本机实际浏览器检查：1280px 电脑布局为 3×2；390px 手机布局为 2×3，均有 6 个礼盒且无横向溢出。活动说明中的 1/6、1/2 概率和开心空盒说明已核对。截图在 artifacts/screenshots/six-boxes-local-desktop.jpg 和 six-boxes-local-mobile.jpg。生产激活与验证结果记录在 artifacts/six-boxes-validation.json。

新增恢复测试覆盖：Pages 路径与回调、忽略非恢复 token、页面加载不自动发信、手动发送请求、邮件权限失败、失效会话拦截、密码确认、更新成功后的清理与重新登录、密码规则拒绝。这 10 项自动化测试使用 mock；另由账号所有者本人完成真实密码重置，并由代理观察实际登录后台。

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
| 管理员密码登录 | 账号所有者确认已重置密码并登录；代理实际观察到后台及服务器返回的业务数据，通过 |
| 真实后台生成邀请码 | 观察到管理员生成 2 个邀请码的成功窗口，两码均为 8 位大写字母/数字，通过 |
| 邀请码复制 | 实际点击复制按钮，观察到“邀请码已复制”成功提示，通过；未读取系统剪贴板内容 |
| CSV 下载与内容 | 实际下载 CSV，核对表头、UTF-8 BOM、2 行完整号码与页面一致且均为未使用，通过 |
| 完整邀请码查奖与记录定位 | 查询一张已使用的联调码，显示奶茶、抽奖时间和记录编号；定位到同一条中奖记录，通过 |
| 后台刷新 | 刷新后仍已登录，4 个邀请码（2 未使用、2 已使用）及 2 条中奖记录保留，通过 |

临时创建的 2 个邀请码及 2 条中奖记录保留，现有管理员未删除。最初网络失败的生成请求已读回确认未提交后才重试。对可能产生写入的有效核销请求不自动重试。

本机原始 HTTP 报告位于 artifacts/live-public-api-results.json（13 项通过）和 artifacts/live-negative-api-results.json（加强后的 10 项通过）；合计覆盖 14 种不重复检查。数据库审计与测试结果保存在被 Git 忽略的 .local/audits/。这些报告不含前端私密密钥。

## 浏览器

本地用户页 1440 / 390 / 320px、登录页 1440 / 390px 已实际渲染检查，无横向溢出。活动说明与独立管理员路由检查通过；完整邀请码精确查询有对应组件测试。

正式公网首页、独立登录页和真实已登录后台均已在浏览器打开。用户页刷新后奖品展示顺序重新随机；后台刷新后登录状态和记录保留。管理员自行生成的 2 个未使用码未被代理核销。实际 CSV 文件保存在本机 Downloads，内容验证报告为 artifacts/admin-ui-csv-verification.json。

真实后台验收截图：artifacts/screenshots/admin-authenticated-dashboard.jpg；该截图仅展示掩码邀请码。完整未使用码不提交到 GitHub。初次复制/下载检查因浏览器控制中断未返回，后续通过可见成功提示和实际下载文件完成核验，没有重复生成邀请码。

## 部署

已明确批准并成功应用生产迁移，读回确认 RLS 开启、直接表/列权限为空，原管理员保留。

- 用户页：https://sherlockedjim.github.io/sweet-lucky-draw/
- 管理员页：https://sherlockedjim.github.io/sweet-lucky-draw/#/admin
- [Verify 45546203741](https://github.com/Sherlockedjim/sweet-lucky-draw/actions/runs/45546203741)：成功。
- [Deploy GitHub Pages 45546203718，第二次执行](https://github.com/Sherlockedjim/sweet-lucky-draw/actions/runs/45546203718)：build/deploy 成功。
- 实际 HTTP 验证：首页 200、JS 200、CSS 200，证据 artifacts/deployment-http-check.json。

两个独立 HTTP 客户端的并发请求已通过；没有把它称为两台物理设备的人工操作测试。普通用户的真实 Auth 密码登录也未执行，当前越权证据为真实数据库 authenticated 角色/JWT claims 校验。
