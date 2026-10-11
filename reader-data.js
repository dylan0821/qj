'use strict';
// The website only loads public reading data. All personal records stay in this browser.
window.StrongReader = (() => {
  const base = new URL('./', document.baseURI);
  const storageKey = 'qj-reader-personal-v1:' + base.pathname;
  let catalogPromise;
  const detailCache = new Map();
  const key = value => String(value || '').toLowerCase().replace(/\s+/g, '').replace(/新高考/g, '新课标').replace(/[^\p{L}\p{N}_]/gu, '');
  const grams = value => new Set(Array.from({length: Math.max(0, value.length - 1)}, (_, i) => value.slice(i, i + 2)));
  const overlap = (needle, text) => {
    if (text.includes(needle)) return 1;
    const a = grams(needle), b = grams(text);
    return a.size ? [...a].filter(g => b.has(g)).length / a.size : 0;
  };
  async function json(path, refresh = false) {
    return window.QJAuth.json(path);
  }
  async function protectImages(detail) {
    for (const field of ['question_html','answered_html','solution_html','inline_answer_html']) {
      if (!detail[field]) continue;
      const template=document.createElement('template');template.innerHTML=detail[field];
      await Promise.all([...template.content.querySelectorAll('img[src]')].map(async img=>{
        const path=img.getAttribute('src');
        if (path.startsWith('assets/questions/')) img.src=await window.QJAuth.image(path);
      }));
      detail[field]=template.innerHTML;
    }
    return detail;
  }
  function catalog(refresh = false) {
    if (refresh || !catalogPromise) {
      catalogPromise = json('data/catalog.json', refresh).then(data => {
        data.byId = new Map(data.items.map(row => [row.id, row]));
        return data;
      }).catch(error => {catalogPromise = null; throw error;});
    }
    return catalogPromise;
  }
  function personal(data) {
    let saved;
    try {saved = JSON.parse(localStorage.getItem(storageKey) || 'null');} catch (_) {}
    const valid = id => typeof id === 'string' && data.byId.has(id);
    const unique = ids => [...new Set(Array.isArray(ids) ? ids.filter(valid) : [])];
    return {version: 1,
      questions: Object.fromEntries(Object.entries(saved?.questions || {}).filter(([id, value]) => valid(id) && value?.favorite === true).map(([id]) => [id, {favorite: true}])),
      basket: unique(saved?.basket).slice(0, 200), recent: unique(saved?.recent).slice(0, 99)};
  }
  function updatePersonal(action, data) {
    const saved = personal(data), {id, value} = action;
    if (['favorite', 'basket-add', 'basket-remove', 'basket-move', 'recent-add'].includes(action.action) && !data.byId.has(id)) throw new Error('题目不存在。');
    switch (action.action) {
      case 'favorite':
        if (typeof value !== 'boolean') throw new Error('收藏值无效。');
        if (value) saved.questions[id] = {favorite: true}; else delete saved.questions[id];
        break;
      case 'recent-add': saved.recent = [id, ...saved.recent.filter(q => q !== id)].slice(0, 99); break;
      case 'basket-add':
        if (!saved.basket.includes(id)) {
          if (saved.basket.length >= 200) throw new Error('选题篮最多保存 200 道题。');
          saved.basket.push(id);
        }
        break;
      case 'basket-remove': saved.basket = saved.basket.filter(q => q !== id); break;
      case 'basket-clear': saved.basket = []; break;
      case 'basket-move': {
        if (![-1, 1].includes(action.offset)) throw new Error('移动方向无效。');
        const i = saved.basket.indexOf(id), j = i + action.offset;
        if (i >= 0 && j >= 0 && j < saved.basket.length) [saved.basket[i], saved.basket[j]] = [saved.basket[j], saved.basket[i]];
        break;
      }
      case 'basket-reorder':
        if (!Array.isArray(action.ids) || action.ids.length !== saved.basket.length || new Set(action.ids).size !== saved.basket.length || action.ids.some(q => !saved.basket.includes(q))) throw new Error('选题篮顺序无效。');
        saved.basket = [...action.ids]; break;
      default: throw new Error('未知操作。');
    }
    try {localStorage.setItem(storageKey, JSON.stringify(saved));}
    catch (_) {throw new Error('浏览器无法保存记录，请检查本地存储设置。');}
    return saved;
  }
  function queryPlan(query, data) {
    const excluded = [];
    let positive = query.replace(/(?:不是|不要|排除)\s*([^，,。；;]{1,16}?)(?:知识点|专题)?\s*(?:，|,|。|；|;|而是)/g, (_, term) => {excluded.push(key(term)); return '';});
    positive = positive.replace(/^(?:而是)?(?:想找|要找|查找|搜索|找|考查|考察|考)/, '').replace(/(?:核心素养|能力)?的?(?:题目?|真题|例题)$/, '').trim() || query;
    let parts = positive.trim().split(/\s+/);
    if (parts.length === 1) {
      const compact = key(positive).replace(/^(?:帮我)?(?:找|搜索|查找|想找|要找|适合讲|关于)/, '').replace(/(?:的题目?|题目?|真题|例题)$/, '');
      const concepts = [], occupied = new Set();
      for (const concept of data.concepts) {
        const value = key(concept), start = compact.indexOf(value);
        if (start >= 0 && ![...value].some((_, i) => occupied.has(start + i))) {
          concepts.push(concept); for (let i = start; i < start + value.length; i++) occupied.add(i);
        }
      }
      parts = concepts.length >= 2 ? concepts : [compact || positive];
    }
    return {excluded, whole: key(positive), terms: parts.map(term => {
      const value = key(term), variants = new Set([value]);
      for (const group of data.aliases) {
        const values = group.map(key);
        if (values.some(alias => alias.includes(value) || value.includes(alias))) values.forEach(alias => variants.add(alias));
      }
      return {value, variants: [...variants].filter(Boolean)};
    })};
  }
  function relevance(row, plan) {
    const weights = {'方法': 105, '能力': 100, '核心素养': 94, '知识点': 90, '解题思路': 72, '来源': 55, '题目': 45};
    let total = 0; const reasons = [];
    for (const term of plan.terms) {
      let best = 0, reason = '';
      for (const variant of term.variants) for (const [name, text] of Object.entries(row.fields)) {
        const exact = text.includes(variant);
        if (term.value.length <= 3 && !exact) continue;
        const score = weights[name] * (exact ? 1.25 : overlap(variant, text));
        if (score > best) {best = score; reason = name;}
      }
      if (best < (term.value.length <= 3 ? 1 : .38 * 105)) return {score: 0};
      total += best; reasons.push(reason);
    }
    if (plan.whole && row.search.includes(plan.whole)) total += 120;
    const compact = plan.whole.replace(/[与和及、]/g, ''), topic = key(row.topic_title).replace(/[与和及、]/g, '');
    if ((compact && topic.includes(compact)) || (plan.terms.length && plan.terms.every(term => topic.includes(term.value)))) total += 180;
    for (const [name, text] of Object.entries(row.fields)) if (plan.whole && text.includes(plan.whole)) total += weights[name] * 1.5;
    const labels = ['方法', '能力', '核心素养', '知识点', '解题思路', '题目', '来源'].filter(name => reasons.includes(name));
    const detail = labels.includes('方法') ? row.method_tags.map(t => t.title).join('、') : labels.includes('知识点') ? row.topic_title : '';
    return {score: total, reason: '匹配' + labels.slice(0, 2).join('、') + (detail ? ' · ' + detail : '')};
  }
  function summary(row, reason) {
    const {paper_key, chapter, topic, fields, search, ...result} = row;
    if (reason) result.match_reason = reason;
    return result;
  }
  function search(params, data) {
    const records = personal(data), collection = params.get('collection'), query = (params.get('q') || '').trim();
    const selected = collection === 'basket' ? records.basket : collection === 'recent' ? records.recent : collection === 'favorite' ? Object.keys(records.questions) : null;
    const selectedSet = selected && new Set(selected), mode = params.get('view') === 'classification' ? 'classification' : 'paper';
    const order = selected && ['basket', 'recent'].includes(collection) && !query ? selected : data.orders[mode];
    const plan = query ? queryPlan(query, data) : null;
    let rows = order.map(id => data.byId.get(id)).filter(Boolean).filter(row => {
      if (selectedSet && !selectedSet.has(row.id)) return false;
      if (params.get('paper') && params.get('paper') !== row.paper_key) return false;
      if (params.get('chapter') && params.get('chapter') !== row.chapter) return false;
      if (params.get('topic') && params.get('topic') !== row.topic) return false;
      return !plan?.excluded.some(term => row.fields['知识点'].includes(term));
    }).map(row => ({row, ...(plan ? relevance(row, plan) : {score: 0})}));
    if (plan) rows = rows.filter(item => item.score > 0).sort((a, b) => b.score - a.score || data.orders.paper.indexOf(a.row.id) - data.orders.paper.indexOf(b.row.id));
    const limit = 30, focus = rows.findIndex(item => item.row.id === params.get('focus'));
    const page = focus >= 0 ? Math.floor(focus / limit) + 1 : Math.max(1, Number(params.get('page')) || 1);
    return {items: rows.slice((page - 1) * limit, page * limit).map(item => summary(item.row, item.reason)), total: rows.length,
      page, pages: Math.max(1, Math.ceil(rows.length / limit)), limit, ranked: !!plan,
      similar_source: null, similar_to: '', similar_scope_label: '', enrichment_preview: false};
  }
  function suggestions(query, data) {
    const needle = key(query), kinds = ['知识点', '方法', '能力', '核心素养', '解题思路', '分类', '试卷', '关键词'];
    if (!needle) return {items: []};
    const rows = data.suggestions.map(item => ({...item, score: item.key.startsWith(needle) ? 0 : item.key.includes(needle) ? 1 : needle.length >= 3 && overlap(needle, item.key) >= .55 ? 3 - overlap(needle, item.key) : 99})).filter(item => item.score < 99);
    rows.sort((a, b) => a.score - b.score || kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || b.count - a.count || a.key.length - b.key.length);
    const counts = {}, items = [];
    for (const item of rows) {
      if ((counts[item.kind] || 0) >= 4) continue;
      counts[item.kind] = (counts[item.kind] || 0) + 1;
      items.push({value: item.value, kind: item.kind}); if (items.length === 8) break;
    }
    return {items};
  }
  async function request(url, body) {
    await window.QJAuth.checkSession();
    const parsed = new URL(url, base), path = parsed.pathname, params = parsed.searchParams;
    const data = await catalog();
    if (path === '/api/config') return data.config;
    if (path === '/api/refresh') {detailCache.clear(); return (await catalog(true)).config;}
    if (path === '/api/personal') return body === undefined ? personal(data) : updatePersonal(body, data);
    if (path === '/api/search') return search(params, data);
    if (path === '/api/suggestions') return suggestions(params.get('q'), data);
    if (path === '/api/paper-navigation') {
      const paper = params.get('paper');
      return {paper, items: data.items.filter(row => row.paper_key === paper).sort((a, b) => parseInt(a.number, 10) - parseInt(b.number, 10)).map(({id, number, type, has_answer}) => ({id, number, type, has_answer}))};
    }
    if (path === '/api/suggest-title') {
      const rows = (body.ids || []).map(id => data.byId.get(id)).filter(Boolean), first = rows[0];
      const title = first && rows.every(row => row.paper_key === first.paper_key) ? first.year + first.paper : first && rows.every(row => row.topic === first.topic) ? first.topic_title : first && rows.every(row => row.module === first.module) ? first.module : '强基数学练习';
      return {title};
    }
    if (path.startsWith('/api/question/')) {
      const id = path.split('/').pop();
      if (!data.byId.has(id)) throw new Error('题目不存在，请刷新题库。');
      if (!detailCache.has(id)) detailCache.set(id, json('data/questions/' + id + '.json').then(protectImages).catch(error => {detailCache.delete(id); throw error;}));
      return detailCache.get(id);
    }
    throw new Error('请求未完成，请刷新重试。');
  }
  return {request};
})();
