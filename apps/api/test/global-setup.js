/* Applies migrations + category seed to the integration test database before the suite runs. */
const { execSync } = require('child_process');
const path = require('path');

module.exports = async () => {
  const url = process.env.TEST_DATABASE_URL || 'postgresql://postgres@localhost:5433/mam_itest?schema=public';
  const cwd = path.resolve(__dirname, '..');
  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: 'test' };
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'pipe' });
  execSync('npx ts-node --transpile-only prisma/seed.ts', { cwd, env, stdio: 'pipe' });
};
