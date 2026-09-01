# Anchor Fullstack - Standalone Edition

独立部署版本，已移除所有 Manus 平台依赖。

## 环境要求

- Node.js >= 18
- MySQL 8.0+ 数据库
- (可选) OpenAI API Key（用于 AI 任务提取和语音转录）

## 环境变量

复制 `.env.example` 到 `.env` 并填写：

```bash
cp .env.example .env
```

必要配置：
- `DATABASE_URL`: MySQL 连接字符串
- `JWT_SECRET`: JWT 签名密钥（生成命令：`node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`）
- `OPENAI_API_KEY`: (可选) 启用 AI 功能

## 安装依赖

```bash
npm install
# 或 pnpm install
```

## 数据库迁移

```bash
npm run db:push
```

## 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

## 生产构建

```bash
npm run build
npm start
```

## 登录方式

- 首次访问时，使用邮箱注册账号
- 在 `.env` 中设置 `OWNER_EMAIL`，该邮箱将获得管理员权限

## 功能说明

### 已实现
- 邮箱密码登录/注册
- 任务管理（四象限、甘特图）
- 蓝图视图（目标、项目、关系）
- 星系视图（Three.js 3D）
- 周度复盘
- 预警引擎
- 语音输入（需配置 OpenAI API Key）
- AI 任务提取（需配置 OpenAI API Key）
- 本地文件存储

### 降级处理
- 地图功能：需设置 `VITE_GOOGLE_MAPS_API_KEY` 环境变量
- AI 功能：未配置 OpenAI API Key 时，使用本地规则解析（降级）
- 通知功能：输出到控制台

## 部署选项

推荐平台（均提供免费套餐）：
- **Railway**: https://railway.app - $5/月 hobby plan，含 MySQL
- **Render**: https://render.com - 免费静态托管 + 免费数据库
- **Fly.io**: https://fly.io - 免费额度

## 迁移自 Manus 版本

核心数据模型保持不变，数据库 schema 完全兼容。
旧的 /manus-storage/* 路由自动重定向到 /uploads/*。
