# 锚点小程序 - Render 独立部署指南

## 📦 部署包位置

```
C:\Users\74112\WorkBuddy\2026-08-26-10-14-59\anchor-fullstack-standalone.zip
```

## 🚀 部署步骤

### 方法一：通过 GitHub + Render（推荐）

#### 1. 上传代码到 GitHub

**方式 A：使用 Git（需要本机可连 GitHub）**

> 注意：当前沙箱环境连不上 GitHub（超时），这条命令需要在你自己的电脑上、
> 或网络通畅时执行。

在你的终端中运行以下命令（将 `YOUR_GITHUB_PAT` 替换为你的 GitHub Personal Access Token）：

```bash
cd C:/Users/74112/WorkBuddy/2026-08-26-10-14-59/anchor-fullstack
git remote set-url origin https://YOUR_USERNAME:YOUR_GITHUB_PAT@github.com/zoeaurora945-techer/anchor-fullstack-standalone.git
git push origin standalone
```

**方式 B：使用 GitHub Desktop（当前环境推荐）**

1. 打开 GitHub Desktop
2. 点击 **File** → **Add Local Repository**
3. 选择 `C:\Users\74112\WorkBuddy\2026-08-26-10-14-59\anchor-fullstack`
4. 点击 **Publish Repository**
5. 命名：`anchor-fullstack-standalone`
6. 选择 Public 或 Private
7. 点击 **Publish**

> 桌面版会自动带上 `.gitignore`、`.env.example` 等隐藏文件，
> 比网页上传更可靠，优先用这个。

**方式 C：手动上传到 GitHub 网站**

1. 访问 https://github.com/new
2. 创建仓库：
   - Name: `anchor-fullstack-standalone`
   - Visibility: Public（免费）或 Private
   - 不要初始化 README
3. 解压 `anchor-fullstack-standalone.zip`
4. 在 GitHub 页面点击 "Upload files"
5. 将所有文件拖入上传
6. 点击 "Commit changes"

#### 2. 注册 Render 账户
- 访问 https://render.com
- 使用 GitHub 账户一键登录（推荐）
- 或使用邮箱注册

#### 3. 创建 Web Service
1. 登录 Render Dashboard
2. 点击 "**New +**" → "**Public Web Service**"
3. 选择仓库 `anchor-fullstack-standalone`
4. 配置服务：

**基本设置**
| 字段 | 值 |
|------|-----|
| Name | `anchor-fullstack` |
| Environment | Node |
| Region | Oregon（美国西部） |
| Branch | `standalone`（手动上传时通常是 `main`） |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Instance Type | **Free**（必须选 Free，Starter 是 $7/月的付费档） |

> 免费档只有 512 MB 内存、0.1 CPU，构建会慢一些（约 5–8 分钟），属正常。

**环境变量**（Environment Variables）
```
NODE_ENV=production
PORT=10000
DATABASE_URL=          ← 先留空，第 4 步建好数据库后回来填
JWT_SECRET=            ← 用下面生成的这串
STORAGE_DIR=/opt/render/prod/uploads
OWNER_EMAIL=你的邮箱@domain.com
```

已为你生成好的 `JWT_SECRET`（直接复制）：
```
d0c6c5c58257fc673a840d5703684e2a2f32b5433ebe460dd51db5ad4dd2abc227499096e5ccc1924f7cac0eaee881425a4a55533439aead223610279c91546b
```

可选：
```
OPENAI_API_KEY=sk-...  # 如需 AI 功能，不填则用本地规则解析，不影响主功能
```

#### 4. 创建 MySQL 数据库
1. 在 Render Dashboard 点击 "**New +**" → "**Internal Database**"
2. 选择 **MySQL**
3. 名称：`anchor-db`
4. Instance Type 同样选 **Free**
5. 点击 "**Create Database**"
6. 获取连接字符串（Connection String），格式类似：
   ```
   mysql://u:password@host:port/anchor-db
   ```
7. 将这个连接字符串填入 Web Service 的 `DATABASE_URL` 环境变量

> ⚠️ **重要**：Render 的免费数据库**有效期 30 天**，到期会被删除、数据清空。
> 到期前需要升级到付费档（$7/月）或换外部数据库。
> 如果你的数据珍贵，建议直接用外部免费 MySQL（如 PlanetScale、Aiven、TiDB Cloud），
> 把它们的连接串填进 `DATABASE_URL` 即可，代码不用改。

#### 5. 添加持久化磁盘
在 Web Service 设置中：
- 找到 "**Disks**" 部分
- 点击 "Add Disk"
- Name: `uploads`
- Mount Path: `/opt/render/prod/uploads`
- Size: `1` GB

> 免费档也可以挂载磁盘，上传的语音/附件会存在这里。
> 注意：免费 Web Service 休眠后磁盘内容仍在，但重新部署不会清空。

#### 6. 部署
1. 回到 Web Service 创建页面
2. 点击 "**Create Web Service**"
3. 等待部署完成（免费档约 5–8 分钟）
4. 部署成功后，访问：`https://anchor-fullstack.onrender.com`

#### 7. 首次部署后：确认数据库表已建好
构建脚本会尝试自动建表，但**失败也不会中断部署**。
所以打开网页后如果登录/注册报错，去手动建一次表：

1. Render Dashboard → 进入 `anchor-fullstack` 服务
2. 左侧点 **Shell** 标签
3. 执行：
   ```bash
   npm run db:push
   ```
4. 看到提示后输入确认（或直接回车），等待建表完成
5. 回到网页刷新，注册账号即可使用

---

### 方法二：本地测试（部署前验证）

#### 1. 解压部署包
```bash
cd C:/Users/74112/WorkBuddy/2026-08-26-10-14-59
unzip anchor-fullstack-standalone.zip -d anchor-fullstack-standalone
```

#### 2. 安装依赖
```bash
cd anchor-fullstack-standalone
npm install
```

#### 3. 配置本地 MySQL 数据库

你需要在本地安装 MySQL 并创建数据库：

```sql
CREATE DATABASE anchor_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'anchor'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON anchor_app.* TO 'anchor'@'localhost';
FLUSH PRIVILEGES;
```

或者使用 Docker：
```bash
docker run --name mysql-anchor -e MYSQL_ROOT_PASSWORD=your_password -e MYSQL_DATABASE=anchor_app -p 3306:3306 -d mysql:8.0
```

#### 4. 配置环境变量
复制并修改 `.env` 文件：
```bash
cp .env.example .env
```

编辑 `.env`：
```env
DATABASE_URL=mysql://anchor:your_password@localhost:3306/anchor_app
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
STORAGE_DIR=./uploads
OWNER_EMAIL=你的邮箱@domain.com
```

#### 5. 初始化数据库
```bash
npm run db:push
```

#### 6. 启动开发服务器
```bash
npm run dev
```

访问 http://localhost:3000

#### 7. 构建并启动生产版本
```bash
npm run build
npm start
```

访问 http://localhost:3000

---

## 🔧 环境变量说明

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `DATABASE_URL` | ✅ | MySQL 连接字符串 |
| `JWT_SECRET` | ✅ | JWT 密钥（建议用随机生成） |
| `STORAGE_DIR` | ✅ | 文件上传目录 |
| `OWNER_EMAIL` | ✅ | 第一个注册用户将成为管理员 |
| `OPENAI_API_KEY` | ❌ | 可选，用于 AI 功能 |
| `OPENAI_BASE_URL` | ❌ | 可选，自定义 API 端点 |

### 生成 JWT_SECRET
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## 📊 Render 免费版限制

| 资源 | 限制 |
|------|------|
| Web Service | 750 小时/月（全天候运行） |
| MySQL Database | 1 个，5GB 存储 |
| Disk | 1GB |
| 休眠 | 15 分钟无访问后休眠，首次访问需等待 30 秒冷启动 |

---

## 🐛 常见问题

### 1. 部署失败：DATABASE_URL 错误
- 检查 MySQL 数据库是否创建成功
- 确认连接字符串格式正确
- 检查 `npm run db:push` 是否执行成功

### 2. 登录 404
- 确认 `OWNER_EMAIL` 已设置
- 首次访问应用，点击"登录/注册"
- 使用 `OWNER_EMAIL` 对应的邮箱注册

### 3. AI 功能不可用
- 添加 `OPENAI_API_KEY` 环境变量
- 或访问 https://platform.openai.com/api-keys 获取密钥

### 4. 文件上传失败
- 确认磁盘已正确挂载到 `/opt/render/prod/uploads`
- 检查磁盘大小是否足够

### 5. Render 需要绑卡但我不想花钱
Render 免费版创建 Web Service 时需要绑卡，但你可以：
1. 使用 GitHub 账户登录（避免邮箱验证）
2. 首次绑卡时 Render 会进行 $1 临时授权验证，不会实际扣款
3. 如果你不想绑卡，可以考虑 Railway（完全免费，不需要绑卡）

---

## 📝 后续维护

### 更新代码
```bash
cd C:/Users/74112/WorkBuddy/2026-08-26-10-14-59/anchor-fullstack
git add .
git commit -m "Update description"
git push origin standalone
```
Render 会自动检测 GitHub 变更并重新部署。

### 查看日志
在 Render Dashboard 的 Web Service 页面，点击 "**Logs**" 标签查看实时日志。

---

## 🎯 部署完成后的操作

1. 访问 https://anchor-fullstack.onrender.com
2. 点击 "登录/注册"
3. 使用 `OWNER_EMAIL` 对应的邮箱注册（将成为管理员）
4. 开始使用四象限、周视图、蓝图、星系等功能

---

## 🚂 Railway 免卡部署（实测可用）

### 1. 从 GitHub 部署
- railway.com 用 GitHub 登录 → New Project → Deploy from GitHub repo → 选 `anchor-fullstack-standalone`
- 仓库已含 `railway.json`，自动 `npm install` → `npm run build` → `npm start`

### 2. 必须加 MySQL 数据库（否则注册报 "database unavailable"）
- 在 Project 里点 **New → Database → MySQL**
- 创建后 Railway 会自动把连接串注入 Web 服务，变量名是 **`MYSQL_URL`**（不是 `DATABASE_URL`）
- 代码已同时兼容 `DATABASE_URL` 与 `MYSQL_URL`，注入任意一个都能连上

### 3. 设置环境变量（Variables 标签）
- `OWNER_EMAIL` = 你的邮箱（注册即管理员，必填）
- `JWT_SECRET` = 点 Generate 随机生成（必填）
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` = 可选，接任意 OpenAI 兼容接口（如 agnes）
- `STORAGE_DIR` = 可选，不填则上传文件重启后丢失（非核心）

### 4. 建表（关键一步）
- 每次新建数据库或更换连接串后，都要进 Web 服务 **Shell** 执行：
  ```bash
  npm run db:push
  ```
- 等输出 "Changes applied" 后再去注册，否则报 "表不存在"

### 5. 端口与域名
- Railway 默认注入 `PORT=8080`，应用在 Networking 里 Generate Domain 时填 **8080**
- 生成域名形如 `xxx.up.railway.app`

### 常见坑
- **注册报 "database unavailable / 云端数据服务暂不可用"** → `MYSQL_URL`/`DATABASE_URL` 为空。确认 MySQL 数据库已加到同一 Project，且已 Redeploy 让变量注入生效。
- **注册报 "表不存在"** → 没跑 `npm run db:push`，去 Shell 跑一次。
- **30 天 Trial 后**需升 Hobby $5/月（需卡）；想要永久免卡可改造成 Cloudflare Workers+D1+R2。

