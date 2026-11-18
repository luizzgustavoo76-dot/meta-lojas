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
  const col=(tit, sub, lista, fmt, cor)=> `<div class="rk-col"><div class="rk-t">${tit}</div><div class="small muted" style="margin-bottom:6px">${sub}</div>${lista.length?lista.map((x,i)=>`<div class="rk-l ${i>=lista.length-2&&lista.length>5?'rk-fim':''}" data-s="${x.s.id}"><span class="rk-m">${med(i)}</span><span class="rk-nm">${esc(x.s.nome)}</span><b style="color:${cor(x.v)}">${fmt(x.v)}</b></div>`).join(''):'<div class="small muted">sem dados</div>'}</div>`;
  return `<div class="card" style="margin-top:12px"><div class="row" style="margin-bottom:8px"><h2 style="margin:0">🏆 Ranking dos setores</h2><div class="sp"></div><span class="small muted">até ${fDateL(S.cutoff)} · toque no setor para abrir</span></div>
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
