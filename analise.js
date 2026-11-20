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
  const r=await q(S.sb.from(tabAna()).select('id,periodo_inicio,periodo_fim,venda,dados').eq('setor_id',sid).eq('periodo_inicio',ini).eq('periodo_fim',fim).limit(1));
  return r[0]||null;
}

/* monta a árvore departamento → produto com a base de comparação */
function montarAnalise(cur, base){
  const mapB=new Map(); if(base) for(const d of base.dados.departamentos) for(const p of d.produtos) mapB.set(p.c,{...p,dep:d.codigo,depNome:d.nome,depSuf:d.suf,depOrig:d.codOrig});
  const vistos=new Set(), deps=[];
  for(const d of cur.dados.departamentos){
    deps.push({ codigo:d.codigo, nome:d.nome, codOrig:d.codOrig, suf:d.suf, produtos:d.produtos.map(p=>{ vistos.add(p.c); const o=mapB.get(p.c); return {...p, qb:o?o.q:null, vb:o?o.v:(base?0:null), grupoB:o?.grupo||null}; }) });
  }
  if(base) for(const [c,o] of mapB){ if(vistos.has(c)) continue; let dd=deps.find(x=>x.codigo===o.dep); if(!dd){ dd={codigo:o.dep,nome:o.depNome,suf:o.depSuf,codOrig:o.depOrig,produtos:[]}; deps.push(dd); } dd.produtos.push({c, d:o.d, q:0, v:0, m:null, qb:o.q, vb:o.v}); }
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
      if(base && p.q>0 && p.qb>0 && p.vb>0){ const vq=p.q/p.qb-1, vv=p.v/p.vb-1;
        if(vv<=-0.1 && vq>=-0.02 && p.vb-p.v>=50) f.push('precoCaiu'); else if(vv>=0.1 && vq<=-0.05 && p.v-p.vb>=50) f.push('soPreco'); }
      if(p.z) f.push('custo'); else if(p.mt>0 && p.m!=null && p.m<p.mt-5) f.push('margem');
      p.flags=f; p.part= tot? p.v/tot : 0;
    }
    d.v=d.produtos.reduce((a,p)=>a+p.v,0); d.vb= base? d.produtos.reduce((a,p)=>a+(p.vb||0),0) : null;
    d.ef=efeitos(d.produtos, !!base); d.qt=somaQtd(d.produtos);
    const comM=d.produtos.filter(p=>p.m!=null && p.v>0); const sv=comM.reduce((a,p)=>a+p.v,0); d.m= sv? comM.reduce((a,p)=>a+p.v*p.m,0)/sv : null;
    d.part= tot? d.v/tot : 0; d.alertas=d.produtos.filter(p=>p.flags.some(x=>x!=='alta')).length;
  }
  { const tot=new Map(); for(const d of deps){ const k=d.codOrig||d.codigo; tot.set(k,(tot.get(k)||0)+d.v); }
    deps.sort((a,b)=>{ const ka=a.codOrig||a.codigo, kb=b.codOrig||b.codigo; return ka===kb ? (a.codigo-b.codigo) : (tot.get(kb)-tot.get(ka)) || (b.vb||0)-(a.vb||0); }); }
  const todos=deps.flatMap(d=>d.produtos);
  return { deps, tot, totBase: base? deps.reduce((a,d)=>a+(d.vb||0),0) : null, itens:ord.length, ef:efeitos(todos,!!base), qt:somaQtd(todos) };
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
  const sid=s.id; const modoAba=S.setorAba; const vivo=()=>S.view==='setor' && S.setorAba===modoAba && S.setorSel===sid && box.isConnected;
  const btnImp = S.gerente? `<button class="btn p" id="anImp">＋ Importar relatório de ${ehBdj()?'embandeijados':'vendas'}</button><input type="file" id="anArq" accept=".pdf,.txt" class="hide">`:'';
  let lista=[];
  try{ lista=await q(S.sb.from(tabAna()).select('id,periodo_inicio,periodo_fim,venda').eq('setor_id',sid).order('periodo_fim',{ascending:false}).order('periodo_inicio',{ascending:true}).limit(200)); }
  catch(e){ box.innerHTML=`<div class="note err">Erro ao carregar: ${esc(e.message)}</div>`; return; }
  if(!vivo()) return;
  lista.sort((a,b)=>b.periodo_fim.localeCompare(a.periodo_fim)||a.periodo_inicio.localeCompare(b.periodo_inicio));
  const ligarImp=()=>{ const b=$('#anImp'); if(b){ b.onclick=()=>$('#anArq').click(); $('#anArq').onchange=e=>{ const f=e.target.files[0]; e.target.value=''; if(f) importarRelatorioVendas(f, sid); }; } };
  if(!lista.length){
    box.innerHTML=`<div class="card empty"><h2>Nenhum relatório de ${ehBdj()?'embandeijados':'vendas'} do ${esc(s.nome)} ainda</h2><p>${ehBdj()?(S.gerente?'Importe a “Relação de vendas com rentabilidade” do sistema tirada por <b>classe</b> (bovinos, suínos, frangos, linguiças e hortifrúti bandeja). A análise mostra só os embandeijados, produto por produto, e compara com o ano passado quando esse relatório também for importado.':'Assim que o gerente importar o relatório de embandeijados, a análise aparece aqui.'):S.gerente?'Importe a “Relação de vendas com rentabilidade” do sistema (PDF). O site separa por departamento e por produto, e compara com o mesmo período do ano passado quando esse relatório também for importado.':'Assim que o gerente importar o relatório de vendas do sistema, a análise por departamento e produto aparece aqui.'}</p><div style="margin-top:12px">${btnImp}</div></div>`;
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
    try{ if(ehBdj()) throw 0; S._metasDep=await q(S.sb.from('metas_departamento').select('dep_codigo,meta').eq('mes',fim.slice(0,7)).eq('setor_id',sid)); }catch(_){ S._metasDep=[]; }
    bals=ehBdj()?[]:(await q(S.sb.from('balancos').select('id,data,periodo_inicio,valor_perda,analise,arquivo_path,arquivo_nome').eq('setor_id',sid).gte('data',ini).order('data'))).filter(b=>(b.periodo_inicio||b.data)<=fim);
  }catch(e){ box.innerHTML=`<div class="note err">Erro ao carregar: ${esc(e.message)}</div>`; return; }
  let partB=null; if(ehBdj()){ try{ const g=async(i,f)=>{ const r=await q(S.sb.from('analise_vendas').select('venda').eq('setor_id',sid).eq('periodo_inicio',i).eq('periodo_fim',f).limit(1)); if(r[0]) return +r[0].venda; const l=await todasLinhas(()=>S.sb.from('lancamentos').select('venda').eq('setor_id',sid).gte('data',i).lte('data',f)); const t=l.reduce((a,x)=>a+(+x.venda||0),0); return t||null; };
      partB={ g:await g(ini,fim), gl:await g(pa0,pa1) }; }catch(_){} }
  if(!vivo() || !cur) return;
  if(!ehBdj()){ try{ const gs=(await carregarGrupos()).filter(g=>g.setor_id===sid); if(gs.length){ cur=agruparAnalise(cur,gs); ly=agruparAnalise(ly,gs); lm=agruparAnalise(lm,gs); lyM=agruparAnalise(lyM,gs); } }catch(_){ } if(!vivo()) return; }
  try{ const nm=await carregarNomesDep(); cur=renomearDeps(cur,sid,nm); ly=renomearDeps(ly,sid,nm); lm=renomearDeps(lm,sid,nm); lyM=renomearDeps(lyM,sid,nm); }catch(_){ }
  if(!ehBdj()){ const mx=depsMistos([cur,ly,lm,lyM]), rot=SETORES_PESO.has(sid); cur=separarKgPacote(cur,mx,rot); ly=separarKgPacote(ly,mx,rot); lm=separarKgPacote(lm,mx,rot); lyM=separarKgPacote(lyM,mx,rot); }
  if(!S.anaBase || (S.anaBase==='ano'&&!ly&&lm) ) S.anaBase = ly ? 'ano' : (lm ? 'mes' : 'ano');
  const base = S.anaBase==='ano' ? ly : lm;
  const A=montarAnalise(cur, base); A.maxDep=Math.max(0,...A.deps.map(d=>d.v||0)); const perdas=perdasBalanco(bals);
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
  const lstS=(tit, ico, itens, fn, sub)=> `<div class="an-ol"><div class="an-olt">${ico} ${tit} <span class="small muted" style="font-weight:400">(${itens.length})</span></div><div class="small muted" style="margin:-2px 0 4px">${sub}</div>${itens.length?itens.slice(0,6).map(p=>`<button class="an-oli" data-go="${esc(p.c)}" data-dep="${p.depC}"><span>${esc(p.d)}<span class="small" style="display:block">${fn(p)}</span></span><b>${(p.efVol>=0?'+':'')+brl0(p.efVol)}</b></button>`).join(''):'<div class="small muted" style="padding:4px 0">nada por aqui</div>'}</div>`;
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
    ${partB?(()=>{ const p=partB.g?A.tot/partB.g:null, pl=(partB.gl&&totLy!=null)?totLy/partB.gl:null; return `<div class="kpi"><div class="l">Participação na venda do ${esc(s.nome)}</div><div class="v">${p==null?'—':pctBR(p,1)}</div><div class="d">${partB.g?'venda total do setor '+brl0(partB.g):'sem a venda total do setor no período'}${pl!=null?` · ano passado ${pctBR(pl,1)} (${p!=null?(p>=pl?'▲ +':'▼ ')+((p-pl)*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+' p.p.':''})`:''}</div></div>`; })():''}
    ${cartao('Ano passado, mesmo período', totLy, pa0, pa1)}
    ${cartao('Mês passado, mesmo período', totLm, pm0, pm1)}
    ${proj!=null?`<div class="kpi"><div class="l">Projeção do mês</div><div class="v">${brl0(proj)}</div><div class="d">no ritmo até o dia ${dias}${totLyM!=null?` · ${mesLabel(lyMes[0].slice(0,7))} fechou ${brl0(totLyM)} ${varHtml(proj,totLyM)}`:''}</div></div>`:''}
    <div class="kpi"><div class="l">Mix de produtos</div><div class="v">${A.itens}</div><div class="d">${base?`${nNovos} novo(s) · ${nParados} parou(ram) de vender vs. ${nomeBase}`:'com venda no período'}</div></div>
    ${bals.length?`<div class="kpi"><div class="l">Perdas dos produtos no balanço</div><div class="v">${brl0(perdaTot)}</div><div class="d">soma das perdas, sem descontar as sobras · resultado do balanço ${brl0(bals.reduce((x,b)=>x+(+b.valor_perda||0),0))} · ${bals.map(b=>`${b.periodo_inicio?fDate(b.periodo_inicio)+' a ':''}${fDate(b.data)}`).join(', ')}</div></div>`:''}
  </div>
  ${notaDatas(ini, fim, [{rot:'ano passado', ini:ly?pa0:null, fim:pa1},{rot:'mês passado', ini:lm?pm0:null, fim:pm1}])}
  ${ehBdj()?'':'<div id="anRup"></div>'}
  ${cardCurvaABC(A, todos)}
  ${base?cardVolumePreco(A, nomeBase):''}
  ${base?(()=>{ const sens=sensibilidade(todos); const fq=v=>`<span style="color:${v>=0?'var(--good)':'var(--bad)'}">${v>=0?'▲':'▼'} ${pct(Math.abs(v),0)}</span>`;
      const lin=p=>`preço <b>${p.dp>=0?'▲':'▼'} ${pct(Math.abs(p.dp),0)}</b> · qtd ${fq(p.dq)}`;
      return `<div class="card" style="margin-top:12px"><div class="row" style="margin-bottom:6px"><h2 style="margin:0">🏷️ Sensibilidade ao preço</h2><div class="sp"></div><span class="small muted">preço médio e quantidade contra o ${nomeBase} · toque no produto para ver</span></div>
      <p class="small muted" style="margin:-2px 0 8px">Só produtos que vendiam pelo menos ${brl0(200)} antes e cujo preço médio mudou 5% ou mais.</p>
      <div class="an-olg">
        ${lstS('Cliente sentiu o aumento','⚠️',sens.sentiu,lin,'preço subiu e a quantidade caiu 10% ou mais')}
        ${lstS('Aguentou o aumento','💪',sens.aguentou,lin,'preço subiu e a quantidade se manteve')}
        ${lstS('Baixou o preço e vendeu mais','🚀',sens.funcionou,lin,'quantidade subiu 10% ou mais')}
        ${lstS('Baixou o preço e não vendeu mais','🤔',sens.naoFunc,lin,'a margem caiu sem ganho de volume')}
      </div></div>`; })():''}
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
      <select id="anOrd" style="border:1px solid var(--line);border-radius:9px;padding:7px 10px"><option value="v">Ordenar: maior venda</option><option value="var">Ordenar: maior queda</option><option value="qtd">Ordenar: maior queda em quantidade</option><option value="alta">Ordenar: maior alta</option><option value="m">Ordenar: menor margem</option></select>
    </div>
    <div class="tabs2" id="anFil">${[['todos','Todos'],['alertas','⚠ Alertas'],['queda','📉 Quedas'],['alta','📈 Altas'],['A','⭐ Curva A'],['parado','⛔ Pararam'],['novo','🆕 Novos']].map(([k,t])=>`<button data-f="${k}" class="${(S.anaFil||'todos')===k?'on':''}">${t}</button>`).join('')}
      <span class="sp"></span><button data-x="abrir">Abrir todos</button><button data-x="fechar">Fechar todos</button></div>
    <div id="anCasc"></div>
    <div class="small muted" style="margin-top:10px">Var. = variação contra o ${nomeBase} no mesmo período (em quantidade e em R$). Volume = quanto a venda mudou só pela quantidade, ao preço de antes; Preço = quanto mudou só pelo preço${base?` (${fD(S.anaBase==='ano'?pa0:pm0)} a ${fD(S.anaBase==='ano'?pa1:pm1)})`:''}. Part. = participação na venda do setor. Curva A = produtos que somam 80% da venda. ${bals.length?'Perda bal. = perda do produto no balanço que cruza o período (sem descontar sobras).':''}</div>
  </div>`;
  if(S.anaOrd) $('#anOrd').value=S.anaOrd;
  S.anaAbertos=S.anaAbertos||new Set();
  const casa=(p)=>{ const f=S.anaFil||'todos', t=(S.anaBusca||'').trim().toLowerCase();
    if(t && !p.d.toLowerCase().includes(t) && !String(p.c).startsWith(t)) return false;
    if(f==='todos') return true; if(f==='alertas') return p.flags.some(x=>x!=='alta'&&x!=='novo'); if(f==='A') return p.abc==='A'; return p.flags.includes(f); };
  const ordenar=ps=>{ const o=S.anaOrd||'v'; const r=[...ps];
    if(o==='qtd') r.sort((a,b)=>((a.qb?a.q/a.qb-1:9)-(b.qb?b.q/b.qb-1:9))); else if(o==='var') r.sort((a,b)=>((a.v-(a.vb||0))-(b.v-(b.vb||0)))); else if(o==='alta') r.sort((a,b)=>((b.v-(b.vb||0))-(a.v-(a.vb||0)))); else if(o==='m') r.sort((a,b)=>(a.m??999)-(b.m??999)); else r.sort((a,b)=>b.v-a.v||(b.vb||0)-(a.vb||0)); return r; };
  const TAG={precoCaiu:['b-warn','caiu pelo preço — volume manteve'],soPreco:['b-warn','subiu só pelo preço — volume caiu'],queda:['b-bad','caiu'],alta:['b-good','subiu'],parado:['b-bad','parou de vender'],novo:['b-good','novo'],margem:['b-warn','margem abaixo do alvo'],custo:['b-warn','custo zerado no cadastro']};
  const tags=p=>`${p.abc?`<span class="an-abc an-${p.abc}">${p.abc}</span>`:''}${p.grupo?` <span class="badge" title="${esc(p.grupo.map(g=>g.d).join(' + '))}">🔗 junta ${p.grupo.length} códigos</span>`:''}${p.flags.map(f=>{ const [c,t]=TAG[f]; const x=(f==='queda'||f==='alta')?` ${pct(Math.abs(varPct(p.v,p.vb)),0)}`:''; return ` <span class="badge ${c}">${t}${x}</span>`; }).join('')}`;
  const desenhar=()=>{
    const filtrando = (S.anaFil&&S.anaFil!=='todos') || (S.anaBusca||'').trim();
    const html=A.deps.map(d=>{ const ps=ordenar(d.produtos.filter(casa)); if(filtrando && !ps.length) return '';
      const aberto = S.anaAbertos.has(d.codigo) || (filtrando && ps.length);
      return `<div class="an-dep ${aberto?'open':''}">
        <button class="an-dh" data-d="${d.codigo}"><span class="an-chev">${aberto?'▾':'▸'}</span>
          <span class="an-dn">${(()=>{ const mt=metaDep(d.codOrig||d.codigo); if(!mt) return ''; const ma=mt*fatorMeta, p=ma?d.v/ma:null; return `<span class="an-meta" style="color:${p>=1?'var(--good)':p>=0.9?'var(--warn)':'var(--bad)'}">🎯 ${pct(p)} da meta até ${fDate(fim)} (${brl0(ma)} de ${brl0(mt)} no mês)</span>`; })()}<b>${esc(cap1(d.nome))}${d.suf?` <span class="an-suf">${d.suf}</span>`:''}</b> <span class="small muted">${d.produtos.filter(p=>p.v>0).length} produto(s)${filtrando?` · ${ps.length} no filtro`:''}</span>${d.alertas?` <span class="badge b-warn">${d.alertas} alerta(s)</span>`:''}${base&&d.ef?`<span class="small m-only" style="margin-top:2px">📦 volume ${efHtml(d.ef.vol, d.vb)} · 🏷️ preço ${efHtml(d.ef.preco, d.vb)}</span>`:''}<span class="an-bar"><i style="width:${A.maxDep?Math.max(1,Math.min(100,d.v/A.maxDep*100)):0}%"></i></span></span>
          <span class="an-dc"><span class="l">Venda</span><b>${brl0(d.v)}</b></span>
          <span class="an-dc"><span class="l">${base?nomeBase:'—'}</span>${base?brl0(d.vb):'—'}</span>
          <span class="an-dc"><span class="l">Var.</span>${base?varHtml(d.v,d.vb):'—'}</span>
          ${base&&d.ef?`<span class="an-dc hm"><span class="l">Volume</span>${efHtml(d.ef.vol, d.vb)}</span><span class="an-dc hm"><span class="l">Preço</span>${efHtml(d.ef.preco, d.vb)}</span>`:''}
          <span class="an-dc hm"><span class="l">Part.</span>${pct(d.part)}</span>
          <span class="an-dc hm"><span class="l">Margem</span>${d.m!=null?pct(d.m/100):'—'}</span>
        </button>
        ${aberto?`<div class="m-only an-ml">${ps.map(p=>{ const pb=perdas.get(String(p.c)); return `<details class="dl an-mp ${S.anaFoco===p.c?'an-foco':''}" id="anpm-${esc(p.c)}"><summary><span class="dl-d"><span class="an-mn">${esc(p.d)}</span><span class="small muted" style="display:block">${qtdTxt(p.q)}${base&&p.qb!=null?` · antes ${qtdTxt(p.qb)} ${varHtml(p.q,p.qb)}`:''}</span><span class="an-mt">${tags(p)}</span></span><b class="dl-v">${p.v?brl0(p.v):'—'}</b><span class="dl-p">${base?varHtml(p.v,p.vb):''}</span></summary>
            <div class="dl-c"><div><span>${p.grupo?'Códigos':'Código'}</span><b>${esc(codProd(p))}</b></div><div><span>Quantidade</span><b>${qtdTxt(p.q)}${base&&p.qb!=null?` <small class="muted">(antes ${qtdTxt(p.qb)})</small> ${varHtml(p.q,p.qb)}`:''}</b></div>
            ${base?`<div><span>Venda ${nomeBase}</span><b>${p.vb?brl(p.vb):'—'}</b></div><div><span>Diferença</span><b>${p.vb!=null?`${p.v-p.vb>=0?'+':''}${brl0(p.v-p.vb)}`:'—'}</b></div>`:''}
            <div><span>Preço médio</span><b>${p.q?brl(p.v/p.q):'—'}${base&&p.qb?` <small class="muted">(antes ${brl(p.vb/p.qb)})</small> ${varHtml(p.v/p.q,p.vb/p.qb)}`:''}</b></div><div><span>Participação</span><b>${p.v?pct(p.part):'—'}</b></div><div><span>Margem</span><b>${p.m!=null?pct(p.m/100):'—'}</b></div>
            ${perdas.size?`<div><span>Perda no balanço</span><b>${pb?brl(pb):'—'}</b></div>`:''}</div>${p.grupo?`<div class="an-gm"><div class="small" style="font-weight:700;margin:6px 0 2px">Por código</div>${membrosGrupo(p).map(m=>`<div class="an-gmi"><div><span class="small muted">${esc(m.c)}</span> ${esc(m.d)}<div class="small muted">${qtdTxt(m.q)}${base&&m.qb!=null?` · antes ${qtdTxt(m.qb)} ${m.qb?varHtml(m.q,m.qb):''}`:''}</div></div><div class="n"><b>${m.v?brl0(m.v):'—'}</b><div class="small">${base?(m.vb?varHtml(m.v,m.vb):(m.v?'novo':'parou')):''}</div></div></div>`).join('')}</div>`:''}</details>`; }).join('')}${!ps.length?'<div class="muted small" style="padding:10px">Nenhum produto</div>':''}</div>
        <div class="tw an-pt d-only"><table><thead><tr><th>Produto</th><th class="n">Qtd</th>${base?'<th class="n">Var. qtd</th>':''}<th class="n">Venda</th>${base?`<th class="n">${nomeBase}</th><th class="n">Var. venda</th>`:''}<th class="n">Part.</th><th class="n">Margem</th>${perdas.size?'<th class="n">Perda bal.</th>':''}</tr></thead><tbody>
          ${ps.map(p=>{ const pb=perdas.get(String(p.c)); return `<tr id="anp-${esc(p.c)}" class="${S.anaFoco===p.c?'an-foco':''}"><td><span class="small muted">${esc(codProd(p))}</span> ${esc(p.d)} ${tags(p)}${p.grupo?` <button class="an-gx" data-gx="${esc(p.c)}">${S.anaGrp?.has(p.c)?'▾ esconder códigos':'▸ ver códigos'}</button>`:''}</td>
            <td class="n">${qtdTxt(p.q)}${base&&p.qb!=null?`<div class="small muted">antes ${qtdTxt(p.qb)}</div>`:''}</td>${base?`<td class="n">${p.qb!=null?varHtml(p.q,p.qb):'<span class="muted">—</span>'}</td>`:''}
            <td class="n"><b>${p.v?brl(p.v):'—'}</b>${p.q?`<div class="small muted">${brl(p.v/p.q)}/${ehKg(p)?'kg':'un'}${base&&p.qb&&p.vb?` (antes ${brl(p.vb/p.qb)})`:''}</div>`:''}</td>${base?`<td class="n">${p.vb?brl(p.vb):'—'}</td><td class="n">${varHtml(p.v,p.vb)}</td>`:''}
            <td class="n">${p.v?pct(p.part):'—'}</td><td class="n">${p.m!=null?pct(p.m/100):'—'}</td>${perdas.size?`<td class="n">${pb?`${brl(pb)}${p.v?`<div class="small muted">${pct(pb/p.v,1)} da venda</div>`:''}`:'—'}</td>`:''}</tr>${p.grupo&&S.anaGrp?.has(p.c)?membrosGrupo(p).map(m=>`<tr class="an-sub"><td>↳ <span class="small muted">${esc(m.c)}</span> ${esc(m.d)}</td>
            <td class="n">${qtdTxt(m.q)}${base&&m.qb!=null?`<div class="small muted">antes ${qtdTxt(m.qb)}</div>`:''}</td>${base?`<td class="n">${m.qb?varHtml(m.q,m.qb):(m.q?'<span class="badge b-good">novo</span>':'<span class="muted">—</span>')}</td>`:''}
            <td class="n"><b>${m.v?brl(m.v):'—'}</b>${m.q?`<div class="small muted">${brl(m.v/m.q)}/kg${base&&m.qb&&m.vb?` (antes ${brl(m.vb/m.qb)})`:''}</div>`:''}</td>${base?`<td class="n">${m.vb?brl(m.vb):'—'}</td><td class="n">${m.vb?varHtml(m.v,m.vb):(m.v?'<span class="badge b-good">novo</span>':'<span class="badge b-bad">parou</span>')}</td>`:''}
            <td class="n">${m.v&&p.v?`${pct(m.v/p.v,0)}<div class="small muted">do grupo</div>`:'—'}</td><td class="n"></td>${perdas.size?'<td></td>':''}</tr>`).join(''):''}`; }).join('')}
          ${!ps.length?'<tr><td colspan="9" class="muted">Nenhum produto</td></tr>':''}
        </tbody></table></div>`:''}
      </div>`; }).join('');
    $('#anCasc').innerHTML = html || '<div class="empty">Nenhum produto com esse filtro.</div>';
    $('#anCasc').querySelectorAll('[data-gx]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); S.anaGrp=S.anaGrp||new Set(); const c=b.dataset.gx; if(S.anaGrp.has(c)) S.anaGrp.delete(c); else S.anaGrp.add(c); desenhar(); });
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
  const irProd=b=>{ S.anaFil='todos'; S.anaBusca=''; $('#anBusca').value=''; $('#anFil').querySelectorAll('[data-f]').forEach(x=>x.classList.toggle('on',x.dataset.f==='todos')); S.anaAbertos.add(+b.dataset.dep); S.anaFoco=b.dataset.go; desenhar(); };
  box.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>irProd(b));
  const verA=$('#abcVerA'); if(verA) verA.onclick=()=>{ S.anaFil='A'; $('#anFil').querySelectorAll('[data-f]').forEach(x=>x.classList.toggle('on',x.dataset.f==='A')); desenhar(); $('#anFil').scrollIntoView({behavior:'smooth',block:'start'}); };
  if(!ehBdj()) cardRuptura($('#anRup'), sid, fim, todos, irProd);
  const del=$('#anDel'); if(del) del.onclick=()=>confirmBox(`Apagar o relatório de vendas de ${fD(ini)} a ${fD(fim)} do ${s.nome}?`, async()=>{ try{ await q(S.sb.from(tabAna()).delete().eq('id',sel.id)); delete S.anaSel[sid]; toast('Relatório apagado'); renderAnaliseSetor(box,s); }catch(e){ toast(e.message,5000); } });
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
  if(r && r.nivel==='CLASSE'){ r._bandeja=true; if(!ehBdj()) S.setorAba='bdj'; }
  if(r && r.nivel && r.nivel!=='DEPTO' && r.nivel!=='CLASSE' && !r._dividido){ // relatório por SEÇÃO: separa cada produto no setor certo
    try{ busy('Separando os produtos por setor…'); const prod=new Map();
      for(let i=0;;i+=1000){ const pg=await q(S.sb.from('produtos_setor').select('codigo,setor_id').range(i,i+999)); (pg||[]).forEach(x=>prod.set(String(x.codigo),x.setor_id)); if(!pg||pg.length<1000) break; }
      // aprende com os relatórios já guardados: produto/subgrupo que já apareceu num setor vai para o mesmo setor
      try{ const ap=[]; for(let i=0;;i+=1000){ const pg=await q(S.sb.rpc('mapa_setor_analises').range(i,i+999)); ap.push(...(pg||[])); if(!pg||pg.length<1000) break; } for(const x of ap){ if(x.tipo==='p'){ if(!prod.has(String(x.codigo))) prod.set(String(x.codigo), x.setor_id); }
          else if(!mapa.some(m=>String(m.codigo)===String(x.codigo) && m.nome===x.nome)) mapa.push({codigo:+x.codigo, nome:x.nome, setor_id:x.setor_id}); } }catch(_){ }
      r=dividirPorSetor(r, prod, mapa); r.semMapa=!prod.size;
    }catch(e){ closeModal(); toast('Não consegui separar por setor: '+e.message, 6000); return null; }
  }
  closeModal();
  if(!r){ toast('Esse arquivo não parece a “Relação de vendas com rentabilidade” do sistema.', 6000); return null; }
  return await new Promise(async resolver=>{
  const conf = r.totalGeral?.venda!=null ? Math.abs(r.totalGeral.venda-r.venda)<1 && (!r.totalGeral.itens || r.totalGeral.itens===r.itens) : null;
  const normN=t=>String(t||'').toUpperCase().replace(/\s+/g,' ').trim();
  const sug=d=>{ if(r._bandeja) return /HORTI/i.test(d.nome)?'hortifruti':'acougue'; if(d._setor!==undefined) return d._setor||''; const m=mapa.find(x=>x.codigo===d.codigo && normN(x.nome)===normN(d.nome)); if(m) return m.setor_id||''; const g=Parser.matchSector(d.nome); return (g && S.setoresAll.some(x=>x.id===g))? g : (mapa.length? '' : setorAtual); };
  let existentes=[]; try{ existentes=await q(S.sb.from(tabAna()).select('setor_id').eq('periodo_inicio',r.periodo.ini).eq('periodo_fim',r.periodo.fim)); }catch(_){}
  const opcoesSetor=sel=>`<option value="">— não importar —</option>${S.setoresAll.map(x=>`<option value="${x.id}" ${x.id===sel?'selected':''}>${esc(x.nome)}</option>`).join('')}`;
  // relatório tirado no mesmo dia vem "até hoje", mas a venda de hoje ainda não fechou: considera até ontem
  const ontem = isoOf(new Date(Date.now()-864e5));
  const fimSugerido = (r.periodo.fim>=todayIso() && r.periodo.ini<=ontem) ? ontem : r.periodo.fim;
  const umDia = r.periodo.ini===fimSugerido;
  const m=modal(`<h2>📊 Relatório de vendas ${r._bandeja?'de embandeijados (por classe)':'por produto'}${opts.lancar?' — lançar venda do dia':''}</h2>
    <div class="grid kpis" style="margin:8px 0">
      <div class="kpi"><div class="l">Período</div><div class="v" style="font-size:20px">${fD(r.periodo.ini)} a ${fD(r.periodo.fim)}</div><div class="d">${r.filial?'filial '+esc(r.filial):''}${r.emitido?' · emitido '+fD(r.emitido):''}</div>
        <label class="f" style="margin-top:6px">Considerar a venda até<input type="date" id="rvFim" value="${fimSugerido}" min="${r.periodo.ini}" max="${r.periodo.fim}"></label>
        ${fimSugerido!==r.periodo.fim?`<div class="d" style="color:var(--warn)">O relatório vai até ${fD(r.periodo.fim)}, mas a venda desse dia ainda não fechou — por isso vai como até ${fD(fimSugerido)}.</div>`:''}</div>
      <div class="kpi"><div class="l">Venda total</div><div class="v" style="font-size:20px">${brl(r.venda)}</div><div class="d">${r.itens} produtos · ${r.departamentos.length} departamentos${r.cupons?` · ${r.cupons} cupons`:''}</div></div>
    </div>
    ${conf===true?'<div class="note small" style="background:var(--good-bg);border-color:#a9d8b8">✔ Conferido: a soma dos produtos bate com o TOTAL GERAL do relatório.</div>':conf===false?`<div class="note err small">A soma dos produtos (${brl(r.venda)}) não bate com o TOTAL GERAL (${brl(r.totalGeral.venda)}). Confira o arquivo.</div>`:''}
    ${r._dividido?`<div class="note small" style="margin:8px 0">Relatório por <b>seção</b>: cada produto foi separado no setor certo pelo cadastro de produtos${r.semMapa?' — <b style="color:var(--warn)">o cadastro ainda está vazio; importe uma vez o relatório por sub-departamento para a separação ficar exata</b>':''}.</div>`:''}
    ${r._dividido?(()=>{ const nSem=r.departamentos.filter(d=>!sug(d)).length; return `<p class="small" style="margin:10px 0 6px">${nSem?`<b style="color:var(--warn)">${nSem} grupo(s) sem setor</b> — escolha o setor nas linhas abaixo; o resto o site já separou sozinho.`:'<b style="color:var(--good)">✔ O site separou todos os produtos por setor.</b> Confira o resumo e salve.'} <label style="margin-left:6px;white-space:nowrap"><input type="checkbox" id="rvTodos"> ver todos os ${r.departamentos.length} grupos</label></p>`; })()
      :'<p class="small muted" style="margin:10px 0 6px">Escolha para qual setor do site vai cada departamento do sistema. O site lembra a escolha para os próximos relatórios.</p>'}
    <div class="tw" id="rvTab" style="max-height:340px;overflow:auto"><table><thead><tr><th>Departamento</th><th class="n">Produtos</th><th class="n">Venda</th><th>Setor do site</th></tr></thead><tbody>
      ${r.departamentos.map((d,i)=>`<tr class="${r._dividido&&sug(d)?'rv-ok':''}"><td><b>${d.codigo}</b> ${esc(cap1(d.nome))}${d._setor!==undefined?` <span class="muted">→ ${esc(d._setor?nomeSetor(d._setor):'?')}</span>`:''}</td><td class="n">${d.produtos.length}</td><td class="n">${brl0(d.produtos.reduce((a,p)=>a+p.v,0))}</td><td><select data-i="${i}" style="border:1px solid var(--line);border-radius:8px;padding:4px 6px">${opcoesSetor(sug(d))}</select></td></tr>`).join('')}
    </tbody></table></div>
    <div id="rvResumo" class="small" style="margin-top:10px"></div>
    ${opts.lancar?`<p class="small muted" style="margin:8px 0 0">📊 A Análise de vendas atualiza junto${umDia?' (o dia é somado no acumulado do mês)':''}.</p>`:''}
    <div id="rvErr" class="note err small hide" style="margin-top:8px"></div>
    <div class="row" style="margin-top:12px"><div class="sp"></div><button class="btn" id="mN">Cancelar</button><button class="btn p" id="mY">${opts.lancar?'Continuar':'Salvar análise'}</button></div>`);
  const resumo=()=>{ const por={}; m.querySelectorAll('select[data-i]').forEach(s=>{ if(!s.value) return; const d=r.departamentos[+s.dataset.i]; por[s.value]=(por[s.value]||0)+d.produtos.reduce((a,p)=>a+p.v,0); });
    const sem=[...m.querySelectorAll('select[data-i]')].filter(x=>!x.value); sem.forEach(x=>x.closest('tr').style.background='#fff6dc'); m.querySelectorAll('select[data-i]').forEach(x=>{ if(x.value) x.closest('tr').style.background=''; });
    const vSem=sem.reduce((a,x)=>a+r.departamentos[+x.dataset.i].produtos.reduce((b,p)=>b+p.v,0),0);
    const subst=Object.keys(por).filter(id=>existentes.some(e=>e.setor_id===id));
    $('#rvResumo',m).innerHTML = Object.keys(por).length ? `Vai salvar: ${Object.entries(por).map(([id,v])=>`<b>${esc(nomeSetor(id))}</b> ${brl0(v)}`).join(' · ')}${sem.length?`<br><span style="color:var(--bad)">⚠ ${sem.length} departamento(s) sem setor (${brl0(vSem)}) — essa venda não entra. Escolha o setor nas linhas em amarelo.</span>`:''}${subst.length?`<br><span style="color:var(--warn)">Já existe relatório desse período para ${subst.map(nomeSetor).join(', ')} — será substituído.</span>`:''}` : '<span style="color:var(--bad)">Nenhum departamento escolhido.</span>'; };
  m.querySelectorAll('select[data-i]').forEach(s=>s.onchange=resumo); resumo();
  const tab=$('#rvTab',m), tg=$('#rvTodos',m); const aplicaFiltro=()=>{ const so=r._dividido && !(tg&&tg.checked); tab.classList.toggle('so-pend',so); if(so && !tab.querySelector('tr:not(.rv-ok) select')) tab.style.display='none'; else tab.style.display=''; }; if(tg) tg.onchange=aplicaFiltro; aplicaFiltro();
  $('#mN',m).onclick=()=>{ closeModal(); resolver(null); };
  $('#mY',m).onclick=async()=>{
    const err=t=>{ const e=$('#rvErr',m); e.textContent=t; e.classList.remove('hide'); };
    const umDiaEsc = r.periodo.ini===$('#rvFim',m).value;
    const fimEsc=$('#rvFim',m).value; if(!fimEsc || fimEsc<r.periodo.ini) return err('Escolha até que dia vai a venda do relatório.'); r.periodo.fim=fimEsc;
    const escolhas=[...m.querySelectorAll('select[data-i]')].map(s=>({d:r.departamentos[+s.dataset.i], setor:s.value}));
    if(!escolhas.some(x=>x.setor)) return err('Escolha o setor de pelo menos um departamento.');
    $('#mY',m).disabled=true; $('#mY',m).textContent='Salvando…';
    try{
      let rel=null;
      { const path=`${r.periodo.ini}_${r.periodo.fim}/${Date.now()}-${nomeArquivoSeguro(f.name)}`;
        const up=await S.sb.storage.from('relatorios').upload(path, f, {upsert:false, contentType:f.type||undefined});
        rel=((await q(S.sb.from('relatorios_venda').insert({ periodo_inicio:r.periodo.ini, periodo_fim:r.periodo.fim, arquivo_nome:f.name, arquivo_path:up.error?null:path, cupons:r.cupons, total_venda:r.venda }).select('id')))||[])[0]||null; }
      if(!r._dividido && !r._bandeja){ const ps=[]; for(const x of escolhas) if(x.setor) for(const p of x.d.produtos) ps.push({codigo:String(p.c), setor_id:x.setor, sub_codigo:x.d.codigo, atualizado_em:new Date().toISOString()});
        for(let i=0;i<ps.length;i+=500) await q(S.sb.from('produtos_setor').upsert(ps.slice(i,i+500), {onConflict:'codigo'})); }
      if(r._dividido){ const novos=escolhas.filter(x=>x.setor && !x.d._setor); if(novos.length) await q(S.sb.from('departamentos').upsert(novos.map(x=>({codigo:x.d.codigo, nome:x.d.nome, setor_id:x.setor, atualizado_em:new Date().toISOString()})), {onConflict:'codigo,nome'})); }
      if(!r._dividido && !r._bandeja) await q(S.sb.from('departamentos').upsert(escolhas.map(x=>({codigo:x.d.codigo, nome:x.d.nome, setor_id:x.setor||null, atualizado_em:new Date().toISOString()})), {onConflict:'codigo,nome'}));
      const por={}; for(const x of escolhas){ if(!x.setor) continue; (por[x.setor]=por[x.setor]||[]).push({codigo:x.d.codigo, nome:x.d.nome, produtos:x.d.produtos}); }
      const rows=Object.entries(por).map(([setor,deps])=>({ relatorio_id:rel?.id||null, setor_id:setor, periodo_inicio:r.periodo.ini, periodo_fim:r.periodo.fim,
        venda:round2(deps.reduce((a,d)=>a+d.produtos.reduce((b,p)=>b+p.v,0),0)), dados:{ departamentos:deps, emitido:r.emitido, filial:r.filial } }));
      // relatório de um dia: soma no acumulado do mês (01 até o dia); se ainda não houver acumulado, guarda o próprio dia
      let somou=0; if(umDiaEsc){ try{ somou=await acumularDia(rows, r.periodo.fim, tabAna()); }catch(e){ toast('Análise acumulada não atualizou: '+(e.message||e), 6000); } }
      if(!somou) await q(S.sb.from(tabAna()).upsert(rows, {onConflict:'setor_id,periodo_inicio,periodo_fim'}));
      else toast(somou<0?`Análise de vendas: mantido o relatório do mês até ${fDate(r.periodo.fim)} (é mais novo)`:`Análise de vendas atualizada até ${fDate(r.periodo.fim)} ✔`, 4500);
      closeModal();
      S.anaSel=S.anaSel||{}; for(const x of rows) delete S.anaSel[x.setor_id];
      if(opts.lancar){ resolver({ porSetor:Object.fromEntries(rows.map(x=>[x.setor_id,x.venda])), ini:r.periodo.ini, fim:r.periodo.fim }); return; }
      toast(`Análise salva ✔ — ${rows.map(x=>nomeSetor(x.setor_id)).join(', ')}`, 4500);
      if(S.view==='setor'){ if(!por[S.setorSel]) S.setorSel=Object.keys(por)[0]; S.setorAba=r._bandeja?'bdj':'ana'; render(); }
      resolver(true);
    }catch(e){ err('Não foi possível salvar: '+(e.message||e)); $('#mY',m).disabled=false; $('#mY',m).textContent=opts.lancar?'Continuar':'Salvar análise'; }
  };
  });
}

/* Relatório por SEÇÃO → grupos (seção, setor) usando o cadastro de produtos, regras e o setor padrão da seção */
function setorPorRegra(sec, desc){ const d=String(desc||'').toUpperCase();
  if(sec===19 && /^LEITE/.test(d)) return 'leite_gas';
  if(sec===22 && /^LING/.test(d)) return 'pereciveis';
  if(sec===11 && /\bGAS\b/.test(d)) return 'leite_gas';
  if(sec===24 && /GELO/.test(d)) return 'bebidas';
  if(sec===18 && /^(SACO|VASSOURA|RODO|PA |ESCOVA|BALDE|PREND)/.test(d)) return 'bazar';
  if(sec===31 && /ALCOOL.*GEL/.test(d)) return 'limpeza';
  return null; }
function dividirPorSetor(r, prod, mapa){
  const normN=t=>String(t||'').toUpperCase().replace(/\s+/g,' ').trim(); const grupos=[]; const secao = r.nivel==='SECAO';
  for(const d of r.departamentos){
    const pad=(mapa.find(x=>x.codigo===d.codigo && normN(x.nome)===normN(d.nome))||{}).setor_id || (secao?null:setorPorNomeParecido(d.nome, mapa)) || setorPorPalavra(d.nome) || Parser.matchSector(d.nome) || null;
    const por=new Map();
    for(const p of d.produtos){ const s=prod.get(String(p.c)) || (secao?setorPorRegra(d.codigo,p.d):null) || (typeof setorPorDescricao==='function'?setorPorDescricao(p.d):null) || pad || ''; if(!por.has(s)) por.set(s,[]); por.get(s).push(p); }
    for(const [s,ps] of por) grupos.push({codigo:d.codigo, nome:d.nome, produtos:ps, _setor:s});
  }
  return {...r, departamentos:grupos, _dividido:true};
}
/* subgrupo novo: procura o sub-departamento de nome mais parecido já cadastrado */
const PAL_IGNORA=new Set(['DE','DA','DO','DAS','DOS','COM','SEM','ATE','ACIMA','ABAIXO','E','EM','KG','ML','UN','G','L','TRADIC','TRADICIONAL','REGULAR','PADRAO','OUTROS','OUTRAS','INDIVIDUAL','FAMILIAR','BASICA','BASICO','ESPECIAL','ESPECIAIS']);
const tokensNome=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>=3 && !PAL_IGNORA.has(w) && !/^\d+$/.test(w));
function setorPorNomeParecido(nome, mapa){
  const a=tokensNome(nome); if(!a.length) return null; let best=null, bs=0;
  for(const m of mapa){ if(!m.setor_id) continue; const b=tokensNome(m.nome); if(!b.length) continue;
    const inter=a.filter(w=>b.some(x=>x===w || (w.length>=5 && x.length>=5 && (x.startsWith(w.slice(0,5))||w.startsWith(x.slice(0,5)))))).length;
    const sc=inter/Math.min(a.length,b.length) + inter*0.01; if(sc>bs){ bs=sc; best=m.setor_id; } }
  return bs>=0.5 ? best : null;
}
function setorPorPalavra(nome){ const n=String(nome||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const R=[[/TOALHA|LENCOL|EDREDOM|COBERTOR/,'eletro'],[/CERVEJ|CACHAC|VODKA|VINHO|ESPUMANTE|ENERGETIC|SUCO|REFRIG|AGUA |WHISK|\bGIN\b|LICOR|CHOPP|AGUARDENTE|ISOTONIC|CHA PRONTO/,'bebidas'],
    [/LIMPADOR|REMOVEDOR|\bSODA\b|PURIFICADOR DE AR|LA DE ACO|SECANTE|DESENGORDURANTE|SABAO|ANIL|DESINFETANTE|AMACIANTE|DETERGENTE|ALVEJANTE|CLORO|INSETICIDA|ESPONJA|LUSTRA|CERA |TIRA MANCHA/,'limpeza'],
    [/SACO PLASTICO|DESCARTAVEL|CADEIRA|CAIXA|PILHA|CELOFANE|PENEIRA|FACA|COLHER|ESCUMADEIRA|MANTA|RODO|VASSOURA|PA DE LIXO|PETISCO|RACAO|SECO ADULTO|SECO FILHOTE|UMIDO|CAES|GATOS|PANELA|COPO|VELA|CARVAO|FOSFORO|USO LOJA/,'bazar'],
    [/DESODORANTE|COM ABAS|COB SUAVE|ABSORV|LOCAO|REPELENTE|PROTETOR|SHAMPOO|CONDICIONADOR|CREME DENTAL|ESCOVA DENTAL|SABONETE|ABSORVENTE|FRALDA|COLORACAO|BARBEAR|HIDRATANTE/,'perfumaria'],
    [/SORVETE|MORTADELA|PRESUNTO|BACON|SALSICHA|QUEIJO|REQUEIJAO|CREAM CHEESE|RICOTA|MARGARINA|MANTEIGA|IOGURTE|LEITE FERM|PETIT SUISSE|EMBUTIDO|SALAME|APRESUNTADO|PIZZA|LASANHA|CONGELAD/,'pereciveis'],
    [/FRANGO|\bAVE\b|PALETA|BOVIN|SUIN|CARNE|COSTELA|PICANHA|ALCATRA|LINGUICA FRESCAL/,'acougue'],
    [/PAO |PAES|BOLOS? REFRIG|SALGADOS? ASSADO|COMIDAS PRONTAS|TORTA|ROSCA|SONHO/,'padaria'],
    [/COENTRO|QUIABO|SALSA$|CEBOLINHA|ALFACE|TOMATE|BANANA|MACA|LARANJA|VERDURA|LEGUME|FRUTA|OVOS? (BRANC|VERMELH|TRADIC)/,'hortifruti'],
    [/BISCOITO|RAPADURA|PIRULITO|BOMBOM|CANDY|CHOCOLATE|GOIABADA|PACOCA|MISTURAS? (BOLO|MARIA)|CEREAL|ERVA|MEL\b|GELATINA|ADOCANTE|DOCE|BALA|PIPOCA.*DOCE/,'merc_doce'],
    [/AMENDOIM|CHIPS|SNACK|APERITIVO|MAIONESE|SHOYO|MOLHO|AZEITONA|ATUM|SARDINHA|CONSERVA|KETCHUP|MOSTARDA|PIPOCA|MACARRAO|MAC INST/,'merc_salgada'],
    [/\bSAL\b|MAISENA|QUINOA|ARROZ|FEIJAO|ACUCAR|FARINHA|OLEO|AZEITE|CAFE|FUBA|AVEIA/,'merc_seca']];
  for(const [re,s] of R) if(re.test(n)) return s; return null; }

/* aba de embandeijados (açougue e hortifrúti) usa a mesma análise, guardada em outra tabela */
function ehBdj(){ return S.setorAba==='bdj'; }
function tabAna(){ return ehBdj() ? 'analise_bandeja' : 'analise_vendas'; }

/* venda = volume × preço: separa quanto da variação veio da quantidade e quanto do preço */
const ehKg = p => !!p.grupo || /\bKG\b/i.test(p.d||'');
function efeitos(ps, temBase){
  if(!temBase) return null; let vol=0, preco=0, novos=0, parados=0, vbComum=0;
  for(const p of ps){ const vb=p.vb||0;
    if(p.q>0 && p.qb>0 && vb>0){ const p0=vb/p.qb, p1=p.v/p.q; vol+=(p.q-p.qb)*p0; preco+=(p1-p0)*p.q; vbComum+=vb; }
    else if(!vb && p.v>0) novos+=p.v; else if(vb>0 && !p.v) parados-=vb;
    else if(vb>0 || p.v>0){ vol+=p.v-vb; vbComum+=vb; } }
  return { vol, preco, novos, parados, vbComum };
}
function somaQtd(ps){ const r={kg:0,kgb:0,un:0,unb:0}; for(const p of ps){ if(ehKg(p)){ r.kg+=+p.q||0; r.kgb+=+p.qb||0; } else { r.un+=+p.q||0; r.unb+=+p.qb||0; } } return r; }
function cardVolumePreco(A, nomeBase){
  const e=A.ef; if(!e) return '';
  const base=A.totBase||0, dif=A.tot-base, pc=v=>base? (v>=0?'+':'')+pctBR(v/base,1):'';
  const linha=(t,v,expl)=>`<div style="display:flex;gap:8px;align-items:baseline;padding:6px 0;border-bottom:1px solid var(--line)"><span style="flex:1">${t}<div class="small muted">${expl}</div></span><b style="color:${v>=0?'var(--good)':'var(--bad)'}">${v>=0?'+':''}${brl0(v)}</b><span class="small muted" style="width:62px;text-align:right">${pc(v)}</span></div>`;
  const q=A.qt, vq=(a,b)=>b? `${a>=b?'▲':'▼'} ${pctBR(Math.abs(a/b-1),1)}`:'';
  return `<div class="card" style="margin-top:12px"><h2>⚖️ Volume × preço <span class="small muted" style="font-weight:400">contra o ${esc(nomeBase)}</span></h2>
    <p class="small muted" style="margin:-4px 0 6px">A venda variou <b style="color:${dif>=0?'var(--good)':'var(--bad)'}">${dif>=0?'+':''}${brl0(dif)}</b> (${pc(dif)}). Veja de onde veio:</p>
    ${linha('📦 Volume (quantidade vendida)', e.vol, 'mais ou menos quilos/unidades dos mesmos produtos, ao preço de antes')}
    ${linha('🏷️ Preço', e.preco, 'diferença de preço nos mesmos produtos')}
    ${linha('🆕 Produtos novos', e.novos, 'venda de produtos que não vendiam antes')}
    ${linha('⛔ Produtos que pararam', e.parados, 'venda que deixou de existir')}
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:10px">
      ${q.kg||q.kgb?`<div class="kpi"><div class="l">Quilos vendidos</div><div class="v" style="font-size:20px">${qtBR(q.kg)} kg</div><div class="d">antes ${qtBR(q.kgb)} kg · ${vq(q.kg,q.kgb)}</div></div>`:''}
      ${q.un||q.unb?`<div class="kpi"><div class="l">Unidades vendidas</div><div class="v" style="font-size:20px">${qtBR(q.un)} un</div><div class="d">antes ${qtBR(q.unb)} un · ${vq(q.un,q.unb)}</div></div>`:''}
    </div></div>`;
}
function efHtml(v, b){ if(!b) return v? `<span style="color:${v>=0?'var(--good)':'var(--bad)'}">${v>=0?'+':''}${brl0(v)}</span>`:'<span class="muted">—</span>'; const x=v/b; return `<span style="color:${x>=0?'var(--good)':'var(--bad)'};font-weight:600">${x>=0?'▲':'▼'} ${pctBR(Math.abs(x),1)}</span>`; }

/* sensibilidade ao preço: quanto a quantidade reagiu à mudança do preço médio de cada produto */
function sensibilidade(ps){
  const r={sentiu:[],aguentou:[],funcionou:[],naoFunc:[]};
  for(const p of ps){ if(!(p.q>0 && p.qb>0 && p.vb>=200 && p.v>0)) continue;
    const p0=p.vb/p.qb, p1=p.v/p.q, dp=p1/p0-1, dq=p.q/p.qb-1; if(Math.abs(dp)<0.05) continue;
    const x={...p, dp, dq, efVol:(p.q-p.qb)*p0};
    if(dp>0){ if(dq<=-0.1) r.sentiu.push(x); else if(dq>=-0.02) r.aguentou.push(x); }
    else { if(dq>=0.1) r.funcionou.push(x); else if(dq<=0.02) r.naoFunc.push(x); } }
  r.sentiu.sort((a,b)=>a.efVol-b.efVol); r.aguentou.sort((a,b)=>b.v-a.v); r.funcionou.sort((a,b)=>b.efVol-a.efVol); r.naoFunc.sort((a,b)=>b.vb-a.vb);
  return r;
}

/* Relatório de um dia só: soma no acumulado do mês que já existe (01 até o dia anterior) e grava 01 até o dia.
   Quantidade e venda somam; margem = média ponderada pela venda; custo/margem-alvo ficam do dia mais recente. */
function somarDados(base, dia){
  const deps=JSON.parse(JSON.stringify(base.departamentos||[])); const onde=new Map();
  deps.forEach(d=>d.produtos.forEach(p=>onde.set(String(p.c),p)));
  for(const nd of (dia.departamentos||[])){
    let dep=deps.find(d=>d.codigo===nd.codigo && d.nome===nd.nome);
    for(const p of nd.produtos){ const x=onde.get(String(p.c));
      if(x){ const v1=+x.v||0, v2=+p.v||0; const m=(x.m!=null&&p.m!=null&&(v1+v2))? (x.m*v1+p.m*v2)/(v1+v2) : (p.m??x.m);
        x.q=round2((+x.q||0)+(+p.q||0)); x.v=round2(v1+v2); x.m=m==null?null:Math.round(m*100)/100; x.mt=p.mt??x.mt; x.z=p.z; if(p.d) x.d=p.d; }
      else { if(!dep){ dep={codigo:nd.codigo, nome:nd.nome, produtos:[]}; deps.push(dep); } const np={...p}; dep.produtos.push(np); onde.set(String(p.c),np); } } }
  return { ...base, departamentos:deps, emitido:dia.emitido||base.emitido };
}
async function acumularDia(rows, dia, tabela='analise_vendas'){
  const ini=dia.slice(0,8)+'01'; if(dia===ini) return 0;
  const ant=isoOf(new Date(new Date(dia+'T12:00:00').getTime()-864e5));
  const base=await q(S.sb.from(tabela).select('setor_id,venda,dados,relatorio_id').eq('periodo_inicio',ini).eq('periodo_fim',ant));
  if(!base.length) return 0;
  // já existe um relatório de verdade (não somado) desse mesmo período, tirado no mesmo dia ou depois: ele vale mais que a soma — mantém
  const emitNovo=(rows.find(x=>x.dados?.emitido)||{}).dados?.emitido||null;
  try{ const ex=await q(S.sb.from(tabela).select('setor_id,dados->>emitido,dados->>somado').eq('periodo_inicio',ini).eq('periodo_fim',dia));
    if(ex.length && ex.every(x=>x.somado!=='true') && ex.some(x=>x.emitido && (!emitNovo || x.emitido>=emitNovo))) return -1; }catch(_){ }
  const porS=Object.fromEntries(rows.map(x=>[x.setor_id,x]));
  const out=base.map(b=>{ const d=porS[b.setor_id]; return { relatorio_id:b.relatorio_id, setor_id:b.setor_id, periodo_inicio:ini, periodo_fim:dia,
    venda:round2((+b.venda||0)+(d?+d.venda||0:0)), dados: {...(d? somarDados(b.dados||{}, d.dados||{}) : b.dados), somado:true} }; });
  for(const d of rows) if(!base.some(b=>b.setor_id===d.setor_id)) out.push({ ...d, dados:{...d.dados, somado:true}, periodo_inicio:ini, periodo_fim:dia }); // setor que não tinha acumulado
  await q(S.sb.from(tabela).upsert(out, {onConflict:'setor_id,periodo_inicio,periodo_fim'}));
  S.anaSel={}; return out.length;
}

/* ===================== Ruptura de produto =====================
   Produto que vendia quase todo dia (>=70% dos 15 dias anteriores) e não vendeu nada nos últimos 2 dias.
   Calculado no banco (ruptura_produtos) a partir dos relatórios acumulados de cada dia. */
async function cardRuptura(el, sid, fim, todos, irProd){
  if(!el) return;
  el.innerHTML='<div class="card" style="margin-top:12px"><span class="spin"></span> Procurando produtos em ruptura…</div>';
  let r; try{ r=await q(S.sb.rpc('ruptura_produtos',{p_setor:sid, p_fim:fim})); }catch(e){ el.innerHTML=''; return; }
  if(!el.isConnected) return;
  const porC=new Map(todos.map(p=>[String(p.c),p]));
  const un=d=>(/\bKG\b/.test(d)||(S._grupos||[]).some(g=>g.nome===d))?'kg':'un';
  const nq=(q,d)=>(+q).toLocaleString('pt-BR',{maximumFractionDigits:un(d)==='kg'?1:0});
  const tot=r.reduce((a,x)=>a+(+x.perdida||0),0);
  const ult=r[0]?.ultimo_dia;
  const linha=x=>{ const p=porC.get(String(x.c)); const abc=p?.abc;
    return `<button class="an-oli rup-i" ${p?`data-go="${esc(x.c)}" data-dep="${p.depC}"`:''}><span>${abc?`<span class="an-abc an-${abc}">${abc}</span> `:''}${esc(x.d)}${p?.grupo?` <span class="small muted">(${esc(codProd(p))})</span>`:''}<span class="small" style="display:block">vendia ${nq(x.media_q,x.d)} ${un(x.d)}/dia (${x.dias_venda} de ${x.dias_base} dias) · <b style="color:var(--bad)">sem venda há ${x.dias_sem} dia${x.dias_sem>1?'s':''}</b>${x.ult_venda?` · última ${fD(x.ult_venda)}`:''}</span></span><b style="color:var(--bad)">−${brl0(+x.perdida)}</b></button>`; };
  if(!r.length){ el.innerHTML=`<div class="card" style="margin-top:12px"><div class="row"><h2 style="margin:0">🚫 Ruptura de produto</h2><div class="sp"></div><span class="small" style="color:var(--good);font-weight:600">✔ nenhum produto parou de vender</span></div><p class="small muted" style="margin:6px 0 0">Olha os produtos que vendiam quase todo dia e zeraram nos últimos 2 dias. Precisa dos relatórios de venda de cada dia do mês.</p></div>`; return; }
  const nA=r.filter(x=>porC.get(String(x.c))?.abc==='A').length;
  el.innerHTML=`<div class="card" style="margin-top:12px;border-color:#f1b5b5">
    <div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:4px"><h2 style="margin:0">🚫 Ruptura de produto</h2><span class="badge bad">${r.length}</span>${nA?`<span class="small" style="color:var(--bad);font-weight:700">${nA} da curva A</span>`:''}<div class="sp"></div><span class="small muted">venda perdida estimada <b style="color:var(--bad)">${brl0(tot)}</b></span></div>
    <p class="small muted" style="margin:0 0 8px">Vendiam quase todo dia e <b>não venderam nada nos últimos 2 dias</b> (até ${fD(ult)}). Confira gôndola e estoque. Toque no produto para ver os números.</p>
    <div class="rup-l">${r.slice(0,8).map(linha).join('')}</div>
    ${r.length>8?`<details class="rup-mais"><summary class="small" style="cursor:pointer;margin-top:6px">ver mais ${r.length-8}</summary><div class="rup-l">${r.slice(8).map(linha).join('')}</div></details>`:''}
    <p class="small muted" style="margin:6px 0 0">Venda perdida = média de venda por dia × dias sem vender. Produto que saiu de linha ou é sazonal também pode aparecer aqui.</p></div>`;
  el.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>irProd(b));
}

/* ===================== Curva ABC do setor ===================== */
function cardCurvaABC(A, todos){
  const vend=todos.filter(p=>p.v>0); if(!vend.length) return '';
  const tot=vend.reduce((a,p)=>a+p.v,0);
  const cls=['A','B','C'].map(k=>{ const ps=vend.filter(p=>p.abc===k); const v=ps.reduce((a,p)=>a+p.v,0); return {k, n:ps.length, v, pv:v/tot, pn:ps.length/vend.length}; });
  const tit={A:'Curva A',B:'Curva B',C:'Curva C'}, dsc={A:'nunca pode faltar',B:'importantes',C:'cauda longa'};
  const topA=vend.filter(p=>p.abc==='A').sort((a,b)=>b.v-a.v);
  const un=d=>(/\bKG\b/.test(d)||(S._grupos||[]).some(g=>g.nome===d))?'kg':'un';
  let ac=0;
  return `<div class="card" style="margin-top:12px">
    <div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:6px"><h2 style="margin:0">⭐ Curva ABC</h2><div class="sp"></div><span class="small muted">pela venda do período · ${vend.length} produtos vendidos</span></div>
    <div class="abc-g">${cls.map(c=>`<div class="abc-t abc-${c.k}"><div class="abc-h"><span class="an-abc an-${c.k}">${c.k}</span> ${tit[c.k]} <span class="small muted">${dsc[c.k]}</span></div>
      <div class="abc-n"><b>${c.n}</b> produtos <span class="small muted">(${pctBR(c.pn,0)} do mix)</span></div>
      <div class="abc-n"><b>${brl0(c.v)}</b> <span class="small muted">${pctBR(c.pv,0)} da venda</span></div>
      <div class="abc-bar"><i style="width:${(c.pv*100).toFixed(1)}%"></i></div></div>`).join('')}</div>
    <div class="small" style="margin:10px 0 4px"><b>${topA.length} produtos</b> fazem 80% da venda do setor. Os 10 maiores:</div>
    <div class="rup-l">${topA.slice(0,10).map((p,i)=>{ ac+=p.v; return `<button class="an-oli" data-go="${esc(p.c)}" data-dep="${p.depC}"><span><span class="muted">${i+1}.</span> ${esc(p.d)}${p.grupo?` <span class="small muted">(${esc(codProd(p))})</span>`:''}<span class="small" style="display:block">${(+p.q).toLocaleString('pt-BR',{maximumFractionDigits:un(p.d)==='kg'?1:0})} ${un(p.d)} · ${pctBR(p.v/tot,1)} da venda · acumulado ${pctBR(ac/tot,0)}</span></span><b>${brl0(p.v)}</b></button>`; }).join('')}</div>
    <div class="row" style="margin-top:8px"><button class="btn" id="abcVerA">Ver todos os ${topA.length} da curva A</button></div>
  </div>`;
}

/* ===================== Grupos de produtos (kg) =====================
   O mesmo corte vendido em códigos diferentes (a granel, bandeja, vácuo, congelado) é analisado junto. */
async function carregarGrupos(forcar){
  if(!forcar && S._grupos && Date.now()-S._gruposEm<5*60*1000) return S._grupos;
  S._grupos=await q(S.sb.from('grupos_produto').select('id,setor_id,nome,codigos,descricoes').order('nome')); S._gruposEm=Date.now(); return S._grupos;
}
function agruparAnalise(an, grupos){
  if(!an || !an.dados || !grupos.length) return an;
  const deC=new Map(); grupos.forEach(g=>g.codigos.forEach(c=>deC.set(String(c),g)));
  const deps=an.dados.departamentos.map(d=>({...d, produtos:[...d.produtos]})); const junt=new Map();
  for(const d of deps){ d.produtos=d.produtos.filter(p=>{ const g=deC.get(String(p.c)); if(!g) return true;
      let j=junt.get(g.id); if(!j){ j={g, itens:[], dep:d, vDep:-1}; junt.set(g.id,j); } j.itens.push(p); if((+p.v||0)>j.vDep){ j.vDep=+p.v||0; j.dep=d; } return false; }); }
  for(const j of junt.values()){ const ps=j.itens, v=ps.reduce((a,p)=>a+(+p.v||0),0), q=ps.reduce((a,p)=>a+(+p.q||0),0);
    const cm=ps.filter(p=>p.m!=null&&(+p.v||0)>0), vm=cm.reduce((a,p)=>a+(+p.v||0),0);
    j.dep.produtos.push({ c:'G'+j.g.id, d:nomeGrupo(j.g.nome), q:round2(q), v:round2(v), m: vm? Math.round(cm.reduce((a,p)=>a+p.m*(+p.v||0),0)/vm*100)/100 : null,
      mt: Math.max(0,...ps.map(p=>+p.mt||0)), z: ps.some(p=>p.z), grupo: ps.map(p=>({c:p.c, d:p.d, q:+p.q||0, v:+p.v||0})) }); }
  return {...an, dados:{...an.dados, departamentos:deps.filter(d=>d.produtos.length)}};
}
function nomeGrupo(n){ return String(n||''); }

/* tela do gerente: ver, criar e apagar grupos */
async function cardGruposProduto(app){
  if(!S.gerente) return; const box=document.createElement('div'); box.className='card'; box.style.marginTop='12px'; app.appendChild(box);
  const desenhar=async()=>{
    let gs; try{ gs=await carregarGrupos(true); }catch(e){ box.innerHTML=`<div class="note err">Grupos: ${esc(e.message)}</div>`; return; }
    const porS={}; gs.forEach(g=>(porS[g.setor_id]=porS[g.setor_id]||[]).push(g));
    box.innerHTML=`<details><summary style="cursor:pointer"><h2 style="display:inline;margin:0">🔗 Produtos analisados juntos (kg)</h2> <span class="small muted">${gs.length} grupo(s)</span></summary>
      <p class="small muted" style="margin:8px 0">O mesmo produto de quilo vendido em códigos diferentes (a granel, bandeja, vácuo, congelado) entra junto na Análise de vendas, na Curva ABC e na Ruptura. Assim, quando a venda só muda de um código para o outro, não aparece como queda nem ruptura.</p>
      ${Object.entries(porS).map(([sid,ls])=>`<div style="margin-top:8px"><b>${esc(nomeSetor(sid))}</b>
        <div class="grp-l">${ls.map(g=>`<div class="grp-i"><div><b>${esc(g.nome)}</b><div class="small muted">${(g.descricoes||g.codigos).map((d,i)=>`${esc(d)} <span class="muted">(${esc(g.codigos[i])})</span>`).join(' + ')}</div></div><button class="btn" data-del="${g.id}" title="Separar de novo" aria-label="Separar ${esc(g.nome)}">✕</button></div>`).join('')}</div></div>`).join('')}
      <div class="grp-novo" style="margin-top:12px"><b>Juntar outros produtos</b>
        <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px">
          <select id="grpSet" style="border:1px solid var(--line);border-radius:9px;padding:7px">${S.setoresAll.map(x=>`<option value="${x.id}">${esc(x.nome)}</option>`).join('')}</select>
          <input id="grpNome" placeholder="Nome (ex.: Alcatra (granel e bandeja))" style="border:1px solid var(--line);border-radius:9px;padding:7px;flex:1;min-width:160px">
          <input id="grpCods" placeholder="Códigos separados por vírgula (ex.: 1434, 9569)" style="border:1px solid var(--line);border-radius:9px;padding:7px;flex:2;min-width:200px">
          <button class="btn p" id="grpAdd">Juntar</button></div></div></details>`;
    if(S._grpAberto) box.querySelector('details').open=true;
    box.querySelector('details').ontoggle=e=>{ S._grpAberto=e.target.open; };
    box.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>confirmBox('Separar esse grupo? Os códigos voltam a ser analisados um por um.', async()=>{ try{ await q(S.sb.from('grupos_produto').delete().eq('id',+b.dataset.del)); toast('Grupo separado'); desenhar(); }catch(e){ toast(e.message,5000); } }));
    $('#grpAdd',box).onclick=async()=>{ const setor=$('#grpSet',box).value, nome=$('#grpNome',box).value.trim(), cods=[...new Set($('#grpCods',box).value.split(/[^0-9]+/).filter(Boolean))];
      if(!nome || cods.length<2) return toast('Digite um nome e pelo menos 2 códigos',4000);
      const descr=[]; for(const c of cods){ let d=c; try{ const r=await q(S.sb.rpc('buscar_produto',{termo:c, lim:5})); const x=(r||[]).find(y=>String(y.c)===c); if(x) d=x.d; }catch(_){ } descr.push(d); }
      try{ await q(S.sb.from('grupos_produto').insert({setor_id:setor, nome, codigos:cods, descricoes:descr})); toast('Produtos juntados ✔'); S._grpAberto=true; desenhar(); }catch(e){ toast('Não foi possível juntar: '+e.message,5000); } };
  };
  desenhar();
}

function codProd(p){ return p&&p.grupo ? p.grupo.map(g=>g.c).join(' - ') : String(p?.c??''); }

/* nome do subgrupo como aparece no site (o nome no sistema não muda) */
async function carregarNomesDep(){ if(S._nomesDep && Date.now()-S._nomesDepEm<5*60*1000) return S._nomesDep;
  const r=await q(S.sb.from('configuracoes').select('valor').eq('chave','nomes_departamento')); S._nomesDep=(r[0]&&r[0].valor)||{}; S._nomesDepEm=Date.now(); return S._nomesDep; }
function renomearDeps(an, sid, nm){ if(!an||!an.dados||!nm||!Object.keys(nm).length) return an;
  const norm=t=>String(t||'').toUpperCase().replace(/\s+/g,' ').trim();
  return {...an, dados:{...an.dados, departamentos:an.dados.departamentos.map(d=>{ const k=`${sid}|${d.codigo}|${norm(d.nome)}`; return nm[k]? {...d, nome:nm[k], nomeSistema:d.nome} : d; })}}; }

/* códigos de um grupo, com a base de comparação de cada um */
function membrosGrupo(p){ const m=new Map();
  for(const g of (p.grupo||[])) m.set(String(g.c),{c:g.c,d:g.d,q:g.q,v:g.v,qb:null,vb:null});
  for(const g of (p.grupoB||[])){ const x=m.get(String(g.c))||{c:g.c,d:g.d,q:0,v:0}; x.qb=g.q; x.vb=g.v; m.set(String(g.c),x); }
  if(p.qb!=null) for(const x of m.values()){ if(x.qb==null){ x.qb=0; x.vb=0; } }
  return [...m.values()].sort((a,b)=>(b.v||0)-(a.v||0)||(b.vb||0)-(a.vb||0)); }

/* subgrupo que mistura produto a quilo (KG na descrição) com unidade/pacote (1KG, 800G, IQF...) vira duas linhas */
const ehAQuilo = p => !!p.grupo || /(^|\s)KG(\s|$)/i.test(p.d||'');
function depsMistos(ans){ const k=new Set(), p=new Set();
  for(const an of ans){ if(!an||!an.dados) continue; for(const d of an.dados.departamentos) for(const x of d.produtos) (ehAQuilo(x)?k:p).add(d.codigo); }
  return new Set([...k].filter(c=>p.has(c))); }
const SETORES_PESO=new Set(['acougue','hortifruti','pereciveis','padaria','panif_terc']);
function separarKgPacote(an, mistos, rotularTodos){
  if(!an || !an.dados || ((!mistos || !mistos.size) && !rotularTodos)) return an; const out=[];
  for(const d of an.dados.departamentos){
    if(!mistos || !mistos.has(d.codigo)){ if(rotularTodos && d.produtos.length){ const tk=d.produtos.every(ehAQuilo), tp=d.produtos.every(p=>!ehAQuilo(p)); out.push(tk?{...d, suf:'(a quilo)'}:tp?{...d, suf:'(unidade/pacote)'}:d); } else out.push(d); continue; }
    const kg=d.produtos.filter(ehAQuilo), pc=d.produtos.filter(p=>!ehAQuilo(p));
    if(kg.length) out.push({...d, codigo:d.codigo*10+1, codOrig:d.codigo, suf:'(a quilo)', produtos:kg});
    if(pc.length) out.push({...d, codigo:d.codigo*10+2, codOrig:d.codigo, suf:'(unidade/pacote)', produtos:pc});
  }
  return {...an, dados:{...an.dados, departamentos:out}};
}
