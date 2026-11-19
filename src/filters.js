// What the feed is currently showing:
//   { type: 'all' }               the personalised "For you" feed
//   { type: 'category', id }      a broad topic from the nav bar
//   { type: 'tag', tag }          posts carrying one tag (a Wikipedia or Commons category)
//   { type: 'nearby' }            places around the user

export const ALL = { type: 'all' };
export const NEARBY = { type: 'nearby' };
export const categoryFilter = (id) => ({ type: 'category', id });
export const tagFilter = (tag) => ({ type: 'tag', tag });

// `topics` are Wikipedia "articletopic" values (machine-assigned topic labels).
// One is picked at random per request, so a category stays varied.
// `keywords` are Commons search terms, picked the same way, for the images and videos.
export const CATEGORIES = [
  {
    id: 'history',
    label: 'History',
    topics: ['history', 'military-and-warfare'],
    keywords: ['history', 'archaeology', 'medieval', 'ancient'],
    otd: true, // "On this day" cards fit here
  },
  {
    id: 'science',
    label: 'Science',
    topics: ['physics', 'chemistry', 'biology', 'mathematics'],
    keywords: ['laboratory', 'chemistry', 'physics', 'microscope'],
  },
  {
    id: 'nature',
    label: 'Nature',
    topics: ['biology', 'earth-and-environment'],
    keywords: ['wildlife', 'forest', 'mammal', 'bird', 'insect'],
  },
  {
    id: 'space',
    label: 'Space',
    topics: ['space'],
    keywords: ['astronomy', 'galaxy', 'nebula', 'planet'],
  },
  {
    id: 'tech',
    label: 'Tech',
    topics: ['technology', 'computing', 'engineering'],
    keywords: ['engineering', 'machine', 'computer', 'invention'],
  },
  {
    id: 'health',
    label: 'Health',
    topics: ['medicine-and-health'],
    keywords: ['anatomy', 'medicine', 'microscopy'],
  },
  {
    id: 'arts',
    label: 'Arts',
    topics: ['visual-arts', 'music', 'literature', 'architecture', 'performing-arts'],
    keywords: ['painting', 'sculpture', 'architecture', 'museum'],
  },
  {
    id: 'people',
    label: 'People',
    topics: ['biography'],
    keywords: ['historical portrait', 'inventor', 'scientist'],
  },
  {
    id: 'society',
    label: 'Society',
    topics: ['politics-and-government', 'philosophy-and-religion', 'business-and-economics', 'society'],
    keywords: ['government', 'parliament', 'economy', 'temple'],
  },
  {
    id: 'world',
    label: 'World',
    topics: ['geographical', 'africa', 'asia', 'europe', 'south-america', 'north-america', 'oceania'],
    keywords: ['landscape', 'city', 'village', 'coast'],
  },
];

export const categoryById = (id) => CATEGORIES.find((c) => c.id === id);

/** Stable identity for a filter: changing it resets the feed. */
export function filterKey(filter) {
  switch (filter.type) {
    case 'category':
      return `category:${filter.id}`;
    case 'tag':
      return `tag:${filter.tag}`;
    case 'nearby':
      return 'nearby';
    default:
      return 'all';
  }
}

/** Tag and nearby feeds page through a fixed result list instead of sampling at random. */
export const isSequential = (filter) => filter.type === 'tag' || filter.type === 'nearby';

export function filterLabel(filter) {
  switch (filter.type) {
    case 'category':
      return categoryById(filter.id)?.label ?? 'Topic';
    case 'tag':
      return filter.tag;
    case 'nearby':
      return 'Near you';
    default:
      return 'For you';
  }
}
