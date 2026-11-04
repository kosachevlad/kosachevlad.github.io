const editorViewport=$('#canvasViewport'),editorStage=$('#canvasStage');
let canvasView={zoom:1,x:0,y:0},pointerGesture=null;
const editorPointers=new Map();
const contextMenu=document.createElement('div');contextMenu.id='editorContextMenu';contextMenu.className='editor-context-menu';contextMenu.setAttribute('role','menu');contextMenu.hidden=true;document.body.append(contextMenu);
let menuReturnFocus=null;

function closeEditorMenu(restoreFocus=false){
  contextMenu.hidden=true;
  if(restoreFocus&&menuReturnFocus?.isConnected)menuReturnFocus.focus({preventScroll:true});
}
function showEditorMenu(items,x,y,label,returnFocus){
  contextMenu.innerHTML='';contextMenu.classList.toggle('shape-palette',label==='Фігури');
  contextMenu.setAttribute('aria-label',label);menuReturnFocus=returnFocus;
  for(const item of items){
    const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');
    if(item.kind){button.append(makeShapeSVG(item.kind));button.setAttribute('aria-label',item.label);button.title=item.label;}
    else {if(item.icon){const symbol=document.createElement('span');symbol.className='menu-icon';symbol.setAttribute('aria-hidden','true');symbol.innerHTML=icon(item.icon);button.append(symbol);}const text=document.createElement('span');text.textContent=item.label;button.append(text);}
    if(item.danger)button.classList.add('danger');
    button.onclick=()=>{closeEditorMenu();item.action();};contextMenu.append(button);
  }
  contextMenu.hidden=false;contextMenu.style.left='0px';contextMenu.style.top='0px';
  const rect=contextMenu.getBoundingClientRect(),visible=window.visualViewport;
  const left=visible?.offsetLeft||0,top=visible?.offsetTop||0,width=visible?.width||innerWidth,height=visible?.height||innerHeight;
  contextMenu.style.left=Math.max(left+10,Math.min(left+width-rect.width-10,x))+'px';
  contextMenu.style.top=Math.max(top+10,Math.min(top+height-rect.height-10,y))+'px';
  contextMenu.querySelector('button')?.focus({preventScroll:true});
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

document.addEventListener('pointerdown',ev=>{
  if(rotationTarget&&!contextMenu.contains(ev.target)&&ev.target.closest('.element')?.dataset.id!==rotationTarget)exitElementRotation();
  if(!contextMenu.hidden&&!contextMenu.contains(ev.target))closeEditorMenu();
},true);
document.addEventListener('keydown',ev=>{
  if(contextMenu.hidden){if(ev.key==='Escape'&&rotationTarget){ev.preventDefault();exitElementRotation();}return;}
  if(ev.key==='Escape'){ev.preventDefault();closeEditorMenu(true);return;}
  if(ev.key==='Tab'){closeEditorMenu();return;}
  if(['ArrowDown','ArrowUp','Home','End'].includes(ev.key)){
    ev.preventDefault();const items=[...contextMenu.querySelectorAll('button')],i=items.indexOf(document.activeElement);
    const next=ev.key==='Home'?0:ev.key==='End'?items.length-1:(i+(ev.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next].focus();
  }
});
window.addEventListener('resize',()=>{closeEditorMenu();applyCanvasView(canvasView);});
window.addEventListener('blur',()=>{clearGestureHold();restorePendingElement();editorPointers.clear();pointerGesture=null;});
applyCanvasView(canvasView);
