# Deploy to Render

## 1. 推送代码到 GitHub

```bash
cd C:/Users/74112/WorkBuddy/2026-08-26-10-14-59/anchor-fullstack
git push origin standalone
```

如果 git push 失败，使用 GitHub 网站手动上传：
1. 访问 https://github.com/new
2. 创建仓库 `anchor-fullstack-standalone`
3. 上传代码（或使用 git clone 后 push）

## 2. 创建 Render 账户

访问 https://render.com 注册账户（免费）

## 3. 连接 GitHub 仓库

1. 登录 Render Dashboard
2. 点击 "New +" → "Public Web Service"
3. 选择仓库 `anchor-fullstack-standalone`
4. 配置部署设置：

### 基本配置
- **Name**: `anchor-fullstack`
- **Environment**: Node
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Instance Type**: Starter (免费)

### 环境变量
```
NODE_ENV=production
PORT=10000
DATABASE_URL=mysql://user:pass@hostname:3306/dbname
JWT_SECRET=<生成随机密钥>
OPENAI_API_KEY=sk-... (可选)
STORAGE_DIR=/opt/render/prod/uploads
OWNER_EMAIL=your@email.com
```

### 数据库
Render 提供免费 MySQL 数据库：
1. 点击 "New +" → "Internal Database"
2. 选择 MySQL
3. 获取连接字符串，填入 `DATABASE_URL`

### 磁盘
- 添加 1GB 磁盘挂载到 `/opt/render/prod/uploads`

## 4. 部署

点击 "Create Web Service"，等待部署完成。

## 5. 访问应用

部署成功后，访问 `https://anchor-fullstack.onrender.com`

首次访问时，点击 "登录/注册" 按钮创建管理员账号。
