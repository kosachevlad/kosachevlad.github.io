const SHAPE_NAMES = {circle:'Коло',rectangle:'Прямокутник',star:'Зірочка',callout:'Виноска',heart:'Серце',arrow:'Стрілка'};
const SHAPE_PATHS = {
  circle:'<ellipse cx="50" cy="50" rx="49" ry="49"/>',
  rectangle:'<rect x="2" y="2" width="96" height="96" rx="3"/>',
  star:'<polygon points="50,2 61,35 97,36 68,58 79,94 50,73 21,94 32,58 3,36 39,35"/>',
  callout:'<path d="M5 5H95V75H38L13 98V75H5Z"/>',
  heart:'<path d="M50 93 9 53C-14 25 21-8 50 20C79-8 114 25 91 53Z"/>',
  arrow:'<path d="M2 34H57V9L98 50 57 91V66H2Z"/>',
};
function makeShapeSVG(kind='circle') {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');
  svg.setAttribute('fill','currentColor');svg.setAttribute('aria-hidden','true');
  svg.innerHTML=SHAPE_PATHS[kind]||SHAPE_PATHS.circle;
  return svg;
}
function clampTextSize(value){return Math.round(Math.max(1,Math.min(18,value))*10)/10;}
function constrainCanvasView(zoom,x,y,width,height){
  zoom=Math.max(.5,Math.min(3,zoom));
  const maxX=Math.max(0,width*(zoom-1)/2),maxY=Math.max(0,height*(zoom-1)/2);
  return {zoom,x:Math.max(-maxX,Math.min(maxX,x))||0,y:Math.max(-maxY,Math.min(maxY,y))||0};
}
function calculatePinchView(start,a,b,width,height){
  const distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
  const zoom=Math.max(.5,Math.min(3,start.zoom*distance/start.distance));
  const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  return constrainCanvasView(zoom,mid.x-(start.mid.x-start.x)*zoom/start.zoom,mid.y-(start.mid.y-start.y)*zoom/start.zoom,width,height);
}
