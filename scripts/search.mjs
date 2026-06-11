// ============================================================================
// GEO Ally — 每日搜索脚本（免费多引擎方案）
// ============================================================================
// 优先使用 BING_API_KEY（若配置），否则用免费公开接口
// 免费方案: SearXNG 公共实例 → DuckDuckGo HTML → Bing HTML
// GitHub Actions 服务器在美国，不受 GFW 限制
// ============================================================================

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../data');
const ARTICLES_FILE = resolve(DATA_DIR, 'articles.json');
const LOG_FILE = resolve(DATA_DIR, 'search-log.json');

const BING_API_KEY = process.env.BING_API_KEY || '';

// ============================================================================
// 搜索查询（每天3个话题 × 3篇 = 9篇）
// ============================================================================

const SEARCH_QUERIES = [
  { query: '护肤品 行业趋势 2026', category: '行业趋势', sourceHint: '知乎' },
  { query: '化妆品 新规 功效宣称 备案', category: '法规政策', sourceHint: '搜狐号' },
  { query: '护肤成分 功效研究 最新进展', category: '成分技术', sourceHint: '知乎' },
  { query: '国货美妆 品牌 最新动态', category: '品牌动态', sourceHint: '什么值得买' },
  { query: '化妆品 监管 安全评估 电子标签', category: '法规政策', sourceHint: '新华报业' },
  { query: '护肤品 消费趋势 成分党 功效', category: '消费趋势', sourceHint: '公众号' },
  { query: '化妆品 原料创新 递送技术 AI', category: '成分技术', sourceHint: 'CSDN' },
  { query: '美妆 市场分析 国货 竞争格局', category: '行业趋势', sourceHint: '头条号' },
  { query: '彩妆 新品 评测 趋势 2026', category: '品牌动态', sourceHint: '网易号' },
];

function loadTrackedBrands() {
  const configPath = resolve(DATA_DIR, 'tracked-brands.json');
  try {
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      return (config.brands || []).map(name => ({
        query: `${name} 护肤品 最新 动态`,
        category: '品牌追踪',
        sourceHint: '头条号',
      }));
    }
  } catch (e) { /* ignore */ }
  return [];
}

// ============================================================================
// 工具函数
// ============================================================================

function uid() {
  return `real_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
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

function inferSource(url) {
  const m = {
    'zhihu.com': '知乎', 'toutiao.com': '头条号', 'sohu.com': '搜狐号',
    '163.com': '网易号', 'csdn.net': 'CSDN', 'cnblogs.com': '博客园',
    'baijiahao.baidu.com': '百家号', 'smzdm.com': '什么值得买',
    'mp.weixin.qq.com': '公众号', 'weixin.qq.com': '公众号',
    'cctv.cn': '央视网', 'cctv.com': '央视网', 'jiemian.com': '搜狐号',
    'xhby.net': '新华报业', 'workercn.cn': '新华报业',
  };
  for (const [d, s] of Object.entries(m)) if (url.includes(d)) return s;
  return '知乎';
}

function estCitation(url) {
  const hi = ['zhihu.com', 'toutiao.com', 'sohu.com', 'weixin.qq.com', 'cctv.cn', 'cctv.com'];
  const md = ['csdn.net', 'smzdm.com', '163.com', 'cnblogs.com', 'baijiahao.baidu.com'];
  for (const d of hi) if (url.includes(d)) return 'high';
  for (const d of md) if (url.includes(d)) return 'medium';
  return 'low';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================================
// 搜索引擎 #1: Bing Search API（需要 Key，最可靠）
// ============================================================================

async function searchBingAPI(query, count = 5) {
  if (!BING_API_KEY) return [];
  const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${count}&mkt=zh-CN&setLang=zh-Hans&freshness=Month`;
  const resp = await fetch(url, {
    headers: { 'Ocp-Apim-Subscription-Key': BING_API_KEY, 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`Bing API ${resp.status}`);
  const data = await resp.json();
  return (data.webPages?.value || []).map(r => ({
    title: r.name, url: r.url, snippet: r.snippet, datePublished: r.datePublished || null,
  }));
}

// ============================================================================
// 搜索引擎 #2: SearXNG 公共实例（免费，无需 Key）
// ============================================================================

const SEARXNG_INSTANCES = [
  'https://searx.be',
  'https://search.sapti.me',
  'https://searx.si',
  'https://search.bus-hit.me',
  'https://searx.tiekoetter.com',
];

async function searchSearXNG(query, count = 5) {
  for (const instance of SEARXNG_INSTANCES) {
    try {
      const url = `${instance}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=zh-CN`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GEO-Ally/1.0)' },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (!data.results?.length) continue;
      console.log(`     ✅ SearXNG (${instance.split('//')[1].split('/')[0]}) 返回 ${data.results.length} 条`);
      return data.results.slice(0, count).map(r => ({
        title: r.title, url: r.url, snippet: r.content || r.snippet || '', datePublished: r.publishedDate || null,
      }));
    } catch (e) { /* try next instance */ }
  }
  return [];
}

// ============================================================================
// 搜索引擎 #3: DuckDuckGo HTML（免费，无需 Key）
// ============================================================================

async function searchDDG(query, count = 5) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
    });
    const html = await resp.text();

    // 解析 DDG HTML 结果
    const results = [];
    const linkRe = /class="result__a"[^>]*href="([^"]+)"/g;
    const titleRe = /class="result__a"[^>]*>([^<]+)</g;
    const snippetRe = /class="result__snippet"[^>]*>([^<]+)</g;

    let linkMatch, titleMatch, snippetMatch;
    const links = [...html.matchAll(linkRe)].map(m => m[1]);
    const titles = [...html.matchAll(titleRe)].map(m => m[1]);
    const snippets = [...html.matchAll(snippetRe)].map(m => m[1]);

    for (let i = 0; i < Math.min(count, links.length); i++) {
      results.push({
        title: titles[i] || '无标题',
        url: links[i],
        snippet: snippets[i] || '',
        datePublished: null,
      });
    }
    if (results.length > 0) console.log(`     ✅ DuckDuckGo 返回 ${results.length} 条`);
    return results;
  } catch (e) {
    return [];
  }
}

// ============================================================================
// 搜索引擎 #4: Bing HTML 抓取（免费，无需 Key，备选）
// ============================================================================

async function searchBingHTML(query, count = 5) {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${count}&setlang=zh-hans`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0' },
      signal: AbortSignal.timeout(10000),
    });
    const html = await resp.text();

    // 从 Bing HTML 提取搜索结果
    const results = [];
    const citeRe = /<cite[^>]*>([^<]+)<\/cite>/g;
    const h2Re = /<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a><\/h2>/g;
    const pRe = /<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([^<]+)<\/p>/g;

    const urls = [...html.matchAll(h2Re)].map(m => ({ url: m[1], title: m[2].replace(/<[^>]+>/g, '') }));
    const snippets = [...html.matchAll(pRe)].map(m => m[1]);

    for (let i = 0; i < Math.min(count, urls.length); i++) {
      results.push({
        title: urls[i].title || '无标题',
        url: urls[i].url,
        snippet: snippets[i] || '',
        datePublished: null,
      });
    }
    if (results.length > 0) console.log(`     ✅ Bing HTML 返回 ${results.length} 条`);
    return results;
  } catch (e) {
    return [];
  }
}

// ============================================================================
// 统一搜索入口：多引擎级联
// ============================================================================

async function searchAllEngines(query, count = 3) {
  // 1) Bing API（最可靠，有 Key 则优先）
  if (BING_API_KEY) {
    try {
      const results = await searchBingAPI(query, count);
      if (results.length > 0) return results;
    } catch (e) {
      console.log(`     ⚠️ Bing API 失败: ${e.message}`);
    }
  }

  // 2) SearXNG 公共实例
  const searxResults = await searchSearXNG(query, count);
  if (searxResults.length > 0) return searxResults;

  // 3) DuckDuckGo HTML
  const ddgResults = await searchDDG(query, count);
  if (ddgResults.length > 0) return ddgResults;

  // 4) Bing HTML 兜底
  const bingResults = await searchBingHTML(query, count);
  if (bingResults.length > 0) return bingResults;

  return [];
}

// ============================================================================
// 主搜索函数
// ============================================================================

async function runSearch(window = 'manual', fromHours = 24) {
  console.log(`\n🔍 GEO Ally 每日搜索`);
  console.log(`  时段: ${window}`);
  console.log(`  引擎: ${BING_API_KEY ? 'Bing API' : 'SearXNG → DDG → Bing HTML'}`);
  console.log(`  时间: ${new Date().toISOString()}\n`);

  const allArticles = [];
  const queries = [...SEARCH_QUERIES, ...loadTrackedBrands()];

  // 基于日期轮换查询（每天不同话题组合）
  const dayOfYear = Math.floor((Date.now() - new Date(2026, 0, 1).getTime()) / 86400000);
  const startIdx = (dayOfYear * 3) % queries.length;
  const selectedQueries = [];
  for (let i = 0; i < 3 && selectedQueries.length < 3; i++) {
    const q = queries[(startIdx + i) % queries.length];
    if (!selectedQueries.find(sq => sq.query === q.query)) {
      selectedQueries.push(q);
    }
  }

  for (const sq of selectedQueries) {
    console.log(`  🔎 "${sq.query}" [${sq.sourceHint}]`);
    try {
      const results = await searchAllEngines(sq.query, 3);
      console.log(`     → 获取 ${results.length} 条真实结果`);

      for (const r of results) {
        // 过滤明显无用的URL
        if (!r.url || r.url.includes('youtube.com') || r.url.includes('facebook.com')) continue;

        const source = inferSource(r.url);
        allArticles.push({
          id: uid(),
          title: r.title,
          url: r.url,
          source,
          publishDate: r.datePublished ? r.datePublished.split('T')[0] : formatDate(),
          citationValue: estCitation(r.url),
          summary: r.snippet,
          tags: [sq.category, source],
          sourceTrust: 'verified',
          collectedAt: new Date().toISOString(),
          searchWindow: window,
        });
      }

      // 礼貌延迟
      await sleep(500);
    } catch (e) {
      console.log(`     ⚠️ 失败: ${e.message}`);
    }
  }

  console.log(`\n  📊 本次获取 ${allArticles.length} 篇真实文章`);

  // 加载已有 + 去重合并
  let existing = { articles: [], _lastUpdated: null, _searchCount: 0 };
  if (existsSync(ARTICLES_FILE)) {
    try { existing = JSON.parse(readFileSync(ARTICLES_FILE, 'utf8')); } catch (e) {}
  }

  const existingUrls = new Set(existing.articles.map(a => a.url));
  const newArticles = allArticles.filter(a => !existingUrls.has(a.url) && a.url);
  const merged = [...newArticles, ...existing.articles].slice(0, 200);

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const output = {
    _lastUpdated: new Date().toISOString(),
    _lastWindow: window,
    _searchCount: (existing._searchCount || 0) + 1,
    _searchEngine: BING_API_KEY ? 'Bing API v7' : 'SearXNG/DDG/Bing HTML',
    _disclaimer: '所有条目均通过公开搜索引擎从网页获取，URL为真实可验证的文章链接。',
    articles: merged,
  };

  writeFileSync(ARTICLES_FILE, JSON.stringify(output, null, 2), 'utf8');
  console.log(`  ✅ 保存: 新增 ${newArticles.length} 篇, 总计 ${merged.length} 篇`);
  console.log(`  📁 ${ARTICLES_FILE}\n`);

  // 日志
  const logEntry = {
    timestamp: new Date().toISOString(), window, fromHours,
    engine: output._searchEngine,
    newCount: newArticles.length, totalCount: merged.length,
    queries: selectedQueries.map(q => q.query),
  };

  let logs = [];
  if (existsSync(LOG_FILE)) {
    try { logs = JSON.parse(readFileSync(LOG_FILE, 'utf8')); } catch (e) {}
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
