// Igice cy'ibisesengura by'ubucuruzi ("AI Business Insights").
//
// Iyi verisiyo ikoresha calculations (statistics) kugira ngo itange ubumenyi
// bufatika ku bucuruzi (icyagurishijwe cyane, uko ibyacurujwe byifashe iminsi
// ishize, iburira ku bicuruzwa bigiye kubura, n'ibindi). Niba ushyizeho
// ANTHROPIC_API_KEY muri .env, dashboard ishobora no gusaba Claude gukora
// incamake y'inyandiko (narrative) ivuye kuri iyi mibare - reba
// generateNarrative() munsi.

function computeInsights(products, sales) {
  const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
  const totalItemsSold = sales.reduce((s, x) => s + x.qty, 0);

  const revenueByProduct = {};
  sales.forEach(s => {
    revenueByProduct[s.productName] = (revenueByProduct[s.productName] || 0) + s.total;
  });
  const topProduct = Object.entries(revenueByProduct).sort((a, b) => b[1] - a[1])[0];

  const now = Date.now();
  const last24h = sales.filter(s => now - new Date(s.timestamp).getTime() <= 24 * 3600 * 1000);
  const prev24h = sales.filter(s => {
    const t = now - new Date(s.timestamp).getTime();
    return t > 24 * 3600 * 1000 && t <= 48 * 3600 * 1000;
  });
  const revToday = last24h.reduce((s, x) => s + x.total, 0);
  const revYesterday = prev24h.reduce((s, x) => s + x.total, 0);
  let trend = 'stable';
  let trendPct = 0;
  if (revYesterday > 0) {
    trendPct = Math.round(((revToday - revYesterday) / revYesterday) * 100);
    trend = trendPct > 5 ? 'up' : trendPct < -5 ? 'down' : 'stable';
  } else if (revToday > 0) {
    trend = 'up';
    trendPct = 100;
  }

  const lowStock = products.filter(p => !p.deletedAt && p.stock <= 5);

  // Amafaranga y'icyumweru n'ukwezi gushize
  const last7d = sales.filter(s => now - new Date(s.timestamp).getTime() <= 7 * 24 * 3600 * 1000);
  const last30d = sales.filter(s => now - new Date(s.timestamp).getTime() <= 30 * 24 * 3600 * 1000);
  const revenueThisWeek = last7d.reduce((s, x) => s + x.total, 0);
  const revenueThisMonth = last30d.reduce((s, x) => s + x.total, 0);

  // Umubare w'amagurisha n'igiciro cy'impuzandengo
  const salesCount = sales.length;
  const avgSaleValue = salesCount > 0 ? totalRevenue / salesCount : 0;

  // Ibicuruzwa 5 byagurishijwe cyane (mu mafaranga)
  const qtyByProduct = {};
  sales.forEach(s => { qtyByProduct[s.productName] = (qtyByProduct[s.productName] || 0) + s.qty; });
  const topProducts = Object.entries(revenueByProduct)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, revenue]) => ({ name, revenue, qty: qtyByProduct[name] || 0 }));

  // Amafaranga yinjiye buri munsi mu minsi 7 ishize (kugira ngo tugaragaze graph)
  const dailyRevenue = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = now - i * 24 * 3600 * 1000;
    const dayLabel = new Date(dayStart).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
    const dayTotal = sales
      .filter(s => {
        const t = now - new Date(s.timestamp).getTime();
        return t >= i * 24 * 3600 * 1000 && t < (i + 1) * 24 * 3600 * 1000;
      })
      .reduce((s, x) => s + x.total, 0);
    dailyRevenue.push({ label: dayLabel, revenue: dayTotal });
  }

  // Umunsi wagurishijwemo byinshi cyane mu minsi 7 ishize
  const bestDay = [...dailyRevenue].sort((a, b) => b.revenue - a.revenue)[0];

  // Ubwinshi bwose bw'ibicuruzwa bisigaye (byose butarimo ibyasibwe)
  const totalStockValue = products
    .filter(p => !p.deletedAt)
    .reduce((s, p) => s + p.stock * p.price, 0);

  return {
    totalRevenue,
    totalItemsSold,
    topProduct: topProduct ? { name: topProduct[0], revenue: topProduct[1] } : null,
    topProducts,
    revenueToday: revToday,
    revenueYesterday: revYesterday,
    revenueThisWeek,
    revenueThisMonth,
    salesCount,
    avgSaleValue,
    dailyRevenue,
    bestDay: bestDay && bestDay.revenue > 0 ? bestDay : null,
    totalStockValue,
    trend,
    trendPct,
    lowStockCount: lowStock.length,
    lowStockItems: lowStock.map(p => p.name)
  };
}

// Optional: niba hari ANTHROPIC_API_KEY, saba Claude gukora incamake y'inyandiko
// ivuye kuri stats. Niba key idahari, garuka null (frontend ikoresha stats gusa).
async function generateNarrative(insights, language = 'rw') {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const langLabel = { en: 'English', rw: 'Kinyarwanda', fr: 'French' }[language] || 'English';

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Write a short (3-4 sentence), friendly business insight summary in ${langLabel} based on this data: ${JSON.stringify(insights)}. Be specific and encouraging, mention concrete numbers.`
        }]
      })
    });
    const json = await resp.json();
    const text = json.content?.map(b => b.text || '').join(' ').trim();
    return text || null;
  } catch (e) {
    console.error('AI narrative generation failed:', e.message);
    return null;
  }
}

module.exports = { computeInsights, generateNarrative };
