# 学习通签到 — 移动端自动化签到 App

一份代码同时覆盖 **Android** (APK)、**iOS** (IPA)、**华为/鸿蒙** (PWA)。

基于 Capacitor + Vite 构建，内置学习通 API 客户端和位置签到自动完成。

## 技术栈

- **Capacitor.js** — Web → Android/iOS 原生壳
- **Vite** — 开发和打包
- **GitHub Actions** — CI/CD 自动构建 APK/IPA
- **WebView Geolocation 覆写** — GPS 伪造
- **WebSocket 中继** — 位置共享（备用）

## 项目结构

```
├── index.html              # 主页面
├── capacitor.config.ts     # Capacitor 配置 (Android + iOS)
├── vite.config.ts          # Vite 配置
├── src/
│   ├── main.js             # 主逻辑
│   ├── style.css           # 样式
│   └── api/
│       ├── chaoxing.js     # 学习通 API 客户端
│       └── gps-spoof.js    # WebView GPS 伪造
├── server/relay.js         # 位置共享中继（备用）
├── android/                # Android 原生壳
├── ios/                    # iOS 原生壳
├── .github/workflows/
│   ├── build-apk.yml       # 自动构建 APK
│   └── build-ipa.yml       # 自动构建 IPA
├── USAGE.md                # 完整使用说明
└── create-mobile-app.js    # 脚手架（跨项目复用）
```

## 平台支持

| 平台 | 产物 | 构建 |
|---|---|---|
| Android | APK | Windows/Mac 本地或 GitHub Actions |
| iOS | IPA | Mac 本地或 GitHub Actions (macOS runner) |
| 华为鸿蒙 | PWA | 部署到公网，浏览器添加到桌面 |
│       ├── chaoxing.js     # 学习通 API 客户端
│       └── gps-spoof.js    # WebView GPS 伪造模块
├── server/
│   └── relay.js            # 位置共享 WebSocket 中继服务器
├── android/                # Android 原生壳 (Capacitor 生成)
│   └── app/src/main/java/com/studycheckin/app/
│       ├── MainActivity.java         # WebView + JS Bridge
│       └── MockLocationHelper.java   # Android Mock Location 备用
├── public/
│   ├── manifest.json       # PWA 清单
│   └── sw.js               # Service Worker
└── create-mobile-app.js    # 脚手架脚本 (可复用到其他项目)
```

## 常用命令

```bash
npm run dev               # 启动开发服务器 (localhost:5173)
npm run build             # 构建生产版本
npm run cap:sync          # 同步 Web 产物到 Android 壳
npm run cap:open:android  # 用 Android Studio 打开
npm run relay             # 启动位置共享中继服务器 (ws://0.0.0.0:3456)
```

## 位置签到核心原理

**无需在场者。** 老师发布位置签到后，API 返回的 `ActivityDetail` 中直接包含目标坐标：

- `detail.latitude` — 老师设置的签到纬度
- `detail.longitude` — 老师设置的签到经度
- `detail.configJson` — 可能含地址描述 (locationText/address/name)

`getPPTActiveInfo` 调用后自动调用 `extractLocation()` 提取坐标，签到检测时直接使用。

### 自动签到流程

1. 登录 → 10s 间隔轮询 `activelist` API
2. 发现签到活动 → 调用 `getPPTActiveInfo` → 自动提取 `_targetLocation`
3. 判定 `otherId`：位置(4)直接用提取的坐标；普通(0)/手势(3)直接提交
4. 执行 `preSign` → `analysis` → `analysis2` → `stuSignajax` 完成签到

### 手动/共享模式 (备用)

位置共享中继 (`server/relay.js`) 作为备用，仅在 API 未返回坐标时使用。

## 学习通 API 关键端点

- 登录: `passport2.chaoxing.com/fanyalogin` (POST)
- 课程: `mooc1-1.chaoxing.com/visit/courselistdata` (POST)
- 活跃签到: `mobilelearn.chaoxing.com/v2/apis/active/student/activelist` (GET)
- 预签到: `mobilelearn.chaoxing.com/newsign/preSign` (GET)
- 提交签到: `mobilelearn.chaoxing.com/pptSign/stuSignajax` (GET)

签到类型: otherId=0(普通/拍照), 2(二维码), 3(手势), 4(位置), 5(签到码)

## 跨项目复用

脚手架脚本可在任意目录创建新项目:
```bash
node D:/学习通签到/create-mobile-app.js my-app --name "应用名" --id com.example.app
```

## 打包 APK 前置条件

- JDK 17+
- Android Studio (含 Android SDK)
- 设置 ANDROID_HOME 环境变量
