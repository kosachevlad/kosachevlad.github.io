const editorViewport=$('#canvasViewport'),editorStage=$('#canvasStage');
let canvasView={zoom:1,x:0,y:0},pointerGesture=null;
const editorPointers=new Map();
const contextMenu=document.createElement('div');contextMenu.id='editorContextMenu';contextMenu.className='editor-context-menu';contextMenu.setAttribute('role','menu');contextMenu.hidden=true;document.body.append(contextMenu);
let menuReturnFocus=null;

function closeEditorMenu(restoreFocus=false){
  contextMenu.hidden=true;
  $('#addEmoji')?.setAttribute('aria-expanded','false');
  if(restoreFocus&&menuReturnFocus?.isConnected)menuReturnFocus.focus({preventScroll:true});
}
function showEditorMenu(items,x,y,label,returnFocus){
  contextMenu.innerHTML='';contextMenu.classList.toggle('shape-palette',label==='Фігури');
  contextMenu.classList.toggle('emoji-palette',label==='Емодзі');
  contextMenu.setAttribute('aria-label',label);menuReturnFocus=returnFocus;
  for(const item of items){
    if(item.heading){const heading=document.createElement('div');heading.className='emoji-heading';heading.setAttribute('role','presentation');heading.textContent=item.heading;contextMenu.append(heading);continue;}
    const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');
    if(item.emoji){button.textContent=item.emoji;button.setAttribute('aria-label',item.label);button.title=item.label;}
    else if(item.kind){button.append(makeShapeSVG(item.kind));button.setAttribute('aria-label',item.label);button.title=item.label;}
    else {if(item.icon){const symbol=document.createElement('span');symbol.className='menu-icon';symbol.setAttribute('aria-hidden','true');symbol.innerHTML=icon(item.icon);button.append(symbol);}const text=document.createElement('span');text.textContent=item.label;button.append(text);}
    if(item.danger)button.classList.add('danger');
    button.disabled=!!item.disabled;
    button.onclick=()=>{closeEditorMenu();item.action();};contextMenu.append(button);
  }
  contextMenu.hidden=false;contextMenu.style.left='0px';contextMenu.style.top='0px';
  const rect=contextMenu.getBoundingClientRect(),visible=window.visualViewport;
  const left=visible?.offsetLeft||0,top=visible?.offsetTop||0,width=visible?.width||innerWidth,height=visible?.height||innerHeight;
  contextMenu.style.left=Math.max(left+10,Math.min(left+width-rect.width-10,x))+'px';
  contextMenu.style.top=Math.max(top+10,Math.min(top+height-rect.height-10,y))+'px';
  contextMenu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
}
function performElementAction(action){
  const e=element();if(!e)return;rotationTarget=null;
  if(action==='delete'){deleteSelected();return;}
  checkpoint();
  if(action==='copy'){
    const copy=clone(e);copy.id=uid();copy.x=Math.min(85,copy.x+3);copy.y=Math.min(85,copy.y+3);slide().elements.push(copy);selected=copy.id;
  }else{
    slide().elements=slide().elements.filter(item=>item!==e);
    if(action==='back')slide().elements.unshift(e);else slide().elements.push(e);
  }
  render();
}
function openElementMenu(e,x,y){
  selected=e.id;fillCanvas($('#canvas'),slide());renderProperties();
  showEditorMenu([
    {label:'На задній план',action:()=>performElementAction('back')},
    {label:'На передній план',action:()=>performElementAction('front')},
    {label:'Повернути',icon:'rotate',action:()=>startElementRotation(e)},
    {label:'Дублювати',action:()=>performElementAction('copy')},
    {label:'Видалити',danger:true,action:()=>performElementAction('delete')},
  ],x,y,'Дії з елементом',$('#canvas').querySelector(`[data-id="${e.id}"]`));
}
function insertFigure(kind){
  if(!SHAPE_NAMES[kind])return;
  checkpoint();const e=shape(30,25,28,49,'#b9c99d');e.shapeKind=kind;
  if(kind==='rectangle'||kind==='arrow'){e.w=42;e.h=28;}
  slide().elements.push(e);selected=e.id;tab='design';render();
}
function openShapeMenu(){
  const r=$('#addShape').getBoundingClientRect();
  showEditorMenu(Object.entries(SHAPE_NAMES).map(([kind,label])=>({kind,label,action:()=>insertFigure(kind)})),r.left,r.bottom+6,'Фігури',$('#addShape'));
}
function syncFontSizeControls(){const e=element();if(e?.type!=='text'||!$('#fontSize'))return;$('#fontSize').value=e.size;$('#fontSmaller').disabled=e.size<=1;$('#fontLarger').disabled=e.size>=18;}
function startElementRotation(e){
  commitPendingText();selected=e.id;rotationTarget=e.id;
  fillCanvas($('#canvas'),slide());renderProperties();
}
function exitElementRotation(){
  if(!rotationTarget)return;
  commitPendingText();rotationTarget=null;fillCanvas($('#canvas'),slide());
  $('#canvasHint').textContent=element()?'Перетягніть елемент або змініть його параметри':'Виберіть елемент, щоб редагувати';
}
function measureElementFrame(node,e){
  const r=$('#canvas').getBoundingClientRect(),frame=node.querySelector('.text-content')||node,bounds=frame.getBoundingClientRect();
  if(!normalizeRotation(e.rotation))return {x:(bounds.left-r.left)/r.width*100,y:(bounds.top-r.top)/r.height*100,w:bounds.width/r.width*100,h:bounds.height/r.height*100};
  const css=getComputedStyle(frame),zoom=canvasView.zoom;
  const width=(parseFloat(css.width)||frame.offsetWidth)*zoom/r.width*100;
  const height=(parseFloat(css.height)||frame.offsetHeight)*zoom/r.height*100;
  return {x:(bounds.left+bounds.width/2-r.left)/r.width*100-width/2,y:(bounds.top+bounds.height/2-r.top)/r.height*100-height/2,w:width,h:height};
}
function changeTextSize(delta){
  const e=element();if(e?.type!=='text')return;
  const size=clampTextSize(e.size+delta);if(size===e.size)return;
  checkpoint();e.size=size;updateCanvas();syncFontSizeControls();
}

function applyCanvasView(next){
  const r=editorViewport.getBoundingClientRect();
  canvasView=constrainCanvasView(next.zoom,next.x,next.y,r.width,r.height);
  editorStage.style.setProperty('--handle-scale',1/canvasView.zoom);
  editorStage.style.setProperty('--handle-inset',(5/canvasView.zoom)+'px');
  editorStage.style.transform=`translate(${canvasView.x}px,${canvasView.y}px) scale(${canvasView.zoom})`;
  $('#zoomReset').textContent=Math.round(canvasView.zoom*100)+'%';
  $('#zoomOut').disabled=canvasView.zoom<=.5;$('#zoomIn').disabled=canvasView.zoom>=3;
}
$('#zoomOut').onclick=()=>applyCanvasView({...canvasView,zoom:canvasView.zoom-.25});
$('#zoomIn').onclick=()=>applyCanvasView({...canvasView,zoom:canvasView.zoom+.25});
$('#zoomReset').onclick=()=>applyCanvasView({zoom:1,x:0,y:0});
function clearGestureHold(){if(pointerGesture?.holdTimer)clearTimeout(pointerGesture.holdTimer);}
function restorePendingElement(){
  if(pointerGesture?.kind==='element'&&pointerGesture.changed){
    const e=slide().elements.find(item=>item.id===pointerGesture.id);
    if(e){Object.assign(e,pointerGesture.original);fillCanvas($('#canvas'),slide());}
  }
}
function localPointerPair(){
  const r=editorViewport.getBoundingClientRect();
  return [...editorPointers.values()].slice(0,2).map(p=>({x:p.x-r.left-r.width/2,y:p.y-r.top-r.height/2}));
}
function commitPendingText(){const e=element(),input=$('#textContent');if(e?.type!=='text'||!input||input.value===e.content)return;checkpoint();e.content=input.value;renderList();save();}
editorViewport.addEventListener('pointerdown',ev=>{
  if(isSharedView||ev.button!==0)return;
  commitPendingText();
  ev.preventDefault();closeEditorMenu();
  editorPointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
  editorViewport.setPointerCapture(ev.pointerId);
  if(editorPointers.size>=2){
    clearGestureHold();restorePendingElement();
    const [a,b]=localPointerPair();
    pointerGesture={kind:'pinch',zoom:canvasView.zoom,x:canvasView.x,y:canvasView.y,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};
    return;
  }
  const node=ev.target.closest('.element'),e=node&&slide().elements.find(item=>item.id===node.dataset.id);
  const start={sx:ev.clientX,sy:ev.clientY};
  if(e){
    if(rotationTarget!==e.id)rotationTarget=null;
    const handle=ev.target.closest('.resize'),rotating=!!handle&&rotationTarget===e.id,resizing=!!handle&&!rotating,corner=handle?.dataset.corner||'se';
    const visible=(node.querySelector('.text-content')||node).getBoundingClientRect();
    const center={x:visible.left+visible.width/2,y:visible.top+visible.height/2};
    const startAngle=Math.atan2(ev.clientY-center.y,ev.clientX-center.x)*180/Math.PI;
    let resizeFrame=null;
    if(resizing){
      resizeFrame=measureElementFrame(node,e);
    }
    selected=e.id;
    fillCanvas($('#canvas'),slide());renderProperties();
    pointerGesture={kind:'element',...start,id:e.id,original:clone(e),before:clone(deck),resizing,rotating,center,lastAngle:startAngle,totalAngle:0,corner,resizeFrame,changed:false};
    if(!resizing&&!rotating)pointerGesture.holdTimer=setTimeout(()=>{
      if(pointerGesture?.kind!=='element'||editorPointers.size!==1||pointerGesture.changed)return;
      pointerGesture.kind='held';openElementMenu(e,start.sx,start.sy);
    },550);
  }else{
    rotationTarget=null;selected=null;fillCanvas($('#canvas'),slide());renderProperties();
    pointerGesture={kind:'pan',...start,x:canvasView.x,y:canvasView.y};
  }
});
editorViewport.addEventListener('pointermove',ev=>{
  if(!editorPointers.has(ev.pointerId))return;
  ev.preventDefault();editorPointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
  const g=pointerGesture;if(!g)return;
  if(g.kind==='pinch'){
    if(editorPointers.size<2)return;
    const [a,b]=localPointerPair(),r=editorViewport.getBoundingClientRect();
    applyCanvasView(calculatePinchView(g,a,b,r.width,r.height));return;
  }
  if(g.kind==='held'||g.kind==='await-release')return;
  const dx=ev.clientX-g.sx,dy=ev.clientY-g.sy;
  if(Math.hypot(dx,dy)>8)clearGestureHold();
  if(g.kind==='pan'){applyCanvasView({...canvasView,x:g.x+dx,y:g.y+dy});return;}
  if(!g.changed&&Math.hypot(dx,dy)<(g.rotating?2:6))return;
  const e=slide().elements.find(item=>item.id===g.id);if(!e)return;
  if(g.rotating){
    if(Math.hypot(ev.clientX-g.center.x,ev.clientY-g.center.y)<6)return;
    const angle=Math.atan2(ev.clientY-g.center.y,ev.clientX-g.center.x)*180/Math.PI;
    g.totalAngle+=rotationAngleDelta(g.lastAngle,angle);g.lastAngle=angle;
    e.rotation=normalizeRotation((g.original.rotation||0)+g.totalAngle);g.changed=e.rotation!==normalizeRotation(g.original.rotation);
    const n=$('#canvas').querySelector(`[data-id="${e.id}"]`);if(n)applyElementRotation(n,e);
    $('#canvasHint').textContent='Поворот: '+e.rotation+'° · тягніть круглий маркер';return;
  }
  g.changed=true;const r=$('#canvas').getBoundingClientRect(),x=dx/r.width*100,y=dy/r.height*100;
  if(g.resizing){
    Object.assign(e,resizeRotatedElement(g.original,g.resizeFrame,g.corner,x,y));
  }else{e.x=Math.max(0,Math.min(95,g.original.x+x));e.y=Math.max(0,Math.min(92,g.original.y+y));}
  const n=$('#canvas').querySelector(`[data-id="${e.id}"]`);if(!n)return;
  n.style.left=e.x+'%';n.style.top=e.y+'%';n.style.width=e.w+'%';n.style.setProperty('--fs',e.size||3);
  if(e.type!=='text')n.style.height=e.h+'%';
});
function finishEditorPointer(ev){
  if(!editorPointers.has(ev.pointerId))return;
  const g=pointerGesture;clearGestureHold();
  if(g?.kind==='element'&&g.changed){
    if(ev.type==='pointercancel')restorePendingElement();
    else {past.push(g.before);if(past.length>40)past.shift();future=[];renderList();renderProperties();save();}
  }
  editorPointers.delete(ev.pointerId);
  if(editorViewport.hasPointerCapture(ev.pointerId))editorViewport.releasePointerCapture(ev.pointerId);
  pointerGesture=editorPointers.size?{kind:'await-release'}:null;
}
editorViewport.addEventListener('pointerup',finishEditorPointer);
editorViewport.addEventListener('pointercancel',finishEditorPointer);
editorViewport.addEventListener('lostpointercapture',finishEditorPointer);
editorViewport.addEventListener('contextmenu',ev=>{
  const n=ev.target.closest('.element'),e=n&&slide().elements.find(item=>item.id===n.dataset.id);if(!e)return;
  ev.preventDefault();clearGestureHold();const r=n.getBoundingClientRect();
  openElementMenu(e,ev.clientX||r.left+r.width/2,ev.clientY||r.top+r.height/2);
});
const figureButton=$('#addShape');figureButton.setAttribute('aria-haspopup','menu');figureButton.title='Вибрати фігуру';
figureButton.onclick=()=>openShapeMenu();
figureButton.addEventListener('contextmenu',ev=>{ev.preventDefault();openShapeMenu();});
figureButton.addEventListener('keydown',ev=>{if(ev.key==='ArrowDown'||(ev.shiftKey&&ev.key==='F10')){ev.preventDefault();openShapeMenu();}});

const EMOJI_GROUPS=[
  ['Обличчя та емоції','😀 Усмішка|😃 Радість|😄 Щастя|😁 Широка усмішка|😆 Сміх|😅 Усмішка з потом|😂 Сльози радості|🤣 Регіт|😊 Задоволення|🙂 Легка усмішка|😉 Підморгування|😍 Закоханість|🥰 Ніжність|😘 Поцілунок|😎 Круто|🤩 Захоплення|🥳 Свято|🤔 Роздуми|🤨 Сумнів|😐 Нейтрально|😴 Сон|🥱 Позіхання|😢 Сум|😭 Плач|😮 Подив|😲 Здивування|😱 Переляк|😡 Злість|🤯 Враження|🤗 Обійми|🤫 Тиша|🤭 Зніяковіння|🙃 Догори дриґом|😇 Янгол|🤓 Розумник|🧐 Дослідник'],
  ['Жести та люди','👍 Подобається|👎 Не подобається|👏 Оплески|🙌 Успіх|👋 Привіт|🤝 Рукостискання|✌️ Мир|🤞 Побажання удачі|👌 Чудово|💪 Сила|🙏 Подяка|🫶 Руки серцем|👆 Угору|👇 Униз|👉 Праворуч|👈 Ліворуч|✍️ Письмо|🧑‍🏫 Учитель|🧑‍🎓 Учень|🧑‍💻 Програміст|🧑‍🔬 Науковець|🧑‍🚀 Космонавт|👨‍👩‍👧‍👦 Родина|🦸 Супергерой'],
  ['Тварини та природа','🐶 Собака|🐱 Кіт|🐭 Миша|🐹 Хом’як|🐰 Кролик|🦊 Лисиця|🐻 Ведмідь|🐼 Панда|🐨 Коала|🐯 Тигр|🦁 Лев|🐮 Корова|🐷 Порося|🐸 Жаба|🐵 Мавпа|🐔 Курка|🐧 Пінгвін|🦉 Сова|🦋 Метелик|🐝 Бджола|🐞 Сонечко|🐢 Черепаха|🐬 Дельфін|🐳 Кит|🌳 Дерево|🌲 Ялинка|🌱 Паросток|🌿 Зелень|🌸 Квітка|🌻 Соняшник|🌹 Троянда|🍀 Конюшина|🍁 Осінній листок|🍄 Гриб|🌍 Земля|🌈 Веселка|☀️ Сонце|🌙 Місяць|⭐ Зірка|☁️ Хмаринка|🌧️ Дощ|❄️ Сніжинка'],
  ['Їжа та напої','🍎 Яблуко|🍐 Груша|🍊 Апельсин|🍋 Лимон|🍌 Банан|🍉 Кавун|🍇 Виноград|🍓 Полуниця|🍒 Вишні|🍑 Персик|🍍 Ананас|🥝 Ківі|🥕 Морква|🌽 Кукурудза|🥦 Броколі|🍅 Помідор|🍞 Хліб|🥐 Круасан|🧀 Сир|🍕 Піца|🍔 Бургер|🍟 Картопля фрі|🍿 Попкорн|🍦 Морозиво|🍰 Торт|🎂 День народження|🍪 Печиво|🍫 Шоколад|☕ Кава|🫖 Чай|🧃 Сік|💧 Вода'],
  ['Навчання та техніка','📚 Книги|📖 Читання|📕 Підручник|📓 Зошит|📝 Нотатки|✏️ Олівець|🖊️ Ручка|🖌️ Пензлик|🎨 Палітра|📏 Лінійка|📐 Косинець|✂️ Ножиці|📌 Кнопка|📎 Скріпка|🔍 Пошук|💡 Ідея|🧠 Мозок|🎓 Освіта|🏫 Школа|💻 Ноутбук|🖥️ Комп’ютер|⌨️ Клавіатура|🖱️ Мишка|📱 Телефон|🤖 Робот|⚙️ Налаштування|🔋 Батарея|🔌 Живлення|📷 Фотоапарат|🎥 Відеокамера|🔬 Мікроскоп|🔭 Телескоп|🧪 Пробірка|🧲 Магніт|🧩 Пазл|🗂️ Документи'],
  ['Подорожі та місця','🏠 Дім|🏙️ Місто|🏛️ Музей|🏰 Замок|⛪ Церква|⛲ Фонтан|🌉 Міст|🏞️ Парк|🏔️ Гори|🏖️ Пляж|🗺️ Карта|🧭 Компас|🚶 Прогулянка|🚲 Велосипед|🚗 Автомобіль|🚌 Автобус|🚎 Тролейбус|🚋 Трамвай|🚇 Метро|🚆 Потяг|✈️ Літак|🚀 Ракета|🚢 Корабель|⛵ Вітрильник'],
  ['Спорт та свята','⚽ Футбол|🏀 Баскетбол|🏐 Волейбол|🎾 Теніс|🏓 Настільний теніс|🏸 Бадмінтон|🏊 Плавання|🏃 Біг|🚴 Велоспорт|🏆 Кубок|🥇 Золота медаль|🎯 Мета|🎲 Гральний кубик|♟️ Шахи|🎮 Відеогра|🎵 Нота|🎶 Музика|🎤 Мікрофон|🎧 Навушники|🎸 Гітара|🎹 Піаніно|🎭 Театр|🎬 Кіно|🎉 Вітання|🎊 Конфеті|🎈 Повітряна кулька|🎁 Подарунок|🎀 Стрічка|🪄 Чарівна паличка|✨ Блискітки'],
  ['Серця та символи','❤️ Червоне серце|🧡 Помаранчеве серце|💛 Жовте серце|💚 Зелене серце|💙 Синє серце|💜 Фіолетове серце|🖤 Чорне серце|🤍 Біле серце|💕 Два серця|💔 Розбите серце|🔥 Вогонь|⚡ Блискавка|💯 Сто відсотків|✅ Виконано|❌ Помилка|❓ Питання|❗ Увага|⚠️ Попередження|♻️ Переробка|🔒 Замок|🔑 Ключ|🔔 Дзвінок|⏰ Будильник|📅 Календар|📊 Діаграма|📈 Зростання|➡️ Стрілка праворуч|⬅️ Стрілка ліворуч|⬆️ Стрілка вгору|⬇️ Стрілка вниз|🔄 Оновлення|🇺🇦 Україна'],
];
function insertEmoji(value){
  if(isSharedView)return;
  commitPendingText();checkpoint();const e=text(value,38,30,24,12);slide().elements.push(e);selected=e.id;rotationTarget=null;tab='design';render();
}
function openEmojiMenu(){
  if(isSharedView)return;
  const button=$('#addEmoji'),r=button.getBoundingClientRect();
  const items=EMOJI_GROUPS.flatMap(([heading,values])=>[{heading},...values.split('|').map(entry=>{
    const space=entry.indexOf(' '),emoji=entry.slice(0,space),label=entry.slice(space+1);
    return {emoji,label,action:()=>insertEmoji(emoji)};
  })]);
  showEditorMenu(items,r.left,r.bottom+6,'Емодзі',button);button.setAttribute('aria-expanded','true');
}
const emojiButton=$('#addEmoji');
emojiButton.onclick=()=>{if(!contextMenu.hidden&&contextMenu.classList.contains('emoji-palette'))closeEditorMenu();else openEmojiMenu();};
emojiButton.addEventListener('keydown',ev=>{if(ev.key==='ArrowDown'){ev.preventDefault();openEmojiMenu();}});

const slideStrip=$('#slideList');
let slideHold=null,suppressedSlideClick=null;
function cancelSlideHold(){if(slideHold)clearTimeout(slideHold.timer);slideHold=null;}
function performSlideAction(id,action){
  if(isSharedView)return;
  const index=deck.slides.findIndex(s=>s.id===id);if(index<0)return;
  if(action==='delete'&&deck.slides.length===1)return;
  if(action==='earlier'&&index===0||action==='later'&&index===deck.slides.length-1)return;
  commitPendingText();checkpoint();active=index;selected=null;rotationTarget=null;
  if(action==='duplicate'){
    const copy=clone(slide());copy.id=uid();copy.elements.forEach(e=>e.id=uid());deck.slides.splice(++active,0,copy);
  }else if(action==='delete'){
    deck.slides.splice(active,1);active=Math.max(0,active-1);
  }else{
    const s=deck.slides.splice(active,1)[0];active+=action==='earlier'?-1:1;deck.slides.splice(active,0,s);
  }
  render();
}
function openSlideMenu(id,x,y){
  if(isSharedView)return;
  const index=deck.slides.findIndex(s=>s.id===id);if(index<0)return;
  commitPendingText();active=index;selected=null;rotationTarget=null;render();
  const thumb=[...slideStrip.querySelectorAll('.thumbnail')].find(n=>n.closest('.slide-item').dataset.slideId===id);
  showEditorMenu([
    {label:'Дублювати',action:()=>performSlideAction(id,'duplicate')},
    {label:'Раніше',disabled:index===0,action:()=>performSlideAction(id,'earlier')},
    {label:'Пізніше',disabled:index===deck.slides.length-1,action:()=>performSlideAction(id,'later')},
    {label:'Видалити',danger:true,disabled:deck.slides.length===1,action:()=>performSlideAction(id,'delete')},
  ],x,y,'Дії зі слайдом',thumb);
}
slideStrip.addEventListener('pointerdown',ev=>{
  if(slideHold){cancelSlideHold();return;}
  const item=ev.target.closest('.slide-item');if(isSharedView||ev.button!==0||!ev.isPrimary||!item)return;
  const hold={id:item.dataset.slideId,pointerId:ev.pointerId,x:ev.clientX,y:ev.clientY};
  hold.timer=setTimeout(()=>{
    slideHold=null;suppressedSlideClick={id:hold.id,until:Date.now()+1200};openSlideMenu(hold.id,hold.x,hold.y);
  },550);slideHold=hold;
});
document.addEventListener('pointermove',ev=>{if(slideHold&&ev.pointerId===slideHold.pointerId&&Math.hypot(ev.clientX-slideHold.x,ev.clientY-slideHold.y)>10)cancelSlideHold();},true);
for(const type of ['pointerup','pointercancel'])document.addEventListener(type,cancelSlideHold,true);
slideStrip.addEventListener('scroll',cancelSlideHold,{passive:true});
window.addEventListener('blur',cancelSlideHold);
slideStrip.addEventListener('click',ev=>{
  if(suppressedSlideClick&&Date.now()<suppressedSlideClick.until&&ev.target.closest('.slide-item')?.dataset.slideId===suppressedSlideClick.id){ev.preventDefault();ev.stopImmediatePropagation();suppressedSlideClick=null;}
},true);
slideStrip.addEventListener('contextmenu',ev=>{
  const item=ev.target.closest('.slide-item');if(!item||isSharedView)return;
  ev.preventDefault();cancelSlideHold();const r=item.getBoundingClientRect();openSlideMenu(item.dataset.slideId,ev.clientX||r.left,ev.clientY||r.top);
});
slideStrip.addEventListener('keydown',ev=>{
  const item=ev.target.closest('.slide-item');if(item&&(ev.key==='ContextMenu'||ev.shiftKey&&ev.key==='F10')){ev.preventDefault();const r=item.getBoundingClientRect();openSlideMenu(item.dataset.slideId,r.left,r.bottom);}
});

document.addEventListener('pointerdown',ev=>{
  if(rotationTarget&&!contextMenu.contains(ev.target)&&ev.target.closest('.element')?.dataset.id!==rotationTarget)exitElementRotation();
  if(!contextMenu.hidden&&!contextMenu.contains(ev.target)&&!ev.target.closest('#addEmoji'))closeEditorMenu();
},true);
document.addEventListener('keydown',ev=>{
  if(contextMenu.hidden){if(ev.key==='Escape'&&rotationTarget){ev.preventDefault();exitElementRotation();}return;}
  if(ev.key==='Escape'){ev.preventDefault();closeEditorMenu(true);return;}
  if(ev.key==='Tab'){closeEditorMenu();return;}
  if(['ArrowDown','ArrowUp','Home','End'].includes(ev.key)){
    ev.preventDefault();const items=[...contextMenu.querySelectorAll('button:not(:disabled)')],i=items.indexOf(document.activeElement);
    const next=ev.key==='Home'?0:ev.key==='End'?items.length-1:(i+(ev.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next].focus();
  }
});
window.addEventListener('resize',()=>{closeEditorMenu();applyCanvasView(canvasView);});
window.addEventListener('blur',()=>{clearGestureHold();restorePendingElement();editorPointers.clear();pointerGesture=null;});
applyCanvasView(canvasView);
