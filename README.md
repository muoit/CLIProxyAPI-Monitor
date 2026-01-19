# CLIProxyAPI 数据看板

Next.js App Router + React 19 + Drizzle ORM + PostgreSQL 的实时数据看板，用于拉取上游 CLIProxyAPI 使用数据、持久化到数据库，并进行交互式数据可视化。

## 核心功能

- **仪表盘** - 使用趋势、费用估算、模型成本分解
- **数据探索** - 多模型分析，支持缩放和过滤
- **日志查看器** - 应用日志和错误日志浏览
- **自动同步** - 定时拉取上游数据，去重入库
- **价格配置** - 动态配置模型单价用于成本计算
- **密码保护** - 基于 SHA-256 的会话认证

## 快速开始

### 本地开发

```bash
# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env

# 启动数据库（Docker）
docker-compose up -d

# 初始化数据库
pnpm run db:push

# 启动开发服务器
pnpm dev
```

访问 http://localhost:3000

### 部署到 Vercel

1. Fork 本仓库并在 Vercel 创建项目
2. 配置环境变量：
   - `CLIPROXY_SECRET_KEY` - CLIProxyAPI API 密钥
   - `CLIPROXY_API_BASE_URL` - CLIProxyAPI 服务地址
   - `DATABASE_URL` - PostgreSQL 连接串（支持 Vercel Postgres）
   - `PASSWORD` - 仪表盘登录密码（可选，默认使用 CLIPROXY_SECRET_KEY）
   - `CRON_SECRET` - Cron 认证令牌（16+ 字符）

3. 部署完成后，Vercel Cron 自动每日同步数据

完整部署指南见 [Deployment Guide](./docs/deployment-guide.md)

## 文档

| 文档 | 内容 |
|------|------|
| [项目概览 & PDR](./docs/project-overview-pdr.md) | 功能需求、约束条件、成功指标 |
| [系统架构](./docs/system-architecture.md) | 系统设计、数据流、性能优化 |
| [代码标准](./docs/code-standards.md) | TypeScript 约定、模式、最佳实践 |
| [代码库总结](./docs/codebase-summary.md) | 目录结构、模块描述、API 参考 |
| [部署指南](./docs/deployment-guide.md) | 本地开发、Vercel 部署、故障排查 |

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19, Next.js 16 App Router, TailwindCSS 4 |
| 可视化 | Recharts (Line, Bar, Pie, Area, Scatter charts) |
| 后端 | Next.js API routes, TypeScript, Zod validation |
| 数据库 | PostgreSQL 16, Drizzle ORM 0.45.1 |
| 部署 | Vercel (Cron jobs), Docker (local) |
| 认证 | SHA-256 password hashing, HttpOnly cookies |

## 环境变量

参考 `.env.example` 配置以下变量：

```env
# CLIProxyAPI 上游服务
CLIPROXY_SECRET_KEY=your-api-key
CLIPROXY_API_BASE_URL=https://your-clipproxy.com/

# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/cliproxy

# 安全
PASSWORD=your-secure-password
CRON_SECRET=your-cron-secret-16-chars-or-longer
```

## 预览

仪表盘 | 数据探索
---|---
![Dashboard](https://github.com/user-attachments/assets/939424fb-1caa-4e80-a9a8-921d1770eb9f) | ![Explore](https://github.com/user-attachments/assets/e5338679-7408-4f37-9753-41b559a3cee6)

## 开发命令

```bash
# 开发服务器
pnpm dev

# 生产构建
pnpm build

# 生产启动
pnpm start

# 代码检查
pnpm lint

# 数据库操作
pnpm run db:generate  # 生成迁移
pnpm run db:push      # 应用迁移
```

## 架构特点

- **类型安全** - TypeScript + Zod 运行时验证
- **高性能** - 30 秒 TTL 缓存，9 并行查询，LRU 驱逐
- **安全认证** - 基于 IP 的速率限制，指数退避锁定
- **可扩展** - 无状态 API，支持水平扩展
- **国际化** - 简体中文 UI，亚洲/上海时区

## 常见问题

**Q: 支持哪些数据库？**
A: 目前仅支持 PostgreSQL 16+

**Q: 支持多用户吗？**
A: 当前版本为单密码共享访问，不支持 RBAC

**Q: 如何导出数据？**
A: 可通过数据库直接查询，或在数据库层实现自定义导出

**Q: 性能如何？**
A: 14 天数据的概览 API 响应时间 <500ms，cache hit rate 通常 >70%

## 许可证

MIT

## 相关链接

- [GitHub 仓库](https://github.com/sxjeru/CLIProxyAPI-Monitor)
- [CLIProxyAPI](https://github.com/sxjeru/CLIProxyAPI)
- [Vercel 部署](https://vercel.com)
