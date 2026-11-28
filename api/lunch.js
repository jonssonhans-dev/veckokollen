// api/lunch.js – Felsökning av Skolmaten.se v.49
const SCHOOL_SLUGS = {
  lyckeby: 'lyckebyskolan',
  haga: 'hagaskolan2'
};

const SWEDISH_MONTHS = {
  januari: '01', februari: '02', mars: '03', april: '04',
  maj: '05', juni: '06', juli: '07', augusti: '08',
  september: '09', oktober: '10', november: '11', december: '12'
};

function extractDateIso(itemXml) {
  const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const cleanTitle = titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').toLowerCase();
    const dateParts = cleanTitle.match(/(\d{1,2})\s+(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)(?:\s+(\d{4}))?/);
    if (dateParts) {
      const day = dateParts[1].padStart(2, '0');
      const month = SWEDISH_MONTHS[dateParts[2]];
      const year = dateParts[3] || new Date().getFullYear();
      return `${year}-${month}-${day}`;
    }
  }
  const isoMatch = itemXml.match(/(\d{4}-\d{2}-\d{2})/);
  return isoMatch ? isoMatch[1] : null;
}

async function fetchRssFallback(slug) {
  const res = await fetch(`https://skolmaten.se/api/4/rss/week/${slug}?locale=sv`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Veckokollen)' }
  });
  if (!res.ok) return {};
  const xml = await res.text();
  const map = {};
  (xml.match(/<item[\s\S]*?<\/item>/gi) || []).forEach(itemXml => {
    const iso = extractDateIso(itemXml);
    const desc = itemXml.match(/<description>([\s\S]*?)<\/description>/i);
    if (iso && desc) {
      map[iso] = desc[1]
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .replace(/&lt;br\s*\/?&gt;|<br\s*\/?>/gi, ' / ')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
    }
  });
  return map;
}

module.exports = async function handler(req, res) {
  try {
    const [lyckeby, haga, pageRes] = await Promise.all([
      fetchRssFallback(SCHOOL_SLUGS.lyckeby),
      fetchRssFallback(SCHOOL_SLUGS.haga),
      fetch('https://skolmaten.se/lyckebyskolan?week=49&year=2026', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      })
    ]);

    const html = await pageRes.text();
    // Plocka ut texten runt måndag/tisdag eller API-anrop i koden
    const apiHints = html.match(/\/api\/[a-zA-Z0-9/_-]+/g) || [];
    const textSnippet = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 800);

    res.status(200).json({
      lyckeby,
      haga,
      _debug: {
        status: pageRes.status,
        apiHints: [...new Set(apiHints)],
        textSnippet
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
