import Parser from 'rss-parser';
import fs from 'fs/promises';

const parser = new Parser();

// ---------------------------
// CONFIG
// ---------------------------
const SOURCES = [
  { name: 'PetaPixel', url: 'https://petapixel.com/feed/', weight: 1.3 },
  { name: 'DPReview', url: 'https://www.dpreview.com/feeds/news.xml', weight: 1.5 },
  { name: 'Fstoppers', url: 'https://fstoppers.com/feed', weight: 1.2 },
  { name: 'The Phoblographer', url: 'https://www.thephoblographer.com/feed/', weight: 1.1 },
  { name: 'DIYPhotography', url: 'https://www.diyphotography.net/feed/', weight: 1.1 },
  { name: 'Digital Camera World', url: 'https://www.digitalcameraworld.com/feeds.xml', weight: 1.2 },
  { name: 'Photo Rumors', url: 'https://photorumors.com/feed/', weight: 1.2 },
  { name: 'Newsshooter', url: 'https://www.newsshooter.com/feed/', weight: 1.1 },
  { name: 'Amateur Photographer', url: 'https://www.amateurphotographer.co.uk/feed', weight: 1.0 },
  { name: 'Photography Life', url: 'https://photographylife.com/feed', weight: 1.1 },
  { name: 'Magnum Photos', url: 'https://www.magnumphotos.com/feed/', weight: 0.8 },
  { name: 'World Press Photo', url: 'https://www.worldpressphoto.org/rss/news', weight: 0.8 },
  { name: 'The Guardian Photography', url: 'https://www.theguardian.com/artanddesign/photography/rss', weight: 0.9 },
  { name: 'NYT Lens', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Lens.xml', weight: 0.9 },
  { name: 'British Journal of Photography', url: 'https://www.1854.photography/feed/', weight: 0.9 },
  { name: 'Aperture', url: 'https://aperture.org/feed/', weight: 0.8 },
  { name: 'The Eye of Photography', url: 'https://loeildelaphotographie.com/en/feed/', weight: 0.8 },
  { name: 'LensCulture', url: 'https://www.lensculture.com/feed', weight: 0.8 },
  { name: 'Blind Magazine', url: 'https://blindmagazine.net/feed/', weight: 0.8 }
];

const BRANDS = [
  'Canon','Sony','Nikon','Fujifilm','Panasonic','Leica','OM System','Olympus',
  'Pentax','Ricoh','Hasselblad','DJI','GoPro','Apple','Samsung','Sigma',
  'Tamron','Zeiss','Profoto','Godox','Insta360','Kodak','Polaroid','Phase One',
  'Mamiya','Viltrox','SmallRig','Peak Design','Blackmagic','RED','ARRI'
];

const HARDWARE = [
  'camera','lens','mirrorless','DSLR','sensor','firmware','flash','tripod',
  'drone','gimbal','printer','scanner','filter','bag','strap','monitor',
  'light','microphone','stabilizer','mount','adapter','battery','memory card',
  'SSD','GPU','software','Photoshop','Lightroom','Capture One','DaVinci Resolve',
  'editing','autofocus','IBIS','megapixel','full-frame','APS-C','medium format'
];

// ---------------------------
// HELPERS
// ---------------------------
function countTerms(text, terms) {
  const lower = text.toLowerCase();
  const counts = {};
  for (const term of terms) {
    const t = term.toLowerCase();
    let idx = lower.indexOf(t);
    let count = 0;
    while (idx !== -1) {
      count++;
      idx = lower.indexOf(t, idx + t.length);
    }
    if (count) counts[term] = count;
  }
  return counts;
}

function analyzeArticle(article) {
  const text = `${article.title} ${article.description || ''}`;
  const brandCounts = countTerms(text, BRANDS);
  const hardwareCounts = countTerms(text, HARDWARE);

  const brandMatches = Object.values(brandCounts).reduce((a, b) => a + b, 0);
  const hardwareMatches = Object.values(hardwareCounts).reduce((a, b) => a + b, 0);

  const pubDate = article.date ? new Date(article.date) : new Date();
  const daysOld = Math.max(0, (Date.now() - pubDate.getTime()) / 86400000);
  const recencyScore = Math.max(0, 30 - daysOld) / 30;

  const score =
    brandMatches * 5 +
    hardwareMatches * 3 +
    recencyScore * 10 +
    (article.sourceWeight || 1);

  return { ...article, brandCounts, hardwareCounts, brandMatches, hardwareMatches, score };
}

// ---------------------------
// MAIN
// ---------------------------
async function main() {
  console.log('Fetching feeds...');
  const failed = [];
  const articles = [];

  for (const source of SOURCES) {
    try {
      const feed = await parser.parseURL(source.url);
      for (const item of feed.items.slice(0, 15)) {
        articles.push({
          title: item.title || 'Untitled',
          link: item.link || '',
          date: item.pubDate || item.isoDate || new Date().toISOString(),
          description: (item.contentSnippet || item.content || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 500),
          source: source.name,
          sourceWeight: source.weight
        });
      }
      console.log(`✓ ${source.name} (${feed.items.length} items)`);
    } catch (err) {
      console.warn(`✗ ${source.name}: ${err.message}`);
      failed.push(source.name);
    }
  }

  // Deduplicate
  const seen = new Set();
  const unique = articles.filter(a => {
    const key = a.link || a.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const analyzed = unique.map(analyzeArticle);

  // Build summary
  const brandTotals = {};
  const hardwareTotals = {};
  analyzed.forEach(a => {
    Object.entries(a.brandCounts).forEach(([k, v]) => {
      brandTotals[k] = (brandTotals[k] || 0) + v;
    });
    Object.entries(a.hardwareCounts).forEach(([k, v]) => {
      hardwareTotals[k] = (hardwareTotals[k] || 0) + v;
    });
  });

  const topBrands = Object.entries(brandTotals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topHardware = Object.entries(hardwareTotals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const top5 = [...analyzed].sort((a, b) => b.score - a.score).slice(0, 5);

  const output = {
    lastUpdated: new Date().toISOString(),
    summary: {
      topBrands,
      topHardware,
      totalArticles: analyzed.length,
      failedSources: failed
    },
    top5,
    articles: analyzed
  };

  await fs.writeFile('data.json', JSON.stringify(output, null, 2));
  console.log(`\n✅ Wrote data.json (${analyzed.length} articles, ${failed.length} failures)`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});