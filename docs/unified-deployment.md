# 鸦钟夜话统一账号部署

核对日期：2026-10-16。状态：配置中。生产入口为 `https://clocktower.fribench.cn`，回环端口 23005，独立 Compose 项目 `fribench-ravens-night`。工作台不参与本服务部署。

## 账号与公开游玩

公开教程、角色图鉴、邀请和游客对局不要求登录。统一账号自动识别；账号创建或加入的座位归属当前身份，同账号可恢复该座位。登录不授予他人座位、房主或大屏权限，公开投影不包含内部账号 ID、凭证或隐藏角色。退出登录或切换账号后旧浏览器视图和请求上下文重建，本地房间提示按账号隔离。

游客旧座位不会自动绑定。首页预览当前浏览器的游客房间，确认前不扣次数；每个账号在本服务只能成功认领一次。账号已有房间时拒绝覆盖，预览签名绑定当前账号和房间版本；同一确认重试幂等。认领事实和房间快照在同一个 PostgreSQL 事务提交，房间以后过期不恢复认领机会。

服务器持久化使用独立 PostgreSQL 数据库/角色；私密房间快照继续 AES-GCM 加密，不改变角色、规则和私聊投影。数据库单写锁、提交后广播、失败回滚保持。原独立演示 PostgreSQL 容器和卷不删除，也不自动迁移旧账号；新的平台数据库不对公网映射。

## 发布

固定并推送业务提交后，私有运维仓库登记客户端、回调及路由，执行 `configure-business-apps.py --apps ravens-night`。现有根保护文件 `/etc/fribench/apps/ravens-night/app.env` 中原签名/加密密钥保留；只替换经明确识别的旧演示数据库引用，并清空旧全站访问口令。配置文件不得进入 Git 或命令输出。

使用本仓库根目录 `compose.yaml`；`RAVENS_VERSION` 必须设置为已推送的完整提交。执行配置检查、构建并只更新 app 服务，验收 `/healthz`、`/_fribench/auth/config`、`/_fribench/auth/session`、匿名主页和账号房间 API。Nginx 保留原 WebSocket 转发并加入同源账号路由。

备份使用平台 PostgreSQL 逻辑备份；还需保护原 `DATA_ENCRYPTION_KEY` 和 `SESSION_SECRET`。旧镜像按用户要求不作为恢复方案，必要时从已推送的精确提交重新构建，不清理任何数据库卷。原部署手册描述的 4317、自带 postgres Compose 和访问口令是本地独立部署模式，不是当前 Fribench 正式部署规范。

## 验证

`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm audit`。设置指向隔离测试 PostgreSQL 的 `TEST_DATABASE_URL` 可运行账号事务、冲突回滚、加密恢复和认领持久化测试；测试创建并删除自己的随机 schema，禁止使用业务数据库。原仓库的 `RAVENS_TEST_DATABASE_URL` 测试会终止测试数据库中的写锁连接，只能在独立空数据库运行。
