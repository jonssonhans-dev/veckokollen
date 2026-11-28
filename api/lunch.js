// api/lunch.js – Hämtar v.48 och v.49 från Skolmaten.se för Lyckeby- och Hagaskolan
const SCHOOL_SLUG = 'lyckebyskolan';

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

async function fetchWeekMenu(week, year) {
  const url = `https://skolmaten.se/api/4/menu/school/${SCHOOL_SLUG}?year=${year}&week=${week}`;
  const res = await fetch(url, { headers: SKOLMATEN_HEADERS });
  if (!res.ok) return {};

  const data = await res.json();
  const menuByDate = {};
  const days = data?.WeekState?.Days || [];

  days.forEach(day => {
    if (!day.date || day.cancelled) return;
    const iso = day.date.slice(0, 10);
    const meals = (day.Meals || [])
      .map(m => (m.name || '').replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);

    if (meals.length > 0) {
      menuByDate[iso] = meals.join(' / ');
    }
  });

  return menuByDate;
}

module.exports = async function handler(req, res) {
  try {
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 86400000);
    const w1 = getISOWeekAndYear(now);
    const w2 = getISOWeekAndYear(nextWeek);

    const [currMenu, nextMenu] = await Promise.all([
      fetchWeekMenu(w1.week, w1.year),
      fetchWeekMenu(w2.week, w2.year)
    ]);

    const combinedMenu = { ...currMenu, ...nextMenu };

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json({
      lyckeby: combinedMenu,
      haga: combinedMenu
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
