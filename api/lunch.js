import { XMLParser } from 'fast-xml-parser';

const SCHOOLS = {
  lyckeby: 'https://skolmaten.se/lyckebyskolan/rss/weeks/',
  haga: 'https://skolmaten.se/hagaskolan-haninge/rss/weeks/'
};

async function fetchSchoolRss(url) {
  const res = await fetch(url);
  const xml = await res.text();
  const parser = new XMLParser();
  const parsed = parser.parse(xml);
  const items = parsed?.rss?.channel?.item || [];
  const list = Array.isArray(items) ? items : [items];

  const menuByDate = {};
  list.forEach(item => {
    const d = new Date(item.pubDate);
    if (!isNaN(d)) {
      const iso = d.toISOString().split('T')[0];
      const cleanFood = (item.description || '')
        .replace(/<br\s*\/?>/gi, ' / ')
        .replace(/<[^>]+>/g, '')
        .trim();
      menuByDate[iso] = cleanFood;
    }
  });
  return menuByDate;
}

export default async function handler(req, res) {
  try {
    const [lyckeby, haga] = await Promise.all([
      fetchSchoolRss(SCHOOLS.lyckeby),
      fetchSchoolRss(SCHOOLS.haga)
    ]);

    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate');
    res.status(200).json({ lyckeby, haga });
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte hämta skolmaten', details: error.message });
  }
}
