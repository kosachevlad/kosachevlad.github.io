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
  break:"M5 2h14v7H5zm0 13h14v7H5zM2 12h3m2 0h3m2 0h3m2 0h4",
  table:"M3 4h18v16H3zM3 9h18M3 14h18M9 4v16m6-16v16",
  shapes:"M20 8a5 5 0 1 0-10 0m-7 1h10v11H3zm10 12 5-10 5 10z",
  image:"M2 4h20v16H2zM2 18l6-7 5 5 3-3 6 6M17 8h.01",
  web:"M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0M16 12c0-12-8-12-8 0s8 12 8 0M4 9h16M4 15h16"
};
$$("i[data-icon]").forEach(icon => {
  icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + icons[icon.dataset.icon] + '"/></svg>';
});
for (let tick = -8; tick <= 46; tick++) {
  const mark = document.createElement("span");
  mark.className = "tick" + (tick % 2 ? " minor" : "");
  mark.style.left = "calc(var(--margin) + " + tick * 1.89 + "%)";
  if (tick % 2 === 0 && tick) mark.innerHTML = "<span>" + Math.abs(tick / 2) + "</span>";
  $("#ruler").append(mark);
}

let savedRange, selectedShape, activeMenu, noticeTimer, resolveDialog, localClipboard;
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
  const clone = editor.cloneNode(true);
  clone.querySelectorAll(".selected").forEach(shape => shape.classList.remove("selected"));
  return clone.innerHTML;
}
function beforeEdit() {
  if (history[index]) history[index].mark = bookmark();
}
function record(type = "") {
  tidy();
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
}
function step(delta) {
  const snapshot = history[index + delta];
  if (!snapshot) return;
  index += delta;
  previousType = "";
  selectedShape = null;
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
function fontSize() {
  const size = Number($("#size").value.trim().replace(",","."));
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

function closeMenu() {
  if (!activeMenu) return;
  activeMenu.hidden = true;
  $("[data-menu=" + activeMenu.id + "]").setAttribute("aria-expanded","false");
  activeMenu = null;
}
function showMenu(button) {
  const popup = document.getElementById(button.dataset.menu);
  const alreadyOpen = popup === activeMenu;
  closeMenu();
  if (alreadyOpen) return;
  activeMenu = popup;
  popup.hidden = false;
  button.setAttribute("aria-expanded","true");
  const rect = button.getBoundingClientRect();
  popup.style.left = Math.max(4,Math.min(rect.left,innerWidth-popup.offsetWidth-4)) + "px";
  popup.style.top = Math.max(4,Math.min(rect.bottom+2,innerHeight-popup.offsetHeight-4)) + "px";
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
  button.setAttribute("aria-haspopup","true");
  button.setAttribute("aria-expanded","false");
  button.setAttribute("aria-controls",button.dataset.menu);
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
function ask({title,info="",label="",value="",ok="OK",type="text"}) {
  $("#dialog-title").textContent = title;
  $("#dialog-info").textContent = info;
  $("#dialog-info").hidden = !info;
  $("#dialog-label").textContent = label;
  $("#dialog-field").hidden = !label;
  $("#dialog-input").disabled = !label;
  $("#dialog-input").type = type;
  $("#dialog-input").value = value;
  $("#dialog-ok").textContent = ok;
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
async function confirmReplace() {
  return html() === savedHtml || await ask({title:"Замінити документ?",info:"У поточному документі є незбережені зміни.",ok:"Продовжити"});
}
function loadDocument(pages,filename) {
  editor.replaceChildren(...pages);
  tidy();
  name = filename;
  savedRange = selectedShape = null;
  history = [];
  index = -1;
  previousType = "";
  tab("home-tab");
  restore();
  $("#workspace").scrollTop = 0;
  savedHtml = html();
  record();
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
  if (type === "cut") change(() => selection().deleteFromDocument());
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
      case "saveDoc": {
        const input = await ask({title:"Зберегти як",label:"Ім’я файлу",value:name + ".docx",ok:"Зберегти"});
        if (!input) break;
        const filename = input.replace(/\.docx$/i,"").replace(/[<>:"/\\|?*\x00-\x1f]/g,"_").trim() || "Документ";
        const snapshot = html();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(Docx.write(editor));
        link.download = filename + ".docx";
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href),30000);
        name = filename;
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
  if (data.menu) return showMenu(button);
  if (data.fill) {
    fill = data.fill;
    updateFill();
    if (selectedShape && editor.contains(selectedShape)) change(() => {
      selectedShape.dataset.color = fill;
      selectedShape.replaceChildren(Docx.makeShape(selectedShape.dataset.shape,fill).firstChild);
    });
    return;
  }
  const menuId = activeMenu?.id;
  closeMenu();
  if (data.command) exec(data.command);
  else if (data.action) void action(data.action);
  else if (data.spacing) change(() => blocks().forEach(block => block.style.lineHeight = data.spacing));
  else if (data.columns) table(+data.columns,+data.rows);
  else if (data.shape) {
    selectedShape?.classList.remove("selected");
    selectedShape = null;
    inline(Docx.makeShape(data.shape,fill));
  } else if (data.color) {
    exec(menuId === "color-menu" ? "foreColor" : "hiliteColor",data.color);
    $("[data-menu=" + menuId + "] .ink").style.setProperty("--ink",data.color);
  }
});
$("#font").addEventListener("change",event => exec("fontName",event.target.value));
$("#size").addEventListener("change",fontSize);
$("#size").addEventListener("keydown",event => {
  if (event.key === "Enter") {
    event.preventDefault();
    event.target.blur();
    restore();
  }
});
document.addEventListener("selectionchange",() => { if (capture()) update(); });
editor.addEventListener("click",event => {
  selectedShape?.classList.remove("selected");
  selectedShape = event.target.closest(".shape");
  if (selectedShape) {
    selectedShape.classList.add("selected");
    fill = selectedShape.dataset.color;
    updateFill();
  }
});
editor.addEventListener("beforeinput",event => {
  if (["historyUndo","historyRedo"].includes(event.inputType)) {
    event.preventDefault();
    step(event.inputType === "historyUndo" ? -1 : 1);
  } else beforeEdit();
});
editor.addEventListener("input",event => {
  const groups = ["insertText","deleteContentBackward","deleteContentForward","insertCompositionText"];
  record(groups.includes(event.inputType) ? event.inputType : "");
});
editor.addEventListener("paste",event => {
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
editor.addEventListener("drop",event => event.preventDefault());
document.addEventListener("keydown",event => {
  if (event.key === "Escape") closeMenu();
  if ($("#dialog").open || event.target.matches?.("input,select")) return;
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
  if (editing && selectedShape && ["Backspace","Delete"].includes(event.key)) {
    event.preventDefault();
    change(() => { selectedShape.remove(); selectedShape = null; });
  }
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const command = ({z:event.shiftKey?"redo":"undo",y:"redo",s:"saveDoc",enter:"pageBreak"})[event.key.toLowerCase()];
  if (command) {
    event.preventDefault();
    void action(command);
  }
});
loadDocument([...editor.children],name);
