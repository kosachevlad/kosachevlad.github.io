const createDialog=$('#createDialog');
$('#createPresentation').onclick=()=>{
  if(isSharedView)return;
  closeEditorMenu();
  createDialog.showModal();
  $('#cancelCreate').focus();
};
$('#cancelCreate').onclick=()=>createDialog.close();
createDialog.addEventListener('close',()=>$('#createPresentation').focus({preventScroll:true}));
$('#confirmCreate').onclick=()=>{
  if(isSharedView)return;
  clearGestureHold();editorPointers.clear();pointerGesture=null;closeEditorMenu();stopAuto();
  // Invalidate links and pending responses belonging to the previous draft.
  shareEpoch++;cachedShare=null;shareBusy=false;
  $('#createShare').disabled=false;$('#shareResult').hidden=true;$('#shareUrl').value='';$('#shareStatus').textContent='';
  deck={title:'Нова презентація',slides:[{id:uid(),bg:'#ffffff',notes:'',transition:'fade',elements:[]}]};
  active=0;selected=null;rotationTarget=null;tab='design';past=[];future=[];playerIndex=0;
  $('#imageInput').value='';
  applyCanvasView({zoom:1,x:0,y:0});
  render();
  createDialog.close();
  toast('Створено нову презентацію');
};
