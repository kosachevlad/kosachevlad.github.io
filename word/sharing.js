"use strict";

const shareEndpoint = "https://word-editor-ua-mwb3hc74.kosachevlad.chatgpt.site/api/documents";
const shareLimit = 8 * 1024 * 1024;
const shareStatus = $("#share-status");
const shareResult = $("#share-result");
const shareUrl = $("#share-url");
const shareRetry = $("#share-retry");
const sharedCopy = $("#shared-edit-copy");
let sharedSnapshot;
let creatingShare = false;

function encodeShareCode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
}
function decodeShareCode(code) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw Error("invalid_link");
  return Uint8Array.from(atob(code.replaceAll("-","+").replaceAll("_","/")),char => char.charCodeAt(0));
}
async function shareObjectUrl(secret) {
  const hash = await crypto.subtle.digest("SHA-256",secret);
  const id = Array.from(new Uint8Array(hash),byte => byte.toString(16).padStart(2,"0")).join("");
  return shareEndpoint + "/" + id;
}
async function encryptSharedDocument(file,secret) {
  const title = new TextEncoder().encode(file.name);
  if (title.length > 1024 || file.size + title.length + 30 > shareLimit) throw Error("too_large");
  const length = new Uint8Array(2);
  new DataView(length.buffer).setUint16(0,title.length);
  const plain = await new Blob([length,title,file]).arrayBuffer();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw",secret,"AES-GCM",false,["encrypt"]);
  const encrypted = await crypto.subtle.encrypt({name:"AES-GCM",iv},key,plain);
  return new Blob([iv,encrypted],{type:"application/octet-stream"});
}
async function decryptSharedDocument(payload,secret) {
  if (payload.size < 32 || payload.size > shareLimit) throw Error("invalid_document");
  const bytes = new Uint8Array(await payload.arrayBuffer());
  const key = await crypto.subtle.importKey("raw",secret,"AES-GCM",false,["decrypt"]);
  const plain = await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes.subarray(0,12)},key,bytes.subarray(12));
  const length = new DataView(plain).getUint16(0);
  if (length > 1024 || length + 2 >= plain.byteLength) throw Error("invalid_document");
  const filename = new TextDecoder("utf-8",{fatal:true}).decode(plain.slice(2,length+2));
  return new File([plain.slice(length+2)],docxFilename(filename),{
    type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}
async function requestShare(url,options = {}) {
  const response = await fetch(url,{...options,credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer",signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw Error(String(response.status));
  return response;
}
function showShareLink(url) {
  shareUrl.value = url;
  shareResult.hidden = false;
  shareStatus.textContent = "Посилання готове.";
}
function openShareDialog() {
  if (shareDialog.open) return;
  shareDialog.showModal();
  if (creatingShare) return;
  if (sharedSnapshot?.content === html() && sharedSnapshot.title === name) showShareLink(sharedSnapshot.url);
  else void createShareLink();
}
async function createShareLink() {
  if (creatingShare) return;
  const content = html(), title = name;
  shareResult.hidden = true;
  shareRetry.hidden = true;
  creatingShare = true;
  shareStatus.textContent = "Зберігаємо копію документа…";
  try {
    const blob = Docx.write(editor);
    const file = new File([blob],docxFilename(title),{type:blob.type});
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const body = await encryptSharedDocument(file,secret);
    await requestShare(await shareObjectUrl(secret),{method:"PUT",headers:{"Content-Type":body.type},body});
    const url = new URL("./",location.href);
    url.hash = "doc=" + encodeShareCode(secret);
    sharedSnapshot = {content,title,url:url.href};
    if (content === html() && title === name) showShareLink(url.href);
    else {
      shareStatus.textContent = "Копію попередньої версії збережено. Створіть посилання для поточної версії.";
      shareRetry.hidden = false;
    }
  } catch (error) {
    shareStatus.textContent = ({
      too_large:"Документ завеликий для поширення. Максимальний розмір — 8 МБ.",
      413:"Документ завеликий для поширення. Максимальний розмір — 8 МБ.",
      429:"Забагато запитів. Спробуйте через кілька хвилин."
    })[error.message] || "Не вдалося створити посилання. Спробуйте ще раз.";
    shareRetry.hidden = false;
  } finally { creatingShare = false; }
}
shareRetry.addEventListener("click",createShareLink);
$("#share-copy").addEventListener("click",async () => {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    shareStatus.textContent = "Посилання скопійовано.";
  } catch {
    shareUrl.focus();
    shareUrl.select();
    shareStatus.textContent = "Скопіюйте виділене посилання вручну.";
  }
});

$("#share-send").addEventListener("click",async () => {
  if (!sharedSnapshot || shareResult.hidden) return;
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({title:sharedSnapshot.title,text:"Документ для перегляду",url:sharedSnapshot.url});
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  shareUrl.focus();
  shareUrl.select();
  shareStatus.textContent = "Скопіюйте посилання та надішліть його вручну.";
});

async function loadSharedDocument(code) {
  document.body.classList.add("shared-view");
  $("#shared-header").hidden = false;
  const message = $("#shared-message");
  message.hidden = false;
  message.textContent = "Відкриваємо спільний документ…";
  editor.contentEditable = "false";
  editor.setAttribute("aria-readonly","true");
  editor.hidden = true;
  try {
    const secret = decodeShareCode(code);
    const response = await requestShare(await shareObjectUrl(secret));
    const file = await decryptSharedDocument(await response.blob(),secret);
    const pages = await Docx.read(file);
    const title = file.name.replace(/\.docx$/i,"");
    editor.hidden = false;
    loadDocument(pages,title);
    $("#shared-name").textContent = title;
    message.hidden = true;
    sharedCopy.hidden = false;
  } catch (error) {
    message.textContent = ({
      invalid_link:"Перевірте, чи посилання скопійовано повністю.",
      404:"Документ не знайдено. Попросіть автора створити нове посилання.",
      410:"Термін дії посилання минув. Попросіть автора створити нове."
    })[error.message] || "Не вдалося відкрити документ. Перевірте посилання та підключення до інтернету.";
  }
}
sharedCopy.addEventListener("click",() => {
  window.history.replaceState(null,"",new URL("./",location.href));
  document.body.classList.remove("shared-view");
  $("#shared-header").hidden = true;
  editor.contentEditable = "true";
  editor.removeAttribute("aria-readonly");
  loadDocument([...editor.children],"Копія — " + name);
  savedHtml = "";
});
const sharedCode = new URLSearchParams(location.hash.slice(1)).get("doc");
if (sharedCode !== null) void loadSharedDocument(sharedCode);
