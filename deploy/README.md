# 鸦钟夜话部署说明

Fribench正式环境以[统一部署记录](../docs/unified-deployment.md)为准。现正式协议7/快照5，新局使用演出时序v4；新提名采用20秒辩护兜底与最后8秒统一截止，旧在途票完成原逐席流程，旧客户端需刷新。已使用统一截止或先入夜再确认身份的房间带持久规则标记，代码恢复须兼容这些标记及演出时序，不能直接恢复旧程序；优先前向修复，不回档数据库覆盖对局。创建回执、人机及已有快照继续保留。下述4317与独立数据库说明仅适用于原独立部署模式。

推荐子域名为 `clocktower.<主域名>`，宿主机只向本机开放应用端口 `4317`，公网流量统一由现有 Nginx 接入。

## 环境变量

复制根目录 `.env.example` 为 `deploy/.env`，至少替换以下值：

- `APP_DOMAIN`：最终子域名。
- `ACCESS_PASSWORD`：朋友进入站点时使用的访问口令。
- `POSTGRES_PASSWORD`：数据库随机长密码。
- `SESSION_SECRET`：至少 32 字节随机值。
- `DATA_ENCRYPTION_KEY`：32 字节随机值的 Base64 编码。

不要提交 `deploy/.env`。应用房间状态会持久化在 Compose 的 `postgres-data` 卷中，应用容器重启后自动恢复。

## 启动与验证

```bash
cd /srv/ravens-night/deploy
docker compose --env-file .env up -d --build
docker compose ps
curl --fail http://127.0.0.1:4317/healthz
```

## Nginx

根据宿主机约定把 `nginx.clocktower.conf` 中的 `__APP_DOMAIN__` 与 `__APP_PORT__` 替换为实际值。检查配置后再加载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

TLS 应沿用服务器现有证书工具和目录约定；若服务器使用 Certbot，可在 HTTP 配置生效且 DNS 已解析后执行：

```bash
sudo certbot --nginx -d clocktower.example.com
```

## 更新与回滚

```bash
git pull --ff-only
cd deploy
docker compose --env-file .env up -d --build
docker compose ps
```

数据库卷不会随应用镜像更新而删除。回滚时切换到上一个 Git 提交并重新构建；不要运行 `docker compose down -v`。
