// api/lunch.js – Använder Skolmatens client-token för att hämta JSON för v.48 & v.49
const SCHOOL_SLUGS = {
  lyckeby: 'lyckebyskolan',
  haga: 'hagaskolan2'
};

const SKOLMATEN_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'sv,en;q=0.9',
  'client-token': 'web-eaa12e50-c84c-4b4a-9cfe-4e3fcbcd9165',
  'client-version': '1.6.1-1',
  'Referer': 'https://skolmaten.se/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

function getISOWeekAndYear(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

function extractMealsFromJson(obj, targetMap) {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    obj.forEach(item => extractMealsFromJson(item, targetMap));
    return;
  }

  const dateVal = obj.date || obj.dayDate || obj.isoDate;
  const mealList = obj.meals || obj.courses || obj.dishes || obj.items;

  if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateVal) && Array.isArray(mealList)) {
    const iso = dateVal.slice(0, 10);
    const names = mealList
      .map(m => (typeof m === 'string' ? m : (m.value || m.name || m.title || '')))
      .map(s => s.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);

    if (names.length > 0) {
      targetMap[iso] = names.join(' / ');
    }
  }

  Object.values(obj).forEach(val => {
    if (val && typeof val === 'object') extractMealsFromJson(val, targetMap);
  });
}

async function fetchSchoolWeekJson(slug, week, year) {
  const url = `https://skolmaten.se/api/4/menu/school/${slug}?year=${year}&week=${week}`;
  const res = await fetch(url, { headers: SKOLMATEN_HEADERS });
  if (!res.ok) return { _error: `HTTP ${res.status}` };

  const data = await res.json();
  const menuByDate = {};
  extractMealsFromJson(data, menuByDate);

  if (Object.keys(menuByDate).length === 0) {
    return { _rawSample: JSON.stringify(data).slice(0, 700) };
  }
  return menuByDate;
}

async function fetchTwoWeeksForSchool(slug) {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 86400000);
  const w1 = getISOWeekAndYear(now);
  const w2 = getISOWeekAndYear(nextWeek);

  const [currMenu, nextMenu] = await Promise.all([
    fetchSchoolWeekJson(slug, w1.week, w1.year),
    fetchSchoolWeekJson(slug, w2.week, w2.year)
  ]);

  return { ...currMenu, ...nextMenu };
}

module.exports = async function handler(req, res) {
  try {
    const [lyckeby, haga] = await Promise.all([
      fetchTwoWeeksForSchool(SCHOOL_SLUGS.lyckeby),
      fetchTwoWeeksForSchool(SCHOOL_SLUGS.haga)
    ]);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json({ lyckeby, haga });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
