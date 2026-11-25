# 交付与接续状态（2026-11-25）

用户已明确批准“应用生产迁移并继续部署”。迁移已应用并读回核验，GitHub Pages 已成功发布；无需重复申请批准或重新执行迁移。

- 源码：https://github.com/Sherlockedjim/sweet-lucky-draw
- 用户页：https://sherlockedjim.github.io/sweet-lucky-draw/
- 管理员：https://sherlockedjim.github.io/sweet-lucky-draw/#/admin
- 现有 Supabase 项目：turzcmepfvzwxiraopbd。

两个公开构建变量和 Pages 工作流已配置；源码 main 已推送。首次发布在 Pages 启用前失败，启用后重试成功。首页及 JS/CSS 实际返回 200，正式用户页与管理员登录页已在浏览器打开。后续推送 main 会自动验证并发布。

本地 60 项测试通过，其中 10 项覆盖邮箱找回密码。真实公共 HTTP 覆盖正确/格式错误/不存在/重复/恢复/并发、匿名管理接口和直接表访问。两张测试码各仅一条记录且 used。普通 authenticated 角色/JWT claims 在真实只读事务中被全部管理接口拒绝。真实管理员 claims 的 1/500 批量与唯一性、非法数量测试通过并回滚。

保留原有 1 位管理员，以及联调产生的 2 个测试邀请码和 2 条记录。没有删除用户数据或读取管理员密码。完整测试码只保存在本机被 Git 忽略的 .local/live-test-invites.json，不能提交或公开。

账号所有者反馈不记得管理员密码。已增加 `#/admin/reset-password` 找回页面，以及邮件链接回调与新密码表单；只更新 Auth Site URL 和精确 recovery 回调，原用户与权限保留。真实邮件送达、密码保存、重新登录尚待本人在页面完成，不能声称已重置密码。

剩余人工验收：账号所有者打开找回页面，输入原邮箱并主动申请邮件；打开邮件后本人输入新密码并保存，再登录后台，生成邀请码、复制/导出和核对结果。不要读取浏览器 token，也不要代填新密码或把真实密码写入测试。新 CUA 交接应保留正式找回入口；观察到最终结果后结束交接。原本机登录交接已确认因忘记密码结束。

运行与部署命令见 README.md / DEPLOYMENT.md，后台操作见 ADMIN-GUIDE.md，证据范围见 TEST-RESULTS.md。原始审计在被 Git 忽略的 .local/audits，HTTP 与发布报告在 artifacts；不得将网络失败当作权限测试通过，也不得盲目重试可能已提交的核销请求。
