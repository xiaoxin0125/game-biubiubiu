import { defineConfig } from 'drizzle-kit'

function mysqlCredentials() {
  const url = new URL(process.env.DATABASE_URL || 'mysql://games:games@127.0.0.1:3306/games_online')
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username || 'games'),
    password: decodeURIComponent(url.password || 'games'),
    database: decodeURIComponent(url.pathname.replace(/^\//, '') || 'games_online'),
  }
}

export default defineConfig({
  dialect: 'mysql',
  schema: './server/db/schema.js',
  out: './server/db/migrations',
  dbCredentials: mysqlCredentials(),
  casing: 'snake_case',
})
