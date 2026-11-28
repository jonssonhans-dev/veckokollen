// api/lunch.js – Hämtar innevarande och nästa vecka direkt från Skolmaten.se:s JSON-API
const SCHOOL_SLUGS = {
  lyckeby: 'lyckebyskolan',
  haga: 'hagaskolan2'
};

function getISOWeekAndYear(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

// Rekursiv hjälpfunktion som plockar ut datum (YYYY-MM-DD) och dagens rätter ur JSON-svaret
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
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Veckokollen)',
      'Accept': 'application/json'
    }
  });
  if (!res.ok) return {};

  const data = await res.json();
  const menuByDate = {};
  extractMealsFromJson(data, menuByDate);
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
