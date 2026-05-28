#!/usr/bin/env node
/**
 * 移动端项目脚手架 — 在任何目录下运行，快速搭建 Capacitor + Vite 移动端项目。
 *
 * 用法:
 *   node D:/学习通签到/create-mobile-app.js my-app
 *   node D:/学习通签到/create-mobile-app.js my-app --name "我的应用" --id com.example.app
 *
 * 生成后 cd my-app && npm run dev 即可在浏览器预览，PWA 可安装到手机。
 * 安装 Android Studio 后运行 npm run cap:add:android 即可打包 APK。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log('用法: node create-mobile-app.js <目录名> [--name "应用名"] [--id com.example.app]');
  process.exit(0);
}

const targetDir = path.resolve(args[0]);
const appName = args.includes('--name') ? args[args.indexOf('--name') + 1] : path.basename(targetDir);
const appId = args.includes('--id') ? args[args.indexOf('--id') + 1] : `com.mobile.${path.basename(targetDir).replace(/[^a-z0-9]/g, '')}`;

console.log(`\n创建移动端项目: ${targetDir}`);
console.log(`  应用名: ${appName}`);
console.log(`  App ID: ${appId}\n`);

// 创建目录结构
const dirs = ['src', 'public'];
fs.mkdirSync(targetDir, { recursive: true });
dirs.forEach((d) => fs.mkdirSync(path.join(targetDir, d), { recursive: true }));

// --- package.json ---
const pkg = {
  name: appId.split('.').pop(),
  version: '1.0.0',
  private: true,
  type: 'module',
  scripts: {
    dev: 'vite',
    build: 'vite build',
    preview: 'vite preview',
    'cap:sync': 'npx cap sync',
    'cap:add:android': 'npx cap add android',
    'cap:add:ios': 'npx cap add ios',
    'cap:open:android': 'npx cap open android',
    'cap:open:ios': 'npx cap open ios',
    'cap:copy': 'npx cap copy',
  },
};

// --- capacitor.config.ts ---
const capConfig = `import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: '${appId}',
  appName: '${appName}',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
    },
  },
};

export default config;
`;

// --- vite.config.ts ---
const viteConfig = `import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
`;

// --- index.html ---
const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no" />
  <meta name="theme-color" content="#4A90D9" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <link rel="manifest" href="/manifest.json" />
  <title>${appName}</title>
  <link rel="stylesheet" href="/src/style.css" />
</head>
<body>
  <div id="app">
    <header class="app-header">
      <h1>${appName}</h1>
    </header>
    <main class="app-main">
      <section class="card">
        <p>移动端应用已就绪</p>
      </section>
    </main>
  </div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
`;

// --- src/main.js ---
const mainJs = `import './style.css';

document.getElementById('app').addEventListener('click', () => {
  console.log('App ready');
});

// PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
`;

// --- src/style.css ---
const styleCss = `*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --color-primary: #4A90D9;
  --color-bg: #f5f6fa;
  --color-card: #ffffff;
  --color-text: #2c3e50;
  --color-text-light: #7f8c8d;
  --radius: 12px;
  --shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

html, body {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 16px;
  color: var(--color-text);
  background: var(--color-bg);
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
}

#app {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 16px;
}

.app-header {
  text-align: center;
  padding: 32px 16px 16px;
}

.app-header h1 {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-primary);
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card {
  background: var(--color-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 20px;
}
`;

// --- public/manifest.json ---
const manifest = JSON.stringify(
  {
    name: appName,
    short_name: appName,
    description: '移动端应用',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f6fa',
    theme_color: '#4A90D9',
    icons: [],
  },
  null,
  2
);

// --- public/sw.js ---
const swJs = `const CACHE_NAME = '${appId}-v1';
const ASSETS = ['/', '/index.html', '/src/main.js', '/src/style.css', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
`;

// --- .gitignore ---
const gitignore = `node_modules/
dist/
android/
ios/
.cache/
*.log
.DS_Store
Thumbs.db
`;

// 写入所有文件
const files = {
  'package.json': JSON.stringify(pkg, null, 2),
  'capacitor.config.ts': capConfig,
  'vite.config.ts': viteConfig,
  'index.html': indexHtml,
  'src/main.js': mainJs,
  'src/style.css': styleCss,
  'public/manifest.json': manifest,
  'public/sw.js': swJs,
  '.gitignore': gitignore,
};

Object.entries(files).forEach(([file, content]) => {
  fs.writeFileSync(path.join(targetDir, file), content);
});

// 安装依赖
console.log('安装依赖...');
execSync('npm install @capacitor/core @capacitor/cli @capacitor/android vite typescript', {
  cwd: targetDir,
  stdio: 'inherit',
});

// 添加 Android 平台
console.log('\n添加 Android 平台...');
execSync('npx cap add android', { cwd: targetDir, stdio: 'inherit' });

console.log(`
✅ 项目创建完成!

进入项目:
  cd ${path.basename(targetDir)}

启动开发服务器:
  npm run dev

构建生产版本:
  npm run build && npm run cap:sync

打包 APK (需要 Android Studio):
  npm run build && npm run cap:sync && npm run cap:open:android
  然后在 Android Studio 中 Build > Build Bundle(s) / APK(s)
`);
