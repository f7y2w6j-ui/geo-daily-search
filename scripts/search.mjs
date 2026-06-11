// ============================================================================
// GEO Ally — 每日搜索脚本
// ============================================================================
// 搜索追踪品牌的护肤彩妆行业最新内容，保存到 data/articles.json
// 用法: node scripts/search.mjs [window] [fromHours]
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

// 从配置文件加载品牌追踪列表（可手动编辑 data/tracked-brands.json）
function loadTrackedBrands() {
  const configPath = resolve(DATA_DIR, 'tracked-brands.json');
  try {
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      const brands = (config.brands || []).map(name => ({
        name,
        keywords: [`${name} 最新`, `${name} 新品`, `${name} 品牌动态`],
        category: '品牌追踪',
      }));
      // 行业综合搜索始终运行
      const industryTopics = (config.industryTopics || [
        '护肤品 行业趋势 2026', '化妆品 新规', '护肤成分 最新研究',
        '彩妆 新品 评测', '国货护肤 品牌动态', '美妆 市场分析',
      ]).map((topic, i) => ({
        name: `行业综合-${i}`,
        keywords: [topic],
        category: '行业综合',
      }));
      return [...brands, ...industryTopics];
    }
  } catch (e) {
    console.log('  ⚠️ 无法读取品牌配置，使用默认行业综合搜索');
  }
  // 默认：仅行业综合搜索（不追踪特定品牌）
  return [
    { name: '护肤行业', keywords: ['护肤品 行业趋势 2026', '化妆品 新规', '护肤成分 最新研究'], category: '行业' },
    { name: '彩妆行业', keywords: ['彩妆 新品 评测', '国货彩妆 品牌动态', '彩妆趋势 2026'], category: '行业' },
    { name: '成分研究', keywords: ['护肤成分 功效 研究', '化妆品 原料 创新', '成分解析 护肤品'], category: '行业' },
    { name: '法规政策', keywords: ['化妆品 法规 新规 2026', '功效宣称 备案', '化妆品 监管 政策'], category: '行业' },
    { name: '市场分析', keywords: ['美妆 市场分析 2026', '护肤品 消费趋势', '化妆品 行业报告'], category: '行业' },
  ];
}

const TRACKED_BRANDS = loadTrackedBrands();

// 搜索来源（按AI平台引用权重排序）
const SEARCH_SOURCES = [
  { name: '头条号', domain: 'toutiao.com', aiPlatforms: ['豆包'] },
  { name: '知乎', domain: 'zhihu.com', aiPlatforms: ['DeepSeek', '豆包', '千问'] },
  { name: 'CSDN', domain: 'csdn.net', aiPlatforms: ['DeepSeek'] },
  { name: '搜狐号', domain: 'sohu.com', aiPlatforms: ['千问', 'DeepSeek'] },
  { name: '网易号', domain: '163.com', aiPlatforms: ['千问'] },
  { name: '什么值得买', domain: 'smzdm.com', aiPlatforms: ['DeepSeek', '豆包'] },
  { name: '公众号', domain: 'weixin.qq.com', aiPlatforms: ['元宝'] },
];

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
// 搜索结果模拟器（免费搜索API替代方案）
// ============================================================================
// GitHub Actions 无法使用真实浏览器搜索。
// 此模块使用内置模板 + 随机内容生成新文章，模拟搜索结果。
// 如需真实搜索，替换为 SerpAPI / Bing Search API 调用。
// ============================================================================

const INDUSTRY_TEMPLATES = {
  '花西子': [
    { title: '花西子新品发布：{季节}限定系列亮相', source: '什么值得买', baseUrl: 'https://post.smzdm.com/p/' },
    { title: '花西子品牌深度分析：国货美妆的突围与困局', source: '知乎', baseUrl: 'https://zhuanlan.zhihu.com/p/' },
    { title: '花西子{产品}实测：值不值得买？', source: '搜狐号', baseUrl: 'https://www.sohu.com/a/' },
    { title: '花西子海外市场拓展：{地区}消费者反响如何', source: '头条号', baseUrl: 'https://www.toutiao.com/article/' },
    { title: '花西子再获国际认可：{奖项}背后的品牌进化', source: '新华报业', baseUrl: 'https://www.xhby.net/content/' },
  ],
  '片仔癀': [
    { title: '片仔癀化妆品{产品线}新品亮相{展会}', source: '网易号', baseUrl: 'https://www.163.com/dy/article/' },
    { title: '片仔癀{技术}研发突破：中式成分的现代化之路', source: '搜狐号', baseUrl: 'https://www.sohu.com/a/' },
    { title: '片仔癀药业发布{季度}财报：化妆品业务稳健增长', source: '百家号', baseUrl: 'https://baijiahao.baidu.com/s?id=' },
    { title: '国货护肤新势力：片仔癀{品牌}的差异化竞争策略', source: '知乎', baseUrl: 'https://zhuanlan.zhihu.com/p/' },
    { title: '片仔癀生活馆模式探访：药妆+AI的新零售实验', source: '北京青年报', baseUrl: 'https://life.ynet.com/' },
  ],
  '护肤行业': [
    { title: '2026年护肤行业{领域}趋势深度报告', source: '知乎', baseUrl: 'https://zhuanlan.zhihu.com/p/' },
    { title: '化妆品{法规}新规解读：企业合规要点', source: '博客园', baseUrl: 'https://www.cnblogs.com/' },
    { title: 'AI如何改变化妆品{环节}：从研发到零售', source: 'CSDN', baseUrl: 'https://blog.csdn.net/' },
    { title: '功效护肤品{趋势}：消费者需求变迁', source: '公众号', baseUrl: 'https://mp.weixin.qq.com/s/' },
    { title: '全球美妆市场{区域}竞争格局分析', source: '头条号', baseUrl: 'https://www.toutiao.com/article/' },
  ],
  '彩妆行业': [
    { title: '2026年彩妆{趋势}趋势：从色彩到养肤', source: '知乎', baseUrl: 'https://zhuanlan.zhihu.com/p/' },
    { title: '国货彩妆品牌{品牌}深度评测：值不值得买？', source: '什么值得买', baseUrl: 'https://post.smzdm.com/p/' },
    { title: '底妆产品横评：{季节}热门粉底液实测对比', source: '搜狐号', baseUrl: 'https://www.sohu.com/a/' },
  ],
  '成分研究': [
    { title: '{成分}功效研究最新进展：从实验室到护肤品', source: '知乎', baseUrl: 'https://zhuanlan.zhihu.com/p/' },
    { title: '护肤成分{成分}全解析：作用机制与适用人群', source: '什么值得买', baseUrl: 'https://post.smzdm.com/p/' },
    { title: '2026年热门护肤成分盘点：{技术}技术引领新趋势', source: 'CSDN', baseUrl: 'https://blog.csdn.net/' },
  ],
  '法规政策': [
    { title: '国家药监局{法规}新规正式实施：企业应对指南', source: '搜狐号', baseUrl: 'https://www.sohu.com/a/' },
    { title: '化妆品行业{环节}合规要点：律师解读最新政策', source: '知乎', baseUrl: 'https://zhuanlan.zhihu.com/p/' },
  ],
  '市场分析': [
    { title: '2026年{区域}美妆市场分析：增长动力与竞争格局', source: '头条号', baseUrl: 'https://www.toutiao.com/article/' },
    { title: '护肤品{领域}赛道深度分析：市场空间与投资机会', source: '知乎', baseUrl: 'https://zhuanlan.zhihu.com/p/' },
    { title: '化妆品行业{季度}报告：品牌排名与趋势解读', source: '网易号', baseUrl: 'https://www.163.com/dy/article/' },
  ],
};

const FILLERS = {
  '季节': ['春季', '夏季', '秋季', '冬季', '早春', '初夏', '深秋'],
  '产品': ['气垫', '口红', '散粉', '精华', '面霜', '眼影盘', '防晒霜'],
  '地区': ['日本', '东南亚', '欧洲', '北美', '中东', '韩国'],
  '奖项': ['设计大奖', '美妆大赏', '创新奖', '消费者选择奖'],
  '产品线': ['凝时紧致', '雪肌无瑕', '灵芝臻颜', '皇后珍珠', '御容臻致'],
  '展会': ['美博会', '消博会', '进博会', '化妆品创新展'],
  '技术': ['AI感官检测', '靶向递送', '生物发酵', '溯源防伪', '微胶囊包裹'],
  '季度': ['Q1', 'Q2', 'Q3', '上半年', '前三季度'],
  '品牌': ['国药经典', '社区新零售', '科技转型', '药妆融合'],
  '领域': ['成分', '渠道', '消费行为', '技术应用', '可持续发展'],
  '法规': ['功效宣称', '成分标注', '儿童化妆品', '备案管理', '广告合规'],
  '环节': ['研发', '配方筛选', '功效预测', '供应链', '消费者洞察'],
  '趋势': ['精准靶向', '精简护肤', '纯净美妆', 'AI个性化', '药妆融合'],
  '区域': ['亚洲', '北美', '欧洲', '新兴市场', '跨境电商'],
  '成分': ['烟酰胺', '视黄醇', '玻尿酸', '胜肽', '神经酰胺', 'VC', 'A醇', '依克多因'],
  '品牌': ['珀莱雅', '薇诺娜', '欧莱雅', '雅诗兰黛', '完美日记', '花西子', '片仔癀', '华熙生物'],
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fillTemplate(template) {
  let result = template;
  for (const [key, options] of Object.entries(FILLERS)) {
    result = result.replace(`{${key}}`, pickRandom(options));
  }
  return result;
}

function generateArticleId() {
  return `auto_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function estimateCitationValue(source) {
  const highSources = ['知乎', '头条号', '公众号', '搜狐号', '新华报业', '央视网'];
  const mediumSources = ['CSDN', '什么值得买', '网易号', '博客园', '虎嗅', '北京青年报'];
  if (highSources.includes(source)) return 'high';
  if (mediumSources.includes(source)) return 'medium';
  return 'low';
}

// ============================================================================
// 主搜索函数
// ============================================================================

async function searchBrand(brand, window) {
  const articles = [];
  // 匹配模板：先精确匹配，再按类别匹配，最后用护肤行业兜底
  const templates = INDUSTRY_TEMPLATES[brand.name]
    || INDUSTRY_TEMPLATES[brand.category]
    || INDUSTRY_TEMPLATES['护肤行业'];

  // 每个品牌/主题生成 3-5 篇新文章
  const count = window === 'manual' ? 5 : 3;
  const shuffled = [...templates].sort(() => Math.random() - 0.5);

  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    const template = shuffled[i];
    const title = fillTemplate(template.title);
    const source = template.source;
    const id = generateArticleId();

        articles.push({
      id,
      title,
      url: `https://www.baidu.com/s?wd=${encodeURIComponent(title)}`,
      source,
      publishDate: formatDate(),
      citationValue: estimateCitationValue(source),
      summary: `[AI辅助发现] ⚠️ 此标题和来源为AI基于行业模板生成，仅供参考。请点击链接搜索核实原文。`,
      tags: [brand.name, brand.category || '行业', 'AI生成', window === 'manual' ? '手动刷新' : '自动搜索'],
      sourceTrust: 'ai',
      collectedAt: new Date().toISOString(),
      searchWindow: window,
    });
  }
  return articles;
}

async function runSearch(window = 'manual', fromHours = 24) {
  console.log(`\n🔍 GEO Ally 每日搜索开始`);
  console.log(`  时段: ${window}`);
  console.log(`  覆盖: 最近 ${fromHours} 小时`);
  console.log(`  时间: ${new Date().toISOString()}\n`);

  const allArticles = [];

  for (const brand of TRACKED_BRANDS) {
    console.log(`  📌 搜索: ${brand.name}...`);
    const articles = await searchBrand(brand, window);
    console.log(`     → 找到 ${articles.length} 篇`);
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

  // 去重合并（新文章优先）
  const existingIds = new Set(existing.articles.map(a => a.id));
  const newArticles = allArticles.filter(a => !existingIds.has(a.id));
  const merged = [...newArticles, ...existing.articles].slice(0, 500); // 最多保留500篇

  // 保存
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const output = {
    _lastUpdated: new Date().toISOString(),
    _lastWindow: window,
    _searchCount: (existing._searchCount || 0) + 1,
    _trackedBrands: TRACKED_BRANDS.map(b => b.name),
    _summary: getTimeWindowLabel(window, fromHours),
    articles: merged,
  };

  writeFileSync(ARTICLES_FILE, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n  ✅ 搜索完成：新增 ${newArticles.length} 篇，总计 ${merged.length} 篇`);
  console.log(`  📁 数据保存至: ${ARTICLES_FILE}\n`);

  // 记录搜索日志
  const logEntry = {
    timestamp: new Date().toISOString(),
    window,
    fromHours,
    newCount: newArticles.length,
    totalCount: merged.length,
    brands: TRACKED_BRANDS.map(b => b.name),
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
