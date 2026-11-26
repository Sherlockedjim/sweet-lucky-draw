# 交付与接续状态（2026-11-25）

用户已明确批准“应用生产迁移并继续部署”。迁移已应用并读回核验，GitHub Pages 已成功发布；无需重复申请批准或重新执行迁移。

- 源码：https://github.com/Sherlockedjim/sweet-lucky-draw
- 用户页：https://sherlockedjim.github.io/sweet-lucky-draw/
- 管理员：https://sherlockedjim.github.io/sweet-lucky-draw/#/admin
- 现有 Supabase 项目：turzcmepfvzwxiraopbd。

两个公开构建变量和 Pages 工作流已配置；源码 main 已推送。首次发布在 Pages 启用前失败，启用后重试成功。首页及 JS/CSS 实际返回 200，正式用户页与管理员登录页已在浏览器打开。后续推送 main 会自动验证并发布。

本地 60 项测试通过，其中 10 项覆盖邮箱找回密码。真实公共 HTTP 覆盖正确/格式错误/不存在/重复/恢复/并发、匿名管理接口和直接表访问。两张测试码各仅一条记录且 used。普通 authenticated 角色/JWT claims 在真实只读事务中被全部管理接口拒绝。真实管理员 claims 的 1/500 批量与唯一性、非法数量测试通过并回滚。

保留原有 1 位管理员，以及联调产生的 2 个测试邀请码和 2 条记录。没有删除用户数据或读取管理员密码。完整测试码只保存在本机被 Git 忽略的 .local/live-test-invites.json，不能提交或公开。

已增加 `#/admin/reset-password` 找回页面，以及邮件链接回调与新密码表单；只更新 Auth Site URL 和精确 recovery 回调。账号所有者已确认“已重置密码并登录”，代理实际观察到真实后台和成功生成 2 个邀请码的窗口。原账号与管理员权限保留，代理未读取或代填新密码。

真实 UI 已验收：邀请码复制出现成功提示；CSV 下载文件有 2 个完整未使用码且与页面一致；完整邀请码查回已保存的奶茶奖品并定位到同一记录；刷新后仍已登录，显示 4 个邀请码（2 未使用、2 已使用）、2 条中奖记录。新增的 2 个码由管理员自行生成，代理没有重复生成或核销它们。完整未使用码已导出到用户本机 CSV，不提交仓库。

正式后台 CUA 验收已结束并提交 completion_summary，后台标签页保留为交付。原本机 Vite 预览已停止。无需再要求用户重置密码或重复登录。两个独立 HTTP 客户端的并发测试已完成；两台物理设备人工测试和普通账号的实际密码登录未执行，证据范围见 TEST-RESULTS.md。

运行与部署命令见 README.md / DEPLOYMENT.md，后台操作见 ADMIN-GUIDE.md，证据范围见 TEST-RESULTS.md。原始审计在被 Git 忽略的 .local/audits，HTTP 与发布报告在 artifacts；不得将网络失败当作权限测试通过，也不得盲目重试可能已提交的核销请求。

## 2026-11-26 六礼盒更新

六个礼盒包含蛋糕、奶茶、小吃各一份和三份“送你一天的开心～”。新增量迁移为 20261126023841_six_boxes_with_happy_messages.sql，先发布前端兼容支持，再在原项目激活此迁移。69 项本地测试通过，电脑 3×2、手机 2×3 布局已实际检查。生产迁移应用及只读/回滚验证以 artifacts/six-boxes-validation.json 为准；仅渲染出六格不能证明后台概率已切换。
