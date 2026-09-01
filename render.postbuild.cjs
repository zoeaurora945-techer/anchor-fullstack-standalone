// Render postbuild script - runs database migrations
// 注意：迁移失败不阻断部署，服务仍会启动。
// 若首次部署后表未创建，可在 Render Dashboard 的 Shell 中手动执行 `npm run db:push`。
const { execSync } = require('child_process');

console.log('Running database migrations...');
try {
  execSync('npm run db:push', {
    stdio: 'inherit',
    timeout: 180000,
  });
  console.log('Database migrations completed!');
} catch (error) {
  console.warn('[warn] Migration skipped or failed:', error.message);
  console.warn('[warn] Deploy will continue. Run `npm run db:push` manually in Render Shell if tables are missing.');
}
