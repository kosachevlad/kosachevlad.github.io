/* Shared snapshots live in R2; only the opaque snapshot ID travels in the URL. */
const SHARE_API = 'https://slayd-share-nb1103.kosachevlad.chatgpt.site/api/presentations';
const shareDialog = document.createElement('dialog');
shareDialog.id = 'shareDialog';
shareDialog.innerHTML = `<div class="share-heading"><h2>Поділитися з учителем</h2><button id="closeShare" class="icon" aria-label="Закрити">✕</button></div>
<p>Збережіть копію презентації та надішліть посилання вчителю. Він зможе переглянути слайди, зображення й анімації без входу.</p>
<div class="share-notice">Доступ матиме кожен, хто отримає посилання.</div>
<button id="createShare" class="primary">Створити посилання</button>
<div id="shareResult" hidden><label for="shareUrl" class="property-label">Посилання на збережену копію</label><input id="shareUrl" class="field" readonly><div class="row share-actions"><button id="copyShare" class="primary">Копіювати посилання</button><button id="sendShare" class="field">Надіслати…</button></div><p class="muted">Після редагування створіть нове посилання, щоб надіслати оновлену копію.</p></div>
<p id="shareStatus" class="muted" role="status" aria-live="polite"></p>`;
document.body.append(shareDialog);
let cachedShare = null, shareBusy = false;
$('#sharePresentation').onclick = () => {
  if (isSharedView) return;
  const unchanged = cachedShare?.snapshot === JSON.stringify(deck);
  $('#shareResult').hidden = !unchanged;
  if (unchanged) $('#shareUrl').value = cachedShare.url;
  $('#createShare').textContent = unchanged ? 'Створити нове посилання' : 'Створити посилання';
  if (!shareBusy) $('#shareStatus').textContent = '';
  $('#sendShare').hidden = !navigator.share;
  shareDialog.showModal();
};
$('#closeShare').onclick = () => shareDialog.close();

function snapshotForSharing() {
  const snapshot = clone(deck);
  snapshot.slides.forEach(s => { s.notes = ''; });
  return snapshot;
}
function newCapability() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2,'0')).join('');
}
async function requestJSON(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(url, {...options, signal:controller.signal, credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer'});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'server_error');
    return result;
  } finally { clearTimeout(timeout); }
}
$('#createShare').onclick = async () => {
  if (shareBusy) return;
  const snapshot = JSON.stringify(deck), presentation = snapshotForSharing(), body = JSON.stringify(presentation);
  if (new Blob([body]).size > 8 * 1024 * 1024) {
    $('#shareStatus').textContent = 'Презентація завелика для надсилання (до 8 МБ). Зменште кількість або розмір зображень.';
    return;
  }
  shareBusy = true; $('#createShare').disabled = true; $('#shareResult').hidden = true;
  $('#shareStatus').textContent = 'Зберігаємо презентацію на сервері…';
  try {
    const result = await requestJSON(SHARE_API, {method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${newCapability()}`}, body});
    if (!/^[a-f0-9]{64}$/.test(result.id)) throw new Error('invalid_response');
    const url = new URL('https://kosachevlad.github.io/slides/'); url.search = ''; url.hash = ''; url.searchParams.set('id', result.id);
    cachedShare = {snapshot, url:url.href};
    $('#shareUrl').value = url.href; $('#shareResult').hidden = false;
    $('#createShare').textContent = 'Створити нове посилання';
    $('#shareStatus').textContent = 'Копію збережено. Скопіюйте посилання та надішліть учителю.';
  } catch(error) {
    $('#shareStatus').textContent = error.message === 'too_large' ? 'Презентація завелика. Максимальний розмір — 8 МБ.' : error.message === 'rate_limited' ? 'Забагато запитів. Спробуйте ще раз за хвилину.' : error.message === 'invalid_presentation' ? 'Не вдалося зберегти цю презентацію. Перевірте слайди й зображення.' : 'Не вдалося зберегти презентацію. Перевірте інтернет і спробуйте ще раз. Ваші слайди залишилися на пристрої.';
  } finally { shareBusy = false; $('#createShare').disabled = false; }
};
$('#copyShare').onclick = async () => {
  try { await navigator.clipboard.writeText($('#shareUrl').value); $('#shareStatus').textContent = 'Посилання скопійовано — надішліть його вчителю.'; }
  catch { $('#shareUrl').focus(); $('#shareUrl').select(); $('#shareStatus').textContent = 'Виділіть і скопіюйте посилання з поля вручну.'; }
};
$('#sendShare').onclick = async () => {
  if (!cachedShare) return;
  try { await navigator.share({title:deck.title, text:'Моя презентація', url:cachedShare.url}); }
  catch(error) { if (error.name !== 'AbortError') $('#shareStatus').textContent = 'Скопіюйте посилання та надішліть його вручну.'; }
};

let viewerIndex = 0;
function renderSharedSlide() {
  fillCanvas($('#sharedCanvas'),deck.slides[viewerIndex],'show');
  const transition = deck.slides[viewerIndex].transition;
  const c = $('#sharedCanvas'); c.classList.remove('fade','rise','zoom'); void c.offsetWidth;
  if (['fade','rise','zoom'].includes(transition)) c.classList.add(transition);
  $('#viewerCount').textContent = `${viewerIndex+1} / ${deck.slides.length}`;
  $('#viewerPrev').disabled = viewerIndex === 0;
  $('#viewerNext').disabled = viewerIndex === deck.slides.length-1;
  active = viewerIndex;
}
async function loadSharedPresentation(id) {
  isSharedView = true;
  document.documentElement.classList.add('shared-view');
  const view = document.createElement('section'); view.id = 'sharedViewer';
  view.innerHTML = `<header class="viewer-header"><a class="brand" href="./">▰ слайд</a><span>Перегляд презентації</span><a href="./" class="viewer-home">Мій редактор ↗</a></header><div id="viewerBody"><div class="viewer-loading" role="status"><h1>Відкриваємо презентацію…</h1><p>Завантажуємо слайди, зображення й анімації.</p></div></div>`;
  document.body.append(view);
  document.documentElement.classList.remove('shared-loading');
  if (!/^[a-f0-9]{64}$/.test(id)) { showSharedError('Некоректне посилання на презентацію. Перевірте, чи його скопійовано повністю.'); return; }
  try {
    const result = await requestJSON(`${SHARE_API}/${encodeURIComponent(id)}`);
    if (!validDeck(result.presentation)) throw new Error('invalid_presentation');
    deck = result.presentation; selected = null; active = 0; past = []; future = [];
    document.title = `${deck.title} — Слайд`;
    $('#viewerBody').innerHTML = `<div class="viewer-title"><div><p>СПІЛЬНА ПРЕЗЕНТАЦІЯ</p><h1 id="sharedTitle"></h1></div><button id="viewerPlay" class="primary">▷ Показ слайдів</button></div><div id="sharedCanvas" class="slide-canvas"></div><div class="viewer-navigation"><button id="viewerPrev" class="field" aria-label="Попередній слайд">← Назад</button><span id="viewerCount"></span><button id="viewerNext" class="field" aria-label="Наступний слайд">Далі →</button></div><div class="viewer-bottom"><span>Збережена копія · лише перегляд</span></div>`;
    $('#sharedTitle').textContent = deck.title;
    $('#viewerPlay').onclick = startShow;
    $('#viewerPrev').onclick = () => { viewerIndex--; renderSharedSlide(); };
    $('#viewerNext').onclick = () => { viewerIndex++; renderSharedSlide(); };
    let startX=0; $('#sharedCanvas').ontouchstart = e => startX=e.changedTouches[0].clientX;
    $('#sharedCanvas').ontouchend = e => {const dx=e.changedTouches[0].clientX-startX;if(Math.abs(dx)<40)return;viewerIndex=Math.max(0,Math.min(deck.slides.length-1,viewerIndex+(dx<0?1:-1)));renderSharedSlide();};
    document.addEventListener('keydown',e=>{if(!$('#player').hidden||['INPUT','TEXTAREA'].includes(document.activeElement.tagName))return;if(e.key==='ArrowRight'&&viewerIndex<deck.slides.length-1){viewerIndex++;renderSharedSlide()}if(e.key==='ArrowLeft'&&viewerIndex>0){viewerIndex--;renderSharedSlide()}});
    renderSharedSlide();
  } catch(error) {
    showSharedError(error.message==='not_found' ? 'Презентацію не знайдено. Перевірте посилання або попросіть автора надіслати нове.' : 'Не вдалося завантажити презентацію. Перевірте інтернет і спробуйте ще раз.');
  }
}
function showSharedError(message) {
  $('#viewerBody').innerHTML = '<div class="viewer-loading"><h1>Не вдалося відкрити презентацію</h1><p id="viewerError" role="alert"></p><button id="viewerRetry" class="primary">Спробувати ще раз</button><p><a href="./">Перейти до мого редактора</a></p></div>';
  $('#viewerError').textContent = message;
  $('#viewerRetry').onclick = () => location.reload();
}
const sharedId = new URLSearchParams(location.search).get('id');
if (sharedId !== null) loadSharedPresentation(sharedId);

