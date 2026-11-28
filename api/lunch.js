// api/lunch.js – Hämtar både innevarande och nästa vecka från Skolmaten.se
const SCHOOL_SLUGS = {
  lyckeby: 'lyckebyskolan',
  haga: 'hagaskolan2'
};

const SWEDISH_MONTHS = {
  januari: '01', februari: '02', mars: '03', april: '04',
  maj: '05', juni: '06', juli: '07', augusti: '08',
  september: '09', oktober: '10', november: '11', december: '12'
};

function getISOWeekAndYear(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

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
  if (isoMatch) return isoMatch[1];

  const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/i);
  if (pubDateMatch) {
    const d = new Date(pubDateMatch[1].trim());
    if (!isNaN(d)) {
      const swedishDate = new Date(d.getTime() + 2 * 3600 * 1000);
      return swedishDate.toISOString().split('T')[0];
    }
  }

  return null;
}

function parseRssXml(xml, targetMap) {
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  itemMatches.forEach(itemXml => {
    const iso = extractDateIso(itemXml);
    const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/i);

    if (iso && descMatch) {
      const cleanFood = descMatch[1]
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .replace(/&lt;br\s*\/?&gt;|<br\s*\/?>/gi, ' / ')
        .replace(/&lt;[^&]+&gt;|<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();

      if (cleanFood) targetMap[iso] = cleanFood;
    }
  });
}

async function fetchSchoolTwoWeeks(slug) {
  const menuByDate = {};
  const headers = { 'User-Agent': 'Mozilla/5.0 (Veckokollen)' };

  // Räkna ut innevarande vecka och nästa vecka (t.ex. v.48 och v.49)
  const now = new Date();
  const nextWeekDate = new Date(now.getTime() + 7 * 86400000);
  const curr = getISOWeekAndYear(now);
  const next = getISOWeekAndYear(nextWeekDate);

  // Hämta både multi-week RSS och specifik vecka för innevarande + nästa vecka parallellt
  const urls = [
    `https://skolmaten.se/api/4/rss/weeks/${slug}?locale=sv&limit=2`,
    `https://skolmaten.se/api/4/rss/week/${slug}?locale=sv&week=${curr.week}&year=${curr.year}`,
    `https://skolmaten.se/api/4/rss/week/${slug}?locale=sv&week=${next.week}&year=${next.year}`
  ];

  const responses = await Promise.allSettled(
    urls.map(u => fetch(u, { headers }).then(r => (r.ok ? r.text() : '')))
  );

  responses.forEach(res => {
    if (res.status === 'fulfilled' && res.value) {
      parseRssXml(res.value, menuByDate);
    }
  });

  return menuByDate;
}

module.exports = async function handler(req, res) {
  try {
    const [lyckeby, haga] = await Promise.all([
      fetchSchoolTwoWeeks(SCHOOL_SLUGS.lyckeby),
      fetchSchoolTwoWeeks(SCHOOL_SLUGS.haga)
    ]);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json({ lyckeby, haga });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
