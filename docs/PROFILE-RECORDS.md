# 昵称头像与中奖记录（2026-11-26）

用户要求后台记录所有参与者的昵称与头像。审计时现有数据库为 1 位管理员、15 个邀请码、9 条中奖记录；`draw_records` 原先只有 ID、邀请码关联、奖品和时间，历史昵称头像从未发送到服务器，不能自动补齐。

## 增量迁移

文件：`supabase/migrations/20261126064040_persist_participant_profiles.sql`，由官方 CLI 创建。保留所有记录及管理员，增加两个可空字段用于历史兼容：`participant_nickname` 和 `participant_avatar`。头像由浏览器裁剪为 256×256 JPEG，受 120000 字节上限、格式、Base64 和 JPEG 首尾标记校验，直接与回执存储，不建立公共图片桶。

新 `redeem_and_draw(p_code,p_nickname,p_avatar)` 在一次事务中验证资料、锁定邀请码、写入资料和奖品并核销。缺少资料的旧客户端收到 `PROFILE_REQUIRED`，不会消耗邀请码。旧的一参数实现移入 `sweet_legacy.redeem_without_profile` 并撤销 API 执行权限；公共入口只有三参数实现，避免函数重载歧义和绕过必填。

`get_draw_result(p_code)` 返回同一回执及资料，持原码可跨设备找回。`admin_list_draws()` 仍先通过 `auth.uid()` 验证 `admin_users`，再返回含资料的名单。匿名及普通用户无法列出名单或直接读写资料列。图片与昵称是手动展示信息，不证明微信身份。

## 历史补充

`save_draw_profile(p_code,p_nickname,p_avatar)` 只允许持有原邀请码的人为已存在、资料为空的记录补填。邀请码及记录均锁行，重复请求返回已保存资料，不覆盖、不重新抽奖、不改变奖品、编号或时间。旧浏览器缓存只用于预填表单，必须点击“补充到中奖记录”才上传。

后台缺失项标注“历史未记录”。新记录的资料固定为抽奖时快照，结果页不提供本机改名或清空来制造与后台不一致的显示。CSV 包含昵称与头像保存状态，不嵌入图片数据。

## 发布和回退

先通过本地数据库与界面测试、构建和凭据扫描，再在已有项目应用这一个增量迁移并发布新前端。发布期间已打开的旧页面需要刷新才能提交新参数。不要重新初始化项目、重新执行旧迁移或恢复旧的一参数公共入口。

迁移使用 5 秒锁等待上限；锁超时会整体回滚，不可把执行请求发出当作成功。应用后读回权限与函数，执行带 ROLLBACK 的实际角色/事务验收，确认未留下测试资料。需要回退前端时仍保留资料字段及其数据，保持服务端必填保护；不可通过删除资料列回退。

验收包含独立 PostgreSQL 测试及真实数据库回滚测试；PGlite 是单连接环境，不冒充两个设备的并发操作。原公开 RPC 的邀请码行锁与一条记录唯一约束继续保留。

参考：[函数权限](https://supabase.com/docs/guides/database/functions#function-privileges)、[Data API 安全](https://supabase.com/docs/guides/api/securing-your-api)。
