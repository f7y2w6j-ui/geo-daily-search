// ============================================================================
// GEO Ally — 每日搜索脚本
// ============================================================================
// 生成每日行业搜索建议，保存到 data/articles.json
// 用法: node scripts/search.mjs [window] [fromHours]
//
// 重要原则：不生成假文章URL！
// 每个条目都是一个「搜索主题建议」+ 百度搜索链接，用户点击后自行找到原文。
// 与诈骗式的假URL不同，搜索链接是诚实的——它就是搜索，不是假文章。
// ============================================================================

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../data');
const ARTICLES_FILE = resolve(DATA_DIR, 'articles.json');
const LOG_FILE = resolve(DATA_DIR, 'search-log.json');

// ============================================================================
// 品牌追踪配置
// ============================================================================

function loadTrackedBrands() {
  const configPath = resolve(DATA_DIR, 'tracked-brands.json');
  try {
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      const brands = (config.brands || []).map(name => ({
        name,
        keywords: [`${name} 最新动态`, `${name} 新品发布`, `${name} 行业分析`],
        category: '品牌追踪',
        searchedSources: ['知乎', '什么值得买', '头条号', '搜狐号'],
      }));
      const industryTopics = (config.industryTopics || [
        '护肤品 行业趋势 2026', '化妆品 新规 政策', '护肤成分 研究进展',
        '彩妆 新品 评测', '国货护肤 品牌动态', '美妆 市场分析',
      ]).map((topic, i) => ({
        name: `行业综合-${i}`,
        keywords: [topic],
        category: '行业综合',
        searchedSources: ['知乎', '头条号', '搜狐号', '网易号', 'CSDN', '公众号'],
      }));
      return [...brands, ...industryTopics];
    }
  } catch (e) {
    console.log('  ⚠️ 无法读取品牌配置，使用默认行业综合搜索');
  }
  // 默认：行业综合搜索建议
  return [
    { name: '护肤行业', keywords: ['护肤品 行业趋势 2026', '化妆品 新规 政策解读', '护肤成分 最新研究'], category: '行业综合', searchedSources: ['知乎', '头条号', '搜狐号'] },
    { name: '彩妆行业', keywords: ['彩妆 新品 评测 2026', '国货彩妆 品牌动态', '彩妆趋势 成分分析'], category: '行业综合', searchedSources: ['知乎', '什么值得买', '网易号'] },
    { name: '成分研究', keywords: ['护肤成分 功效 研究 2026', '化妆品 原料 创新技术', '热门成分 解析 护肤品'], category: '行业综合', searchedSources: ['知乎', 'CSDN', '什么值得买'] },
    { name: '法规政策', keywords: ['化妆品 法规 新规 2026', '功效宣称 备案 规范', '化妆品 监管 政策 解读'], category: '行业综合', searchedSources: ['搜狐号', '知乎', '头条号'] },
    { name: '市场分析', keywords: ['美妆 市场分析 2026', '护肤品 消费趋势 报告', '化妆品 行业 竞争格局'], category: '行业综合', searchedSources: ['头条号', '知乎', '网易号'] },
  ];
}

const TRACKED_BRANDS = loadTrackedBrands();

// ============================================================================
// 工具函数
// ============================================================================

function uid() {
  return `auto_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function formatDate(date = new Date()) {
  return date.toISOString().split('T')[0];
}

function getTimeWindowLabel(window, fromHours) {
  const now = new Date();
  const from = new Date(now.getTime() - fromHours * 3600000);
  const labels = {
    evening: `🌙 前日傍晚+夜间 (${from.toISOString()} → ${now.toISOString()})`,
    morning: `☀️ 当日上午 (${from.toISOString()} → ${now.toISOString()})`,
    afternoon: `🌤️ 当日下午 (${from.toISOString()} → ${now.toISOString()})`,
    manual: `🔄 手动强制搜索 (${from.toISOString()} → ${now.toISOString()})`,
  };
  return labels[window] || `📰 搜索 (${from.toISOString()} → ${now.toISOString()})`;
}

// ============================================================================
// 搜索主题生成器
// ============================================================================
// 诚实原则：不生成假文章，每个条目都是「搜索主题建议」。
// 标题 = 建议搜索的主题
// URL  = 百度搜索链接（用户点击后在百度找到真实原文）
// 来源 = 建议在这些平台搜索（这些平台被 AI 引用权重高）
// ============================================================================

const SEARCH_TOPIC_PATTERNS = {
  '护肤行业': [
    '2026年护肤品行业趋势分析',
    '功效护肤市场消费者偏好变化',
    '国货护肤品品牌竞争格局',
    '护肤成分创新与技术突破',
    '敏感肌护肤市场深度分析',
  ],
  '彩妆行业': [
    '2026年彩妆市场新趋势解读',
    '国货彩妆品牌崛起路径分析',
    '底妆产品技术革新与评测',
    '纯净美妆概念的市场实践',
    '彩妆与护肤融合的产品创新',
  ],
  '成分研究': [
    '热门护肤成分功效对比分析',
    '新型护肤原料研发进展',
    '胜肽类护肤品的作用机制',
    '植物提取物在护肤品中的应用',
    '发酵成分护肤技术前沿',
  ],
  '法规政策': [
    '化妆品功效宣称管理新规解读',
    '化妆品备案流程优化最新动态',
    '儿童化妆品监管政策更新',
    '化妆品广告合规要点分析',
    '化妆品安全评估技术导则',
  ],
  '市场分析': [
    '中国美妆市场规模与增长预测',
    '护肤品细分赛道投资机会',
    '化妆品行业消费升级趋势',
    '直播电商对美妆行业的影响',
    '跨境美妆市场最新动态',
  ],
  '品牌追踪': [
    '品牌新品发布动态',
    '品牌营销策略分析',
    '品牌渠道布局变化',
    '品牌技术研发突破',
    '品牌市场表现评估',
  ],
};

const DAY_SUFFIXES = [
  '的最新报道', '的行业分析', '的深度解读', '相关讨论',
  '最新资讯', '行业观点', '市场观察', '趋势研判',
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateSearchTopics(brand, count) {
  const topics = [];
  const patterns = SEARCH_TOPIC_PATTERNS[brand.category] || SEARCH_TOPIC_PATTERNS['护肤行业'];

  // 为每个关键词生成搜索主题
  for (let i = 0; i < count; i++) {
    const baseTopic = pickRandom(patterns);
    const suffix = pickRandom(DAY_SUFFIXES);
    const keyword = pickRandom(brand.keywords || ['护肤品']);
    const sourceHint = pickRandom(brand.searchedSources || ['知乎', '头条号', '搜狐号']);

    // 构建搜索标题：结合行业主题 + 品牌/领域关键词
    const searchTitle = brand.category === '品牌追踪'
      ? `${brand.name}${baseTopic}${suffix}`
      : `${baseTopic}${suffix}`;

    // 构建百度搜索URL（诚实：这就是搜索链接）
    const searchQuery = brand.category === '品牌追踪'
      ? `${brand.name} ${baseTopic}`
      : baseTopic;
    const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(searchQuery)}`;

    topics.push({
      id: uid(),
      title: searchTitle,
      url: searchUrl,
      source: sourceHint,
      publishDate: formatDate(),
      citationValue: 'medium',
      summary: `🔍 搜索建议：在「${sourceHint}」等平台搜索「${searchQuery}」获取原文。此条目为AI根据行业热点生成的搜索主题，非虚构文章链接。`,
      tags: [brand.name, brand.category || '行业', '搜索建议'],
      sourceTrust: 'ai',
      collectedAt: new Date().toISOString(),
      searchWindow: 'auto',
    });
  }
  return topics;
}

// ============================================================================
// 主搜索函数
// ============================================================================

async function runSearch(window = 'manual', fromHours = 24) {
  console.log(`\n🔍 GEO Ally 每日搜索开始`);
  console.log(`  时段: ${window}`);
  console.log(`  覆盖: 最近 ${fromHours} 小时`);
  console.log(`  时间: ${new Date().toISOString()}`);
  console.log(`  原则: 不生成假文章URL，每个条目都是诚实的搜索建议\n`);

  const allArticles = [];

  for (const brand of TRACKED_BRANDS) {
    console.log(`  📌 生成搜索建议: ${brand.name}...`);
    const count = window === 'manual' ? 4 : 2;
    const articles = generateSearchTopics(brand, count);
    console.log(`     → 生成 ${articles.length} 条搜索主题`);
    allArticles.push(...articles);
  }

  // 加载已有文章
  let existing = { articles: [], _lastUpdated: null, _searchCount: 0 };
  if (existsSync(ARTICLES_FILE)) {
    try {
      existing = JSON.parse(readFileSync(ARTICLES_FILE, 'utf8'));
    } catch (e) {
      console.log('  ⚠️ 无法读取已有数据，将创建新文件');
    }
  }

  // 去重合并（按标题去重，新内容优先）
  const existingTitles = new Set(existing.articles.map(a => a.title));
  const newArticles = allArticles.filter(a => !existingTitles.has(a.title));
  const merged = [...newArticles, ...existing.articles].slice(0, 500);

  // 保存
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const output = {
    _lastUpdated: new Date().toISOString(),
    _lastWindow: window,
    _searchCount: (existing._searchCount || 0) + 1,
    _trackedTopics: TRACKED_BRANDS.map(b => b.name),
    _summary: getTimeWindowLabel(window, fromHours),
    _disclaimer: '所有条目均为AI生成的搜索主题建议，URL为百度搜索链接。点击后在搜索结果中找到真实原文。不包含虚构的文章链接。',
    articles: merged,
  };

  writeFileSync(ARTICLES_FILE, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n  ✅ 搜索完成：新增 ${newArticles.length} 条搜索建议，总计 ${merged.length} 条`);
  console.log(`  📁 数据保存至: ${ARTICLES_FILE}\n`);

  // 记录搜索日志
  const logEntry = {
    timestamp: new Date().toISOString(),
    window,
    fromHours,
    newCount: newArticles.length,
    totalCount: merged.length,
    topics: TRACKED_BRANDS.map(b => b.name),
  };

  let logs = [];
  if (existsSync(LOG_FILE)) {
    try {
      logs = JSON.parse(readFileSync(LOG_FILE, 'utf8'));
    } catch (e) {}
  }
  logs.unshift(logEntry);
  logs = logs.slice(0, 100);
  writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2), 'utf8');
}

// ============================================================================
// 入口
// ============================================================================

const window = process.argv[2] || 'manual';
const fromHours = parseInt(process.argv[3] || '24', 10);

runSearch(window, fromHours).catch(err => {
  console.error('搜索失败:', err);
  process.exit(1);
});
