const contactDialog=$('#contactDialog'),contactForm=$('#contactForm');
function closeContact(){contactDialog.close();}
$('#contactButton').onclick=()=>{contactDialog.showModal();$('#contactName').focus();};
$('#closeContact').onclick=closeContact;
$('#cancelContact').onclick=closeContact;
contactDialog.addEventListener('close',()=>$('#contactButton').focus({preventScroll:true}));
contactForm.addEventListener('submit',event=>{
  event.preventDefault();
  const data=new FormData(contactForm),name=(data.get('name')||'').trim(),email=(data.get('email')||'').trim(),message=(data.get('message')||'').trim();
  const body=[name&&`Ім’я: ${name}`,`Email: ${email}`,'',message].filter(Boolean).join('\n');
  $('#contactStatus').textContent='Відкриваємо програму пошти…';
  window.location.href=`mailto:kosachevlad@gmail.com?subject=${encodeURIComponent('Slides Studio feedback')}&body=${encodeURIComponent(body)}`;
});
