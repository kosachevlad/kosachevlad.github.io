const editorViewport=$('#canvasViewport'),editorStage=$('#canvasStage');
let canvasView={zoom:1,x:0,y:0},pointerGesture=null,shapePress=null,suppressShapeClick=false;
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
    if(item.kind)button.append(makeShapeSVG(item.kind));
    const text=document.createElement('span');text.textContent=item.label;button.append(text);
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
  const e=element();if(!e)return;
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
function changeTextSize(delta){
  const e=element();if(e?.type!=='text')return;
  const size=clampTextSize(e.size+delta);if(size===e.size)return;
  checkpoint();e.size=size;updateCanvas();renderProperties();
}

function applyCanvasView(next){
  const r=editorViewport.getBoundingClientRect();
  canvasView=constrainCanvasView(next.zoom,next.x,next.y,r.width,r.height);
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
editorViewport.addEventListener('pointerdown',ev=>{
  if(isSharedView||ev.button!==0)return;
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
    const resizing=ev.target.classList.contains('resize');selected=e.id;
    fillCanvas($('#canvas'),slide());renderProperties();
    pointerGesture={kind:'element',...start,id:e.id,original:clone(e),before:clone(deck),resizing,changed:false};
    if(!resizing)pointerGesture.holdTimer=setTimeout(()=>{
      if(pointerGesture?.kind!=='element'||editorPointers.size!==1||pointerGesture.changed)return;
      pointerGesture.kind='held';openElementMenu(e,start.sx,start.sy);
    },550);
  }else{
    selected=null;fillCanvas($('#canvas'),slide());renderProperties();
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
  if(!g.changed&&Math.hypot(dx,dy)<6)return;
  const e=slide().elements.find(item=>item.id===g.id);if(!e)return;
  g.changed=true;const r=$('#canvas').getBoundingClientRect(),x=dx/r.width*100,y=dy/r.height*100;
  if(g.resizing){
    e.w=Math.max(8,Math.min(100-e.x,g.original.w+x));
    if(e.type==='text')e.size=clampTextSize(g.original.size*e.w/g.original.w);
    else e.h=Math.max(6,Math.min(100-e.y,g.original.h+y));
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
const figureButton=$('#addShape');figureButton.setAttribute('aria-haspopup','menu');figureButton.title='Фігура · утримуйте, щоб вибрати';
figureButton.addEventListener('pointerdown',ev=>{
  if(ev.button!==0)return;
  suppressShapeClick=false;shapePress={x:ev.clientX,y:ev.clientY,pointer:ev.pointerId};
  shapePress.timer=setTimeout(()=>{if(!shapePress)return;suppressShapeClick=true;openShapeMenu();},550);
});
figureButton.addEventListener('pointermove',ev=>{if(shapePress&&Math.hypot(ev.clientX-shapePress.x,ev.clientY-shapePress.y)>8){clearTimeout(shapePress.timer);shapePress=null;}});
function finishShapePress(){if(shapePress)clearTimeout(shapePress.timer);shapePress=null;}
figureButton.addEventListener('pointerup',finishShapePress);figureButton.addEventListener('pointercancel',finishShapePress);figureButton.addEventListener('pointerleave',finishShapePress);
figureButton.onclick=()=>{if(suppressShapeClick){suppressShapeClick=false;return;}insertFigure('circle');};
figureButton.addEventListener('contextmenu',ev=>{ev.preventDefault();finishShapePress();suppressShapeClick=true;openShapeMenu();});
figureButton.addEventListener('keydown',ev=>{if(ev.key==='ArrowDown'||(ev.shiftKey&&ev.key==='F10')){ev.preventDefault();openShapeMenu();}});
document.addEventListener('pointerdown',ev=>{if(!contextMenu.hidden&&!contextMenu.contains(ev.target))closeEditorMenu();},true);
document.addEventListener('keydown',ev=>{
  if(contextMenu.hidden)return;
  if(ev.key==='Escape'){ev.preventDefault();closeEditorMenu(true);return;}
  if(ev.key==='Tab'){closeEditorMenu();return;}
  if(['ArrowDown','ArrowUp','Home','End'].includes(ev.key)){
    ev.preventDefault();const items=[...contextMenu.querySelectorAll('button')],i=items.indexOf(document.activeElement);
    const next=ev.key==='Home'?0:ev.key==='End'?items.length-1:(i+(ev.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next].focus();
  }
});
window.addEventListener('resize',()=>{closeEditorMenu();applyCanvasView(canvasView);});
window.addEventListener('blur',()=>{clearGestureHold();restorePendingElement();editorPointers.clear();pointerGesture=null;finishShapePress();});
applyCanvasView(canvasView);
