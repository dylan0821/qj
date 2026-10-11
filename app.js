'use strict';
const $ = (id) => document.getElementById(id);
$('welcome-notice').showModal();
const state = {view: 'paper', page: 1, paper: '', chapter: '', topic: '', enrichmentSystem: '', enrichmentChapter: '', enrichmentSection: '', config: null,
  result: null, current: null, answers: false, searchSeq: 0, detailSeq: 0, navTerm: '',
  collection: '', similar: '', similarSystem: '', personal: {questions:{}, basket:[], recent:[]}, restoring: true, resume: null};
const VIEW_KEY = 'qj-reader-view-v2';
const BASKET_TITLE_KEY = 'qj-reader-basket-title-v1';
let saveTimer, personalQueue = Promise.resolve(), suggestionSeq = 0, suggestionIndex = -1;
let answerTransitioning = false;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function readView() {
  try {return JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');} catch (_) {return null;}
}
function readBasketTitle() {
  try {return localStorage.getItem(BASKET_TITLE_KEY) || '';} catch (_) {return '';}
}
function saveBasketTitle(value) {
  try {localStorage.setItem(BASKET_TITLE_KEY, String(value || '').trim());} catch (_) {}
}
function saveView() {
  if (state.restoring) return;
  const data = {view:state.view, page:state.page, paper:state.paper, chapter:state.chapter, topic:state.topic,
    enrichmentSystem:state.enrichmentSystem, enrichmentChapter:state.enrichmentChapter, enrichmentSection:state.enrichmentSection, similar:state.similar, similarSystem:state.similarSystem,
    collection:state.collection, navTerm:state.navTerm, query:$('search').value,
    id:state.current && state.current.id, answers:state.answers, reading:document.querySelector('.content-area').classList.contains('reading'),
    scroll:$('reader-scroll').scrollTop, listScroll:$('results').scrollTop, navScroll:$('navigation').scrollTop,
    openGroups:[...document.querySelectorAll('.nav-group[open]>summary')].map(el=>el.textContent)};
  try {localStorage.setItem(VIEW_KEY, JSON.stringify(data));} catch (_) {}
}
function scheduleSave() {clearTimeout(saveTimer); saveTimer = setTimeout(saveView, 180);}
let toastTimer;
let mathQueue = Promise.resolve();
const escapeHTML = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatPaperDisplay = (s) => String(s == null ? '' : s).replace(/(全国|大纲|新课标|新高考)\s*(III|II|I)\s*卷/g, '$1 $2 卷');
const icon = (name) => '<svg class="icon"><use href="#i-' + name + '"/></svg>';
function setSidebarOpen(open) {
  document.querySelector('.workspace').classList.toggle('nav-open', open);
  $('sidebar-toggle').setAttribute('aria-expanded', String(open));
  $('sidebar-toggle').setAttribute('aria-label', open ? '关闭题库目录' : '打开题库目录');
  $('sidebar-backdrop').hidden = !open;
}
async function api(url, body) {
  return window.StrongReader.request(url, body);
}
function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3000);
}
function typeset(element) {
  mathQueue = mathQueue.catch(() => {}).then(async () => {
    if (!element.isConnected) return;
    if (!window.MathJax || !MathJax.startup) throw new Error('公式显示组件尚未加载。');
    await MathJax.startup.promise;
    if (element.isConnected) await MathJax.typesetPromise([element]);
  }).catch(() => toast('公式显示暂未完成，可尝试刷新页面。'));
  return mathQueue;
}
function clearMath(element) {
  if (window.MathJax && MathJax.typesetClear) MathJax.typesetClear([element]);
}
function query() {
  const p = new URLSearchParams({view:state.view,page:String(state.page)});
  if ($('search').value.trim()) p.set('q',$('search').value.trim());
  for (const key of ['paper','chapter','topic','collection']) if(state[key])p.set(key,state[key]);
  return p;
}
function configure(data) {
  state.config = data;
  $('library-count').textContent = data.total_question_count.toLocaleString() + ' 道强基题 · ' + data.papers.length + ' 卷';
  $('load-time').textContent = 'Dylaaan整理 · 微信：Dylan_PKU';
  renderNavigation();
  if (data.error_count) toast('有 ' + data.error_count + ' 份题目暂未载入，请查看阅读器检查说明。');
}
function renderNavigation() {
  if (!state.config) return;
  const term = state.navTerm.trim().toLowerCase();
  const allActive = !state.paper && !state.chapter && !state.topic && !state.enrichmentSystem && !state.enrichmentChapter && !state.enrichmentSection && !state.collection && !state.similar;
  const allLabel = state.view === 'paper' ? '全部试卷' : state.view === 'classification' ? '全部知识点' : '全部培优体系';
  const allCount = state.view === 'paper' ? state.config.original_count : state.view === 'classification' ? state.config.classified_count : state.config.enrichment_counts.mapped_count + state.config.enrichment_counts.supplement_count + state.config.enrichment_counts.candidate_count;
  let markup = '<button class="nav-all ' + (allActive ? 'active' : '') + '" data-all="1">' +
    allLabel + '<span class="count">' + allCount + '</span></button>';
  if (state.view === 'paper') {
    const groups = new Map();
    for (const p of state.config.papers) {
      if (term && !(p.year + ' ' + p.name).toLowerCase().includes(term)) continue;
      if (!groups.has(p.year)) groups.set(p.year, []);
      groups.get(p.year).push(p);
    }
    for (const [year, papers] of groups) {
      const open = term || papers.some(p => p.key === state.paper);
      markup += '<details class="nav-group" ' + (open ? 'open' : '') + '><summary>' + year + ' 年<span class="year-count"> · ' + papers.length + ' 卷</span></summary>';
      markup += papers.map(p => '<button class="nav-item ' + (p.key === state.paper ? 'active' : '') + '" data-paper="' + escapeHTML(p.key) + '"><span class="nav-name">' + escapeHTML(formatPaperDisplay(p.name).replace(/强基计划/g, '')) + '</span><span class="count">' + p.count + '</span></button>').join('') + '</details>';
    }
  } else if (state.view === 'classification') {
    const groups = new Map();
    for (const t of state.config.topics) {
      if (term && !(t.chapter + ' ' + t.unit + ' ' + t.title).toLowerCase().includes(term)) continue;
      if (!groups.has(t.chapter)) groups.set(t.chapter, []);
      groups.get(t.chapter).push(t);
    }
    for (const [chapter, topics] of groups) {
      const open = term || chapter === state.chapter || topics.some(t => t.id === state.topic);
      markup += '<details class="nav-group chapter-nav" ' + (open ? 'open' : '') + '><summary>' + escapeHTML(chapter) + '</summary>';
      markup += '<button class="chapter-button ' + (chapter === state.chapter ? 'active' : '') + '" data-chapter="' + escapeHTML(chapter) + '">查看本章全部题目</button>';
      markup += topics.map(t => '<button class="nav-item ' + (t.id === state.topic ? 'active' : '') + '" data-topic="' + escapeHTML(t.id) + '"><span class="nav-name">' + escapeHTML(t.title) + '</span><span class="count">' + t.count + '</span></button>').join('') + '</details>';
    }
  } else {
    for (const system of state.config.enrichment_systems) {
      const matches = !term || (system.title + ' ' + system.chapters.map(chapter => chapter.title + ' ' + chapter.sections.map(section => section.title).join(' ')).join(' ')).toLowerCase().includes(term);
      if (!matches) continue;
      const systemOpen = term || system.id === state.enrichmentSystem || system.chapters.some(chapter => chapter.id === state.enrichmentChapter || chapter.sections.some(section => section.id === state.enrichmentSection));
      const systemCountLabel = system.id === 'QJ' ? '题' : '讲义题';
      markup += '<details class="nav-group chapter-nav" ' + (systemOpen ? 'open' : '') + '><summary>' + escapeHTML(system.title) + '<span class="year-count"> · ' + system.lecture_count + ' ' + systemCountLabel + '</span></summary>';
      for (const chapter of system.chapters) {
        const chapterOpen = term || chapter.id === state.enrichmentChapter || chapter.sections.some(section => section.id === state.enrichmentSection);
        markup += '<details class="nav-group enrichment-chapter" ' + (chapterOpen ? 'open' : '') + '><summary>' + escapeHTML(chapter.title) + '</summary>';
        markup += '<button class="chapter-button ' + (chapter.id === state.enrichmentChapter && !state.enrichmentSection ? 'active' : '') + '" data-enrichment-system="' + escapeHTML(system.id) + '" data-enrichment-chapter="' + escapeHTML(chapter.id) + '">本章全部</button>';
        markup += chapter.sections.map(section => {
          const countLabel = section.lecture_count;
          return '<button class="nav-item ' + (section.id === state.enrichmentSection ? 'active' : '') + '" data-enrichment-system="' + escapeHTML(system.id) + '" data-enrichment-chapter="' + escapeHTML(chapter.id) + '" data-enrichment-section="' + escapeHTML(section.id) + '" title="讲义 ' + section.lecture_count + ' 题；真题 ' + section.mapped_count + ' 题；补充 ' + section.supplement_count + ' 题；待确认 ' + section.candidate_count + ' 题"><span class="nav-name">' + escapeHTML(section.title) + '</span><span class="count">' + countLabel + '</span></button>';
        }).join('') + '</details>';
      }
      markup += '</details>';
    }
  }
  $('navigation').innerHTML = markup;
}
function selectionTitle() {
  if (state.random) return '随机';
  if (state.similar) return '相似题';
  if (state.collection) return state.collection === 'recent' ? '最近浏览' : state.collection === 'favorite' ? '我的收藏' : state.collection === 'basket' ? '选题篮' : state.collection;
  if (state.paper) return formatPaperDisplay(state.paper.replace('/', ' ')).replace(/强基计划/g, '');
  if (state.topic) {
    const t = state.config.topics.find(t => t.id === state.topic);
    return t ? t.title : '知识点';
  }
  if (state.view === 'enrichment') {
    for (const system of state.config.enrichment_systems) {
      for (const chapter of system.chapters) {
        const section = chapter.sections.find(item => item.id === state.enrichmentSection);
        if (section) return section.title;
        if (chapter.id === state.enrichmentChapter) return chapter.title;
      }
      if (system.id === state.enrichmentSystem) return system.title;
    }
    return '全部培优体系';
  }
  return state.chapter || (state.view === 'paper' ? '全部试卷' : '全部知识点');
}
function markSelected() {
  document.querySelectorAll('.question-card').forEach(el => {
    const active = !!state.current && el.dataset.id === state.current.id;
    el.classList.toggle('active', active);
    el.setAttribute('aria-current', active ? 'true' : 'false');
  });
  document.querySelectorAll('.paper-number-button').forEach(el => {
    const active = !!state.current && el.dataset.id === state.current.id;
    el.classList.toggle('active', active);
    el.setAttribute('aria-current', active ? 'true' : 'false');
  });
}
async function loadPaperNumberNavigation(seq) {
  const nav=$('paper-number-nav');
  if(state.view!=='paper'||!state.paper||state.collection||state.similar) {nav.hidden=true;nav.replaceChildren();return;}
  try {
    const data=await api('/api/paper-navigation?paper='+encodeURIComponent(state.paper));
    if(seq!==state.searchSeq||data.paper!==state.paper)return;
    nav.innerHTML='<span>题号</span>'+data.items.map(item=>'<button class="paper-number-button" data-id="'+item.id+'" title="'+escapeHTML(item.type+(item.has_answer?' · 有答案':' · 暂无答案'))+'">'+escapeHTML(String(Number(item.number)||item.number))+'</button>').join('');
    nav.hidden=!data.items.length;markSelected();
  } catch(_){nav.hidden=true;nav.replaceChildren();}
}
function updateArrows() {
  const r = state.result;
  const i = r && state.current ? r.items.findIndex(x => x.id === state.current.id) : -1;
  $('question-prev').disabled = i < 0 || (i === 0 && r.page === 1);
  $('question-next').disabled = i < 0 || (i === r.items.length - 1 && r.page === r.pages);
  const sourceOffset=r&&r.similar_source?1:0;
  const position=i<0?0:(r.page-1)*r.limit+i+1+(sourceOffset&&r.page>1?1:0);
  $('reading-position').textContent = i < 0 ? '' : position + ' / ' + (r.total+sourceOffset);
}
async function loadResults(options = {}) {
  state.random = !!options.random;
  const seq = ++state.searchSeq;
  state.detailSeq++;
  $('results').classList.add('is-loading');
  $('results').setAttribute('aria-busy', 'true');
  $('result-count').textContent = '正在查找…';
  $('similar-scope-note').hidden = true;
  $('similar-scope-note').textContent = '';
  $('selection-title').textContent = selectionTitle();
  try {
    const params = query();
    if (options.random) params.set('random','1');
    if (options.id) params.set('focus', options.id);
    const data = await api('/api/search?' + params);
    if (seq !== state.searchSeq) return;
    if (data.page > data.pages) { state.page = data.pages; return loadResults(options); }
    const displayItems=data.similar_source&&data.page===1?[data.similar_source,...data.items]:data.items;
    state.result = {...data,items:displayItems};
    state.page = data.page;
    $('result-count').textContent = data.random ? '从 ' + data.random_total.toLocaleString() + ' 道中抽取' : data.enrichment_preview ? data.total.toLocaleString() + ' 道培优题 · ' + data.enrichment_confirmed_count + ' 真题 · ' + data.enrichment_supplement_count + ' 补充' + (data.enrichment_candidate_count ? ' · ' + data.enrichment_candidate_count + ' 待确认' : '') : data.total.toLocaleString() + (data.similar_to?' 道相关题':' 道题' + (data.ranked ? ' · 按相关度' : ''));
    if (data.similar_to) $('selection-title').textContent = '相似题 · ' + data.similar_to;
    $('similar-scope-note').textContent = data.similar_scope_label ? '检索范围：' + data.similar_scope_label : '';
    $('similar-scope-note').hidden = !data.similar_scope_label;
    $('page-info').textContent = data.page + ' / ' + data.pages;
    $('page-prev').disabled = data.page <= 1;
    $('page-next').disabled = data.page >= data.pages;
    const bulkTotal=data.random?(data.items.length?1:0):data.total;
    $('results').innerHTML = displayItems.length ? displayItems.map(r =>
      '<button class="question-card '+(data.similar_source&&r.id===data.similar_source.id?'similar-source':'')+'" data-id="' + r.id + '"><div class="card-top"><span class="card-type">' + escapeHTML(data.similar_source&&r.id===data.similar_source.id?'原题 · '+r.type:r.type) +
      '</span><span>' + (r.has_solution ? '有解析' : r.has_answer ? '有答案' : '暂无答案') + '</span></div><div class="card-title">' +
      escapeHTML(formatPaperDisplay(r.title)) + '</div>' + (r.match_reason ? '<div class="card-match">' + escapeHTML(r.match_reason) + '</div>' : '') +
      '<div class="card-excerpt">' + escapeHTML(r.excerpt) + '</div></button>'
    ).join('') : '<div class="list-empty">暂无题目</div>';
    $('results').classList.remove('is-loading');
    $('results').setAttribute('aria-busy', 'false');
    loadPaperNumberNavigation(seq);
    $('results').scrollTop = 0;
    if (!data.items.length && options.similarSource) {
      state.similar='';toast('在' + (data.similar_scope_label || '当前范围') + '没有找到相似度足够高的题目');
      return loadResults({id:options.similarSource});
    }
    if (!data.items.length) { clearReader(); history.replaceState(null,'',location.pathname); saveView(); return; }
    let chosen = options.id || (options.keep && state.current && displayItems.some(r => r.id === state.current.id) ? state.current.id : '');
    chosen = chosen || displayItems[options.last ? displayItems.length-1 : 0].id;
    await loadQuestion(chosen, false);
    if (!state.restoring) saveView();
  } catch (err) {
    if (seq !== state.searchSeq) return;
    $('results').classList.remove('is-loading');
    $('results').setAttribute('aria-busy', 'false');
    $('results').innerHTML = '<div class="list-empty">' + escapeHTML(err.message) + '<br>请确认阅读器服务仍在运行。</div>';
    $('result-count').textContent = '未能加载';
    clearReader();
  }
}
function clearReader() {
  state.detailSeq++;
  state.current = null; state.answers = false;
  clearMath($('reader-scroll'));
  $('reader-scroll').classList.remove('is-loading');
  $('reader-scroll').setAttribute('aria-busy', 'false');
  const emptyContext = state.collection === 'basket' ?
    '<h2>选题篮为空</h2><p>浏览题目并加入选题篮，即可排序和导出。</p>' :
    '<h2>从题库中选一道题开始</h2><p>可按整卷或知识点分类浏览，也可以直接搜索题干与解题思路。</p>';
  $('reader-scroll').innerHTML = '<div class="empty-reader empty-reader-home"><div class="empty-symbol">ƒ</div>' + emptyContext +
    '<div class="empty-actions"><button type="button" data-empty-action="browse">浏览题目</button>' +
    '<button type="button" data-empty-action="recent">最近浏览</button>' +
    '</div>' +
    '<small>快捷键 <kbd>⌘ K</kbd> 可随时聚焦搜索</small></div>';
  updateArrows();
}
async function loadQuestion(id, openMobile = true) {
  const seq = ++state.detailSeq;
  const scroller = $('reader-scroll');
  scroller.classList.add('is-loading');
  scroller.setAttribute('aria-busy', 'true');
  const loadingTimer = setTimeout(() => {
    if (seq !== state.detailSeq) return;
    clearMath(scroller);
    scroller.innerHTML = '<div class="loading">正在读取题目</div>';
  }, 140);
  if (openMobile) {
    document.querySelector('.content-area').classList.add('reading');
    setSidebarOpen(false);
  }
  try {
    const question = await api('/api/question/' + encodeURIComponent(id));
    if (seq !== state.detailSeq) return;
    clearTimeout(loadingTimer);
    state.current = question; state.answers = false;
    if (state.resume && state.resume.id === id) state.answers = !!state.resume.answers;
    history.replaceState(null, '', '#' + question.id);
    scroller.classList.remove('is-loading');
    renderQuestion();
    scroller.setAttribute('aria-busy', 'false');
    markSelected(); updateArrows();
    await updatePersonal({action:'recent-add',id});
    if (!state.restoring) saveView();
  } catch (err) {
    if (seq !== state.detailSeq) return;
    clearTimeout(loadingTimer);
    clearReader();
    scroller.classList.remove('is-loading');
    scroller.setAttribute('aria-busy', 'false');
    scroller.innerHTML = '<div class="empty-reader"><h2>暂时无法读取这道题</h2><p>' + escapeHTML(err.message) + '</p></div>';
  }
}
function renderQuestion(preserveScroll = false) {
  const q = state.current;
  const scroller = $('reader-scroll');
  const scrollTop = scroller.scrollTop;
  clearMath(scroller);
  const scopeLabel = '强基题库';
  const crumbs = q.browse_path || [scopeLabel, q.module, ...(q.topic ? [q.topic] : [])];
  const separator = q.browse_path ? '→' : '/';
  let markup = '<article class="question-article ' + (preserveScroll ? 'answer-updated' : 'content-enter') + '"><div class="breadcrumbs">' +
    crumbs.map(label => '<span>' + escapeHTML(label) + '</span>').join('<span class="crumb-sep">' + separator + '</span>') +
    '</div><div class="question-title-row"><h2>' + escapeHTML(formatPaperDisplay(q.title)) +
    '</h2>' + (q.difficulty_score == null ? '' : '<span class="difficulty-badge" title="规则试评，尚未人工终审">难度 '+Number(q.difficulty_score).toFixed(1)+'</span>') + '</div>' + questionControls(q.id) +
    '<div class="question-rule"></div>';
  if (q.warnings.length) markup += '<div class="render-notice">本题含特殊排版，请结合题目配图阅读。</div>';
  markup += '<div id="question-content" class="tex-content">' + (state.answers ? q.answered_html : q.question_html) + '</div>';
  markup += '<section class="answer-section"><button id="answer-toggle" class="answer-toggle" aria-expanded="' + state.answers + '"' + (!q.has_answer ? ' disabled' : '') +
    '><span><span class="answer-label">' + (state.answers ? '收起答案' : q.has_answer ? '答案' : '暂无答案') +
    '</span></span>' + icon('down') + '</button>';
  if (state.answers) {
    markup += '<div id="solution-content" class="solution tex-content">';
    if (q.inline_answer_html) markup += '<div class="inline-summary">参考答案：' + q.inline_answer_html + '</div><div class="paragraph-break"></div>';
    markup += q.solution_html || '<p class="solution-status">目前只有结论，尚无展开的解析。</p>';
    markup += '</div>';
  }
  markup += '</section>';
  if (q.enrichment_methods && q.enrichment_methods.length) {
    const relationNames = {same_question:'讲义原题', adapted_from:'改编母题'};
    markup += '<section id="question-methods" class="question-methods"><h3>关联体系</h3>' +
      q.enrichment_methods.map(method => '<article class="method-card"><div class="method-heading"><strong>' + escapeHTML(method.system + ' · ' + method.section) +
        '</strong><span>' + escapeHTML(method.kind) + '</span></div><p>' + escapeHTML(method.chapter + ' · ' + method.lecture_problem_id + (method.relation === 'excerpt' ? '' : ' · ' + (relationNames[method.relation] || method.relation))) + '</p>' +
        (method.solution_note ? '<p class="method-note ' + escapeHTML(method.solution_assessment) + '"><strong>' + escapeHTML(method.solution_label) + '</strong>：' + escapeHTML(method.solution_note) + '</p>' : '') +
        '<div class="method-actions"><button data-method-section="' + escapeHTML(method.lecture_problem_id) + '">查看</button>' +
        (method.has_lecture_solution ? '<button data-method-solution="' + escapeHTML(method.lecture_problem_id) + '">对照讲义原解</button>' : '') +
        '</div></article>').join('') + '</section>';
  }
  markup += '<details class="question-info"><summary>详细信息</summary><dl><dt>更新时间</dt><dd>' + escapeHTML(q.updated) + '</dd><dt>答案记录</dt><dd>' + escapeHTML(q.source_status) + '</dd>';
  if (q.sources.length) markup += '<dt>原卷出处</dt><dd>' + q.sources.map(escapeHTML).join('<br>') + '</dd>';
  markup += '</dl></details></article>';
  scroller.innerHTML = markup;
  scroller.scrollTop = preserveScroll ? scrollTop : 0;
  typeset($('reader-scroll').firstElementChild).then(() => {
    if (state.resume && state.resume.id === q.id) restoreScroll();
  });
}
function toggleAnswer() {
  if (!state.current || !state.current.has_answer || answerTransitioning) return;
  if (!state.answers) {
    state.answers = true;
    renderQuestion(true);
    scheduleSave();
    return;
  }
  const id = state.current.id;
  const solution = $('solution-content');
  const finish = () => {
    answerTransitioning = false;
    if (!state.current || state.current.id !== id || !state.answers) return;
    state.answers = false;
    renderQuestion(true);
    scheduleSave();
  };
  if (!solution || reducedMotion.matches) {finish();return;}
  answerTransitioning = true;
  solution.style.height = solution.offsetHeight + 'px';
  void solution.offsetHeight;
  solution.classList.add('is-collapsing');
  setTimeout(finish, 220);
}
async function moveQuestion(direction) {
  if (!state.current || !state.result) return;
  const i = state.result.items.findIndex(r => r.id === state.current.id);
  if (i < 0) return;
  const next = i + direction;
  if (next >= 0 && next < state.result.items.length) await loadQuestion(state.result.items[next].id);
  else if (state.page + direction >= 1 && state.page + direction <= state.result.pages) {
    state.page += direction; await loadResults({last: direction < 0});
  }
  const active = document.querySelector('.question-card.active');
  if (active) active.scrollIntoView({block:'nearest'});
}
function openModal(title, content) {
  $('modal-title').textContent = title;
  $('modal-content').replaceChildren(content);
  if (!$('modal').open) $('modal').showModal();
}

$('navigation').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  state.collection = '';
  state.similar = '';
  updatePersonalUI();
  state.paper = button.dataset.paper || '';
  state.chapter = button.dataset.chapter || '';
  state.topic = button.dataset.topic || '';
  state.enrichmentSystem = button.dataset.enrichmentSystem || '';
  state.enrichmentChapter = button.dataset.enrichmentChapter || '';
  state.enrichmentSection = button.dataset.enrichmentSection || '';
  state.page = 1;
  renderNavigation(); loadResults();
});
function activateView(mode, keepScope=false) {
  state.view = mode; state.page = 1; state.paper = ''; state.chapter = ''; state.topic = ''; state.enrichmentSystem = ''; state.enrichmentChapter = ''; state.enrichmentSection = ''; state.collection = ''; state.similar = '';
  state.navTerm = ''; $('nav-search').value = '';
  $('nav-search').placeholder = mode === 'paper' ? '查找试卷…' : mode === 'classification' ? '查找知识点…' : '查找培优章节…';
  for (const tab of ['paper','classification']) $('tab-' + tab).setAttribute('aria-selected', String(tab === mode));
  updatePersonalUI(); renderNavigation(); loadResults();
}
for (const mode of ['paper','classification']) $('tab-' + mode).addEventListener('click', () => activateView(mode));
$('nav-search').addEventListener('input', event => {state.navTerm = event.target.value; renderNavigation(); scheduleSave();});
let searchTimer;
function hideSuggestions(){suggestionIndex=-1;$('search-suggestions').hidden=true;$('search').setAttribute('aria-expanded','false');}
function highlightSuggestion(){document.querySelectorAll('.search-suggestion').forEach((item,index)=>item.classList.toggle('active',index===suggestionIndex));}
function leavePersonalCollectionForSearch(){
  if(!$('search').value.trim()||!state.collection)return;
  state.collection='';
  updatePersonalUI();renderNavigation();
}
async function loadSuggestions(){
  const query=$('search').value.trim(),seq=++suggestionSeq;
  if(!query){hideSuggestions();return;}
  try{
    const data=await api('/api/suggestions?q='+encodeURIComponent(query));if(seq!==suggestionSeq)return;
    $('search-suggestions').innerHTML=data.items.map((item,index)=>'<button type="button" class="search-suggestion" role="option" data-index="'+index+'" data-value="'+escapeHTML(item.value)+'"><span>'+escapeHTML(item.value)+'</span><small>'+escapeHTML(item.kind)+'</small></button>').join('');
    suggestionIndex=-1;$('search-suggestions').hidden=!data.items.length;$('search').setAttribute('aria-expanded',String(!!data.items.length));
  }catch(_){hideSuggestions();}
}
function chooseSuggestion(button){$('search').value=button.dataset.value;hideSuggestions();leavePersonalCollectionForSearch();state.similar='';state.page=1;clearTimeout(searchTimer);loadResults();}
$('search').addEventListener('input', () => { leavePersonalCollectionForSearch();state.similar=''; loadSuggestions();clearTimeout(searchTimer); searchTimer = setTimeout(() => {state.page = 1; loadResults();}, 250); });
$('search').addEventListener('keydown',event=>{
  const items=[...document.querySelectorAll('.search-suggestion')];if(!items.length||$('search-suggestions').hidden)return;
  if(event.key==='ArrowDown'){event.preventDefault();suggestionIndex=(suggestionIndex+1)%items.length;highlightSuggestion();}
  else if(event.key==='ArrowUp'){event.preventDefault();suggestionIndex=(suggestionIndex-1+items.length)%items.length;highlightSuggestion();}
  else if(event.key==='Enter'&&suggestionIndex>=0){event.preventDefault();chooseSuggestion(items[suggestionIndex]);}
  else if(event.key==='Escape')hideSuggestions();
});
$('search-suggestions').addEventListener('mousedown',event=>{const button=event.target.closest('.search-suggestion');if(button){event.preventDefault();chooseSuggestion(button);}});
$('search').addEventListener('blur',()=>setTimeout(hideSuggestions,120));
$('search-form').addEventListener('submit', event => {event.preventDefault(); hideSuggestions();leavePersonalCollectionForSearch();state.similar=''; clearTimeout(searchTimer); state.page=1; loadResults();});
$('sidebar-toggle').addEventListener('click', () => setSidebarOpen($('sidebar-toggle').getAttribute('aria-expanded') !== 'true'));
$('sidebar-backdrop').addEventListener('click', () => setSidebarOpen(false));
$('sidebar').addEventListener('click', event => {
  if (event.target.closest('button') && matchMedia('(max-width: 540px)').matches) setSidebarOpen(false);
});
$('results').addEventListener('click', event => {
  const card = event.target.closest('.question-card'); if (card) loadQuestion(card.dataset.id);
});
$('paper-number-nav').addEventListener('click',event=>{
  const button=event.target.closest('.paper-number-button');
  if(button)loadQuestion(button.dataset.id);
});
for (const [id, direction] of [['page-prev', -1],['page-next',1]]) $(id).addEventListener('click', () => {state.page += direction; loadResults();});
for (const [id, direction] of [['question-prev',-1],['question-next',1]]) $(id).addEventListener('click', () => moveQuestion(direction));
$('reader-scroll').addEventListener('click', event => {
  const methodButton = event.target.closest('[data-method-section], [data-method-solution]');
  if (methodButton && state.current) {
    const problemId = methodButton.dataset.methodSection || methodButton.dataset.methodSolution;
    const method = (state.current.enrichment_methods || []).find(item => item.lecture_problem_id === problemId);
    if (method) {
      if (methodButton.dataset.methodSection) openMethodSection(method);
      else showLectureSolution(method);
    }
    return;
  }
  if (event.target.closest('#answer-toggle') && state.current.has_answer) {
    toggleAnswer();
  }
  const image = event.target.closest('.question-image');
  if (image) {const large = document.createElement('img'); large.src = image.src; large.alt = '题目配图放大'; openModal('题目配图', large);}
});
$('reader-scroll').addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.question-image')) {event.preventDefault(); event.target.click();}
});
$('back-to-list').addEventListener('click', () => {document.querySelector('.content-area').classList.remove('reading'); saveView();});
$('refresh').addEventListener('click', async () => {
  $('refresh').disabled = true;
  $('refresh').classList.add('is-refreshing');
  $('refresh').setAttribute('aria-busy', 'true');
  try {configure(await api('/api/refresh', {})); await loadResults({keep:true}); toast('题库已刷新');}
  catch (err) {toast(err.message);}
  finally {$('refresh').disabled = false;$('refresh').classList.remove('is-refreshing');$('refresh').setAttribute('aria-busy', 'false');}
});
$('modal-close').addEventListener('click', () => $('modal').close());
$('modal').addEventListener('click', event => {if (event.target === $('modal')) {const r=$('modal').getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) $('modal').close();}});
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {event.preventDefault(); $('search').focus(); $('search').select();}
  if (!['ArrowUp', 'ArrowDown'].includes(event.key) || event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (!state.current || !state.result || $('modal').open) return;
  if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"], [role="combobox"]')) return;
  event.preventDefault();
  moveQuestion(event.key === 'ArrowUp' ? -1 : 1);
});
function questionControls(id) {
  const favorite = !!(state.personal.questions[id] || {}).favorite;
  const inBasket = state.personal.basket.includes(id);
  return '<div class="question-controls"><button id="basket-toggle" class="control-primary" aria-pressed="'+inBasket+'">'+(inBasket?'移出选题篮':'加入选题篮')+
    '</button><button id="favorite-toggle" aria-pressed="'+favorite+'" class="'+(favorite?'selected':'')+'">'+(favorite?'已收藏':'收藏')+'</button></div>';
}
function updatePersonalUI() {
  $('recent-count').textContent = (state.personal.recent||[]).length;
  $('favorite-count').textContent = Object.values(state.personal.questions).filter(x=>x.favorite).length;
  $('basket-count').textContent = state.personal.basket.length;
  $('basket-list-count').textContent = state.personal.basket.length;
  document.querySelectorAll('[data-collection]').forEach(el=>el.classList.toggle('active',el.dataset.collection===state.collection));
  if (state.current && document.querySelector('.question-controls')) {
    document.querySelector('.question-controls').outerHTML = questionControls(state.current.id);
  }
}
function updatePersonal(action) {
  personalQueue = personalQueue.catch(()=>{}).then(async()=>{
    state.personal = await api('/api/personal', action);
    updatePersonalUI();
  });
  return personalQueue.catch(error=>{toast(error.message); throw error;});
}
$('reader-scroll').addEventListener('click', async event => {
  const emptyAction = event.target.closest('[data-empty-action]');
  if (emptyAction) {
    if (emptyAction.dataset.emptyAction === 'browse') activateView('paper');
    else if (emptyAction.dataset.emptyAction === 'recent') showCollection('recent');
    return;
  }
  if (!state.current) return;
  const id = state.current.id;
  try {
    if (event.target.closest('#favorite-toggle')) {
      await updatePersonal({action:'favorite',id,value:!(state.personal.questions[id]||{}).favorite});
      if (state.collection==='favorite') await loadResults({keep:true});
    }
    if (event.target.closest('#basket-toggle')) {
      await updatePersonal({action:state.personal.basket.includes(id)?'basket-remove':'basket-add',id});
      toast(state.personal.basket.includes(id)?'已加入选题篮':'已移出选题篮');
      if(state.collection==='basket') await loadResults({keep:true});
    }
  } catch (_) {}
});
async function showCollection(collection) {
  $('search').value='';state.paper='';state.chapter='';state.topic='';state.page=1;
  state.collection=collection;
  updatePersonalUI();renderNavigation();
  await loadResults();
}
$('personal-nav').addEventListener('click', event => {
  const button = event.target.closest('[data-collection]');
  if (!button) return;
  showCollection(button.dataset.collection);
});
for (const name of ['reader-scroll','results','navigation']) $(name).addEventListener('scroll',scheduleSave,{passive:true});
$('navigation').addEventListener('toggle',scheduleSave,true);
window.addEventListener('pagehide',saveView);
window.addEventListener('hashchange',()=>{
  const id=location.hash.slice(1);
  if(id && (!state.current || id!==state.current.id)) location.reload();
});
window.addEventListener('focus',async()=>{
  if(state.restoring) return;
  try {
    const data=await api('/api/personal');
    if(JSON.stringify(data)!==JSON.stringify(state.personal)) {
      state.personal=data;updatePersonalUI();
      if(state.collection) await loadResults({keep:true});
    }
  } catch(_) {}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden) saveView();});
function restoreScroll() {
  const resume=state.resume;
  if (!resume) return;
  $('reader-scroll').scrollTop=resume.scroll||0;
  $('results').scrollTop=resume.listScroll||0;
  $('navigation').scrollTop=resume.navScroll||0;
  // Once the initial images settle, restore the position once more.
  const images=[...$('reader-scroll').querySelectorAll('img')];
  Promise.all(images.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{
    img.addEventListener('load',resolve,{once:true}); img.addEventListener('error',resolve,{once:true});
    setTimeout(resolve,3000);
  }))).then(()=>{if(state.current && state.current.id===resume.id) $('reader-scroll').scrollTop=resume.scroll||0;});
  state.resume=null;
}
$('reader-scroll').addEventListener('load', event=>{
  if(event.target.matches('.native-image')) event.target.closest('figure').querySelector('figcaption').textContent='';
},true);
$('reader-scroll').addEventListener('error', event=>{
  if(event.target.matches('.native-image')) {
    event.target.hidden=true;
    event.target.closest('figure').querySelector('figcaption').textContent='绘图暂未加载，请刷新页面。';
  }
},true);

async function showBasket() {
  const box=document.createElement('div'); box.className='basket-panel';
  box.innerHTML='<div class="loading">正在读取选题篮</div>';
  openModal('选题篮 · 按当前顺序导出',box);
  try {
    const [questions,suggestion]=await Promise.all([
      Promise.all(state.personal.basket.map(id=>api('/api/question/'+id).catch(()=>({id,title:'题源暂不可用'})))),
      api('/api/suggest-title',{ids:[...state.personal.basket]})
    ]);
    if(!box.isConnected) return;
    const savedTitle=readBasketTitle();
    box.innerHTML='<div class="basket-summary"><p class="panel-note">共 '+questions.length+' 道题。可调整顺序，按当前顺序打印学生版或教师版，并可保存为 PDF。</p><div class="basket-summary-actions"><button class="text-button" data-action="view">查看题目列表</button><button class="text-button" data-action="sort" '+(questions.length<2?'disabled':'')+'>一键排序</button><button class="text-button basket-clear" data-action="clear" '+(!questions.length?'disabled':'')+'>清空选题篮</button></div></div>'+
      '<div class="basket-items">'+questions.map((q,i)=>'<div class="basket-row" data-id="'+q.id+'"><span class="drag-handle" draggable="true" role="button" tabindex="0" aria-label="拖动第 '+(i+1)+' 题排序" title="按住拖动排序">⋮</span><span class="basket-index">'+(i+1)+'</span><button class="basket-title" data-action="read">'+escapeHTML(q.title)+(q.difficulty_score==null?'':'<small> · 难度试评 '+Number(q.difficulty_score).toFixed(1)+'</small>')+'</button><div><button data-action="up" aria-label="上移" '+(i===0?'disabled':'')+'>↑</button><button data-action="down" aria-label="下移" '+(i===questions.length-1?'disabled':'')+'>↓</button><button data-action="remove" aria-label="移出选题篮">移出</button></div></div>').join('')+
      (!questions.length?'<div class="list-empty">选题篮为空。阅读题目时点击“加入选题篮”。</div>':'')+'</div>'+
      '<div class="export-controls"><label>试卷标题<div class="export-title-row"><input id="export-title" maxlength="60" value="'+escapeHTML(savedTitle || suggestion.title)+'"><button type="button" class="text-button" data-action="save-title">暂存</button></div></label></div>'+
      exportOptions()+exportButtons(!questions.length)+'<div id="export-progress" aria-live="polite"></div>';
    const basketItems=box.querySelector('.basket-items');
    let dragged=null,draggingTouch=false;
    const renumber=()=>basketItems.querySelectorAll('.basket-row').forEach((row,index)=>{
      row.querySelector('.basket-index').textContent=index+1;
      row.querySelector('.drag-handle').setAttribute('aria-label','拖动第 '+(index+1)+' 题排序');
    });
    const saveDraggedOrder=async()=>{
      if(!dragged)return;
      const ids=[...basketItems.querySelectorAll('.basket-row')].map(row=>row.dataset.id);
      dragged.classList.remove('dragging');dragged=null;draggingTouch=false;renumber();
      if(ids.join('|')===state.personal.basket.join('|'))return;
      try{await updatePersonal({action:'basket-reorder',ids});if(state.collection==='basket')await loadResults({keep:true});await showBasket();toast('选题篮顺序已更新');}
      catch(_){await showBasket();}
    };
    basketItems.addEventListener('dragstart',event=>{
      const handle=event.target.closest('.drag-handle');
      if(!handle){event.preventDefault();return;}
      dragged=handle.closest('.basket-row');dragged.classList.add('dragging');
      event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',dragged.dataset.id);
    });
    basketItems.addEventListener('dragenter',event=>{
      if(!dragged)return;
      const target=event.target.closest('.basket-row');if(!target||target===dragged)return;
      const rows=[...basketItems.querySelectorAll('.basket-row')];
      basketItems.insertBefore(dragged,rows.indexOf(dragged)<rows.indexOf(target)?target.nextSibling:target);renumber();
    });
    basketItems.addEventListener('dragover',event=>{
      if(!dragged)return;event.preventDefault();event.dataTransfer.dropEffect='move';
    });
    basketItems.addEventListener('drop',event=>{event.preventDefault();saveDraggedOrder();});
    basketItems.addEventListener('dragend',saveDraggedOrder);
    basketItems.addEventListener('pointerdown',event=>{
      if(event.pointerType==='mouse'||!event.target.closest('.drag-handle'))return;
      dragged=event.target.closest('.basket-row');draggingTouch=true;dragged.classList.add('dragging');
      event.target.setPointerCapture(event.pointerId);event.preventDefault();
    });
    basketItems.addEventListener('pointermove',event=>{
      if(!draggingTouch||!dragged)return;
      const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.basket-row');
      if(!target||target===dragged||!basketItems.contains(target))return;
      const before=event.clientY<target.getBoundingClientRect().top+target.offsetHeight/2;
      basketItems.insertBefore(dragged,before?target:target.nextSibling);renumber();
    });
    basketItems.addEventListener('pointerup',()=>{if(draggingTouch)saveDraggedOrder();});
    basketItems.addEventListener('pointercancel',()=>{if(draggingTouch)saveDraggedOrder();});
    box.addEventListener('click',async event=>{
      const exportButton=event.target.closest('.export-start');
      if(exportButton){startExport([...state.personal.basket],$('export-title').value,exportButton.dataset.format,box);return;}
      const button=event.target.closest('[data-action]');
      if(!button) return;
      if(button.dataset.action==='view') {
        $('modal').close();await showCollection('basket');return;
      }
      if(button.dataset.action==='sort') {
        const typeOrder={'单选题':0,'多选题':1,'填空题':2,'解答题':3,'不定项选择题':1};
        const ids=questions.slice().sort((a,b)=>(typeOrder[a.type]??9)-(typeOrder[b.type]??9)
          || Number(a.difficulty_score??a.difficulty??0)-Number(b.difficulty_score??b.difficulty??0)
          || String(a.title||'').localeCompare(String(b.title||''),'zh-CN')).map(q=>q.id);
        if(ids.join('|')===state.personal.basket.join('|')) {toast('选题篮已经按题型和难度排序');return;}
        button.disabled=true;
        try {await updatePersonal({action:'basket-reorder',ids});if(state.collection==='basket')await loadResults({keep:true});await showBasket();toast('已按题型和难度排序');}
        catch (_) {button.disabled=false;}
        return;
      }
      if(button.dataset.action==='save-title') {
        const input=box.querySelector('#export-title');
        saveBasketTitle(input.value);
        toast('试卷标题已暂存，刷新后仍会保留');
        return;
      }
      if(button.dataset.action==='clear') {
        if(!confirm('确定清空选题篮中的 '+state.personal.basket.length+' 道题吗？')) return;
        button.disabled=true;
        try {await updatePersonal({action:'basket-clear'});if(state.collection==='basket')await loadResults({keep:true});await showBasket();}
        catch (_) {button.disabled=false;}
        return;
      }
      const id=button.closest('[data-id]').dataset.id;
      if(button.dataset.action==='read') {$('modal').close(); await loadQuestion(id);return;}
      try {
        button.disabled=true;
        await updatePersonal({action:button.dataset.action==='remove'?'basket-remove':'basket-move',id,offset:button.dataset.action==='up'?-1:1});
        if(state.collection==='basket')await loadResults({keep:true});
        await showBasket();
      } catch (_) {button.disabled=false;}
    });
  } catch(error) {box.textContent=error.message;}
}
function exportButtons(disabled=false) {
  return '<div class="export-buttons"><button class="primary-button export-start" data-format="student" '+(disabled?'disabled':'')+'>学生版 PDF</button>'+
    '<button class="primary-button export-start" data-format="teacher" '+(disabled?'disabled':'')+'>教师版 PDF</button></div><p class="panel-note">在打印窗口中选择“保存为 PDF”。</p>';
}
function exportOptions() {
  return '<details class="export-options"><summary>导出选项</summary><div><label>起始题号<input class="export-start-number" type="number" min="1" max="999" value="1"></label><label><input class="export-include-sources" type="checkbox" checked> 保留题目来源</label><label>留白<select class="export-answer-space"><option value="none">不额外留白</option><option value="medium">解答题约 6 行</option><option value="large">解答题约 12 行</option><option value="page">每题另起一页</option></select></label></div></details>';
}
function readExportOptions(root) {
  const spacing=root.querySelector('.export-answer-space').value;
  return {start_number:Number(root.querySelector('.export-start-number').value),include_sources:root.querySelector('.export-include-sources').checked,
    page_break:spacing==='page',answer_space:['medium','large'].includes(spacing)?spacing:'none'};
}
async function startExport(ids,title,format,root) {
  if (!ids.length || !['student','teacher'].includes(format)) return;
  const buttons=[...root.querySelectorAll('.export-start')];
  buttons.forEach(button=>button.disabled=true);
  const progress=root.querySelector('#export-progress');
  progress.textContent='正在准备打印稿…';
  let sheet;
  try {
    const options=readExportOptions(root);
    const questions=await Promise.all(ids.map(id=>api('/api/question/'+id)));
    sheet=document.createElement('main');sheet.className='print-sheet';
    const teacher=format==='teacher';
    sheet.innerHTML='<h1>'+escapeHTML(title.trim()||'强基数学练习')+'</h1><p class="print-version">'+(teacher?'教师版':'学生版')+'</p>'+questions.map((q,i)=>
      '<section class="print-question '+(options.page_break?'print-new-page':'')+'"><div class="print-question-heading"><strong>'+escapeHTML(String(options.start_number+i))+'.</strong>'+
      (options.include_sources?'<span>'+escapeHTML(q.title)+'</span>':'')+'</div><div class="tex-content">'+(teacher?q.answered_html:q.question_html)+'</div>'+
      (teacher&&q.has_answer?'<div class="print-answer tex-content"><strong>参考答案与解析</strong>'+(q.inline_answer_html?'<p>'+q.inline_answer_html+'</p>':'')+q.solution_html+'</div>':'')+
      (!teacher&&q.type==='解答题'&&options.answer_space!=='none'?'<div class="print-answer-space '+options.answer_space+'"></div>':'')+'</section>').join('');
    document.body.append(sheet);
    await typeset(sheet);
    await Promise.all([...sheet.querySelectorAll('img')].map(img=>img.decode()));
    const oldTitle=document.title;
    const cleanup=()=>{clearMath(sheet);sheet.remove();document.title=oldTitle;window.removeEventListener('afterprint',cleanup);};
    window.addEventListener('afterprint',cleanup,{once:true});
    document.title=title.trim()||'强基数学练习';
    progress.textContent='打印稿已就绪，请选择打印或保存为 PDF。';
    $('modal').close();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    window.print();
    cleanup();
  } catch(error) {
    if(sheet){clearMath(sheet);sheet.remove();}
    progress.textContent='打印稿未能生成，请重试。';toast(error.message);
  } finally {buttons.forEach(button=>button.disabled=false);}
}
$('basket-open').addEventListener('click',showBasket);
async function loadInitialConfig() {
  let config=await api('/api/config');
  while(config.loading) {
    await new Promise(resolve=>setTimeout(resolve,350));
    config=await api('/api/config');
  }
  if(!Number.isFinite(config.total_question_count)) throw new Error('题库数据格式有误，请重新生成发布数据。');
  return config;
}

(async () => {
  try {
    await window.QJAuth.ready();
    const [config,personal]=await Promise.all([loadInitialConfig(),api('/api/personal')]);
    state.personal=personal;
    const saved=readView();
    const hash=location.hash.slice(1);
    const resume=saved && ((hash && hash===saved.id) || (!hash && saved.collection==='basket')) ? saved : null;
    if(resume) {
      for(const key of ['view','page','paper','chapter','topic','enrichmentSystem','enrichmentChapter','enrichmentSection','collection','similar','similarSystem','navTerm']) if(resume[key]!==undefined) state[key]=resume[key];
      if(!['','recent','favorite','basket'].includes(state.collection))state.collection='';
      state.view=['paper','classification'].includes(state.view)?state.view:'paper';state.similar='';
      state.page=Math.max(1,Number(state.page)||1);
    }
    configure(config);
    if(resume) {
      $('search').value=resume.query||'';$('nav-search').value=state.navTerm;
      state.resume=resume;
      document.querySelector('.content-area').classList.toggle('reading',!!resume.reading);
    } else if(hash) {
      const question=await api('/api/question/'+hash).catch(()=>null);
      if(question) {state.collection='';state.view=question.merged?'classification':'paper';}
    }
    for(const mode of ['paper','classification']) $('tab-'+mode).setAttribute('aria-selected',String(state.view===mode));
      $('nav-search').placeholder = state.view === 'paper' ? '查找试卷…' : state.view === 'classification' ? '查找知识点…' : '查找培优章节…';
    renderNavigation();updatePersonalUI();
    if(resume && resume.openGroups) document.querySelectorAll('.nav-group').forEach(group=>{group.open=resume.openGroups.includes(group.querySelector('summary').textContent);});
    await loadResults({id:hash||(resume&&resume.id)||undefined});
    $('startup-loading').hidden=true;
    state.restoring=false;
    saveView();
  } catch(err) {state.restoring=false;$('startup-loading').classList.add('has-error');$('startup-loading-message').textContent=err.message;toast('未能加载题库：'+err.message);$('result-count').textContent='连接失败';}
})();
