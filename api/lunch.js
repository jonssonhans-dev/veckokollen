// api/lunch.js – Hämtar innevarande och nästa vecka direkt från Skolmaten.se:s webbsida
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

// Rekursiv hjälpfunktion som plockar ut alla datum + rätter ur Skolmatens sid-JSON
function extractMealsFromJson(obj, targetMap) {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    obj.forEach(item => extractMealsFromJson(item, targetMap));
    return;
  }

  // Letar efter dag-objekt med datum (YYYY-MM-DD) och lista över rätter (meals/courses)
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

async function fetchSchoolPage(slug, week, year) {
  const url = `https://skolmaten.se/${slug}?week=${week}&year=${year}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html'
    }
  });
  if (!res.ok) return {};

  const html = await res.text();
  const menuByDate = {};

  // 1. Plocka ut Next.js-datan (__NEXT_DATA__) som Skolmaten.se bygger på
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const parsed = JSON.parse(nextDataMatch[1]);
      extractMealsFromJson(parsed, menuByDate);
    } catch (e) {}
  }

  // 2. Fallback: sök efter inbäddad JSON i övriga script-taggar (Next.js App Router)
  if (Object.keys(menuByDate).length === 0) {
    const isoRegex = /"date"\s*:\s*"(\d{4}-\d{2}-\d{2})[^"]*"[\s\S]{0,600}?"(?:value|name|title)"\s*:\s*"([^"]+)"/g;
    let m;
    while ((m = isoRegex.exec(html)) !== null) {
      const iso = m[1];
      const dish = m[2].replace(/\\u002F/g, '/').trim();
      if (dish && !dish.startsWith('http')) {
        menuByDate[iso] = menuByDate[iso] ? `${menuByDate[iso]} / ${dish}` : dish;
      }
    }
  }

  return menuByDate;
}

async function fetchTwoWeeksForSchool(slug) {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 86400000);
  const w1 = getISOWeekAndYear(now);
  const w2 = getISOWeekAndYear(nextWeek);

  const [currMenu, nextMenu] = await Promise.all([
    fetchSchoolPage(slug, w1.week, w1.year),
    fetchSchoolPage(slug, w2.week, w2.year)
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
