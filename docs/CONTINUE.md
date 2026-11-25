# 交付与接续状态（2026-11-25）

用户已明确批准“应用生产迁移并继续部署”。迁移已应用并读回核验，GitHub Pages 已成功发布；无需重复申请批准或重新执行迁移。

- 源码：https://github.com/Sherlockedjim/sweet-lucky-draw
- 用户页：https://sherlockedjim.github.io/sweet-lucky-draw/
- 管理员：https://sherlockedjim.github.io/sweet-lucky-draw/#/admin
- 现有 Supabase 项目：turzcmepfvzwxiraopbd。

两个公开构建变量和 Pages 工作流已配置；源码 main 已推送。首次发布在 Pages 启用前失败，启用后重试成功。首页及 JS/CSS 实际返回 200，正式用户页与管理员登录页已在浏览器打开。后续推送 main 会自动验证并发布。

本地 50 项测试通过；真实公共 HTTP 覆盖正确/格式错误/不存在/重复/恢复/并发、匿名管理接口和直接表访问。两张测试码各仅一条记录且 used。普通 authenticated 角色/JWT claims 在真实只读事务中被全部管理接口拒绝。真实管理员 claims 的 1/500 批量与唯一性、非法数量测试通过并回滚。

保留原有 1 位管理员，以及联调产生的 2 个测试邀请码和 2 条记录。没有删除用户数据或读取管理员密码。完整测试码只保存在本机被 Git 忽略的 .local/live-test-invites.json，不能提交或公开。

剩余人工验收：账号所有者在正式后台使用原邮箱和密码登录，然后生成邀请码、复制/导出和核对结果。真实密码登录尚未计为通过；不要使用 CLI 授权验证码作为网站密码，也不要读取浏览器 token。原本机管理员预览仍处于用户输入交接中，观察到登录结果后才能结束该 CUA 交接；需要保留时重新标记 handoff，停止预览前先确保用户不再使用它。

运行与部署命令见 README.md / DEPLOYMENT.md，后台操作见 ADMIN-GUIDE.md，证据范围见 TEST-RESULTS.md。原始审计在被 Git 忽略的 .local/audits，HTTP 与发布报告在 artifacts；不得将网络失败当作权限测试通过，也不得盲目重试可能已提交的核销请求。
