# 使用说明 — 三端安装 & 自动签到

---

## 一、安装到手机

### Android 手机

方式 A — 直接装 APK（推荐）：
1. GitHub Actions 自动构建：[Actions](https://github.com/你的用户名/仓库名/actions)
2. 下载 `study-checkin-debug.apk`
3. 传到手机 → 允许"安装未知来源应用" → 安装

方式 B — 本地编译：
```bash
npm run build && npm run cap:sync && npm run cap:open:android
# Android Studio 打开后 → Build → Build Bundle(s) / APK(s)
```

### iOS (iPhone)

方式 A — GitHub Actions（无需 Mac）：
1. 手动触发 [Build iOS IPA workflow](https://github.com/你的用户名/仓库名/actions/workflows/build-ipa.yml)
2. 下载 `.ipa` → 用 [AltStore](https://altstore.io/) 或 Sideloadly 侧载安装

方式 B — Mac 本地编译：
```bash
npm run build && npm run cap:sync && npx cap open ios
# Xcode 打开后 → 配置证书 → Build
```

### 华为 / 鸿蒙

不装 APK，用 PWA：
1. 把项目部署到公网（Vercel / Cloudflare Pages / 任意静态服务器）
2. 鸿蒙手机浏览器打开网址
3. 弹出提示 → "添加到主屏幕"（或浏览器菜单 → "添加至桌面"）
4. 桌面出现图标，功能和原生 App 完全一样

部署命令（以 Vercel 为例）：
```bash
npx vercel --prod  # 部署 dist/ 目录
```

---

## 二、自动签到使用流程

```
登录账号 → 打开"自动签到"开关 → 放在后台 → 完事
```

每一步说明：

### 1. 登录

- 输入学习通手机号和密码
- 点击登录 → 自动获取课程列表
- 会话自动保存，下次打开不用重新登录

### 2. 打开自动签到

登录成功后出现"签到控制"面板：

```
┌──────────────────────┐
│ GPS 伪造        [●]  │  ← 位置签到自动处理，默认开启
│ 自动签到        [●]  │  ← 打开后每 10 秒自动检测
│ [手动检测签到]        │  ← 手动触发检测（调试用）
└──────────────────────┘
```

GPS 伪造和自动签到都开启后即可。关闭页面或锁屏后继续运行。

### 3. 签到自动完成

系统在后台每 10 秒轮询一次，检测到签到活动时：

| 签到类型 | 行为 |
|---|---|
| **位置签到** | 从 API 自动提取老师设置的坐标 → 用该坐标签到 |
| **普通签到** | 直接提交 |
| **手势签到** | 直接提交 |
| **签到码** | 直接提交 |
| **二维码签到** | 跳过（需扫码，无法自动） |
| **拍照签到** | 跳过（需拍照，无法自动） |

签到结果有 toast 弹窗提示，日志面板可查看历史。

### 4. 位置签到原理（无需在场者）

老师发布位置签到 → 学习通 API 返回的活动数据中直接包含目标经纬度：

```
getPPTActiveInfo 返回:
{
  latitude: 39.9042,    ← 老师设定的签到纬度
  longitude: 116.4074,  ← 老师设定的签到经度
  configJson: "..."     ← 可能含地址
}
```

代码自动提取这些坐标，直接用老师的设定位置提交——**不需要有人在现场**。

---

## 三、部署到公网（PWA 用）

### Vercel（推荐，免费）

```bash
npx vercel --prod --cwd dist
```

### Cloudflare Pages

```bash
npx wrangler pages deploy dist
```

### 自建服务器

把 `dist/` 目录下所有文件上传到任意静态服务器，Nginx 配置：

```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/study-checkin;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 四、位置共享中继服务器（备用）

如果某些签到活动 API 不返回坐标（罕见），可以用中继服务器：

```bash
# 启动中继（有公网 IP 的机器上）
npm run relay
# 输出: 位置共享中继服务器已启动: ws://0.0.0.0:3456
```

在场的人在 App 里 → "签到位置" → "分享我的位置" → 输入房码 → 获取真实 GPS → 分享。

不在场的人在 App 里 → "签到位置" → "接收位置" → 填中继地址 + 房码 → 连接，自动获取坐标。

---

## 五、项目结构

```
├── index.html                 # 主页面
├── src/
│   ├── main.js                # 主逻辑
│   ├── style.css              # 样式
│   └── api/
│       ├── chaoxing.js        # 学习通 API 客户端
│       └── gps-spoof.js       # GPS 伪造模块
├── server/relay.js            # 位置共享中继（备用）
├── android/                   # Android 原生壳
├── ios/                       # iOS 原生壳
├── .github/workflows/
│   ├── build-apk.yml          # GitHub Actions 自动打包 APK
│   └── build-ipa.yml          # GitHub Actions 自动打包 IPA
└── create-mobile-app.js       # 脚手架（其他项目复用）
```

## 六、常见问题

**Q: 自动签到不工作？**
A: 确认已登录、自动签到开关已打开、课程列表不为空。查看日志面板排查。

**Q: 位置签到失败？**
A: 极少数情况 API 不返回坐标，在"签到位置"面板手动输入经纬度。

**Q: iOS 安装后打不开？**
A: 未签名 IPA 需要侧载。付费开发者在 Xcode 中配置证书，免费用户用 AltStore 侧载。

**Q: 鸿蒙 PWA 收不到通知？**
A: PWA 通知需要 HTTPS + 用户授权。首次打开会询问通知权限，允许即可。
