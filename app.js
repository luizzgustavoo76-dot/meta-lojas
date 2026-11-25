const VERSAO_SITE = (()=>{ try{ return new URL(document.currentScript.src).searchParams.get('v')||''; }catch(_){ return ''; } })();
/* ===================== utilidades ===================== */
const $ = (s, r=document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl = (v, d=2) => (v==null||isNaN(v)) ? '—' : v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:d,maximumFractionDigits:d});
const brl0 = v => brl(v,0);
const nf = (v,d=2) => (v==null||isNaN(v)) ? '—' : v.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const pct = (v,d=1) => (v==null||!isFinite(v)) ? '—' : (v*100).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})+'%';
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const DSEM = ['dom','seg','ter','qua','qui','sex','sáb'];
const pDate = s => { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
const fDate = s => { const d=pDate(s); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`; };
const fDateL = s => { const d=pDate(s); return `${DSEM[d.getDay()]}, ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`; };
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayIso = () => isoOf(new Date());
const mesLabel = m => { const [y,mm]=m.split('-').map(Number); return `${MESES[mm-1][0].toUpperCase()+MESES[mm-1].slice(1)} ${y}`; };
const sum = a => a.reduce((x,y)=>x+(+y||0),0);
const round2 = v => Math.round((+v||0)*100)/100;
const clone = o => JSON.parse(JSON.stringify(o));
function toast(msg, ms=2800){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(), ms); }
function status(p){ if(p==null||!isFinite(p)) return 'none'; if(p>=1) return 'good'; if(p>=0.9) return 'warn'; return 'bad'; }
const STXT = {good:'✔ Na meta', warn:'▲ Perto', bad:'▼ Abaixo', none:'Sem dados'};
function badge(p){ const s=status(p); return `<span class="badge b-${s}" title="${STXT[s]}">${s==='good'?'✔':s==='warn'?'▲':s==='bad'?'▼':'·'} ${pct(p)}</span>`; }
function barH(p, mark){ const s=status(p); const c={good:'var(--good)',warn:'#e0a100',bad:'var(--bad)',none:'#ccc'}[s]; const w=Math.max(0,Math.min(1,(p||0)/1.3))*100; const mk=mark!=null?`<span class="mk" style="left:${Math.min(100,mark/1.3*100)}%"></span>`:''; return `<div class="bar"><i style="width:${w}%;background:${c}"></i>${mk}</div>`; }

/* Parse número brasileiro / internacional */
/* ===================== estado ===================== */
const { parseNum, extractNums, parseLines, matchSector, ALIASES } = Parser;
const S = { sb:null, user:null, perfil:null, gerente:false, setoresAll:[], mesList:[], months:{}, mes:null, view:'painel', setorSel:null, cutoff:null, lancData:null, loaded:false, writeChain:Promise.resolve(), charts:[] };

function curDoc(){ return S.months[S.mes] || null; }
function diasDoMes(m){ const [y,mm]=m.split('-').map(Number); const n=new Date(y,mm,0).getDate(); return Array.from({length:n},(_,i)=>`${m}-${String(i+1).padStart(2,'0')}`); }
function vendaDia(d){ if(!d) return 0; if(+d.total>0) return +d.total; return d.vendas?sum(Object.values(d.vendas)):0; }
function temVenda(d){ return !!d && (vendaDia(d)>0); }
function lastSetorDay(doc){ const ks=Object.keys(doc.dias||{}).sort(); let l=null; for(const k of ks){ const v=doc.dias[k].vendas; if(v&&Object.keys(v).length) l=k; } return l; }
function lastDataDay(doc){ const ks=Object.keys(doc.dias||{}).sort(); let l=null; for(const k of ks) if(temVenda(doc.dias[k])) l=k; return l; }

/* ===================== cálculo ===================== */
function calc(doc, cutoff){
  const dias = diasDoMes(doc.mes);
  const metaLoja = +doc.metaLoja || sum(doc.setores.map(s=>s.meta));
  const totSet = sum(doc.setores.map(s=>+s.meta||0)) || 1;
  const setores = doc.setores.map(s=>({ ...s, share:(+s.meta||0)/metaLoja, metaAte:0, real:0, perda:0, diasComVenda:0, daily:[] }));
  let loja = { metaMes:metaLoja, metaAte:0, real:0, perda:0, daily:[], metaDiasSum:0 };
  const hoje = todayIso();
  for(const k of dias){
    const d = doc.dias?.[k] || {};
    const meta = +d.meta||0; loja.metaDiasSum+=meta;
    const real = vendaDia(d); const per = d.perdas?sum(Object.values(d.perdas)):0;
    const ate = cutoff && k<=cutoff;
    if(ate){ loja.metaAte+=meta; loja.real+=real; loja.perda+=per; }
    loja.daily.push({k, meta, real, perda:per, ate, temSetores:!!(d.vendas&&Object.keys(d.vendas).length)});
    for(const s of setores){
      const sm = meta*s.share; const sr = +(d.vendas?.[s.id])||0; const sp = +(d.perdas?.[s.id])||0;
      if(ate){ s.metaAte+=sm; s.real+=sr; s.perda+=sp; if(sr) s.diasComVenda++; }
      s.daily.push({k, meta:sm, real:sr, perda:sp, ate});
    }
  }
  // venda dos setores (apenas dias com detalhamento) para comparação justa por setor
  loja.perdaBal=0;
  for(const b of (doc.balancos||[])){ if(cutoff && b.data>cutoff) continue; const v=+b.valor_perda||0; const s=setores.find(x=>x.id===b.setor_id); if(s){ s.perda+=v; s.perdaBal=(s.perdaBal||0)+v; const dd=s.daily.find(x=>x.k===b.data); if(dd){ dd.perda+=v; dd.bal=(dd.bal||0)+v; } } loja.perda+=v; loja.perdaBal+=v; const dl=loja.daily.find(x=>x.k===b.data); if(dl){ dl.perda+=v; dl.bal=(dl.bal||0)+v; } }
  const restantes = dias.filter(k=>!cutoff||k>cutoff);
  const metaRest = sum(restantes.map(k=>+(doc.dias?.[k]?.meta)||0));
  loja.falta = Math.max(0, loja.metaMes-loja.real);
  loja.pAte = loja.metaAte? loja.real/loja.metaAte : null;
  loja.pMes = loja.metaMes? loja.real/loja.metaMes : null;
  loja.proj = loja.pAte!=null ? loja.real + metaRest*loja.pAte : null;
  loja.diasRest = restantes.length; loja.metaRest = metaRest;
  loja.necDia = restantes.length? loja.falta/restantes.length : 0;
  loja.fatorNec = metaRest? loja.falta/metaRest : null; // quanto da meta restante precisa vender
  loja.pPerda = loja.real? loja.perda/loja.real : null;
  const proxDia = (hoje>=dias[0] && hoje<=dias[dias.length-1]) ? hoje : (restantes[0]||null);
  loja.proxDia = proxDia; loja.metaProx = proxDia? (+(doc.dias?.[proxDia]?.meta)||0) : 0;
  for(const s of setores){
    s.pAte = s.metaAte? s.real/s.metaAte : null; s.pMes = s.meta? s.real/s.meta : null;
    s.falta = Math.max(0,(+s.meta||0)-s.real); s.pPerda = s.real? s.perda/s.real : null;
    s.metaProx = loja.metaProx*s.share; s.necDia = loja.diasRest? s.falta/loja.diasRest : 0;
    s.proj = s.pAte!=null ? s.real + metaRest*s.share*s.pAte : null;
    s.partReal = null;
  }
  const totReal = sum(setores.map(s=>s.real));
  setores.forEach(s=> s.partReal = totReal? s.real/totReal : null);
  loja.totSetores = totReal;
  return { loja, setores, dias };
}

/* ===================== render ===================== */
function destroyCharts(){ S.charts.forEach(c=>{try{c.destroy()}catch(e){}}); S.charts=[]; }
function render(){
  if(S.view==='balancos' && S.loaded){ fillMesSelect(); destroyCharts(); return renderBalancos($('#app')); }
  if(S.view==='ponto' && S.loaded && S.gerente){ fillMesSelect(); destroyCharts(); return renderPonto($('#app')); }
  if(S.view==='conta' && S.loaded){ fillMesSelect(); destroyCharts(); if(S.admAberto && S._admCont?.isConnected) return desenharCascataAdm(); return renderConta($('#app')); }
  fillMesSelect();
  destroyCharts();
  const app=$('#app');
  if(!S.loaded){ return; }
  const doc=curDoc();
  if(!doc){
    app.innerHTML = S.gerente ? `<div class="card empty"><h2>Nenhum mês cadastrado ainda</h2><p>Crie o primeiro mês ou importe as planilhas mensais em <a href="#metas">Metas do mês</a>.</p></div>`
      : `<div class="card empty"><h2>Nenhuma meta liberada para você ainda</h2><p>Peça ao gerente para cadastrar as metas do mês.</p></div>`;
    if(S.view==='metas' && S.gerente) renderMetas(app,null);
    return;
  }
  if(!S.cutoff || !S.cutoff.startsWith(doc.mes)) S.cutoff = lastSetorDay(doc) || lastDataDay(doc) || diasDoMes(doc.mes)[0];
  if(S.view==='painel'){ renderPainel(app,doc); cardChecklist(app); cardTetoPainel(app,doc); }
  else if(S.view==='perdas' && S.gerente) renderPerdasLoja(app,doc);
  else if(S.view==='trocas' && S.gerente) renderTrocasLoja(app,doc);
  else if(S.view==='setor') renderSetor(app,doc);
  else if(S.view==='historico') renderHistoricoAsync(app);
  else if(S.view==='diarias' && S.gerente) renderDiarias(app,doc);
  else if(S.view==='hoje') renderHoje(app,doc);
  else if(S.view==='fechamento' && S.gerente) renderFechamento(app,doc);
  else if(S.view==='precos' && S.gerente) renderPrecos(app);
  else renderPainel(app,doc);
}

function cutoffSelect(doc){
  const ds=diasDoMes(doc.mes), com=ds.filter(k=>temVenda(doc.dias?.[k]));
  if(!com.length) return `<label class="f" style="min-width:170px">Dados até<input type="date" disabled value=""></label>`;
  const min=ds[0], max=com[com.length-1], i=com.indexOf(S.cutoff);
  const ant=i>0?com[i-1]:(i<0?com.filter(k=>k<S.cutoff).pop():null), prox=i>=0?com[i+1]:com.find(k=>k>S.cutoff);
  return `<div class="f cut-cal"><span>Dados até</span><div class="row" style="gap:4px;flex-wrap:nowrap">
    <button class="btn cut-nav" data-cut="${ant||''}" ${ant?'':'disabled'} title="Dia anterior" aria-label="Dia anterior">‹</button>
    <input type="date" id="selCut" min="${min}" max="${max}" value="${S.cutoff||max}" title="Escolha o dia no calendário">
    <button class="btn cut-nav" data-cut="${prox||''}" ${prox?'':'disabled'} title="Próximo dia" aria-label="Próximo dia">›</button>
    ${S.cutoff!==max?`<button class="btn cut-nav" data-cut="${max}" title="Último dia lançado">Último</button>`:''}</div></div>`;
}
function bindCutoff(){
  const s=$('#selCut'); if(s) s.onchange=e=>{ let v=e.target.value; if(!v) return; const mx=s.max, mn=s.min; if(mx&&v>mx){ v=mx; toast(`O último dia lançado é ${fDate(mx)}`); } if(mn&&v<mn) v=mn; S.cutoff=v; render(); };
  document.querySelectorAll('.cut-nav').forEach(b=>b.onclick=()=>{ if(b.dataset.cut){ S.cutoff=b.dataset.cut; render(); } });
}

/* ---------- PAINEL ---------- */
function renderPainel(app, doc){
  const {loja,setores} = calc(doc,S.cutoff);
  const sortKey = S.sortKey||'meta'; const dir=S.sortDir||-1;
  const sorted = [...setores].sort((a,b)=> sortKey==='nome' ? a.nome.localeCompare(b.nome)*dir : ((a[sortKey]??-1)-(b[sortKey]??-1))*dir);
  const diffSet = Math.abs(loja.totSetores-loja.real)>1;
  const metaWarn = Math.abs(loja.metaDiasSum-loja.metaMes)>1;
  const necTxt = loja.fatorNec!=null ? `${pct(loja.fatorNec,0)} da meta diária planejada` : '';
  const comp = comparativos(doc, S.cutoff, null);
  const meusNomes = doc.setores.map(x=>x.nome).join(', ');
  app.innerHTML = `
  <div class="row" style="align-items:flex-end;margin-bottom:14px">
    <div><h1>${S.gerente?mesLabel(doc.mes):`${esc(meusNomes)} — ${mesLabel(doc.mes)}`}</h1>${S.gerente?'':`<p class="sub" style="margin:0 0 2px">Painel ${doc.setores.length>1?'dos seus setores':'do seu setor'}</p>`}<p class="sub" style="margin:0">Acumulado até <b>${fDateL(S.cutoff)}</b> · ${loja.diasRest} dia(s) restante(s)</p></div>
    <div class="sp"></div>${cutoffSelect(doc)}
    ${S.gerente?'<button class="btn d-only" id="btnXlsx">⬇ Baixar Excel</button>':''}
    ${S.gerente?'<a class="btn p" href="#lancar">＋ Lançar vendas</a>':''}
  </div>
  ${bannerFechamento(doc)}
  ${metaWarn?`<div class="note" style="margin-bottom:12px">A soma das metas diárias (${brl0(loja.metaDiasSum)}) é diferente da meta do mês (${brl0(loja.metaMes)}). Ajuste em <a href="#metas">Metas do mês</a>.</div>`:''}
  <div class="grid kpis">
    <div class="kpi hero"><div class="l">% da meta até a data</div><div class="v">${pct(loja.pAte)}</div><div class="d">${STXT[status(loja.pAte)]} · ${loja.real>=loja.metaAte?'+':''}${brl0(loja.real-loja.metaAte)} vs. meta</div></div>
    <div class="kpi"><div class="l">Realizado</div><div class="v">${brl0(loja.real)}</div><div class="d">Meta até a data: ${brl0(loja.metaAte)}</div></div>
    <div class="kpi m-hide"><div class="l">Meta do mês</div><div class="v">${brl0(loja.metaMes)}</div><div class="d">${pct(loja.pMes)} atingido · falta ${brl0(loja.falta)}</div>${barH(loja.pMes)}</div>
    <div class="kpi m-hide"><div class="l">Projeção do mês</div><div class="v">${brl0(loja.proj)}</div><div class="d">${pct(loja.proj/loja.metaMes)} da meta, mantendo o ritmo</div></div>
    <div class="kpi"><div class="l">Precisa vender/dia</div><div class="v">${brl0(loja.necDia)}</div><div class="d">${necTxt}</div></div>
    <div class="kpi m-hide"><div class="l">Meta de ${loja.proxDia?fDate(loja.proxDia):'—'}</div><div class="v">${brl0(loja.metaProx)}</div><div class="d">${loja.proxDia?fDateL(loja.proxDia):''}</div></div>
    ${kpisComparativos(comp)}
    <div class="kpi"><div class="l">Perdas</div><div class="v">${brl0(loja.perda)}</div><div class="d">${pct(loja.pPerda,2)} sobre a venda${loja.perdaBal?` · inclui <a href="#balancos">${brl0(loja.perdaBal)} de balanço</a>`:''}</div>${comp?.pm?`<div class="d">vs. mês passado: ${varTxt(loja.perda, comp.pm.perda, true)}</div>`:''}</div>
    <div class="kpi" id="kpTrocas"><div class="l">Trocas do mês</div><div class="v">…</div><div class="d">a custo</div></div>
  </div>
  <button class="btn m-only kpi-mais" data-kpimais>＋ Ver mais números</button>
  ${alertasPainel(doc, loja, setores)}
  ${cardComparativos(comp, S.gerente?'loja':'')}
  ${S.gerente?cardRanking(doc, setores):''}

  <div class="grid two" style="margin-top:12px">
    <div class="card m-dobra" data-dobra="painel-graf">
      <div class="row m-dobra-h"><h2 style="margin:0">Venda diária × meta</h2><div class="sp"></div><div class="tabs2" id="chTabs"><button data-c="dia" class="${(S.chMode||'dia')==='dia'?'on':''}">Diário</button><button data-c="acum" class="${S.chMode==='acum'?'on':''}">Acumulado</button></div></div>
      <div class="legend"><span><i class="lg-bar"></i>Realizado</span><span><i class="lg-line"></i>Meta</span></div>
      <div class="chartbox"><canvas id="chLoja"></canvas></div>
    </div>
    <div class="card m-hide">
      <h2>Ranking de atingimento</h2>
      <div class="chartbox" style="height:${Math.max(300,setores.length*24)}px"><canvas id="chRank"></canvas></div>
    </div>
  </div>

  <div id="ppPainel"></div>
  <div id="calLoja"></div>
  <div class="card m-dobra" data-dobra="painel-setores" data-aberto="1" style="margin-top:12px">
    <div class="row m-dobra-h" style="margin-bottom:10px"><h2 style="margin:0">Setores — detalhado</h2><div class="sp"></div><span class="small muted d-only">Clique em um setor para abrir o detalhe aqui mesmo</span></div>
    ${diffSet?`<div class="note small" style="margin-bottom:10px">O realizado da loja (${brl0(loja.real)}) usa o total do caixa quando ele foi lançado; a soma dos setores é ${brl0(loja.totSetores)}.</div>`:''}
    <div class="tw dtable"><table>
      <thead><tr>
        <th class="sort" data-k="nome">Setor</th><th class="n sort gx" data-k="share">Repr.</th><th class="n sort" data-k="meta">Meta mês</th><th class="n sort" data-k="metaAte">Meta até data</th><th class="n sort" data-k="real">Realizado</th><th class="sort" data-k="pAte">% até data</th><th class="n sort" data-k="pMes">% mês</th><th class="n sort" data-k="falta">Falta</th><th class="n sort" data-k="necDia">Precisa/dia</th><th class="n sort" data-k="metaProx">Meta ${loja.proxDia?fDate(loja.proxDia):''}</th><th class="n sort" data-k="perda">Perda</th><th class="n sort" data-k="pPerda">% perda</th>
      </tr></thead>
      <tbody>${sorted.map(s=>`<tr class="click" data-s="${s.id}">
        <td><b>${esc(s.nome)}</b></td><td class="n gx">${pct(s.share)}</td><td class="n">${brl0(s.meta)}</td><td class="n">${brl0(s.metaAte)}</td><td class="n"><b>${brl0(s.real)}</b></td>
        <td style="min-width:150px"><div class="row" style="gap:8px;flex-wrap:nowrap">${badge(s.pAte)}<div style="flex:1">${barH(s.pAte,1)}</div></div></td>
        <td class="n">${pct(s.pMes)}</td><td class="n">${brl0(s.falta)}</td><td class="n">${brl0(s.necDia)}</td><td class="n">${brl0(s.metaProx)}</td><td class="n">${s.perda?brl0(s.perda):'—'}</td><td class="n">${s.perda?pct(s.pPerda,2):'—'}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>${S.gerente?'Loja':'Total'}</td><td class="n gx">100%</td><td class="n">${brl0(loja.metaMes)}</td><td class="n">${brl0(loja.metaAte)}</td><td class="n">${brl0(loja.real)}</td><td>${badge(loja.pAte)}</td><td class="n">${pct(loja.pMes)}</td><td class="n">${brl0(loja.falta)}</td><td class="n">${brl0(loja.necDia)}</td><td class="n">${brl0(loja.metaProx)}</td><td class="n">${brl0(loja.perda)}</td><td class="n">${pct(loja.pPerda,2)}</td></tr></tfoot>
    </table></div>
    <div class="mcards">${sorted.map(s=>`<div class="sc" data-s="${s.id}"><div class="t"><b>${esc(s.nome)}</b>${badge(s.pAte)}</div>${barH(s.pAte,1)}
      <div class="g"><div>Realizado<span>${brl0(s.real)}</span></div><div>Meta até data<span>${brl0(s.metaAte)}</span></div><div>Meta mês<span>${brl0(s.meta)}</span></div><div>% mês<span>${pct(s.pMes)}</span></div><div>Precisa/dia<span>${brl0(s.necDia)}</span></div><div>Perda<span>${s.perda?brl0(s.perda):'—'}</span></div></div></div>`).join('')}</div>
  </div>

  `;
  bindCutoff();
  app.querySelectorAll('.dtable tr[data-s], .mcards [data-s]').forEach(el=>el.onclick=e=>{ if(e.target.closest('[data-abrir-setor]')) return; abrirSetorNoPainel(el, doc); });
  app.querySelectorAll('.rk-l[data-s]').forEach(el=>el.onclick=()=>{ const alvo=app.querySelector(`.dtable tr[data-s="${el.dataset.s}"]`); if(alvo && alvo.offsetParent){ alvo.scrollIntoView({block:'center'}); abrirSetorNoPainel(alvo, doc, true); } else { const c=app.querySelector(`.mcards [data-s="${el.dataset.s}"]`); if(c){ c.scrollIntoView({block:'center'}); abrirSetorNoPainel(c, doc, true); } } });
  app.querySelectorAll('th.sort').forEach(th=>th.onclick=()=>{ const k=th.dataset.k; if(S.sortKey===k) S.sortDir=-(S.sortDir||-1); else {S.sortKey=k;S.sortDir=k==='nome'?1:-1;} render(); });
  $('#chTabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{S.chMode=b.dataset.c; render();});
  const bx=$('#btnXlsx'); if(bx) bx.onclick=()=>exportXlsx(doc);
  aplicarCelular(app);
  drawLojaChart(loja);
  drawRank(setores);
  kpiTrocasMes($('#kpTrocas'), doc, loja); cardPrecosPainel($('#ppPainel'));
  montarCalVendas($('#calLoja'), {id:null, daily:loja.daily}, doc, {titulo:S.gerente?'📅 Vendas da loja dia a dia':'📅 Vendas dia a dia', setores: setores.length>1? setores : null});
}

function renderDiariasCard(doc){
  const di=doc.diarias; if(!di) return '';
  const usado=sum((di.lancamentos||[]).map(l=>l.valor)); const sobra=(+di.orcamento||0)-usado;
  return `<div class="card" style="margin-top:12px"><div class="row"><h2 style="margin:0">Diárias</h2><div class="sp"></div><a class="small" href="#metas">editar</a></div>
  <div class="grid kpis" style="margin-top:10px"><div class="kpi"><div class="l">Orçamento</div><div class="v">${brl0(di.orcamento)}</div></div><div class="kpi"><div class="l">Utilizado</div><div class="v">${brl0(usado)}</div><div class="d">${(di.lancamentos||[]).length} lançamento(s)</div></div><div class="kpi"><div class="l">Sobrando</div><div class="v" style="color:${sobra<0?'var(--bad)':'inherit'}">${brl0(sobra)}</div></div></div></div>`;
}

const chartFont = {family:"'Barlow', sans-serif"};
function baseOpts(extra={}){
  return Object.assign({responsive:true,maintainAspectRatio:false,animation:{duration:250},interaction:{mode:'index',intersect:false},
    plugins:{legend:{display:false},tooltip:{backgroundColor:'#161514',titleFont:{...chartFont,weight:'700'},bodyFont:chartFont,padding:10,callbacks:{label:c=>` ${c.dataset.label}: ${brl(c.parsed.y??c.parsed.x)}`}}},
    scales:{x:{grid:{display:false},ticks:{font:chartFont,color:'#8a867e',maxRotation:0,autoSkip:true}},y:{grid:{color:'#eeeae2'},border:{display:false},ticks:{font:chartFont,color:'#8a867e',callback:v=>v>=1000?(v/1000).toLocaleString('pt-BR')+' mil':v}}}},extra);
}
function drawLojaChart(loja, el='chLoja', mode=S.chMode||'dia'){
  const cv=document.getElementById(el); if(!cv||!window.Chart) return;
  const lab=loja.daily.map(d=>fDate(d.k).slice(0,2));
  let real, meta;
  if(mode==='acum'){ let a=0,b=0; real=loja.daily.map(d=>{a+=d.real; return d.ate||d.real?a:null;}); meta=loja.daily.map(d=>(b+=d.meta)); }
  else { real=loja.daily.map(d=>d.real||null); meta=loja.daily.map(d=>d.meta||null); }
  const colors = loja.daily.map(d=> d.real? (d.real>=d.meta?'#2f5d8a':'#9db6cf') : '#2f5d8a');
  const ch=new Chart(cv,{data:{labels:lab,datasets:[
    mode==='acum'? {type:'line',label:'Realizado',data:real,borderColor:'#2f5d8a',backgroundColor:'#2f5d8a22',fill:true,pointRadius:0,borderWidth:2,tension:.2,spanGaps:false}
                 : {type:'bar',label:'Realizado',data:real,backgroundColor:colors,borderRadius:4,maxBarThickness:22,order:2},
    {type:'line',label:'Meta',data:meta,borderColor:'#a39e94',borderDash:[5,4],borderWidth:2,pointRadius:0,tension:0,order:1,fill:false}
  ]},options:baseOpts({plugins:{legend:{display:false},tooltip:{backgroundColor:'#161514',padding:10,titleFont:{...chartFont,weight:'700'},bodyFont:chartFont,callbacks:{title:i=>fDateL(loja.daily[i[0].dataIndex].k),label:c=>` ${c.dataset.label}: ${brl(c.parsed.y)}`,afterBody:i=>{const d=loja.daily[i[0].dataIndex]; if(mode==='dia'&&d.real&&d.meta) return `Atingido: ${pct(d.real/d.meta)}`; return '';}}}}})});
  S.charts.push(ch);
}
function drawRank(setores){
  const cv=$('#chRank'); if(!cv||!window.Chart) return;
  const s=[...setores].filter(x=>x.pAte!=null).sort((a,b)=>b.pAte-a.pAte);
  const ch=new Chart(cv,{type:'bar',data:{labels:s.map(x=>x.nome),datasets:[{label:'% até a data',data:s.map(x=>+(x.pAte*100).toFixed(1)),backgroundColor:s.map(x=>({good:'#1f8a4c',warn:'#e0a100',bad:'#c62828'}[status(x.pAte)])),borderRadius:4,maxBarThickness:16}]},
    options:baseOpts({indexAxis:'y',interaction:{mode:'nearest',intersect:true,axis:'y'},plugins:{legend:{display:false},tooltip:{backgroundColor:'#161514',padding:10,bodyFont:chartFont,callbacks:{label:c=>{const x=s[c.dataIndex]; return [` ${STXT[status(x.pAte)]}: ${pct(x.pAte)}`,` Realizado ${brl0(x.real)} de ${brl0(x.metaAte)}`];}}}},
      scales:{x:{grid:{color:'#eeeae2'},border:{display:false},ticks:{font:chartFont,color:'#8a867e',callback:v=>v+'%'},suggestedMin:0,suggestedMax:120},y:{grid:{display:false},ticks:{font:{...chartFont,size:12},color:'#1b1a18'}}}})});
  S.charts.push(ch);
}

function compAnoAnterior(doc, cutoff){
  if(!cutoff) return null; const [y,m]=doc.mes.split('-'); const mp=`${+y-1}-${m}`; const ant=S.months[mp]; if(!ant) return null;
  const dia=+cutoff.slice(8); const lim=`${mp}-${String(dia).padStart(2,'0')}`;
  const real=sum(Object.entries(ant.dias||{}).filter(([k])=>k<=lim).map(([,d])=>vendaDia(d)));
  const atual=calc(doc,cutoff).loja.real; if(!real) return null;
  return {mes:mp, dia, real, cresc:atual/real-1};
}


/* ---------- comparativos: mês passado e ano passado, mesmo período e mesmo dia ---------- */
function mesmoDiaEm(mes, dia){ const ds=diasDoMes(mes); return ds[Math.min(dia,ds.length)-1]; }
function mesmoDiaSemanaEm(mes, ref){ // dia do mês alvo com o mesmo dia da semana, o mais perto do mesmo número de dia
  const alvo=pDate(ref).getDay(), dia=+ref.slice(8); let melhor=null, dist=99;
  for(const k of diasDoMes(mes)){ if(pDate(k).getDay()!==alvo) continue; const d=Math.abs(+k.slice(8)-dia); if(d<dist || (d===dist && +k.slice(8)>dia)){ melhor=k; dist=d; } }
  return melhor;
}
function vendaNoDia(doc, k, sid){ if(!doc||!k) return null; const r=calc(doc,k); const x= sid ? r.setores.find(z=>z.id===sid) : r.loja; const d=x?.daily.find(z=>z.k===k); return d? {k, real:d.real} : null; }
function numerosAte(doc, cut, sid){
  const r=calc(doc,cut); const x = sid ? r.setores.find(z=>z.id===sid) : r.loja; if(!x) return null;
  const d=x.daily.find(z=>z.k===cut);
  return { cut, real:x.real, perda:x.perda, pPerda:x.real?x.perda/x.real:null, dia:d?.real||0, perdaDia:d?.perda||0 };
}
function comparativos(doc, cutoff, sid){
  if(!cutoff) return null;
  const dia=+cutoff.slice(8); const [y,m]=doc.mes.split('-');
  const mp=mesAnterior(doc.mes,1), ma=`${+y-1}-${m}`;
  const atual=numerosAte(doc,cutoff,sid);
  const pm=S.months[mp]? numerosAte(S.months[mp], mesmoDiaEm(mp,dia), sid) : null;
  const pa=S.months[ma]? numerosAte(S.months[ma], mesmoDiaEm(ma,dia), sid) : null;
  // venda do dia: compara com o mesmo dia da semana (terça com terça…)
  for(const [ref,mm] of [[pm,mp],[pa,ma]]){ if(!ref) continue; const v=vendaNoDia(S.months[mm], mesmoDiaSemanaEm(mm,cutoff), sid); ref.diaK=v?.k||null; ref.dia=v?.real||0; }
  return { atual, pm:(pm&&pm.real)?pm:null, pa:(pa&&pa.real)?pa:null, mp, ma, dia, doc, sid };
}
function varTxt(a, b, ruimSeSobe){ if(!b) return '<span class="muted">—</span>'; const v=a/b-1; const bom = ruimSeSobe ? v<=0 : v>=0;
  return `<span style="color:${Math.abs(v)<0.0005?'inherit':bom?'var(--good)':'var(--bad)'};font-weight:700">${v>0?'▲ +':v<0?'▼ ':''}${pct(v)}</span>`; }
function difPP(a, b){ if(a==null||b==null) return '<span class="muted">—</span>'; const d=(a-b)*100; return `<span style="color:${Math.abs(d)<0.005?'inherit':d<=0?'var(--good)':'var(--bad)'};font-weight:700">${d>0?'+':''}${d.toFixed(2).replace('.',',')} p.p.</span>`; }
function kpisComparativos(c){
  if(!c) return '';
  const k=(rot, ref)=> ref ? `<div class="kpi"><div class="l">Venda vs. ${rot}</div><div class="v">${varTxt(c.atual.real, ref.real)}</div><div class="d">${mesLabel(ref.cut.slice(0,7))} até dia ${+ref.cut.slice(8)}: ${brl0(ref.real)}</div></div>` : '';
  return k('mês passado', c.pm).replace('class="kpi"','class="kpi m-hide"') + k('ano passado', c.pa);
}
function cardComparativos(c, titulo){
  if(!c || (!c.pm && !c.pa)) return '';
  const a=c.atual, pm=c.pm, pa=c.pa;
  const col=(ref, campo, ruim)=> ref ? `<td class="n">${brl0(ref[campo])}</td><td class="n">${varTxt(a[campo], ref[campo], ruim)}</td>` : '<td class="n muted">sem dados</td><td></td>';
  const colP=(ref)=> ref ? `<td class="n">${ref.pPerda!=null?pct(ref.pPerda,2):'—'}</td><td class="n">${difPP(a.pPerda, ref.pPerda)}</td>` : '<td class="n muted">sem dados</td><td></td>';
  const hd=(ref, rot)=> ref ? `${rot}<br><span class="small muted" style="text-transform:none;font-weight:500">${mesLabel(ref.cut.slice(0,7))}</span>` : rot;
  return `<div class="card m-dobra" data-dobra="comp" style="margin-top:12px">
    <div class="row m-dobra-h" style="margin-bottom:8px"><h2 style="margin:0">📊 Comparativo ${titulo?'— '+esc(titulo):''}</h2><div class="sp"></div><span class="small muted d-only">Acumulado: dia 1 até dia ${c.dia} · Venda do dia: mesmo dia da semana</span></div>
    ${comparativoCelular(c)}
    <div class="tw d-only"><table><thead><tr><th></th><th class="n">Atual<br><span class="small muted" style="text-transform:none;font-weight:500">${mesLabel(c.atual.cut.slice(0,7))}</span></th><th class="n">${hd(pm,'Mês passado')}</th><th class="n">Variação</th><th class="n">${hd(pa,'Ano passado')}</th><th class="n">Variação</th></tr></thead><tbody>
      <tr class="cx-row" data-cx="cacum"><td><span class="cx-chev">▸</span> <b>Venda acumulada</b><div class="small muted">dia 1 até dia ${c.dia} · clique para ver dia a dia</div></td><td class="n"><b>${brl0(a.real)}</b></td>${col(pm,'real')}${col(pa,'real')}</tr>
      ${compDetalheDias(c,'real')}
      <tr class="${c.sid?'':'cx-row'}" ${c.sid?'':'data-cx="cdia"'}><td>${c.sid?'':'<span class="cx-chev">▸</span> '}<b>Venda do dia</b><div class="small muted">mesmo dia da semana: ${fDateL(a.cut)}${pm?.diaK?` · ${fDateL(pm.diaK)}`:''}${pa?.diaK?` · ${fDateL(pa.diaK)}/${pa.diaK.slice(2,4)}`:''}${c.sid?'':' · clique para ver por setor'}</div></td><td class="n"><b>${a.dia?brl0(a.dia):'—'}</b></td>${col(pm,'dia')}${col(pa,'dia')}</tr>
      ${c.sid?'':compDetalheSetoresDia(c)}
      <tr class="cx-row" data-cx="cperda"><td><span class="cx-chev">▸</span> <b>Perda acumulada</b><div class="small muted">inclui balanços · clique para ver dia a dia</div></td><td class="n"><b>${brl0(a.perda)}</b></td>${col(pm,'perda',true)}${col(pa,'perda',true)}</tr>
      ${compDetalheDias(c,'perda')}
      <tr><td><b>% de perda sobre a venda</b></td><td class="n"><b>${a.pPerda!=null?pct(a.pPerda,2):'—'}</b></td>${colP(pm)}${colP(pa)}</tr>
    </tbody></table></div>
    <div class="small muted" style="margin-top:8px">Verde = melhor que antes (venda maior ou perda menor). Vermelho = pior.</div>
    ${notaDatas(`${c.atual.cut.slice(0,7)}-01`, c.atual.cut, [{rot:'mês passado', ini:pm?`${pm.cut.slice(0,7)}-01`:null, fim:pm?.cut},{rot:'ano passado', ini:pa?`${pa.cut.slice(0,7)}-01`:null, fim:pa?.cut}])}
  </div>`;
}

/* ---------- HISTÓRICO ---------- */
function resumoMes(doc){ const ds=diasDoMes(doc.mes); const cut = doc.mes<todayIso().slice(0,7) ? ds[ds.length-1] : (lastSetorDay(doc)||lastDataDay(doc)); return calc(doc,cut); }
function renderHistorico(app){
  const ks=Object.keys(S.months).sort();
  const rows=ks.map(k=>{ const d=S.months[k]; const c=resumoMes(d); const [y,m]=k.split('-'); const ant=S.months[`${+y-1}-${m}`]; const fechado=k<todayIso().slice(0,7); const antReal=ant?resumoMes(ant).loja.real:null;
    let cresc = antReal? c.loja.real/antReal-1 : null; if(!fechado){ const cp=compAnoAnterior(d, lastSetorDay(d)||lastDataDay(d)); cresc=cp?cp.cresc:null; }
    return {k, d, c, metaMes:c.loja.metaMes, real:c.loja.real, pMes:c.loja.pMes, pAte:c.loja.pAte, perda:c.loja.perda, cresc, fechado}; });
  const anos=[...new Set(ks.map(k=>k.slice(0,4)))];
  const ids=['acougue','hortifruti','padaria','panif_terc','pereciveis','merc_seca','merc_salgada','merc_doce','bebidas','perfumaria','limpeza','bazar','leite_gas','eletro'];
  const nomes={}; ks.forEach(k=>S.months[k].setores.forEach(s=>nomes[s.id]=nomes[s.id]||s.nome));
  const modo=S.histModo||'pct';
  const cell=(r,id)=>{ const s=r.c.setores.find(x=>x.id===id); if(!s||!s.real) return '<td class="n muted">—</td>'; const p=r.fechado?s.pMes:s.pAte; if(modo==='pct'){ const st=status(p); return `<td class="n" style="background:${{good:'var(--good-bg)',warn:'var(--warn-bg)',bad:'var(--bad-bg)',none:''}[st]}" title="${esc(s.nome)} · ${brl0(s.real)} de ${brl0(r.fechado?s.meta:s.metaAte)}">${pct(p,0)}</td>`; } return `<td class="n">${nf(s.real/1000,0)}</td>`; };
  app.innerHTML=`
  <div class="row" style="align-items:flex-end;margin-bottom:14px"><div><h1>Histórico</h1><p class="sub" style="margin:0">${ks.length} meses · ${mesLabel(ks[0])} a ${mesLabel(ks[ks.length-1])}</p></div></div>
  <div class="card m-dobra" data-dobra="hist-graf"><div class="row m-dobra-h"><h2 style="margin:0">Realizado × meta por mês</h2></div>
    <div class="legend"><span><i class="lg-bar"></i>Realizado</span><span><i class="lg-line"></i>Meta</span></div>
    <div class="chartbox" style="height:320px"><canvas id="chHist"></canvas></div></div>
  <div class="card" style="margin-top:12px"><div class="row" style="margin-bottom:8px"><h2 style="margin:0">Anos e meses</h2><div class="sp"></div><span class="small muted">Clique no ano para ver os meses e no mês para ver os setores</span></div>
    ${historicoCascata(rows)}
    <p class="small muted">Meses fechados: % sobre a meta do mês. Mês em andamento: % sobre a meta até a data. vs. ano anterior: mesmo período.</p>
  </div>
  <div class="card m-dobra" data-dobra="hist-matriz" style="margin-top:12px"><div class="row m-dobra-h" style="margin-bottom:10px"><h2 style="margin:0">Setores mês a mês</h2><div class="sp"></div><div class="tabs2" id="hModo"><button data-m="pct" class="${modo==='pct'?'on':''}">% da meta</button><button data-m="val" class="${modo==='val'?'on':''}">Realizado (R$ mil)</button></div></div>
    <div class="tw" style="max-height:620px"><table><thead><tr><th>Mês</th>${ids.map(i=>`<th class="n" style="white-space:normal;min-width:74px">${esc(nomes[i]||i)}</th>`).join('')}</tr></thead>
    <tbody>${rows.slice().reverse().map(r=>`<tr><td style="white-space:nowrap"><b>${mesLabel(r.k)}</b></td>${ids.map(i=>cell(r,i)).join('')}</tr>`).join('')}</tbody></table></div>
  </div>`;
  app.querySelectorAll('[data-open]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); trocarMes(b.dataset.open).then(()=>{ location.hash='#painel'; }); });
  $('#hModo').querySelectorAll('button').forEach(b=>b.onclick=()=>{S.histModo=b.dataset.m; render();});
  aplicarCelular(app);
  const cv=$('#chHist'); if(cv&&window.Chart){ const ch=new Chart(cv,{data:{labels:rows.map(r=>{const [y,m]=r.k.split('-'); return MESES[+m-1].slice(0,3)+'/'+y.slice(2);}),datasets:[
    {type:'bar',label:'Realizado',data:rows.map(r=>r.real),backgroundColor:rows.map(r=>r.real>=r.metaMes?'#2f5d8a':'#9db6cf'),borderRadius:4,maxBarThickness:26,order:2},
    {type:'line',label:'Meta',data:rows.map(r=>r.metaMes),borderColor:'#a39e94',borderDash:[5,4],borderWidth:2,pointRadius:2,pointBackgroundColor:'#a39e94',order:1}]},
    options:baseOpts({plugins:{legend:{display:false},tooltip:{backgroundColor:'#161514',padding:10,bodyFont:chartFont,titleFont:{...chartFont,weight:'700'},callbacks:{title:i=>mesLabel(rows[i[0].dataIndex].k),label:c=>` ${c.dataset.label}: ${brl0(c.parsed.y)}`,afterBody:i=>{const r=rows[i[0].dataIndex]; const o=[`Atingido: ${pct(r.fechado?r.pMes:r.pAte)}`]; if(r.cresc!=null) o.push(`vs. ano anterior: ${pct(r.cresc)}`); return o;}}}},scales:{x:{grid:{display:false},ticks:{font:chartFont,color:'#8a867e',maxRotation:0,autoSkip:true}},y:{grid:{color:'#eeeae2'},border:{display:false},ticks:{font:chartFont,color:'#8a867e',callback:v=>(v/1e6).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mi'}}}})}); S.charts.push(ch); }
}

/* ---------- SETOR ---------- */
function renderSetor(app, doc){
  const {loja,setores} = calc(doc,S.cutoff);
  if(!S.setorSel || !setores.find(s=>s.id===S.setorSel)) S.setorSel = setores[0]?.id;
  const s = setores.find(x=>x.id===S.setorSel);
  const compS = comparativos(doc, S.cutoff, s.id);
  app.innerHTML = `
  <div class="row" style="align-items:flex-end;margin-bottom:14px">
    <div>${S.voltarPainel?'<button class="btn" id="bVoltarPainel" style="margin-bottom:8px">← Voltar ao painel</button>':''}<h1>${esc(s.nome)}</h1><p class="sub" style="margin:0">${mesLabel(doc.mes)}${S.gerente?` · representa ${pct(s.share)} da meta da loja`:''}</p></div>
    <div class="sp"></div>
    <label class="f">Setor<select id="selSetor">${setores.map(x=>`<option value="${x.id}" ${x.id===s.id?'selected':''}>${esc(x.nome)}</option>`).join('')}</select></label>
    ${['ana','per','bdj','trc'].includes(S.setorAba)?'':cutoffSelect(doc)}
  </div>
  <div class="tabs2 abas-setor" id="abSetor"><button data-a="dia" class="${(!['bal','ana','per','bdj','trc'].includes(S.setorAba))?'on':''}">📈 Dia a dia</button><button data-a="bal" class="${S.setorAba==='bal'?'on':''}">📦 Balanço</button><button data-a="ana" class="${S.setorAba==='ana'?'on':''}">🔎 <span class="d-inl">Análise de vendas</span><span class="m-inl">Vendas</span></button><button data-a="per" class="${S.setorAba==='per'?'on':''}">🗑️ Perdas</button>${SETORES_TROCA.includes(s.id)?`<button data-a="trc" class="${S.setorAba==='trc'?'on':''}">🔄 Trocas</button>`:''}${['acougue','hortifruti'].includes(s.id)?`<button data-a="bdj" class="${S.setorAba==='bdj'?'on':''}">🍱 <span class="d-inl">Embandeijados</span><span class="m-inl">Bandejas</span></button>`:''}</div>
  ${!['bal','ana','per','bdj','trc'].includes(S.setorAba)&&!S.gerente?cardHojeEncarregado(doc,loja,s):''}
  ${S.setorAba==='bal'?'<div id="balSetorBox"><div class="empty"><span class="spin"></span> Carregando balanços…</div></div>':(S.setorAba==='ana'||S.setorAba==='bdj')?'<div id="anaBox"><div class="empty"><span class="spin"></span> Carregando análise…</div></div>':S.setorAba==='trc'?'<div id="trcBox"><div class="empty"><span class="spin"></span> Carregando trocas…</div></div>':S.setorAba==='per'?'<div id="perBox"><div class="empty"><span class="spin"></span> Carregando perdas…</div></div>':`
  <div class="grid kpis">
    <div class="kpi hero ${S.gerente?'':'m-hide'}"><div class="l">% até a data</div><div class="v">${pct(s.pAte)}</div><div class="d">${STXT[status(s.pAte)]} · ${s.real>=s.metaAte?'+':''}${brl0(s.real-s.metaAte)}</div></div>
    <div class="kpi"><div class="l">Realizado</div><div class="v">${brl0(s.real)}</div><div class="d">Meta até a data ${brl0(s.metaAte)}</div></div>
    <div class="kpi m-hide"><div class="l">Meta do mês</div><div class="v">${brl0(s.meta)}</div><div class="d">${pct(s.pMes)} · falta ${brl0(s.falta)}</div>${barH(s.pMes)}</div>
    <div class="kpi m-hide"><div class="l">Projeção</div><div class="v">${brl0(s.proj)}</div><div class="d">${pct(s.proj/s.meta)} da meta</div></div>
    <div class="kpi ${S.gerente?'':'m-hide'}"><div class="l">Precisa vender/dia</div><div class="v">${brl0(s.necDia)}</div><div class="d">Meta de ${loja.proxDia?fDate(loja.proxDia):'—'}: ${brl0(s.metaProx)}</div></div>
    <div class="kpi"><div class="l">Perda</div><div class="v">${brl0(s.perda)}</div><div class="d">${pct(s.pPerda,2)} sobre a venda${s.perdaBal?` · inclui <a href="#" data-goaba="bal">${brl0(s.perdaBal)} de balanço</a>`:''}</div>${compS?.pm?`<div class="d">vs. mês passado: ${varTxt(s.perda, compS.pm.perda, true)}</div>`:''}</div>
    <div class="kpi m-hide ${S.gerente?'':'hide'}"><div class="l">Participação real</div><div class="v">${pct(s.partReal)}</div><div class="d">da venda dos setores (planejado ${pct(s.share)})</div></div>
    ${kpisComparativos(compS)}
  </div>
  <button class="btn m-only kpi-mais" data-kpimais>＋ Ver mais números</button>
  ${alertasPainel(doc, loja, [s], true)}
  ${cardComparativos(compS, s.nome)}
  <div id="calVendas"></div>
  <div class="card m-dobra" data-dobra="setor-graf" style="margin-top:12px">
    <div class="row m-dobra-h"><h2 style="margin:0">Gráfico do mês</h2><div class="sp"></div><div class="tabs2" id="chTabs"><button data-c="dia" class="${(S.chMode||'dia')==='dia'?'on':''}">Diário</button><button data-c="acum" class="${S.chMode==='acum'?'on':''}">Acumulado</button></div></div>
    <div class="legend"><span><i class="lg-bar"></i>Realizado</span><span><i class="lg-line"></i>Meta</span></div>
    <div class="chartbox"><canvas id="chSet"></canvas></div>
  </div>
  <div class="card" style="margin-top:12px">
    <h2 class="m-only">Dia a dia</h2>${listaDiasCelular(s.daily, S.cutoff)}
    <div class="tw d-only"><table><thead><tr><th>Dia</th><th class="n">Meta</th><th class="n">Realizado</th><th>% atingido</th><th class="n">Diferença</th><th class="n">Acum. meta</th><th class="n">Acum. real</th><th class="n">% acum.</th><th class="n">Perda</th><th class="n">% perda</th></tr></thead>
    <tbody>${(()=>{let am=0,ar=0; return s.daily.map(d=>{am+=d.meta; ar+=d.real; const p=d.real&&d.meta?d.real/d.meta:null; const fut=!d.real; return `<tr style="${fut?'color:#aaa':''}"><td>${fDateL(d.k)}${marcaData(d.k)}</td><td class="n">${brl0(d.meta)}</td><td class="n">${d.real?brl(d.real):'—'}</td><td>${d.real?badge(p):''}</td><td class="n">${d.real?brl0(d.real-d.meta):'—'}</td><td class="n">${brl0(am)}</td><td class="n">${d.real||d.ate?brl0(ar):'—'}</td><td class="n">${d.real||d.ate?pct(ar/am):'—'}</td><td class="n">${d.perda?brl(d.perda):'—'}${d.bal?` <span class="badge b-warn" title="Inclui ${brl(d.bal)} do balanço">📦 balanço</span>`:''}</td><td class="n">${d.perda&&d.real?pct(d.perda/d.real,2):'—'}</td></tr>`;}).join('');})()}</tbody>
    <tfoot><tr><td>Total</td><td class="n">${brl0(sum(s.daily.map(d=>d.meta)))}</td><td class="n">${brl0(s.real)}</td><td></td><td></td><td></td><td></td><td></td><td class="n">${brl0(s.perda)}</td><td class="n">${pct(s.pPerda,2)}</td></tr></tfoot></table></div>
  </div>`}`;
  $('#selSetor').onchange=e=>{S.setorSel=e.target.value; render();};
  const bv=$('#bVoltarPainel'); if(bv) bv.onclick=()=>{ if(history.length>1) history.back(); else location.hash='#painel'; };
  bindCutoff();
  $('#abSetor').querySelectorAll('button').forEach(b=>b.onclick=()=>{ S.setorAba=b.dataset.a; render(); marcarBnav(); });
  app.querySelectorAll('[data-goaba]').forEach(a=>a.onclick=e=>{ e.preventDefault(); S.setorAba=a.dataset.goaba; render(); window.scrollTo(0,0); });
  if(!S.gerente && !['bal','ana','per','bdj','trc'].includes(S.setorAba)) preencherQuedasEncarregado(s);
  if(S.setorAba==='bal'){ renderBalancosSetor($('#balSetorBox'), s, doc); return; }
  if(S.setorAba==='bdj' && !['acougue','hortifruti'].includes(s.id)) S.setorAba='ana';
  if(S.setorAba==='ana'||S.setorAba==='bdj'){ renderAnaliseSetor($('#anaBox'), s); return; }
  if(S.setorAba==='per'){ renderPerdasSetor($('#perBox'), s); return; }
  if(S.setorAba==='trc'){ if(!SETORES_TROCA.includes(s.id)){ S.setorAba='per'; return render(); } renderTrocasSetor($('#trcBox'), s); return; }
  $('#chTabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{S.chMode=b.dataset.c; render();});
  drawLojaChart({daily:s.daily},'chSet');
  montarCalVendas($('#calVendas'), s, doc);
  aplicarCelular(app);
}
async function renderBalancosSetor(box, s, doc){
  const sid=s.id;
  let lista=[];
  try{ lista=await q(S.sb.from('balancos').select('*, balanco_comentarios(count)').eq('setor_id',sid).order('data',{ascending:false}).order('id',{ascending:false}).limit(60)); }
  catch(e){ box.innerHTML=`<div class="note err">Erro ao carregar: ${esc(e.message)}</div>`; return; }
  if(S.view!=='setor' || S.setorAba!=='bal' || S.setorSel!==sid || !box.isConnected) return;
  completarBalancosAntigos(lista.map(b=>({...b, valor_perda_antes:b.valor_perda}))).then(async m=>{ if(m && box.isConnected){ const ds=(S._balCorrigidos||[]).map(x=>x.data); avisarBalCorrigidos(); for(const d of new Set(ds)) await aposMudarBalanco(d).catch(()=>{}); if(box.isConnected) renderBalancosSetor(box,s,doc); } });
  const anteriorDe=b=>lista.find(x=>x.data<b.data || (x.data===b.data && x.id<b.id));
  S._anteriorDe=anteriorDe;
  const varia=b=>{ const a=anteriorDe(b); if(!a) return null; const v=+b.valor_perda||0, va=+a.valor_perda||0; return {a, dif:v-va, pct: va?(v-va)/va:null}; };
  const fmtVar=x=> !x ? '<span class="muted small">primeiro balanço</span>' : `<span style="color:${x.dif>0?'var(--bad)':x.dif<0?'var(--good)':'inherit'};font-weight:700">${x.dif>0?'▲ +':x.dif<0?'▼ ':''}${brl0(x.dif)}${x.pct!=null?` (${x.dif>0?'+':''}${pct(x.pct,0)})`:''}</span>`;
  const doMes=lista.filter(b=>b.data.slice(0,7)===doc.mes);
  const totMes=doMes.reduce((a,b)=>a+(+b.valor_perda||0),0);
  const ult=lista[0]; const xu=ult?varia(ult):null;
  const ult6=lista.slice(0,6); const media=ult6.length?ult6.reduce((a,b)=>a+(+b.valor_perda||0),0)/ult6.length:0;
  box.innerHTML=`
  <div class="row" style="margin-bottom:10px"><div class="small muted">Balanços de estoque do ${esc(s.nome)} — todos os meses. Toque num balanço para ver o relatório, a análise e os comentários.</div><div class="sp"></div>${S.gerente?'<button class="btn p" id="bsNovo">＋ Novo balanço</button>':''}</div>
  <div class="grid kpis">
    <div class="kpi hero"><div class="l">Último balanço</div><div class="v">${ult?brl0(+ult.valor_perda):'—'}</div><div class="d">${ult?(ult.periodo_inicio?`${fDate(ult.periodo_inicio)} a ${fDate(ult.data)}`:fDateL(ult.data)):'nenhum balanço ainda'}</div>${ult?`<div class="d">vs. anterior: ${fmtVar(xu)}</div>`:''}</div>
    <div class="kpi"><div class="l">Perda em balanço em ${mesLabel(doc.mes)}</div><div class="v">${totMes?brl0(totMes):'—'}</div><div class="d">${doMes.length} balanço(s)${totMes&&s.real?` · ${pct(totMes/s.real,2)} da venda`:''}</div></div>
    <div class="kpi"><div class="l">Média ${ult6.length>1?`dos últimos ${ult6.length} balanços`:"dos balanços"}</div><div class="v">${ult6.length?brl0(media):'—'}</div><div class="d">${ult&&ult6.length>1?((+ult.valor_perda>media)?'<span style="color:var(--bad)">último acima da média</span>':'<span style="color:var(--good)">último abaixo da média</span>'):''}</div></div>
    <div class="kpi"><div class="l">Balanços registrados</div><div class="v">${lista.length}</div><div class="d">${lista.length?`desde ${fDate(lista[lista.length-1].data)}`:''}</div></div>
  </div>
  <div class="card" style="margin-top:12px">
    ${lista.length?`<div class="tw"><table class="t-bal"><thead><tr><th>Período</th><th class="n">Perda</th><th class="hm">Balanço anterior</th><th>Variação</th><th class="hm">Arquivo</th><th class="hm">Observação</th><th class="n hm">Coment.</th><th class="hm"></th></tr></thead><tbody>
    ${lista.map(b=>{ const x=varia(b); return `<tr class="click" data-b="${b.id}"><td>${b.periodo_inicio?`${fDate(b.periodo_inicio)} a ${fDate(b.data)}`:fDateL(b.data)}${b.analise?' <span class="badge b-good" title="Relatório analisado">análise</span>':''}</td><td class="n"><b>${brl(+b.valor_perda)}</b></td><td class="small hm">${x?`${fDate(x.a.data)} · ${brl0(+x.a.valor_perda)}`:'—'}</td><td class="small">${fmtVar(x)}</td><td class="small hm">${b.arquivo_nome?'📎 '+esc(b.arquivo_nome):'<span class="muted">—</span>'}</td><td class="small hm" style="max-width:260px">${esc((b.observacao||'').slice(0,90))}${(b.observacao||'').length>90?'…':''}</td><td class="n hm">${b.balanco_comentarios?.[0]?.count||0}</td><td class="hm"><button class="btn" style="padding:4px 10px">Abrir</button></td></tr>`; }).join('')}
    </tbody></table></div>`:`<div class="empty">Nenhum balanço do ${esc(s.nome)} ainda.${S.gerente?' Clique em “Novo balanço” para lançar.':''}</div>`}
  </div>`;
  const bn=$('#bsNovo'); if(bn) bn.onclick=()=>{ S.balSetor=sid; formBalanco(null); };
  box.querySelectorAll('[data-b]').forEach(r=>r.onclick=()=>alternarBalancoInline(r, lista.find(b=>String(b.id)===r.dataset.b)));
}

/* ---------- LANÇAR ---------- */
function renderLancar(app, doc){
  const dias=diasDoMes(doc.mes);
  if(!S.lancData || !S.lancData.startsWith(doc.mes)){ const lst=lastDataDay(doc); S.lancData = lst ? dias[Math.min(dias.indexOf(lst)+1,dias.length-1)] : dias[0]; }
  const k=S.lancData; const d=doc.dias?.[k]||{};
  const nSet=doc.setores.length;
  const chip = x => { const dd=doc.dias?.[x]; const n=dd?.vendas?Object.keys(dd.vendas).filter(i=>dd.vendas[i]).length:0; const cls = n>=nSet?'full':(n||dd?.total)?'part':''; const fut = x>todayIso()?'fut':''; return `<div class="dchip ${cls} ${fut} ${x===k?'sel':''} ${S.datas?.has(x)?'esp':''}" data-d="${x}" title="${esc(S.datas?.get(x)?.nome||'')}">${DSEM[pDate(x).getDay()]}<b>${x.slice(8)}</b></div>`; };
  const aiOk = false;
  app.innerHTML = `
  <h1>Lançar vendas</h1><p class="sub">Importe o relatório de vendas (Excel, CSV ou PDF), cole o texto ou digite os valores. Tudo é conferido antes de salvar.${S.gerente?'':' Você lança apenas: <b>'+esc(doc.setores.map(x=>x.nome).join(', '))+'</b>.'}</p>
  <div class="card">
    <div class="row" style="margin-bottom:8px"><b>Escolha o dia</b><div class="sp"></div><span class="small muted"><span class="sw" style="background:var(--good-bg);border:1px solid #a9d8b8"></span>completo <span class="sw" style="background:var(--warn-bg);border:1px solid #f1d98a;margin-left:8px"></span>parcial</span></div>
    <div class="daylist">${dias.map(chip).join('')}</div>
  </div>

  <div class="grid imp" style="margin-top:12px">
    <div class="drop" id="dropImg"><div class="ico">📷</div><h3>Foto ou print do relatório</h3><p>O site lê a imagem (OCR) e preenche os setores · funciona melhor com print ou foto reta e nítida</p><div style="margin-top:10px"><button class="btn y" id="bImg">Escolher imagem</button></div><input type="file" id="fImg" accept="image/*" multiple class="hide"></div>
    <div class="drop" id="dropFile"><div class="ico">📊</div><h3>Relatório em arquivo</h3><p>Excel, CSV ou PDF · aceita vários de uma vez: vendas (acumulada ou do dia), perdas, embandeijados, acertos e balanços — o site reconhece cada um</p><div style="margin-top:10px"><button class="btn y" id="bFile">Escolher arquivo</button></div><input type="file" id="fFile" accept=".xlsx,.xls,.xlsm,.csv,.txt,.pdf" multiple class="hide"></div>
    <div class="drop"><div class="ico">📋</div><h3>Colar texto</h3><p>Copie as linhas do relatório e cole aqui</p><div style="margin-top:10px"><button class="btn y" id="bPaste">Colar relatório</button></div></div>
  </div>

  <div class="card" style="margin-top:12px">
    <div class="row" style="margin-bottom:10px"><h2 style="margin:0">${fDateL(k)} · meta ${S.gerente?'da loja':'dos seus setores'} ${brl0(d.meta)}</h2><div class="sp"></div><span id="lTot" class="num" style="font-size:20px;font-weight:700"></span></div>
    <div class="tw"><table id="tLanc"><thead><tr><th>Setor</th><th class="n">Meta do dia</th><th class="n" style="width:170px">Venda (R$)</th><th class="hm" style="width:110px">% meta</th><th class="n" style="width:150px">Perda (R$)</th></tr></thead>
    <tbody>${doc.setores.map(s=>{const sm=(+d.meta||0)*(s.meta/(doc.metaLoja||1)); return `<tr><td><b>${esc(s.nome)}</b></td><td class="n">${brl0(sm)}</td><td><input class="in" inputmode="decimal" data-v="${s.id}" value="${d.vendas?.[s.id]!=null?nf(d.vendas[s.id]):''}" placeholder="0,00"></td><td class="hm" data-p="${s.id}" data-m="${sm}"></td><td><input class="in" inputmode="decimal" data-l="${s.id}" value="${d.perdas?.[s.id]!=null?nf(d.perdas[s.id]):''}" placeholder="0,00"></td></tr>`;}).join('')}</tbody>
    </table></div>
    <div class="row" style="margin-top:12px">
      <label class="f ${S.gerente?'':'hide'}" style="max-width:240px">Total do caixa (opcional — se preenchido, é o realizado da loja)<input class="in" inputmode="decimal" id="inTotal" value="${d.total!=null?nf(d.total):''}" placeholder="opcional"></label>
      <div class="sp"></div>
      <div class="m-sticky"><button class="btn" id="bLimpar">Limpar dia</button>
      <button class="btn p" id="bSalvar">💾 Salvar ${fDate(k)}</button></div>
    </div>
  </div>`;
  app.querySelectorAll('.dchip').forEach(c=>c.onclick=()=>{ S.lancData=c.dataset.d; render(); });
  const upd=()=>{ let t=0; app.querySelectorAll('[data-v]').forEach(i=>{ const v=parseNum(i.value)||0; t+=v; const td=app.querySelector(`[data-p="${i.dataset.v}"]`); const m=+td.dataset.m; td.innerHTML = v? badge(v/m):''; }); $('#lTot').innerHTML = `Total ${brl(t)} ${d.meta?badge(t/d.meta):''}`; };
  app.querySelectorAll('input.in').forEach(i=>i.addEventListener('input',()=>{i.classList.add('chg');upd();}));
  upd();
  $('#bSalvar').onclick=()=>{
    const nd=clone(doc); const day=nd.dias[k]=nd.dias[k]||{meta:d.meta||0};
    const vendas={}, perdas={};
    app.querySelectorAll('[data-v]').forEach(i=>{ const v=parseNum(i.value); if(i.value.trim()!==''&&!isNaN(v)) vendas[i.dataset.v]=round2(v); });
    app.querySelectorAll('[data-l]').forEach(i=>{ const v=parseNum(i.value); if(i.value.trim()!==''&&!isNaN(v)&&v) perdas[i.dataset.l]=round2(v); });
    if(Object.keys(vendas).length) day.vendas=vendas; else delete day.vendas;
    if(Object.keys(perdas).length) day.perdas=perdas; else delete day.perdas;
    const tv=parseNum($('#inTotal').value); if($('#inTotal').value.trim()&&!isNaN(tv)) day.total=round2(tv); else delete day.total;
    saveDoc(nd, `Vendas de ${fDate(k)} salvas ✔`).then(ok=>{ if(ok){ S.cutoff=null; } });
  };
  $('#bLimpar').onclick=()=>confirmBox(`Apagar vendas, perdas e total de ${fDateL(k)}? A meta do dia é mantida.`,()=>{ const nd=clone(doc); const day=nd.dias[k]||{}; nd.dias[k]={meta:day.meta||0}; saveDoc(nd,'Dia limpo'); });
  // importações
  const fImg=$('#fImg'), fFile=$('#fFile');
  $('#bFile').onclick=()=>fFile.click();
  $('#bImg').onclick=()=>fImg.click(); fImg.onchange=()=>{ const fs=[...fImg.files]; fImg.value=''; if(fs.length) importImages(fs); };
  fFile.onchange=()=>{ const fs=[...fFile.files]; fFile.value=''; if(fs.length) importarVarios(fs); };
  $('#bPaste').onclick=pasteDialog;
  for(const [id,fn] of [['dropImg',f=>importImages(f.filter(x=>x.type.startsWith('image/')))],['dropFile',f=>f[0].type.startsWith('image/')?importImages(f):importarVarios(f)]]){
    const z=$('#'+id); z.ondragover=e=>{e.preventDefault();z.classList.add('over');}; z.ondragleave=()=>z.classList.remove('over');
    z.ondrop=e=>{e.preventDefault();z.classList.remove('over'); const fs=[...e.dataTransfer.files]; if(!fs.length) return; fn(fs); };
  }
}

/* ===================== modais ===================== */
function modal(html){ const r=$('#modalRoot'); r.innerHTML=`<div class="modal-bg"><div class="modal">${html}</div></div>`; return r.firstChild.firstChild; }
function closeModal(){ $('#modalRoot').innerHTML=''; }
function confirmBox(msg,ok){ const m=modal(`<h2>Confirmar</h2><p>${esc(msg)}</p><div class="row"><div class="sp"></div><button class="btn" id="mN">Cancelar</button><button class="btn p" id="mY">Confirmar</button></div>`); $('#mN',m).onclick=closeModal; $('#mY',m).onclick=()=>{closeModal();ok();}; }
function busy(msg){ modal(`<h2><span class="spin"></span> ${esc(msg)}</h2><p class="muted small">Isso pode levar alguns segundos.</p>`); }

function pasteDialog(){
  const m=modal(`<h2>Colar relatório</h2><p class="small muted">Cole as linhas do relatório (setor e valor). Pode colar direto do sistema, do WhatsApp ou do Excel.</p>
  <textarea id="ta" style="width:100%;height:220px;border:1px solid var(--line);border-radius:10px;padding:10px;font-family:monospace"></textarea>
  <div class="row" style="margin-top:10px"><div class="sp"></div><button class="btn" id="mN">Cancelar</button>${S.sample?'<button class="btn" id="mAI">Ler com IA</button>':''}<button class="btn p" id="mY">Ler valores</button></div>`);
  $('#mN',m).onclick=closeModal;
  $('#mY',m).onclick=()=>{ const t=$('#ta',m).value; const lines=t.split(/\r?\n/).map(l=>l.split('\t').join('  ')); const r=parseLines(lines.map(l=>({text:l,nums:null}))); r.fonte='texto colado'; r.rawText=t; if(Object.keys(r.vendas).length<3 && S.sample){ aiFromText(t,'texto colado'); } else reviewImport(r); };
  const ai=$('#mAI',m); if(ai) ai.onclick=()=>aiFromText($('#ta',m).value,'texto colado');
}

/* ===================== arquivos ===================== */
async function importFile(file){
  if(!file) return; const name=file.name.toLowerCase();
  try{
    if(name.endsWith('.pdf')) return await importPdf(file);
    if(name.endsWith('.csv')||name.endsWith('.txt')){ const t=await file.text(); const lines=t.split(/\r?\n/); const r=parseLines(lines.map(l=>({text:l.replace(/[;\t]/g,'  ')}))); r.fonte=file.name; if(Object.keys(r.vendas).length<3&&S.sample) return aiFromText(t,file.name); return reviewImport(r); }
    if(!window.XLSX) throw new Error('Leitor de Excel não carregou.');
    busy('Lendo planilha…');
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
    if(wb.SheetNames.includes('META DIARIA')) { closeModal(); return modeloDialog(wb,file.name); }
    const rows=[]; let allText='';
    for(const sn of wb.SheetNames){ const ws=wb.Sheets[sn]; const arr=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});
      for(const row of arr){ const cells=row.filter(c=>c!=null&&c!==''); if(!cells.length) continue; const strs=cells.filter(c=>typeof c==='string'); const nums=cells.filter(c=>typeof c==='number'); const lab=strs.find(x=>matchSector(x));
        rows.push({text:cells.map(c=>c instanceof Date?isoOf(c):c).join(' | '), label:lab||strs.join(' '), nums: nums.length?nums:extractNums(strs.join(' ').replace(lab||'',''))});
        allText += cells.map(c=>c instanceof Date?isoOf(c):(typeof c==='number'?String(c).replace('.',','):c)).join('\t')+'\n'; } }
    const r=parseLines(rows); r.fonte=file.name;
    const ambig = r.avisos.length>0;
    if((Object.keys(r.vendas).length<3 || ambig) && S.sample){ return aiFromText(allText, file.name); }
    reviewImport(r);
  }catch(e){ console.error(e); closeModal(); toast('Não consegui ler o arquivo: '+(e.message||e),5000); }
}
async function importPdf(file){
  busy('Lendo PDF…');
  if(!window.pdfjsLib) throw new Error('Leitor de PDF não carregou.');
  const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  let lines=[];
  for(let p=1;p<=Math.min(pdf.numPages,15);p++){
    const pg=await pdf.getPage(p); const tc=await pg.getTextContent();
    const map=new Map(); for(const it of tc.items){ const y=Math.round(it.transform[5]/3); if(!map.has(y)) map.set(y,[]); map.get(y).push({x:it.transform[4],s:it.str}); }
    [...map.entries()].sort((a,b)=>b[0]-a[0]).forEach(([,its])=>lines.push(its.sort((a,b)=>a.x-b.x).map(i=>i.s).join('  ')));
  }
  const rv=Parser.analisarRelatorioVendas(lines);
  if(rv && rv.nivel==='CLASSE'){ closeModal(); S.setorAba='bdj'; return importarRelatorioVendas(file, 'acougue'); }
  if(rv){ closeModal(); return lancarPorRelatorio(rv, file); }
  if(Parser.analisarRelatorioTransferencias(lines)){ closeModal(); return importarRelatorioTrocas(file); }
  if(Parser.analisarRelatorioAcertos(lines)){ closeModal(); return importarRelatorioAcertos(file); }
  if(Parser.analisarRelatorioPerdas(lines)){ closeModal(); return importarRelatorioPerdas(file, S.setorSel||''); }
  const text=lines.join('\n');
  if(text.replace(/\s/g,'').length<30){ // PDF escaneado → imagens
    const canvases=[]; for(let p=1;p<=Math.min(pdf.numPages,4);p++){ const pg=await pdf.getPage(p); const vp=pg.getViewport({scale:2.2}); const c=document.createElement('canvas'); c.width=vp.width; c.height=vp.height; await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise; canvases.push(c); }
    return await ocrParaRevisao(canvases, file.name);
    const imgs=[]; for(let p=1;p<=Math.min(pdf.numPages,4);p++){ const pg=await pdf.getPage(p); const vp=pg.getViewport({scale:2}); const c=document.createElement('canvas'); c.width=vp.width; c.height=vp.height; await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise; imgs.push(await new Promise(r=>c.toBlob(r,'image/jpeg',.85))); }
    const r=await aiCall(aiPrompt(curDoc(),'O relatório está nas imagens anexadas (PDF escaneado).'),imgs); r.fonte=file.name; return reviewImport(r);
  }
  if(S.sample) return aiFromText(text,file.name);
  const r=parseLines(lines.map(l=>({text:l}))); r.fonte=file.name; reviewImport(r);
}

/* ===================== revisão da importação ===================== */
function reviewImport(r){
  const doc=curDoc(); const dias=diasDoMes(doc.mes);
  let alvo = (r.data && dias.includes(r.data)) ? r.data : S.lancData;
  const dataFora = r.data && !dias.includes(r.data);
  const nV=Object.keys(r.vendas).length, nP=Object.keys(r.perdas||{}).length;
  const m=modal(`<h2>📥 Conferir importação</h2>
  <p class="small muted" style="margin-top:-6px">Fonte: ${esc(r.fonte||'')} · ${nV} setor(es) com venda${nP?` · ${nP} com perda`:''}</p>
  ${r.obs?`<div class="note small" style="margin-bottom:10px">${esc(r.obs)}</div>`:''}
  ${r.textoLido?`<details style="margin-bottom:10px"><summary class="small" style="cursor:pointer">Ver o texto que foi lido da imagem</summary><pre style="white-space:pre-wrap;font-size:12px;background:#faf9f6;border:1px solid var(--line);border-radius:8px;padding:8px;max-height:200px;overflow:auto">${esc(r.textoLido)}</pre></details>`:''}
  ${dataFora?`<div class="note err small" style="margin-bottom:10px">A data do relatório (${esc(r.data)}) não é deste mês. Escolha o dia correto abaixo.</div>`:''}
  ${!nV&&!nP?`<div class="note err" style="margin-bottom:10px">Nenhum valor de setor foi encontrado. ${S.sample?'Tente pela foto/IA ou ':''}digite manualmente.</div>`:''}
  <div class="row" style="margin-bottom:10px"><label class="f">Lançar no dia<select id="rDia">${dias.map(k=>`<option value="${k}" ${k===alvo?'selected':''}>${fDateL(k)}${temVenda(doc.dias?.[k])?' • já tem dados':''}</option>`).join('')}</select></label>
  <label class="small" style="display:flex;gap:6px;align-items:center;margin-top:18px"><input type="checkbox" id="rKeep" checked> manter setores que não vieram no relatório</label></div>
  <div class="tw" style="max-height:52vh"><table><thead><tr><th>Setor</th><th class="n">Atual</th><th class="n" style="width:160px">Importado</th><th class="n" style="width:140px">Perda</th></tr></thead>
  <tbody id="rBody"></tbody><tfoot><tr><td>Total</td><td class="n" id="rTA"></td><td class="n" id="rTI"></td><td class="n" id="rTP"></td></tr></tfoot></table></div>
  ${r.totalRel?`<p class="small muted">Total informado no relatório: <b>${brl(r.totalRel)}</b></p>`:''}
  <div class="row" style="margin-top:12px"><div class="sp"></div><button class="btn" id="mN">Cancelar</button><button class="btn p" id="mY">✔ Aplicar e salvar</button></div>`);
  const draw=()=>{
    const k=$('#rDia',m).value; const d=doc.dias?.[k]||{};
    $('#rBody',m).innerHTML = doc.setores.map(s=>{ const a=d.vendas?.[s.id]; const v=r.vendas[s.id]; const p=r.perdas?.[s.id]; const warn=(r.avisos||[]).includes(s.id);
      return `<tr><td><b>${esc(s.nome)}</b>${warn?' <span class="badge b-warn">conferir</span>':''}</td><td class="n muted">${a!=null?brl(a):'—'}</td><td><input class="in ${v!=null?'chg':''}" data-i="${s.id}" value="${v!=null?nf(v):''}" placeholder="—"></td><td><input class="in" data-pp="${s.id}" value="${p!=null?nf(p):''}" placeholder="—"></td></tr>`; }).join('');
    const tot=()=>{ let ti=0,tp=0; m.querySelectorAll('[data-i]').forEach(i=>ti+=parseNum(i.value)||0); m.querySelectorAll('[data-pp]').forEach(i=>tp+=parseNum(i.value)||0); $('#rTI',m).textContent=brl(ti); $('#rTP',m).textContent=tp?brl(tp):'—'; $('#rTA',m).textContent=brl(d.vendas?sum(Object.values(d.vendas)):0); };
    m.querySelectorAll('input.in').forEach(i=>i.oninput=tot); tot();
  };
  $('#rDia',m).onchange=draw; draw();
  $('#mN',m).onclick=closeModal;
  $('#mY',m).onclick=()=>{
    const k=$('#rDia',m).value; const keep=$('#rKeep',m).checked;
    const nd=clone(doc); const day=nd.dias[k]=nd.dias[k]||{meta:0};
    const vendas = keep? {...(day.vendas||{})} : {}; const perdas = keep? {...(day.perdas||{})} : {};
    m.querySelectorAll('[data-i]').forEach(i=>{ if(i.value.trim()!==''){ const v=parseNum(i.value); if(!isNaN(v)) vendas[i.dataset.i]=round2(v);} });
    m.querySelectorAll('[data-pp]').forEach(i=>{ if(i.value.trim()!==''){ const v=parseNum(i.value); if(!isNaN(v)&&v) perdas[i.dataset.pp]=round2(v);} });
    if(Object.keys(vendas).length) { day.vendas=vendas; delete day.total; } if(Object.keys(perdas).length) day.perdas=perdas;
    closeModal(); S.lancData=k; S.cutoff=null;
    saveDoc(nd, `Importado para ${fDate(k)} ✔`);
  };
}

/* ===================== METAS ===================== */
function renderMetas(app, doc){
  const host = doc? app : app.appendChild(document.createElement('div'));
  if(!doc){ host.innerHTML = novoMesCard(null)+cardImportarPlanilhas(); bindNovoMes(host,null); bindImportarPlanilhas(host); return; }
  const dias=diasDoMes(doc.mes);
  const somaDias=sum(dias.map(k=>+(doc.dias?.[k]?.meta)||0)); const somaSet=sum(doc.setores.map(s=>+s.meta||0));
  const di=doc.diarias||{orcamento:0,lancamentos:[]};
  host.innerHTML = `
  <h1>Metas do mês — ${mesLabel(doc.mes)}</h1><p class="sub">Configuração do mês: defina a meta da loja, quanto cada setor representa e a meta de cada dia. A meta diária de cada setor é calculada automaticamente: meta do dia × representação do setor.</p>
  <div class="grid two">
    <div class="card">
      <h2>Meta da loja e dos setores</h2>
      <label class="f" style="max-width:260px">Meta do mês (loja)<input class="in" id="mLoja" value="${nf(doc.metaLoja,0)}"></label>
      <div class="tw" style="margin-top:12px"><table class="t-metas"><thead><tr><th>Setor</th><th class="n" style="width:160px">Meta mês (R$)</th><th class="n" style="width:110px">Repr. %</th></tr></thead>
      <tbody>${doc.setores.map((s,i)=>`<tr><td><input value="${esc(s.nome)}" data-nome="${i}" style="border:0;font-weight:700;width:100%;background:transparent"></td><td><input class="in" data-sm="${i}" value="${nf(s.meta,0)}"></td><td><input class="in" data-sp="${i}" value="${nf((s.meta/(doc.metaLoja||1))*100,2)}"></td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Soma</td><td class="n" id="mSS">${brl0(somaSet)}</td><td class="n" id="mSP">${pct(somaSet/(doc.metaLoja||1),2)}</td></tr></tfoot></table></div>
      <p class="small muted">Altere o valor em R$ ou o %, o outro é recalculado. A soma deve dar 100%.</p>
      <div class="row"><div class="sp"></div><button class="btn p" id="mSaveSet">Salvar metas dos setores</button></div>
    </div>
    <div class="card">
      <h2>Meta de cada dia</h2>
      <div class="tw" style="max-height:560px"><table><thead><tr><th>Dia</th><th class="n" style="width:150px">Meta (R$)</th><th class="n">Peso</th></tr></thead>
      <tbody>${dias.map(k=>`<tr><td>${fDateL(k)}</td><td><input class="in" data-dm="${k}" value="${nf(+(doc.dias?.[k]?.meta)||0,0)}"></td><td class="n muted" data-dp="${k}">${pct((+(doc.dias?.[k]?.meta)||0)/(somaDias||1),1)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Soma</td><td class="n" id="mSD">${brl0(somaDias)}</td><td></td></tr></tfoot></table></div>
      <div class="row" style="margin-top:10px"><button class="btn" id="mAjust" title="Mantém o peso de cada dia e ajusta para fechar a meta do mês">Ajustar à meta do mês</button><div class="sp"></div><button class="btn p" id="mSaveDias">Salvar metas diárias</button></div>
    </div>
  </div>
  <div class="grid two" style="margin-top:12px">
    ${novoMesCard(doc)}
  </div>
  <div class="card" style="margin-top:12px"><h2>🎯 Metas por departamento</h2><p class="small muted" style="margin-top:-4px">Divida a meta de cada setor entre os departamentos do sistema. A meta aparece na Análise de vendas do setor, com o % atingido.</p><div id="mdBox"><div class="empty"><span class="spin"></span></div></div></div>
  ${cardDatasEspeciais(doc)}
  ${cardImportarPlanilhas()}`;
  // setores
  const recalcSet=()=>{ const ml=parseNum($('#mLoja',host).value)||0; let s=0; host.querySelectorAll('[data-sm]').forEach(i=>s+=parseNum(i.value)||0); $('#mSS',host).textContent=brl0(s); $('#mSP',host).textContent=pct(s/(ml||1),2); $('#mSP',host).style.color=Math.abs(s-ml)>1?'var(--bad)':''; };
  host.querySelectorAll('[data-sm]').forEach(i=>i.oninput=()=>{ const ml=parseNum($('#mLoja',host).value)||1; host.querySelector(`[data-sp="${i.dataset.sm}"]`).value=nf((parseNum(i.value)||0)/ml*100,2); recalcSet(); });
  host.querySelectorAll('[data-sp]').forEach(i=>i.oninput=()=>{ const ml=parseNum($('#mLoja',host).value)||0; host.querySelector(`[data-sm="${i.dataset.sp}"]`).value=nf(Math.round((parseNum(i.value)||0)/100*ml),0); recalcSet(); });
  $('#mLoja',host).oninput=()=>{ const ml=parseNum($('#mLoja',host).value)||0; host.querySelectorAll('[data-sp]').forEach(i=>{ host.querySelector(`[data-sm="${i.dataset.sp}"]`).value=nf(Math.round((parseNum(i.value)||0)/100*ml),0); }); recalcSet(); };
  $('#mSaveSet',host).onclick=()=>{ const nd=clone(doc); nd.metaLoja=parseNum($('#mLoja',host).value)||0; nd.setores.forEach((s,i)=>{ s.meta=parseNum(host.querySelector(`[data-sm="${i}"]`).value)||0; s.nome=host.querySelector(`[data-nome="${i}"]`).value.trim()||s.nome; }); saveDoc(nd,'Metas dos setores salvas ✔'); };
  // dias
  const recalcD=()=>{ let s=0; host.querySelectorAll('[data-dm]').forEach(i=>s+=parseNum(i.value)||0); $('#mSD',host).textContent=brl0(s); $('#mSD',host).style.color=Math.abs(s-(parseNum($('#mLoja',host).value)||0))>1?'var(--bad)':''; host.querySelectorAll('[data-dm]').forEach(i=>host.querySelector(`[data-dp="${i.dataset.dm}"]`).textContent=pct((parseNum(i.value)||0)/(s||1),1)); };
  host.querySelectorAll('[data-dm]').forEach(i=>i.oninput=recalcD); recalcD();
  $('#mAjust',host).onclick=()=>{ const ml=parseNum($('#mLoja',host).value)||0; let s=0; host.querySelectorAll('[data-dm]').forEach(i=>s+=parseNum(i.value)||0); if(!s) return; let acc=0; const ins=[...host.querySelectorAll('[data-dm]')]; ins.forEach((i,ix)=>{ let v=Math.round((parseNum(i.value)||0)/s*ml/100)*100; if(ix===ins.length-1) v=ml-acc; acc+=v; i.value=nf(v,0); }); recalcD(); };
  $('#mSaveDias',host).onclick=()=>{ const nd=clone(doc); host.querySelectorAll('[data-dm]').forEach(i=>{ const k=i.dataset.dm; nd.dias[k]=nd.dias[k]||{}; nd.dias[k].meta=parseNum(i.value)||0; }); saveDoc(nd,'Metas diárias salvas ✔'); };
  bindNovoMes(host,doc); bindImportarPlanilhas(host); bindDatasEspeciais(host); cardMetasDepartamento(host, doc);
}
function novoMesCard(doc){
  const prox = doc? (()=>{ const [y,m]=doc.mes.split('-').map(Number); const d=new Date(y,m,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })() : todayIso().slice(0,7);
  return `<div class="card"><h2>Criar novo mês</h2>
    <p class="small muted">Copia os setores e a representação de ${doc?mesLabel(doc.mes):'um modelo padrão'} e distribui a meta pelos dias com o mesmo peso de cada dia da semana.</p>
    <div class="row"><label class="f">Mês<input type="month" id="nMes" value="${prox}"></label><label class="f" style="width:180px">Meta da loja<input class="in" id="nMeta" placeholder="ex.: 2.500.000" value="${doc?nf(doc.metaLoja,0):''}"></label><button class="btn p" id="nCriar" style="margin-top:18px">Criar mês</button></div>
    </div>`;
}
function bindNovoMes(host, doc){
  const b=$('#nCriar',host); if(!b) return;
  b.onclick=()=>{
    const mes=$('#nMes',host).value; const meta=parseNum($('#nMeta',host).value);
    if(!/^\d{4}-\d{2}$/.test(mes)||!meta) return toast('Informe mês e meta.');
    const go=()=>{
      const base = doc || {metaLoja:1, setores:S.setoresAll.map(x=>({id:x.id,nome:x.nome,meta:1/S.setoresAll.length})), dias:{}};
      const setores = base.setores.map(s=>({id:s.id,nome:s.nome,meta:Math.round(meta*(s.meta/(base.metaLoja||1)))}));
      const dif = meta - sum(setores.map(s=>s.meta)); setores.sort((a,b)=>b.meta-a.meta)[0].meta += dif; setores.sort((a,b)=>base.setores.findIndex(x=>x.id===a.id)-base.setores.findIndex(x=>x.id===b.id));
      // peso por dia da semana (do mês base)
      const w=[0,0,0,0,0,0,0], c=[0,0,0,0,0,0,0];
      for(const [k,d] of Object.entries(base.dias||{})){ if(!d.meta) continue; const wd=pDate(k).getDay(); w[wd]+=d.meta; c[wd]++; }
      const avg=w.map((x,i)=>c[i]?x/c[i]:1);
      const ds=diasDoMes(mes); const pesos=ds.map(k=>avg[pDate(k).getDay()]); const tp=sum(pesos);
      const dias={}; let acc=0; ds.forEach((k,i)=>{ let v=Math.round(pesos[i]/tp*meta/1000)*1000; if(i===ds.length-1) v=meta-acc; acc+=v; dias[k]={meta:v}; });
      const nd={mes, metaLoja:meta, setores, dias, diarias:{orcamento:doc?.diarias?.orcamento||0, lancamentos:[]}};
      S.mes=mes; S.cutoff=null; S.lancData=null; saveDoc(nd, `${mesLabel(mes)} criado ✔ — revise as metas diárias`, {soMetas:true});
    };
    if(S.mesList.includes(mes)) confirmBox(`${mesLabel(mes)} já existe. Substituir as metas desse mês? (Os lançamentos de vendas são mantidos.)`, go); else go();
  };
}

/* ===================== exportar Excel ===================== */
async function exportXlsx(doc){
  if(!S.gerente) return toast('Só o gerente pode baixar o Excel.');
  if(!window.XLSX) return toast('Leitor de Excel não carregou.');
  const {loja,setores,dias}=calc(doc,S.cutoff);
  const wb=XLSX.utils.book_new();
  const res=[['Setor','Representação','Meta mês','Meta até '+fDate(S.cutoff),'Realizado','% até data','% mês','Falta','Precisa/dia','Perda','% perda']];
  setores.forEach(s=>res.push([s.nome,round2(s.share*100)/100,s.meta,round2(s.metaAte),round2(s.real),s.pAte!=null?Math.round(s.pAte*10000)/10000:null,Math.round(s.pMes*10000)/10000,round2(s.falta),round2(s.necDia),round2(s.perda),s.pPerda!=null?Math.round(s.pPerda*10000)/10000:null]));
  res.push([S.gerente?'LOJA':'TOTAL',1,loja.metaMes,round2(loja.metaAte),round2(loja.real),Math.round(loja.pAte*10000)/10000,Math.round(loja.pMes*10000)/10000,round2(loja.falta),round2(loja.necDia),round2(loja.perda),loja.pPerda]);
  const ws1=XLSX.utils.aoa_to_sheet(res); ws1['!cols']=[{wch:24},...Array(10).fill({wch:14})]; XLSX.utils.book_append_sheet(wb,ws1,'Resumo');
  const hv=['Dia','Meta loja','Realizado loja',...doc.setores.map(s=>s.nome)];
  const rv=[hv,...dias.map(k=>{const d=doc.dias?.[k]||{}; return [fDate(k),d.meta||0,round2(vendaDia(d)),...doc.setores.map(s=>d.vendas?.[s.id]??null)];})];
  const ws2=XLSX.utils.aoa_to_sheet(rv); ws2['!cols']=hv.map(()=>({wch:14})); XLSX.utils.book_append_sheet(wb,ws2,'Vendas diárias');
  const rp=[['Dia',...doc.setores.map(s=>s.nome)],...dias.map(k=>{const d=doc.dias?.[k]||{}; return [fDate(k),...doc.setores.map(s=>d.perdas?.[s.id]??null)];})];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rp),'Perdas');
  const rm=[['Dia','Meta loja',...doc.setores.map(s=>s.nome)],...dias.map(k=>{const m=+(doc.dias?.[k]?.meta)||0; return [fDate(k),m,...doc.setores.map(s=>round2(m*s.meta/(doc.metaLoja||1)))];})];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rm),'Metas diárias');
  const buf=XLSX.write(wb,{type:'array',bookType:'xlsx'});
  const url=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})); const a=document.createElement('a'); a.href=url; a.download=`Metas_${doc.mes}${S.gerente?'':'_meus_setores'}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),5000);
}

/* ===================== Supabase: leitura ===================== */
const pad2 = n => String(n).padStart(2,'0');
function fimDoMes(m){ const ds=diasDoMes(m); return ds[ds.length-1]; }
async function q(promise){ const { data, error } = await promise; if(error) throw error; return data; }
async function todasLinhas(builder){ // paginação (o Supabase devolve no máximo 1000 linhas por vez)
  const out=[]; for(let i=0;;i+=1000){ const d=await q(builder().range(i,i+999)); out.push(...d); if(d.length<1000) break; } return out;
}
function nomeSetor(id){ return S.setoresAll.find(x=>x.id===id)?.nome || id; }
function ordemSetor(id){ const i=S.setoresAll.findIndex(x=>x.id===id); return i<0?99:i; }

async function carregarListaMeses(){
  if(S.gerenteReal){ const d=await q(S.sb.from('meses').select('mes').order('mes')); S.mesList=d.map(r=>r.mes); }
  else { const d=await q(S.sb.from('metas_setor').select('mes')); S.mesList=[...new Set(d.map(r=>r.mes))].sort(); }
}
function montarDoc(mes, metaLoja, orc, metas, diasRows, lanc, diarias, metasDiaSetor){
  const setores=metas.map(m=>({id:m.setor_id,nome:nomeSetor(m.setor_id),meta:+m.meta})).sort((a,b)=>ordemSetor(a.id)-ordemSetor(b.id));
  const dias={}; diasDoMes(mes).forEach(k=>dias[k]={meta:0});
  if(diasRows) diasRows.forEach(r=>{ const k=r.data; if(!dias[k]) return; dias[k].meta=+r.meta||0; if(r.total_caixa!=null) dias[k].total=+r.total_caixa; });
  if(metasDiaSetor) metasDiaSetor.forEach(r=>{ if(dias[r.data]) dias[r.data].meta=round2((dias[r.data].meta||0)+(+r.meta||0)); });
  lanc.forEach(r=>{ const d=dias[r.data]; if(!d) return; if(r.venda!=null) (d.vendas=d.vendas||{})[r.setor_id]=+r.venda; if(r.perda!=null&&+r.perda) (d.perdas=d.perdas||{})[r.setor_id]=+r.perda; });
  const doc={mes, metaLoja: metaLoja!=null? +metaLoja : sum(setores.map(x=>x.meta)), setores, dias};
  if(diarias) doc.diarias={orcamento:+orc||0, lancamentos:diarias.map(r=>({id:r.id,data:r.data,valor:+r.valor,obs:r.observacao||''})).sort((a,b)=>a.data.localeCompare(b.data))};
  return doc;
}
async function carregarMes(mes){
  const ini=`${mes}-01`, fim=fimDoMes(mes);
  const lanc=await q(S.sb.from('lancamentos').select('data,setor_id,venda,perda').gte('data',ini).lte('data',fim));
  const bals=await q(S.sb.from('balancos').select('data,setor_id,valor_perda').gte('data',ini).lte('data',fim));
  const metas=await q(S.sb.from('metas_setor').select('setor_id,meta').eq('mes',mes));
  let doc;
  if(S.gerenteReal){
    const m=(await q(S.sb.from('meses').select('*').eq('mes',mes)))[0]||{};
    const diasRows=await q(S.sb.from('dias').select('data,meta,total_caixa').eq('mes',mes));
    const diar=await q(S.sb.from('diarias').select('id,data,valor,observacao').eq('mes',mes));
    doc=montarDoc(mes, m.meta_loja, m.diarias_orcamento, metas, diasRows, lanc, diar, null);
  } else {
    const mds=await q(S.sb.rpc('metas_diarias_setor',{p_mes:mes}));
    doc=montarDoc(mes, null, 0, metas, null, lanc, null, mds);
  }
  doc.balancos=bals; if(S.preview) doc=docComoEncarregado(doc,S.preview.setores); S.months[mes]=doc; return doc;
}
async function garantirMes(mes){ if(!S.months[mes] && S.mesList.includes(mes)) await carregarMes(mes); return S.months[mes]; }
async function carregarTudo(){ // para o histórico
  if(S._tudo) return; 
  if(S.gerenteReal){
    const meses=await q(S.sb.from('meses').select('*'));
    const metas=await todasLinhas(()=>S.sb.from('metas_setor').select('mes,setor_id,meta').order('mes').order('setor_id'));
    const dias=await todasLinhas(()=>S.sb.from('dias').select('data,mes,meta,total_caixa').order('data'));
    const lanc=await todasLinhas(()=>S.sb.from('lancamentos').select('data,setor_id,venda,perda').order('data').order('setor_id'));
    const diar=await todasLinhas(()=>S.sb.from('diarias').select('id,mes,data,valor,observacao').order('id'));
    const bals=await todasLinhas(()=>S.sb.from('balancos').select('data,setor_id,valor_perda').order('id'));
    for(const m of meses){ const mes=m.mes, ini=`${mes}-01`, fim=fimDoMes(mes);
      S.months[mes]=montarDoc(mes,m.meta_loja,m.diarias_orcamento,metas.filter(x=>x.mes===mes),dias.filter(x=>x.mes===mes),lanc.filter(x=>x.data>=ini&&x.data<=fim),diar.filter(x=>x.mes===mes),null); S.months[mes].balancos=bals.filter(x=>x.data>=ini&&x.data<=fim); if(S.preview) S.months[mes]=docComoEncarregado(S.months[mes],S.preview.setores); }
  } else { for(const m of S.mesList) if(!S.months[m]) await carregarMes(m); }
  S._tudo=true;
}
async function renderHistoricoAsync(app){
  if(!S._tudo){ app.innerHTML='<div class="empty"><span class="spin"></span> Carregando o histórico…</div>'; try{ await carregarTudo(); }catch(e){ app.innerHTML=`<div class="note err">Erro ao carregar: ${esc(e.message)}</div>`; return; } if(S.view!=='historico') return; }
  renderHistorico(app);
}

/* ===================== Supabase: gravação (compara com o que já estava salvo) ===================== */
function eqNum(a,b){ return (a==null&&b==null) || (a!=null&&b!=null&&Math.abs(a-b)<0.005); }
async function gravarDoc(nd, old, opts={}){
  const mes=nd.mes; const meus=new Set(nd.setores.map(x=>x.id));
  if(S.gerente){
    await q(S.sb.from('meses').upsert({mes, meta_loja:nd.metaLoja||0, diarias_orcamento:nd.diarias?.orcamento||0, atualizado_em:new Date().toISOString()}));
    const setoresMudaram = !old || JSON.stringify(old.setores.map(x=>[x.id,x.meta]))!==JSON.stringify(nd.setores.map(x=>[x.id,x.meta]));
    if(setoresMudaram){
      await q(S.sb.from('metas_setor').upsert(nd.setores.map(x=>({mes, setor_id:x.id, meta:x.meta||0}))));
      const sai = (old?.setores||[]).filter(x=>!meus.has(x.id)).map(x=>x.id);
      if(sai.length) await q(S.sb.from('metas_setor').delete().eq('mes',mes).in('setor_id',sai));
      // nomes dos setores
      for(const x of nd.setores){ const a=S.setoresAll.find(y=>y.id===x.id); if(a && x.nome && x.nome!==a.nome){ await q(S.sb.from('setores').update({nome:x.nome}).eq('id',x.id)); a.nome=x.nome; } }
    }
    const diasUp=[]; for(const k of diasDoMes(mes)){ const n=nd.dias[k]||{}, o=old?.dias?.[k]||{};
      if(!old || !eqNum(+n.meta||0,+o.meta||0) || (!opts.soMetas && !eqNum(n.total??null,o.total??null)))
        diasUp.push(opts.soMetas && old ? {data:k, mes, meta:+n.meta||0} : {data:k, mes, meta:+n.meta||0, total_caixa:n.total??null}); }
    if(diasUp.length) await q(S.sb.from('dias').upsert(diasUp));
    if(!opts.soMetas && JSON.stringify((old?.diarias?.lancamentos||[]).map(l=>[l.data,l.valor,l.obs||''])) !==JSON.stringify((nd.diarias?.lancamentos||[]).map(l=>[l.data,l.valor,l.obs||'']))){
      await q(S.sb.from('diarias').delete().eq('mes',mes));
      const ls=(nd.diarias?.lancamentos||[]).map(l=>({mes,data:l.data,valor:l.valor,observacao:l.obs||null})); if(ls.length) await q(S.sb.from('diarias').insert(ls));
    }
  }
  if(opts.soMetas) return;
  const up=[], del=[];
  for(const k of diasDoMes(mes)){ const n=nd.dias[k]||{}, o=old?.dias?.[k]||{};
    for(const id of meus){ const nv=n.vendas?.[id]??null, np=n.perdas?.[id]??null, ov=o.vendas?.[id]??null, op=o.perdas?.[id]??null;
      if(eqNum(nv,ov)&&eqNum(np,op)) continue;
      if(nv==null&&np==null) del.push({k,id}); else up.push({data:k, setor_id:id, venda:nv, perda:np}); } }
  for(let i=0;i<up.length;i+=500) await q(S.sb.from('lancamentos').upsert(up.slice(i,i+500)));
  const porDia={}; del.forEach(x=>(porDia[x.k]=porDia[x.k]||[]).push(x.id));
  for(const [k,ids] of Object.entries(porDia)) await q(S.sb.from('lancamentos').delete().eq('data',k).in('setor_id',ids));
}
function saveDoc(nd, msg, opts={}){
  S._salvouEm=Date.now(); S._marcaDados=undefined;
  if(S.preview){ toast('Modo visualização: nada é salvo. Saia da visualização para lançar.',4000); return Promise.resolve(false); }
  const old = S.months[nd.mes] ? clone(S.months[nd.mes]) : null;
  S.months[nd.mes]=nd; if(!S.mesList.includes(nd.mes)){ S.mesList.push(nd.mes); S.mesList.sort(); } S._tudo=false; render();
  S.writeChain = S.writeChain.then(async()=>{
    try{ await gravarDoc(nd, old, opts); await carregarMes(nd.mes); if(msg) toast(msg); render(); return true; }
    catch(e){ console.error(e); toast('Não foi possível salvar: '+(e.message||e)+'. Os dados foram recarregados.',6000); try{ await carregarListaMeses(); await carregarMes(nd.mes); }catch(_){} render(); return false; }
  });
  return S.writeChain;
}

/* ===================== importar planilhas mensais (gerente) ===================== */
async function importarMesCompleto(d){
  const mes=d.mes, ini=`${mes}-01`, fim=fimDoMes(mes);
  await q(S.sb.from('meses').upsert({mes, meta_loja:d.metaLoja, diarias_orcamento:d.diarias?.orcamento||0, atualizado_em:new Date().toISOString()}));
  await q(S.sb.from('metas_setor').delete().eq('mes',mes));
  if(d.setores.length) await q(S.sb.from('metas_setor').insert(d.setores.map(x=>({mes,setor_id:x.id,meta:x.meta}))));
  await q(S.sb.from('dias').upsert(Object.entries(d.dias).map(([k,v])=>({data:k,mes,meta:v.meta||0,total_caixa:v.total??null}))));
  await q(S.sb.from('lancamentos').delete().gte('data',ini).lte('data',fim));
  const rows=[]; for(const [k,v] of Object.entries(d.dias)){ const ids=new Set([...Object.keys(v.vendas||{}),...Object.keys(v.perdas||{})]); for(const id of ids) rows.push({data:k,setor_id:id,venda:v.vendas?.[id]??null,perda:v.perdas?.[id]??null}); }
  for(let i=0;i<rows.length;i+=500) await q(S.sb.from('lancamentos').insert(rows.slice(i,i+500)));
  await q(S.sb.from('diarias').delete().eq('mes',mes));
  const ls=(d.diarias?.lancamentos||[]).map(l=>({mes,data:l.data,valor:l.valor})); if(ls.length) await q(S.sb.from('diarias').insert(ls));
}
async function importarPlanilhas(files){
  if(!window.XLSX) return toast('Leitor de Excel não carregou. Verifique a internet.');
  files=files.filter(f=>/\.xls[xm]?$/i.test(f.name) && !f.name.startsWith('~$'));
  if(!files.length) return toast('Escolha arquivos .xlsx');
  busy(`Lendo ${files.length} planilha(s)…`);
  const lidos=[], erros=[];
  for(const f of files){ try{ const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true}); const d=Parser.parseModelo(wb,f.name); d.arquivo=f.name; lidos.push(d); }catch(e){ erros.push(`${f.name}: ${e.message}`); } }
  dialogoImportacao(lidos, erros);
}
function dialogoImportacao(lidos, erros){
  lidos.sort((a,b)=>a.mes.localeCompare(b.mes));
  const dup = lidos.filter((d,i)=>lidos.findIndex(x=>x.mes===d.mes)!==i);
  const m=modal(`<h2>📗 Importar planilhas mensais</h2>
   <p class="small muted">${lidos.length} mês(es) lidos${erros.length?` · ${erros.length} com erro`:''}. Meses que já existem no site serão <b>substituídos</b> pelos dados da planilha.</p>
   ${erros.length?`<div class="note err small" style="margin-bottom:8px">${erros.map(esc).join('<br>')}</div>`:''}
   ${dup.length?`<div class="note small" style="margin-bottom:8px">Arquivos repetidos para o mesmo mês: ${dup.map(d=>esc(d.arquivo)).join(', ')} — vale o último.</div>`:''}
   <div class="tw" style="max-height:46vh"><table><thead><tr><th>Mês</th><th>Arquivo</th><th class="n">Meta</th><th class="n">Setores</th><th class="n">Dias c/ venda</th><th>No site</th></tr></thead><tbody>
   ${lidos.map(d=>`<tr><td><b>${mesLabel(d.mes)}</b></td><td class="small">${esc(d.arquivo)}</td><td class="n">${brl0(d.metaLoja)}</td><td class="n">${d.setores.length}</td><td class="n">${Object.values(d.dias).filter(x=>x.vendas||x.total).length}</td><td>${S.mesList.includes(d.mes)?'<span class="badge b-warn">substituir</span>':'<span class="badge b-good">novo</span>'}</td></tr>`).join('')}
   </tbody></table></div>
   <div id="impProg" class="hide" style="margin-top:12px"><div class="prog"><i style="width:0%"></i></div><p class="small" id="impTxt"></p></div>
   <div class="row" style="margin-top:12px" id="impBtns"><div class="sp"></div><button class="btn" id="mN">Cancelar</button><button class="btn p" id="mY" ${lidos.length?'':'disabled'}>Importar ${lidos.length} mês(es)</button></div>`);
  $('#mN',m).onclick=closeModal;
  $('#mY',m).onclick=async()=>{
    $('#impBtns',m).classList.add('hide'); $('#impProg',m).classList.remove('hide');
    const unicos={}; lidos.forEach(d=>unicos[d.mes]=d); const lista=Object.values(unicos); let ok=0;
    for(const d of lista){ $('#impTxt',m).textContent=`Gravando ${mesLabel(d.mes)}… (${ok+1}/${lista.length})`; $('.prog i',m).style.width=(ok/lista.length*100)+'%';
      try{ await importarMesCompleto(d); ok++; }catch(e){ console.error(e); $('#impTxt',m).innerHTML=`<span style="color:var(--bad)">Parou em ${mesLabel(d.mes)}: ${esc(e.message)}</span> · ${ok} importado(s).`; $('#impBtns',m).classList.remove('hide'); $('#mY',m).classList.add('hide'); $('#mN',m).textContent='Fechar'; S.months={}; S._tudo=false; await carregarListaMeses(); return; } }
    $('.prog i',m).style.width='100%'; $('#impTxt',m).textContent=`${ok} mês(es) importado(s) ✔`;
    S.months={}; S._tudo=false; await carregarListaMeses(); const cur=todayIso().slice(0,7); S.mes=S.mesList.includes(cur)?cur:S.mesList[S.mesList.length-1]; await garantirMes(S.mes);
    setTimeout(()=>{ closeModal(); render(); toast(`${ok} mês(es) importado(s) ✔`); },700);
  };
}
function modeloDialog(wb, nome){
  if(!S.gerente) return toast('Só o gerente pode importar a planilha mensal.');
  try{ const d=Parser.parseModelo(wb,nome); d.arquivo=nome; dialogoImportacao([d],[]); }catch(e){ toast(e.message,5000); }
}
function cardImportarPlanilhas(){
  return `<div class="card" style="margin-top:12px"><h2>Importar planilhas mensais (Excel)</h2>
   <p class="small muted">Selecione uma ou várias planilhas no modelo antigo (abas META DIARIA, PERCA-VENDA SETORES e Planilha1…31) — por exemplo, todos os arquivos da pasta <b>Documentos › Gustavo › Metas</b>. O site lê metas, vendas por setor, perdas, total do caixa e diárias.</p>
   <div class="drop" id="dropPl"><div class="ico">📗</div><h3>Arraste as planilhas aqui</h3><p>ou</p><div style="margin-top:8px"><button class="btn y" id="bPl">Escolher planilhas</button></div><input type="file" id="fPl" accept=".xlsx,.xlsm,.xls" multiple class="hide"></div></div>`;
}
function bindImportarPlanilhas(host){
  const b=$('#bPl',host); if(!b) return; const f=$('#fPl',host), z=$('#dropPl',host);
  b.onclick=()=>f.click(); f.onchange=()=>{ const fs=[...f.files]; f.value=''; importarPlanilhas(fs); };
  z.ondragover=e=>{e.preventDefault();z.classList.add('over');}; z.ondragleave=()=>z.classList.remove('over');
  z.ondrop=e=>{e.preventDefault();z.classList.remove('over'); importarPlanilhas([...e.dataTransfer.files]); };
}

/* ===================== USUÁRIOS (gerente) ===================== */
async function tokenValido(forcar){ // celular em segundo plano deixa o token vencer: renova antes de chamar o servidor
  let { data:{ session } } = await S.sb.auth.getSession();
  if(forcar || !session || (session.expires_at||0)*1000 < Date.now()+60000){ const r=await S.sb.auth.refreshSession(); if(r.data?.session) session=r.data.session; }
  return session?.access_token||null;
}
async function chamarUsuarios(body, tentou){
  const tk=await tokenValido(!!tentou);
  const { data, error } = await S.sb.functions.invoke('usuarios',{ body, headers: tk?{ Authorization:'Bearer '+tk }:{} });
  if(error && !tentou && (error.context?.status===401)) return chamarUsuarios(body, true);
  if(error){ let msg=error.message; try{ const j=await error.context.json(); if(j?.erro) msg=j.erro; }catch(_){} throw new Error(msg); }
  if(data?.erro) throw new Error(data.erro); return data;
}
async function renderConta(app){
  const papel = S.gerenteReal ? '<span class="badge b-good">Administrador (gerente)</span>' : '<span class="badge b-none">Encarregado</span>';
  const setTxt = S.gerenteReal ? 'Todos os setores' : esc((S.perfil.setores||[]).map(nomeSetor).join(', ')||'—');
  app.innerHTML=`
  <h1>Minha conta</h1><p class="sub">${esc(S.perfil.nome||'')} · ${esc(S.user.email)}</p>
  ${S.gerente?`<div class="card" style="margin-bottom:12px"><div class="row" style="flex-wrap:wrap;gap:8px"><div><h2 style="margin:0">📋 Fechamento do mês</h2><p class="small muted" style="margin:4px 0 0">Meta × realizado, perda, trocas, plano de ação e os fechamentos guardados para comparar.</p></div><div class="sp"></div><a class="btn p" href="#fechamento">Abrir o fechamento</a></div></div>`:''}
  <div class="grid conta2">
    <div class="card">
      <h2>Meus dados</h2>
      <div class="small" style="line-height:1.9">Acesso: ${papel}<br>Setores: <b>${setTxt}</b></div>
      <div class="row" style="margin-top:14px;flex-wrap:wrap;gap:8px"><button class="btn" id="cInst">📲 Ícone no celular</button><div class="sp"></div><button class="btn" id="cSair" style="color:var(--bad)">Sair</button></div>
    </div>
    <div class="card">
      <h2>Trocar senha</h2>
      <label class="f">Nova senha<input id="cS1" type="password" placeholder="mínimo 8 caracteres" autocomplete="new-password"></label>
      <label class="f" style="margin-top:8px">Repita a nova senha<input id="cS2" type="password" autocomplete="new-password"></label>
      <div id="cErr" class="note err small hide" style="margin-top:10px"></div>
      <div class="row" style="margin-top:12px"><div class="sp"></div><button class="btn p" id="cTroca">Trocar senha</button></div>
    </div>
  </div>
  ${S.gerenteReal?'<div id="admBox" style="margin-top:22px"><div class="empty"><span class="spin"></span> Carregando painel do administrador…</div></div>':''}`;
  $('#cSair').onclick=()=>sair();
  $('#cInst').onclick=()=>instalarApp();
  $('#cTroca').onclick=async()=>{ const a=$('#cS1').value, b=$('#cS2').value; const e=$('#cErr');
    const erro=t=>{ e.textContent=t; e.classList.remove('hide'); };
    if(a.length<8) return erro('A senha precisa ter pelo menos 8 caracteres.');
    if(a!==b) return erro('As senhas não conferem.');
    const { error } = await S.sb.auth.updateUser({ password:a }); if(error) return erro(error.message);
    e.classList.add('hide'); $('#cS1').value=$('#cS2').value=''; toast('Senha alterada ✔'); };
  if(!S.gerenteReal) return;          // encarregado não vê nada de administração
  await renderAdmin($('#admBox'));
}
async function renderAdmin(box){
  let us=[], nBal=0, ultLanc=null, ultBal=null;
  try{ us=(await chamarUsuarios({acao:'listar'})).usuarios; }catch(e){ box.innerHTML=`<div class="note err">${esc(e.message)}</div>`; return; }
  try{ const r=await S.sb.from('balancos').select('id',{count:'exact',head:true}); nBal=r.count||0; }catch(_){}
  try{ const r=await q(S.sb.from('lancamentos').select('data').order('data',{ascending:false}).limit(1)); ultLanc=r[0]?.data||null; }catch(_){}
  try{ const r=await q(S.sb.from('balancos').select('data,setor_id').order('data',{ascending:false}).limit(1)); ultBal=r[0]||null; }catch(_){}
  if(S.view!=='conta' || !box.isConnected) return;
  const enc=us.filter(u=>u.papel==='encarregado'), nunca=us.filter(u=>!u.ultimo_acesso);
  const semana=Date.now()-7*864e5; const ativos=us.filter(u=>u.ultimo_acesso && new Date(u.ultimo_acesso).getTime()>=semana);
  const cobertos=new Set(enc.flatMap(u=>u.setores||[])); const semEnc=S.setoresAll.filter(x=>!cobertos.has(x.id));
  const meses=S.mesList||[];
  const nomeSet = ids => ids.map(nomeSetor).join(', ');
  const quando = t => t ? new Date(t).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : '<span class="muted">nunca entrou</span>';
  box.innerHTML=`
  <div class="row" style="align-items:flex-end;margin-bottom:12px"><div><h1 style="margin:0">⚙️ Painel do administrador</h1><p class="sub" style="margin:0">Só você (gerente) vê esta parte. Encarregados não têm acesso.</p></div></div>
  ${['lancar','metas'].map(k=>{ const t=k==='lancar'?['➕','Lançar vendas','Importar relatórios, lançar a venda e a perda de cada dia, colar ou digitar valores']:['🎯','Metas do mês','Meta da loja e dos setores, meta de cada dia, criar mês, metas por departamento, datas especiais, teto de perda e importar planilhas']; return `<div class="card adm-cx" style="margin-bottom:12px;border:2px solid ${S.admAberto===k?'var(--dark)':'var(--line)'}"><div data-admcx="${k}" style="display:flex;align-items:center;gap:12px;cursor:pointer"><span style="font-size:26px">${t[0]}</span><div style="flex:1"><b style="font-size:17px">${t[1]}</b><div class="small muted">${t[2]}</div></div><span class="btn ${S.admAberto===k?'':'p'}" data-admseta="${k}">${S.admAberto===k?'Fechar ▾':'Abrir ▸'}</span></div><div id="admCx_${k}" class="${S.admAberto===k?'':'hide'}" style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px"></div></div>`; }).join('')}
  <div class="grid kpis">
    <div class="kpi hero"><div class="l">Usuários</div><div class="v">${us.length}</div><div class="d">${enc.length} encarregado(s) · ${us.length-enc.length} gerente(s)</div></div>
    <div class="kpi"><div class="l">Entraram nos últimos 7 dias</div><div class="v">${ativos.length}</div><div class="d">${nunca.length?`${nunca.length} nunca entrou`:'todos já entraram'}</div></div>
    <div class="kpi"><div class="l">Último lançamento de venda</div><div class="v" style="font-size:22px">${ultLanc?fDate(ultLanc):'—'}</div><div class="d">${ultLanc?fDateL(ultLanc):'nenhum ainda'}</div></div>
    <div class="kpi"><div class="l">Balanços no banco</div><div class="v">${nBal}</div><div class="d">${ultBal?`último: ${esc(nomeSetor(ultBal.setor_id))} · ${fDate(ultBal.data)}`:'nenhum ainda'}</div></div>
    <div class="kpi"><div class="l">Meses no banco</div><div class="v">${meses.length}</div><div class="d">${meses.length?`${mesLabel(meses[0])} a ${mesLabel(meses[meses.length-1])}`:''}</div></div>
  </div>
  ${semEnc.length?`<div class="note small" style="margin-top:12px">Setores sem encarregado cadastrado: <b>${esc(semEnc.map(x=>x.nome).join(', '))}</b></div>`:''}
  <div class="card" style="margin-top:12px">
    <div class="row" style="margin-bottom:10px;flex-wrap:wrap;gap:8px"><h2 style="margin:0">Usuários e acessos</h2><div class="sp"></div><button class="btn" id="uVer">👁 Ver como encarregado</button><button class="btn p" id="uNovo">＋ Novo usuário</button></div>
    <div class="tw"><table><thead><tr><th>Nome</th><th class="m-hide">E-mail</th><th>Acesso</th><th class="m-hide">Setores</th><th class="m-hide">Último acesso</th><th></th></tr></thead><tbody>
    ${us.map(u=>`<tr><td><b>${esc(u.nome||'—')}</b>${u.id===S.user.id?' <span class="badge b-none">você</span>':''}<div class="small muted m-only">${esc(u.email)}<br>${u.papel==='gerente'?'Todos os setores':esc(nomeSet(u.setores||[]))} · ${quando(u.ultimo_acesso)}</div></td><td class="small m-hide">${esc(u.email)}</td><td>${u.papel==='gerente'?'<span class="badge b-good">Gerente</span>':'<span class="badge b-none">Encarregado</span>'}</td><td class="small m-hide">${u.papel==='gerente'?'Todos':esc(nomeSet(u.setores||[]))}</td><td class="small m-hide">${quando(u.ultimo_acesso)}</td><td style="white-space:nowrap">${u.papel==='encarregado'?`<button class="btn" data-ver="${u.id}" style="padding:4px 10px" title="Ver o site como este encarregado vê">👁</button> `:''}<button class="btn" data-ed="${u.id}" style="padding:4px 10px">Editar</button></td></tr>`).join('')}
    </tbody></table></div>
    <div class="small muted" style="margin-top:10px">Cada encarregado vê só os setores marcados; as vendas são lançadas só por você. Ao criar um usuário, o site monta a mensagem com o acesso para mandar no WhatsApp. Para trocar a senha de alguém, clique em Editar.</div>
  </div>
  <div class="card" style="margin-top:12px">
    <h2>Atalhos</h2>
    <div class="row" style="flex-wrap:wrap;gap:8px"><a class="btn" href="#balancos">📦 Balanços</a><button class="btn" id="aAtual">🔄 Atualizar dados</button></div>
  </div>`;
  $('#uNovo').onclick=()=>formUsuario(null);
  $('#uVer').onclick=()=>escolherVisualizacao();
  $('#aAtual').onclick=()=>atualizarDados(true);
  box.querySelectorAll('[data-ver]').forEach(b=>b.onclick=()=>{ const u=us.find(x=>x.id===b.dataset.ver); entrarVisualizacao(u.nome||u.email, u.setores||[]); });
  box.querySelectorAll('[data-ed]').forEach(b=>b.onclick=()=>formUsuario(us.find(u=>u.id===b.dataset.ed)));
  box.querySelectorAll('[data-admcx]').forEach(h=>h.onclick=()=>{ S.admAberto = S.admAberto===h.dataset.admcx ? null : h.dataset.admcx; atualizarCabecasAdm(box); desenharCascataAdm(); });
  cardRankingEncarregados(box, us);
  desenharCascataAdm();
}
function atualizarCabecasAdm(box){ for(const k of ['lancar','metas']){ const on=S.admAberto===k; const c=$('#admCx_'+k); if(c) c.classList.toggle('hide',!on); const b=box.querySelector(`[data-admseta="${k}"]`); if(b){ b.textContent=on?'Fechar ▾':'Abrir ▸'; b.classList.toggle('p',!on); } const card=c?.closest('.adm-cx'); if(card) card.style.borderColor=on?'var(--dark)':'var(--line)'; } }
function desenharCascataAdm(){
  for(const k of ['lancar','metas']){ const c=$('#admCx_'+k); if(c && S.admAberto!==k) c.innerHTML=''; }
  const k=S.admAberto; const c=k && $('#admCx_'+k); if(!c){ S._admCont=null; return; }
  S._admCont=c; c.classList.remove('hide'); const doc=curDoc();
  if(k==='lancar'){ if(doc) renderLancar(c,doc); else c.innerHTML='<div class="empty">Nenhum mês cadastrado. Abra Metas do mês para criar.</div>'; }
  else { renderMetas(c,doc); if(doc){ cardTetoConfig(c); cardLimitesAlertas(c); cardGruposProduto(c); } }
  if(S._admRolar){ S._admRolar=false; setTimeout(()=>c.closest('.adm-cx')?.scrollIntoView({behavior:'smooth',block:'start'}),50); }
}
function formUsuario(u){
  const novo=!u; const sel=new Set(u?.setores||[]);
  const m=modal(`<h2>${novo?'Novo usuário':'Editar '+esc(u.nome||u.email)}</h2>
  <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
    <label class="f">Nome<input id="uNome" value="${esc(u?.nome||'')}" placeholder="Ex.: João do Açougue"></label>
    <label class="f">E-mail<input id="uEmail" type="email" value="${esc(u?.email||'')}" ${novo?'':'disabled'} placeholder="email@exemplo.com"></label>
    <label class="f">${novo?'Senha inicial':'Nova senha (deixe vazio para manter)'}<input id="uSenha" type="text" placeholder="mínimo 8 caracteres" value="${novo?gerarSenha():''}"></label>
    <label class="f">Acesso<select id="uPapel"><option value="encarregado" ${u?.papel!=='gerente'?'selected':''}>Encarregado (só os setores marcados)</option><option value="gerente" ${u?.papel==='gerente'?'selected':''}>Gerente (tudo)</option></select></label>
  </div>
  <div id="uSetBox" style="margin-top:12px"><div class="small" style="font-weight:600;color:var(--ink2);margin-bottom:6px">Setores que pode ver</div>
    <div class="chk">${S.setoresAll.map(x=>`<label><input type="checkbox" value="${x.id}" ${sel.has(x.id)?'checked':''}>${esc(x.nome)}</label>`).join('')}</div></div>
  ${novo?'':`<label class="chk1" id="uResBox" style="margin-top:12px;display:flex;gap:8px;align-items:center"><input type="checkbox" id="uRes" checked disabled> <span>Recebe o <b>resumo semanal de perdas</b> por e-mail toda segunda (só dos setores dele)</span></label>`}
  <div id="uErr" class="note err small hide" style="margin-top:10px"></div>
  <div class="row" style="margin-top:14px">${novo||u.id===S.user.id?'':'<button class="btn" id="uDel" style="color:var(--bad)">Excluir</button>'}<div class="sp"></div><button class="btn" id="mN">Cancelar</button><button class="btn p" id="mY">${novo?'Criar usuário':'Salvar'}</button></div>`);
  const tog=()=>{ $('#uSetBox',m).classList.toggle('hide',$('#uPapel',m).value==='gerente'); $('#uResBox',m)?.classList.toggle('hide',$('#uPapel',m).value==='gerente'); }; $('#uPapel',m).onchange=tog; tog();
  let resAntes=null; if(!novo) q(S.sb.from('perfis').select('recebe_resumo').eq('id',u.id)).then(r=>{ const c=$('#uRes',m); if(c&&r[0]){ resAntes=r[0].recebe_resumo!==false; c.checked=resAntes; c.disabled=false; } }).catch(()=>{});
  $('#mN',m).onclick=closeModal;
  const err=t=>{ const e=$('#uErr',m); e.textContent=t; e.classList.remove('hide'); };
  $('#mY',m).onclick=async()=>{
    const body={ acao:novo?'criar':'atualizar', id:u?.id, nome:$('#uNome',m).value.trim(), email:$('#uEmail',m).value.trim(), papel:$('#uPapel',m).value,
      setores:[...m.querySelectorAll('.chk input:checked')].map(i=>i.value) };
    const senha=$('#uSenha',m).value.trim(); if(senha) body.senha=senha;
    $('#mY',m).disabled=true;
    try{ await chamarUsuarios(body);
      const cr=$('#uRes',m); if(cr && resAntes!=null && cr.checked!==resAntes){ const {error}=await S.sb.rpc('definir_recebe_resumo',{p_id:u.id, p_on:cr.checked}); if(error) throw error; }
      closeModal();
      if(novo) mostrarAcesso(body.nome, body.email, senha); else toast('Usuário salvo ✔');
      if(S.view==='conta') renderConta($('#app')); }
    catch(e){ err(e.message); $('#mY',m).disabled=false; }
  };
  const d=$('#uDel',m); if(d) d.onclick=()=>{ closeModal(); confirmBox(`Excluir o acesso de ${u.nome||u.email}? Os lançamentos que ele fez continuam salvos.`, async()=>{ try{ await chamarUsuarios({acao:'excluir',id:u.id}); toast('Usuário excluído'); if(S.view==='conta') renderConta($('#app')); }catch(e){ toast(e.message,5000); } }); };
}
function gerarSenha(){ const c='abcdefghjkmnpqrstuvwxyz23456789'; let s=''; const a=new Uint32Array(8); crypto.getRandomValues(a); a.forEach(x=>s+=c[x%c.length]); return 'Bd'+s; }
function mostrarAcesso(nome,email,senha){
  const url=location.href.split('#')[0];
  const txt=`Olá ${nome.split(' ')[0]}! Seu acesso ao painel de metas do Bom Dia São Luiz:\n\n🔗 ${url}\n📧 Usuário: ${email}\n🔑 Senha: ${senha}\n\nNo primeiro acesso, troque a senha em "Minha conta".`;
  const m=modal(`<h2>✔ Usuário criado</h2><p>Mande esta mensagem para <b>${esc(nome)}</b> (WhatsApp, por exemplo):</p>
   <textarea id="aTxt" style="width:100%;height:170px;border:1px solid var(--line);border-radius:10px;padding:10px">${esc(txt)}</textarea>
   <div class="row" style="margin-top:10px"><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(txt)}">Abrir no WhatsApp</a><div class="sp"></div><button class="btn" id="aCp">Copiar</button><button class="btn p" id="mN">Fechar</button></div>`);
  $('#mN',m).onclick=closeModal;
  $('#aCp',m).onclick=async()=>{ try{ await navigator.clipboard.writeText(txt); toast('Mensagem copiada'); }catch(e){ $('#aTxt',m).select(); } };
}

/* ===================== BALANÇOS ===================== */
const SETORES_BALANCO=['acougue','hortifruti','padaria','pereciveis'];
function setoresVisiveis(){ return S.gerente ? S.setoresAll : S.setoresAll.filter(x=>meusSetoresIds().includes(x.id)); }
function meusSetoresIds(){ return S.preview ? S.preview.setores : (S.perfil.setores||[]); }
function nomeArquivoSeguro(n){ return String(n||'arquivo').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9._-]+/g,'_').slice(-80); }
function abasBalPerdas(){ if(!S.gerente) return ''; return `<div class="tabs2 abas-bp" style="margin:0 0 12px"><a href="#perdas" class="${S.view==='perdas'?'on':''}">🗑️ Perdas</a><a href="#balancos" class="${S.view==='balancos'?'on':''}">📦 Balanços</a></div>`; }
async function renderBalancos(app){
  const mes=S.mes||todayIso().slice(0,7); const ini=`${mes}-01`, fim=fimDoMes(mes);
  app.innerHTML='<div class="empty"><span class="spin"></span> Carregando balanços…</div>';
  let lista=[];
  try{ lista=await q(S.sb.from('balancos').select('*, balanco_comentarios(count)').gte('data',ini).lte('data',fim).order('data',{ascending:false}).order('id',{ascending:false})); }
  catch(e){ app.innerHTML=`<div class="note err">Erro ao carregar: ${esc(e.message)}</div>`; return; }
  if(S.view!=='balancos') return;
  if(S.preview) lista=lista.filter(b=>S.preview.setores.includes(b.setor_id));
  else completarBalancosAntigos(lista.map(b=>({...b, valor_perda_antes:b.valor_perda}))).then(async m=>{ if(m && S.view==='balancos'){ const ds=(S._balCorrigidos||[]).map(x=>x.data); avisarBalCorrigidos(); for(const d of new Set(ds)) await aposMudarBalanco(d).catch(()=>{}); if(S.view==='balancos') renderBalancos(app); } });
  // balanço anterior de cada setor (para comparar)
  let antes=[]; try{ antes=await q(S.sb.from('balancos').select('id,setor_id,data,valor_perda').lt('data',ini).order('data',{ascending:false}).limit(200)); }catch(_){ }
  if(S.preview) antes=antes.filter(b=>S.preview.setores.includes(b.setor_id));
  const todos=[...lista,...antes].sort((a,b)=>b.data.localeCompare(a.data)||b.id-a.id);
  const anteriorDe=b=>todos.find(x=>x.setor_id===b.setor_id && (x.data<b.data || (x.data===b.data && x.id<b.id)));
  S._anteriorDe=anteriorDe;
  const variacao=(b)=>{ const a=anteriorDe(b); if(!a) return null; const v=+b.valor_perda||0, va=+a.valor_perda||0; return {a, dif:v-va, pct: va? (v-va)/va : null}; };
  const fmtVar=x=> !x ? '<span class="muted small">primeiro balanço</span>' : `<span style="color:${x.dif>0?'var(--bad)':x.dif<0?'var(--good)':'inherit'};font-weight:700">${x.dif>0?'▲ +':x.dif<0?'▼ ':''}${brl0(x.dif)}${x.pct!=null?` (${x.dif>0?'+':''}${pct(x.pct,0)})`:''}</span>`;
  const doc=S.months[mes]; const calcRes = doc ? calc(doc, fim) : null;
  const filtro=S.balSetor||'';
  const vis=setoresVisiveis();
  const lst=lista.filter(b=>!filtro||b.setor_id===filtro);
  const porSetor={}; lista.forEach(b=>porSetor[b.setor_id]=(porSetor[b.setor_id]||0)+(+b.valor_perda||0));
  const destaque = (S.gerente? SETORES_BALANCO : vis.map(x=>x.id)).filter(id=>vis.some(x=>x.id===id));
  const vendaSetor = id => calcRes?.setores.find(x=>x.id===id)?.real || 0;
  app.innerHTML=`${abasBalPerdas()}
  <div class="row" style="align-items:flex-end;margin-bottom:14px">
    <div><h1>Balanços — ${mesLabel(mes)}</h1><p class="sub" style="margin:0">Perdas apuradas nos balanços de estoque, com o relatório anexado para análise. Elas entram na perda do setor no painel.</p></div>
    <div class="sp"></div>
    <label class="f">Setor<select id="bFiltro"><option value="">Todos</option>${vis.map(x=>`<option value="${x.id}" ${filtro===x.id?'selected':''}>${esc(x.nome)}</option>`).join('')}</select></label>
    ${S.gerente?'<button class="btn p" id="bNovo">＋ Novo balanço</button>':''}
  </div>
  <div class="grid kpis">
    ${destaque.map(id=>{ const v=porSetor[id]||0, vd=vendaSetor(id); const ult=lista.find(b=>b.setor_id===id); const x=ult?variacao(ult):null; return `<div class="kpi" style="cursor:pointer" data-fs="${id}"><div class="l">${esc(nomeSetor(id))}</div><div class="v">${v?brl0(v):'—'}</div><div class="d">${v&&vd?pct(v/vd,2)+' sobre a venda do mês':(v?'':'sem balanço no mês')}</div>${ult?`<div class="d">vs. anterior: ${fmtVar(x)}</div>`:''}</div>`; }).join('')}
    <div class="kpi hero"><div class="l">Total em balanços</div><div class="v">${brl0(Object.values(porSetor).reduce((a,b)=>a+b,0))}</div><div class="d">${lista.length} balanço(s) no mês</div></div>
  </div>
  <div class="card" style="margin-top:12px">
    ${lst.length?`<div class="tw"><table class="t-bal"><thead><tr><th>Período</th><th>Setor</th><th class="n">Perda</th><th class="hm">Balanço anterior</th><th>Variação</th><th class="hm">Arquivo</th><th class="hm">Observação</th><th class="n hm">Coment.</th><th class="hm"></th></tr></thead><tbody>
    ${lst.map(b=>`<tr class="click" data-b="${b.id}"><td>${b.periodo_inicio?`${fDate(b.periodo_inicio)} a ${fDate(b.data)}`:fDateL(b.data)}${b.analise?' <span class="badge b-good" title="Relatório analisado">análise</span>':''}</td><td><b>${esc(nomeSetor(b.setor_id))}</b></td><td class="n"><b>${brl(+b.valor_perda)}</b></td>${(()=>{ const x=variacao(b); return `<td class="small hm">${x?`${fDate(x.a.data)} · ${brl0(+x.a.valor_perda)}`:'—'}</td><td class="small">${fmtVar(x)}</td>`; })()}<td class="small hm">${b.arquivo_nome?'📎 '+esc(b.arquivo_nome):'<span class="muted">—</span>'}</td><td class="small hm" style="max-width:280px">${esc((b.observacao||'').slice(0,90))}${(b.observacao||'').length>90?'…':''}</td><td class="n hm">${b.balanco_comentarios?.[0]?.count||0}</td><td class="hm"><button class="btn" style="padding:4px 10px">Abrir</button></td></tr>`).join('')}
    </tbody></table></div>`:`<div class="empty">Nenhum balanço ${filtro?'deste setor ':''}em ${mesLabel(mes)}.${S.gerente?' Clique em “Novo balanço” para lançar.':''}</div>`}
  </div>`;
  $('#bFiltro').onchange=e=>{ S.balSetor=e.target.value; renderBalancos(app); };
  app.querySelectorAll('[data-fs]').forEach(k=>k.onclick=()=>{ S.balSetor = S.balSetor===k.dataset.fs?'':k.dataset.fs; renderBalancos(app); });
  const bn=$('#bNovo'); if(bn) bn.onclick=()=>formBalanco(null);
  app.querySelectorAll('[data-b]').forEach(r=>r.onclick=()=>alternarBalancoInline(r, lista.find(b=>String(b.id)===r.dataset.b)));
}
async function aposMudarBalanco(data){ const mes=data.slice(0,7); if(S.months[mes]) { try{ await carregarMes(mes); }catch(_){} } S._tudo=false; render(); }
function formBalanco(b){
  const novo=!b; const vis=setoresVisiveis(); const ordem=[...vis].sort((x,y)=>(SETORES_BALANCO.includes(y.id)-SETORES_BALANCO.includes(x.id)));
  const m=modal(`<h2>${novo?'Novo balanço':'Editar balanço'}</h2>
   <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
    <label class="f">Setor<select id="fbSetor">${ordem.map(x=>`<option value="${x.id}" ${(b?.setor_id||S.balSetor||'acougue')===x.id?'selected':''}>${esc(x.nome)}</option>`).join('')}</select></label>
    <div class="f"><span>Período do balanço — a perda entra no último dia</span><div class="row" style="gap:6px;flex-wrap:nowrap"><input type="date" id="fbIni" value="${b?.periodo_inicio||''}" title="Início" style="flex:1"><span class="small">até</span><input type="date" id="fbData" value="${b?.data||todayIso()}" title="Fim (data do balanço)" style="flex:1"></div></div>
    <label class="f">Perda apurada (R$) — sai do arquivo<input class="in" id="fbValor" inputmode="decimal" value="${b?nf(+b.valor_perda):''}" placeholder="lido do relatório"></label>
    <label class="f">Relatório do balanço ${novo?'':'(deixe vazio para manter)'}<input type="file" id="fbArq" accept=".xlsx,.xls,.csv,.pdf,image/*"></label>
   </div>
   <label class="f" style="margin-top:10px">Observação<textarea id="fbObs" rows="3" style="border:1px solid var(--line);border-radius:9px;padding:8px 10px;font:inherit">${esc(b?.observacao||'')}</textarea></label>
   <p class="small muted" id="fbDica">Anexe o relatório (Excel, CSV, PDF ou foto): o site lê o valor da perda e a data sozinho. Se quiser, você pode corrigir o valor antes de salvar.</p>
   <div id="fbAn"></div>
   <div id="fbErr" class="note err small hide"></div>
   <div class="row" style="margin-top:12px"><div class="sp"></div><button class="btn" id="mN">Cancelar</button><button class="btn p" id="mY">${novo?'Salvar balanço':'Salvar'}</button></div>`);
  $('#mN',m).onclick=closeModal;
  let leitura=null; const dataPadrao=$('#fbData',m).value;
  const lerArquivo=()=>{ const f=$('#fbArq',m).files[0]; if(!f){ leitura=null; return; }
    const dica=$('#fbDica',m); dica.innerHTML='<span class="spin"></span> Lendo o relatório para achar o valor da perda…';
    leitura=extrairPerdaArquivo(f).then(r=>{
      if(r.valor!=null){ $('#fbValor',m).value=nf(r.valor); $('#fbValor',m).classList.add('chg'); dica.innerHTML=`✔ Perda de <b>${brl(r.valor)}</b> lida do arquivo (linha: “${esc(r.linha.slice(0,70))}”). Confira e salve.`; }
      else dica.innerHTML='<span style="color:var(--bad)">Não achei o valor da perda no arquivo.</span> Digite o valor acima.';
      if(r.data && ($('#fbData',m).value===dataPadrao || r.analise)){ $('#fbData',m).value=r.data; }
      if(r.ini) $('#fbIni',m).value=r.ini;
      if(r.data){ const mm=r.data.slice(0,7); const semMes=!S.mesList.includes(mm); dica.innerHTML+=`<br>📅 ${r.ini?`Período lido do arquivo: <b>${fDate(r.ini)}/${r.ini.slice(0,4)} a ${fDate(r.data)}/${r.data.slice(0,4)}</b>. `:''}A perda será lançada no dia <b>${fDate(r.data)}/${r.data.slice(0,4)}</b>${r.data.slice(0,7)!==S.mes?` (mês de ${mesLabel(mm)})`:''}.${semMes?' <span style="color:var(--bad)">Esse mês ainda não tem metas no site: o balanço fica salvo e aparece na aba Balanço do setor.</span>':''}`; }
      if(r.analise && !setorEscolhido){ const sug=setorSiteSugerido(r.analise); if(sug && $('#fbSetor',m).querySelector(`option[value="${sug}"]`)) $('#fbSetor',m).value=sug; }
      $('#fbAn',m).innerHTML = r.analise ? resumoAnaliseHtml(r.analise,true) : '';
      return r; }).catch(e=>{ dica.innerHTML='<span style="color:var(--bad)">Não consegui ler o arquivo.</span> Digite o valor acima.'; return {valor:null}; });
  };
  $('#fbArq',m).onchange=lerArquivo;
  let setorEscolhido=!novo; $('#fbSetor',m).addEventListener('change',()=>{ setorEscolhido=true; });
  $('#mY',m).onclick=async()=>{
    const err=t=>{ const e=$('#fbErr',m); e.textContent=t; e.classList.remove('hide'); };
    const f=$('#fbArq',m).files[0];
    if(leitura && !$('#fbValor',m).value.trim()){ $('#mY',m).disabled=true; $('#mY',m).textContent='Lendo arquivo…'; await leitura; $('#mY',m).disabled=false; $('#mY',m).textContent=novo?'Salvar balanço':'Salvar'; }
    const setor=$('#fbSetor',m).value, data=$('#fbData',m).value, valor=parseNum($('#fbValor',m).value), obs=$('#fbObs',m).value.trim();
    if(!data) return err('Informe a data do balanço.');
    if(isNaN(valor)) return err(f? 'Não achei o valor da perda no arquivo. Digite o valor da perda.' : 'Anexe o relatório do balanço ou digite o valor da perda.');
    if(f && f.size>25*1024*1024) return err('O arquivo passa de 25 MB.');
    // todo balanço em PDF precisa sair com a análise (produtos que faltaram e sobraram)
    if(f && /\.pdf$/i.test(f.name)){ const r0=leitura? await leitura : null; if(!r0?.analise) return err('O site não conseguiu analisar esse PDF, então não salvou. Tire no sistema o “Resultado do balanço setorial” (com os produtos) e anexe de novo. Se for esse mesmo relatório, me avise para eu ensinar o site a ler.'); }
    $('#mY',m).disabled=true; $('#mY',m).textContent='Salvando…';
    try{
      const ini=$('#fbIni',m).value||null; if(ini && ini>data) throw new Error('O início do período não pode ser depois do fim.');
      const row={ setor_id:setor, data, periodo_inicio:ini, valor_perda:round2(Math.abs(valor)), observacao:obs||null };
      if(f){ const r=leitura? await leitura : null; row.analise = r?.analise || null; }
      if(f){ const path=`${setor}/${Date.now()}-${nomeArquivoSeguro(f.name)}`;
        const { error } = await S.sb.storage.from('balancos').upload(path, f, { upsert:false, contentType:f.type||undefined }); if(error) throw error;
        row.arquivo_path=path; row.arquivo_nome=f.name;
        if(b?.arquivo_path) await S.sb.storage.from('balancos').remove([b.arquivo_path]); }
      else if(b && b.setor_id!==setor && b.arquivo_path){ // muda o arquivo de pasta junto com o setor
        const np=`${setor}/${b.arquivo_path.split('/').slice(1).join('/')}`; const { error } = await S.sb.storage.from('balancos').move(b.arquivo_path, np); if(!error) row.arquivo_path=np; }
      if(novo) await q(S.sb.from('balancos').insert(row)); else await q(S.sb.from('balancos').update(row).eq('id',b.id));
      closeModal(); toast(`${novo?'Balanço salvo':'Balanço atualizado'} ✔ — perda lançada em ${fDate(data)}/${data.slice(0,4)}`,4500); { const mm=data.slice(0,7); if(S.mesList.includes(mm)) S.mes=mm; } await aposMudarBalanco(data);
    }catch(e){ err('Não foi possível salvar: '+(e.message||e)); $('#mY',m).disabled=false; $('#mY',m).textContent='Salvar'; }
  };
}
async function abrirBalanco(b, alvo){
  const html=(`<div class="row"><h2 style="margin:0">📋 Balanço — ${esc(nomeSetor(b.setor_id))}</h2><div class="sp"></div><button class="btn" id="mN">${alvo?'▴ Fechar':'Fechar'}</button></div>
   <div class="grid kpis" style="margin-top:12px"><div class="kpi"><div class="l">${b.periodo_inicio?'Período':'Data'}</div><div class="v" style="font-size:22px">${b.periodo_inicio?`${fDate(b.periodo_inicio)} a ${fDate(b.data)}`:fDateL(b.data)}</div></div><div class="kpi"><div class="l">Perda apurada</div><div class="v" style="font-size:22px">${brl(+b.valor_perda)}</div></div></div>
   ${(()=>{ const a=S._anteriorDe?.(b); if(!a) return '<p class="small muted" style="margin-top:8px">Primeiro balanço registrado deste setor.</p>'; const dif=(+b.valor_perda)-(+a.valor_perda); return `<div class="note small" style="margin-top:10px">Balanço anterior: <b>${fDateL(a.data)}</b> · ${brl(+a.valor_perda)} → variação <b style="color:${dif>0?'var(--bad)':'var(--good)'}">${dif>0?'▲ +':'▼ '}${brl(dif)}${+a.valor_perda?` (${dif>0?'+':''}${pct(dif/(+a.valor_perda),0)})`:''}</b> ${dif>0?'— a perda aumentou':'— a perda diminuiu'}</div>`; })()}
   ${b.observacao?`<div class="note small" style="margin-top:10px;white-space:pre-wrap">${esc(b.observacao)}</div>`:''}
   ${b.analise?`<h3 style="margin:16px 0 8px">📊 Análise do balanço</h3>${resumoAnaliseHtml(b.analise,false)}`:''}
   <h3 style="margin:16px 0 8px">Relatório</h3><div id="bxArq">${b.arquivo_path?'<span class="spin"></span>':'<p class="muted small">Nenhum arquivo anexado.</p>'}</div>
   <h3 style="margin:16px 0 8px">Análise e comentários</h3><div id="bxCom"><span class="spin"></span></div>
   <div class="row" style="margin-top:8px;align-items:flex-end"><label class="f" style="flex:1">Escreva sua análise (ex.: causa da perda, o que fazer)<textarea id="bxTxt" rows="2" style="border:1px solid var(--line);border-radius:9px;padding:8px 10px;font:inherit"></textarea></label><button class="btn p" id="bxEnv">Enviar</button></div>
   ${S.gerente?'<div class="row" style="margin-top:14px"><button class="btn" id="bxDel" style="color:var(--bad)">Excluir balanço</button><div class="sp"></div><button class="btn" id="bxEd">Editar</button></div>':''}`);
  let m; if(alvo){ alvo.innerHTML=`<div class="bx-in">${html}</div>`; m=alvo; } else m=modal(html);
  $('#mN',m).onclick=()=>{ if(alvo) fecharBalancoInline(alvo); else closeModal(); };
  if(S.gerente){ $('#bxEd',m).onclick=()=>{ closeModal(); formBalanco(b); };
    $('#bxDel',m).onclick=()=>{ closeModal(); confirmBox(`Excluir o balanço de ${nomeSetor(b.setor_id)} de ${fDate(b.data)} (${brl(+b.valor_perda)})? O arquivo e os comentários também serão apagados.`, async()=>{ try{ if(b.arquivo_path) await S.sb.storage.from('balancos').remove([b.arquivo_path]); await q(S.sb.from('balancos').delete().eq('id',b.id)); toast('Balanço excluído'); await aposMudarBalanco(b.data); }catch(e){ toast(e.message,5000); } }); }; }
  // comentários
  const carregarCom=async()=>{ try{ const cs=await q(S.sb.from('balanco_comentarios').select('*').eq('balanco_id',b.id).order('id'));
      $('#bxCom',m).innerHTML = cs.length? cs.map(c=>`<div style="border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-bottom:6px"><div class="small"><b>${esc(c.autor_nome||'—')}</b> <span class="muted">· ${new Date(c.criado_em).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</span>${(c.autor===S.user.id||S.gerente)?` <a href="#" data-dc="${c.id}" class="small" style="float:right;color:var(--bad)">apagar</a>`:''}</div><div style="white-space:pre-wrap;margin-top:3px">${esc(c.texto)}</div></div>`).join('') : '<p class="muted small">Ninguém comentou ainda.</p>';
      m.querySelectorAll('[data-dc]').forEach(a=>a.onclick=async e=>{ e.preventDefault(); try{ await q(S.sb.from('balanco_comentarios').delete().eq('id',+a.dataset.dc)); carregarCom(); }catch(x){ toast(x.message); } });
    }catch(e){ $('#bxCom',m).innerHTML=`<p class="note err small">${esc(e.message)}</p>`; } };
  carregarCom();
  $('#bxEnv',m).onclick=async()=>{ if(S.preview) return toast('Modo visualização: comentários desativados.'); const t=$('#bxTxt',m).value.trim(); if(!t) return; $('#bxEnv',m).disabled=true;
    try{ await q(S.sb.from('balanco_comentarios').insert({balanco_id:b.id, texto:t})); $('#bxTxt',m).value=''; carregarCom(); }catch(e){ toast(e.message,5000); } $('#bxEnv',m).disabled=false; };
  // arquivo
  if(b.arquivo_path){
    const box=$('#bxArq',m);
    try{
      const { data:sig, error } = await S.sb.storage.from('balancos').createSignedUrl(b.arquivo_path, 3600, { download:b.arquivo_nome||true }); if(error) throw error;
      const nome=b.arquivo_nome||'arquivo'; const ext=(nome.split('.').pop()||'').toLowerCase();
      const btn=`<a class="btn" href="${sig.signedUrl}" target="_blank" rel="noopener">⬇ Baixar ${esc(nome)}</a>`;
      if(['xlsx','xls','csv'].includes(ext) && window.XLSX){
        const { data:blob, error:e2 } = await S.sb.storage.from('balancos').download(b.arquivo_path); if(e2) throw e2;
        const wb=XLSX.read(await blob.arrayBuffer(),{type:'array'});
        const abas=wb.SheetNames; let atual=abas[0];
        const desenha=()=>{ const html=XLSX.utils.sheet_to_html(wb.Sheets[atual],{editable:false}).replace(/^[\s\S]*?<table/,'<table').replace(/<\/table>[\s\S]*$/,'</table>');
          box.innerHTML=`<div class="row" style="margin-bottom:8px">${abas.length>1?`<div class="tabs2">${abas.map(a=>`<button data-aba="${esc(a)}" class="${a===atual?'on':''}">${esc(a)}</button>`).join('')}</div>`:''}<div class="sp"></div>${btn}</div><div class="tw xls" style="max-height:50vh">${html}</div>`;
          box.querySelectorAll('[data-aba]').forEach(x=>x.onclick=()=>{ atual=x.dataset.aba; desenha(); }); };
        desenha();
      } else if(['png','jpg','jpeg','webp','gif'].includes(ext)){
        const { data:s2 } = await S.sb.storage.from('balancos').createSignedUrl(b.arquivo_path, 3600);
        box.innerHTML=`<div class="row" style="margin-bottom:8px"><div class="sp"></div>${btn}</div><img src="${s2.signedUrl}" alt="Relatório do balanço" style="max-width:100%;border:1px solid var(--line);border-radius:10px">`;
      } else if(ext==='pdf'){
        const { data:s2 } = await S.sb.storage.from('balancos').createSignedUrl(b.arquivo_path, 3600);
        box.innerHTML=`<div class="row" style="margin-bottom:8px"><a class="btn y" href="${s2.signedUrl}" target="_blank" rel="noopener">Abrir PDF</a><div class="sp"></div>${btn}</div><iframe src="${s2.signedUrl}" style="width:100%;height:60vh;border:1px solid var(--line);border-radius:10px" title="Relatório do balanço"></iframe>`;
      } else box.innerHTML=btn;
    }catch(e){ box.innerHTML=`<p class="note err small">Não foi possível abrir o arquivo: ${esc(e.message||e)}</p>`; }
  }
}

/* ===================== conta, login e navegação ===================== */
const VIEWS_G=[['painel','Painel'],['setor','Setores'],['trocas','Trocas'],['perdas','Balanços e Perdas'],['precos','Preços'],['ponto','Ponto'],['diarias','Diárias'],['historico','Histórico']];
const VIEWS_E=[['hoje','Hoje'],['setor','Meu setor'],['historico','Histórico']];
function montarCabecalho(){
  const v=(S.gerente?VIEWS_G:VIEWS_E).map(([k,t])=>[k, (!S.gerente && k==='setor' && meusSetoresIds().length>1)?'Meus setores':t]);
  $('#nav').innerHTML=v.map(([k,t])=>`<a href="#${k}" data-v="${k}">${t}</a>`).join(''); $('#nav').classList.remove('hide');
  $('#hctl').classList.remove('hide');
  $('#userBox').innerHTML=`<button id="bAtualizar" title="Buscar os números mais recentes">🔄</button><button id="bConta" title="Minha conta e administração">👤 ${esc((S.perfil.nome||S.user.email).split(' ')[0])}</button>`; $('#userBox').classList.remove('hide');
  $('#bConta').onclick=()=>{ location.hash='#conta'; };
  montarBnav(); try{ botaoBusca(); }catch(_){ }
  $('#bAtualizar').onclick=()=>atualizarDados(true);
}
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible' && S.sb && S.user){ try{ S.sb.auth.startAutoRefresh?.(); tokenValido(false).catch(()=>{}); }catch(_){} } });
['gesturestart','gesturechange','gestureend'].forEach(ev=>document.addEventListener(ev,e=>e.preventDefault(),{passive:false})); // iPhone: bloqueia o zoom de pinça
function route(){
  const h=(location.hash||'#painel').slice(1); const v=[...(S.gerente?VIEWS_G:VIEWS_E).map(x=>x[0]),'conta', ...(S.gerente?['balancos','fechamento']:[])];
  const antes=S.view; if(S.gerente && (h==='lancar'||h==='metas')){ S.admAberto=h; S._admRolar=true; S.view='conta'; history.replaceState(null,'','#conta'); } else S.view=v.includes(h)?h:(S.gerente?'painel':'hoje');
  if(antes && antes!==S.view && antes!=='painel') S.voltarPainel = S.voltarPainel && S.view==='painel';
  document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('on',a.dataset.v===S.view || (a.dataset.v==='perdas' && S.view==='balancos')));
  $('#bConta')?.classList.toggle('on', S.view==='conta'||S.view==='metas');
  render(); marcarBnav();
  // ao trocar de tela, começa do topo; ao voltar para o painel, volta para onde estava
  if(antes!==S.view){ if(S.view==='painel' && S.voltarPainel && S.painelScroll!=null){ const y=S.painelScroll; requestAnimationFrame(()=>window.scrollTo(0,y)); S.voltarPainel=false; } else window.scrollTo(0,0); }
}
function fillMesSelect(){
  const sel=$('#selMes'); const ks=[...S.mesList].sort().reverse();
  sel.innerHTML = ks.map(k=>`<option value="${k}" ${k===S.mes?'selected':''}>${mesLabel(k)}</option>`).join('') || '<option>—</option>';
}
async function trocarMes(m){
  S.mes=m; S.cutoff=null; S.lancData=null;
  if(!S.months[m]){ $('#app').innerHTML='<div class="empty"><span class="spin"></span> Carregando…</div>'; try{ await carregarMes(m); }catch(e){ toast(e.message,5000); } }
  const [y,mm]=m.split('-'); garantirMes(`${+y-1}-${mm}`).then(()=>{ if(S.view==='painel'||S.view==='setor') render(); }).catch(()=>{});
  carregarAnteriores(m);
  render();
}

function telaLogin(msg){
  ['#nav','#hctl','#userBox'].forEach(x=>$(x).classList.add('hide'));
  $('#app').innerHTML=`<div class="login"><img class="login-logo" src="logo.png?v=2" alt="Supermercados Bom Dia São Luiz"><h1>Entrar</h1><p class="sub">Painel de metas da loja Bom Dia São Luiz — Araruna.</p>
   ${msg?`<div class="note err small" style="margin-bottom:12px">${esc(msg)}</div>`:''}
   <form id="fLogin" method="post" action="#"><label class="f">E-mail<input id="lEmail" name="username" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" required></label>
   <label class="f">Senha<span style="position:relative;display:block"><input id="lSenha" name="password" type="password" autocomplete="current-password" required style="padding-right:44px;width:100%"><button type="button" id="lOlho" title="Mostrar senha" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:none;font-size:18px;cursor:pointer">👁</button></span></label>
   <label class="small" style="display:flex;gap:6px;align-items:center;margin:2px 0 12px"><input type="checkbox" id="lLembrar"> Lembrar meu e-mail neste aparelho</label>
   <div id="lErr" class="note err small hide" style="margin-bottom:10px"></div>
   <button class="btn p" style="width:100%;justify-content:center" id="lBtn">Entrar</button></form>
   <p class="small muted" style="margin-top:12px">📱 No celular: quando o aparelho perguntar, toque em <b>Salvar senha</b>. Nas próximas vezes a digital ou o Face ID preenche tudo.</p>
   <p class="small muted" style="margin-top:8px">Esqueceu a senha? Peça ao gerente para cadastrar uma nova.<br><a href="#" id="lPrim">Primeiro acesso do gerente</a></p></div>`;
  try{ const em=localStorage.getItem('metas_email'); if(em){ $('#lEmail').value=em; $('#lLembrar').checked=true; setTimeout(()=>$('#lSenha').focus(),50); } }catch(_){}
  $('#lOlho').onclick=()=>{ const i=$('#lSenha'); i.type=i.type==='password'?'text':'password'; $('#lOlho').textContent=i.type==='password'?'👁':'🙈'; };
  $('#fLogin').onsubmit=async e=>{ e.preventDefault(); const er=$('#lErr'); er.classList.add('hide'); $('#lBtn').disabled=true;
    const { error } = await S.sb.auth.signInWithPassword({ email:$('#lEmail').value.trim(), password:$('#lSenha').value });
    if(error){ er.textContent = /invalid/i.test(error.message)?'E-mail ou senha incorretos.':error.message; er.classList.remove('hide'); $('#lBtn').disabled=false; return; }
    try{ if($('#lLembrar').checked) localStorage.setItem('metas_email',$('#lEmail').value.trim()); else localStorage.removeItem('metas_email'); }catch(_){}
    try{ if(window.PasswordCredential && navigator.credentials?.store) await navigator.credentials.store(new PasswordCredential({id:$('#lEmail').value.trim(), password:$('#lSenha').value, name:$('#lEmail').value.trim()})); }catch(_){}
    marcarAtividade(); iniciarSessao(); };
  $('#lPrim').onclick=e=>{ e.preventDefault(); telaPrimeiroAcesso(); };
}
function telaPrimeiroAcesso(){
  $('#app').innerHTML=`<div class="login"><h1>Primeiro acesso do gerente</h1><p class="sub">Use o código de liberação que você recebeu. Ele só funciona uma vez.</p>
   <form id="fPrim"><label class="f">Código de liberação<input id="pCod" required placeholder="BD-XXXXXX-XXXXXX"></label>
   <label class="f">Seu nome<input id="pNome" required></label>
   <label class="f">E-mail<input id="pEmail" type="email" required></label>
   <label class="f">Senha (mínimo 8 caracteres)<input id="pSenha" type="password" required minlength="8"></label>
   <div id="pErr" class="note err small hide" style="margin-bottom:10px"></div>
   <button class="btn p" style="width:100%;justify-content:center" id="pBtn">Criar acesso de gerente</button></form>
   <p class="small" style="margin-top:14px"><a href="#" id="pVolta">← Voltar para o login</a></p></div>`;
  $('#pVolta').onclick=e=>{ e.preventDefault(); telaLogin(); };
  $('#fPrim').onsubmit=async e=>{ e.preventDefault(); const er=$('#pErr'); er.classList.add('hide'); $('#pBtn').disabled=true;
    try{ await chamarUsuarios({acao:'primeiro_gerente', codigo:$('#pCod').value, nome:$('#pNome').value, email:$('#pEmail').value, senha:$('#pSenha').value});
      const { error } = await S.sb.auth.signInWithPassword({ email:$('#pEmail').value.trim(), password:$('#pSenha').value }); if(error) throw error;
      iniciarSessao(); }
    catch(x){ er.textContent=x.message; er.classList.remove('hide'); $('#pBtn').disabled=false; } };
}
async function iniciarSessao(){
  let session=null;
  try{ const g=await Promise.race([ S.sb.auth.getSession(), new Promise((_,rej)=>setTimeout(()=>rej(new Error('tempo')),12000)) ]); session=g?.data?.session||null; if(g?.error) session=null; }catch(_){ session=null; }
  // sessão vencida/derrubada (token não existe mais): limpa e pede login em vez de ficar carregando
  if(session){ try{ const u=await Promise.race([ S.sb.auth.getUser(), new Promise((_,rej)=>setTimeout(()=>rej(new Error('tempo')),12000)) ]); if(u?.error || !u?.data?.user){ try{ Object.keys(localStorage).filter(k=>k.startsWith('sb-')).forEach(k=>localStorage.removeItem(k)); }catch(_){ } session=null; } }catch(_){ } }
  if(!session) return telaLogin();
  let ult=0; try{ ult=+localStorage.getItem('metas_ultima_atividade')||0; }catch(_){ }
  if(ult && Date.now()-ult>LIMITE_INATIVO && !aparelhoCelular()){ return sair('Sua sessão expirou por inatividade. Entre novamente.'); }
  S.user=session.user;
  $('#app').innerHTML='<div class="empty"><span class="spin"></span> Carregando dados…</div>';
  // se travar, em vez de ficar girando para sempre, oferece recarregar ou entrar de novo
  clearTimeout(S._vigia); S._vigia=setTimeout(()=>{ if(S.loaded) return; const a=$('#app'); if(!a) return;
    a.innerHTML=`<div class="card empty"><h2>Está demorando para carregar</h2><p>A internet pode estar lenta, ou a sessão ficou presa neste navegador.</p>
      <div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap"><button class="btn p" id="vgRec">🔄 Recarregar</button><button class="btn" id="vgSair">Sair e entrar de novo</button></div></div>`;
    $('#vgRec').onclick=()=>location.reload();
    $('#vgSair').onclick=async()=>{ try{ Object.keys(localStorage).filter(k=>k.startsWith('sb-')).forEach(k=>localStorage.removeItem(k)); }catch(_){ } try{ await S.sb.auth.signOut({scope:'local'}); }catch(_){ } location.reload(); };
  }, 20000);
  try{
    const p=await q(S.sb.from('perfis').select('*').eq('id',S.user.id));
    if(!p.length){ await S.sb.auth.signOut({scope:'local'}); return telaLogin('Seu usuário ainda não foi liberado pelo gerente.'); }
    S.perfil=p[0]; S.gerente=S.gerenteReal=S.perfil.papel==='gerente'; S.preview=null;
    S.setoresAll=await q(S.sb.from('setores').select('*').order('ordem'));
    await carregarDatas();
    await carregarListaMeses();
    const cur=todayIso().slice(0,7); S.mes = S.mesList.includes(cur)?cur:(S.mesList[S.mesList.length-1]||null);
    if(S.mes) await carregarMes(S.mes);
    if(S.mes){ const [y,mm]=S.mes.split('-'); await garantirMes(`${+y-1}-${mm}`).catch(()=>{}); carregarAnteriores(S.mes); }
    S._ultimaCarga=Date.now(); S.loaded=true; S._marcaDados=undefined; setTimeout(verificarDadosNovos,1500); document.body.classList.toggle('enc',!S.gerente); montarCabecalho(); route(); iniciarInatividade();
  }catch(e){ console.error(e); $('#app').innerHTML=`<div class="note err">Erro ao carregar: ${esc(e.message||e)}</div>`; }
}

(function init(){
  if(!window.supabase){ $('#app').innerHTML='<div class="note err">Não foi possível carregar o site. Verifique a internet e recarregue.</div>'; return; }
  // lock simples: o Safari (Mac/iPhone) às vezes trava a sessão em "Carregando dados" com o lock padrão entre abas
  S.sb = window.supabase.createClient(METAS_CONFIG.url, METAS_CONFIG.anonKey, { auth:{ persistSession:true, autoRefreshToken:true, lock: async (_nome, _espera, fn) => await fn() } });
  window.addEventListener('hashchange',()=>{ if(S.loaded) route(); });
  $('#selMes').addEventListener('change',e=>trocarMes(e.target.value));
  S.sb.auth.onAuthStateChange((ev)=>{ if(ev==='SIGNED_OUT' && !S._saindo){ S.loaded=false; telaLogin(); } });
  iniciarSessao();
})();

/* ===================== ver como encarregado (só para o gerente conferir) ===================== */
function docComoEncarregado(doc, setores){
  const sh=doc.setores.filter(x=>setores.includes(x.id)); const tot=sum(sh.map(x=>x.meta)); const f=tot/(doc.metaLoja||1);
  const dias={};
  for(const [k,d] of Object.entries(doc.dias||{})){ const n={meta:round2((+d.meta||0)*f)};
    const v={}, p={}; for(const id of setores){ if(d.vendas?.[id]!=null) v[id]=d.vendas[id]; if(d.perdas?.[id]!=null) p[id]=d.perdas[id]; }
    if(Object.keys(v).length) n.vendas=v; if(Object.keys(p).length) n.perdas=p; dias[k]=n; }
  return { mes:doc.mes, metaLoja:tot, setores:clone(sh), dias, balancos:(doc.balancos||[]).filter(b=>setores.includes(b.setor_id)) };
}
function escolherVisualizacao(){
  const m=modal(`<h2>👁 Ver o site como um encarregado</h2><p class="small muted">Marque os setores do encarregado. Você verá exatamente as telas e os números que ele vê. Nada é salvo nesse modo.</p>
   <div class="chk">${S.setoresAll.map(x=>`<label><input type="checkbox" value="${x.id}" ${x.id==='acougue'?'checked':''}>${esc(x.nome)}</label>`).join('')}</div>
   <div class="row" style="margin-top:14px"><div class="sp"></div><button class="btn" id="mN">Cancelar</button><button class="btn p" id="mY">Ver como encarregado</button></div>`);
  $('#mN',m).onclick=closeModal;
  $('#mY',m).onclick=()=>{ const ss=[...m.querySelectorAll('.chk input:checked')].map(i=>i.value); if(!ss.length) return toast('Marque pelo menos um setor.'); closeModal(); entrarVisualizacao('Encarregado de '+ss.map(nomeSetor).join(', '), ss); };
}
async function entrarVisualizacao(nome, setores){
  if(!S.gerenteReal) return;
  S.preview={nome, setores}; S.gerente=false; S.months={}; S._tudo=false;
  document.body.classList.add('enc'); montarCabecalho(); mostrarFaixaVisualizacao();
  const cur=S.mes; $('#app').innerHTML='<div class="empty"><span class="spin"></span> Montando a visão do encarregado…</div>';
  try{ await carregarMes(cur); const [y,mm]=cur.split('-'); await garantirMes(`${+y-1}-${mm}`).catch(()=>{}); await carregarAnteriores(cur); }catch(e){ toast(e.message); }
  location.hash='#setor'; route();
}
async function sairVisualizacao(){
  S.preview=null; S.gerente=true; S.months={}; S._tudo=false;
  document.body.classList.remove('enc'); $('#faixaVis')?.remove(); montarCabecalho();
  try{ await carregarMes(S.mes); const [y,mm]=S.mes.split('-'); await garantirMes(`${+y-1}-${mm}`).catch(()=>{}); await carregarAnteriores(S.mes); }catch(_){ }
  location.hash='#conta'; route();
}
function mostrarFaixaVisualizacao(){
  $('#faixaVis')?.remove();
  const d=document.createElement('div'); d.id='faixaVis';
  d.style.cssText='background:var(--yellow);color:#2a2000;font-weight:700;padding:8px 16px;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;position:sticky;top:0;z-index:30';
  d.innerHTML=`👁 Você está vendo o site como: ${esc(S.preview.nome)} (${esc(S.preview.setores.map(nomeSetor).join(', '))}) — nada é salvo neste modo <button class="btn" id="bSairVis" style="padding:4px 10px">Voltar a ser gerente</button>`;
  document.body.insertBefore(d, document.querySelector('main'));
  $('#bSairVis').onclick=sairVisualizacao;
}

/* ===================== saída automática por inatividade ===================== */
const LIMITE_INATIVO=15*60*1000, AVISO_ANTES=60*1000;
// no celular (ou no app instalado na tela inicial) não desconecta por inatividade; só no computador
function aparelhoCelular(){ try{ return /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent) || !!navigator.standalone || matchMedia('(display-mode: standalone)').matches || (matchMedia('(pointer:coarse)').matches && !matchMedia('(pointer:fine)').matches); }catch(_){ return false; } }
function marcarAtividade(){ S.ultimaAtividade=Date.now(); try{ localStorage.setItem('metas_ultima_atividade', String(S.ultimaAtividade)); }catch(_){ } if(S._avisoInat){ S._avisoInat.remove(); S._avisoInat=null; } }
function ultimaAtividade(){ let v=S.ultimaAtividade||0; try{ v=Math.max(v, +localStorage.getItem('metas_ultima_atividade')||0); }catch(_){ } return v; }
async function sair(motivo){
  S._saindo=true;
  clearInterval(S._timerInat); try{ localStorage.removeItem('metas_ultima_atividade'); }catch(_){ }
  S.loaded=false; S.preview=null; S.months={}; S._tudo=false; $('#faixaVis')?.remove(); closeModal();
  // sai só deste aparelho: sair no celular (ou por inatividade no PC) não derruba a sessão dos outros aparelhos
  try{ await S.sb.auth.signOut({scope:'local'}); }catch(_){ } $('#fabBusca')?.remove();
  history.replaceState(null,'',location.pathname); telaLogin(motivo); S._saindo=false;
}
function iniciarInatividade(){
  clearInterval(S._timerInat); S._timerInat=setInterval(verificarInatividade, 10000);
  if(S._inatOk){ marcarAtividade(); return; }
  S._inatOk=true;
  ['mousemove','mousedown','keydown','touchstart','scroll','wheel'].forEach(ev=>window.addEventListener(ev,()=>{ if(S.loaded && Date.now()-(S.ultimaAtividade||0)>5000) marcarAtividade(); },{passive:true}));
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden && S.loaded) verificarInatividade(); });
  marcarAtividade();
}
function verificarInatividade(){
  if(!S.loaded || aparelhoCelular()) return;
  const parado=Date.now()-ultimaAtividade();
  if(parado>=LIMITE_INATIVO) return sair('Você ficou 15 minutos sem usar o site e foi desconectado por segurança. Entre novamente.');
  if(parado>=LIMITE_INATIVO-AVISO_ANTES && !S._avisoInat){
    const a=document.createElement('div'); a.className='toast'; a.style.cssText+='display:flex;gap:10px;align-items:center';
    a.innerHTML='⏳ Sem atividade: você vai sair do site em 1 minuto. <button class="btn y" style="padding:4px 10px">Continuar conectado</button>';
    a.querySelector('button').onclick=marcarAtividade; document.body.appendChild(a); S._avisoInat=a;
  }
}


/* ===================== leitura de imagem (OCR, sem custo, roda no navegador) ===================== */
let _tesseract=null;
function carregarTesseract(){
  if(window.Tesseract) return Promise.resolve();
  if(_tesseract) return _tesseract;
  _tesseract=new Promise((ok,erro)=>{ const sc=document.createElement('script'); sc.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'; sc.onload=ok; sc.onerror=()=>{ _tesseract=null; erro(new Error('Não foi possível carregar o leitor de imagem. Verifique a internet.')); }; document.head.appendChild(sc); });
  return _tesseract;
}
async function prepararImagem(src){ // aumenta, deixa em tons de cinza e com mais contraste (melhora a leitura)
  let w,h,draw;
  if(src instanceof HTMLCanvasElement){ w=src.width; h=src.height; draw=ctx=>ctx.drawImage(src,0,0,w,h); }
  else { const url=URL.createObjectURL(src); const img=await new Promise((ok,er)=>{ const i=new Image(); i.onload=()=>ok(i); i.onerror=er; i.src=url; }); URL.revokeObjectURL(url);
    const esc=Math.min(3, Math.max(1, 2400/Math.max(img.width,img.height))); w=Math.round(img.width*esc); h=Math.round(img.height*esc); draw=ctx=>ctx.drawImage(img,0,0,w,h); }
  const c=document.createElement('canvas'); c.width=w; c.height=h; const ctx=c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h); draw(ctx);
  const d=ctx.getImageData(0,0,w,h), a=d.data;
  for(let i=0;i<a.length;i+=4){ let g=0.299*a[i]+0.587*a[i+1]+0.114*a[i+2]; g=g>170?255:(g<90?0:(g-90)*255/80); a[i]=a[i+1]=a[i+2]=g; }
  ctx.putImageData(d,0,0); return c;
}
function limparTextoOcr(t){
  return t.split(/\r?\n/).map(l=>l
    .replace(/(\d)\s+(?=\d{3}[,.]\d{2}\b)/g,'$1')      // "20 841,31" -> "20841,31"
    .replace(/(\d)[.,]\s+(\d{2})\b/g,'$1,$2')            // "841, 31" -> "841,31"
    .replace(/(\d)[Oo](?=\d)/g,'$10').replace(/(\d)[Oo]\b/g,'$10')     // O lido no lugar de 0
    .replace(/(\d)[lI|](?=\d)/g,'$11')
  ).filter(l=>l.trim());
}
async function ocrParaRevisao(fontes, nome){
  busy('Lendo a imagem… (a primeira vez demora um pouco)');
  await carregarTesseract();
  const worker=await Tesseract.createWorker('por');
  let texto='';
  try{
    for(let i=0;i<fontes.length;i++){ const m=$('#modalRoot h2'); if(m) m.innerHTML=`<span class="spin"></span> Lendo ${fontes.length>1?`imagem ${i+1} de ${fontes.length}`:'a imagem'}…`;
      const c=await prepararImagem(fontes[i]); const { data } = await worker.recognize(c); texto+=data.text+'\n'; }
  } finally { await worker.terminate(); }
  const linhas=limparTextoOcr(texto);
  const r=Parser.parseLines(linhas.map(l=>({text:l}))); r.fonte=nome+' (leitura da imagem)';
  r.obs=(Object.keys(r.vendas).length? 'Valores lidos da imagem. A leitura de foto pode errar algum número — confira cada setor com o relatório antes de salvar.' : 'Não consegui identificar os setores na imagem. Tente um print mais nítido, ou digite os valores.') + (r.obs? ' '+r.obs:'');
  r.textoLido=linhas.join('\n');
  reviewImport(r);
}
async function importImages(files){
  if(!S.gerente) return toast('Só o gerente lança vendas.');
  files=files.filter(f=>f.type.startsWith('image/')).slice(0,6); if(!files.length) return toast('Escolha uma imagem (foto ou print).');
  try{ await ocrParaRevisao(files, files.length>1?`${files.length} imagens`:files[0].name); }
  catch(e){ console.error(e); closeModal(); toast('Não consegui ler a imagem: '+(e.message||e),6000); }
}

/* ===================== alertas do painel ===================== */
function mesAnterior(m, n=1){ const [y,mm]=m.split('-').map(Number); const d=new Date(y,mm-1-n,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
async function carregarAnteriores(m){
  try{ for(let i=1;i<=3;i++) await garantirMes(mesAnterior(m,i)); }catch(_){ }
  if((S.view==='painel'||S.view==='setor') && S.mes===m) render();
}
function mediaPerdaAnterior(mes, id){ // % de perda média do setor nos 3 meses anteriores (com dados)
  let perda=0, venda=0, n=0;
  for(let i=1;i<=3;i++){ const d=S.months[mesAnterior(mes,i)]; if(!d) continue; const c=resumoMes(d); const s=c.setores.find(x=>x.id===id); if(s&&s.real){ perda+=s.perda; venda+=s.real; n++; } }
  return n&&venda? {pct:perda/venda, meses:n} : null;
}
function alertasPainel(doc, loja, setores, soSetor){
  const itens=[]; const hoje=todayIso(); const dias=diasDoMes(doc.mes);
  // dias sem lançamento (só o gerente lança)
  if(S.gerente && !soSetor){
    const faltando=[], incompletos=[];
    for(const k of dias){ if(k>=hoje) break; const d=doc.dias?.[k]||{}; const n=d.vendas?Object.keys(d.vendas).filter(i=>d.vendas[i]).length:0;
      if(!n && !(+d.total>0)) faltando.push(k); else if(n<doc.setores.length) incompletos.push(k); }
    if(faltando.length) itens.push({t:'bad', h:`${faltando.length} dia(s) sem lançamento`, d:faltando.map(k=>`<a href="#lancar" data-dia="${k}" class="badge b-bad">${fDateL(k)}</a>`).join(' ')});
    if(incompletos.length) itens.push({t:'warn', h:`${incompletos.length} dia(s) com lançamento incompleto`, d:incompletos.map(k=>{ const dd=doc.dias[k]; const n=dd.vendas?Object.keys(dd.vendas).length:0; return `<a href="#lancar" data-dia="${k}" class="badge b-warn" title="${n?n+' de '+doc.setores.length+' setores':'só o total do caixa'}">${fDateL(k)} · ${n?n+'/'+doc.setores.length+' setores':'só caixa'}</a>`; }).join(' ')});
  }
  // setores: 3 dias seguidos abaixo de 90% da meta do dia
  const seq=[];
  for(const s of setores){ const ds=s.daily.filter(d=>d.ate && d.meta>0 && d.real>0); const ult=ds.slice(-3);
    if(ult.length===3 && ult.every(d=>d.real/d.meta<0.9)) seq.push(`<b>${esc(s.nome)}</b> (${ult.map(d=>pct(d.real/d.meta,0)).join(', ')})`); }
  if(seq.length) itens.push({t:'bad', h:'3 dias seguidos abaixo de 90% da meta do dia', d:seq.join(' · ')});
  // setores: perda acima da média dos últimos 3 meses
  const per=[];
  for(const s of setores){ if(!s.perda||!s.real) continue; const m=mediaPerdaAnterior(doc.mes,s.id); if(m && m.pct>0 && s.pPerda>m.pct*1.25) per.push(`<b>${esc(s.nome)}</b> ${pct(s.pPerda,2)} (média ${pct(m.pct,2)})`); }
  if(per.length) itens.push({t:'warn', h:'Perda acima da média dos últimos meses', d:per.join(' · ')});
  // setores abaixo da meta acumulada
  const abaixo=setores.filter(s=>s.pAte!=null && s.pAte<0.9).map(s=>`<b>${esc(s.nome)}</b> ${pct(s.pAte)}`);
  if(abaixo.length) itens.push({t:'warn', h:'Abaixo de 90% da meta acumulada', d:abaixo.join(' · ')});
  if(!itens.length) return soSetor ? `<div class="note ok small" style="margin-top:12px">✔ Nenhum alerta: sem queda seguida, perda dentro do normal e acima de 90% da meta acumulada.</div>` : `<div class="note ok small" style="margin-top:12px">✔ Nenhum alerta: ${S.gerente?'todos os dias lançados e ':''}nenhum setor com queda seguida ou perda fora do normal.</div>`;
  setTimeout(()=>document.querySelectorAll('a[data-dia]').forEach(a=>a.onclick=()=>{ S.lancData=a.dataset.dia; }),0);
  return `<div class="card m-dobra" data-dobra="alertas" style="margin-top:12px;border-color:#f1d98a"><h2 class="m-dobra-h" style="margin:0 0 8px">⚠ Alertas <span class="badge b-warn">${itens.length}</span></h2>${itens.map(i=>`<div style="padding:8px 0;border-top:1px solid var(--line)"><div class="small" style="font-weight:700;color:${i.t==='bad'?'var(--bad)':'var(--warn)'}">${i.t==='bad'?'▼':'▲'} ${i.h}</div><div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:14px">${i.d}</div></div>`).join('')}</div>`;
}

/* ===================== instalar no celular ===================== */
let _promptInstalar=null;
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); _promptInstalar=e; });
function instalarApp(){
  if(_promptInstalar){ _promptInstalar.prompt(); _promptInstalar.userChoice.finally(()=>{ _promptInstalar=null; }); return; }
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
  modal(`<h2>📲 Colocar o ícone na tela do celular</h2>
   ${ios?`<ol><li>Abra este site no <b>Safari</b>.</li><li>Toque no botão <b>Compartilhar</b> (quadrado com seta para cima).</li><li>Toque em <b>Adicionar à Tela de Início</b> e depois em <b>Adicionar</b>.</li></ol>`
        :`<ol><li>Abra este site no <b>Chrome</b> do celular.</li><li>Toque nos <b>três pontinhos</b> (⋮) no canto de cima.</li><li>Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li></ol>`}
   <p class="small muted">O ícone "Metas BD" aparece junto com os outros aplicativos e abre o site direto, em tela cheia.</p>
   <div class="row"><div class="sp"></div><button class="btn p" onclick="closeModal()">Entendi</button></div>`);
}
if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{})); }


/* ===================== valor da perda a partir do relatório do balanço ===================== */
async function linhasDoArquivo(f){
  const nome=f.name.toLowerCase();
  if(/\.(xlsx|xls|xlsm|csv)$/.test(nome)){
    if(!window.XLSX) throw new Error('Leitor de Excel não carregou.');
    const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true}); const out=[];
    for(const sn of wb.SheetNames){ const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:null});
      for(const r of rows){ const cells=r.filter(c=>c!=null&&c!==''); if(!cells.length) continue;
        out.push({text:cells.map(c=>c instanceof Date?fDate(isoOf(c))+'/'+c.getFullYear():c).join('  '), nums:cells.filter(c=>typeof c==='number')}); } }
    return out;
  }
  if(nome.endsWith('.pdf')){
    if(!window.pdfjsLib) throw new Error('Leitor de PDF não carregou.');
    const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise; const out=[]; const imgs=[];
    for(let p=1;p<=Math.min(pdf.numPages,5000);p++){ const pg=await pdf.getPage(p); const tc=await pg.getTextContent();
      const map=new Map(); for(const it of tc.items){ const y=Math.round(it.transform[5]/3); if(!map.has(y)) map.set(y,[]); map.get(y).push({x:it.transform[4],s:it.str}); }
      [...map.entries()].sort((a,b)=>b[0]-a[0]).forEach(([,its])=>out.push({text:its.sort((a,b)=>a.x-b.x).map(i=>i.s).join('  ')}));
      if(!tc.items.length && p>=pdf.numPages-1){ const vp=pg.getViewport({scale:2.2}); const c=document.createElement('canvas'); c.width=vp.width; c.height=vp.height; await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise; imgs.push(c); } }
    if(out.join('').replace(/\s/g,'').length<20 && imgs.length) return await linhasOcr(imgs);
    return out;
  }
  if(f.type.startsWith('image/')) return await linhasOcr([f]);
  return [];
}
async function linhasOcr(fontes){
  await carregarTesseract(); const w=await Tesseract.createWorker('por'); let t='';
  try{ for(const x of fontes){ const c=await prepararImagem(x); const { data } = await w.recognize(c); t+=data.text+'\n'; } } finally { await w.terminate(); }
  return limparTextoOcr(t).map(l=>({text:l}));
}
async function kpiTrocasMes(el, doc, loja){
  if(!el) return; const ini=doc.mes+'-01';
  let R=[]; try{ R=await q(S.sb.from('analise_trocas').select('setor_id,periodo_fim,custo').eq('periodo_inicio',ini).lte('periodo_fim',fimDoMes(doc.mes))); }catch(_){ }
  if(!el.isConnected) return;
  const ult={}; for(const r of R) if(!ult[r.setor_id] || r.periodo_fim>ult[r.setor_id].periodo_fim) ult[r.setor_id]=r;
  const ls=Object.values(ult); if(!ls.length){ el.innerHTML='<div class="l">Trocas do mês</div><div class="v">—</div><div class="d">nenhum relatório de trocas no mês</div>'; return; }
  const tot=ls.reduce((a,r)=>a+(+r.custo||0),0), ate=ls.map(r=>r.periodo_fim).sort().pop();
  el.innerHTML=`<div class="l">Trocas do mês</div><div class="v">${brl0(tot)}</div><div class="d">a custo, até ${fD(ate)}${loja.real?` · ${pct(tot/loja.real,2)} da venda`:''} · <a href="#trocas">ver trocas</a></div>`;
}
function avisarBalCorrigidos(){ const c=S._balCorrigidos||[]; if(!c.length) return; S._balCorrigidos=[];
  toast(`Balanço relido do PDF: ${c.map(x=>`${nomeSetor(x.setor)} ${fD(x.data)} ${x.de!=null?brl0(+x.de)+' → ':''}${brl0(x.para)}`).join(' · ')}`, 9000); }
async function extrairPerdaArquivo(f){
  const linhas=await linhasDoArquivo(f);
  const an=Parser.analisarBalancoSistema(linhas);
  if(an) return { valor:an.valorPerda, linha:`TOTAL DE PERDAS do resultado geral: ${brl(an.geral.perdas)}`, data:an.periodo.fim, ini:an.periodo.ini, analise:an };
  // reserva: período "DE dd/mm/aa A dd/mm/aa" (segunda linha) e o último "TOTAL DE PERDAS...: -541,712" (última folha)
  { const txt=linhas.map(l=>String(l.text||l).replace(/\s+/g,' '));
    const d2=s=>{ const m=s.match(/(\d{2})\/(\d{2})\/(\d{2,4})/); return m? `${m[3].length===2?'20'+m[3]:m[3]}-${m[2]}-${m[1]}` : null; };
    const pl=txt.find(t=>/\bDE \d{2}\/\d{2}\/\d{2,4} A \d{2}\/\d{2}\/\d{2,4}/i.test(t));
    const tps=txt.filter(t=>/TOTAL DE PERDAS\.*\s*:/i.test(t));
    if(tps.length){ const mm=tps[tps.length-1].match(/TOTAL DE PERDAS\.*\s*:\s*(-?[\d.]*\d(?:,\d+)?)/i);
      if(mm){ const v=parseFloat(mm[1].replace(/\./g,'').replace(',','.')); const pm=pl&&pl.match(/DE (\d{2}\/\d{2}\/\d{2,4}) A (\d{2}\/\d{2}\/\d{2,4})/i);
        return { valor: v<0? Math.round(-v*100)/100 : 0, linha:`TOTAL DE PERDAS da última folha: ${mm[1]}`, data: pm? d2(pm[2]) : null, ini: pm? d2(pm[1]) : null }; } } }
  let data=null;
  for(const l of linhas){ const m=String(l.text).match(/(\d{2})[\/.-](\d{2})[\/.-](\d{2,4})/); if(m){ const y=m[3].length===2?'20'+m[3]:m[3]; const k=`${y}-${m[2]}-${m[1]}`; if(!isNaN(new Date(k))){ data=k; break; } } }
  const numsDe=l=>{ if(l.nums&&l.nums.length) return l.nums; const t=String(l.text).replace(/^[^0-9(-]*/,''); return Parser.extractNums(t).filter(v=>!(Number.isInteger(v)&&Math.abs(v)<100)); };
  const grupos=[/total\s+(?:de\s+|das\s+)?perdas?/i, /perda|diferen[cç]a|quebra|falta|sobra\s*\/\s*falta|resultado/i, /total\s*geral|total/i];
  for(const re of grupos){
    const cands=linhas.filter(l=>re.test(String(l.text))).map(l=>({l, ns:numsDe(l)})).filter(x=>x.ns.length);
    if(cands.length){ const x=cands[cands.length-1]; const t=String(x.l.text); const mm=t.match(re); const depois=Parser.extractNums(t.slice(mm.index+mm[0].length).replace(/^[^0-9(-]*/,'')); const v=(x.l.nums&&x.l.nums.length)? x.ns[x.ns.length-1] : (depois.length? depois[0] : x.ns[x.ns.length-1]); return {valor:round2(Math.abs(v)), linha:t, data}; }
  }
  return {valor:null, linha:'', data};
}


/* ===================== atualizar dados e aviso de versão nova do site ===================== */
async function atualizarDados(avisar){
  if(!S.loaded) return;
  const b=$('#bAtualizar'); if(b){ b.disabled=true; b.textContent='⏳'; }
  try{
    const manter=S.mes; S.months={}; S._tudo=false; await carregarListaMeses();
    if(manter && S.mesList.includes(manter)) await carregarMes(manter);
    S.cutoff=null; S._ultimaCarga=Date.now(); render(); if(avisar) toast('Números atualizados ✔');
  }catch(e){ if(avisar) toast('Não foi possível atualizar: '+e.message,5000); }
  finally{ if(b){ b.disabled=false; b.textContent='🔄'; } }
}
async function verificarVersao(){
  try{
    const r=await fetch('version.json?t='+Date.now(),{cache:'no-store'}); if(!r.ok) return;
    const { versao } = await r.json();
    if(versao && VERSAO_SITE && versao!==VERSAO_SITE) mostrarAvisoVersao();
  }catch(_){ }
}
function recarregarSite(){ const u=new URL(location.href); u.searchParams.set('r', Date.now()); location.replace(u.toString()); }
function mostrarAvisoVersao(){
  if($('#avisoVersao')) return;
  const d=document.createElement('div'); d.id='avisoVersao';
  d.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:120;background:var(--dark);color:#fff;border:2px solid var(--yellow);border-radius:14px;padding:10px 14px;display:flex;gap:12px;align-items:center;box-shadow:0 10px 30px #0006;max-width:94vw;flex-wrap:wrap;justify-content:center';
  d.innerHTML='<span>✨ <b>Nova atualização do site disponível</b></span><button class="btn y" id="bNovaVersao">Atualizar agora</button><button class="btn" id="bDepois" style="background:#26241f;color:#fff;border-color:#3a3731">Depois</button>';
  document.body.appendChild(d);
  $('#bNovaVersao').onclick=recarregarSite;
  $('#bDepois').onclick=()=>{ d.remove(); clearTimeout(S._lembrarVersao); S._lembrarVersao=setTimeout(verificarVersao, 30*60*1000); };
}
setInterval(verificarVersao, 3*60*1000);
setTimeout(verificarVersao, 8000);
document.addEventListener('visibilitychange',()=>{
  if(document.hidden) return;
  verificarVersao();
  if(S.loaded && Date.now()-(S._ultimaCarga||0)>60*1000) verificarDadosNovos(); // voltou para o site: confere se entrou lançamento novo
});
/* confere sozinho se alguém lançou vendas/perdas em outro aparelho e recarrega os números */
async function verificarDadosNovos(){
  if(!S.loaded || !S.sb || document.hidden || S._checando) return;
  if($('#modalRoot')?.innerHTML.trim()) return; // não atrapalha quem está lançando
  const ae=document.activeElement; if(ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName) && ae.id!=='selCut') return;
  S._checando=true;
  try{
    const r=await q(S.sb.from('lancamentos').select('atualizado_em,data').order('atualizado_em',{ascending:false}).limit(1));
    const t=r[0]?.atualizado_em||null;
    if(S._marcaDados===undefined){ S._marcaDados=t; return; }
    if(t && t!==S._marcaDados){ S._marcaDados=t; const dia=r[0].data; await atualizarDados(false); toast(`Números novos carregados ✔ (lançamento de ${fDate(dia)})`, 4000); }
  }catch(_){ }
  finally{ S._checando=false; }
}
setInterval(verificarDadosNovos, 60*1000);


/* ===================== análise do relatório de balanço ===================== */
function resumoAnaliseHtml(a, curto){
  const g=a.geral||{}; const pct=v=>v==null?'—':(v>=0?'':'')+String(v).replace('.',',')+'%';
  const cor=v=>v<0?'var(--bad)':v>0?'var(--good)':'inherit';
  const kp=`<div class="grid kpis" style="margin:8px 0">
    <div class="kpi"><div class="l">Resultado (perdas)</div><div class="v" style="font-size:22px;color:${cor(g.perdas)}">${brl(g.perdas)}</div><div class="d">${pct(g.pctPerdas)} sobre o custo</div></div>
    <div class="kpi"><div class="l">Custo do período</div><div class="v" style="font-size:22px">${brl0(g.custo)}</div></div>
    <div class="kpi"><div class="l">Vendas do período</div><div class="v" style="font-size:22px">${brl0(g.vendas)}</div><div class="d">Lucro ${pct(g.pctLucro)} · ${brl0(g.lucro)}</div></div>
    <div class="kpi"><div class="l">Produtos</div><div class="v" style="font-size:22px">${a.totalProdutos||0}</div><div class="d">${a.produtosComPerda||0} com perda · ${a.produtosComSobra||0} com sobra</div></div></div>`;
  const per=a.periodo?.ini?`<p class="small muted" style="margin:0">Período ${fDate(a.periodo.ini)} a ${fDate(a.periodo.fim)}${a.emitido?` · relatório emitido em ${fDate(a.emitido)}`:''}</p>`:'';
  if(curto) return `<div class="card" style="margin-top:10px;padding:12px"><b>📊 Relatório de balanço reconhecido</b>${per}${kp}<p class="small muted" style="margin:0">Setores do sistema: ${(a.setores||[]).map(x=>`${parseInt(x.codigo,10)} ${esc(nomeSetorSistema(x.codigo)||'')}`).join(' · ')} · a análise completa fica salva junto com o balanço.</p></div>`;
  const setTab=(a.setores||[]).length>1?`<div class="tw" style="margin-top:8px"><table><thead><tr><th>Setor do sistema</th><th class="n">Produtos</th><th class="n">Resultado</th><th class="n">% s/ custo</th><th class="n">Vendas</th><th class="n">% lucro</th></tr></thead><tbody>
    ${[...a.setores].sort((x,y)=>(x.perdas||0)-(y.perdas||0)).map(x=>`<tr><td><b>${esc(x.codigo)}</b> ${esc(nomeSetorSistema(x.codigo)||x.grupo||'')}</td><td class="n">${x.itens}</td><td class="n" style="color:${cor(x.perdas)}"><b>${brl(x.perdas)}</b></td><td class="n">${pct(x.pctPerdas)}</td><td class="n">${brl0(x.vendas)}</td><td class="n">${pct(x.pctLucro)}</td></tr>`).join('')}
    </tbody></table></div>`:'';
  const prodTab=(lista,titulo)=>lista&&lista.length?`<h4 style="margin:14px 0 6px">${titulo}</h4><div class="tw"><table><thead><tr><th>Produto</th><th>Setor</th><th class="n">Qtde</th><th class="n">Custo médio</th><th class="n">Valor</th><th class="n">% perda</th></tr></thead><tbody>
    ${lista.map(p=>`<tr><td><b>${esc(p.produto)}</b> <span class="muted small">${esc(p.codigo)}${p.tipo==='ASS'?' · associado':''}</span>${p.associados?.length?`<div class="small muted">principal ${String((p.qtdPerdas-p.associados.reduce((a,x)=>a+x.qtd,0)).toFixed(3)).replace('.',',')} + associados: ${p.associados.map(x=>`${esc(x.codigo)} ${esc(x.produto)} (${x.qtd>0?'+':''}${String(x.qtd.toFixed(3)).replace('.',',')})`).join(' · ')}</div>`:''}</td><td class="small" title="${esc(nomeSetorSistema(p.setor))}">${esc(p.setor)} ${esc(nomeSetorSistema(p.setor))}</td><td class="n">${String(p.qtdPerdas.toFixed(3)).replace('.',',')}</td><td class="n">${brl(p.custoMedio)}</td><td class="n" style="color:${cor(p.valor)}"><b>${brl(p.valor)}</b></td><td class="n">${p.pctPerdas?String(p.pctPerdas).replace('.',',')+'%':'—'}</td></tr>`).join('')}
    </tbody></table></div>`:'';
  return per+kp+setTab+prodTab(a.top,'🔻 Produtos com maior perda')+prodTab(a.sobras,'🔺 Produtos com sobra (estoque maior que o esperado)')+
    `<p class="small muted" style="margin-top:6px">Valor = quantidade de perda × custo médio, como no relatório do sistema. Os produtos associados (ASS) baixam do estoque do principal (PRI), por isso entram somados no principal: a perda mostrada já é a do conjunto.</p>`;
}


/* ===================== setores do sistema da loja (relatório de balanço) ===================== */
const SETORES_SISTEMA={1:'Açougue Boi/Porco',2:'Feirinha',3:'Frios',4:'Panificadora',5:'Frente Caixa',6:'Loja',7:'Almoxarifado',8:'Cozinha',9:'Bovino Miúdos',10:'Suíno Resfriado',
 11:'Aves',12:'Feirinha - Verduras',13:'Feirinha - Legumes',14:'Feirinha - Frutas',15:'Mortadela/Salame',16:'Feirinha - Ovos',17:'Feirinha - Alho',18:'Linguiça/Salsicha',19:'Frios',20:'Suíno Congelado',
 21:'Defumados',22:'Queijos',23:'Bovino Dianteiro',24:'Bovino Traseiro',25:'Pães Terceiros',26:'Peixes',27:'Iogurtes',28:'Diversos',29:'Costela Bovina',30:'Panificadora Transf',
 31:'Claudemir/Eliane',32:'Aluizio/Joana',33:'Norma',34:'Olinda/Carlos',35:'Perdas Osso',36:'Cajus',37:'São Luiz Utilidades',38:'Bom Dia Terra Boa'};
// setor do site sugerido para cada setor do sistema
const SISTEMA_PARA_SITE={1:'acougue',9:'acougue',10:'acougue',11:'acougue',20:'acougue',23:'acougue',24:'acougue',29:'acougue',35:'acougue',
 2:'hortifruti',12:'hortifruti',13:'hortifruti',14:'hortifruti',16:'hortifruti',17:'hortifruti',
 3:'pereciveis',15:'pereciveis',18:'pereciveis',19:'pereciveis',21:'pereciveis',22:'pereciveis',27:'pereciveis',
 4:'padaria',30:'padaria',25:'panif_terc'};
function nomeSetorSistema(cod){ const n=parseInt(cod,10); return SETORES_SISTEMA[n] || ''; }
function setorSiteSugerido(an){ const c={}; for(const x of (an.setores||[])){ const id=SISTEMA_PARA_SITE[parseInt(x.codigo,10)]; if(id) c[id]=(c[id]||0)+(x.itens||1); } const top=Object.entries(c).sort((a,b)=>b[1]-a[1])[0]; return top?top[0]:null; }
