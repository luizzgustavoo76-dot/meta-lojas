/* ===================== Hoje (encarregado) · Fechamento do mês · Relatório em PDF ===================== */

/* ---------- tela "Hoje" do encarregado ---------- */
function renderHoje(app, doc){
  const {loja, setores}=calc(doc, S.cutoff), ids=meusSetoresIds();
  const meus=setores.filter(s=>ids.includes(s.id));
  const hoje=todayIso(), ult=S.cutoff, prox=diaSeg(ult);
  const nome = S.preview ? '' : (S.perfil?.nome||'').split(' ')[0];
  const h=new Date().getHours(), saud=h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';
  const dowL=k=>DOW_NOME[new Date(k+'T12:00:00').getDay()];
  const cor=p=>p==null?'':({good:'var(--good)',warn:'var(--warn)',bad:'var(--bad)'})[status(p)];
  const card=s=>{
    const dU=s.daily.find(d=>d.k===ult), dP=s.daily.find(d=>d.k===prox), pU=dU&&dU.meta? dU.real/dU.meta : null;
    const falta=Math.max(0,(+s.meta||0)-s.real), nec=loja.diasRest>0? falta/loja.diasRest : 0, pAte=s.metaAte? s.real/s.metaAte : null;
    return `<div class="card hj" style="margin-top:12px" data-sid="${s.id}">
      <div class="row" style="flex-wrap:wrap;gap:6px"><h2 style="margin:0">${esc(s.nome)}</h2><div class="sp"></div><a href="#setor" class="small" data-abre="${s.id}">abrir o setor →</a></div>
      <div class="hj-k">
        <div><span>Venda de ${dowL(ult)} ${fD(ult)}</span><b>${brl0(dU?.real||0)}</b><small>${dU?.meta?`meta ${brl0(dU.meta)} · <b style="color:${cor(pU)}">${pctBR(pU,0)}</b>`:''}</small></div>
        <div><span>Meta de ${dP?`${dowL(prox)} ${fD(prox)}`:'amanhã'}</span><b>${dP?brl0(dP.meta):'—'}</b><small>${loja.diasRest>0?`para fechar o mês: ${brl0(nec)}/dia`:'último dia do mês'}</small></div>
        <div><span>Mês até ${fD(ult)}</span><b style="color:${cor(pAte)}">${pAte!=null?pctBR(pAte,0):'—'}</b><small>da meta até a data · falta ${brl0(falta)} no mês</small></div>
        <div><span>Perda no mês</span><b>${brl0(s.perda)}</b><small class="hj-teto">${s.real?pctBR(s.perda/s.real,2)+' da venda':''}</small></div>
      </div>
      <div class="hj-2">
        <div><div class="hj-t">📝 Plano de ação</div><div class="hj-acoes small muted">carregando…</div></div>
        <div><div class="hj-t">🗑️ O que mais perdeu em ${fD(ult)}</div><div class="hj-perdas small muted">carregando…</div></div>
      </div></div>`;
  };
  app.innerHTML=`<div style="margin-bottom:4px"><h1 style="margin:0">${saud}${nome?', '+esc(nome):''}!</h1>
      <p class="sub" style="margin:2px 0 0">${fDateL(hoje)} · números lançados até <b>${fD(ult)}</b></p></div>
    <div id="hjAvisos"></div>
    ${meus.length? meus.map(card).join('') : '<div class="card empty" style="margin-top:12px">Nenhum setor liberado para você ainda.</div>'}`;
  app.querySelectorAll('[data-abre]').forEach(a=>a.onclick=e=>{ e.preventDefault(); S.setorSel=a.dataset.abre; S.setorAba='dia'; location.hash='#setor'; });
  carregarTetos().then(t=>{ for(const s of meus){ const el=app.querySelector(`.hj[data-sid="${s.id}"] .hj-teto`); if(el && t[s.id]!=null && s.real){ const sm=semaforo(s.perda/s.real*100, t[s.id]); el.innerHTML=`${pctBR(s.perda/s.real,2)} da venda · teto ${t[s.id].toLocaleString('pt-BR')}% ${sm.ico}`; } } }).catch(()=>{});
  let nAtr=0;
  for(const s of meus){
    const box=app.querySelector(`.hj[data-sid="${s.id}"]`);
    carregarAcoes(s.id).then(A=>{ const el=$('.hj-acoes',box); if(!el) return;
      const ab=A.filter(a=>a.status==='aberta').sort((a,b)=>(a.prazo||'9999').localeCompare(b.prazo||'9999'));
      const lim=isoOf(new Date(new Date(hoje+'T12:00:00').getTime()+3*864e5));
      const tag=a=> !a.prazo? '' : a.prazo<hoje? `<span class="hj-tag bad">atrasada (${fD(a.prazo)})</span>` : a.prazo===hoje? '<span class="hj-tag warn">vence hoje</span>' : a.prazo<=lim? `<span class="hj-tag warn">vence ${fD(a.prazo)}</span>` : `<span class="muted">até ${fD(a.prazo)}</span>`;
      nAtr+=ab.filter(a=>a.prazo&&a.prazo<hoje).length; avisoAtrasadas(nAtr);
      el.classList.remove('muted');
      el.innerHTML= ab.length? `<div class="dsm-pl">${ab.slice(0,5).map(a=>`<div><span><b>${esc(cap1(a.descricao||a.codigo))}</b><span class="muted" style="display:block">${esc(a.acao)}${a.responsavel?` · ${esc(a.responsavel)}`:''}</span></span><span></span><span style="text-align:right">${tag(a)}</span></div>`).join('')}</div>${ab.length>5?`<a href="#setor" class="small" data-per="${s.id}">ver todas as ${ab.length} →</a>`:''}`
        : '<span class="muted">Nenhuma ação em aberto. 👍</span>';
      el.querySelectorAll('[data-per]').forEach(x=>x.onclick=e=>{ e.preventDefault(); S.setorSel=s.id; S.setorAba='per'; location.hash='#setor'; });
    }).catch(()=>{ const el=$('.hj-acoes',box); if(el) el.textContent='—'; });
    itensPerdaDoDia(s.id, ult).then(it=>{ const el=$('.hj-perdas',box); if(!el) return;
      if(!it){ el.innerHTML=`O relatório de perdas só de ${fD(ult)} ainda não foi importado.`; return; }
      const ls=it.filter(i=>i.val>0.009).sort((a,b)=>b.val-a.val).slice(0,5);
      el.classList.remove('muted');
      el.innerHTML= ls.length? `<div class="dsm-pl">${ls.map(i=>`<div><span>${esc(cap1(i.d))}</span><span class="muted">${qtBR(i.q)}</span><b>${brl(i.val)}</b></div>`).join('')}</div>` : '<span class="muted">Nenhuma perda nesse dia. 👍</span>';
    }).catch(()=>{ const el=$('.hj-perdas',box); if(el) el.textContent='—'; });
  }
  function avisoAtrasadas(n){ const b=$('#hjAvisos'); if(b) b.innerHTML= n? `<div class="note err" style="margin-top:10px">⚠️ Você tem <b>${n} ação(ões) atrasada(s)</b> no plano de ação. Veja abaixo.</div>` : ''; }
}

/* ---------- fechamento do mês ---------- */
function bannerFechamento(doc){
  if(!S.gerente || !doc) return '';
  const ult=diasDoMes(doc.mes).slice(-1)[0], hoje=todayIso();
  if(!(S.cutoff===ult || (hoje>=ult && S.cutoff>=diaAnt(ult)))) return '';
  return `<div class="note" style="margin-bottom:12px">📋 ${S.cutoff===ult?`O mês de ${mesLabel(doc.mes)} fechou.`:`${mesLabel(doc.mes)} está fechando.`} <a href="#fechamento"><b>Ver o fechamento do mês</b></a> e guardar para comparar com os próximos.</div>`;
}
async function montarFechamento(doc){
  const mes=doc.mes, ini=mes+'-01', ult=diasDoMes(mes).slice(-1)[0], ate=S.cutoff&&S.cutoff.startsWith(mes)? S.cutoff : ult;
  const mp=mesAnterior(mes,1), [y,m]=mes.split('-'), ma=`${+y-1}-${m}`;
  await Promise.all([garantirMes(mp).catch(()=>{}), garantirMes(ma).catch(()=>{})]);
  const [tetos, trc, per, acs]=await Promise.all([
    carregarTetos().catch(()=>({})),
    q(S.sb.from('analise_trocas').select('setor_id,periodo_fim,custo').eq('periodo_inicio',ini).lte('periodo_fim',ate)).catch(()=>[]),
    q(S.sb.from('analise_perdas').select('setor_id,periodo_inicio,periodo_fim,dados').eq('periodo_inicio',ini).lte('periodo_fim',ate)).catch(()=>[]),
    q(S.sb.from('acoes_perda').select('*').gte('criado_em',ini).lte('criado_em',fimDoMes(mes)+'T23:59:59')).catch(()=>[]) ]);
  const ultPor=(rows)=>{ const o={}; for(const r of rows) if(!o[r.setor_id] || r.periodo_fim>o[r.setor_id].periodo_fim) o[r.setor_id]=r; return o; };
  const T=ultPor(trc), P=ultPor(per);
  const {loja, setores}=calc(doc, ate), dia=+ate.slice(8);
  const ref=(mm)=> S.months[mm]? calc(S.months[mm], mesmoDiaEm(mm, dia)) : null;
  const RP=ref(mp), RA=ref(ma);
  const st=setores.map(s=>{ const p=RP?.setores.find(x=>x.id===s.id), a=RA?.setores.find(x=>x.id===s.id), teto=tetos[s.id]??null, pp=s.real? s.perda/s.real : null;
    return { id:s.id, nome:s.nome, meta:+s.meta||0, metaAte:s.metaAte, real:s.real, pMes:s.meta? s.real/s.meta : null, pAte:s.metaAte? s.real/s.metaAte : null,
      perda:s.perda, pPerda:pp, teto, sit: teto==null||pp==null? 'sem teto' : pp*100>teto? 'acima' : pp*100>teto*0.8? 'perto' : 'dentro',
      trocas: T[s.id]? +T[s.id].custo||0 : null,
      realPm:p?.real||null, pPerdaPm: p&&p.real? p.perda/p.real : null, realPa:a?.real||null }; });
  const acoes=acs.map(a=>{ const r=P[a.setor_id]; let agora=null;
    if(r){ const n=Math.round((new Date(r.periodo_fim)-new Date(r.periodo_inicio))/864e5)+1; const it=(r.dados?.secoes||[]).flatMap(x=>x.itens||[]).filter(i=>String(i.c)===String(a.codigo)); agora= n? it.reduce((s,i)=>s+(+i.val||0),0)/n : null; }
    return { setor:nomeSetor(a.setor_id), produto:cap1(a.descricao||a.codigo), acao:a.acao, resp:a.responsavel||'', status:a.status, antes:a.perda_dia_ref!=null? +a.perda_dia_ref : null, agora }; });
  const trocasLoja=Object.values(T).reduce((s,r)=>s+(+r.custo||0),0);
  return { mes, ate, ult, completo: ate===ult, diasRest:loja.diasRest, mp, ma, geradoEm:new Date().toISOString(),
    loja:{ meta:loja.metaMes, metaAte:loja.metaAte, real:loja.real, pMes:loja.metaMes? loja.real/loja.metaMes : null, pAte:loja.pAte, perda:loja.perda, pPerda:loja.real? loja.perda/loja.real : null,
      trocas: Object.keys(T).length? trocasLoja : null, realPm:RP?.loja.real||null, realPa:RA?.loja.real||null, pPerdaPm: RP&&RP.loja.real? RP.loja.perda/RP.loja.real : null },
    setores:st, acoes };
}
async function renderFechamento(app, doc){
  if(!S.gerente){ app.innerHTML='<div class="card empty">Só o gerente vê o fechamento do mês.</div>'; return; }
  app.innerHTML='<div class="empty"><span class="spin"></span> Montando o fechamento do mês…</div>';
  let F, salvos=[];
  try{ [F, salvos]=await Promise.all([montarFechamento(doc), q(S.sb.from('fechamentos').select('mes,dados,criado_em').order('mes',{ascending:false}).limit(13)).catch(()=>[])]); }
  catch(e){ app.innerHTML=`<div class="note err">Não consegui montar o fechamento: ${esc(e.message||e)}</div>`; return; }
  if(S.view!=='fechamento' || S.mes!==doc.mes) return;
  const salvo=salvos.find(x=>x.mes===F.mes);
  const L=F.loja, cor=p=>p==null?'':({good:'var(--good)',warn:'var(--warn)',bad:'var(--bad)'})[status(p)];
  const sitI={acima:'🔴 acima',perto:'🟡 perto',dentro:'🟢 dentro','sem teto':'—'};
  const varH=(a,b,ruim)=> b? varTxt(a,b,ruim) : '<span class="muted">—</span>';
  const ord=[...F.setores].sort((a,b)=>(b.pAte??-1)-(a.pAte??-1));
  const melhores=ord.filter(s=>s.pAte!=null).slice(0,3), piores=ord.filter(s=>s.pAte!=null).slice(-3).reverse();
  const dPerda=F.setores.filter(s=>s.pPerda!=null&&s.pPerdaPm!=null&&s.perda>0).map(s=>({...s, d:s.pPerda-s.pPerdaPm})).sort((a,b)=>a.d-b.d);
  const melhorouP=dPerda.filter(s=>s.d<-0.001).slice(0,3), piorouP=dPerda.filter(s=>s.d>0.001).slice(-3).reverse();
  const feitas=F.acoes.filter(a=>a.status==='feita'), abertas=F.acoes.filter(a=>a.status==='aberta');
  const linhaS=s=>`<div><span>${esc(s.nome)}</span><span></span><b style="color:${cor(s.pAte)}">${pctBR(s.pAte,0)}</b></div>`;
  const linhaP=s=>`<div><span>${esc(s.nome)}</span><span></span><b style="color:${s.d<0?'var(--good)':'var(--bad)'}">${s.d>0?'+':''}${(s.d*100).toFixed(2).replace('.',',')} p.p.</b></div>`;
  app.innerHTML=`<div class="row" style="align-items:flex-end;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div><h1 style="margin:0">📋 Fechamento de ${mesLabel(F.mes)}</h1><p class="sub" style="margin:2px 0 0">${F.completo?'Mês completo':`<b>Parcial</b> até ${fD(F.ate)} · faltam ${F.diasRest} dia(s)`} · comparação com o mesmo período do mês passado e do ano passado</p></div>
      <div class="sp"></div>
      <button class="btn" id="fcImp">🖨️ <span class="d-inl">Imprimir</span><span class="m-inl">PDF</span></button>
      <button class="btn p" id="fcSalvar">${salvo?'Atualizar o fechamento guardado':'💾 Guardar fechamento'}</button>
    </div>
    ${salvo?`<div class="small muted" style="margin:-6px 0 10px">Guardado em ${new Date(salvo.criado_em).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}.</div>`:''}
    <div class="grid kpis">
      <div class="kpi hero"><div class="l">Venda do mês</div><div class="v fc-hv">${brl0(L.real)}</div><div class="d">${pctBR(L.pMes,1)} da meta de ${brl0(L.meta)}</div></div>
      <div class="kpi"><div class="l">% da meta até ${fD(F.ate)}</div><div class="v" style="color:${cor(L.pAte)}">${pctBR(L.pAte,1)}</div><div class="d">${STXT[status(L.pAte)]}</div></div>
      <div class="kpi"><div class="l">vs. mês passado</div><div class="v">${varH(L.real,L.realPm)}</div><div class="d">${L.realPm?brl0(L.realPm)+' no mesmo período':'sem dados'}</div></div>
      <div class="kpi"><div class="l">vs. ano passado</div><div class="v">${varH(L.real,L.realPa)}</div><div class="d">${L.realPa?brl0(L.realPa)+' no mesmo período':'sem dados'}</div></div>
      <div class="kpi"><div class="l">Perda</div><div class="v">${brl0(L.perda)}</div><div class="d">${pctBR(L.pPerda,2)} da venda${L.pPerdaPm!=null?` · mês passado ${pctBR(L.pPerdaPm,2)}`:''}</div></div>
      <div class="kpi"><div class="l">Trocas</div><div class="v">${L.trocas!=null?brl0(L.trocas):'—'}</div><div class="d">${L.trocas!=null&&L.real?pctBR(L.trocas/L.real,2)+' da venda':'sem relatório de trocas'}</div></div>
    </div>
    <div class="card" style="margin-top:12px"><h2>Setores</h2><div class="fc-wrap"><table class="fc-t ord"><thead><tr><th>Setor</th><th class="n">Meta do mês</th><th class="n">Vendido</th><th class="n">% até a data</th><th class="n m-hide">vs. ano pass.</th><th class="n">Perda</th><th class="n">% venda</th><th class="m-hide">Teto</th><th class="n m-hide">Trocas</th></tr></thead><tbody>
      ${F.setores.map(s=>`<tr><td><b>${esc(s.nome)}</b></td><td class="n">${brl0(s.meta)}</td><td class="n">${brl0(s.real)}</td><td class="n"><b style="color:${cor(s.pAte)}">${pctBR(s.pAte,0)}</b></td><td class="n m-hide">${varH(s.real,s.realPa)}</td><td class="n">${brl0(s.perda)}</td><td class="n">${s.pPerda!=null?pctBR(s.pPerda,2):'—'}</td><td class="m-hide">${sitI[s.sit]}${s.teto!=null?` <span class="muted">(${s.teto.toLocaleString('pt-BR')}%)</span>`:''}</td><td class="n m-hide">${s.trocas!=null?brl0(s.trocas):'—'}</td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="grid two" style="margin-top:12px">
      <div class="card"><h2>🏆 Venda: melhores e piores</h2><div class="fc-2"><div><div class="hj-t">Melhores</div><div class="dsm-pl small">${melhores.map(linhaS).join('')}</div></div><div><div class="hj-t">Mais abaixo</div><div class="dsm-pl small">${piores.map(linhaS).join('')}</div></div></div></div>
      <div class="card"><h2>🗑️ Perda contra o mês passado</h2>${dPerda.length?`<div class="fc-2"><div><div class="hj-t">Melhorou</div><div class="dsm-pl small">${melhorouP.map(linhaP).join('')||'<span class="muted">nenhum</span>'}</div></div><div><div class="hj-t">Piorou</div><div class="dsm-pl small">${piorouP.map(linhaP).join('')||'<span class="muted">nenhum</span>'}</div></div></div><p class="small muted" style="margin:6px 0 0">Diferença na % da venda, no mesmo período do mês passado.</p>`:'<p class="small muted">Sem dados do mês passado para comparar.</p>'}</div>
    </div>
    <div class="card" style="margin-top:12px"><h2>📝 Plano de ação do mês</h2>
      <p class="small" style="margin:0 0 8px"><b>${F.acoes.length}</b> ação(ões) criada(s) · <b style="color:var(--good)">${feitas.length} feita(s)</b> · ${abertas.length} em aberto${F.acoes.length-feitas.length-abertas.length?` · ${F.acoes.length-feitas.length-abertas.length} cancelada(s)`:''}</p>
      ${F.acoes.length?`<div class="dsm-pl small">${F.acoes.map(a=>`<div><span><b>${esc(a.produto)}</b> <span class="muted">${esc(a.setor)}</span><span class="muted" style="display:block">${esc(a.acao)}${a.resp?' · '+esc(a.resp):''}</span></span><span class="muted">${a.antes!=null&&a.agora!=null?`${brl0(a.antes)}/dia → ${brl0(a.agora)}/dia ${a.agora<a.antes?'<b style="color:var(--good)">▼</b>':'<b style="color:var(--bad)">▲</b>'}`:''}</span><b style="color:${a.status==='feita'?'var(--good)':a.status==='aberta'?'var(--warn)':'var(--muted)'}">${a.status}</b></div>`).join('')}</div>`:'<p class="small muted">Nenhuma ação criada neste mês.</p>'}
    </div>
    <div class="card" style="margin-top:12px"><h2>📚 Fechamentos guardados</h2>
      ${salvos.length||true?`<div class="fc-wrap"><table class="fc-t ord"><thead><tr><th>Mês</th><th class="n">Vendido</th><th class="n">% da meta</th><th class="n">Perda</th><th class="n">% venda</th><th class="n m-hide">Trocas</th><th class="m-hide">Guardado em</th></tr></thead><tbody>
        ${[...(salvo?[]:[{mes:F.mes, dados:F, criado_em:null}]), ...salvos].map(x=>{ const l=x.dados.loja; return `<tr ${x.mes===F.mes?'class="fc-atual"':''}><td><b>${mesLabel(x.mes)}</b>${x.dados.completo?'':` <span class="muted small">(até ${fD(x.dados.ate)})</span>`}</td><td class="n">${brl0(l.real)}</td><td class="n">${pctBR(l.pMes,1)}</td><td class="n">${brl0(l.perda)}</td><td class="n">${pctBR(l.pPerda,2)}</td><td class="n m-hide">${l.trocas!=null?brl0(l.trocas):'—'}</td><td class="m-hide small muted">${x.criado_em?new Date(x.criado_em).toLocaleDateString('pt-BR'):'ainda não guardado'}</td></tr>`; }).join('')}
      </tbody></table></div>`:''}
      <p class="small muted" style="margin:6px 0 0">O fechamento guardado é uma fotografia do mês: mesmo que os números mudem depois, ele fica como estava no dia em que foi guardado.</p>
    </div>`;
  $('#fcSalvar').onclick=async()=>{ const b=$('#fcSalvar'); b.disabled=true;
    try{ await q(S.sb.from('fechamentos').upsert({mes:F.mes, dados:F, criado_por:S.user.id, criado_em:new Date().toISOString()})); toast('Fechamento guardado ✔'); renderFechamento(app, doc); }
    catch(e){ toast('Não consegui guardar: '+(e.message||e), 6000); b.disabled=false; } };
  $('#fcImp').onclick=()=>imprimirRelatorio(relFechamento(F));
}
function relFechamento(F){
  const L=F.loja, v=(a,b)=> b? `${a>=b?'+':''}${pctBR(a/b-1,1)}` : '—';
  return { arquivo:`fechamento-${F.mes}`, titulo:`Fechamento de ${mesLabel(F.mes)}`, sub:`${F.completo?'Mês completo':`Parcial até ${fD(F.ate)}`} · impresso em ${fD(todayIso())}`,
    kpis:[['Venda do mês', brl0(L.real), `${pctBR(L.pMes,1)} da meta de ${brl0(L.meta)}`], ['% da meta até a data', pctBR(L.pAte,1), `vs. ano passado ${v(L.real,L.realPa)}`], ['Perda', brl0(L.perda), `${pctBR(L.pPerda,2)} da venda`], ['Trocas', L.trocas!=null?brl0(L.trocas):'—', L.trocas!=null&&L.real?`${pctBR(L.trocas/L.real,2)} da venda`:'']],
    secoes:[
      { titulo:'Setores', cols:[['Setor',100,'l'],['Meta',62,'r'],['Vendido',62,'r'],['% data',40,'r'],['vs. ano',44,'r'],['Perda',56,'r'],['% venda',42,'r'],['Teto',34,'r'],['Trocas',0,'r']],
        rows:F.setores.map(s=>[s.nome, brl0(s.meta), brl0(s.real), pctBR(s.pAte,0), v(s.real,s.realPa), brl0(s.perda), s.pPerda!=null?pctBR(s.pPerda,2):'—', s.teto!=null?s.teto.toLocaleString('pt-BR')+'%':'—', s.trocas!=null?brl0(s.trocas):'—']) },
      { titulo:'Plano de ação do mês', cols:[['Produto',120,'l'],['Setor',70,'l'],['Ação',170,'l'],['Antes → agora (por dia)',90,'r'],['Situação',0,'l']],
        rows:F.acoes.map(a=>[a.produto, a.setor, a.acao, a.antes!=null&&a.agora!=null?`${brl0(a.antes)} → ${brl0(a.agora)}`:'', a.status]), vazio:'Nenhuma ação criada neste mês.' } ] };
}

/* ---------- relatório genérico: imprimir (computador) ou PDF (celular) ---------- */
function imprimirRelatorio(R){
  if(usarPdfFolha()) return pdfRelatorio(R);
  const html=`<div class="fi"><div class="fi-h"><div><div class="fi-loja">Bom Dia São Luiz · Araruna</div><h1>${esc(R.titulo)}</h1><div class="fi-sub">${esc(R.sub)}</div></div><img src="logo.png" alt=""></div>
    <div class="fi-k">${R.kpis.map(k=>`<div><span>${esc(k[0])}</span><b>${esc(k[1])}</b><small>${esc(k[2]||'')||'&nbsp;'}</small></div>`).join('')}</div>
    ${R.secoes.map(s=>`<h2>${esc(s.titulo)}</h2>${s.rows.length?`<table><thead><tr>${s.cols.map(c=>`<th class="${c[2]==='r'?'n':''}">${esc(c[0])}</th>`).join('')}</tr></thead><tbody>${s.rows.map(r=>`<tr>${r.map((x,i)=>`<td class="${s.cols[i][2]==='r'?'n':''}">${esc(String(x??''))}</td>`).join('')}</tr>`).join('')}</tbody></table>`:`<p class="fi-vazio">${esc(s.vazio||'—')}</p>`}`).join('')}</div>`;
  let el=document.getElementById('folhaImp'); if(!el){ el=document.createElement('div'); el.id='folhaImp'; document.body.appendChild(el); }
  el.innerHTML=html; document.body.classList.add('imprimindo');
  const fim=()=>{ document.body.classList.remove('imprimindo'); window.removeEventListener('afterprint', fim); }; window.addEventListener('afterprint', fim);
  const img=el.querySelector('img'), vai=()=>setTimeout(()=>window.print(),50); if(img && !img.complete){ img.onload=vai; img.onerror=vai; } else vai();
}
async function gerarPdfRelatorio(R){
  const {PDFDocument, StandardFonts, rgb}=window.PDFLib;
  const pdf=await PDFDocument.create(), R0=await pdf.embedFont(StandardFonts.Helvetica), B=await pdf.embedFont(StandardFonts.HelveticaBold);
  const W=595.28, H=841.89, M=32, cinza=rgb(.33,.33,.33), linha=rgb(.8,.8,.8), preto=rgb(.07,.07,.07), verm=rgb(.84,.12,.15);
  let png=null; try{ png=await pdf.embedPng(await (await fetch('logo.png')).arrayBuffer()); }catch(_){ }
  let pg, y;
  const safe=(t,f)=>{ let o=''; for(const ch of String(t??'').replace(/≈/g,'~').replace(/→/g,'->').replace(/[▲]/g,'+').replace(/[▼]/g,'-').replace(/[   ]/g,' ')){ try{ f.widthOfTextAtSize(ch,10); o+=ch; }catch(_){ o+=''; } } return o; };
  const fit=(t,f,z,w)=>{ t=safe(t,f); if(f.widthOfTextAtSize(t,z)<=w) return t; while(t.length>1 && f.widthOfTextAtSize(t+'…',z)>w) t=t.slice(0,-1); return t+'…'; };
  const txt=(t,x,yy,{f=R0,z=10,c=preto,w=null,dir='l'}={})=>{ const s=w? fit(t,f,z,w) : safe(t,f); const tw=f.widthOfTextAtSize(s,z); pg.drawText(s,{x:dir==='r'?x-tw:x, y:yy, size:z, font:f, color:c}); };
  const hl=(yy,x1=M,x2=W-M,t=.6,c=linha)=>pg.drawLine({start:{x:x1,y:yy},end:{x:x2,y:yy},thickness:t,color:c});
  const novaPag=(primeira)=>{ pg=pdf.addPage([W,H]); y=H-M;
    if(primeira){ if(png){ const h=46, w=png.width/png.height*h; pg.drawImage(png,{x:W-M-w,y:y-h,width:w,height:h}); }
      txt('Bom Dia São Luiz · Araruna', M, y-9, {z:9,c:cinza}); txt(R.titulo, M, y-29, {f:B,z:18}); txt(R.sub, M, y-43, {z:9,c:cinza}); y-=54; hl(y,M,W-M,2.5,verm); y-=8; }
    else { txt(R.titulo+' (continuação)', M, y-10, {f:B,z:11,c:cinza}); y-=22; } };
  novaPag(true);
  if(R.kpis?.length){ const n=R.kpis.length, kw=(W-2*M-6*(n-1))/n;
    R.kpis.forEach((k,i)=>{ const x=M+i*(kw+6); pg.drawRectangle({x,y:y-46,width:kw,height:46,borderColor:rgb(.7,.7,.7),borderWidth:.8}); txt(k[0],x+6,y-12,{z:8,c:cinza,w:kw-12}); txt(k[1],x+6,y-29,{f:B,z:14,w:kw-12}); if(k[2]) txt(k[2],x+6,y-40,{z:8,c:cinza,w:kw-12}); });
    y-=62; }
  for(const s of R.secoes){
    if(y<M+60) novaPag(false);
    txt(s.titulo, M, y, {f:B,z:12}); y-=14;
    if(!s.rows.length){ txt(s.vazio||'—', M, y, {z:9,c:cinza}); y-=20; continue; }
    const xs=[]; let cx=M; s.cols.forEach(c=>{ xs.push(cx); cx+=c[1]+6; }); const ultW=W-M-xs[xs.length-1];
    const cel=(i,t,yy,o={})=>{ const c=s.cols[i], w=c[1]||ultW; txt(t, c[2]==='r'? xs[i]+w : xs[i], yy, {...o, w, dir:c[2]}); };
    const cab=()=>{ s.cols.forEach((c,i)=>cel(i,c[0],y,{f:B,z:8,c:cinza})); y-=4; hl(y,M,W-M,1.2,rgb(.2,.2,.2)); y-=12; };
    cab();
    for(const r of s.rows){ if(y<M+20){ novaPag(false); cab(); } r.forEach((v,i)=>cel(i,String(v??''),y,{z:9})); y-=5; hl(y); y-=12; }
    y-=10;
  }
  return await pdf.save();
}
async function pdfRelatorio(R){
  busy('Montando o PDF…'); let file;
  try{ await carregarPdfLib(); const bytes=await gerarPdfRelatorio(R); file=new File([bytes], `${R.arquivo||'relatorio'}.pdf`, {type:'application/pdf'}); }
  catch(e){ closeModal(); toast('Não consegui montar o PDF: '+(e.message||e), 6000); return; }
  closeModal(); mostrarPdfPronto(file, R.titulo);
}
function mostrarPdfPronto(file, titulo){
  const url=URL.createObjectURL(file), podeComp = navigator.canShare && navigator.canShare({files:[file]});
  const m=modal(`<h2>🖨️ ${esc(titulo)}</h2><p class="small" style="margin:0 0 10px">O PDF está pronto.</p>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${podeComp?`<button class="btn p" id="fpShare">📤 Imprimir ou enviar</button><p class="small muted" style="margin:-2px 0 2px">Abre o menu do celular: escolha <b>Imprimir</b>, ou mande pelo WhatsApp.</p>`:''}
      <a class="btn ${podeComp?'':'p'}" id="fpAbrir" href="${url}" target="_blank" rel="noopener" download="${esc(file.name)}" style="text-align:center;text-decoration:none">📄 Abrir / baixar o PDF</a>
    </div><div class="row" style="margin-top:12px"><div class="sp"></div><button class="btn" id="mN">Fechar</button></div>`);
  $('#mN',m).onclick=()=>{ closeModal(); setTimeout(()=>URL.revokeObjectURL(url),60000); };
  const sh=$('#fpShare',m); if(sh) sh.onclick=async()=>{ try{ await navigator.share({files:[file], title:titulo}); }catch(e){ if(e.name!=='AbortError') toast('Não deu para compartilhar: '+e.message,5000); } };
}

/* ---------- PDF "foto da tela": exporta a análise do jeito que aparece no site ----------
   Monta uma cópia da tela num quadro de largura fixa (layout de computador, também no celular),
   corta em páginas A4 sem partir linhas/cartões no meio e junta num PDF para compartilhar. */
let _h2iCarregando=null;
function carregarHtmlToImage(){
  if(window.htmlToImage) return Promise.resolve();
  return _h2iCarregando || (_h2iCarregando=new Promise((ok,err)=>{ const s=document.createElement('script'); s.src='vendor/html-to-image.js'; s.onload=ok; s.onerror=()=>{ _h2iCarregando=null; err(new Error('não carregou o gerador do PDF')); }; document.head.appendChild(s); }));
}
async function pdfDaTela(el, R){
  /* R: {arquivo, titulo, sub, tirar:'seletores css a esconder', preparar:fn(copia)} */
  const aviso=modal(`<h2>📄 Gerando o PDF…</h2><p class="small muted" style="margin:0" id="ptMsg">Montando as páginas, só um instante.</p>`);
  const msg=t=>{ const e=$('#ptMsg',aviso); if(e) e.textContent=t; };
  const LARG=860, fr=document.createElement('iframe');
  try{
    await carregarHtmlToImage();
    fr.style.cssText=`position:fixed;left:-20000px;top:0;width:${LARG}px;height:1400px;border:0;visibility:hidden`;
    document.body.appendChild(fr);
    const d=fr.contentDocument, estilos=[...document.querySelectorAll('link[rel=stylesheet],style')].map(n=>n.outerHTML.replace(/href="(?!https?:)([^"]+)"/, (_,h)=>`href="${new URL(h,location.href).href}"`)).join('');
    d.open(); d.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=${LARG}">${estilos}<style>
      html,body{background:#fff!important;margin:0} #ptW{width:${LARG}px;overflow:hidden;background:#fff} #pt{padding:22px 26px 10px;box-sizing:border-box;width:${LARG}px}
      .pt-cab{display:flex;align-items:center;gap:14px;border-bottom:3px solid #d71920;padding-bottom:10px;margin-bottom:14px}
      .pt-cab img{height:54px} .pt-cab .l{font-size:12px;color:#666} .pt-cab h1{margin:2px 0 2px;font-size:24px} .pt-cab .s{font-size:12.5px;color:#555}
      .pt-esc{display:none!important} *{animation:none!important;transition:none!important}
    </style></head><body class="${esc(document.body.className.replace(/\bimprimindo\b/,''))}"><div id="ptW"><div id="pt">
      <div class="pt-cab"><div style="flex:1"><div class="l">Bom Dia São Luiz · Araruna</div><h1>${esc(R.titulo)}</h1><div class="s">${esc(R.sub||'')}</div></div><img src="${new URL('logo.png',location.href).href}" alt=""></div>
    </div></div></body></html>`); d.close();
    const pt=d.getElementById('pt'), copia=el.cloneNode(true);
    copia.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
    if(R.tirar) copia.querySelectorAll(R.tirar).forEach(n=>n.classList.add('pt-esc'));
    copia.querySelectorAll('details').forEach(n=>n.open=true);
    if(R.preparar) R.preparar(copia);
    pt.appendChild(d.importNode(copia,true));
    await new Promise(r=>{ let pend=[...d.querySelectorAll('link[rel=stylesheet],img')].filter(n=>!(n.tagName==='IMG'&&n.complete)); if(!pend.length) return r(); let k=pend.length; const um=()=>{ if(--k<=0) r(); }; pend.forEach(n=>{ n.addEventListener('load',um,{once:true}); n.addEventListener('error',um,{once:true}); }); setTimeout(r,4000); });
    try{ await d.fonts.ready; }catch(_){ }
    await new Promise(r=>setTimeout(r,120));

    /* onde dá para quebrar a página: fim de cada linha, item, cartão ou título */
    const topo=pt.getBoundingClientRect().top, altura=Math.ceil(pt.scrollHeight);
    const pegar=sel=>{ const c=new Set([altura]); pt.querySelectorAll(sel).forEach(n=>{ const b=n.getBoundingClientRect(); if(b.height>0){ c.add(Math.round(b.bottom-topo)); c.add(Math.round(b.top-topo)); } }); return [...c].filter(v=>v>0&&v<=altura).sort((a,b)=>a-b); };
    const fortes=pegar('.pp-i, tr, .card, h2, h3, .kpis, .kpi, .pt-cab, table, .note'), fracos=pegar('.row, p, li, .small, div');
    const W=595.28, H=841.89, M=18, esc_=(W-2*M)/LARG, utilPx=Math.floor((H-2*M-12)/esc_);
    const paginas=[]; let y0=0;
    while(y0<altura-4){ const lim=y0+utilPx; let y1=lim>=altura? altura : (fortes.filter(v=>v>y0+utilPx*0.6 && v<=lim).pop() || fracos.filter(v=>v>y0+utilPx*0.45 && v<=lim).pop() || lim); paginas.push([y0,y1]); y0=y1; }

    const {PDFDocument, StandardFonts, rgb}=window.PDFLib;
    const pdf=await PDFDocument.create(), F=await pdf.embedFont(StandardFonts.Helvetica);
    const wrap=d.getElementById('ptW'), fontCss=await htmlToImage.getFontEmbedCSS(wrap).catch(()=>'');
    const pr=Math.min(2, window.devicePixelRatio>1?2:1.6);
    for(let i=0;i<paginas.length;i++){
      const [a,b]=paginas[i]; msg(`Página ${i+1} de ${paginas.length}…`);
      wrap.style.height=(b-a)+'px'; pt.style.marginTop=(-a)+'px';
      const cv=await htmlToImage.toCanvas(wrap,{pixelRatio:pr, backgroundColor:'#fff', width:LARG, height:b-a, fontEmbedCSS:fontCss, cacheBust:false});
      const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',0.9));
      const img=await pdf.embedJpg(await blob.arrayBuffer());
      const pg=pdf.addPage([W,H]), h=(b-a)*esc_;
      pg.drawImage(img,{x:M, y:H-M-h, width:W-2*M, height:h});
      const rod=`${R.titulo} · página ${i+1} de ${paginas.length}`.replace(/[—–]/g,'-').replace(/[^\x20-\xff]/g,'');
      pg.drawText(rod,{x:W-M-F.widthOfTextAtSize(rod,7.5), y:M-6, size:7.5, font:F, color:rgb(.45,.45,.45)});
    }
    const bytes=await pdf.save(), nome=(R.arquivo||'relatorio').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\w-]+/g,'-')+'.pdf';
    const file=new File([bytes], nome, {type:'application/pdf'});
    fr.remove(); closeModal(); mostrarPdfPronto(file, R.titulo);
  }catch(e){ fr.remove(); closeModal(); toast('Não deu para gerar o PDF: '+e.message, 6000); console.error(e); }
}
