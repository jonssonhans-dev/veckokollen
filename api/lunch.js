// api/lunch.js – Anpassad för Skolmaten.se:s exakta RSS-struktur
const SCHOOLS = {
  lyckeby: 'https://skolmaten.se/api/4/rss/week/hagaskolan2?locale=sv',
  haga: 'https://skolmaten.se/api/4/rss/week/lyckebyskolan?locale=sv'
};

const SWEDISH_MONTHS = {
  januari: '01', februari: '02', mars: '03', april: '04',
  maj: '05', juni: '06', juli: '07', augusti: '08',
  september: '09', oktober: '10', november: '11', december: '12'
};

function extractDateIso(itemXml) {
  // 1. Testa att hitta datum i <title> (t.ex. "Onsdag 25 november 2026" eller "25 november")
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

  // 2. Testa att hitta YYYY-MM-DD var som helst i <guid> eller <link>
  const isoMatch = itemXml.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  // 3. Fallback till <pubDate>
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

async function fetchSchoolRss(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Veckokollen)' }
  });
  if (!res.ok) return { _error: `HTTP ${res.status}` };

  const xml = await res.text();
  const menuByDate = {};
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

      if (cleanFood) menuByDate[iso] = cleanFood;
    }
  });

  // Om det fortfarande blir tomt, skicka med rå-utdrag för felsökning
  if (Object.keys(menuByDate).length === 0) {
    return { _debug_sample: xml.slice(0, 400) };
  }

  return menuByDate;
}

module.exports = async function handler(req, res) {
  try {
    const [lyckeby, haga] = await Promise.all([
      fetchSchoolRss(SCHOOLS.lyckeby),
      fetchSchoolRss(SCHOOLS.haga)
    ]);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json({ lyckeby, haga });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
