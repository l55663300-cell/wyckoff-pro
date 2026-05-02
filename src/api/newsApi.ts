import { NewsItem } from '../types';
import { getCache, setCache } from '../utils/cache';

// ── 新闻类别 ──
export type NewsCategory = 'macro' | 'blockchain' | 'crypto';

export interface CategorizedNewsItem extends NewsItem {
  category: NewsCategory;
  titleZh: string; // 中文标题（翻译后）
}

// ── 数据源配置 ──
// 宏观：美联储/战争/全球经济 → CoinDesk + Investing RSS（含宏观关键词过滤）
const MACRO_RSS_SOURCES = [
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk', category: 'macro' as NewsCategory },
  { url: 'https://cointelegraph.com/rss/tag/markets', source: 'CoinTelegraph', category: 'macro' as NewsCategory },
  { url: 'https://www.fxstreet.com/rss/news', source: 'FXStreet', category: 'macro' as NewsCategory },
];

// 区块链：技术/协议/Layer2/DeFi
const BLOCKCHAIN_RSS_SOURCES = [
  { url: 'https://cointelegraph.com/rss/tag/blockchain', source: 'CoinTelegraph', category: 'blockchain' as NewsCategory },
  { url: 'https://decrypt.co/feed', source: 'Decrypt', category: 'blockchain' as NewsCategory },
  { url: 'https://thedefiant.io/api/feed', source: 'The Defiant', category: 'blockchain' as NewsCategory },
];

// 加密货币：BTC/ETH/山寨/交易所/ETF
const CRYPTO_RSS_SOURCES = [
  { url: 'https://cointelegraph.com/rss/tag/bitcoin', source: 'CoinTelegraph BTC', category: 'crypto' as NewsCategory },
  { url: 'https://cointelegraph.com/rss/tag/ethereum', source: 'CoinTelegraph ETH', category: 'crypto' as NewsCategory },
  { url: 'https://cryptopanic.com/news/rss/?auth_token=free&filter=important', source: 'CryptoPanic', category: 'crypto' as NewsCategory },
];

// 中文备用源（直接中文，无需翻译）
const CN_RSS_SOURCES = [
  { url: 'https://jinse.cn/rss', source: '金色财经', category: 'crypto' as NewsCategory },
  { url: 'https://www.panewslab.com/zh/rss/index.xml', source: 'PANews', category: 'blockchain' as NewsCategory },
  { url: 'https://www.chaincatcher.com/rss.xml', source: '链捕手', category: 'blockchain' as NewsCategory },
  { url: 'https://www.bitpush.news/feed', source: '比推', category: 'macro' as NewsCategory },
  { url: 'https://blockbeats.cn/rss', source: 'BlockBeats', category: 'crypto' as NewsCategory },
];

// 宏观关键词过滤（必须命中其中一个才算宏观新闻）
const MACRO_KEYWORDS = [
  'fed', 'federal reserve', 'interest rate', 'inflation', 'cpi', 'gdp', 'treasury',
  'war', 'conflict', 'sanction', 'geopolit', 'tariff', 'trade war', 'dollar', 'forex',
  '美联储', '利率', '通胀', '战争', '制裁', '关税', '经济', '货币政策',
];

const BLOCKCHAIN_KEYWORDS = [
  'blockchain', 'layer2', 'layer 2', 'defi', 'protocol', 'ethereum', 'solana',
  'smart contract', 'consensus', 'validator', 'upgrade', 'fork', 'bridge',
  '区块链', '公链', '协议', '升级', '跨链', 'L2', '智能合约',
];

// 加权情绪关键词
const BULLISH_WORDS: { kw: string; w: number }[] = [
  { kw: '暴涨', w: 3 }, { kw: '新高', w: 3 }, { kw: '大涨', w: 2 }, { kw: '牛市', w: 2 },
  { kw: '利好', w: 2 }, { kw: '突破', w: 2 }, { kw: '净流入', w: 2 }, { kw: '获批', w: 2 },
  { kw: '上涨', w: 1 }, { kw: '增长', w: 1 }, { kw: '回升', w: 1 }, { kw: '反弹', w: 1 },
  { kw: '采用', w: 1 }, { kw: 'surge', w: 3 }, { kw: 'record', w: 3 }, { kw: 'rally', w: 2 },
  { kw: 'approve', w: 2 }, { kw: 'adoption', w: 2 }, { kw: 'inflow', w: 2 }, { kw: 'bull', w: 1 },
  { kw: 'rise', w: 1 }, { kw: 'gain', w: 1 }, { kw: 'high', w: 1 }, { kw: 'recover', w: 1 },
];
const BEARISH_WORDS: { kw: string; w: number }[] = [
  { kw: '崩盘', w: 3 }, { kw: '暴跌', w: 3 }, { kw: '爆仓', w: 3 }, { kw: '黑客', w: 3 },
  { kw: '清算', w: 2 }, { kw: '跌破', w: 2 }, { kw: '禁止', w: 2 }, { kw: '监管', w: 2 },
  { kw: '熊市', w: 2 }, { kw: '利空', w: 2 }, { kw: '警告', w: 2 }, { kw: '抛售', w: 1 },
  { kw: '下跌', w: 1 }, { kw: 'crash', w: 3 }, { kw: 'liquidat', w: 3 }, { kw: 'hack', w: 3 },
  { kw: 'ban', w: 2 }, { kw: 'outflow', w: 2 }, { kw: 'drop', w: 1 }, { kw: 'decline', w: 1 },
  { kw: 'bear', w: 1 }, { kw: 'fall', w: 1 }, { kw: 'plunge', w: 2 }, { kw: 'fear', w: 1 },
];

export interface NewsSentimentResult {
  bullish: number;
  bearish: number;
  neutral: number;
  bullScore: number;
  bearScore: number;
  verdict: 'bullish' | 'bearish' | 'neutral';
  verdictLabel: string;
  verdictDesc: string;
  totalAnalyzed: number; // 参与分析的总条数
}

export function analyzeNewsSentiment(news: NewsItem[]): NewsSentimentResult {
  let bullish = 0, bearish = 0, neutral = 0;
  let bullScore = 0, bearScore = 0;

  news.forEach((item) => {
    const text = (item.title + ' ' + (item.titleZh ?? '')).toLowerCase();
    const bScore = BULLISH_WORDS.reduce((s, { kw, w }) => text.includes(kw) ? s + w : s, 0);
    const rScore = BEARISH_WORDS.reduce((s, { kw, w }) => text.includes(kw) ? s + w : s, 0);
    bullScore += bScore;
    bearScore += rScore;
    if (bScore > rScore) bullish++;
    else if (rScore > bScore) bearish++;
    else neutral++;
  });

  const total = news.length || 1;
  const diff = bullScore - bearScore;
  const threshold = total * 0.6;

  let verdict: 'bullish' | 'bearish' | 'neutral';
  let verdictLabel: string;
  let verdictDesc: string;

  if (diff >= threshold) {
    verdict = 'bullish';
    verdictLabel = '利多';
    verdictDesc = `综合${total}条资讯：${bullish}条利多 · ${bearish}条利空，情绪明显偏向看涨`;
  } else if (diff <= -threshold) {
    verdict = 'bearish';
    verdictLabel = '利空';
    verdictDesc = `综合${total}条资讯：${bearish}条利空 · ${bullish}条利多，市场情绪偏向谨慎`;
  } else {
    verdict = 'neutral';
    verdictLabel = '中性';
    verdictDesc = `综合${total}条资讯：利多${bullish} / 利空${bearish}，消息面暂无明显方向`;
  }

  return { bullish, bearish, neutral, bullScore, bearScore, verdict, verdictLabel, verdictDesc, totalAnalyzed: total };
}

// ── 翻译：MyMemory 免费 API（无需 key，每天 5000 词）──
async function translateToZh(text: string): Promise<string> {
  if (!text || isChinese(text)) return text;
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 200))}&langpair=en|zh`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!resp.ok) return text;
    const json = await resp.json();
    const translated = json?.responseData?.translatedText as string;
    // MyMemory 有时返回原文或报错文本
    if (!translated || translated.length < 2 || translated === text) return text;
    return translated;
  } catch {
    return text;
  }
}

function isChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

// ── 分类判断 ──
function classifyNews(title: string, defaultCat: NewsCategory): NewsCategory {
  const t = title.toLowerCase();
  if (MACRO_KEYWORDS.some(k => t.includes(k))) return 'macro';
  if (BLOCKCHAIN_KEYWORDS.some(k => t.includes(k))) return 'blockchain';
  return defaultCat;
}

// ── RSS 抓取 ──
async function fetchRSS(
  url: string,
  source: string,
  defaultCat: NewsCategory,
  maxItems = 8
): Promise<CategorizedNewsItem[]> {
  const proxyUrl = `/api/allorigins/get?url=${encodeURIComponent(url)}`;
  const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`RSS ${source} 失败: ${resp.status}`);
  const json = await resp.json();
  const xml = json.contents as string;
  if (!xml || !xml.trim().startsWith('<')) throw new Error(`RSS ${source} 非XML`);

  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const items = Array.from(doc.querySelectorAll('item, entry')).slice(0, maxItems);

  return items
    .map((item) => {
      const title = item.querySelector('title')?.textContent?.trim() ?? '';
      const link =
        item.querySelector('link')?.textContent?.trim() ||
        item.querySelector('link')?.getAttribute('href') ||
        '#';
      const pubDate =
        item.querySelector('pubDate')?.textContent?.trim() ||
        item.querySelector('published')?.textContent?.trim() ||
        item.querySelector('updated')?.textContent?.trim() || '';
      const category = classifyNews(title, defaultCat);
      return { title, titleZh: title, link, pubDate, source, category };
    })
    .filter((n) => n.title.length > 4);
}

// ── 批量翻译（仅翻译英文条目）──
async function batchTranslate(items: CategorizedNewsItem[]): Promise<CategorizedNewsItem[]> {
  const toTranslate = items.filter(n => !isChinese(n.title));
  // 并发翻译，最多同时10条
  const chunks: CategorizedNewsItem[][] = [];
  for (let i = 0; i < toTranslate.length; i += 10) {
    chunks.push(toTranslate.slice(i, i + 10));
  }
  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (item) => {
        item.titleZh = await translateToZh(item.title);
      })
    );
  }
  return items;
}

// ── 按分类配额选取展示6条 ──
function selectDisplayNews(all: CategorizedNewsItem[]): CategorizedNewsItem[] {
  const macro = all.filter(n => n.category === 'macro');
  const blockchain = all.filter(n => n.category === 'blockchain');
  const crypto = all.filter(n => n.category === 'crypto');

  // 各取2条，不足时从其他类补
  const selected: CategorizedNewsItem[] = [
    ...macro.slice(0, 2),
    ...blockchain.slice(0, 2),
    ...crypto.slice(0, 2),
  ];

  // 若不足6条，用剩余的补满
  if (selected.length < 6) {
    const selectedSet = new Set(selected.map(n => n.title));
    const rest = all.filter(n => !selectedSet.has(n.title));
    selected.push(...rest.slice(0, 6 - selected.length));
  }

  return selected.slice(0, 6);
}

// 兜底中文新闻（分类标注）
const FALLBACK_NEWS: CategorizedNewsItem[] = [
  { title: '美联储维持利率不变，降息预期推迟至年末', titleZh: '美联储维持利率不变，降息预期推迟至年末', link: '#', pubDate: '', source: '比推', category: 'macro' },
  { title: '中东局势升级，市场避险情绪升温', titleZh: '中东局势升级，市场避险情绪升温', link: '#', pubDate: '', source: '金色财经', category: 'macro' },
  { title: 'Ethereum Pectra 升级完成，Layer2 生态加速扩张', titleZh: 'Ethereum Pectra 升级完成，Layer2 生态加速扩张', link: '#', pubDate: '', source: 'PANews', category: 'blockchain' },
  { title: '全球稳定币总供应量突破 2000 亿美元', titleZh: '全球稳定币总供应量突破 2000 亿美元', link: '#', pubDate: '', source: '链捕手', category: 'blockchain' },
  { title: '比特币突破关键阻力位，市场情绪回暖', titleZh: '比特币突破关键阻力位，市场情绪回暖', link: '#', pubDate: '', source: '金色财经', category: 'crypto' },
  { title: '以太坊 ETF 净流入创近期新高，机构加速布局', titleZh: '以太坊 ETF 净流入创近期新高，机构加速布局', link: '#', pubDate: '', source: 'PANews', category: 'crypto' },
];

export interface FetchNewsResult {
  displayNews: CategorizedNewsItem[];  // 展示的6条
  allNews: CategorizedNewsItem[];       // 全量（用于舆情分析）
}

export async function fetchNews(): Promise<NewsItem[]> {
  const result = await fetchNewsWithSentiment();
  return result.displayNews;
}

export async function fetchNewsWithSentiment(): Promise<FetchNewsResult> {
  const cacheKey = 'news_v3_categorized';
  const cached = getCache<FetchNewsResult>(cacheKey);
  if (cached) return cached;

  const allSources = [...MACRO_RSS_SOURCES, ...BLOCKCHAIN_RSS_SOURCES, ...CRYPTO_RSS_SOURCES, ...CN_RSS_SOURCES];
  const allItems: CategorizedNewsItem[] = [];

  // 并发抓取所有源（失败的忽略）
  const results = await Promise.allSettled(
    allSources.map(({ url, source, category }) =>
      fetchRSS(url, source, category, 6)
    )
  );

  results.forEach((r) => {
    if (r.status === 'fulfilled') allItems.push(...r.value);
  });

  // 按时间排序，去重（同标题）
  const seen = new Set<string>();
  const deduped = allItems
    .sort((a, b) => {
      const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return tb - ta;
    })
    .filter(n => {
      if (seen.has(n.title)) return false;
      seen.add(n.title);
      return true;
    });

  if (deduped.length === 0) {
    return { displayNews: FALLBACK_NEWS, allNews: FALLBACK_NEWS };
  }

  // 批量翻译英文标题
  const translated = await batchTranslate(deduped.slice(0, 30));

  // 选取展示的6条（分类配额）
  const displayNews = selectDisplayNews(translated);

  const result: FetchNewsResult = { displayNews, allNews: translated };
  setCache(cacheKey, result, 600); // 10分钟缓存
  return result;
}
