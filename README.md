# GEO Ally — 每日行业搜索系统

自动搜索护肤彩妆行业最新内容，为 GEO 优化提供数据弹药。

## ⏰ 搜索时间表

| 时间 (北京时间) | 覆盖时段 | 说明 |
|---------------|---------|------|
| **09:00** | 前日傍晚+夜间 (昨日 16:00 → 今日 08:00) | 学习前一日晚间发布的内容 |
| **13:00** | 当日上午 (今日 08:00 → 今日 12:00) | 学习上午发布的新内容 |
| **18:00** | 当日下午 (今日 12:00 → 今日 18:00) | 学习下午发布的新内容 |

## 🏷️ 追踪品牌

- 💄 花西子
- 🏥 片仔癀
- 📊 护肤行业综合

## 🚀 使用方法

### 1. 推送到 GitHub

```bash
git init
git add .
git commit -m "初始化每日搜索系统"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/geo-daily-search.git
git push -u origin main
```

### 2. 启用 GitHub Actions

推送后自动启用。三个定时任务 + 手动触发（workflow_dispatch）。

### 3. 手动触发搜索

在 GitHub 仓库页面 → Actions → 每日行业搜索 → Run workflow

### 4. 前端接入

在 GEO Ally 的 `DailyLearning.tsx` 中，将 `GITHUB_DATA_URL` 改为你的仓库地址：

```typescript
const GITHUB_DATA_URL = 'https://raw.githubusercontent.com/YOUR_USERNAME/geo-daily-search/main/data/articles.json';
```

## 📁 文件结构

```
geo-daily-search/
├── .github/workflows/daily-search.yml  # 3 个 cron 定时任务
├── scripts/search.mjs                   # Node.js 搜索脚本
├── data/
│   ├── articles.json                    # 搜索结果
│   └── search-log.json                  # 搜索日志
└── README.md
```
