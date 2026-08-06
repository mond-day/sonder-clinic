
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


(function(){
  const qs=(s,r=document)=>r.querySelector(s), qsa=(s,r=document)=>[...r.querySelectorAll(s)];

  // Anamnese: alternância de seção
  qsa('[data-anamnesis-section]').forEach(btn=>btn.addEventListener('click',()=>{
    const id=btn.dataset.anamnesisSection;
    qsa('[data-anamnesis-section]').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    qsa('.clinical-section').forEach(x=>x.classList.toggle('active',x.id===id));
  }));

  // Seleção visual dos modelos de anamnese
  qsa('[data-template-card]').forEach(card=>card.addEventListener('click',()=>{
    qsa('[data-template-card]').forEach(x=>x.classList.remove('active'));
    card.classList.add('active');
    const title=qs('[data-anamnesis-title]');
    if(title) title.textContent='Anamnese '+card.dataset.templateCard+' · versão 1';
    window.showToast?.('Modelo '+card.dataset.templateCard+' selecionado');
  }));

  // Pills de resposta
  qsa('.choice-row').forEach(row=>qsa('.choice-pill',row).forEach(btn=>btn.addEventListener('click',()=>{
    qsa('.choice-pill',row).forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    const dep=row.parentElement.querySelector('.dependent-field');
    if(dep) dep.hidden=!btn.classList.contains('danger') && btn.dataset.value!=='detail';
  })));

  // Evolução: seleção do histórico
  const evolutionData={
    endo:{
      eyebrow:'Sessão clínica assinada',
      title:'Tratamento endodôntico · elemento 16',
      summary:'Realizada anestesia infiltrativa, isolamento absoluto, abertura coronária e instrumentação inicial dos canais. Irrigação com hipoclorito de sódio a 2,5%. Paciente permaneceu estável e sem intercorrências durante o atendimento.',
      status:'Assinada',
      professional:'Dra. Camila Andrade',
      date:'05/08/2026 · 14:30',
      plan:'Reabilitação posterior direita',
      procedure:'Tratamento endodôntico',
      tooth:'16',
      session:'Sessão 1 de 2',
      materials:'Limas rotatórias, hipoclorito 2,5%, EDTA',
      anesthetic:'Articaína 4% com epinefrina',
      events:'Nenhuma intercorrência',
      next:'Obturação dos canais em 12/08/2026',
      guidance:'Evitar mastigação na região por 24 horas e retornar em caso de dor espontânea.'
    },
    planning:{
      eyebrow:'Avaliação clínica assinada',
      title:'Avaliação e planejamento reabilitador',
      summary:'Exame clínico e radiográfico da região posterior direita. Identificada necessidade de tratamento endodôntico no elemento 16 e posterior reabilitação protética. Plano apresentado à paciente.',
      status:'Assinada',
      professional:'Dr. Renato Vieira',
      date:'28/07/2026 · 09:10',
      plan:'Reabilitação posterior direita',
      procedure:'Avaliação e planejamento',
      tooth:'16 e 17',
      session:'Consulta diagnóstica',
      materials:'Espelho, sonda, radiografia periapical',
      anesthetic:'Não utilizado',
      events:'Sem intercorrências',
      next:'Iniciar endodontia do elemento 16',
      guidance:'Orientada sobre etapas, custos e necessidade de retorno.'
    },
    draft:{
      eyebrow:'Rascunho não assinado',
      title:'Acompanhamento pós-operatório',
      summary:'Paciente entrou em contato relatando sensibilidade leve ao mastigar. Orientada manutenção da medicação prescrita e observação até a consulta agendada.',
      status:'Rascunho',
      professional:'Dra. Camila Andrade',
      date:'06/08/2026 · 08:20',
      plan:'Reabilitação posterior direita',
      procedure:'Acompanhamento pós-operatório',
      tooth:'16',
      session:'Contato remoto',
      materials:'Não se aplica',
      anesthetic:'Não se aplica',
      events:'Sensibilidade leve relatada',
      next:'Reavaliar na próxima sessão',
      guidance:'Entrar em contato em caso de dor intensa, edema ou febre.'
    }
  };
  qsa('[data-evolution-id]').forEach(btn=>btn.addEventListener('click',()=>{
    qsa('[data-evolution-id]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');
    const d=evolutionData[btn.dataset.evolutionId];if(!d)return;
    Object.entries(d).forEach(([key,value])=>{
      qsa(`[data-evo-${key}]`).forEach(el=>el.textContent=value);
    });
    const badge=qs('[data-evo-status]');
    if(badge){
      badge.className='badge '+(d.status==='Rascunho'?'amber':'green');
    }
  }));

  // Stepper específico do compositor de evolução
  function showComposerStep(root,step){
    root.dataset.composerStep=String(step);
    qsa('[data-composer-panel]',root).forEach(panel=>panel.hidden=Number(panel.dataset.composerPanel)!==step);
    qsa('.composer-step',root).forEach((item,index)=>item.classList.toggle('active',index+1===step));
    const prev=qs('[data-composer-prev]',root),next=qs('[data-composer-next]',root),finish=qs('[data-composer-finish]',root);
    if(prev) prev.hidden=step===1;
    if(next) next.hidden=step===4;
    if(finish) finish.hidden=step!==4;
  }
  qsa('[data-composer]').forEach(root=>{
    showComposerStep(root,1);
    qs('[data-composer-next]',root)?.addEventListener('click',()=>showComposerStep(root,Math.min(4,Number(root.dataset.composerStep||1)+1)));
    qs('[data-composer-prev]',root)?.addEventListener('click',()=>showComposerStep(root,Math.max(1,Number(root.dataset.composerStep||1)-1)));
  });

  // Chips de modelo clínico
  qsa('.template-chips').forEach(group=>qsa('.template-chip',group).forEach(btn=>btn.addEventListener('click',()=>{
    qsa('.template-chip',group).forEach(x=>x.classList.remove('active'));btn.classList.add('active');
  })));
})();
