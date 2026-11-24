/* ===================== datas especiais (feriados e datas comerciais) ===================== */
async function carregarDatas(){
  try{ const r=await q(S.sb.from('datas_especiais').select('data,nome,tipo').order('data')); S.datas=new Map(r.map(x=>[x.data,x])); }catch(e){ S.datas=new Map(); }
}
const ICO_DATA = { feriado:'🎉', comercial:'🛍️', local:'📍' };
function marcaData(k){ const d=S.datas?.get(k); return d ? ` <span class="dt-esp" title="${esc(d.nome)}">${ICO_DATA[d.tipo]||'🎉'} ${esc(d.nome)}</span>` : ''; }
function datasNoPeriodo(ini, fim){ const out=[]; if(!S.datas) return out; for(const [k,d] of S.datas){ if(k>=ini && k<=fim) out.push({...d, k}); } return out; }
const listaDatasTxt = ds => ds.map(d=>`${esc(d.nome)} (${fDateL(d.k)})`).join(', ');
function notaDatas(ini, fim, refs){ // refs: [{rot, ini, fim}]
  const atual=datasNoPeriodo(ini,fim); const outros=refs.filter(r=>r.ini).map(r=>({...r, ds:datasNoPeriodo(r.ini,r.fim)}));
  const nomesA=atual.map(d=>d.nome).sort().join('|'); const diferentes=outros.filter(o=>o.ds.map(d=>d.nome).sort().join('|')!==nomesA || o.ds.some(d=>{ const a=atual.find(x=>x.nome===d.nome); return a && pDate(a.k).getDay()!==pDate(d.k).getDay(); }));
  if(!atual.length && !outros.some(o=>o.ds.length)) return '';
  return `<div class="note small" style="margin-top:8px">📅 <b>Datas especiais no período</b> — agora: ${atual.length?listaDatasTxt(atual):'nenhuma'}${outros.map(o=>`; ${o.rot}: ${o.ds.length?listaDatasTxt(o.ds):'nenhuma'}`).join('')}.${diferentes.length?' <b style="color:var(--warn)">Os períodos não têm as mesmas datas — leve isso em conta na comparação.</b>':''}</div>`;
}
function cardDatasEspeciais(doc){
  const dias=diasDoMes(doc.mes); const ds=datasNoPeriodo(dias[0], dias[dias.length-1]);
  return `<div class="card" style="margin-top:12px"><h2>📅 Datas especiais de ${mesLabel(doc.mes)}</h2>
    <p class="small muted" style="margin-top:-4px">Feriados e datas comerciais aparecem no dia a dia e nos comparativos, para explicar diferenças de venda. Inclua as datas da cidade (aniversário de Araruna, festas, pagamento da prefeitura…).</p>
    <div class="tw"><table><thead><tr><th>Dia</th><th>Data</th><th>Tipo</th><th></th></tr></thead><tbody>
      ${ds.length?ds.map(d=>`<tr><td>${fDateL(d.k)}</td><td>${ICO_DATA[d.tipo]||''} ${esc(d.nome)}</td><td class="small muted">${d.tipo==='feriado'?'Feriado':d.tipo==='comercial'?'Data comercial':'Data local'}</td><td style="width:40px"><button class="btn" data-dtx="${d.k}" style="padding:2px 8px" title="Remover">✕</button></td></tr>`).join(''):'<tr><td colspan="4" class="muted">Nenhuma data especial neste mês</td></tr>'}
    </tbody></table></div>
    <div class="row" style="margin-top:10px;flex-wrap:wrap;gap:8px;align-items:flex-end">
      <label class="f">Dia<input type="date" id="dtD" value="${dias[0]}" min="${dias[0]}" max="${dias[dias.length-1]}"></label>
      <label class="f" style="flex:1;min-width:180px">Nome<input class="in" id="dtN" placeholder="Ex.: Aniversário de Araruna" style="text-align:left"></label>
      <label class="f">Tipo<select id="dtT"><option value="local">Data local</option><option value="comercial">Data comercial</option><option value="feriado">Feriado</option></select></label>
      <button class="btn p" id="dtAdd">Adicionar</button>
    </div></div>`;
}
function bindDatasEspeciais(host){
  host.querySelectorAll('[data-dtx]').forEach(b=>b.onclick=async()=>{ try{ await q(S.sb.from('datas_especiais').delete().eq('data',b.dataset.dtx)); await carregarDatas(); toast('Data removida'); render(); }catch(e){ toast(e.message,5000); } });
  const add=$('#dtAdd',host); if(add) add.onclick=async()=>{ const data=$('#dtD',host).value, nome=$('#dtN',host).value.trim(), tipo=$('#dtT',host).value;
    if(!data||!nome) return toast('Informe o dia e o nome da data.');
    try{ await q(S.sb.from('datas_especiais').upsert({data,nome,tipo},{onConflict:'data'})); await carregarDatas(); toast('Data salva ✔'); render(); }catch(e){ toast(e.message,5000); } };
}

/* ===================== ranking dos setores (painel do gerente) ===================== */
function cardRanking(doc, setores){
  if(!S.cutoff || setores.length<2) return '';
  const dia=+S.cutoff.slice(8); const [y,m]=doc.mes.split('-'); const ma=`${+y-1}-${m}`; const ly=S.months[ma];
  const cresc = ly ? setores.map(s=>{ const b=numerosAte(ly, mesmoDiaEm(ma,dia), s.id); return {s, v:(b&&b.real)? s.real/b.real-1 : null}; }).filter(x=>x.v!=null) : [];
  const meta = setores.filter(s=>s.pAte!=null).map(s=>({s, v:s.pAte}));
  const perda = setores.filter(s=>s.real>0 && s.perda>0).map(s=>({s, v:s.pPerda})); const semPerda=setores.filter(s=>!(s.perda>0)).length;
  const med=i=>['🥇','🥈','🥉'][i]||`<span class="rk-n">${i+1}º</span>`;
  const col=(tit, sub, lista, fmt, cor)=> `<div class="rk-col"><div class="rk-t">${tit}</div><div class="small muted" style="margin-bottom:6px">${sub}</div>${lista.length?lista.map((x,i)=>`<div class="rk-l ${i>=3&&i<lista.length-3?'rk-meio':''}" data-s="${x.s.id}"><span class="rk-m">${med(i)}</span><span class="rk-nm">${esc(x.s.nome)}</span><b style="color:${cor(x.v)}">${fmt(x.v)}</b></div>`).join(''):'<div class="small muted">sem dados</div>'}${lista.length>6?`<button class="btn m-only rk-todos-b" style="margin-top:6px;width:100%">Ver todos (${lista.length})</button>`:''}</div>`;
  return `<div class="card m-dobra" data-dobra="ranking" style="margin-top:12px"><div class="row m-dobra-h" style="margin-bottom:8px"><h2 style="margin:0">🏆 Ranking dos setores</h2><div class="sp"></div><span class="small muted d-only">até ${fDateL(S.cutoff)} · toque no setor para abrir</span></div>
    <div class="rk-g">
      ${col('% da meta até a data','quem está mais perto da meta', meta.sort((a,b)=>b.v-a.v), v=>pct(v), v=>v>=1?'var(--good)':v>=0.9?'var(--warn)':'var(--bad)')}
      ${col('Crescimento vs. ano passado', ly?`mesmo período de ${mesLabel(ma)}`:'sem o mês do ano passado', cresc.sort((a,b)=>b.v-a.v), v=>`${v>0?'+':''}${pct(v)}`, v=>v>=0?'var(--good)':'var(--bad)')}
      ${col('Menor perda',`% da perda sobre a venda${semPerda?` · ${semPerda} setor(es) sem perda lançada`:''}`, perda.sort((a,b)=>a.v-b.v), v=>pct(v,2), v=>v<=0.01?'var(--good)':v<=0.02?'var(--warn)':'var(--bad)')}
    </div></div>`;
}

/* ===================== metas por departamento ===================== */
async function cardMetasDepartamento(host, doc){
  const box=host.querySelector('#mdBox'); if(!box) return;
  let deps=[], metas=[], anas=[];
  try{ [deps, metas, anas] = await Promise.all([ q(S.sb.from('departamentos').select('codigo,nome,setor_id').order('codigo')), q(S.sb.from('metas_departamento').select('*').eq('mes',doc.mes)), q(S.sb.from('analise_vendas').select('setor_id,periodo_inicio,periodo_fim,dados').order('periodo_fim',{ascending:false}).limit(60)) ]); }
  catch(e){ box.innerHTML=`<div class="note err small">${esc(e.message)}</div>`; return; }
  const setoresCom=[...new Set(deps.filter(d=>d.setor_id).map(d=>d.setor_id))].filter(id=>doc.setores.some(s=>s.id===id));
  if(!setoresCom.length){ box.innerHTML='<p class="small muted">Os departamentos aparecem aqui depois que você importar o primeiro relatório de vendas por produto (aba Análise de vendas do setor).</p>'; return; }
  S.mdSetor = setoresCom.includes(S.mdSetor) ? S.mdSetor : setoresCom[0];
  const sid=S.mdSetor; const sm=doc.setores.find(s=>s.id===sid); const lista=deps.filter(d=>d.setor_id===sid);
  const metaDe=c=>{ const x=metas.find(m=>m.dep_codigo===c); return x? +x.meta : null; };
  // referência para distribuir: venda do mesmo mês do ano passado (relatório do mês) ou o relatório mais recente do setor
  const [y,m]=doc.mes.split('-'); const lyIni=`${+y-1}-${m}-01`;
  const ref = anas.find(a=>a.setor_id===sid && a.periodo_inicio===lyIni) || anas.find(a=>a.setor_id===sid);
  const vendaRef=c=>{ const d=ref?.dados.departamentos.find(x=>x.codigo===c); return d? d.produtos.reduce((a,p)=>a+p.v,0) : 0; };
  box.innerHTML=`<div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:8px">
      <label class="f">Setor<select id="mdSet">${setoresCom.map(id=>`<option value="${id}" ${id===sid?'selected':''}>${esc(nomeSetor(id))}</option>`).join('')}</select></label>
      <div class="small muted" style="padding-bottom:8px">Meta do setor: <b>${brl0(sm?.meta||0)}</b></div><div class="sp"></div>
      ${ref?`<button class="btn" id="mdDist" title="Divide a meta do setor na proporção da venda de cada departamento">Distribuir pela venda ${ref.periodo_inicio===lyIni?'do ano passado':`de ${fD(ref.periodo_inicio)} a ${fD(ref.periodo_fim)}`}</button>`:''}
    </div>
    <div class="tw"><table><thead><tr><th>Departamento</th><th class="n">Referência</th><th class="n" style="width:160px">Meta do mês (R$)</th><th class="n">Part.</th></tr></thead><tbody>
      ${lista.map(d=>`<tr><td><b>${d.codigo}</b> ${esc(cap1(d.nome||''))}</td><td class="n muted">${ref?brl0(vendaRef(d.codigo)):'—'}</td><td><input class="in" data-md="${d.codigo}" value="${metaDe(d.codigo)!=null?nf(metaDe(d.codigo),0):''}" placeholder="—"></td><td class="n" data-mdp="${d.codigo}"></td></tr>`).join('')}
    </tbody><tfoot><tr><td>Soma</td><td></td><td class="n" id="mdSoma"></td><td></td></tr></tfoot></table></div>
    <div class="row" style="margin-top:10px"><div class="small muted" id="mdAviso"></div><div class="sp"></div><button class="btn p" id="mdSalvar">Salvar metas dos departamentos</button></div>`;
  const recalc=()=>{ let s=0; box.querySelectorAll('[data-md]').forEach(i=>s+=parseNum(i.value)||0); box.querySelectorAll('[data-md]').forEach(i=>{ box.querySelector(`[data-mdp="${i.dataset.md}"]`).textContent = s? pct((parseNum(i.value)||0)/s) : '—'; });
    $('#mdSoma',box).textContent=brl0(s); const dif=s-(sm?.meta||0); $('#mdAviso',box).innerHTML = Math.abs(dif)>1 ? `<span style="color:var(--warn)">A soma ${dif>0?'passa':'fica abaixo'} da meta do setor em ${brl0(Math.abs(dif))}.</span>` : (s?'<span style="color:var(--good)">✔ A soma bate com a meta do setor.</span>':''); };
  box.querySelectorAll('[data-md]').forEach(i=>i.oninput=recalc); recalc();
  $('#mdSet',box).onchange=e=>{ S.mdSetor=e.target.value; cardMetasDepartamento(host,doc); };
  const dist=$('#mdDist',box); if(dist) dist.onclick=()=>{ const tot=lista.reduce((a,d)=>a+vendaRef(d.codigo),0); if(!tot) return toast('Sem venda de referência.'); let acc=0; const ins=[...box.querySelectorAll('[data-md]')];
    ins.forEach((i,ix)=>{ const v= ix===ins.length-1 ? (sm.meta-acc) : Math.round(sm.meta*vendaRef(+i.dataset.md)/tot); acc+=v; i.value=nf(v,0); }); recalc(); };
  $('#mdSalvar',box).onclick=async()=>{ const rows=[...box.querySelectorAll('[data-md]')].map(i=>({ mes:doc.mes, dep_codigo:+i.dataset.md, setor_id:sid, meta:round2(parseNum(i.value)||0), atualizado_em:new Date().toISOString() }));
    try{ await q(S.sb.from('metas_departamento').upsert(rows,{onConflict:'mes,dep_codigo'})); toast('Metas dos departamentos salvas ✔'); }catch(e){ toast(e.message,5000); } };
}

/* ===================== tela do encarregado: o que importa hoje ===================== */
function cardHojeEncarregado(doc, loja, s){
  const hoje=todayIso(); const dHoje = doc.dias?.[hoje] ? hoje : loja.proxDia;
  const metaHoje = dHoje ? s.metaProx : 0;
  return `<div class="card hoje-enc" style="margin-bottom:12px">
    <div class="row" style="flex-wrap:wrap;gap:14px;align-items:center">
      <div><div class="small muted">Como estou na meta</div><div style="font-size:26px;font-weight:800;color:${s.pAte>=1?'var(--good)':s.pAte>=0.9?'var(--warn)':'var(--bad)'}">${pct(s.pAte)}</div><div class="small">${s.real>=s.metaAte?'acima':'abaixo'} da meta até ${fDate(S.cutoff)} em ${brl0(Math.abs(s.real-s.metaAte))}</div></div>
      <div class="hoje-sep"></div>
      <div><div class="small muted">Meta de ${dHoje?fDateL(dHoje):'hoje'}</div><div style="font-size:26px;font-weight:800">${brl0(metaHoje)}</div>${dHoje?`<div class="small">${marcaData(dHoje)||'&nbsp;'}</div>`:''}</div>
      <div class="hoje-sep"></div>
      <div><div class="small muted">Para bater o mês</div><div style="font-size:26px;font-weight:800">${brl0(s.necDia)}<span class="small muted" style="font-weight:600">/dia</span></div><div class="small">faltam ${brl0(s.falta)} em ${loja.diasRest} dia(s)</div></div>
    </div>
    <div id="hojeQuedas" style="margin-top:10px"></div>
  </div>`;
}
async function preencherQuedasEncarregado(s){
  const box=$('#hojeQuedas'); if(!box) return;
  try{
    const l=await q(S.sb.from('analise_vendas').select('periodo_inicio,periodo_fim,dados').eq('setor_id',s.id).order('periodo_fim',{ascending:false}).limit(1)); if(!l.length) return;
    const cur=l[0]; const [a0,a1]=periodoComparado(cur.periodo_inicio,cur.periodo_fim,'ano'); const ly=await carregarAnalise(s.id,a0,a1);
    if(!ly || !box.isConnected) return;
    const A=montarAnalise(cur, ly); const quedas=A.deps.flatMap(d=>d.produtos).filter(p=>p.flags.includes('queda')||p.flags.includes('parado')).sort((x,y)=>(x.v-x.vb)-(y.v-y.vb)).slice(0,4);
    if(!quedas.length) return;
    box.innerHTML=`<div class="note small" style="background:var(--bad-bg);border-color:#f1b5b5">📉 <b>O que caiu</b> (${fD(cur.periodo_inicio)} a ${fD(cur.periodo_fim)} vs. ano passado): ${quedas.map(p=>`${esc(p.d)} <b>${p.v?pct(varPct(p.v,p.vb),0):'parou'}</b>`).join(' · ')} — <a href="#" id="hojeVerAna">ver análise</a></div>`;
    $('#hojeVerAna').onclick=e=>{ e.preventDefault(); S.setorAba='ana'; S.anaFil='queda'; render(); };
  }catch(_){ }
}

/* ===================== lançamento do dia pelo relatório de vendas por produto ===================== */
async function lancarPorRelatorio(r, f){
  // 1) grava/atualiza a análise (e o mapa de departamentos) e devolve a venda por setor
  const res = await importarRelatorioVendas(f, S.setorSel||'padaria', { pre:r, lancar:true });
  if(!res) return;
  const { porSetor, ini, fim } = res;
  const mes=fim.slice(0,7);
  if(S.mes!==mes){ if(!S.mesList.includes(mes)) return toast(`O mês ${mesLabel(mes)} não está cadastrado no site. Crie o mês em Metas do mês.`,6000); await trocarMes(mes); }
  const doc=curDoc(); const vendas={}; const avisos=[]; let obs='';
  if(ini===fim){ Object.assign(vendas, porSetor); obs=`Relatório de um dia (${fDate(fim)}): a venda de cada setor foi lançada direto.`; }
  else {
    // acumulado: venda do dia = acumulado do relatório − o que já está lançado nos dias anteriores do período
    const diasAntes=diasDoMes(mes).filter(k=>k>=ini && k<fim);
    for(const [sid,tot] of Object.entries(porSetor)){
      const ja=diasAntes.reduce((a,k)=>a+(+(doc.dias?.[k]?.vendas?.[sid])||0),0);
      const faltam=diasAntes.filter(k=>doc.dias?.[k]?.vendas?.[sid]==null).length;
      vendas[sid]=round2(tot-ja); if(faltam || vendas[sid]<0) avisos.push(sid);
    }
    obs=`Relatório acumulado de ${fDate(ini)} a ${fDate(fim)}: a venda do dia ${fDate(fim)} = acumulado do relatório − o que já está lançado de ${fDate(ini)} a ${fDate(diasAntes[diasAntes.length-1]||ini)}.${avisos.length?' Os setores marcados têm dias anteriores sem lançamento ou deram negativo: confira.':''}`;
  }
  reviewImport({ vendas, perdas:{}, data:fim, avisos, obs, fonte:f.name });
}

/* ===================== cascatas (abrir/fechar linhas de tabela) ===================== */
document.addEventListener('click', e=>{
  const t=e.target.closest('[data-cx]'); if(!t || e.target.closest('button,a,input,select,textarea')) return;
  const tb=t.closest('table'); if(!tb) return; const k=t.dataset.cx; const abrir=!t.classList.contains('cx-open');
  t.classList.toggle('cx-open',abrir);
  if(abrir) tb.querySelectorAll(`[data-cx-of="${k}"]`).forEach(r=>r.classList.remove('hide'));
  else tb.querySelectorAll(`[data-cx-of="${k}"],[data-root="${k}"]`).forEach(r=>{ r.classList.add('hide'); r.classList.remove('cx-open'); });
});

/* ---------- comparativo: dia a dia e setores do dia ---------- */
function dailyDe(doc, cut, sid){ if(!doc) return null; const r=calc(doc,cut); const x= sid ? r.setores.find(z=>z.id===sid) : r.loja; return x? x.daily : null; }
function compDetalheDias(c, campo){
  const mes=c.atual.cut.slice(0,7); const dA=dailyDe(c.doc, c.atual.cut, c.sid);
  const dM=c.pm? dailyDe(S.months[c.mp], c.pm.cut, c.sid) : null, dY=c.pa? dailyDe(S.months[c.ma], c.pa.cut, c.sid) : null;
  const val=(arr,k)=>{ const d=arr?.find(z=>z.k===k); return d? d[campo] : null; };
  const ruim=campo==='perda'; const of=campo==='perda'?'cperda':'cacum';
  const cel=(arr,k,base)=>{ if(!arr) return '<td class="n muted">—</td><td></td>'; const v=val(arr,k); return `<td class="n">${v?brl0(v):'—'}<div class="small muted">${fDateL(k)}</div></td><td class="n">${v&&base!=null?varTxt(base,v,ruim):''}</td>`; };
  let html='';
  for(let d=1; d<=c.dia; d++){ const kA=`${mes}-${String(d).padStart(2,'0')}`; const vA=val(dA,kA);
    html+=`<tr class="cx-det hide" data-cx-of="${of}"><td class="small">${fDateL(kA)}${marcaData(kA)}</td><td class="n">${vA?brl0(vA):'—'}</td>${cel(dM, mesmoDiaEm(c.mp,d), vA)}${cel(dY, mesmoDiaEm(c.ma,d), vA)}</tr>`; }
  return html;
}
function compDetalheSetoresDia(c){
  const rA=calc(c.doc, c.atual.cut).setores; const rM=c.pm?.diaK? calc(S.months[c.mp], c.pm.diaK).setores : null; const rY=c.pa?.diaK? calc(S.months[c.ma], c.pa.diaK).setores : null;
  const dia=(lista,id,k)=> lista?.find(x=>x.id===id)?.daily.find(z=>z.k===k)?.real || 0;
  return rA.map(s=>({s, a:dia(rA,s.id,c.atual.cut), m:rM?dia(rM,s.id,c.pm.diaK):null, y:rY?dia(rY,s.id,c.pa.diaK):null})).sort((x,y)=>y.a-x.a).map(x=>
    `<tr class="cx-det hide" data-cx-of="cdia"><td class="small"><b>${esc(x.s.nome)}</b></td><td class="n">${x.a?brl0(x.a):'—'}</td>${x.m==null?'<td class="n muted">—</td><td></td>':`<td class="n">${x.m?brl0(x.m):'—'}</td><td class="n">${x.m&&x.a?varTxt(x.a,x.m):''}</td>`}${x.y==null?'<td class="n muted">—</td><td></td>':`<td class="n">${x.y?brl0(x.y):'—'}</td><td class="n">${x.y&&x.a?varTxt(x.a,x.y):''}</td>`}</tr>`).join('');
}

/* ---------- painel: setor detalhado abre aqui mesmo ---------- */
function detalheSetorHtml(doc, sid){
  const {loja,setores}=calc(doc,S.cutoff); const s=setores.find(x=>x.id===sid); if(!s) return '';
  const c=comparativos(doc,S.cutoff,sid);
  const dias=s.daily.filter(d=>d.k<=S.cutoff);
  return `<div class="sd-in">
    <div class="row" style="margin-bottom:10px;flex-wrap:wrap;gap:8px"><h2 style="margin:0">${esc(s.nome)} — até ${fDateL(S.cutoff)}</h2><div class="sp"></div><button class="btn" data-abrir-setor="${sid}">Abrir o setor completo →</button><button class="btn" data-fechar-setor>▴ Fechar</button></div>
    <div class="grid kpis">
      <div class="kpi hero"><div class="l">% até a data</div><div class="v">${pct(s.pAte)}</div><div class="d">${STXT[status(s.pAte)]} · ${s.real>=s.metaAte?'+':''}${brl0(s.real-s.metaAte)}</div></div>
      <div class="kpi"><div class="l">Realizado</div><div class="v">${brl0(s.real)}</div><div class="d">Meta até a data ${brl0(s.metaAte)}</div></div>
      <div class="kpi"><div class="l">Meta do mês</div><div class="v">${brl0(s.meta)}</div><div class="d">${pct(s.pMes)} · falta ${brl0(s.falta)}</div>${barH(s.pMes)}</div>
      <div class="kpi"><div class="l">Projeção</div><div class="v">${brl0(s.proj)}</div><div class="d">${pct(s.proj/s.meta)} da meta</div></div>
      <div class="kpi"><div class="l">Precisa vender/dia</div><div class="v">${brl0(s.necDia)}</div><div class="d">Meta de ${loja.proxDia?fDate(loja.proxDia):'—'}: ${brl0(s.metaProx)}</div></div>
      <div class="kpi"><div class="l">Perda</div><div class="v">${brl0(s.perda)}</div><div class="d">${pct(s.pPerda,2)} sobre a venda${s.perdaBal?` · inclui ${brl0(s.perdaBal)} de balanço`:''}</div></div>
      ${kpisComparativos(c)}
    </div>
    ${alertasPainel(doc, loja, [s], true)}
    ${cardComparativos(c, s.nome)}
    <div class="card" style="margin-top:12px"><h2>Dia a dia</h2>${listaDiasCelular(s.daily, S.cutoff, true)}<div class="tw d-only" style="max-height:420px"><table><thead><tr><th>Dia</th><th class="n">Meta</th><th class="n">Realizado</th><th>% atingido</th><th class="n">Acum. real</th><th class="n">% acum.</th><th class="n">Perda</th></tr></thead><tbody>
      ${(()=>{ let am=0,ar=0; return dias.map(d=>{ am+=d.meta; ar+=d.real; return `<tr><td>${fDateL(d.k)}${marcaData(d.k)}</td><td class="n">${brl0(d.meta)}</td><td class="n">${d.real?brl(d.real):'—'}</td><td>${d.real?badge(d.real/d.meta):''}</td><td class="n">${brl0(ar)}</td><td class="n">${pct(ar/(am||1))}</td><td class="n">${d.perda?brl(d.perda):'—'}${d.bal?' 📦':''}</td></tr>`; }).join(''); })()}
    </tbody></table></div></div>
  </div>`;
}
function abrirSetorNoPainel(el, doc, soAbrir){
  const sid=el.dataset.s; const ehTr=el.tagName==='TR';
  const prox=el.nextElementSibling; const aberto = prox && prox.classList.contains('setor-det') && prox.dataset.sid===sid;
  document.querySelectorAll('.setor-det').forEach(x=>x.remove()); document.querySelectorAll('[data-s].sd-aberto').forEach(x=>x.classList.remove('sd-aberto'));
  if(aberto && !soAbrir) return;
  let det;
  if(ehTr){ det=document.createElement('tr'); det.className='setor-det'; det.dataset.sid=sid; det.innerHTML=`<td colspan="${el.children.length}">${detalheSetorHtml(doc,sid)}</td>`; }
  else { det=document.createElement('div'); det.className='setor-det'; det.dataset.sid=sid; det.innerHTML=detalheSetorHtml(doc,sid); }
  el.after(det); el.classList.add('sd-aberto'); ajustarLargura(det); aplicarCelular(det);
  det.querySelector('[data-fechar-setor]').onclick=()=>{ det.remove(); el.classList.remove('sd-aberto'); el.scrollIntoView({block:'center'}); };
  det.querySelector('[data-abrir-setor]').onclick=()=>{ S.setorSel=sid; S.setorAba='dia'; S.painelScroll=window.scrollY; S.voltarPainel=true; location.hash='#setor'; };
}

/* ---------- histórico em cascata: ano → meses → setores ---------- */
function historicoCascata(rows){
  const anos=[...new Set(rows.map(r=>r.k.slice(0,4)))].sort().reverse();
  const anoAtual=anos[0];
  const baseAnt=(r, sid)=>{ const [y,m]=r.k.split('-'); const ant=S.months[`${+y-1}-${m}`]; if(!ant) return null;
    if(r.fechado){ const c=resumoMes(ant); const x= sid ? c.setores.find(z=>z.id===sid) : c.loja; return x?.real||null; }
    const cut=lastSetorDay(r.d)||lastDataDay(r.d); if(!cut) return null; const b=numerosAte(ant, mesmoDiaEm(`${+y-1}-${m}`, +cut.slice(8)), sid); return b?.real||null; };
  const varC=(a,b)=> b ? `<span style="color:${a>=b?'var(--good)':'var(--bad)'};font-weight:700">${a>=b?'+':''}${pct(a/b-1)}</span>` : '—';
  let html=`<div class="tw"><table class="hist-cx"><thead><tr><th>Período</th><th class="n hm">Meta</th><th class="n">Realizado</th><th>% da meta</th><th class="n hm">Diferença</th><th class="n">vs. ano ant.</th><th class="n hm">Perdas</th><th class="hm"></th></tr></thead><tbody>`;
  for(const y of anos){
    const rs=rows.filter(r=>r.k.startsWith(y)).sort((a,b)=>b.k.localeCompare(a.k));
    const metaRef=rs.reduce((a,r)=>a+(r.fechado?r.metaMes:r.c.loja.metaAte),0), real=rs.reduce((a,r)=>a+r.real,0), perda=rs.reduce((a,r)=>a+(r.perda||0),0);
    let ant=0, temAnt=false; for(const r of rs){ const b=baseAnt(r,null); if(b){ ant+=b; temAnt=true; } }
    const aberto = y===anoAtual;
    html+=`<tr class="cx-row cx-ano ${aberto?'cx-open':''}" data-cx="y${y}"><td><span class="cx-chev">▸</span> <b style="font-size:16px">${y}</b> <span class="small muted">${rs.length} mês(es)</span></td><td class="n hm">${brl0(metaRef)}</td><td class="n"><b>${brl0(real)}</b></td><td>${badge(metaRef?real/metaRef:null)}</td><td class="n hm">${brl0(real-metaRef)}</td><td class="n">${temAnt?varC(real,ant):'—'}</td><td class="n hm">${perda?brl0(perda):'—'}</td><td class="hm"></td></tr>`;
    for(const r of rs){
      const b=baseAnt(r,null); const mk=`m${r.k}`;
      html+=`<tr class="cx-row cx-mes ${aberto?'':'hide'}" data-cx="${mk}" data-cx-of="y${y}" data-root="y${y}"><td style="padding-left:28px" class="hist-m"><span class="cx-chev">▸</span> <b class="d-inl">${mesLabel(r.k)}</b><b class="m-inl">${MESES[+r.k.slice(5)-1].slice(0,3).toLowerCase()}/${r.k.slice(2,4)}</b>${r.fechado?'':' <span class="badge b-none">em andamento</span>'}</td><td class="n hm">${brl0(r.metaMes)}</td><td class="n"><b>${brl0(r.real)}</b></td><td>${badge(r.fechado?r.pMes:r.pAte)}</td><td class="n hm">${r.fechado?brl0(r.real-r.metaMes):'—'}</td><td class="n">${varC(r.real,b)}</td><td class="n hm">${r.perda?brl0(r.perda):'—'}</td><td class="hm"><button class="btn" data-open="${r.k}" style="padding:3px 9px" title="Abrir este mês no painel">Painel</button></td></tr>`;
      const sets=[...r.c.setores].sort((a,b)=>b.real-a.real);
      html+=`<tr class="cx-det hide" data-cx-of="${mk}" data-root="y${y}"><td colspan="8" class="hist-sub"><table class="hist-set"><thead><tr><th>Setor</th><th class="n hm">Meta</th><th class="n">Realizado</th><th>% da meta</th><th class="n">vs. ano ant.</th><th class="n hm">Perda</th><th class="n hm">% perda</th></tr></thead><tbody>
        ${sets.map(s=>{ const p=r.fechado?s.pMes:s.pAte; const ba=baseAnt(r,s.id); return `<tr><td><b>${esc(s.nome)}</b></td><td class="n hm">${brl0(r.fechado?s.meta:s.metaAte)}</td><td class="n">${brl0(s.real)}</td><td>${badge(p)}</td><td class="n">${varC(s.real,ba)}</td><td class="n hm">${s.perda?brl0(s.perda):'—'}</td><td class="n hm">${s.perda&&s.real?pct(s.perda/s.real,2):'—'}</td></tr>`; }).join('')}
      </tbody></table></td></tr>`;
    }
  }
  return html+'</tbody></table></div>';
}

/* conteúdo aberto dentro de uma linha de tabela fica da largura da tela (não estica a tabela) */
function ajustarLargura(det){ const tw=det.closest('.tw'); const inn=det.querySelector('.sd-in,.bx-in'); if(tw && inn){ inn.style.width=(tw.clientWidth-6)+'px'; inn.style.position='sticky'; inn.style.left='0'; inn.style.boxSizing='border-box'; } }
window.addEventListener('resize',()=>document.querySelectorAll('tr.setor-det,tr.bx-det').forEach(ajustarLargura));
/* ---------- balanços: abrir em cascata ---------- */
function alternarBalancoInline(tr, b){
  const prox=tr.nextElementSibling;
  if(prox && prox.classList.contains('bx-det')){ prox.remove(); tr.classList.remove('sd-aberto'); return; }
  const det=document.createElement('tr'); det.className='bx-det'; det.innerHTML=`<td colspan="${tr.children.length}"></td>`;
  tr.after(det); tr.classList.add('sd-aberto'); abrirBalanco(b, det.firstElementChild).then(()=>ajustarLargura(det)); ajustarLargura(det);
}
function fecharBalancoInline(alvo){ const tr=alvo.closest('tr.bx-det'); tr?.previousElementSibling?.classList.remove('sd-aberto'); tr?.remove(); }

/* ===================== DIÁRIAS ===================== */
function renderDiarias(app, doc){
  const di=doc.diarias||{orcamento:0,lancamentos:[]}; const ls=[...(di.lancamentos||[])].sort((a,b)=>b.data.localeCompare(a.data)||(b.id||0)-(a.id||0));
  const teto=+di.orcamento||0, usado=ls.reduce((a,l)=>a+(+l.valor||0),0), saldo=teto-usado;
  const dias=diasDoMes(doc.mes); const hoje=dias.includes(todayIso())?todayIso():dias[dias.length-1];
  const porDia={}; ls.forEach(l=>{ (porDia[l.data]=porDia[l.data]||[]).push(l); });
  const restDias=dias.filter(k=>k>=todayIso()).length;
  app.innerHTML=`
  <div class="row" style="align-items:flex-end;margin-bottom:14px"><div><h1>Diárias — ${mesLabel(doc.mes)}</h1><p class="sub" style="margin:0">Teto do mês, diárias lançadas por dia e quanto ainda pode ser usado.</p></div></div>
  <div class="grid kpis">
    <div class="kpi hero"><div class="l">Saldo disponível</div><div class="v" style="${saldo<0?'color:#ff8a80':''}">${brl0(saldo)}</div><div class="d">${saldo<0?'acima do teto!':restDias?`≈ ${brl0(saldo/restDias)} por dia nos ${restDias} dia(s) que faltam`:'mês encerrado'}</div></div>
    <div class="kpi"><div class="l">Teto do mês</div><div class="row" style="gap:6px;margin-top:4px;flex-wrap:nowrap"><input class="in" id="djTeto" value="${nf(teto,0)}" style="max-width:140px;font-size:18px;font-weight:700"><button class="btn" id="djTetoS">Salvar</button></div><div class="d">valor máximo de diárias</div></div>
    <div class="kpi"><div class="l">Utilizado</div><div class="v">${brl0(usado)}</div><div class="d">${pct(teto?usado/teto:null)} do teto · ${ls.length} diária(s)</div>${barH(teto?usado/teto:0)}</div>
    <div class="kpi"><div class="l">Dias com diária</div><div class="v">${Object.keys(porDia).length}</div><div class="d">média ${brl0(Object.keys(porDia).length?usado/Object.keys(porDia).length:0)} por dia</div></div>
  </div>
  <div class="card" style="margin-top:12px"><h2>＋ Nova diária</h2>
    <div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
      <label class="f">Dia<input type="date" id="djData" value="${S.djData&&dias.includes(S.djData)?S.djData:hoje}" min="${dias[0]}" max="${dias[dias.length-1]}"></label>
      <label class="f" style="width:150px">Valor (R$)<input class="in" id="djValor" inputmode="decimal" placeholder="0,00"></label>
      <label class="f" style="flex:1;min-width:220px">Observação<input id="djObs" placeholder="Ex.: Maria — reposição no açougue" style="border:1px solid var(--line);border-radius:9px;padding:8px 10px"></label>
      <button class="btn p" id="djAdd">Adicionar</button>
    </div>
    <div id="djAviso" class="small" style="margin-top:6px"></div>
  </div>
  <div class="card" style="margin-top:12px"><div class="row" style="margin-bottom:8px"><h2 style="margin:0">Diárias por dia</h2><div class="sp"></div><span class="small muted">clique no dia para abrir ou fechar</span></div>
    ${ls.length?`<div class="tw"><table><thead><tr><th>Dia</th><th class="n">Valor</th><th>Observação</th><th></th></tr></thead><tbody>
      ${Object.keys(porDia).sort().reverse().map(k=>{ const it=porDia[k]; const tot=it.reduce((a,l)=>a+(+l.valor||0),0); return `<tr class="cx-row cx-open" data-cx="dj${k}"><td><span class="cx-chev">▸</span> <b>${fDateL(k)}</b>${marcaData(k)} <span class="small muted">${it.length} diária(s)</span></td><td class="n"><b>${brl(tot)}</b></td><td></td><td></td></tr>
        ${it.map(l=>`<tr data-cx-of="dj${k}"><td style="padding-left:30px" class="small muted">${fDate(l.data)}</td><td class="n">${brl(+l.valor)}</td><td>${l.obs?esc(l.obs):'<span class="muted">—</span>'}</td><td style="white-space:nowrap;width:1%"><button class="btn" data-dje="${l.id}" style="padding:3px 9px">Editar</button> <button class="btn" data-djx="${l.id}" style="padding:3px 9px;color:var(--bad)" title="Excluir">✕</button></td></tr>`).join('')}`; }).join('')}
    </tbody><tfoot><tr><td>Total do mês</td><td class="n">${brl(usado)}</td><td colspan="2"></td></tr></tfoot></table></div>`:'<div class="empty">Nenhuma diária lançada neste mês.</div>'}
  </div>`;
  const recarregar=async msg=>{ try{ await carregarMes(doc.mes); }catch(_){} toast(msg); render(); };
  $('#djTetoS').onclick=async()=>{ const v=parseNum($('#djTeto').value); if(isNaN(v)) return toast('Informe o teto.'); try{ await q(S.sb.from('meses').update({diarias_orcamento:round2(v), atualizado_em:new Date().toISOString()}).eq('mes',doc.mes)); recarregar('Teto salvo ✔'); }catch(e){ toast(e.message,5000); } };
  const aviso=()=>{ const v=parseNum($('#djValor').value)||0; $('#djAviso').innerHTML = v && v>saldo ? `<span style="color:var(--bad)">Esta diária passa do teto em ${brl(v-saldo)}.</span>` : (v?`Saldo depois: <b>${brl(saldo-v)}</b>`:''); };
  $('#djValor').oninput=aviso;
  $('#djAdd').onclick=async()=>{ const data=$('#djData').value, v=parseNum($('#djValor').value), obs=$('#djObs').value.trim();
    if(!data || !dias.includes(data)) return toast('Escolha um dia deste mês.'); if(isNaN(v)||v<=0) return toast('Informe o valor da diária.');
    S.djData=data; $('#djAdd').disabled=true;
    try{ await q(S.sb.from('diarias').insert({mes:doc.mes, data, valor:round2(v), observacao:obs||null})); recarregar('Diária lançada ✔'); }catch(e){ toast(e.message,5000); $('#djAdd').disabled=false; } };
  app.querySelectorAll('[data-djx]').forEach(b=>b.onclick=()=>{ const l=ls.find(x=>String(x.id)===b.dataset.djx); confirmBox(`Excluir a diária de ${brl(+l.valor)} do dia ${fDate(l.data)}?`, async()=>{ try{ await q(S.sb.from('diarias').delete().eq('id',l.id)); recarregar('Diária excluída'); }catch(e){ toast(e.message,5000); } }); });
  app.querySelectorAll('[data-dje]').forEach(b=>b.onclick=()=>{ const l=ls.find(x=>String(x.id)===b.dataset.dje);
    const m=modal(`<h2>Editar diária</h2><div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end"><label class="f">Dia<input type="date" id="deD" value="${l.data}" min="${dias[0]}" max="${dias[dias.length-1]}"></label><label class="f" style="width:140px">Valor<input class="in" id="deV" value="${nf(+l.valor)}"></label></div>
      <label class="f" style="margin-top:8px">Observação<input id="deO" value="${esc(l.obs||'')}" style="border:1px solid var(--line);border-radius:9px;padding:8px 10px"></label>
      <div class="row" style="margin-top:12px"><div class="sp"></div><button class="btn" id="mN">Cancelar</button><button class="btn p" id="mY">Salvar</button></div>`);
    $('#mN',m).onclick=closeModal;
    $('#mY',m).onclick=async()=>{ const v=parseNum($('#deV',m).value); if(isNaN(v)||v<=0) return toast('Valor inválido'); try{ await q(S.sb.from('diarias').update({data:$('#deD',m).value, valor:round2(v), observacao:$('#deO',m).value.trim()||null}).eq('id',l.id)); closeModal(); recarregar('Diária salva ✔'); }catch(e){ toast(e.message,5000); } }; });
}


/* ===================== CELULAR ===================== */
const ehCelular = () => window.matchMedia('(max-width:760px)').matches;
const BNAV_G=[['painel','📊','Painel'],['setor','🏪','Setores'],['trocas','🔄','Trocas'],['perdas','🗑️','Perdas'],['mais','☰','Mais']];
function montarBnav(){
  const nav=$('#bnav'); if(!nav) return;
  const itens = S.gerente ? BNAV_G : [['hoje','☀️','Hoje'],['setor:dia','🏪',meusSetoresIds().length>1?'Setores':'Meu setor'],['setor:ana','🔎','Análise'],['setor:per','🗑️','Perdas'],['historico','📅','Histórico']];
  nav.innerHTML=itens.map(([k,i,t])=>`<a href="#" data-bn="${k}"><span class="bn-i">${i}</span><span class="bn-t">${t}</span></a>`).join('');
  nav.classList.remove('hide');
  nav.querySelectorAll('[data-bn]').forEach(a=>a.onclick=e=>{ e.preventDefault(); const k=a.dataset.bn;
    if(k==='mais') return menuMais();
    const [v,aba]=k.split(':'); if(aba){ S.setorAba=aba; if(S.view==='setor'){ render(); marcarBnav(); } else location.hash='#setor'; window.scrollTo(0,0); }
    else if(location.hash==='#'+v){ window.scrollTo({top:0,behavior:'smooth'}); } else location.hash='#'+v; });
  marcarBnav();
}
function marcarBnav(){
  const nav=$('#bnav'); if(!nav) return;
  nav.querySelectorAll('[data-bn]').forEach(a=>{ const [v,aba]=a.dataset.bn.split(':');
    let on = aba ? (S.view==='setor' && (S.setorAba||'dia')===aba) : (v===S.view);
    if(v==='mais') on=['diarias','historico','fechamento','conta'].includes(S.view);
    if(v==='perdas') on=['perdas','balancos'].includes(S.view);
    a.classList.toggle('on',on); });
}
function menuMais(){
  const it=[['lancar','➕','Lançar vendas'],['diarias','💵','Diárias'],['historico','📅','Histórico'],['conta','👤','Minha conta e administração (fechamento do mês)']];
  const m=modal(`<div class="sheet"><div class="row" style="margin-bottom:6px"><h2 style="margin:0">Mais opções</h2><div class="sp"></div><button class="btn" id="mN">Fechar</button></div>
    ${it.map(([k,i,t])=>`<a class="sheet-i ${S.view===k?'on':''}" href="#${k}"><span>${i}</span>${t}</a>`).join('')}
    <button class="sheet-i" id="mmAtual"><span>🔄</span>Atualizar os números</button>
    <button class="sheet-i" id="mmSair" style="color:var(--bad)"><span>🚪</span>Sair</button></div>`);
  m.closest('.modal-bg')?.classList.add('as-sheet');
  $('#mN',m).onclick=closeModal; m.querySelectorAll('a.sheet-i').forEach(a=>a.onclick=()=>closeModal());
  $('#mmAtual',m).onclick=()=>{ closeModal(); atualizarDados(true); };
  $('#mmSair',m).onclick=()=>{ closeModal(); sair(); };
}
/* blocos que abrem/fecham no celular, "ver mais números" e ranking completo */
function aplicarCelular(root){
  S.dobras=S.dobras||{};
  root.querySelectorAll('.m-dobra').forEach(c=>{ const k=c.dataset.dobra; const ab = k in S.dobras ? S.dobras[k] : c.dataset.aberto==='1'; c.classList.toggle('m-aberto', ab); });
  root.querySelectorAll('[data-kpimais]').forEach(b=>{ const g=b.previousElementSibling; b.onclick=()=>{ const on=!g.classList.contains('mostrar'); g.classList.toggle('mostrar',on); b.textContent=on?'－ Menos números':'＋ Ver mais números'; }; });
  root.querySelectorAll('.rk-todos-b').forEach(b=>b.onclick=e=>{ e.stopPropagation(); const col=b.closest('.rk-col'); const on=!col.classList.contains('rk-todos'); col.classList.toggle('rk-todos',on); b.textContent=on?'Mostrar menos':`Ver todos (${col.querySelectorAll('.rk-l').length})`; });
}
document.addEventListener('click', e=>{
  const h=e.target.closest('.m-dobra-h'); if(!h || !ehCelular() || e.target.closest('button,a,input,select')) return;
  const c=h.closest('.m-dobra'); const on=!c.classList.contains('m-aberto'); c.classList.toggle('m-aberto',on); S.dobras=S.dobras||{}; if(c.dataset.dobra) S.dobras[c.dataset.dobra]=on;
  if(on) c.querySelectorAll('canvas').forEach(cv=>{ const ch=window.Chart&&Chart.getChart(cv); if(ch) ch.resize(); });
});
/* dia a dia em lista (celular): dia, realizado e % — toque abre o resto */
function listaDiasCelular(daily, cutoff, semFuturos){
  let am=0, ar=0; const pass=[], fut=[];
  for(const d of daily){ am+=d.meta; ar+=d.real; const it={...d, am, ar}; if(d.real || (cutoff && d.k<=cutoff)) pass.push(it); else fut.push(it); }
  const linha=d=>`<details class="dl"><summary><span class="dl-d">${fDateL(d.k)}${marcaData(d.k)}</span><b class="dl-v">${d.real?brl0(d.real):'—'}</b><span class="dl-p">${d.real&&d.meta?badge(d.real/d.meta):''}</span></summary>
    <div class="dl-c"><div><span>Meta do dia</span><b>${brl0(d.meta)}</b></div><div><span>Diferença</span><b style="color:${d.real-d.meta>=0?'var(--good)':'var(--bad)'}">${d.real?`${d.real-d.meta>=0?'+':''}${brl0(d.real-d.meta)}`:'—'}</b></div>
    <div><span>Acumulado</span><b>${brl0(d.ar)} de ${brl0(d.am)}</b></div><div><span>% acumulado</span><b>${pct(d.ar/(d.am||1))}</b></div>
    <div><span>Perda</span><b>${d.perda?brl(d.perda):'—'}${d.bal?' 📦':''}</b></div><div><span>% perda</span><b>${d.perda&&d.real?pct(d.perda/d.real,2):'—'}</b></div></div></details>`;
  return `<div class="m-only dlist">${pass.slice().reverse().map(linha).join('')}
    ${!semFuturos && fut.length?`<details class="dl dl-fut"><summary><span class="dl-d">Próximos ${fut.length} dia(s)</span><b class="dl-v small muted">ver metas</b><span></span></summary><div class="dl-c dl-c1">${fut.map(d=>`<div><span>${fDateL(d.k)}${marcaData(d.k)}</span><b>${brl0(d.meta)}</b></div>`).join('')}</div></details>`:''}</div>`;
}
/* comparativo em cartões (celular) */
function linhasDias(c, campo){
  const mes=c.atual.cut.slice(0,7); const dA=dailyDe(c.doc, c.atual.cut, c.sid);
  const dM=c.pm? dailyDe(S.months[c.mp], c.pm.cut, c.sid) : null, dY=c.pa? dailyDe(S.months[c.ma], c.pa.cut, c.sid) : null;
  const val=(arr,k)=>arr?.find(z=>z.k===k)?.[campo] ?? null; const out=[];
  for(let d=1; d<=c.dia; d++){ const kA=`${mes}-${String(d).padStart(2,'0')}`, kM=mesmoDiaEm(c.mp,d), kY=mesmoDiaEm(c.ma,d); out.push({kA, vA:val(dA,kA), kM, vM:dM?val(dM,kM):null, kY, vY:dY?val(dY,kY):null}); }
  return out;
}
function comparativoCelular(c){
  const a=c.atual, pm=c.pm, pa=c.pa;
  const vs=(rot, ref, campo, ruim)=> ref ? `<div class="cm-vs"><span>${rot}</span><b>${brl0(ref[campo])}</b>${varTxt(a[campo], ref[campo], ruim)}</div>` : `<div class="cm-vs muted"><span>${rot}</span><b>sem dados</b></div>`;
  const lista=(campo)=> linhasDias(c,campo).reverse().map(x=>`<div class="cm-r"><span>${fDateL(x.kA)}${marcaData(x.kA)}</span><b>${x.vA?brl0(x.vA):'—'}</b><span class="small">${x.vM!=null?`m.p. ${x.vA&&x.vM?varTxt(x.vA,x.vM,campo==='perda'):'—'}`:''}</span><span class="small">${x.vY!=null?`a.p. ${x.vA&&x.vY?varTxt(x.vA,x.vY,campo==='perda'):'—'}`:''}</span></div>`).join('');
  const setoresDia=()=>{ const rA=calc(c.doc, a.cut).setores; const rM=pm?.diaK? calc(S.months[c.mp], pm.diaK).setores : null; const rY=pa?.diaK? calc(S.months[c.ma], pa.diaK).setores : null;
    const dia=(l,id,k)=> l?.find(x=>x.id===id)?.daily.find(z=>z.k===k)?.real || 0;
    return rA.map(s=>({s,a:dia(rA,s.id,a.cut),m:rM?dia(rM,s.id,pm.diaK):null,y:rY?dia(rY,s.id,pa.diaK):null})).sort((x,y)=>y.a-x.a).map(x=>`<div class="cm-r"><span><b>${esc(x.s.nome)}</b></span><b>${x.a?brl0(x.a):'—'}</b><span class="small">${x.m!=null&&x.a&&x.m?`m.p. ${varTxt(x.a,x.m)}`:''}</span><span class="small">${x.y!=null&&x.a&&x.y?`a.p. ${varTxt(x.a,x.y)}`:''}</span></div>`).join(''); };
  const bloco=(tit, sub, campo, ruim, abre)=>`<details class="cm" ${abre?'':'data-sem'}><summary><div class="cm-t"><b>${tit}</b><small>${sub}</small></div><div class="cm-v">${campo==='pPerda'?(a.pPerda!=null?pct(a.pPerda,2):'—'):brl0(a[campo])}</div>
      ${campo==='pPerda'?`${pm?`<div class="cm-vs"><span>Mês passado</span><b>${pm.pPerda!=null?pct(pm.pPerda,2):'—'}</b>${difPP(a.pPerda,pm.pPerda)}</div>`:''}${pa?`<div class="cm-vs"><span>Ano passado</span><b>${pa.pPerda!=null?pct(pa.pPerda,2):'—'}</b>${difPP(a.pPerda,pa.pPerda)}</div>`:''}`:`${vs('Mês passado',pm,campo,ruim)}${vs('Ano passado',pa,campo,ruim)}`}
      ${abre?'<div class="cm-mais">toque para ver ▾</div>':''}</summary>${abre?`<div class="cm-l">${abre()}</div>`:''}</details>`;
  return `<div class="m-only cm-g">
    ${bloco('Venda acumulada', `dia 1 até dia ${c.dia}`, 'real', false, ()=>lista('real'))}
    ${bloco('Venda do dia', `${fDateL(a.cut)} · mesmo dia da semana`, 'dia', false, c.sid?null:setoresDia)}
    ${bloco('Perda acumulada', 'inclui balanços', 'perda', true, ()=>lista('perda'))}
    ${bloco('% de perda', 'sobre a venda', 'pPerda', true, null)}
  </div>`;
}
