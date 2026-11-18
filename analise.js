/* ===================== ANÁLISE DE VENDAS POR PRODUTO (aba Análise do setor) =====================
   Relatório do sistema "RELACAO DE VENDAS COM RENTABILIDADE" → departamentos → produtos.
   Compara com o mesmo período do ano passado / mês passado (outro relatório importado). */
const fD = iso => iso ? `${iso.slice(8)}/${iso.slice(5,7)}/${iso.slice(2,4)}` : '—';
function addAnos(iso,n){ const [y,m,d]=iso.split('-'); return `${+y+n}-${m}-${m==='02'&&d==='29'?'28':d}`; }
function addMeses(iso,n,fimDeMes){ const [y,m,d]=iso.split('-').map(Number); const dt=new Date(y,m-1+n,1); const mm=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; return fimDeMes? fimDoMes(mm) : mesmoDiaEm(mm,d); }
function periodoComparado(ini,fim,tipo){
  if(tipo==='ano') return [addAnos(ini,-1), addAnos(fim,-1)];
  const ehFim = fim===fimDoMes(fim.slice(0,7));
  return [addMeses(ini,-1,false), addMeses(fim,-1,ehFim)];
}
const qtdTxt = v => v==null ? '—' : (Math.abs(v-Math.round(v))<0.005 ? Math.round(v).toLocaleString('pt-BR') : v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}));
const varPct = (a,b) => (b>0) ? a/b-1 : null;
function varHtml(a,b){ if(b==null) return '<span class="muted">—</span>'; if(!b) return a>0?'<span class="an-novo">novo</span>':'<span class="muted">—</span>';
  const v=a/b-1; const c=Math.abs(v)<0.0005?'inherit':v>0?'var(--good)':'var(--bad)'; return `<span style="color:${c};font-weight:700">${v>0?'▲ +':v<0?'▼ ':''}${pct(v)}</span>`; }

async function carregarAnalise(sid, ini, fim){
  const r=await q(S.sb.from('analise_vendas').select('id,periodo_inicio,periodo_fim,venda,dados').eq('setor_id',sid).eq('periodo_inicio',ini).eq('periodo_fim',fim).limit(1));
  return r[0]||null;
}

/* monta a árvore departamento → produto com a base de comparação */
function montarAnalise(cur, base){
  const mapB=new Map(); if(base) for(const d of base.dados.departamentos) for(const p of d.produtos) mapB.set(p.c,{...p,dep:d.codigo,depNome:d.nome});
  const vistos=new Set(), deps=[];
  for(const d of cur.dados.departamentos){
    deps.push({ codigo:d.codigo, nome:d.nome, produtos:d.produtos.map(p=>{ vistos.add(p.c); const o=mapB.get(p.c); return {...p, qb:o?o.q:null, vb:o?o.v:(base?0:null)}; }) });
  }
  if(base) for(const [c,o] of mapB){ if(vistos.has(c)) continue; let dd=deps.find(x=>x.codigo===o.dep); if(!dd){ dd={codigo:o.dep,nome:o.depNome,produtos:[]}; deps.push(dd); } dd.produtos.push({c, d:o.d, q:0, v:0, m:null, qb:o.q, vb:o.v}); }
  const tot=deps.reduce((a,d)=>a+d.produtos.reduce((b,p)=>b+p.v,0),0);
  // curva ABC pela venda atual do setor
  const ord=deps.flatMap(d=>d.produtos).filter(p=>p.v>0).sort((a,b)=>b.v-a.v); let ac=0;
  for(const p of ord){ ac+=p.v; p.abc = ac<=tot*0.8+0.001 ? 'A' : ac<=tot*0.95+0.001 ? 'B' : 'C'; }
  if(ord.length && !ord.some(p=>p.abc==='A')) ord[0].abc='A';
  for(const d of deps){
    for(const p of d.produtos){
      const f=[]; const v=varPct(p.v,p.vb);
      if(base && p.vb>0 && p.v===0) f.push('parado');
      else if(base && !p.vb && p.v>0) f.push('novo');
      else if(v!=null && v<=-0.2 && p.vb-p.v>=100) f.push('queda');
      else if(v!=null && v>=0.2 && p.v-p.vb>=100) f.push('alta');
      if(p.z) f.push('custo'); else if(p.mt>0 && p.m!=null && p.m<p.mt-5) f.push('margem');
      p.flags=f; p.part= tot? p.v/tot : 0;
    }
    d.v=d.produtos.reduce((a,p)=>a+p.v,0); d.vb= base? d.produtos.reduce((a,p)=>a+(p.vb||0),0) : null;
    const comM=d.produtos.filter(p=>p.m!=null && p.v>0); const sv=comM.reduce((a,p)=>a+p.v,0); d.m= sv? comM.reduce((a,p)=>a+p.v*p.m,0)/sv : null;
    d.part= tot? d.v/tot : 0; d.alertas=d.produtos.filter(p=>p.flags.some(x=>x!=='alta')).length;
  }
  deps.sort((a,b)=>b.v-a.v||(b.vb||0)-(a.vb||0));
  return { deps, tot, totBase: base? deps.reduce((a,d)=>a+(d.vb||0),0) : null, itens:ord.length };
}

/* perdas de balanço por código de produto, dos balanços do setor que cruzam o período */
function perdasBalanco(bals){
  const m=new Map();
  for(const b of bals){ const an=b.analise||{};
    const lista = an.perdasProdutos || (an.top||[]).map(p=>[p.codigo, -p.valor]);
    for(const [c,v] of lista){ if(v>0) m.set(String(c),(m.get(String(c))||0)+v); } }
  return m;
}
async function completarBalancosAntigos(bals){ // balanços salvos antes de guardar a perda de todos os produtos
  if(!S.gerente) return false; S._bfFeito=S._bfFeito||new Set(); let mudou=false;
  for(const b of bals){
    if(!b.arquivo_path || !/\.pdf$/i.test(b.arquivo_path) || b.analise?.perdasProdutos || S._bfFeito.has(b.id)) continue;
    S._bfFeito.add(b.id);
    try{ const { data:blob, error } = await S.sb.storage.from('balancos').download(b.arquivo_path); if(error) throw error;
      const an=Parser.analisarBalancoSistema(await linhasDoArquivo(new File([blob], b.arquivo_nome||'balanco.pdf', {type:'application/pdf'})));
      if(an?.perdasProdutos){ const nova={...(b.analise||{}), perdasProdutos:an.perdasProdutos}; await q(S.sb.from('balancos').update({analise:nova}).eq('id',b.id)); b.analise=nova; mudou=true; } }
    catch(e){ console.warn('balanço',b.id,e); }
  }
  return mudou;
}

async function renderAnaliseSetor(box, s){
  const sid=s.id; const vivo=()=>S.view==='setor' && S.setorAba==='ana' && S.setorSel===sid && box.isConnected;
  const btnImp = S.gerente? `<button class="btn p" id="anImp">＋ Importar relatório de vendas</button><input type="file" id="anArq" accept=".pdf,.txt" class="hide">`:'';
  let lista=[];
  try{ lista=await q(S.sb.from('analise_vendas').select('id,periodo_inicio,periodo_fim,venda').eq('setor_id',sid).order('periodo_fim',{ascending:false}).order('periodo_inicio',{ascending:true}).limit(200)); }
  catch(e){ box.innerHTML=`<div class="note err">Erro ao carregar: ${esc(e.message)}</div>`; return; }
  if(!vivo()) return;
  lista.sort((a,b)=>b.periodo_fim.localeCompare(a.periodo_fim)||a.periodo_inicio.localeCompare(b.periodo_inicio));
  const ligarImp=()=>{ const b=$('#anImp'); if(b){ b.onclick=()=>$('#anArq').click(); $('#anArq').onchange=e=>{ const f=e.target.files[0]; e.target.value=''; if(f) importarRelatorioVendas(f, sid); }; } };
  if(!lista.length){
    box.innerHTML=`<div class="card empty"><h2>Nenhum relatório de vendas do ${esc(s.nome)} ainda</h2><p>${S.gerente?'Importe a “Relação de vendas com rentabilidade” do sistema (PDF). O site separa por departamento e por produto, e compara com o mesmo período do ano passado quando esse relatório também for importado.':'Assim que o gerente importar o relatório de vendas do sistema, a análise por departamento e produto aparece aqui.'}</p><div style="margin-top:12px">${btnImp}</div></div>`;
    ligarImp(); return;
  }
  S.anaSel=S.anaSel||{}; const sel=lista.find(x=>x.id===S.anaSel[sid])||lista[0]; S.anaSel[sid]=sel.id;
  const ini=sel.periodo_inicio, fim=sel.periodo_fim;
  const [pa0,pa1]=periodoComparado(ini,fim,'ano'), [pm0,pm1]=periodoComparado(ini,fim,'mes');
  const mes=fim.slice(0,7), mesInteiro = ini===`${mes}-01` && ini.slice(0,7)===mes && fim<fimDoMes(mes);
  const lyMes = mesInteiro ? [addAnos(`${mes}-01`,-1), fimDoMes(addAnos(`${mes}-01`,-1).slice(0,7))] : null;
  box.innerHTML='<div class="empty"><span class="spin"></span> Montando a análise…</div>';
  let cur, ly, lm, lyM, bals=[];
  try{
    [cur, ly, lm, lyM] = await Promise.all([ carregarAnalise(sid,ini,fim), carregarAnalise(sid,pa0,pa1), carregarAnalise(sid,pm0,pm1), lyMes?carregarAnalise(sid,lyMes[0],lyMes[1]):null ]);
    try{ S._metasDep=await q(S.sb.from('metas_departamento').select('dep_codigo,meta').eq('mes',fim.slice(0,7)).eq('setor_id',sid)); }catch(_){ S._metasDep=[]; }
    bals=(await q(S.sb.from('balancos').select('id,data,periodo_inicio,valor_perda,analise,arquivo_path,arquivo_nome').eq('setor_id',sid).gte('data',ini).order('data'))).filter(b=>(b.periodo_inicio||b.data)<=fim);
  }catch(e){ box.innerHTML=`<div class="note err">Erro ao carregar: ${esc(e.message)}</div>`; return; }
  if(!vivo() || !cur) return;
  if(!S.anaBase || (S.anaBase==='ano'&&!ly&&lm) ) S.anaBase = ly ? 'ano' : (lm ? 'mes' : 'ano');
  const base = S.anaBase==='ano' ? ly : lm;
  const A=montarAnalise(cur, base); const perdas=perdasBalanco(bals);
  const totLy = ly? ly.dados.departamentos.reduce((a,d)=>a+d.produtos.reduce((b,p)=>b+p.v,0),0) : null;
  const totLm = lm? lm.dados.departamentos.reduce((a,d)=>a+d.produtos.reduce((b,p)=>b+p.v,0),0) : null;
  const todos=A.deps.flatMap(d=>d.produtos.map(p=>({...p, dep:d.nome, depC:d.codigo})));
  const nNovos=todos.filter(p=>p.flags.includes('novo')).length, nParados=todos.filter(p=>p.flags.includes('parado')).length;
  const dias=+fim.slice(8), diasMes=diasDoMes(mes).length;
  const proj = mesInteiro ? A.tot/dias*diasMes : null;
  const totLyM = lyM? lyM.dados.departamentos.reduce((a,d)=>a+d.produtos.reduce((b,p)=>b+p.v,0),0) : null;
  const perdaTot=[...perdas.values()].reduce((a,b)=>a+b,0);
  const nomeBase = S.anaBase==='ano' ? 'ano passado' : 'mês passado';
  // meta do departamento até o fim do relatório (mesma curva de metas diárias do setor)
  const docMes=S.months[mes]; let fatorMeta = dias/diasMes;
  if(docMes){ const cs=calc(docMes, fim).setores.find(x=>x.id===sid); if(cs && cs.meta) fatorMeta=cs.metaAte/cs.meta; }
  const metaDep=c=>{ const x=(S._metasDep||[]).find(m=>m.dep_codigo===c); return x&&+x.meta? +x.meta : null; };
  const faltaRel = (p0,p1)=> S.gerente ? `importe o relatório de ${fD(p0)} a ${fD(p1)}` : `sem o relatório de ${fD(p0)} a ${fD(p1)}`;
  const cartao=(rot, tot, p0, p1)=> `<div class="kpi"><div class="l">${rot}</div>${tot!=null?`<div class="v">${brl0(tot)}</div><div class="d">${fD(p0)} até ${fD(p1)} · ${varHtml(A.tot,tot)} (${A.tot-tot>=0?'+':''}${brl0(A.tot-tot)})</div>`:`<div class="v muted" style="font-size:20px">—</div><div class="d">${faltaRel(p0,p1)}</div>`}</div>`;
  const lst=(tit, ico, itens, fn)=> `<div class="an-ol"><div class="an-olt">${ico} ${tit}</div>${itens.length?itens.slice(0,5).map(p=>`<button class="an-oli" data-go="${esc(p.c)}" data-dep="${p.depC}"><span>${esc(p.d)}</span><b>${fn(p)}</b></button>`).join(''):'<div class="small muted" style="padding:4px 0">nada por aqui</div>'}</div>`;
  const quedas=todos.filter(p=>p.vb>0&&p.v>0&&p.v<p.vb).sort((a,b)=>(a.v-a.vb)-(b.v-b.vb));
  const altas=todos.filter(p=>p.vb>0&&p.v>p.vb).sort((a,b)=>(b.v-b.vb)-(a.v-a.vb));
  const aQueda=quedas.filter(p=>p.abc==='A');
  const parados=todos.filter(p=>p.flags.includes('parado')).sort((a,b)=>b.vb-a.vb);
  const novos=todos.filter(p=>p.flags.includes('novo')).sort((a,b)=>b.v-a.v);
  const dif=p=>`${p.v-p.vb>=0?'+':''}${brl0(p.v-p.vb)}`;
  box.innerHTML=`
  <div class="row" style="margin-bottom:10px;flex-wrap:wrap;gap:8px;align-items:flex-end">
    <label class="f" style="min-width:230px">Período do relatório<select id="anPer">${lista.map(x=>`<option value="${x.id}" ${x.id===sel.id?'selected':''}>${fD(x.periodo_inicio)} até ${fD(x.periodo_fim)} · ${brl0(+x.venda)}</option>`).join('')}</select></label>
    <div class="f"><span>Comparar com</span><div class="tabs2" id="anBase" style="margin:0"><button data-b="ano" class="${S.anaBase==='ano'?'on':''}">Ano passado</button><button data-b="mes" class="${S.anaBase==='mes'?'on':''}">Mês passado</button></div></div>
    <div class="sp"></div>${S.gerente?`<button class="btn" id="anDel" style="color:var(--bad)" title="Apagar este relatório deste setor">Excluir</button>`:''}${btnImp}
  </div>
  <div class="grid kpis">
    <div class="kpi hero"><div class="l">Venda de ${fD(ini)} até ${fD(fim)}</div><div class="v">${brl0(A.tot)}</div><div class="d">${A.itens} produtos vendidos · ${A.deps.filter(d=>d.v>0).length} departamentos</div></div>
    ${cartao('Ano passado, mesmo período', totLy, pa0, pa1)}
    ${cartao('Mês passado, mesmo período', totLm, pm0, pm1)}
    ${proj!=null?`<div class="kpi"><div class="l">Projeção do mês</div><div class="v">${brl0(proj)}</div><div class="d">no ritmo até o dia ${dias}${totLyM!=null?` · ${mesLabel(lyMes[0].slice(0,7))} fechou ${brl0(totLyM)} ${varHtml(proj,totLyM)}`:''}</div></div>`:''}
    <div class="kpi"><div class="l">Mix de produtos</div><div class="v">${A.itens}</div><div class="d">${base?`${nNovos} novo(s) · ${nParados} parou(ram) de vender vs. ${nomeBase}`:'com venda no período'}</div></div>
    ${bals.length?`<div class="kpi"><div class="l">Perdas dos produtos no balanço</div><div class="v">${brl0(perdaTot)}</div><div class="d">soma das perdas, sem descontar as sobras · resultado do balanço ${brl0(bals.reduce((x,b)=>x+(+b.valor_perda||0),0))} · ${bals.map(b=>`${b.periodo_inicio?fDate(b.periodo_inicio)+' a ':''}${fDate(b.data)}`).join(', ')}</div></div>`:''}
  </div>
  ${notaDatas(ini, fim, [{rot:'ano passado', ini:ly?pa0:null, fim:pa1},{rot:'mês passado', ini:lm?pm0:null, fim:pm1}])}
  ${base?`<div class="card" style="margin-top:12px"><div class="row" style="margin-bottom:6px"><h2 style="margin:0">🎯 Onde olhar primeiro</h2><div class="sp"></div><span class="small muted">comparado com o ${nomeBase} · toque no produto para ver</span></div>
    <div class="an-olg">
      ${lst('Maiores quedas','📉',quedas,dif)}
      ${lst('Maiores altas','📈',altas,dif)}
      ${lst('Curva A em queda','⭐',aQueda,p=>pct(varPct(p.v,p.vb)))}
      ${lst('Pararam de vender','⛔',parados,p=>brl0(p.vb)+' antes')}
      ${lst('Novos','🆕',novos,p=>brl0(p.v))}
    </div></div>`:`<div class="note small" style="margin-top:12px">Para ver quedas, altas e produtos que pararam de vender, ${S.gerente?'importe':'falta'} o relatório do mesmo período do ano passado (${fD(pa0)} a ${fD(pa1)}) ou do mês passado (${fD(pm0)} a ${fD(pm1)}).</div>`}
  <div class="card" style="margin-top:12px">
    <div class="row" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <h2 style="margin:0">Departamentos e produtos</h2><div class="sp"></div>
      <input id="anBusca" class="an-busca" placeholder="Buscar produto…" value="${esc(S.anaBusca||'')}" style="border:1px solid var(--line);border-radius:9px;padding:7px 10px;min-width:200px">
      <select id="anOrd" style="border:1px solid var(--line);border-radius:9px;padding:7px 10px"><option value="v">Ordenar: maior venda</option><option value="var">Ordenar: maior queda</option><option value="alta">Ordenar: maior alta</option><option value="m">Ordenar: menor margem</option></select>
    </div>
    <div class="tabs2" id="anFil">${[['todos','Todos'],['alertas','⚠ Alertas'],['queda','📉 Quedas'],['alta','📈 Altas'],['A','⭐ Curva A'],['parado','⛔ Pararam'],['novo','🆕 Novos']].map(([k,t])=>`<button data-f="${k}" class="${(S.anaFil||'todos')===k?'on':''}">${t}</button>`).join('')}
      <span class="sp"></span><button data-x="abrir">Abrir todos</button><button data-x="fechar">Fechar todos</button></div>
    <div id="anCasc"></div>
    <div class="small muted" style="margin-top:10px">Var. = venda contra o ${nomeBase} no mesmo período${base?` (${fD(S.anaBase==='ano'?pa0:pm0)} a ${fD(S.anaBase==='ano'?pa1:pm1)})`:''}. Part. = participação na venda do setor. Curva A = produtos que somam 80% da venda. ${bals.length?'Perda bal. = perda do produto no balanço que cruza o período (sem descontar sobras).':''}</div>
  </div>`;
  if(S.anaOrd) $('#anOrd').value=S.anaOrd;
  S.anaAbertos=S.anaAbertos||new Set();
  const casa=(p)=>{ const f=S.anaFil||'todos', t=(S.anaBusca||'').trim().toLowerCase();
    if(t && !p.d.toLowerCase().includes(t) && !String(p.c).startsWith(t)) return false;
    if(f==='todos') return true; if(f==='alertas') return p.flags.some(x=>x!=='alta'&&x!=='novo'); if(f==='A') return p.abc==='A'; return p.flags.includes(f); };
  const ordenar=ps=>{ const o=S.anaOrd||'v'; const r=[...ps];
    if(o==='var') r.sort((a,b)=>((a.v-(a.vb||0))-(b.v-(b.vb||0)))); else if(o==='alta') r.sort((a,b)=>((b.v-(b.vb||0))-(a.v-(a.vb||0)))); else if(o==='m') r.sort((a,b)=>(a.m??999)-(b.m??999)); else r.sort((a,b)=>b.v-a.v||(b.vb||0)-(a.vb||0)); return r; };
  const TAG={queda:['b-bad','caiu'],alta:['b-good','subiu'],parado:['b-bad','parou de vender'],novo:['b-good','novo'],margem:['b-warn','margem abaixo do alvo'],custo:['b-warn','custo zerado no cadastro']};
  const tags=p=>`${p.abc?`<span class="an-abc an-${p.abc}">${p.abc}</span>`:''}${p.flags.map(f=>{ const [c,t]=TAG[f]; const x=(f==='queda'||f==='alta')?` ${pct(Math.abs(varPct(p.v,p.vb)),0)}`:''; return ` <span class="badge ${c}">${t}${x}</span>`; }).join('')}`;
  const desenhar=()=>{
    const filtrando = (S.anaFil&&S.anaFil!=='todos') || (S.anaBusca||'').trim();
    const html=A.deps.map(d=>{ const ps=ordenar(d.produtos.filter(casa)); if(filtrando && !ps.length) return '';
      const aberto = S.anaAbertos.has(d.codigo) || (filtrando && ps.length);
      return `<div class="an-dep ${aberto?'open':''}">
        <button class="an-dh" data-d="${d.codigo}"><span class="an-chev">${aberto?'▾':'▸'}</span>
          <span class="an-dn">${(()=>{ const mt=metaDep(d.codigo); if(!mt) return ''; const ma=mt*fatorMeta, p=ma?d.v/ma:null; return `<span class="an-meta" style="color:${p>=1?'var(--good)':p>=0.9?'var(--warn)':'var(--bad)'}">🎯 ${pct(p)} da meta até ${fDate(fim)} (${brl0(ma)} de ${brl0(mt)} no mês)</span>`; })()}<b>${esc(cap1(d.nome))}</b> <span class="small muted">${d.produtos.filter(p=>p.v>0).length} produto(s)${filtrando?` · ${ps.length} no filtro`:''}</span>${d.alertas?` <span class="badge b-warn">${d.alertas} alerta(s)</span>`:''}<span class="an-bar"><i style="width:${A.deps[0].v?Math.max(1,d.v/A.deps[0].v*100):0}%"></i></span></span>
          <span class="an-dc"><span class="l">Venda</span><b>${brl0(d.v)}</b></span>
          <span class="an-dc"><span class="l">${base?nomeBase:'—'}</span>${base?brl0(d.vb):'—'}</span>
          <span class="an-dc"><span class="l">Var.</span>${base?varHtml(d.v,d.vb):'—'}</span>
          <span class="an-dc hm"><span class="l">Part.</span>${pct(d.part)}</span>
          <span class="an-dc hm"><span class="l">Margem</span>${d.m!=null?pct(d.m/100):'—'}</span>
        </button>
        ${aberto?`<div class="m-only an-ml">${ps.map(p=>{ const pb=perdas.get(String(p.c)); return `<details class="dl an-mp ${S.anaFoco===p.c?'an-foco':''}" id="anpm-${esc(p.c)}"><summary><span class="dl-d"><span class="an-mn">${esc(p.d)}</span><span class="an-mt">${tags(p)}</span></span><b class="dl-v">${p.v?brl0(p.v):'—'}</b><span class="dl-p">${base?varHtml(p.v,p.vb):''}</span></summary>
            <div class="dl-c"><div><span>Código</span><b>${esc(p.c)}</b></div><div><span>Quantidade</span><b>${qtdTxt(p.q)}${base&&p.qb!=null?` <small class="muted">(antes ${qtdTxt(p.qb)})</small>`:''}</b></div>
            ${base?`<div><span>Venda ${nomeBase}</span><b>${p.vb?brl(p.vb):'—'}</b></div><div><span>Diferença</span><b>${p.vb!=null?`${p.v-p.vb>=0?'+':''}${brl0(p.v-p.vb)}`:'—'}</b></div>`:''}
            <div><span>Participação</span><b>${p.v?pct(p.part):'—'}</b></div><div><span>Margem</span><b>${p.m!=null?pct(p.m/100):'—'}</b></div>
            ${perdas.size?`<div><span>Perda no balanço</span><b>${pb?brl(pb):'—'}</b></div>`:''}</div></details>`; }).join('')}${!ps.length?'<div class="muted small" style="padding:10px">Nenhum produto</div>':''}</div>
        <div class="tw an-pt d-only"><table><thead><tr><th>Produto</th><th class="n">Qtd</th><th class="n">Venda</th>${base?`<th class="n">${nomeBase}</th><th class="n">Var.</th>`:''}<th class="n">Part.</th><th class="n">Margem</th>${perdas.size?'<th class="n">Perda bal.</th>':''}</tr></thead><tbody>
          ${ps.map(p=>{ const pb=perdas.get(String(p.c)); return `<tr id="anp-${esc(p.c)}" class="${S.anaFoco===p.c?'an-foco':''}"><td><span class="small muted">${esc(p.c)}</span> ${esc(p.d)} ${tags(p)}</td>
            <td class="n">${qtdTxt(p.q)}${base&&p.qb!=null?`<div class="small muted">antes ${qtdTxt(p.qb)}</div>`:''}</td>
            <td class="n"><b>${p.v?brl(p.v):'—'}</b></td>${base?`<td class="n">${p.vb?brl(p.vb):'—'}</td><td class="n">${varHtml(p.v,p.vb)}</td>`:''}
            <td class="n">${p.v?pct(p.part):'—'}</td><td class="n">${p.m!=null?pct(p.m/100):'—'}</td>${perdas.size?`<td class="n">${pb?`${brl(pb)}${p.v?`<div class="small muted">${pct(pb/p.v,1)} da venda</div>`:''}`:'—'}</td>`:''}</tr>`; }).join('')}
          ${!ps.length?'<tr><td colspan="9" class="muted">Nenhum produto</td></tr>':''}
        </tbody></table></div>`:''}
      </div>`; }).join('');
    $('#anCasc').innerHTML = html || '<div class="empty">Nenhum produto com esse filtro.</div>';
    $('#anCasc').querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{ const c=+b.dataset.d; if(S.anaAbertos.has(c)) S.anaAbertos.delete(c); else S.anaAbertos.add(c); desenhar(); });
    if(S.anaFoco){ const el=document.getElementById((ehCelular()?'anpm-':'anp-')+S.anaFoco); if(el && el.tagName==='DETAILS') el.open=true; if(el) el.scrollIntoView({block:'center',behavior:'smooth'}); setTimeout(()=>{ S.anaFoco=null; el?.classList.remove('an-foco'); }, 2500); }
  };
  desenhar();
  $('#anPer').onchange=e=>{ S.anaSel[sid]=+e.target.value; renderAnaliseSetor(box,s); };
  $('#anBase').querySelectorAll('button').forEach(b=>b.onclick=()=>{ S.anaBase=b.dataset.b; renderAnaliseSetor(box,s); });
  $('#anFil').querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{ S.anaFil=b.dataset.f; $('#anFil').querySelectorAll('[data-f]').forEach(x=>x.classList.toggle('on',x===b)); desenhar(); });
  $('#anFil').querySelector('[data-x="abrir"]').onclick=()=>{ A.deps.forEach(d=>S.anaAbertos.add(d.codigo)); desenhar(); };
  $('#anFil').querySelector('[data-x="fechar"]').onclick=()=>{ S.anaAbertos.clear(); desenhar(); };
  let tm; $('#anBusca').oninput=e=>{ clearTimeout(tm); tm=setTimeout(()=>{ S.anaBusca=e.target.value; desenhar(); },200); };
  $('#anOrd').onchange=e=>{ S.anaOrd=e.target.value; desenhar(); };
  box.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{ S.anaFil='todos'; S.anaBusca=''; $('#anBusca').value=''; $('#anFil').querySelectorAll('[data-f]').forEach(x=>x.classList.toggle('on',x.dataset.f==='todos')); S.anaAbertos.add(+b.dataset.dep); S.anaFoco=b.dataset.go; desenhar(); });
  const del=$('#anDel'); if(del) del.onclick=()=>confirmBox(`Apagar o relatório de vendas de ${fD(ini)} a ${fD(fim)} do ${s.nome}?`, async()=>{ try{ await q(S.sb.from('analise_vendas').delete().eq('id',sel.id)); delete S.anaSel[sid]; toast('Relatório apagado'); renderAnaliseSetor(box,s); }catch(e){ toast(e.message,5000); } });
  ligarImp();
  if(bals.length && await completarBalancosAntigos(bals) && vivo()) renderAnaliseSetor(box,s);
}
const cap1 = t => String(t||'').toLowerCase().replace(/(^|\s)\S/g, x=>x.toUpperCase());

/* ---------- importação do relatório (gerente) ---------- */
async function importarRelatorioVendas(f, setorAtual, opts={}){
  busy('Lendo o relatório de vendas…');
  let r=opts.pre||null, mapa=[];
  try{ if(!r) r=Parser.analisarRelatorioVendas(await linhasDoArquivo(f)); mapa=await q(S.sb.from('departamentos').select('codigo,nome,setor_id')); }
  catch(e){ closeModal(); toast('Não consegui ler o arquivo: '+e.message, 6000); return null; }
  closeModal();
  if(!r){ toast('Esse arquivo não parece a “Relação de vendas com rentabilidade” do sistema.', 6000); return null; }
  return await new Promise(async resolver=>{
  const conf = r.totalGeral?.venda!=null ? Math.abs(r.totalGeral.venda-r.venda)<1 && (!r.totalGeral.itens || r.totalGeral.itens===r.itens) : null;
  const sug=d=>{ const m=mapa.find(x=>x.codigo===d.codigo); if(m) return m.setor_id||''; const g=Parser.matchSector(d.nome); return (g && S.setoresAll.some(x=>x.id===g))? g : (mapa.length? '' : setorAtual); };
  let existentes=[]; try{ existentes=await q(S.sb.from('analise_vendas').select('setor_id').eq('periodo_inicio',r.periodo.ini).eq('periodo_fim',r.periodo.fim)); }catch(_){}
  const opcoesSetor=sel=>`<option value="">— não importar —</option>${S.setoresAll.map(x=>`<option value="${x.id}" ${x.id===sel?'selected':''}>${esc(x.nome)}</option>`).join('')}`;
  // relatório tirado no mesmo dia vem "até hoje", mas a venda de hoje ainda não fechou: considera até ontem
  const ontem = isoOf(new Date(Date.now()-864e5));
  const fimSugerido = (r.periodo.fim>=todayIso() && r.periodo.ini<=ontem) ? ontem : r.periodo.fim;
  const umDia = r.periodo.ini===fimSugerido;
  const m=modal(`<h2>📊 Relatório de vendas por produto${opts.lancar?' — lançar venda do dia':''}</h2>
    <div class="grid kpis" style="margin:8px 0">
      <div class="kpi"><div class="l">Período</div><div class="v" style="font-size:20px">${fD(r.periodo.ini)} a ${fD(r.periodo.fim)}</div><div class="d">${r.filial?'filial '+esc(r.filial):''}${r.emitido?' · emitido '+fD(r.emitido):''}</div>
        <label class="f" style="margin-top:6px">Considerar a venda até<input type="date" id="rvFim" value="${fimSugerido}" min="${r.periodo.ini}" max="${r.periodo.fim}"></label>
        ${fimSugerido!==r.periodo.fim?`<div class="d" style="color:var(--warn)">O relatório vai até ${fD(r.periodo.fim)}, mas a venda desse dia ainda não fechou — por isso vai como até ${fD(fimSugerido)}.</div>`:''}</div>
      <div class="kpi"><div class="l">Venda total</div><div class="v" style="font-size:20px">${brl(r.venda)}</div><div class="d">${r.itens} produtos · ${r.departamentos.length} departamentos${r.cupons?` · ${r.cupons} cupons`:''}</div></div>
    </div>
    ${conf===true?'<div class="note small" style="background:var(--good-bg);border-color:#a9d8b8">✔ Conferido: a soma dos produtos bate com o TOTAL GERAL do relatório.</div>':conf===false?`<div class="note err small">A soma dos produtos (${brl(r.venda)}) não bate com o TOTAL GERAL (${brl(r.totalGeral.venda)}). Confira o arquivo.</div>`:''}
    <p class="small muted" style="margin:10px 0 6px">Escolha para qual setor do site vai cada departamento do sistema. O site lembra a escolha para os próximos relatórios.</p>
    <div class="tw" style="max-height:340px;overflow:auto"><table><thead><tr><th>Departamento</th><th class="n">Produtos</th><th class="n">Venda</th><th>Setor do site</th></tr></thead><tbody>
      ${r.departamentos.map((d,i)=>`<tr><td><b>${d.codigo}</b> ${esc(cap1(d.nome))}</td><td class="n">${d.produtos.length}</td><td class="n">${brl0(d.produtos.reduce((a,p)=>a+p.v,0))}</td><td><select data-i="${i}" style="border:1px solid var(--line);border-radius:8px;padding:4px 6px">${opcoesSetor(sug(d))}</select></td></tr>`).join('')}
    </tbody></table></div>
    <div id="rvResumo" class="small" style="margin-top:10px"></div>
    ${opts.lancar?`<label class="small" style="display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" id="rvAna" ${umDia?'':'checked'}> guardar também na Análise de vendas (${umDia?'relatório de um dia só':'acumulado do período'})</label>`:''}
    <div id="rvErr" class="note err small hide" style="margin-top:8px"></div>
    <div class="row" style="margin-top:12px"><div class="sp"></div><button class="btn" id="mN">Cancelar</button><button class="btn p" id="mY">${opts.lancar?'Continuar':'Salvar análise'}</button></div>`);
  const resumo=()=>{ const por={}; m.querySelectorAll('select[data-i]').forEach(s=>{ if(!s.value) return; const d=r.departamentos[+s.dataset.i]; por[s.value]=(por[s.value]||0)+d.produtos.reduce((a,p)=>a+p.v,0); });
    const subst=Object.keys(por).filter(id=>existentes.some(e=>e.setor_id===id));
    $('#rvResumo',m).innerHTML = Object.keys(por).length ? `Vai salvar: ${Object.entries(por).map(([id,v])=>`<b>${esc(nomeSetor(id))}</b> ${brl0(v)}`).join(' · ')}${subst.length?`<br><span style="color:var(--warn)">Já existe relatório desse período para ${subst.map(nomeSetor).join(', ')} — será substituído.</span>`:''}` : '<span style="color:var(--bad)">Nenhum departamento escolhido.</span>'; };
  m.querySelectorAll('select[data-i]').forEach(s=>s.onchange=resumo); resumo();
  $('#mN',m).onclick=()=>{ closeModal(); resolver(null); };
  $('#mY',m).onclick=async()=>{
    const err=t=>{ const e=$('#rvErr',m); e.textContent=t; e.classList.remove('hide'); };
    const guardar = !opts.lancar || $('#rvAna',m).checked;
    const fimEsc=$('#rvFim',m).value; if(!fimEsc || fimEsc<r.periodo.ini) return err('Escolha até que dia vai a venda do relatório.'); r.periodo.fim=fimEsc;
    const escolhas=[...m.querySelectorAll('select[data-i]')].map(s=>({d:r.departamentos[+s.dataset.i], setor:s.value}));
    if(!escolhas.some(x=>x.setor)) return err('Escolha o setor de pelo menos um departamento.');
    $('#mY',m).disabled=true; $('#mY',m).textContent='Salvando…';
    try{
      let rel=null;
      if(guardar){ const path=`${r.periodo.ini}_${r.periodo.fim}/${Date.now()}-${nomeArquivoSeguro(f.name)}`;
        const up=await S.sb.storage.from('relatorios').upload(path, f, {upsert:false, contentType:f.type||undefined});
        rel=((await q(S.sb.from('relatorios_venda').insert({ periodo_inicio:r.periodo.ini, periodo_fim:r.periodo.fim, arquivo_nome:f.name, arquivo_path:up.error?null:path, cupons:r.cupons, total_venda:r.venda }).select('id')))||[])[0]||null; }
      await q(S.sb.from('departamentos').upsert(escolhas.map(x=>({codigo:x.d.codigo, nome:x.d.nome, setor_id:x.setor||null, atualizado_em:new Date().toISOString()})), {onConflict:'codigo'}));
      const por={}; for(const x of escolhas){ if(!x.setor) continue; (por[x.setor]=por[x.setor]||[]).push(x.d); }
      const rows=Object.entries(por).map(([setor,deps])=>({ relatorio_id:rel?.id||null, setor_id:setor, periodo_inicio:r.periodo.ini, periodo_fim:r.periodo.fim,
        venda:round2(deps.reduce((a,d)=>a+d.produtos.reduce((b,p)=>b+p.v,0),0)), dados:{ departamentos:deps, emitido:r.emitido, filial:r.filial } }));
      if(guardar) await q(S.sb.from('analise_vendas').upsert(rows, {onConflict:'setor_id,periodo_inicio,periodo_fim'}));
      closeModal();
      S.anaSel=S.anaSel||{}; for(const x of rows) delete S.anaSel[x.setor_id];
      if(opts.lancar){ resolver({ porSetor:Object.fromEntries(rows.map(x=>[x.setor_id,x.venda])), ini:r.periodo.ini, fim:r.periodo.fim }); return; }
      toast(`Análise salva ✔ — ${rows.map(x=>nomeSetor(x.setor_id)).join(', ')}`, 4500);
      if(S.view==='setor'){ if(!por[S.setorSel]) S.setorSel=Object.keys(por)[0]; S.setorAba='ana'; render(); }
      resolver(true);
    }catch(e){ err('Não foi possível salvar: '+(e.message||e)); $('#mY',m).disabled=false; $('#mY',m).textContent=opts.lancar?'Continuar':'Salvar análise'; }
  };
  });
}
