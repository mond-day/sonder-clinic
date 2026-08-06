
(function(){
  const qs=(s,r=document)=>r.querySelector(s), qsa=(s,r=document)=>[...r.querySelectorAll(s)];
  const toast=qs('.toast');
  function showToast(message){
    if(!toast)return;
    toast.textContent=message;toast.classList.add('show');
    clearTimeout(window.__toastTimer);
    window.__toastTimer=setTimeout(()=>toast.classList.remove('show'),2200);
  }
  window.showToast=showToast;

  qsa('[data-toast]').forEach(el=>el.addEventListener('click',()=>showToast(el.dataset.toast||'Ação concluída')));
  qsa('[data-toggle-sidebar]').forEach(el=>el.addEventListener('click',()=>qs('#sidebar')?.classList.toggle('open')));

  function openLayer(id){
    const el=qs('#'+id); if(!el)return;
    el.classList.add('open'); el.setAttribute('aria-hidden','false');
    const backdrop=el.classList.contains('drawer')?qs('.drawer-backdrop'):qs('.modal-backdrop[data-for="'+id+'"]');
    backdrop?.classList.add('open');
  }
  function closeLayer(id){
    const el=qs('#'+id); if(!el)return;
    el.classList.remove('open'); el.setAttribute('aria-hidden','true');
    const backdrop=el.classList.contains('drawer')?qs('.drawer-backdrop'):qs('.modal-backdrop[data-for="'+id+'"]');
    backdrop?.classList.remove('open');
  }
  qsa('[data-open]').forEach(el=>el.addEventListener('click',()=>openLayer(el.dataset.open)));
  qsa('[data-close]').forEach(el=>el.addEventListener('click',()=>closeLayer(el.dataset.close)));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){qsa('.modal.open,.drawer.open').forEach(el=>closeLayer(el.id));qsa('.dropdown.open,.search-select.open').forEach(el=>el.classList.remove('open'));}});

  qsa('[data-dropdown]').forEach(btn=>btn.addEventListener('click',e=>{
    e.stopPropagation(); const parent=btn.closest('.dropdown');
    qsa('.dropdown.open').filter(x=>x!==parent).forEach(x=>x.classList.remove('open'));
    parent?.classList.toggle('open');
  }));
  document.addEventListener('click',()=>qsa('.dropdown.open').forEach(x=>x.classList.remove('open')));

  qsa('[data-tabs]').forEach(tabset=>{
    qsa('.tab',tabset).forEach(btn=>btn.addEventListener('click',()=>{
      qsa('.tab',tabset).forEach(x=>x.classList.remove('active'));btn.classList.add('active');
      const root=tabset.closest('[data-tab-root]')||tabset.parentElement;
      qsa('.tab-panel',root).forEach(x=>x.classList.remove('active'));
      qs('#'+btn.dataset.target,root)?.classList.add('active');
    }));
  });
  qsa('.segmented').forEach(group=>qsa('button',group).forEach(btn=>btn.addEventListener('click',()=>{
    qsa('button',group).forEach(x=>x.classList.remove('active'));btn.classList.add('active');
  })));

  qsa('.accordion>button').forEach(btn=>btn.addEventListener('click',()=>btn.parentElement.classList.toggle('open')));
  qsa('.switch').forEach(btn=>btn.addEventListener('click',()=>{btn.classList.toggle('on');btn.setAttribute('aria-pressed',btn.classList.contains('on'));}));

  qsa('[data-edit-toggle]').forEach(btn=>btn.addEventListener('click',()=>{
    const root=btn.closest('[data-edit-root]'); if(!root)return;
    const editing=root.classList.toggle('editing');
    qsa('input,select,textarea',root).forEach(el=>el.disabled=!editing);
    qsa('[data-view-actions]',root).forEach(el=>el.hidden=editing);
    qsa('[data-edit-actions]',root).forEach(el=>el.hidden=!editing);
    showToast(editing?'Modo de edição ativado':'Edição cancelada');
  }));
  qsa('[data-save-edit]').forEach(btn=>btn.addEventListener('click',()=>{
    const root=btn.closest('[data-edit-root]');if(!root)return;
    root.classList.remove('editing');qsa('input,select,textarea',root).forEach(el=>el.disabled=true);
    qsa('[data-view-actions]',root).forEach(el=>el.hidden=false);qsa('[data-edit-actions]',root).forEach(el=>el.hidden=true);
    showToast('Alterações salvas no protótipo');
  }));

  qsa('.search-select>button').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();btn.parentElement.classList.toggle('open')}));
  qsa('.search-select-menu').forEach(menu=>menu.addEventListener('click',e=>e.stopPropagation()));
  qsa('.search-select-menu input').forEach(inp=>inp.addEventListener('input',()=>{
    const term=inp.value.toLowerCase();qsa('.option',inp.parentElement).forEach(o=>o.hidden=!o.textContent.toLowerCase().includes(term));
  }));
  qsa('.option').forEach(opt=>opt.addEventListener('click',()=>{
    const root=opt.closest('.search-select');const label=qs('[data-selected]',root);
    if(label)label.textContent=opt.textContent.trim();root.classList.remove('open');showToast('Etiqueta selecionada');
  }));

  qsa('.tooth').forEach(tooth=>tooth.addEventListener('click',e=>{
    if(e.target.classList.contains('face')) e.target.classList.toggle('active');
    tooth.classList.toggle('selected');
    const out=qs('[data-selected-teeth]');if(out)out.textContent=qsa('.tooth.selected').map(x=>x.dataset.tooth).join(', ')||'Nenhum';
  }));

  qsa('[data-presentation]').forEach(btn=>btn.addEventListener('click',()=>{
    document.body.classList.toggle('presentation-mode');
    qsa('.sensitive').forEach(x=>x.classList.toggle('presentation-hidden'));
    btn.textContent=document.body.classList.contains('presentation-mode')?'Desativar modo atendimento':'Ativar modo atendimento';
    showToast('Modo atendimento atualizado');
  }));

  qsa('[data-step-next]').forEach(btn=>btn.addEventListener('click',()=>{
    const root=btn.closest('[data-stepper]');const current=Number(root.dataset.step||1);const next=Math.min(4,current+1);root.dataset.step=next;
    qsa('[data-step]',root).forEach(x=>x.hidden=Number(x.dataset.step)!==next);qsa('.step',root).forEach((x,i)=>x.classList.toggle('active',i+1<=next));
  }));
  qsa('[data-step-prev]').forEach(btn=>btn.addEventListener('click',()=>{
    const root=btn.closest('[data-stepper]');const current=Number(root.dataset.step||1);const next=Math.max(1,current-1);root.dataset.step=next;
    qsa('[data-step]',root).forEach(x=>x.hidden=Number(x.dataset.step)!==next);qsa('.step',root).forEach((x,i)=>x.classList.toggle('active',i+1<=next));
  }));
})();
