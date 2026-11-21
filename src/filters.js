// What the feed is currently showing:
//   { type: 'all' }               the personalised "For you" feed
//   { type: 'category', id }      a broad topic from the nav bar
//   { type: 'tag', tag }          posts carrying one tag (a Wikipedia or Commons category)
//   { type: 'nearby' }            places around the user
//   { type: 'search', query }     what the user typed in the search bar

export const ALL = { type: 'all' };
export const NEARBY = { type: 'nearby' };
export const categoryFilter = (id) => ({ type: 'category', id });
export const tagFilter = (tag) => ({ type: 'tag', tag });

export const MAX_QUERY = 100;
/** Tidies what was typed in the search box: single spaces, no edges, a sane length. */
export const cleanQuery = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY);
export const searchFilter = (query) => ({ type: 'search', query: cleanQuery(query) });

// `topics` are Wikipedia "articletopic" values (labels Wikipedia assigns to articles automatically).
// One is picked at random per request, so a category stays varied. Between them the categories
// below use every articletopic value Wikipedia documents; a test checks that nothing is missed.
// `keywords` are Commons search terms, picked the same way, for the images and videos.
// `otd: true` also mixes "On this day" cards into that category.
// `parent` puts a category in a second row under its parent's button instead of the main row.
// A parent draws from its own topics and keywords plus all of its children's (see topicsOf),
// so its "All ..." button covers the whole group. `allLabel` renames that button.
export const CATEGORIES = [
  { id: 'history', label: 'History', otd: true, topics: ['history', 'military-and-warfare'], keywords: ['history', 'archaeology', 'medieval', 'ancient'] },

  { id: 'science', label: 'Science', topics: ['stem'], keywords: [] },
  { id: 'physics', label: 'Physics', parent: 'science', topics: ['physics'], keywords: ['physics', 'laboratory', 'particle', 'optics'] },
  { id: 'chemistry', label: 'Chemistry', parent: 'science', topics: ['chemistry'], keywords: ['chemistry', 'laboratory', 'crystal', 'chemical reaction'] },
  { id: 'math', label: 'Math', parent: 'science', topics: ['mathematics'], keywords: ['geometry', 'mathematics', 'fractal', 'polyhedron'] },
  { id: 'space', label: 'Space', parent: 'science', topics: ['space'], keywords: ['astronomy', 'galaxy', 'nebula', 'planet'] },

  { id: 'nature', label: 'Nature', topics: ['biology', 'earth-and-environment'], keywords: ['wildlife', 'forest', 'mammal', 'bird', 'insect'] },

  { id: 'tech', label: 'Tech', topics: ['technology'], keywords: ['invention', 'machine'] },
  { id: 'computing', label: 'Computing', parent: 'tech', topics: ['computing', 'software'], keywords: ['computer', 'server', 'circuit board', 'keyboard'] },
  { id: 'engineering', label: 'Engineering', parent: 'tech', topics: ['engineering'], keywords: ['engineering', 'dam', 'machinery', 'power plant'] },
  { id: 'transport', label: 'Transport', parent: 'tech', topics: ['transportation'], keywords: ['locomotive', 'aircraft', 'ship', 'bridge'] },

  { id: 'health', label: 'Health', topics: ['medicine-and-health'], keywords: ['anatomy', 'medicine', 'microscopy'] },

  { id: 'arts', label: 'Arts', topics: [], keywords: [] },
  { id: 'visual', label: 'Visual arts', parent: 'arts', topics: ['visual-arts'], keywords: ['painting', 'sculpture', 'museum', 'drawing'] },
  { id: 'music', label: 'Music', parent: 'arts', topics: ['music'], keywords: ['musical instrument', 'orchestra', 'concert', 'piano'] },
  { id: 'stage', label: 'Stage', parent: 'arts', topics: ['performing-arts'], keywords: ['theatre', 'ballet', 'opera', 'dance'] },
  { id: 'architecture', label: 'Architecture', parent: 'arts', topics: ['architecture'], keywords: ['architecture', 'cathedral', 'skyscraper', 'palace'] },
  { id: 'fashion', label: 'Fashion', parent: 'arts', topics: ['fashion'], keywords: ['costume', 'fashion', 'textile', 'clothing'] },
  { id: 'books', label: 'Books', parent: 'arts', topics: ['books', 'literature'], keywords: ['manuscript', 'library', 'book', 'illuminated manuscript'] },

  { id: 'entertainment', label: 'Entertainment', topics: ['entertainment'], keywords: [] },
  { id: 'screen', label: 'Film & TV', parent: 'entertainment', topics: ['films', 'television'], keywords: ['cinema', 'film', 'television', 'film set'] },
  { id: 'games', label: 'Games', parent: 'entertainment', topics: ['video-games'], keywords: ['video game', 'arcade', 'game controller', 'esports'] },
  { id: 'comics', label: 'Comics & anime', parent: 'entertainment', topics: ['comics-and-anime'], keywords: ['comic', 'anime', 'manga', 'cosplay'] },
  { id: 'internet', label: 'Internet', parent: 'entertainment', topics: ['internet-culture'], keywords: ['internet', 'meme', 'website', 'social media'] },
  { id: 'media', label: 'Media', parent: 'entertainment', topics: ['radio', 'media'], keywords: ['radio', 'newspaper', 'printing press', 'broadcast'] },

  { id: 'food', label: 'Food', topics: ['food-and-drink'], keywords: ['cuisine', 'bread', 'market food', 'cooking'] },
  { id: 'sports', label: 'Sports', topics: ['sports'], keywords: ['football', 'athletics', 'stadium', 'olympic'] },
  { id: 'people', label: 'People', topics: ['biography', 'women'], keywords: ['historical portrait', 'inventor', 'scientist'] },

  { id: 'society', label: 'Society', topics: ['society'], keywords: ['protest', 'community'] },
  { id: 'politics', label: 'Politics', parent: 'society', topics: ['politics-and-government'], keywords: ['government', 'parliament', 'election', 'flag'] },
  { id: 'business', label: 'Business', parent: 'society', topics: ['business-and-economics'], keywords: ['economy', 'market', 'bank', 'factory'] },
  { id: 'philosophy', label: 'Philosophy', parent: 'society', topics: ['philosophy-and-religion'], keywords: ['temple', 'cathedral', 'mosque', 'philosopher'] },
  { id: 'education', label: 'Education', parent: 'society', topics: ['education', 'libraries-and-information'], keywords: ['university', 'school', 'library', 'classroom'] },
  { id: 'language', label: 'Language', parent: 'society', topics: ['linguistics'], keywords: ['alphabet', 'inscription', 'calligraphy', 'writing system'] },

  { id: 'world', label: 'World', allLabel: 'Worldwide', topics: ['geographical'], keywords: ['landscape', 'city', 'village', 'coast'] },
  { id: 'africa', label: 'Africa', parent: 'world', topics: ['africa', 'central-africa', 'eastern-africa', 'northern-africa', 'southern-africa', 'western-africa'], keywords: ['Africa', 'Sahara', 'savanna', 'Nile'] },
  { id: 'asia', label: 'Asia', parent: 'world', topics: ['asia', 'central-asia', 'east-asia', 'north-asia', 'south-asia', 'southeast-asia', 'west-asia'], keywords: ['Asia', 'Himalaya', 'temple Asia', 'Silk Road'] },
  { id: 'europe', label: 'Europe', parent: 'world', topics: ['europe', 'eastern-europe', 'northern-europe', 'southern-europe', 'western-europe'], keywords: ['Europe', 'castle', 'Alps', 'old town'] },
  { id: 'americas', label: 'Americas', parent: 'world', topics: ['north-america', 'central-america', 'south-america'], keywords: ['Americas', 'Andes', 'Amazon', 'prairie'] },
  { id: 'oceania', label: 'Oceania', parent: 'world', topics: ['oceania'], keywords: ['Oceania', 'Pacific', 'coral reef', 'Australia'] },
];

export const categoryById = (id) => CATEGORIES.find((c) => c.id === id);

/** The categories shown in the main row: those with a parent are reached through it. */
export const topLevelCategories = () => CATEGORIES.filter((c) => !c.parent);

/** The second-row categories under a main-row category (empty for most). */
export const childrenOf = (id) => CATEGORIES.filter((c) => c.parent === id);

/** The main-row category a category belongs to: itself, or its parent. */
export const topLevelOf = (id) => categoryById(id)?.parent ?? id;

const unique = (list) => [...new Set(list)];

/** Every topic a category draws from: its own, plus its children's, so a parent's "All ..." button covers the group. */
export const topicsOf = (category) => unique([...category.topics, ...childrenOf(category.id).flatMap((c) => c.topics)]);

/** The Commons search terms for a category, gathered the same way as topicsOf. */
export const keywordsOf = (category) => unique([...category.keywords, ...childrenOf(category.id).flatMap((c) => c.keywords)]);

/** Stable identity for a filter: changing it resets the feed. */
export function filterKey(filter) {
  switch (filter.type) {
    case 'category':
      return `category:${filter.id}`;
    case 'tag':
      return `tag:${filter.tag}`;
    case 'search':
      return `search:${filter.query.toLowerCase()}`;
    case 'nearby':
      return 'nearby';
    default:
      return 'all';
  }
}

/** Tag, search and nearby feeds page through a fixed result list instead of sampling at random. */
export const isSequential = (filter) => filter.type === 'tag' || filter.type === 'search' || filter.type === 'nearby';

export function filterLabel(filter) {
  switch (filter.type) {
    case 'category':
      return categoryById(filter.id)?.label ?? 'Topic';
    case 'tag':
      return filter.tag;
    case 'search':
      return `“${filter.query}”`;
    case 'nearby':
      return 'Near you';
    default:
      return 'For you';
  }
}
