"use strict";
const Docx = (() => {
  const MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
  const PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture";
  const WPS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape";
  const PR = "http://schemas.openxmlformats.org/package/2006/relationships";
  const CT = "http://schemas.openxmlformats.org/package/2006/content-types";
  const xmlHead = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const ns = ' xmlns:w="'+W+'" xmlns:r="'+R+'" xmlns:a="'+A+'" xmlns:wp="'+WP+'" xmlns:pic="'+PIC+'" xmlns:wps="'+WPS+'"';
  const encode = value => new TextEncoder().encode(value);
  const decode = value => new TextDecoder().decode(value);
  const escape = value => String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,"").replace(/[<>&"']/g,char => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"})[char]);
  const tag = (name,value) => '<w:'+name+' w:val="'+escape(value)+'"/>';
  const imageTypes = {png:"image/png",jpeg:"image/jpeg",jpg:"image/jpeg",gif:"image/gif",bmp:"image/bmp",webp:"image/webp"};
  const highlights = {black:"000000",blue:"0000FF",cyan:"00FFFF",green:"00FF00",magenta:"FF00FF",red:"FF0000",yellow:"FFFF00",white:"FFFFFF",darkBlue:"000080",darkCyan:"008080",darkGreen:"008000",darkMagenta:"800080",darkRed:"800000",darkYellow:"808000",darkGray:"808080",lightGray:"C0C0C0"};
  const crcTable = Uint32Array.from({length:256},(_,n) => {
    for (let i=0;i<8;i++) n = (n&1 ? 0xedb88320 : 0) ^ (n>>>1);
    return n>>>0;
  });
  function crc32(data) {
    let crc = -1;
    for (const byte of data) crc = (crc>>>8)^crcTable[(crc^byte)&255];
    return (crc^-1)>>>0;
  }
  function header(length,ints,shorts) {
    const data = new Uint8Array(length);
    const view = new DataView(data.buffer);
    for (const [offset,value] of Object.entries(ints)) view.setUint32(+offset,value,true);
    for (const [offset,value] of Object.entries(shorts)) view.setUint16(+offset,value,true);
    return data;
  }
  function zip(files) {
    const local = [], central = [];
    let offset = 0, centralSize = 0;
    for (const [filename,content] of files) {
      const name = encode(filename);
      const data = typeof content === "string" ? encode(content) : content;
      const crc = crc32(data);
      local.push(header(30,{0:0x04034b50,14:crc,18:data.length,22:data.length},{4:20,6:0x800,12:33,26:name.length}),name,data);
      central.push(header(46,{0:0x02014b50,16:crc,20:data.length,24:data.length,42:offset},{4:20,6:20,8:0x800,14:33,28:name.length}),name);
      offset += 30+name.length+data.length;
      centralSize += 46+name.length;
    }
    const end = header(22,{0:0x06054b50,12:centralSize,16:offset},{8:files.size,10:files.size});
    return new Blob([...local,...central,end],{type:MIME});
  }
  async function unzip(blob) {
    const max = 100*1024*1024;
    if (blob.size > max) throw Error("Файл DOCX має бути меншим за 100 МБ.");
    const data = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(data.buffer);
    const u16 = i => view.getUint16(i,true);
    const u32 = i => view.getUint32(i,true);
    let end = data.length-22;
    const floor = Math.max(0,data.length-65557);
    for (;end>=floor;end--) {
      if (u32(end) === 0x06054b50 && end+22+u16(end+20) === data.length) break;
    }
    if (end < floor || u16(end+4) || u16(end+6)) throw Error("Файл не є коректним документом DOCX.");
    const entries = new Map();
    let at = u32(end+16), total = 0;
    for (let i=0;i<u16(end+10);i++) {
      if (at+46 > end || u32(at) !== 0x02014b50) throw Error("Пошкоджено структуру DOCX.");
      const nameLength = u16(at+28);
      const name = decode(data.subarray(at+46,at+46+nameLength));
      const method = u16(at+10), flags = u16(at+8), crc = u32(at+16);
      const compressed = u32(at+20), size = u32(at+24), local = u32(at+42);
      if ((flags&1) || ![0,8].includes(method)) throw Error("Цей спосіб стиснення або захисту DOCX не підтримується.");
      total += size;
      if (total > max || local+30 > end || u32(local) !== 0x04034b50) throw Error("Завеликий або пошкоджений документ DOCX.");
      const start = local+30+u16(local+26)+u16(local+28);
      if (start+compressed>end) throw Error("Пошкоджено дані DOCX.");
      entries.set(name,{method,crc,size,start,compressed});
      at += 46+nameLength+u16(at+30)+u16(at+32);
    }
    return async name => {
      const entry = entries.get(name);
      if (!entry) return null;
      const encoded = data.subarray(entry.start,entry.start+entry.compressed);
      if (entry.method === 0) {
        if (encoded.length !== entry.size || crc32(encoded) !== entry.crc) throw Error("Пошкоджено дані DOCX.");
        return encoded;
      }
      const stream = new Blob([encoded]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
      const result = new Uint8Array(entry.size);
      let offset = 0;
      try {
        while (true) {
          const {value,done} = await stream.read();
          if (done) break;
          if (offset+value.length > result.length) throw Error("Пошкоджено дані DOCX.");
          result.set(value,offset);
          offset += value.length;
        }
      } finally { await stream.cancel().catch(() => {}); }
      if (offset !== entry.size || crc32(result) !== entry.crc) throw Error("Пошкоджено дані DOCX.");
      return result;
    };
  }
  const shapes = {
    ellipse:["Коло",'<circle cx="50" cy="50" r="43"/>'],
    rect:["Квадрат",'<rect x="9" y="9" width="82" height="82"/>'],
    triangle:["Трикутник",'<path d="M50 8 94 91H6Z"/>'],
    star5:["Зірка",'<path d="m50 5 13 28 31 4-22 23 5 32-27-15-27 15 5-32L6 37l31-4Z"/>'],
    pentagon:["П’ятикутник",'<path d="m50 7 44 32-17 52H23L6 39Z"/>'],
    smileyFace:["Смайлик",'<circle cx="50" cy="50" r="43"/><path fill="none" stroke-width="4" d="M29 60q21 25 42 0M35 37v5m30-5v5"/>'],
    cloud:["Хмаринка",'<path d="M18 70C1 68 2 42 19 38c-2-17 20-28 34-16 12-12 35-3 35 15 16 4 15 32-4 35-7 11-21 13-31 7-11 8-28 4-35-9Z"/>'],
    arc:["Крива",'<path fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" d="M13 78Q18 10 86 14"/>'],
    heart:["Серце",'<path d="M50 88S7 61 7 34C7 12 36 4 50 26 64 4 93 12 93 34c0 27-43 54-43 54Z"/>'],
    diamond:["Ромб",'<path d="M50 5 95 50 50 95 5 50Z"/>'],
    rightArrow:["Стрілка",'<path d="M7 34h47V16l40 34-40 34V66H7Z"/>'],
    hexagon:["Шестикутник",'<path d="M26 12h48l22 38-22 38H26L4 50Z"/>'],
    roundRect:["Заокруглений прямокутник",'<rect x="6" y="17" width="88" height="66" rx="18"/>'],
    lightningBolt:["Блискавка",'<path d="M51 5 22 54l27-4-6 45 39-57-28 7 16-40Z"/>'],
    plus:["Плюс",'<path d="M37 8h26v29h29v26H63v29H37V63H8V37h29Z"/>']
  };
  const shapeNames = Object.fromEntries(Object.entries(shapes).map(([key,[name]]) => [key,name]));
  function stackedObjects(container) {
    const layer = node => Number(node.style.getPropertyValue("--object-layer")) || 0;
    return [...container.querySelectorAll(".shape[data-wrap],img[data-wrap]")].sort((a,b) => layer(a)-layer(b));
  }
  function makeShape(type,color,width=100,height=100) {
    const shape = document.createElement("span");
    type = Object.hasOwn(shapes,type) ? type : "rect";
    color = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#5b9bd5";
    shape.className = "shape";
    shape.contentEditable = "false";
    shape.dataset.shape = type;
    shape.dataset.color = color;
    shape.style.width = width+"px";
    shape.style.height = height+"px";
    shape.setAttribute("role","img");
    shape.setAttribute("aria-label",shapeNames[type]);
    shape.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style="color:'+color+'" fill="'+color+'" stroke="#355579" stroke-width="2">'+shapes[type][1]+'</svg>';
    return shape;
  }
  function hex(color) {
    if (!color || color === "transparent") return "";
    const match = color.match(/^#([a-f0-9]{6})$/i);
    if (match) return match[1].toUpperCase();
    const rgb = color.match(/^rgb\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)\s*\)$/i);
    return rgb ? rgb.slice(1).map(n => (+n).toString(16).padStart(2,"0")).join("").toUpperCase() : "";
  }
  function runStyle(node,base) {
    const style = node.style;
    const next = {...base};
    if (style.fontWeight) next.bold = style.fontWeight === "bold" || parseInt(style.fontWeight,10) >= 600;
    else if (["B","STRONG"].includes(node.tagName)) next.bold = true;
    if (style.fontStyle) next.italic = style.fontStyle !== "normal";
    else if (["I","EM"].includes(node.tagName)) next.italic = true;
    if (style.textDecorationLine || style.textDecoration) next.underline = (style.textDecorationLine||style.textDecoration).includes("underline");
    else if (node.tagName === "U") next.underline = true;
    if (node.tagName === "SUB" || style.verticalAlign === "sub") next.vertical = "subscript";
    if (node.tagName === "SUP" || style.verticalAlign === "super") next.vertical = "superscript";
    const family = style.fontFamily || node.getAttribute("face");
    if (family) next.family = family.split(",")[0].replace(/^["']|["']$/g,"");
    const size = style.fontSize;
    if (size?.endsWith("pt")) next.size = parseFloat(size);
    else if (size?.endsWith("px")) next.size = parseFloat(size)*.75;
    else if (size) next.size = parseFloat(getComputedStyle(node).fontSize)*.75;
    if (style.color || node.getAttribute("color")) next.color = hex(style.color || node.getAttribute("color"));
    if (style.backgroundColor) next.highlight = hex(style.backgroundColor);
    return next;
  }
  function textRun(content,style={}) {
    const {family,size,bold,italic,underline,color,highlight,vertical} = style;
    const highlightName = Object.keys(highlights).find(key => highlights[key] === highlight);
    const font = family ? '<w:rFonts w:ascii="'+escape(family)+'" w:hAnsi="'+escape(family)+'" w:eastAsia="'+escape(family)+'" w:cs="'+escape(family)+'"/>' : "";
    const props = font+(bold?"<w:b/>":"")+(italic?"<w:i/>":"")+(color?tag("color",color):"")+
      (size?tag("sz",Math.round(size*2)):"")+(highlightName?tag("highlight",highlightName):"")+
      (underline?tag("u","single"):"")+(vertical?tag("vertAlign",vertical):"");
    return "<w:r>"+(props?"<w:rPr>"+props+"</w:rPr>":"")+content+"</w:r>";
  }
  function textContent(text,style) {
    return text.replace(/\u200b/g,"").split(/([\n\t])/).map(value => {
      if (!value) return "";
      const content = value === "\n" ? "<w:br/>" : value === "\t" ? "<w:tab/>" : '<w:t xml:space="preserve">'+escape(value)+"</w:t>";
      return textRun(content,style);
    }).join("");
  }

  function listMarkerSize(item) {
    let placeholder;
    const walker = document.createTreeWalker(item,NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,node => {
      if (node.nodeType === 1) {
        return node.matches("ol,ul,table") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
      }
      if (node.data.replace(/\u200b/g,"").trim()) return NodeFilter.FILTER_ACCEPT;
      if (!placeholder && node.data.includes("\u200b")) placeholder = node.parentElement;
      return NodeFilter.FILTER_SKIP;
    });
    const first = walker.nextNode();
    return parseFloat(getComputedStyle(first?.parentElement || placeholder || item).fontSize);
  }

  function write(editor) {
    const files = new Map();
    const media = new Map();
    const relationships = [
      '<Relationship Id="styles" Type="'+R+'/styles" Target="styles.xml"/>',
      '<Relationship Id="numbering" Type="'+R+'/numbering" Target="numbering.xml"/>'
    ];
    const formats = new Set();
    const lists = [];
    let drawingId = 0;
    const layers = new Map(stackedObjects(editor).map((node,index) => [node,index+1]));
    function drawing(uri,content,width,height,name,alt,layout) {
      const id = ++drawingId;
      const wrap = layout.dataset.wrap;
      const cx = Math.round(Math.max(1,width)*9525), cy = Math.round(Math.max(1,height)*9525);
      const extent = '<wp:extent cx="'+cx+'" cy="'+cy+'"/>';
      const graphic = '<wp:docPr id="'+id+'" name="'+escape(name)+'" descr="'+escape(alt)+'"/><a:graphic><a:graphicData uri="'+uri+'">'+content(cx,cy,id)+'</a:graphicData></a:graphic>';
      const square = wrap === "left" || wrap === "right";
      const vertical = wrap === "top-bottom";
      if (!square && !vertical && wrap !== "behind" && wrap !== "front") {
        return textRun('<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'+extent+graphic+'</wp:inline></w:drawing>');
      }
      const alignment = vertical ? "center" : wrap === "right" ? "right" : "left";
      const offset = axis => Math.round((parseFloat(layout.style.getPropertyValue("--object-"+axis)) || 0)*9525);
      const horizontal = square || vertical ? '<wp:align>'+alignment+'</wp:align>' :
        '<wp:posOffset>'+offset("x")+'</wp:posOffset>';
      const mode = square ? '<wp:wrapSquare wrapText="'+(wrap === "left" ? "right" : "left")+'"/>' :
        vertical ? "<wp:wrapTopAndBottom/>" : "<wp:wrapNone/>";
      return textRun('<w:drawing><wp:anchor distT="'+(vertical ? 57150 : 0)+'" distB="'+(square || vertical ? 57150 : 0)+
        '" distL="'+(wrap === "right" ? 95250 : 0)+'" distR="'+(wrap === "left" ? 95250 : 0)+
        '" simplePos="0" relativeHeight="'+(layers.get(layout) ?? id)+'" behindDoc="'+(wrap === "behind" ? 1 : 0)+
        '" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>'+
        '<wp:positionH relativeFrom="column">'+horizontal+'</wp:positionH>'+
        '<wp:positionV relativeFrom="paragraph"><wp:posOffset>'+(square || vertical ? 0 : offset("y"))+'</wp:posOffset></wp:positionV>'+
        extent+mode+graphic+'</wp:anchor></w:drawing>');
    }
    function object(node) {
      const angle = parseFloat(node.style.rotate) || 0;
      const rotation = angle ? ' rot="'+((Math.round(angle * 60000) % 21600000 + 21600000) % 21600000)+'"' : "";
      if (node.classList.contains("shape")) {
        const shape = node.dataset.shape, color = hex(node.dataset.color) || "5B9BD5";
        const fill = shape === "arc" ? "<a:noFill/>" : '<a:solidFill><a:srgbClr val="'+color+'"/></a:solidFill>';
        return drawing(WPS,(cx,cy) =>
          '<wps:wsp><wps:cNvSpPr/><wps:spPr><a:xfrm'+rotation+'><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm>'+
          '<a:prstGeom prst="'+escape(Object.hasOwn(shapes,shape) ? shape : "rect")+'"><a:avLst/></a:prstGeom>'+fill+
          '<a:ln w="'+(shape === "arc" ? 45000 : 12700)+'"><a:solidFill><a:srgbClr val="'+(shape === "arc" ? color : "355579")+'"/></a:solidFill></a:ln></wps:spPr><wps:bodyPr/></wps:wsp>',
          parseFloat(node.style.width)||100,parseFloat(node.style.height)||100,shapeNames[shape]||"Фігура","",node
        );
      }
      const match = node.getAttribute("src")?.match(/^data:(image\/(?:png|jpeg|gif|bmp|webp));base64,(.*)$/s);
      if (!match) return "";
      const [,mime,data] = match;
      let reference = media.get(node.src);
      if (!reference) {
        const ext = mime.split("/")[1];
        const target = "media/image"+(media.size+1)+"."+ext;
        reference = "image"+(media.size+1);
        media.set(node.src,reference);
        files.set("word/"+target,Uint8Array.from(atob(data),char => char.charCodeAt(0)));
        relationships.push('<Relationship Id="'+reference+'" Type="'+R+'/image" Target="'+target+'"/>');
        formats.add(ext);
      }
      const label = node.alt || "Зображення";
      return drawing(PIC,(cx,cy,id) =>
        '<pic:pic><pic:nvPicPr><pic:cNvPr id="'+id+'" name="'+escape(label)+'"/><pic:cNvPicPr/></pic:nvPicPr>'+
        '<pic:blipFill><a:blip r:embed="'+reference+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'+
        '<pic:spPr><a:xfrm'+rotation+'><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>',
        Number(node.getAttribute("width"))||node.naturalWidth||200,Number(node.getAttribute("height"))||node.naturalHeight||150,label,label,node
      );
    }
    function runs(node,style) {
      if (node.nodeType === 3) return textContent(node.data,style);
      if (node.nodeType !== 1) return "";
      if (node.tagName === "IMG" || node.classList.contains("shape")) return object(node);
      if (node.tagName === "BR") return textRun("<w:br/>",style);
      if (node.matches("ol,ul,table")) return "";
      const next = runStyle(node,style);
      return [...node.childNodes].map(child => runs(child,next)).join("");
    }
    function paragraph(block,num=null,children=[...block.childNodes]) {
      const properties = [];
      if (num) properties.push("<w:numPr>"+tag("ilvl",num.level)+tag("numId",num.id)+"</w:numPr>");
      const spacing = block.style?.lineHeight;
      if (spacing) {
        const value = parseFloat(spacing);
        const ratio = spacing.endsWith("px") ? value/parseFloat(getComputedStyle(block).fontSize) : spacing.endsWith("%") ? value/100 : value;
        if (ratio>0) properties.push('<w:spacing w:line="'+Math.round(ratio*240)+'" w:lineRule="auto"/>');
      }
      const alignment = ({"left":"left","center":"center","right":"right","justify":"both","-webkit-center":"center"})[block.style?.textAlign || block.getAttribute?.("align")];
      if (alignment) properties.push(tag("jc",alignment));
      if (num) properties.push("<w:rPr>"+tag("sz",num.markerSize)+tag("szCs",num.markerSize)+"</w:rPr>");
      const base = block.style ? runStyle(block,{}) : {};
      let content;
      if (block.nodeType === 3 || block.matches?.("img,.shape,br")) content = runs(block,base);
      else if (children.length === 1 && children[0].nodeName === "BR") content = "";
      else content = children.map(child => runs(child,base)).join("");
      return "<w:p>"+(properties.length?"<w:pPr>"+properties.join("")+"</w:pPr>":"")+content+"</w:p>";
    }
    function list(node) {
      const id = lists.length+1;
      const levels = [];
      lists.push({id,levels});
      function flatten(group,depth) {
        const level = Math.min(depth,8);
        levels[level] ||= {bullet:group.tagName === "UL",multi:group.hasAttribute("data-multilevel"),start:Math.max(1,group.start||1)};
        let output = "";
        for (const item of group.children) {
          if (item.matches("ul,ol")) {
            output += flatten(item,depth+1);
            continue;
          }
          if (item.tagName !== "LI") continue;
          const direct = [...item.children].find(child => child.matches("p,div"));
          const markerSize = Math.round(listMarkerSize(item)*1.5);
          output += paragraph(direct || item,{id,level,markerSize});
          for (const child of item.children) {
            if (child.matches("ol,ul")) output += flatten(child,depth+1);
            else if (direct && child !== direct && child.matches("p,div,table")) output += block(child);
          }
        }
        return output;
      }
      return flatten(node,0);
    }
    function table(node) {
      const rows = [...node.rows];
      const columns = Math.max(1,...rows.map(row => [...row.cells].reduce((sum,cell) => sum+cell.colSpan,0)));
      const columnWidth = Math.round(9026/columns);
      const borders = ["top","left","bottom","right","insideH","insideV"].map(side => '<w:'+side+' w:val="single" w:sz="4" w:color="404040"/>').join("");
      const grid = '<w:tblGrid>' + ('<w:gridCol w:w="'+columnWidth+'"/>').repeat(columns) + "</w:tblGrid>";
      return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>'+borders+'</w:tblBorders></w:tblPr>'+grid+
        rows.map(row => '<w:tr>'+(row.cells[0]?.tagName === "TH" ? '<w:trPr><w:tblHeader w:val="true"/></w:trPr>' : "")+[...row.cells].map(cell => {
          const content = blocks(cell);
          const background = hex(cell.style.backgroundColor);
          const alignment = {top:"top",middle:"center",bottom:"bottom"}[cell.style.verticalAlign];
          return '<w:tc><w:tcPr><w:tcW w:w="'+columnWidth*cell.colSpan+'" w:type="dxa"/>'+
            (background ? '<w:shd w:fill="'+background+'"/>' : "")+
            (alignment ? tag("vAlign",alignment) : "")+
            (cell.colSpan>1?tag("gridSpan",cell.colSpan):"")+"</w:tcPr>"+(content||"<w:p/>")+(content.endsWith("</w:tbl>")?"<w:p/>":"")+"</w:tc>";
        }).join("")+"</w:tr>").join("")+"</w:tbl>";
    }
    const blockSelector = "p,div,ol,ul,table,h1,h2,h3,h4,h5,h6,blockquote";
    function block(node) {
      if (node.nodeType === 1) {
        if (node.matches("ol,ul")) return list(node);
        if (node.tagName === "TABLE") return table(node);
        // Editing commands can put a list inside a paragraph or div.
        if ([...node.children].some(child => child.matches(blockSelector))) return blocks(node,true);
      }
      if (node.nodeType === 3 && !node.data.trim()) return "";
      return paragraph(node);
    }
    function blocks(node,formatted=false) {
      let output = "", inline = [];
      const flush = () => {
        if (!inline.length) return;
        if (formatted) output += paragraph(node,null,inline);
        else {
          const content = inline.map(child => runs(child,{})).join("");
          if (content) output += "<w:p>"+content+"</w:p>";
        }
        inline = [];
      };
      for (const child of node.childNodes) {
        if (child.nodeType === 1 && child.matches(blockSelector)) {
          flush();
          output += block(child);
        } else if (child.nodeType !== 3 || child.data.trim() || inline.length) inline.push(child);
      }
      flush();
      return output;
    }
    const content = [...editor.children].map(page => blocks(page)||"<w:p/>").join('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    const sections = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
    files.set("word/document.xml",xmlHead+'<w:document'+ns+'><w:body>'+content+sections+"</w:body></w:document>");
    const definitions = lists.map(({id,levels}) => '<w:abstractNum w:abstractNumId="'+id+'">'+tag("multiLevelType","multilevel")+
      Array.from({length:levels.length},(_,level) => {
        const {bullet,multi,start} = levels[level] || levels[0];
        const label = bullet ? "•" : multi ? Array.from({length:level+1},(_,n) => "%"+(n+1)+".").join("") : "%"+(level+1)+".";
        return '<w:lvl w:ilvl="'+level+'">'+tag("start",start)+tag("numFmt",bullet?"bullet":"decimal")+tag("lvlText",label)+tag("lvlJc","left")+
          '<w:pPr><w:tabs><w:tab w:val="num" w:pos="'+(level+1)*400+'"/></w:tabs><w:ind w:left="'+(level+1)*400+'" w:hanging="360"/></w:pPr></w:lvl>';
      }).join("")+"</w:abstractNum>").join("");
    files.set("word/numbering.xml",xmlHead+'<w:numbering xmlns:w="'+W+'">'+definitions+
      lists.map(({id}) => '<w:num w:numId="'+id+'">'+tag("abstractNumId",id)+"</w:num>").join("")+"</w:numbering>");
    files.set("word/styles.xml",xmlHead+'<w:styles xmlns:w="'+W+'"><w:docDefaults><w:rPrDefault><w:rPr>'+
      '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="uk-UA"/>'+
      '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'+
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>');
    files.set("_rels/.rels",xmlHead+'<Relationships xmlns="'+PR+'"><Relationship Id="document" Type="'+R+'/officeDocument" Target="word/document.xml"/></Relationships>');
    files.set("word/_rels/document.xml.rels",xmlHead+'<Relationships xmlns="'+PR+'">'+relationships.join("")+"</Relationships>");
    const standard = "application/vnd.openxmlformats-officedocument.wordprocessingml.";
    files.set("[Content_Types].xml",xmlHead+'<Types xmlns="'+CT+'"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
      '<Default Extension="xml" ContentType="application/xml"/>'+[...formats].map(ext => '<Default Extension="'+ext+'" ContentType="'+imageTypes[ext]+'"/>').join("")+
      [["document","document.main"],["styles","styles"],["numbering","numbering"]].map(([file,kind]) => '<Override PartName="/word/'+file+'.xml" ContentType="'+standard+kind+'+xml"/>').join("")+"</Types>");
    return zip(files);
  }

  const children = node => [...(node?.children || [])];
  const child = (node,name) => children(node).find(el => el.localName === name);
  const attr = (node,name="val") => node?.getAttributeNS(W,name) || node?.getAttribute("w:"+name) || node?.getAttribute(name) || "";
  const value = (node,name) => attr(child(node,name));
  const descendants = (node,name) => [...(node?.getElementsByTagNameNS("*",name) || [])];
  const rgb = value => /^[a-f0-9]{6}$/i.test(value) ? "#"+value : "";
  function parse(data) {
    if (!data) return null;
    const source = decode(data);
    if (/<!DOCTYPE/i.test(source)) throw Error("Некоректний XML у DOCX.");
    const doc = new DOMParser().parseFromString(source,"application/xml");
    if (doc.querySelector("parsererror")) throw Error("Некоректний XML у DOCX.");
    return doc.documentElement;
  }
  function packagePath(parent,target) {
    const origin = "https://docx.invalid";
    const url = new URL(target,origin+"/"+parent);
    return url.origin === origin ? decodeURIComponent(url.pathname.slice(1)) : "";
  }
  function runProps(target,node) {
    if (!node) return;
    const style = target.style;
    const font = child(node,"rFonts");
    const family = attr(font,"ascii") || attr(font,"hAnsi") || attr(font,"cs");
    if (family) style.fontFamily = '"'+family.replace(/["\\\n\r]/g,"")+'"';
    const size = +value(node,"sz");
    if (size>0 && size<=3276) style.fontSize = size/2+"pt";
    for (const [key,property,on,off] of [["b","fontWeight","bold","normal"],["i","fontStyle","italic","normal"],["u","textDecoration","underline","none"]]) {
      const flag = child(node,key);
      if (flag) style[property] = ["0","false","off","none"].includes(attr(flag)) ? off : on;
    }
    const color = value(node,"color");
    if (color) style.color = rgb(color)||"#000000";
    const highlight = value(node,"highlight");
    if (highlight) style.backgroundColor = rgb(highlights[highlight]||"")||"transparent";
    const vertical = value(node,"vertAlign");
    if (vertical) style.verticalAlign = ({subscript:"sub",superscript:"super"})[vertical] || "baseline";
  }
  function paraProps(target,node) {
    if (!node) return;
    const align = ({left:"left",right:"right",center:"center",both:"justify",start:"left",end:"right",distribute:"justify"})[value(node,"jc")];
    if (align) target.style.textAlign = align;
    const spacing = child(node,"spacing");
    const line = +attr(spacing,"line");
    if (line>0) target.style.lineHeight = attr(spacing,"lineRule") && attr(spacing,"lineRule") !== "auto" ? line/20+"pt" : String(line/240);
    if (attr(spacing,"after")) target.style.marginBottom = +attr(spacing,"after")/20+"pt";
    if (attr(spacing,"before")) target.style.marginTop = +attr(spacing,"before")/20+"pt";
  }
  async function read(blob) {
    const get = await unzip(blob);
    const packageRels = parse(await get("_rels/.rels"));
    const mainRel = children(packageRels).find(rel => rel.getAttribute("Type")?.endsWith("/officeDocument"));
    const part = mainRel ? packagePath("",mainRel.getAttribute("Target")) : "word/document.xml";
    const main = parse(await get(part));
    const body = child(main,"body");
    if (!body) throw Error("У DOCX не знайдено основного тексту документа.");
    const slash = part.lastIndexOf("/");
    const rels = parse(await get(part.slice(0,slash+1)+"_rels/"+part.slice(slash+1)+".rels"));
    const relations = new Map(children(rels).filter(rel => rel.getAttribute("TargetMode") !== "External").map(rel => [
      rel.getAttribute("Id"),{part:packagePath(part,rel.getAttribute("Target")),type:rel.getAttribute("Type")}
    ]));
    function related(type) {
      return [...relations.values()].find(relation => relation.type?.endsWith("/"+type))?.part;
    }
    const stylesRoot = parse(await get(related("styles")||"word/styles.xml"));
    const numberingRoot = parse(await get(related("numbering")||"word/numbering.xml"));
    const defaults = child(stylesRoot,"docDefaults");
    const styles = new Map(children(stylesRoot).filter(el => el.localName === "style").map(el => [attr(el,"styleId"),el]));
    const defaultStyle = [...styles.values()].find(style => attr(style,"type") === "paragraph" && attr(style,"default") === "1");
    const abstract = new Map(children(numberingRoot).filter(el => el.localName === "abstractNum").map(el => [attr(el,"abstractNumId"),el]));
    const concrete = new Map(children(numberingRoot).filter(el => el.localName === "num").map(el => [attr(el,"numId"),el]));
    const imgCache = new Map();
    function cascade(style) {
      const list = [], seen = new Set();
      while (style && !seen.has(style)) {
        list.unshift(style);
        seen.add(style);
        style = styles.get(value(style,"basedOn"));
      }
      return list;
    }
    async function image(drawing) {
      const frame = descendants(drawing,"extent")[0];
      const width = Math.min(2000,Math.max(1,Math.round((Number(frame?.getAttribute("cx"))||952500)/9525)));
      const height = Math.min(2000,Math.max(1,Math.round((Number(frame?.getAttribute("cy"))||952500)/9525)));
      const preset = descendants(drawing,"prstGeom")[0]?.getAttribute("prst");
      const isShape = descendants(drawing,"wsp").length;
      const rotation = Number(descendants(drawing,"xfrm")[0]?.getAttribute("rot")) / 60000;
      const anchor = descendants(drawing,"anchor")[0];
      const square = child(anchor,"wrapSquare") || child(anchor,"wrapTight") || child(anchor,"wrapThrough");
      let wrap;
      if (square) {
        const text = square.getAttribute("wrapText");
        const align = child(child(anchor,"positionH"),"align")?.textContent;
        wrap = text === "left" || (text !== "right" && align === "right") ? "right" : "left";
      } else if (child(anchor,"wrapTopAndBottom")) wrap = "top-bottom";
      else if (child(anchor,"wrapNone")) wrap = /^(1|true)$/.test(anchor.getAttribute("behindDoc")) ? "behind" : "front";
      const styleObject = node => {
        if (Number.isFinite(rotation) && rotation) node.style.rotate = rotation + "deg";
        if (wrap) {
          node.dataset.wrap = wrap;
          const height = Number(anchor.getAttribute("relativeHeight"));
          if (Number.isSafeInteger(height) && height > 0) node.style.setProperty("--object-layer",height);
        }
        if (wrap === "behind" || wrap === "front") {
          for (const [axis,tag,relativeFrom] of [["x","positionH","column"],["y","positionV","paragraph"]]) {
            const position = child(anchor,tag);
            if (position?.getAttribute("relativeFrom") !== relativeFrom) continue;
            const offset = Math.round(Number(child(position,"posOffset")?.textContent)/9525);
            if (Number.isFinite(offset) && offset) node.style.setProperty("--object-"+axis,Math.max(-10000,Math.min(10000,offset))+"px");
          }
        }
        return node;
      };
      if (isShape && Object.hasOwn(shapes,preset)) {
        const paint = descendants(descendants(drawing,"spPr")[0],"srgbClr")[0]?.getAttribute("val");
        return styleObject(makeShape(preset,rgb(paint||""),width,height));
      }
      const link = descendants(drawing,"blip")[0];
      const id = link?.getAttributeNS(R,"embed") || link?.getAttribute("r:embed") || descendants(drawing,"imagedata")[0]?.getAttribute("r:id");
      if (!id || !relations.has(id)) return null;
      if (!imgCache.has(id)) {
        const target = relations.get(id).part;
        const type = imageTypes[target.split(".").pop().toLowerCase()];
        const data = type && await get(target);
        if (!data) return null;
        let binary = "";
        for (let i=0;i<data.length;i+=16384) binary += String.fromCharCode(...data.subarray(i,i+16384));
        imgCache.set(id,"data:"+type+";base64,"+btoa(binary));
      }
      const node = document.createElement("img");
      node.src = imgCache.get(id);
      node.alt = descendants(drawing,"docPr")[0]?.getAttribute("descr") || "Зображення";
      node.width = width;
      node.height = height;
      return styleObject(node);
    }
    const BREAK = Symbol("page");
    async function inlines(node,result) {
      if (node.localName === "r") {
        const props = child(node,"rPr");
        const template = document.createElement("span");
        for (const style of cascade(styles.get(value(props,"rStyle")))) runProps(template,child(style,"rPr"));
        runProps(template,props);
        let span = template.cloneNode(false);
        const flush = () => {
          if (!span.firstChild) return;
          if (span.getAttribute("style")) result.push(span);
          else result.push(...span.childNodes);
          span = template.cloneNode(false);
        };
        for (const part of children(node)) {
          switch (part.localName) {
            case "t": span.append(part.textContent); break;
            case "tab": span.append("\t"); break;
            case "noBreakHyphen": span.append("‑"); break;
            case "br":
              if (attr(part,"type") === "page") { flush(); result.push(BREAK); }
              else span.append(document.createElement("br"));
              break;
            case "cr": span.append(document.createElement("br")); break;
            case "drawing": case "pict": {
              const object = await image(part);
              if (object) span.append(object);
              break;
            }
            case "AlternateContent": {
              const choice = child(part,"Choice") || child(part,"Fallback");
              const drawing = child(choice,"drawing") || child(choice,"pict");
              const object = drawing && await image(drawing);
              if (object) span.append(object);
              break;
            }
          }
        }
        flush();
        return;
      }
      if (["p","hyperlink","smartTag","sdt","sdtContent","ins","fldSimple","customXml"].includes(node.localName)) {
        for (const part of children(node)) await inlines(part,result);
      }
    }
    async function paragraph(node) {
      const p = document.createElement("p");
      const props = child(node,"pPr");
      const style = styles.get(value(props,"pStyle")) || defaultStyle;
      const inherited = cascade(style);
      const inheritedProps = inherited.map(item => child(item,"pPr"));
      runProps(p,child(child(defaults,"rPrDefault"),"rPr"));
      paraProps(p,child(child(defaults,"pPrDefault"),"pPr"));
      for (const item of inherited) {
        runProps(p,child(item,"rPr"));
        paraProps(p,child(item,"pPr"));
      }
      paraProps(p,props);
      const settings = child(props,"numPr") || inheritedProps.map(item => child(item,"numPr")).filter(Boolean).at(-1);
      const id = value(settings,"numId");
      const level = Math.min(8,Math.max(0,+value(settings,"ilvl")||0));
      const pageBreak = child(props,"pageBreakBefore") || inheritedProps.map(item => child(item,"pageBreakBefore")).filter(Boolean).at(-1);
      const pieces = [];
      if (pageBreak && !["0","false","off"].includes(attr(pageBreak))) pieces.push(BREAK);
      await inlines(node,pieces);
      return {p,pieces,id,level};
    }
    function numbering(id,level) {
      const instance = concrete.get(id);
      const group = abstract.get(value(instance,"abstractNumId"));
      const override = children(instance).find(item => item.localName === "lvlOverride" && +attr(item,"ilvl") === level);
      const spec = child(override,"lvl") || children(group).find(item => item.localName === "lvl" && +attr(item,"ilvl") === level);
      const format = value(spec,"numFmt");
      const formatType = ({lowerLetter:"a",upperLetter:"A",lowerRoman:"i",upperRoman:"I"})[format];
      const multi = children(group).some(item => (value(item,"lvlText").match(/%[1-9]/g)||[]).length > 1);
      const start = +(value(override,"startOverride") || value(spec,"start")) || 1;
      return {type:format === "bullet" ? "ul" : "ol",formatType,multi,start};
    }
    async function fillBlocks(parent,nodes,breakPage=null) {
      let stack = [], currentId;
      async function add(node) {
        if (node.localName === "sdt" || node.localName === "sdtContent" || node.localName === "customXml") {
          for (const nested of children(node)) await add(nested);
          return;
        }
        if (node.localName === "tbl") {
          const table = document.createElement("table");
          for (const tr of children(node).filter(item => item.localName === "tr")) {
            const row = table.insertRow();
            const isHeader = !!child(child(tr,"trPr"),"tblHeader");
            for (const tc of children(tr).filter(item => item.localName === "tc")) {
              const properties = child(tc,"tcPr");
              const cell = document.createElement(isHeader ? "th" : "td");
              row.append(cell);
              const shade = attr(child(properties,"shd"),"fill");
              if (/^[0-9a-f]{6}$/i.test(shade)) cell.style.backgroundColor = "#"+shade;
              const alignment = value(properties,"vAlign");
              if ({top:1,center:1,bottom:1}[alignment]) cell.style.verticalAlign = alignment === "center" ? "middle" : alignment;
              cell.colSpan = Math.min(64,+value(child(tc,"tcPr"),"gridSpan")||1);
              await fillBlocks(cell,children(tc));
              if (!cell.firstChild) cell.append(document.createElement("br"));
            }
          }
          if (table.rows.length) parent.append(table);
          stack = [];
          return;
        }
        if (node.localName !== "p") return;
        const {p,pieces,id,level} = await paragraph(node);
        let part = p;
        const append = line => {
          if (!line.firstChild) line.append(document.createElement("br"));
          if (id && id !== "0") {
            if (id !== currentId) stack = [];
            currentId = id;
            const depth = Math.min(level,stack.length);
            const spec = numbering(id,level);
            if (!stack[depth] || stack[depth].localName !== spec.type) {
              stack = stack.slice(0,depth);
              const list = document.createElement(spec.type);
              if (spec.type === "ol") {
                if (spec.start!==1) list.start = spec.start;
                if (spec.formatType) list.type = spec.formatType;
                if (spec.multi) list.dataset.multilevel = "";
              }
              const host = depth ? stack[depth-1].lastElementChild : parent;
              host.append(list);
              stack.push(list);
            }
            const li = document.createElement("li");
            li.append(line);
            stack[depth].append(li);
            stack.length = depth+1;
          } else {
            stack = [];
            parent.append(line);
          }
        };
        for (const piece of pieces) {
          if (piece === BREAK) {
            if (!breakPage) part.append(document.createElement("br"));
            else {
              if (part.firstChild) append(part);
              parent = breakPage();
              stack = [];
              part = p.cloneNode(false);
            }
          } else part.append(piece);
        }
        if (part.firstChild || !pieces.includes(BREAK)) append(part);
      }
      for (const node of nodes) await add(node);
    }
    const pages = [];
    const next = () => {
      const page = document.createElement("section");
      page.className = "page";
      pages.push(page);
      return page;
    };
    await fillBlocks(next(),children(body),next);
    for (const page of pages) {
      stackedObjects(page).forEach((node,index) => node.style.setProperty("--object-layer",index+1));
    }
    return pages;
  }
  return {read,write,makeShape,shapeNames,listMarkerSize};
})();
