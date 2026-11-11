"use strict";
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const editor = $("#editor");
const icons = {
  undo:"M8 5 3 10l5 5M3 10h12a5 5 0 0 1 0 10",
  redo:"m16 5 5 5-5 5m5-5H9a5 5 0 0 0 0 10",
  paste:"M6 4H4v17h16V4h-3M8 2h8v5H8zM8 11h8m-8 4h8",
  cut:"M8 16a3 3 0 1 0 0 .01m12 0a3 3 0 1 0 0 .01M8 15 19 3m-3 12L5 3",
  copy:"M9 8h11v13H9zM6 16H4V3h11v2",
  highlight:"m6 16 9-12 5 4-9 12H6zM13 7l5 4M3 22h18",
  bullets:"M8 5h13M8 12h13M8 19h13M3 5h1m-1 7h1m-1 7h1",
  numbers:"M9 5h12M9 12h12M9 19h12M3 3h1v4m-2 4h3v1l-3 2h3m-3 3h3v4H2m1-2h2",
  levels:"M7 5h14M10 12h11M13 19h8M3 4v3m2 4h2v1l-2 2h2m1 4h2v3H8",
  left:"M3 5h18M3 9h11M3 13h18M3 17h11M3 21h18",
  center:"M3 5h18M7 9h10M3 13h18M7 17h10M3 21h18",
  right:"M3 5h18M10 9h11M3 13h18M10 17h11M3 21h18",
  justify:"M3 5h18M3 9h18M3 13h18M3 17h18M3 21h18",
  spacing:"M9 5h12M9 10h12M9 15h12M9 20h12M4 4v17M1 7l3-3 3 3m-6 11 3 3 3-3",
  file:"M5 2h9l5 5v15H5zM14 2v6h5m-11 4h8m-8 4h8",
  open:"M3 20V5h7l3 3h8v4M3 20l4-9h15l-4 9z",
  save:"M3 3h15l3 3v15H3zM7 3h9v6H7zm0 10h10v8H7z",
  share:"M14 3h7v7m0-7-9 9m8 2v7H3V4h7",
  break:"M5 2h14v7H5zm0 13h14v7H5zM2 12h3m2 0h3m2 0h3m2 0h4",
  table:"M3 4h18v16H3zM3 9h18M3 14h18M9 4v16m6-16v16",
  shapes:"M20 8a5 5 0 1 0-10 0m-7 1h10v11H3zm10 12 5-10 5 10z",
  image:"M2 4h20v16H2zM2 18l6-7 5 5 3-3 6 6M17 8h.01",
  web:"M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0M16 12c0-12-8-12-8 0s8 12 8 0M4 9h16M4 15h16"
};
$$("i[data-icon]").forEach(icon => {
  icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + icons[icon.dataset.icon] + '"/></svg>';
});
for (let quarter = -12; quarter <= 84; quarter++) {
  const mark = document.createElement("span");
  mark.className = "tick";
  if (quarter % 4) {
    mark.classList.add("minor");
    if (quarter % 2 === 0) mark.classList.add("half");
  } else if (quarter) {
    const label = document.createElement("span");
    label.textContent = Math.abs(quarter / 4);
    mark.append(label);
  }
  mark.style.left = "calc(" + quarter / 4 + "cm + var(--margin))";
  $("#ruler").append(mark);
}

let savedRange, selectedObject, activeMenu, noticeTimer, resolveDialog, localClipboard;
let name = "Документ 1";
let savedHtml;
let history = [], index = -1, previousType = "", lastChange = 0;
const selection = () => getSelection();
const element = node => node?.nodeType === 1 ? node : node?.parentElement;
const pageAt = () => element(savedRange?.startContainer)?.closest(".page") || editor.firstElementChild;
const blank = () => document.createRange().createContextualFragment("<p><br></p>");
function newPage() {
  const page = document.createElement("section");
  page.className = "page";
  return page;
}
function capture() {
  const range = selection().rangeCount && selection().getRangeAt(0);
  if (range && editor.contains(range.startContainer) && editor.contains(range.endContainer)) {
    savedRange = range.cloneRange();
    return savedRange;
  }
}
function setRange(range) {
  editor.focus({preventScroll:true});
  selection().removeAllRanges();
  selection().addRange(range);
  savedRange = range.cloneRange();
  return range;
}
function caret(node, end = false) {
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(!end);
  return setRange(range);
}
function restore() {
  if (savedRange && editor.contains(savedRange.startContainer) && editor.contains(savedRange.endContainer)) return setRange(savedRange);
  return caret(editor.querySelector(".page p, .page"));
}
function path(node) {
  const positions = [];
  while (node !== editor && node?.parentNode) {
    positions.unshift([...node.parentNode.childNodes].indexOf(node));
    node = node.parentNode;
  }
  return node === editor ? positions : [];
}
function bookmark() {
  const range = capture() || savedRange;
  return range ? [path(range.startContainer),range.startOffset,path(range.endContainer),range.endOffset] : null;
}
function fromBookmark(mark) {
  if (!mark) return null;
  const find = positions => positions.reduce((node,i) => node?.childNodes[i],editor);
  const start = find(mark[0]), end = find(mark[2]);
  if (!start || !end) return null;
  const limit = node => node.nodeType === 3 ? node.length : node.childNodes.length;
  const range = document.createRange();
  range.setStart(start,Math.min(mark[1],limit(start)));
  range.setEnd(end,Math.min(mark[3],limit(end)));
  return range;
}
function tidy() {
  if (!editor.firstChild) editor.append(newPage());
  for (const node of [...editor.childNodes]) {
    if (node.nodeType === 1 && node.classList.contains("page")) {
      if (!node.firstChild) node.append(blank());
    } else {
      const page = node.previousElementSibling?.classList.contains("page") ? node.previousElementSibling : newPage();
      if (!page.parentNode) editor.insertBefore(page,node);
      page.append(node);
    }
  }
}
function html() {
  return editor.innerHTML;
}
function beforeEdit() {
  if (history[index]) history[index].mark = bookmark();
}
function record(type = "") {
  tidy();
  const markers = [...editor.querySelectorAll("li")].map(item => [item,Docx.listMarkerSize(item) + "px"]);
  for (const [item,size] of markers) {
    if (item.style.getPropertyValue("--list-marker-size") !== size) item.style.setProperty("--list-marker-size",size);
  }
  const snapshot = {html:html(),mark:bookmark()};
  if (history[index]?.html === snapshot.html) return update();
  const now = Date.now();
  if (type && type === previousType && now - lastChange < 850 && index > 0 && index === history.length - 1) history[index] = snapshot;
  else {
    history.splice(index+1,Infinity,snapshot);
    if (history.length > 80) history.shift();
    index = history.length - 1;
  }
  previousType = type;
  lastChange = now;
  update();
}
function change(fn) {
  restore();
  beforeEdit();
  fn();
  record();
  positionFrame();
}
function step(delta) {
  selectObject(null);
  const snapshot = history[index + delta];
  if (!snapshot) return;
  index += delta;
  previousType = "";
  editor.innerHTML = snapshot.html;
  savedRange = fromBookmark(snapshot.mark);
  restore();
  update();
}
function update() {
  const words = editor.innerText.match(/[\p{L}\p{N}]+(?:['’ʼ-][\p{L}\p{N}]+)*/gu) || [];
  $("#page-status").textContent = "Сторінка " + ([...editor.children].indexOf(pageAt())+1) + " з " + editor.children.length;
  $("#word-status").textContent = "Слів: " + words.length;
  $("#title").textContent = document.title = name + " — Вебредактор";
  $("[data-action=undo]").disabled = index <= 0;
  $("[data-action=redo]").disabled = index >= history.length-1;
  const parent = element(savedRange?.startContainer);
  if (!parent || !editor.contains(parent)) return;
  const style = getComputedStyle(parent);
  const font = style.fontFamily.split(",")[0].replace(/["']/g,"").trim();
  if (document.activeElement !== $("#font")) {
    const select = $("#font");
    if (font && ![...select.options].some(option => option.value === font)) select.add(new Option(font,font));
    select.value = font;
  }
  if (document.activeElement !== $("#size")) $("#size").value = Math.round(parseFloat(style.fontSize)*75)/100;
  const align = ({start:"left",end:"right"})[style.textAlign] || style.textAlign;
  $$("[data-command]").forEach(button => {
    const command = button.dataset.command;
    const active = command.startsWith("justify") ? align === (command === "justifyFull" ? "justify" : command.slice(7).toLowerCase()) : document.queryCommandState(command);
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",active);
  });
}
function flash(message) {
  $("#notice").textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => $("#notice").textContent = "",8000);
}
function blocks() {
  const blockSelector = "p,li,.page > div,td,h1,h2,h3,h4,h5,h6";
  if (savedRange.collapsed) return [element(savedRange.startContainer)?.closest(blockSelector)].filter(Boolean);
  return [...editor.querySelectorAll(blockSelector)].filter(block =>
    savedRange.intersectsNode(block) && ![...block.children].some(child => child.matches("p,div") && savedRange.intersectsNode(child))
  );
}
function exec(command,value) {
  change(() => {
    if (command.startsWith("justify")) {
      const align = command === "justifyFull" ? "justify" : command.slice(7).toLowerCase();
      blocks().forEach(block => block.style.textAlign = align);
      return;
    }
    document.execCommand("styleWithCSS",false,true);
    document.execCommand(command,false,value);
  });
}
function fontSize(value) {
  const size = Number(value.trim().replace(",","."));
  if (!size || size < 1 || size > 1638) {
    flash("Вкажіть розмір шрифту від 1 до 1638 пт.");
    restore();
    update();
    return;
  }
  change(() => {
    if (savedRange.collapsed) {
      const span = document.createElement("span");
      span.style.fontSize = size + "pt";
      span.textContent = "\u200b";
      savedRange.insertNode(span);
      caret(span,true);
      return;
    }
    document.execCommand("styleWithCSS",false,false);
    document.execCommand("fontSize",false,"7");
    editor.querySelectorAll('font[size="7"]').forEach(font => {
      font.removeAttribute("size");
      font.style.fontSize = size + "pt";
    });
  });
}
function listLevel(out) {
  change(() => {
    const item = element(savedRange.startContainer)?.closest("li");
    if (!item) return;
    const list = item.parentElement;
    if (out) {
      const parent = list.parentElement.closest("li");
      if (!parent) return document.execCommand(list.tagName === "OL" ? "insertOrderedList" : "insertUnorderedList");
      if (item.nextElementSibling) {
        const rest = list.cloneNode(false);
        while (item.nextElementSibling) rest.append(item.nextElementSibling);
        item.append(rest);
      }
      parent.after(item);
      if (!list.firstElementChild) list.remove();
    } else {
      const previous = item.previousElementSibling;
      if (previous?.tagName !== "LI") return;
      let sub = previous.lastElementChild;
      if (sub?.tagName !== list.tagName) {
        sub = list.cloneNode(false);
        sub.removeAttribute("start");
        previous.append(sub);
      }
      sub.append(item);
    }
    caret(item);
  });
}
function multilevel() {
  change(() => {
    if (!element(savedRange.startContainer)?.closest("ol")) document.execCommand("insertOrderedList");
    let list = element(capture()?.startContainer)?.closest("ol");
    if (!list) return;
    while (list.parentElement.closest("ol")) list = list.parentElement.closest("ol");
    [list,...list.querySelectorAll("ol")].forEach(level => level.dataset.multilevel = "");
  });
}
function splitPage() {
  change(() => {
    const page = pageAt();
    const range = selection().getRangeAt(0);
    if (!page.contains(range.startContainer) || !page.contains(range.endContainer)) return;
    range.deleteContents();
    range.setEnd(page,page.childNodes.length);
    const next = newPage();
    next.append(range.extractContents());
    if (!next.firstChild) next.append(blank());
    page.after(next);
    caret(next.firstElementChild || next);
    next.scrollIntoView({block:"start"});
  });
}
function inline(node) {
  change(() => {
    const range = selection().getRangeAt(0);
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    setRange(range);
  });
  selectObject(node);
}

const workspace = $("#workspace");
const rulerBar = $("#ruler").parentElement;
const rulerCorner = rulerBar.querySelector(".tab-stop");
let rulerScrollLeft = 0;

function positionVerticalRuler() {
  const page = editor.firstElementChild;
  if (!page || !rulerCorner.getClientRects().length) return;
  // Keep the page centered without reserving a scrollbar gutter over the ruler.
  const gutter = workspace.offsetWidth - workspace.clientWidth + "px";
  if (workspace.style.getPropertyValue("--ruler-gutter") !== gutter) {
    workspace.style.setProperty("--ruler-gutter",gutter);
  }
  const left = rulerCorner.getBoundingClientRect().left;
  const offset = left - page.getBoundingClientRect().left - page.clientLeft + "px";
  if (editor.style.getPropertyValue("--vertical-ruler-left") !== offset) {
    editor.style.setProperty("--vertical-ruler-left",offset);
  }
}

workspace.addEventListener("scroll",() => {
  const left = workspace.scrollLeft;
  if (rulerBar.scrollLeft !== left) rulerBar.scrollLeft = left;
  if (rulerScrollLeft !== left) {
    rulerScrollLeft = left;
    positionVerticalRuler();
  }
},{passive:true});
const resizeFrame = document.createElement("div");
resizeFrame.className = "object-frame";
resizeFrame.hidden = true;
workspace.append(resizeFrame);

const objectTools = document.createElement("div");
objectTools.className = "object-tools";
objectTools.setAttribute("role","group");
objectTools.setAttribute("aria-label","Дії з вибраним об’єктом");
objectTools.hidden = true;
workspace.append(objectTools);
objectTools.addEventListener("pointerdown",event => {
  if (event.target.closest("button")) event.preventDefault();
});
let resizeDrag;
const proportionButton = objectTool("lock","Зберігати пропорції");
proportionButton.setAttribute("aria-pressed","true");
const wrapSelect = document.createElement("select");
wrapSelect.className = "object-wrap";
wrapSelect.setAttribute("aria-label","Обтікання текстом");
wrapSelect.title = "Обтікання текстом";
const wrapModes = [
  ["inline","У тексті"],
  ["left","Навколо — об’єкт ліворуч"],
  ["right","Навколо — об’єкт праворуч"],
  ["top-bottom","Згори й знизу"],
  ["behind","За текстом"],
  ["front","Перед текстом"]
];
for (const [value,label] of wrapModes) wrapSelect.add(new Option(label,value));
objectTools.append(wrapSelect);
wrapSelect.addEventListener("change",() => editObject(object => {
  // Umo's image node distinguishes inline and floating layout in its attributes.
  // Keep that choice on the document node, extended with Word's wrap modes.
  if (wrapSelect.value === "inline") {
    delete object.dataset.wrap;
    object.style.removeProperty("--object-layer");
  } else {
    const joinsLayer = !object.dataset.wrap || (object.dataset.wrap === "behind") !== (wrapSelect.value === "behind");
    object.dataset.wrap = wrapSelect.value;
    if (joinsLayer) {
      const peers = layerPeers(object).filter(peer => peer !== object);
      peers.forEach((peer,index) => peer.style.setProperty("--object-layer",index+1));
      object.style.setProperty("--object-layer",peers.length+1);
    }
  }
  syncWrapBounds(object);
}));
const rotationHandle = document.createElement("button");
rotationHandle.type = "button";
rotationHandle.className = "rotation-handle";
rotationHandle.innerHTML = objectIcon("right");
rotationHandle.setAttribute("aria-label","Повернути перетягуванням або стрілками");
rotationHandle.title = "Повернути. Shift — крок 15°";
resizeFrame.append(rotationHandle);
const moveHandle = document.createElement("button");
moveHandle.type = "button";
moveHandle.className = "move-handle";
moveHandle.innerHTML = objectIcon("move");
moveHandle.setAttribute("aria-label","Перемістити об’єкт");
moveHandle.title = "Перетягніть, щоб перемістити об’єкт";
resizeFrame.append(moveHandle);

function objectIcon(name) {
  const paths = {
    left:"M8 4H3v5M3.4 8a8 8 0 1 1 .5 9",
    right:"M16 4h5v5m-.4-1a8 8 0 1 0-.5 9",
    start:"M4 5h16M4 10h10M4 15h16M4 20h10",
    center:"M4 5h16M7 10h10M4 15h16M7 20h10",
    end:"M4 5h16M10 10h10M4 15h16M10 20h10",
    lock:"M8 11V7a4 4 0 0 1 8 0v4M6 11h12v9H6z",
    reset:"M5 5h14v14H5zM9 15l6-6m-4 0h4v4",
    move:"M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3",
    forward:"M3 10h5v11h11v-5M8 8h13v9H8zM14 12V3m-3 3 3-3 3 3",
    backward:"M3 10h5v11h11v-5M8 5h13v9H8zM14 9v10m-3-3 3 3 3-3",
    remove:"M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13m-8 3v7m4-7v7"
  };
  return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="'+paths[name]+'"/></svg>';
}
function objectTool(icon,label,action) {
  const button = document.createElement("button");
  button.type = "button";
  button.innerHTML = objectIcon(icon);
  button.setAttribute("aria-label",label);
  button.title = label;
  if (action) button.addEventListener("click",action);
  objectTools.append(button);
  return button;
}
const alignTools = [
  ["start","ліворуч","left"],["center","по центру","center"],["end","праворуч","right"]
].map(([icon,label,value]) => {
  const button = objectTool(icon,"Вирівняти абзац "+label,() => editObject(object => {
    const paragraph = objectParagraph(object);
    if (paragraph) paragraph.style.textAlign = value;
  }));
  return [button,value];
});
objectTool("left","Повернути на 90° ліворуч",() => turnObject(-90));
objectTool("right","Повернути на 90° праворуч",() => turnObject(90));
objectTool("reset","Скинути поворот",() => editObject(object => setObjectAngle(object,0)));
const forwardTool = objectTool("forward","Перемістити вперед",() => changeObjectLayer(1));
const backwardTool = objectTool("backward","Перемістити назад",() => changeObjectLayer(-1));
const deleteTool = objectTool("remove","Видалити об’єкт",removeObject);
deleteTool.classList.add("object-delete");
proportionButton.addEventListener("click",() => editObject(object => {
  if (object.dataset.freeResize === "true") delete object.dataset.freeResize;
  else object.dataset.freeResize = "true";
}));

function objectParagraph(object) {
  return object.closest("p,h1,h2,h3,h4,h5,h6,li");
}
function layerPeers(object) {
  if (!object.dataset.wrap) return [];
  const behind = object.dataset.wrap === "behind";
  const layer = peer => Number(peer.style.getPropertyValue("--object-layer")) || 0;
  return [...object.closest(".page").querySelectorAll(".shape[data-wrap],img[data-wrap]")]
    .filter(peer => (peer.dataset.wrap === "behind") === behind)
    .sort((a,b) => layer(a)-layer(b));
}
function changeObjectLayer(direction) {
  editObject(object => {
    const peers = layerPeers(object);
    const index = peers.indexOf(object);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= peers.length) return;
    [peers[index],peers[target]] = [peers[target],peers[index]];
    peers.forEach((peer,position) => peer.style.setProperty("--object-layer",position+1));
  });
}
function editObject(fn) {
  if (!editor.isContentEditable || !selectedObject?.isConnected || resizeDrag) return;
  beforeEdit();
  fn(selectedObject);
  record();
  positionFrame();
}
function removeObject() {
  if (!selectedObject || resizeDrag) return;
  const object = selectedObject;
  selectObject(null);
  change(() => object.remove());
}
function objectAngle(object) {
  return parseFloat(object.style.rotate) || 0;
}
function setObjectAngle(object,angle) {
  const normalized = ((Math.round(angle * 10) % 3600 + 3600) % 3600) / 10;
  object.style.rotate = normalized ? normalized + "deg" : "";
  syncWrapBounds(object);
}
function syncWrapBounds(object) {
  const angle = objectAngle(object);
  if (!angle || !["left","right","top-bottom"].includes(object.dataset.wrap)) {
    object.style.removeProperty("--wrap-x");
    object.style.removeProperty("--wrap-y");
    return;
  }
  const {offsetWidth:w,offsetHeight:h} = object;
  const radians = angle * Math.PI / 180;
  const cos = Math.abs(Math.cos(radians)), sin = Math.abs(Math.sin(radians));
  object.style.setProperty("--wrap-x",Math.ceil(Math.max(0,w * cos + h * sin - w) / 2) + "px");
  object.style.setProperty("--wrap-y",Math.ceil(Math.max(0,h * cos + w * sin - h) / 2) + "px");
}
function turnObject(delta) {
  editObject(object => setObjectAngle(object,objectAngle(object) + delta));
}
function positionFrame() {
  if (!editor.isContentEditable || !selectedObject?.isConnected || !editor.contains(selectedObject)) {
    resizeFrame.hidden = true;
    objectTools.hidden = true;
    return;
  }
  const object = selectedObject;
  const box = object.getBoundingClientRect();
  const area = workspace.getBoundingClientRect();
  const {width,height,scale} = resizeGeometry(object);
  const centerX = (box.left + box.right) / 2;
  const centerY = (box.top + box.bottom) / 2;
  resizeFrame.style.left = centerX - width * scale / 2 - area.left + workspace.scrollLeft - workspace.clientLeft + "px";
  resizeFrame.style.top = centerY - height * scale / 2 - area.top + workspace.scrollTop - workspace.clientTop + "px";
  resizeFrame.style.width = width * scale + "px";
  resizeFrame.style.height = height * scale + "px";
  resizeFrame.style.rotate = objectAngle(object) + "deg";
  resizeFrame.hidden = false;
  const left = area.left + workspace.clientLeft;
  const right = left + workspace.clientWidth;
  objectTools.hidden = !!resizeDrag || box.bottom <= area.top || box.top >= area.bottom ||
    box.right <= left || box.left >= right;
  if (objectTools.hidden) return;
  objectTools.style.maxWidth = Math.max(0,workspace.clientWidth - 12) + "px";
  const barWidth = objectTools.offsetWidth;
  const barHeight = objectTools.offsetHeight;
  const above = box.top - barHeight - 42;
  const top = above >= area.top + 4 ? above : box.bottom + 8;
  objectTools.style.left = Math.max(left + 6,Math.min(centerX - barWidth / 2,right - barWidth - 6)) + "px";
  objectTools.style.top = Math.max(area.top + 4,Math.min(top,area.bottom - barHeight - 4)) + "px";
  proportionButton.setAttribute("aria-pressed",String(object.dataset.freeResize !== "true"));
  wrapSelect.value = wrapModes.some(([value]) => value === object.dataset.wrap) ? object.dataset.wrap : "inline";
  const peers = layerPeers(object);
  const layerIndex = peers.indexOf(object);
  forwardTool.disabled = layerIndex < 0 || layerIndex === peers.length-1;
  backwardTool.disabled = layerIndex <= 0;
  const paragraph = objectParagraph(object);
  const alignment = paragraph && getComputedStyle(paragraph).textAlign;
  for (const [button,value] of alignTools) {
    button.disabled = !paragraph;
    button.setAttribute("aria-pressed",String(alignment === value || (value === "left" && alignment === "start")));
  }
}

const frameObserver = new ResizeObserver(() => {
  positionFrame();
  positionVerticalRuler();
});
frameObserver.observe(editor);
frameObserver.observe(workspace);
workspace.addEventListener("scroll",positionFrame,{passive:true});
workspace.addEventListener("click",event => {
  if (event.target === workspace) selectObject(null);
});

function selectObject(object) {
  if (resizeDrag) finishResize(false);
  if (selectedObject) frameObserver.unobserve(selectedObject);
  selectedObject = editor.isContentEditable ? object : null;
  if (selectedObject) {
    frameObserver.observe(object);
    const range = document.createRange();
    range.setStartAfter(object);
    range.collapse(true);
    setRange(range);
    if (object.matches(".shape")) {
      fill = object.dataset.color;
      updateFill();
    }
  }
  positionFrame();
}

function sizeObject(object,width,height) {
  if (object.matches("img")) {
    object.width = width;
    object.height = height;
    if (width > 0 && height > 0) object.style.aspectRatio = width + " / " + height;
  } else {
    object.style.width = width + "px";
    object.style.height = height + "px";
  }
  syncWrapBounds(object);
}

function resizeGeometry(object) {
  const scale = parseFloat(getComputedStyle(object.closest(".page")).zoom) || 1;
  return {width:object.offsetWidth,height:object.offsetHeight,scale};
}

// The image node in Umo Editor caps width to the container and scales the
// height by the same ratio. Adapted from umodoc/editor, MIT (see LICENSE-UMODOC).
function resizeDimensions(object,width,height,dx,dy,proportional) {
  const container = object.closest("td,th,.page");
  const style = getComputedStyle(container);
  const maxWidth = Math.max(1,Math.floor(container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)));
  const minWidth = Math.min(width,14,maxWidth);
  const minHeight = Math.min(height,14);
  if (proportional) {
    const horizontal = dx / width, vertical = dy / height;
    const factor = 1 + (Math.abs(horizontal) > Math.abs(vertical) ? horizontal : vertical);
    const scale = Math.min(2000 / height,Math.max(minWidth / width,minHeight / height,factor));
    const currentWidth = width * scale, currentHeight = height * scale;
    const nextWidth = Math.min(currentWidth,maxWidth);
    const ratio = currentWidth / currentHeight;
    const nextHeight = nextWidth !== currentWidth && ratio > 0 ? nextWidth / ratio : currentHeight;
    return [Math.max(1,Math.round(nextWidth)),Math.max(1,Math.round(nextHeight))];
  }
  return [
    Math.max(1,Math.round(Math.min(maxWidth,Math.max(minWidth,width + dx)))),
    Math.max(1,Math.round(Math.min(2000,Math.max(minHeight,height + dy))))
  ];
}

function finishResize(commit,event) {
  const drag = resizeDrag;
  if (!drag) return;
  resizeDrag = null;
  if (resizeFrame.hasPointerCapture(drag.pointer)) resizeFrame.releasePointerCapture(drag.pointer);
  resizeFrame.classList.remove("moving");
  if (drag.mode === "move") {
    drag.object.style.translate = drag.translate;
    if (commit && drag.changed && dropObject(drag,event)) {
      selectObject(drag.object);
      record();
    }
  } else if (commit && drag.changed) record();
  else if (drag.changed) {
    for (const [attribute,value] of drag.attributes) {
      if (value === null) drag.object.removeAttribute(attribute);
      else drag.object.setAttribute(attribute,value);
    }
  }
  positionFrame();
}

function freeObject(object) {
  return ["front","behind"].includes(object.dataset.wrap);
}
function objectOffset(object,axis) {
  return parseFloat(object.style.getPropertyValue("--object-"+axis)) || 0;
}
function setObjectOffset(object,x,y) {
  for (const [axis,value] of [["x",Math.round(x)],["y",Math.round(y)]]) {
    if (value) object.style.setProperty("--object-"+axis,value+"px");
    else object.style.removeProperty("--object-"+axis);
  }
}
function objectDropRange(x,y,page) {
  const caret = document.caretPositionFromPoint?.(x,y) || document.caretRangeFromPoint?.(x,y);
  const node = caret?.offsetNode || caret?.startContainer;
  const offset = caret?.offset ?? caret?.startOffset;
  const range = document.createRange();
  if (!node || !page.contains(node)) {
    range.selectNodeContents(page);
    range.collapse(false);
    return range;
  }
  const object = element(node)?.closest(".shape,img");
  if (object) {
    const box = object.getBoundingClientRect();
    if (x < (box.left + box.right) / 2) range.setStartBefore(object);
    else range.setStartAfter(object);
  } else {
    if (element(node)?.matches("table,thead,tbody,tfoot,tr,ol,ul")) return null;
    range.setStart(node,offset);
  }
  range.collapse(true);
  return range;
}
function dropObject(drag,event) {
  const {object,scale} = drag;
  const {clientX:x,clientY:y} = event;
  const page = document.elementsFromPoint(x,y).find(node => node.classList.contains("page") && editor.contains(node));
  if (!page) return false;
  const oldPage = object.closest(".page");
  if (!freeObject(object)) {
    const target = objectDropRange(x,y,page);
    if (!target) return false;
    target.insertNode(object);
    if (["left","right"].includes(object.dataset.wrap)) {
      const box = page.getBoundingClientRect();
      object.dataset.wrap = x < (box.left + box.right) / 2 ? "left" : "right";
    }
    return true;
  }
  const current = object.getBoundingClientRect();
  const desiredX = current.left + drag.dx * scale;
  const desiredY = current.top + drag.dy * scale;
  if (page !== oldPage) {
    const target = objectDropRange(x,y,page);
    if (!target) return false;
    target.insertNode(object);
  }
  const box = object.getBoundingClientRect();
  const bounds = page.getBoundingClientRect();
  const left = Math.max(bounds.left,Math.min(desiredX,bounds.right-box.width));
  const top = Math.max(bounds.top,Math.min(desiredY,bounds.bottom-box.height));
  setObjectOffset(object,objectOffset(object,"x")+(left-box.left)/scale,objectOffset(object,"y")+(top-box.top)/scale);
  return true;
}

function pointerAngle(x,y,cx,cy) {
  return Math.atan2(y-cy,x-cx) * 180 / Math.PI;
}
function beginObjectDrag(event,mode,horizontal=0,vertical=0) {
  if (!editor.isContentEditable || !selectedObject || event.button !== 0 || resizeDrag) return;
  event.preventDefault();
  const object = selectedObject;
  const {width,height,scale} = resizeGeometry(object);
  if (width <= 0 || height <= 0) return;
  const box = object.getBoundingClientRect();
  const cx = (box.left + box.right) / 2, cy = (box.top + box.bottom) / 2;
  beforeEdit();
  resizeDrag = {
    mode,object,width,height,scale,horizontal,vertical,cx,cy,
    angle:objectAngle(object),pointerAngle:pointerAngle(event.clientX,event.clientY,cx,cy),
    x:event.clientX,y:event.clientY,pointer:event.pointerId,
    scrollX:workspace.scrollLeft,scrollY:workspace.scrollTop,translate:object.style.translate,
    attributes:["width","height","style"].map(key => [key,object.getAttribute(key)])
  };
  resizeFrame.setPointerCapture(event.pointerId);
  positionFrame();
}
moveHandle.addEventListener("pointerdown",event => beginObjectDrag(event,"move"));
moveHandle.addEventListener("keydown",event => {
  const direction = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
  if (!direction || !selectedObject || !freeObject(selectedObject) || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  const stepSize = event.shiftKey ? 10 : 1;
  editObject(object => setObjectOffset(object,objectOffset(object,"x")+direction[0]*stepSize,
    objectOffset(object,"y")+direction[1]*stepSize));
});
rotationHandle.addEventListener("pointerdown",event => beginObjectDrag(event,"rotate"));
rotationHandle.addEventListener("keydown",event => {
  const direction = {ArrowLeft:-1,ArrowDown:-1,ArrowRight:1,ArrowUp:1}[event.key];
  if (!direction || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  turnObject(direction * (event.shiftKey ? 15 : 1));
});
for (const [corner,label,horizontal,vertical] of [
  ["nw","Верхній лівий кут",-1,-1],["n","Верхня сторона",0,-1],["ne","Верхній правий кут",1,-1],
  ["w","Ліва сторона",-1,0],["e","Права сторона",1,0],
  ["sw","Нижній лівий кут",-1,1],["s","Нижня сторона",0,1],["se","Нижній правий кут",1,1]
]) {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "resize-handle " + corner;
  handle.setAttribute("aria-label",label + " — змінити розмір");
  handle.title = "Змінити розмір";
  resizeFrame.append(handle);
  handle.addEventListener("pointerdown",event => beginObjectDrag(event,"resize",horizontal,vertical));
  handle.addEventListener("keydown",event => {
    const direction = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if (!direction || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    editObject(object => {
      const {width,height} = resizeGeometry(object);
      if (width <= 0 || height <= 0) return;
      sizeObject(object,...resizeDimensions(object,width,height,direction[0] * horizontal * 4,
        direction[1] * vertical * 4,object.dataset.freeResize !== "true" || event.shiftKey));
    });
  });
}

resizeFrame.addEventListener("pointermove",event => {
  const drag = resizeDrag;
  if (!drag || event.pointerId !== drag.pointer) return;
  if (drag.mode === "move") {
    const dx = event.clientX - drag.x + workspace.scrollLeft - drag.scrollX;
    const dy = event.clientY - drag.y + workspace.scrollTop - drag.scrollY;
    if (!drag.changed && Math.hypot(dx,dy) < 4) return;
    drag.dx = dx / drag.scale;
    drag.dy = dy / drag.scale;
    drag.object.style.translate = drag.dx+"px "+drag.dy+"px";
    resizeFrame.classList.add("moving");
  } else if (drag.mode === "rotate") {
    const angle = drag.angle + pointerAngle(event.clientX,event.clientY,drag.cx,drag.cy) - drag.pointerAngle;
    setObjectAngle(drag.object,event.shiftKey ? Math.round(angle / 15) * 15 : angle);
  } else {
    const x = (event.clientX - drag.x) / drag.scale;
    const y = (event.clientY - drag.y) / drag.scale;
    const rad = drag.angle * Math.PI / 180;
    const dx = (x * Math.cos(rad) + y * Math.sin(rad)) * drag.horizontal;
    const dy = (y * Math.cos(rad) - x * Math.sin(rad)) * drag.vertical;
    if (!dx && !dy && !drag.changed) return;
    sizeObject(drag.object,...resizeDimensions(drag.object,drag.width,drag.height,dx,dy,
      drag.object.dataset.freeResize !== "true" || event.shiftKey));
  }
  drag.changed = true;
  positionFrame();
});
for (const type of ["pointerup","pointercancel","lostpointercapture"]) {
  resizeFrame.addEventListener(type,event => {
    if (resizeDrag?.pointer === event.pointerId) finishResize(type === "pointerup",event);
  });
}

function table(columns,rows) {
  change(() => {
    const range = selection().getRangeAt(0);
    range.deleteContents();
    const table = document.createElement("table");
    for (let y = 0; y < rows; y++) {
      const row = table.insertRow();
      for (let x = 0; x < columns; x++) row.insertCell().append(blank());
    }
    const page = pageAt();
    let block = element(range.startContainer);
    while (block && block !== page && block.parentElement !== page) block = block.parentElement;
    if (block?.parentElement === page) block.after(table);
    else page.append(table);
    if (!table.nextElementSibling) table.after(blank());
    caret(table.rows[0].cells[0].firstElementChild);
  });
}

const tableTools = document.createElement("div");
tableTools.className = "table-tools object-tools";
tableTools.setAttribute("role","group");
tableTools.setAttribute("aria-label","Дії з таблицею");
tableTools.hidden = true;
workspace.append(tableTools);
let activeCell = null;
let selectedCells = [];
let tableToolsDismissed = false;
let selectingCells = false;
function tableButton(label,handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = label;
  button.addEventListener("pointerdown",event => event.preventDefault());
  button.addEventListener("click",handler);
  tableTools.append(button);
  return button;
}
function tableFocus(cell,keepSelection=false) {
  tableToolsDismissed = false;
  selectedCells.forEach(item => item.classList.remove("table-selected"));
  selectedCells = keepSelection ? selectedCells : [cell];
  selectedCells.forEach(item => item.classList.add("table-selected"));
  activeCell = cell;
  positionTableTools();
}
const selectCellsButton = tableButton("Вибрати комірки",() => {
  selectingCells = !selectingCells;
  selectCellsButton.setAttribute("aria-pressed",String(selectingCells));
});
selectCellsButton.setAttribute("aria-pressed","false");
function positionTableTools() {
  if (tableToolsDismissed || !editor.isContentEditable || !activeCell?.isConnected) {
    tableTools.hidden = true;
    return;
  }
  const table = activeCell.closest("table"), box = table.getBoundingClientRect();
  const area = workspace.getBoundingClientRect();
  tableTools.hidden = box.bottom < area.top || box.top > area.bottom;
  if (tableTools.hidden) return;
  tableTools.style.maxWidth = Math.max(0,workspace.clientWidth-12)+"px";
  tableTools.style.left = Math.max(area.left+6,Math.min(box.left,area.right-tableTools.offsetWidth-6))+"px";
  const above = box.top-tableTools.offsetHeight-8;
  tableTools.style.top = Math.max(area.top+4,Math.min(above >= area.top ? above : box.bottom+8,area.bottom-tableTools.offsetHeight-4))+"px";
}
const closeTableToolsButton = tableButton("Закрити панель таблиці",() => {
  tableToolsDismissed = true;
  tableTools.hidden = true;
});
closeTableToolsButton.classList.add("table-tools-close");
closeTableToolsButton.textContent = "×";
closeTableToolsButton.setAttribute("aria-label","Закрити панель таблиці");
function editTable(operation) {
  if (!activeCell?.isConnected) return;
  beforeEdit();
  operation(activeCell.closest("table"),activeCell);
  if (!activeCell?.isConnected) {
    selectedCells.forEach(item => item.classList.remove("table-selected"));
    selectedCells = [];
    activeCell = null;
  }
  record();
  positionTableTools();
}
const newTableCell = row => row.insertCell().append(blank());
tableButton("Рядок вище",() => editTable((table,cell) => {
  const row = table.insertRow(cell.parentElement.rowIndex);
  for (let i=0;i<table.rows[cell.parentElement.rowIndex+1].cells.length;i++) newTableCell(row);
}));
tableButton("Рядок нижче",() => editTable((table,cell) => {
  const row = table.insertRow(cell.parentElement.rowIndex+1);
  for (let i=0;i<table.rows[cell.parentElement.rowIndex].cells.length;i++) newTableCell(row);
}));
tableButton("Стовпець ліворуч",() => editTable((table,cell) => {
  const column = cell.cellIndex;
  for (const row of table.rows) row.insertCell(Math.min(column,row.cells.length)).append(blank());
}));
tableButton("Стовпець праворуч",() => editTable((table,cell) => {
  const column = cell.cellIndex+1;
  for (const row of table.rows) row.insertCell(Math.min(column,row.cells.length)).append(blank());
}));
tableButton("Видалити рядок",() => editTable((table,cell) => {
  const row = cell.parentElement;
  if (table.rows.length === 1) table.remove();
  else row.remove();
}));
tableButton("Видалити стовпець",() => editTable((table,cell) => {
  const column = cell.cellIndex;
  if (table.rows[0].cells.length === 1) table.remove();
  else for (const row of table.rows) row.cells[column]?.remove();
}));
tableButton("Об’єднати",() => editTable((_table,cell) => {
  const row = cell.parentElement;
  const cells = selectedCells.filter(item => item.parentElement === row).sort((a,b) => a.cellIndex-b.cellIndex);
  if (cells.length === 1 && row.cells.length > 1) {
    const neighbor = row.cells[cell.cellIndex+1] || row.cells[cell.cellIndex-1];
    cells.push(neighbor);
    cells.sort((a,b) => a.cellIndex-b.cellIndex);
  }
  if (cells.length < 2 || cells.some((item,index) => item.cellIndex !== cells[0].cellIndex+index)) return;
  const first = cells[0];
  for (const item of cells.slice(1)) {
    for (const child of [...item.childNodes]) first.append(child);
    first.colSpan += item.colSpan;
    item.remove();
  }
  tableFocus(first);
  selectingCells = false;
  selectCellsButton.setAttribute("aria-pressed","false");
}));
tableButton("Розділити",() => editTable((table,cell) => {
  if (cell.colSpan === 1) {
    for (const row of table.rows) for (const item of row.cells) item.colSpan *= 2;
  }
  const span = cell.colSpan;
  cell.colSpan = 1;
  for (let i=1;i<span;i++) cell.parentElement.insertCell(cell.cellIndex+i).append(blank());
}));
tableButton("Заголовок",() => editTable((table,_cell) => {
  for (const cell of table.rows[0].cells) {
    const tag = cell.tagName === "TH" ? "td" : "th";
    const replacement = document.createElement(tag);
    replacement.colSpan = cell.colSpan;
    replacement.replaceChildren(...cell.childNodes);
    cell.replaceWith(replacement);
  }
}));
const cellColor = document.createElement("input");
cellColor.type = "color";
cellColor.value = "#fff2cc";
cellColor.setAttribute("aria-label","Колір комірки");
cellColor.title = "Колір комірки";
cellColor.addEventListener("input",() => editTable((_table,cell) => {
  for (const item of selectedCells.length ? selectedCells : [cell]) item.style.backgroundColor = cellColor.value;
}));
tableTools.append(cellColor);
const cellVertical = document.createElement("select");
cellVertical.setAttribute("aria-label","Вирівнювання в комірці");
for (const [value,label] of [["top","Згори"],["middle","Посередині"],["bottom","Знизу"]]) cellVertical.add(new Option(label,value));
cellVertical.addEventListener("change",() => editTable((_table,cell) => {
  for (const item of selectedCells.length ? selectedCells : [cell]) item.style.verticalAlign = cellVertical.value;
}));
tableTools.append(cellVertical);
tableButton("Видалити таблицю",() => editTable(table => table.remove()));
editor.addEventListener("click",event => {
  const cell = event.target.closest("td,th");
  if (!cell || !editor.isContentEditable) return;
  tableToolsDismissed = false;
  if (activeCell?.closest("table") === cell.closest("table") && activeCell.parentElement === cell.parentElement && activeCell !== cell) {
    const cells = [...cell.parentElement.cells];
    const left = Math.min(cells.indexOf(activeCell),cells.indexOf(cell));
    const right = Math.max(cells.indexOf(activeCell),cells.indexOf(cell));
    selectedCells.forEach(item => item.classList.remove("table-selected"));
    selectedCells = cells.slice(left,right+1);
    selectedCells.forEach(item => item.classList.add("table-selected"));
    positionTableTools();
  } else tableFocus(cell);
});
workspace.addEventListener("scroll",positionTableTools,{passive:true});

function closeMenu() {
  if (!activeMenu) return;
  activeMenu.hidden = true;
  $("[data-menu=" + activeMenu.id + "]").setAttribute("aria-expanded","false");
  activeMenu = null;
}
function showMenu(button,keyboard = false) {
  const popup = document.getElementById(button.dataset.menu);
  const alreadyOpen = popup === activeMenu;
  closeMenu();
  if (alreadyOpen) return;
  activeMenu = popup;
  popup.hidden = false;
  button.setAttribute("aria-expanded","true");
  const rect = (button.closest(".size-control") || button).getBoundingClientRect();
  popup.style.left = Math.max(4,Math.min(rect.left,innerWidth-popup.offsetWidth-4)) + "px";
  popup.style.top = Math.max(4,Math.min(rect.bottom+2,innerHeight-popup.offsetHeight-4)) + "px";
  if (popup === sizeMenu) {
    const size = Number(sizeInput.value.replace(",","."));
    const current = sizeOptions.find(option => Number(option.dataset.size) === size);
    sizeOptions.forEach(option => option.setAttribute("aria-selected",option === current));
    (current || sizeOptions[0]).scrollIntoView({block:"nearest"});
    if (keyboard) (current || sizeOptions[0]).focus();
  }
}
function tab(id) {
  closeMenu();
  $$("[role=tab]").forEach(button => {
    const active = button.id === id;
    button.setAttribute("aria-selected",active);
    document.getElementById(button.getAttribute("aria-controls")).hidden = !active;
  });
}
$$("[data-menu]").forEach(button => {
  if (!button.hasAttribute("aria-haspopup")) button.setAttribute("aria-haspopup","true");
  button.setAttribute("aria-expanded","false");
  button.setAttribute("aria-controls",button.dataset.menu);
});
const sizeInput = $("#size");
const sizeMenu = $("#size-menu");
const sizeToggle = $("[data-menu=size-menu]");
const sizeOptions = [8,9,10,11,12,14,16,18,20,22,24,26,28,36,48,72].map(size => {
  const option = document.createElement("button");
  option.type = "button";
  option.tabIndex = -1;
  option.setAttribute("role","option");
  option.dataset.size = size;
  option.textContent = size;
  sizeMenu.append(option);
  return option;
});
sizeToggle.addEventListener("keydown",event => {
  if (event.key !== "ArrowDown") return;
  event.preventDefault();
  if (activeMenu === sizeMenu) {
    (sizeMenu.querySelector('[aria-selected="true"]') || sizeOptions[0]).focus();
  } else showMenu(sizeToggle,true);
});
sizeMenu.addEventListener("keydown",event => {
  const index = sizeOptions.indexOf(event.target);
  if (index < 0) return;
  const next = {ArrowDown:index+1,ArrowUp:index-1,Home:0,End:sizeOptions.length-1}[event.key];
  if (next !== undefined) {
    event.preventDefault();
    sizeOptions[Math.max(0,Math.min(next,sizeOptions.length-1))].focus();
  } else if (event.key === "Escape" || event.key === "Tab") {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
    }
    closeMenu();
    sizeToggle.focus();
  }
});
const colors = ["#000000","#ffffff","#7f7f7f","#d9d9d9","#1f4e79","#4472c4","#5b9bd5","#70ad47","#c00000","#ff0000","#ffc000","#ffff00","#92d050","#00b0f0","#002060","#7030a0"];
const highlights = ["#ffff00","#00ff00","#00ffff","#ff00ff","#0000ff","#ff0000","#000080","#008080","#008000","#800080","#800000","#808000","#808080","#c0c0c0","#000000","#ffffff"];
let fill = "#5b9bd5";
function swatches(parent, values, field) {
  values.forEach(color => {
    const button = document.createElement("button");
    button.dataset[field] = color;
    button.style.setProperty("--swatch",color);
    button.title = color;
    button.setAttribute("aria-label","Колір " + color);
    parent.append(button);
  });
}
for (const [id,title,values] of [["color-menu","Колір шрифту",colors],["highlight-menu","Колір виділення",highlights]]) {
  const popup = document.getElementById(id);
  popup.innerHTML = '<div class="popup-title">' + title + '</div><div class="swatches"></div>';
  swatches(popup.lastElementChild,values,"color");
  popup.insertAdjacentHTML("beforeend",'<button class="clear-color" data-color="' + (id === "color-menu" ? "#000000" : "transparent") + '">' + (id === "color-menu" ? "Автоматичний" : "Без кольору") + '</button>');
}
swatches($("#shape-colors"),colors,"fill");
function updateFill() {
  $$("[data-fill]").forEach(button => button.setAttribute("aria-pressed",button.dataset.fill === fill));
}
updateFill();
for (const value of [1,1.15,1.5,2,2.5,3]) {
  const button = document.createElement("button");
  button.dataset.spacing = value;
  button.textContent = value.toFixed(2).replace(".",",");
  $("#spacing-menu").append(button);
}
for (const [shape,label] of Object.entries(Docx.shapeNames)) {
  const button = document.createElement("button");
  button.dataset.shape = shape;
  button.title = label;
  button.setAttribute("aria-label",label);
  button.append(Docx.makeShape(shape,"#b8d4f1").firstChild);
  $("#shape-grid").append(button);
}
for (let y = 1; y <= 8; y++) {
  for (let x = 1; x <= 8; x++) {
    const button = document.createElement("button");
    button.dataset.columns = x;
    button.dataset.rows = y;
    button.setAttribute("aria-label",x + " стовпців, " + y + " рядків");
    const preview = () => {
      $("#table-label").textContent = "Таблиця " + x + " × " + y;
      $$("#table-grid button").forEach(cell => cell.classList.toggle("in-grid",+cell.dataset.columns <= x && +cell.dataset.rows <= y));
    };
    button.addEventListener("pointerenter",preview);
    button.addEventListener("focus",preview);
    $("#table-grid").append(button);
  }
}
function ask({title,info="",label="",value="",ok="OK",type="text",viber=false}) {
  $("#dialog-title").textContent = title;
  $("#dialog-info").textContent = info;
  $("#dialog-info").hidden = !info;
  $("#dialog-label").textContent = label;
  $("#dialog-field").hidden = !label;
  $("#dialog-input").disabled = !label;
  $("#dialog-input").type = type;
  $("#dialog-input").value = value;
  $("#dialog-ok").textContent = ok;
  const help = $("#save-viber-help");
  help.open = false;
  help.hidden = !viber;
  if (viber) $("#viber-filename").textContent = docxFilename(value);
  $("#dialog").showModal();
  if (label) {
    $("#dialog-input").focus();
    if (type === "text") $("#dialog-input").select();
  } else $("#dialog-cancel").focus();
  return new Promise(resolve => resolveDialog = resolve);
}
function finishDialog(value) {
  $("#dialog").close();
  resolveDialog?.(value);
  resolveDialog = null;
}
$("#dialog-form").addEventListener("submit",event => {
  event.preventDefault();
  finishDialog($("#dialog-input").disabled ? true : $("#dialog-input").value);
});
$("#dialog-cancel").addEventListener("click",() => finishDialog(null));
$("#dialog").addEventListener("cancel",event => {
  event.preventDefault();
  finishDialog(null);
});
const shareDialog = $("#share-dialog");
$("#dialog-input").addEventListener("input",event => {
  if (!$("#save-viber-help").hidden) $("#viber-filename").textContent = docxFilename(event.target.value);
});
shareDialog.addEventListener("close",() => {
  if (!shareDialog.open) restore();
});
function docxFilename(value) {
  const base = value.trim().replace(/\.docx$/i,"").replace(/[<>:"/\\|?*\x00-\x1f]/g,"_").trim();
  return (base || "Документ") + ".docx";
}
async function confirmReplace() {
  return html() === savedHtml || await ask({title:"Замінити документ?",info:"У поточному документі є незбережені зміни.",ok:"Продовжити"});
}
function loadDocument(pages,filename) {
  selectObject(null);
  editor.replaceChildren(...pages);
  tidy();
  editor.querySelectorAll("img[width][height]").forEach(image => {
    sizeObject(image,Number(image.getAttribute("width")),Number(image.getAttribute("height")));
  });
  editor.querySelectorAll(".shape[data-wrap]").forEach(syncWrapBounds);
  name = filename;
  savedRange = null;
  history = [];
  index = -1;
  previousType = "";
  tab("home-tab");
  restore();
  $("#workspace").scrollTop = 0;
  record();
  savedHtml = html();
}
function paste(text,rich) {
  if (rich && !rich.querySelector(".page")) {
    const wrapper = document.createElement("div");
    wrapper.append(rich.cloneNode(true));
    exec("insertHTML",wrapper.innerHTML);
  } else if (text) exec("insertText",text);
}
async function clipboard(type) {
  restore();
  if (type === "paste") {
    try {
      const entries = await navigator.clipboard.read();
      for (const entry of entries) {
        const imageType = entry.types.find(type => type.startsWith("image/"));
        if (imageType && !entry.types.includes("text/plain")) return addImage(await entry.getType(imageType),"Зображення");
        if (entry.types.includes("text/plain")) {
          const text = await (await entry.getType("text/plain")).text();
          return paste(text,localClipboard?.text === text ? localClipboard.rich : null);
        }
      }
    } catch {
      if (localClipboard) return paste(localClipboard.text,localClipboard.rich);
    }
    return flash("Для вставлення з буфера натисніть Ctrl+V.");
  }
  if (savedRange.collapsed) return flash("Спочатку виділіть фрагмент документа.");
  if (document.execCommand(type)) return;
  localClipboard = {text:selection().toString(),rich:savedRange.cloneContents()};
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(localClipboard.text).catch(() => {});
  if (type === "cut" && editor.isContentEditable) change(() => selection().deleteFromDocument());
}
function dataUrl(blob) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
async function addImage(blob, label) {
  if (!blob.type.startsWith("image/")) throw Error("Виберіть файл зображення.");
  if (blob.size > 25*1024*1024) throw Error("Зображення має бути меншим за 25 МБ.");
  const image = new Image();
  image.src = await dataUrl(blob);
  await image.decode();
  const scale = Math.min(1,600/image.naturalWidth,850/image.naturalHeight);
  image.width = Math.max(1,Math.round(scale*image.naturalWidth));
  image.height = Math.max(1,Math.round(scale*image.naturalHeight));
  if (!["image/png","image/jpeg","image/gif","image/bmp"].includes(blob.type)) {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
    image.src = canvas.toDataURL("image/png");
  }
  image.alt = label || "Зображення";
  sizeObject(image,image.width,image.height);
  inline(image);
}
let busy = false;
async function action(type) {
  if (busy) return;
  busy = true;
  try {
    switch (type) {
      case "undo": step(-1); break;
      case "redo": step(1); break;
      case "cut": case "copy": case "paste": await clipboard(type); break;
      case "multilevel": multilevel(); break;
      case "indentList": listLevel(false); break;
      case "outdentList": listLevel(true); break;
      case "pageBreak": splitPage(); break;
      case "imageLocal": $("#image-input").click(); break;
      case "openDoc": $("#file-input").click(); break;
      case "newDoc": {
        if (await confirmReplace()) loadDocument([newPage()],"Документ 1");
        break;
      }
      case "saveAndShare": openShareDialog(); break;
      case "saveDoc": {
        const input = await ask({title:"Зберегти як",label:"Ім’я файлу",value:name,ok:"Зберегти",viber:true});
        if (!input) break;
        const filename = docxFilename(input);
        const snapshot = html();
        const blob = Docx.write(editor);
        const file = new File([blob],filename,{type:blob.type});
        const link = document.createElement("a");
        link.href = URL.createObjectURL(file);
        link.download = file.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href),30000);
        name = filename.slice(0,-5);
        savedHtml = snapshot;
        update();
        flash("Збережено " + link.download);
        restore();
        break;
      }
      case "imageWeb": {
        const input = await ask({title:"Зображення з інтернету",label:"Пряма адреса зображення (URL)",type:"url",ok:"Вставити"});
        if (!input) break;
        const url = new URL(input);
        if (!["https:","http:"].includes(url.protocol)) throw Error("Вкажіть адресу HTTP або HTTPS.");
        flash("Завантаження зображення…");
        const response = await fetch(url,{credentials:"omit",signal:AbortSignal.timeout(15000)}).catch(() => {
          throw Error("Сайт обмежив доступ або адреса недоступна. Завантажте зображення на пристрій і вставте файл.");
        });
        if (!response.ok) throw Error("За цією адресою зображення не знайдено.");
        await addImage(await response.blob(),"Зображення з інтернету");
        flash("Зображення вставлено.");
      }
    }
  } catch (error) {
    flash(error.message || "Дію не виконано.");
  } finally {
    busy = false;
  }
}
$("#file-input").addEventListener("change",async event => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file || !await confirmReplace()) return;
  try {
    loadDocument(await Docx.read(file),file.name.replace(/\.docx$/i,""));
    flash("Відкрито " + file.name);
  } catch (error) { flash(error.message || "Не вдалося відкрити DOCX."); }
});
$("#image-input").addEventListener("change",async event => {
  const file = event.target.files[0];
  event.target.value = "";
  if (file) {
    try { await addImage(file,file.name); }
    catch (error) { flash(error.message || "Не вдалося прочитати зображення."); }
  }
});
document.addEventListener("pointerdown",event => {
  if (event.target.closest(".office button,.popup button")) {
    capture();
    event.preventDefault();
  } else if (!event.target.closest(".popup")) closeMenu();
});
document.addEventListener("click",event => {
  const button = event.target.closest(".office button,.popup button");
  if (!button) return;
  const data = button.dataset;
  if (button.getAttribute("role") === "tab") return tab(button.id);
  if (data.menu) return showMenu(button,event.detail === 0);
  if (data.fill) {
    fill = data.fill;
    updateFill();
    if (selectedObject?.matches(".shape") && editor.contains(selectedObject)) change(() => {
      selectedObject.dataset.color = fill;
      selectedObject.replaceChildren(Docx.makeShape(selectedObject.dataset.shape,fill).firstChild);
    });
    return;
  }
  const menuId = activeMenu?.id;
  closeMenu();
  if (data.command) exec(data.command);
  else if (data.action) void action(data.action);
  else if (data.size) fontSize(data.size);
  else if (data.spacing) change(() => blocks().forEach(block => block.style.lineHeight = data.spacing));
  else if (data.columns) table(+data.columns,+data.rows);
  else if (data.shape) inline(Docx.makeShape(data.shape,fill));
  else if (data.color) {
    exec(menuId === "color-menu" ? "foreColor" : "hiliteColor",data.color);
    $("[data-menu=" + menuId + "] .ink").style.setProperty("--ink",data.color);
  }
});
$("#font").addEventListener("change",event => exec("fontName",event.target.value));
sizeInput.addEventListener("change",event => fontSize(event.target.value));
sizeInput.addEventListener("keydown",event => {
  if (event.key === "Enter") {
    event.preventDefault();
    event.target.blur();
    restore();
  }
});
document.addEventListener("selectionchange",() => { if (capture()) update(); });
function behindObjectAt(event) {
  const {clientX:x,clientY:y} = event;
  const behind = document.elementsFromPoint(x,y).map(node => node.closest(".shape[data-wrap=behind],img[data-wrap=behind]"))
    .find(node => node && editor.contains(node));
  if (!behind || event.altKey) return behind;
  const caret = document.caretPositionFromPoint?.(x,y) || document.caretRangeFromPoint?.(x,y);
  const text = caret?.offsetNode || caret?.startContainer;
  const offset = caret?.offset ?? caret?.startOffset;
  if (text?.nodeType !== Node.TEXT_NODE) return behind;
  const range = document.createRange();
  for (const start of [offset-1,offset]) {
    if (start < 0 || start >= text.length) continue;
    range.setStart(text,start);
    range.setEnd(text,start+1);
    if ([...range.getClientRects()].some(rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) return null;
  }
  return behind;
}
editor.addEventListener("click",event => {
  if (!editor.isContentEditable) return;
  const direct = event.target.closest(".shape,img");
  const behind = (!direct || event.altKey) && behindObjectAt(event);
  selectObject(behind || direct || null);
});
editor.addEventListener("pointerdown",event => {
  if (!editor.isContentEditable || event.button !== 0 || resizeDrag) return;
  const direct = event.target.closest(".shape,img");
  const behind = (!direct || event.altKey) && behindObjectAt(event);
  const object = behind || direct;
  if (!object) return;
  selectObject(object);
  beginObjectDrag(event,"move");
});
editor.addEventListener("beforeinput",event => {
  if (["historyUndo","historyRedo"].includes(event.inputType)) {
    event.preventDefault();
    step(event.inputType === "historyUndo" ? -1 : 1);
  } else {
    selectObject(null);
    beforeEdit();
  }
});
editor.addEventListener("input",event => {
  const groups = ["insertText","deleteContentBackward","deleteContentForward","insertCompositionText"];
  record(groups.includes(event.inputType) ? event.inputType : "");
});
editor.addEventListener("paste",event => {
  if (!editor.isContentEditable) return;
  event.preventDefault();
  const image = [...event.clipboardData.files].find(file => file.type.startsWith("image/"));
  if (image) return addImage(image,image.name).catch(error => flash(error.message));
  const text = event.clipboardData.getData("text/plain");
  paste(text,localClipboard?.text === text ? localClipboard.rich : null);
});
for (const type of ["cut","copy"]) editor.addEventListener(type,event => {
  const range = capture();
  if (!range || range.collapsed || !event.clipboardData) return;
  const rich = range.cloneContents();
  const wrapper = document.createElement("div");
  wrapper.append(rich.cloneNode(true));
  localClipboard = {text:selection().toString(),rich};
  event.clipboardData.setData("text/plain",localClipboard.text);
  event.clipboardData.setData("text/html",wrapper.innerHTML);
  event.preventDefault();
  if (type === "cut") change(() => selection().deleteFromDocument());
});
editor.addEventListener("dragstart",event => {
  if (editor.isContentEditable && event.target.closest(".shape,img")) event.preventDefault();
});
editor.addEventListener("drop",event => event.preventDefault());
document.addEventListener("keydown",event => {
  if (!editor.isContentEditable) return;
  if (event.key === "Escape") {
    if (resizeDrag) finishResize(false);
    else if (activeMenu) closeMenu();
    else if (selectedObject) {
      selectObject(null);
      restore();
    }
  }
  if ($("#dialog").open || shareDialog.open || event.target.matches?.("input,select")) return;
  const editing = event.target === editor || editor.contains(event.target);
  if (editing && event.key === "Tab") {
    const parent = element(savedRange?.startContainer);
    if (parent?.closest("li")) {
      event.preventDefault();
      listLevel(event.shiftKey);
    } else if (parent?.closest("td,th")) {
      const cell = parent.closest("td,th");
      const cells = [...cell.closest("table").querySelectorAll("td,th")];
      const next = cells[cells.indexOf(cell)+(event.shiftKey ? -1 : 1)];
      if (next) {
        event.preventDefault();
        caret(next.querySelector("p") || next);
      }
    }
  }
  if ((editing || resizeFrame.contains(event.target) || objectTools.contains(event.target)) && selectedObject && ["Backspace","Delete"].includes(event.key)) {
    event.preventDefault();
    removeObject();
  }
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const command = ({z:event.shiftKey?"redo":"undo",y:"redo",s:"saveDoc",enter:"pageBreak"})[event.key.toLowerCase()];
  if (command) {
    event.preventDefault();
    void action(command);
  }
});
loadDocument([...editor.children],name);
