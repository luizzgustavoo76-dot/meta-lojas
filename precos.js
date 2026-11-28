/* ===================== Pesquisa de preço do concorrente =====================
   Lê o "RELATORIO DA PESQUISA DE PRECOS" do sistema, cruza com a venda do mês
   e mostra onde estamos perdendo (mais caros) e as oportunidades de margem. */

const PP = { caroMin:0.03, oportMin:0.10, folga:0.10 };   // 3% mais caro = alerta · 10% mais barato = oportunidade · sugerir R$ 0,10 abaixo do concorrente

async function importarPesquisaPrecos(f, pre){
  busy('Lendo a pesquisa de preços…'); let r=pre||null;
  try{ if(!r) r=Parser.analisarPesquisaPrecos(await linhasDoArquivo(f)); }catch(e){ closeModal(); toast('Não consegui ler o arquivo: '+e.message, 6000); return null; }
  closeModal();
  if(!r){ toast('Esse arquivo não parece o “Relatório da pesquisa de preços” do sistema.', 6000); return null; }
  const comC=r.itens.filter(i=>i.cad>0 && i.conc.some(Boolean)).length;
  return await new Promise(res=>{
    const m=modal(`<h2>💲 Pesquisa de preços nº ${r.numero??'—'}</h2>
      <div class="grid kpis" style="margin:8px 0">
        <div class="kpi"><div class="l">Realizada</div><div class="v" style="font-size:20px">${fD(r.periodo.ini)}${r.periodo.fim!==r.periodo.ini?' a '+fD(r.periodo.fim):''}</div><div class="d">concorrentes: ${r.concorrentes.map(nomeConc).join(', ')}</div></div>
        <div class="kpi"><div class="l">Produtos</div><div class="v" style="font-size:20px">${r.itens.length}</div><div class="d">${comC} com o nosso preço e o do concorrente</div></div>
      </div>
      <p class="small muted">A pesquisa fica guardada no site. A análise cruza com a venda do mês de cada produto.</p>
      <div class="row" style="margin-top:12px"><div class="sp"></div><button class="btn" id="mN">Cancelar</button><button class="btn p" id="mY">Salvar pesquisa</button></div>`);
    $('#mN',m).onclick=()=>{ closeModal(); res(null); };
    $('#mY',m).onclick=async()=>{ $('#mY',m).disabled=true; $('#mY',m).textContent='Salvando…';
      try{ await q(S.sb.from('pesquisas_preco').upsert({ numero:r.numero, periodo_inicio:r.periodo.ini, periodo_fim:r.periodo.fim||r.periodo.ini||todayIso(), concorrentes:r.concorrentes, itens:r.itens, arquivo_nome:f.name }, {onConflict:'numero,periodo_fim'}));
        S._ppSel=null; S._ppCache=null; closeModal(); toast('Pesquisa salva ✔'); res(true); if(S.view==='precos') render(); }
      catch(e){ toast('Não consegui salvar: '+(e.message||e), 6000); $('#mY',m).disabled=false; $('#mY',m).textContent='Salvar pesquisa'; } };
  });
}
function nomeConc(n){ const k=String(n||'').toUpperCase(); return ({MOSOLI:'Mosoli', TRADIC:'Tradição', TRAD:'Tradição'})[k] || cap1(String(n||'').toLowerCase()); }

/* monta a análise de uma pesquisa (concorrente: índice ou 'min' = o menor entre eles) */
function analisarPesquisa(P, vendas, prodSetor, conc){
  const V=new Map(vendas.map(x=>[String(x.c),x])), dias=Math.max(1,...vendas.map(x=>x.dias||1));
  const ls=[];
  for(const it of P.itens){
    const cs=it.conc.map((x,i)=>x? {...x, nome:nomeConc(P.concorrentes[i]), i} : null).filter(Boolean);
    const alvo = conc==='min' ? cs.filter(x=>x.p>0).sort((a,b)=>a.p-b.p)[0] : cs.find(x=>x.i===+conc && x.p>0);
    const v=V.get(String(it.c)); const setor=v?.setor_id || prodSetor.get(String(it.c)) || '';
    const qMes = v? (+v.q||0)/dias*30 : 0, vMes = v? (+v.v||0)/dias*30 : 0;
    /* nosso preço = VDA.CAD (venda cadastrada desta loja). A coluna VENDA do relatório é da filial 18 (matriz) e é ignorada,
       e a margem atual (MG.AP.) que vem no relatório também é calculada sobre ela, por isso é refeita aqui com o VDA.CAD */
    const cad=it.cad>0? it.cad : null;
    const x={ ...it, setor, alvo, qMes, vMes, nosso: cad, vendaMatriz: it.venda, mgAtual: cad && it.custo>0? (cad/it.custo-1)*100 : null };
    if(x.nosso && alvo){ x.dif=x.nosso/alvo.p-1; x.margemIgual = it.custo>0? (alvo.p/it.custo-1)*100 : null; }
    ls.push(x);
  }
  const comp=ls.filter(x=>x.dif!=null);
  const pond=comp.filter(x=>x.qMes>0); const sN=pond.reduce((a,x)=>a+x.nosso*x.qMes,0), sC=pond.reduce((a,x)=>a+x.alvo.p*x.qMes,0);
  const indice = sC? sN/sC*100 : (comp.length? comp.reduce((a,x)=>a+(1+x.dif),0)/comp.length*100 : null);
  const caros=comp.filter(x=>x.dif>=PP.caroMin).map(x=>({...x, impacto:x.vMes*x.dif/(1+x.dif)})).sort((a,b)=>(b.impacto-a.impacto)||(b.dif-a.dif));
  const baratos=comp.filter(x=>x.dif<=-PP.oportMin && !x.alvo.promo).map(x=>{ const sug=Math.max(x.nosso, Math.round((x.alvo.p-PP.folga)*100)/100); return {...x, sug, ganho:(sug-x.nosso)*x.qMes}; }).filter(x=>x.sug>x.nosso).sort((a,b)=>(b.ganho-a.ganho)||(a.dif-b.dif));
  const iguais=comp.filter(x=>x.dif>-PP.caroMin && x.dif<PP.caroMin);
  const promo=ls.filter(x=>x.nosso && x.conc.some(c=>c&&c.promo)).map(x=>({...x, cp:x.conc.map((c,i)=>c&&c.promo?{...c,nome:nomeConc(P.concorrentes[i])}:null).filter(Boolean)[0]})).sort((a,b)=>b.vMes-a.vMes);
  const margBaixa=ls.filter(x=>x.nosso && x.custo>0 && x.mgAlvo!=null && x.mgAtual!=null && x.mgAtual<x.mgAlvo-0.5).sort((a,b)=>b.vMes-a.vMes);
  const abaixoCusto=ls.filter(x=>x.nosso && x.custo>0 && x.nosso<x.custo).sort((a,b)=>b.vMes-a.vMes);
  const semPreco=ls.filter(x=>!x.nosso), semCusto=ls.filter(x=>x.nosso && !(x.custo>0));
  return { ls, comp, indice, caros, baratos, iguais, promo, margBaixa, abaixoCusto, semPreco, semCusto, dias,
    perdeuMes: caros.reduce((a,x)=>a+x.vMes,0), ganhoMes: baratos.reduce((a,x)=>a+x.ganho,0) };
}

// venda do mês por produto: o banco devolve no máximo 1.000 linhas por vez, então busca em páginas (são ~7.500 produtos)
async function vendasProdutoMes(){ const out=[]; for(let i=0;;i+=1000){ const pg=await q(S.sb.rpc('vendas_produto_mes',{p_ref:todayIso()}).range(i,i+999)); out.push(...(pg||[])); if(!pg||pg.length<1000) break; } return out; }

async function renderPrecos(app){
  if(!S.gerente){ app.innerHTML='<div class="card empty">Só o gerente vê a pesquisa de preço.</div>'; return; }
  app.innerHTML=`<div class="row" style="align-items:flex-end;margin-bottom:12px;gap:8px;flex-wrap:wrap"><div><h1>💲 Pesquisa de preço</h1><p class="sub" style="margin:0">Nosso preço contra o concorrente, cruzado com a venda do mês: onde estamos perdendo e onde dá para ganhar margem.</p></div><div class="sp"></div><span id="ppSelBox"></span>${botaoImportarVarios('bVP')}</div><div id="ppBox"><div class="empty"><span class="spin"></span> Carregando…</div></div>`;
  ligarImportarVarios('bVP');
  const box=$('#ppBox'), vivo=()=>S.view==='precos' && box.isConnected;
  let lista=[]; try{ lista=await q(S.sb.from('pesquisas_preco').select('id,numero,periodo_inicio,periodo_fim,concorrentes').order('periodo_fim',{ascending:false}).order('numero',{ascending:false}).limit(60)); }
  catch(e){ box.innerHTML=`<div class="note err">Erro: ${esc(e.message)}</div>`; return; }
  if(!vivo()) return;
  if(!lista.length){ box.innerHTML=`<div class="card empty"><h2>Nenhuma pesquisa ainda</h2><p>Importe o <b>Relatório da pesquisa de preços</b> do sistema (PDF) pelo botão 📥 Importar relatórios.</p></div>`; return; }
  if(!lista.some(x=>x.id===S._ppSel)) S._ppSel=lista[0].id;
  $('#ppSelBox').innerHTML=`<label class="f" style="margin:0">Pesquisa<select id="ppSel">${lista.map(x=>`<option value="${x.id}" ${x.id===S._ppSel?'selected':''}>nº ${x.numero??'—'} · ${fD(x.periodo_fim)}</option>`).join('')}</select></label>`;
  $('#ppSel').onchange=e=>{ S._ppSel=+e.target.value; renderPrecos(app); };
  let P, ant=null, vendas=[], prodSetor=new Map();
  try{
    const i=lista.findIndex(x=>x.id===S._ppSel);
    [P, ant, vendas]=await Promise.all([
      q(S.sb.from('pesquisas_preco').select('*').eq('id',S._ppSel)).then(r=>r[0]),
      lista[i+1]? q(S.sb.from('pesquisas_preco').select('*').eq('id',lista[i+1].id)).then(r=>r[0]) : null,
      vendasProdutoMes().catch(()=>[]) ]);
    for(let k=0;;k+=1000){ const pg=await q(S.sb.from('produtos_setor').select('codigo,setor_id').range(k,k+999)); (pg||[]).forEach(x=>prodSetor.set(String(x.codigo),x.setor_id)); if(!pg||pg.length<1000) break; }
  }catch(e){ box.innerHTML=`<div class="note err">Erro: ${esc(e.message)}</div>`; return; }
  if(!vivo()) return;
  S.ppConc = S.ppConc ?? 'min';
  // curva ABC pela venda do mês (da loja toda ou do setor escolhido): A = 80% da venda, B = até 95%, C = o resto
  const vAgg=new Map(); for(const v of (vendas||[])){ const k=String(v.c); const o=vAgg.get(k)||{c:k, d:v.d||'', v:0, q:0, setor:v.setor_id, vs:0}; o.v+=+v.v||0; o.q+=+v.q||0; if((+v.v||0)>o.vs){ o.vs=+v.v||0; o.setor=v.setor_id; } vAgg.set(k,o); }
  const diasV=Math.max(1,...(vendas||[]).map(x=>x.dias||1));
  // a pesquisa ainda não pega produto de quilo: a curva é feita só com os de unidade
  const ehQuilo=x=>/(^|\s)KG(\s|$)/i.test(x.d||'') || Math.abs((+x.q||0)-Math.round(+x.q||0))>0.001;
  const baseCurva=[...vAgg.values()].filter(x=>x.v>0 && !ehQuilo(x) && (!S.ppSet || x.setor===S.ppSet)).sort((a,b)=>b.v-a.v);
  const totV=baseCurva.reduce((a,x)=>a+x.v,0); let acum=0; const curva=new Map();
  baseCurva.forEach((x,i)=>{ acum+=x.v; x.rank=i+1; x.cv = acum<=totV*0.80 || i===0 ? 'A' : acum<=totV*0.95 ? 'B' : 'C'; x.vMes=x.v/diasV*30; curva.set(x.c,x); });
  for(const it of P.itens){ const cc=curva.get(String(it.c)); it.cv=cc?.cv||null; it.rank=cc?.rank||null; } // a etiqueta da curva vai junto para todas as listas
  const A0=analisarPesquisa(P, vendas, prodSetor, S.ppConc);
  const setoresP=[...new Set(A0.ls.filter(x=>x.nosso).map(x=>x.setor).filter(Boolean))].sort((a,b)=>nomeSetor(a).localeCompare(nomeSetor(b)));
  if(S.ppSet && !setoresP.includes(S.ppSet)) S.ppSet=null;
  const filtra=A=>{ if(!S.ppSet && !S.ppSoA) return A; const f=arr=>arr.filter(x=>(!S.ppSet || x.setor===S.ppSet) && (!S.ppSoA || x.cv==='A')); const B={...A}; for(const k of ['ls','comp','caros','baratos','iguais','promo','margBaixa','abaixoCusto','semPreco','semCusto']) B[k]=f(A[k]);
    const pond=B.comp.filter(x=>x.qMes>0), sN=pond.reduce((a,x)=>a+x.nosso*x.qMes,0), sC=pond.reduce((a,x)=>a+x.alvo.p*x.qMes,0); B.indice=sC? sN/sC*100 : (B.comp.length? B.comp.reduce((a,x)=>a+(1+x.dif),0)/B.comp.length*100 : null);
    B.perdeuMes=B.caros.reduce((a,x)=>a+x.vMes,0); B.ganhoMes=B.baratos.reduce((a,x)=>a+x.ganho,0); return B; };
  const A=filtra(A0);
  // por concorrente (índice) e contra a pesquisa anterior
  const porConc=P.concorrentes.map((n,i)=>{ const B=filtra(analisarPesquisa(P, vendas, prodSetor, i)); return {n:nomeConc(n), i, indice:B.indice, n2:B.comp.length, caros:B.caros.length, baratos:B.comp.filter(x=>x.dif<=-PP.caroMin).length}; });
  let mud=[]; if(ant){ const am=new Map(ant.itens.map(x=>[String(x.c),x]));
    for(const x of A.ls){ const o=am.get(String(x.c)); if(!o) continue; x.conc.forEach((c,i)=>{ const oc=o.conc[i]; if(c&&oc&&c.p>0&&oc.p>0&&Math.abs(c.p/oc.p-1)>=0.05) mud.push({x, nome:nomeConc(P.concorrentes[i]), de:oc.p, para:c.p}); }); }
    mud.sort((a,b)=>b.x.vMes-a.x.vMes); }
  const idxTxt=v=> v==null? '—' : (v>=100? `${pctBR(v/100-1,1)} mais caros` : `${pctBR(1-v/100,1)} mais baratos`);
  const idxCor=v=> v==null? '' : v>102? 'var(--bad)' : v<98? 'var(--good)' : 'var(--ink)';
  const pr=v=>v==null?'—':brl(v), pp=v=>`${v>=0?'+':'−'}${pctBR(Math.abs(v),1)}`;
  const cod=x=>`<span class="small muted">${esc(String(x.c))}</span>`;
  const concTxt=x=>x.alvo? `${esc(x.alvo.nome)} ${pr(x.alvo.p)}${x.alvo.promo?' <span class="pp-promo">promoção</span>':''}` : '—';
  const todosConc=x=>{ const cs=(x.conc||[]).map((c,i)=>c&&c.p>0?{...c,nome:nomeConc(P.concorrentes[i]),i}:null).filter(Boolean);
    const lst=cs.map(c=>{ const eAlvo=x.alvo&&c.i===x.alvo.i; return `${eAlvo?'<b>':''}${esc(c.nome)} ${pr(c.p)}${eAlvo?'</b>':''}${c.promo?' <span class="pp-promo">promoção</span>':''}`; }).concat(P.concorrentes.map((n,i)=>cs.some(c=>c.i===i)?null:`<span class="muted">${esc(nomeConc(n))} não pesquisado</span>`).filter(Boolean)).join(' · ');
    const sp=cs.filter(c=>!c.promo); let media='';
    if(sp.length>1){ const m=Math.round(sp.reduce((a,c)=>a+c.p,0)/sp.length*100)/100, mg=x.custo>0?(m/x.custo-1)*100:null;
      media=`<div class="small">média dos concorrentes <b>${pr(m)}</b>${mg!=null?` · no meio a margem fica <b style="color:${x.mgAlvo!=null&&mg<x.mgAlvo?'var(--bad)':'var(--good)'}">${mg.toFixed(1).replace('.',',')}%</b>${x.mgAlvo!=null?` (alvo ${x.mgAlvo.toFixed(0)}%)`:''}`:''}</div>`; }
    return {lst: lst||'—', media}; };
  const veredito=x=>{ if(x.custo>0 && x.alvo && x.alvo.p<x.custo) return '<span class="pp-v bad">⛔ concorrente abaixo do nosso custo</span>';
    if(x.margemIgual!=null && x.mgAlvo!=null && x.margemIgual>=x.mgAlvo) return `<span class="pp-v good">✅ dá para igualar: margem fica ${x.margemIgual.toFixed(1).replace('.',',')}% (alvo ${x.mgAlvo.toFixed(0)}%)</span>`;
    if(x.margemIgual!=null) return `<span class="pp-v warn">⚠️ igualar deixa a margem em ${x.margemIgual.toFixed(1).replace('.',',')}% (alvo ${x.mgAlvo!=null?x.mgAlvo.toFixed(0)+'%':'—'})</span>`; return ''; };
  const mostrar=(arr,n,fn,id)=>`<div class="pp-l" id="${id}">${arr.slice(0,n).map(fn).join('')||'<div class="small muted" style="padding:6px 0">nada por aqui ✔</div>'}</div>${arr.length>n?`<div class="row pp-mbt" data-mbox="${id}" data-n="${n}" style="margin-top:8px;gap:8px;flex-wrap:wrap"><button class="btn" data-mais="${id}">Ver mais ${Math.min((S.ppVista&&S.ppVista!=="resumo")?30:10,arr.length-n)} de ${arr.length-n}</button><button class="btn" data-todos="${id}">Ver todos (${arr.length})</button></div>`:''}`;
  const itCaro=x=>`<div class="pp-i"><div class="pp-p">${cod(x)} <b>${esc(cap1(x.d))}</b>${x.cv==='A'?' <span class="pp-promo">⭐ curva A</span>':''}${x.setor?` <span class="small muted">· ${esc(nomeSetor(x.setor))}</span>`:''}<div class="small">nosso <b>${pr(x.nosso)}</b> · venda ${x.vMes?brl0(x.vMes)+'/mês':'sem venda no mês'}</div><div class="small">${todosConc(x).lst}</div>${todosConc(x).media}${veredito(x)}</div><div class="pp-n"><b style="color:var(--bad)">${pp(x.dif)}</b><span class="small muted">mais caro</span></div></div>`;
  const itBar=x=>`<div class="pp-i"><div class="pp-p">${cod(x)} <b>${esc(cap1(x.d))}</b>${x.cv==='A'?' <span class="pp-promo">⭐ curva A</span>':''}${x.setor?` <span class="small muted">· ${esc(nomeSetor(x.setor))}</span>`:''}<div class="small">nosso <b>${pr(x.nosso)}</b> · ${pp(x.dif)}</div><div class="small">${todosConc(x).lst}</div>${todosConc(x).media}<div class="small">sugestão <b>${pr(x.sug)}</b> (ainda abaixo do concorrente)${x.ganho>0?` · ganha <b style="color:var(--good)">${brl0(x.ganho)}/mês</b> no volume atual`:''}</div></div><div class="pp-n"><b style="color:var(--good)">+${brl(x.sug-x.nosso)}</b><span class="small muted">por unidade</span></div></div>`;
  const itPromo=x=>`<div class="pp-i"><div class="pp-p">${cod(x)} <b>${esc(cap1(x.d))}</b><div class="small">${esc(x.cp.nome)} em promoção a <b>${pr(x.cp.p)}</b> · nosso ${pr(x.nosso)}${x.custo>0?` · nosso custo ${pr(x.custo)}`:''}</div></div><div class="pp-n"><b>${pp(x.nosso/x.cp.p-1)}</b><span class="small muted">${x.vMes?brl0(x.vMes)+'/mês':''}</span></div></div>`;
  const itMarg=x=>`<div class="pp-i"><div class="pp-p">${cod(x)} <b>${esc(cap1(x.d))}</b><div class="small">preço ${pr(x.nosso)} · custo ${pr(x.custo)} · margem <b style="color:var(--bad)">${x.mgAtual.toFixed(1).replace('.',',')}%</b> (alvo ${x.mgAlvo.toFixed(0)}%)</div></div><div class="pp-n"><b>${x.vMes?brl0(x.vMes):'—'}</b><span class="small muted">venda/mês</span></div></div>`;
  const itMud=m=>`<div class="pp-i"><div class="pp-p">${cod(m.x)} <b>${esc(cap1(m.x.d))}</b><div class="small">${esc(m.nome)}: ${pr(m.de)} → <b>${pr(m.para)}</b> · nosso ${pr(m.x.nosso)}</div></div><div class="pp-n"><b style="color:${m.para<m.de?'var(--bad)':'var(--good)'}">${m.para<m.de?'▼':'▲'} ${pctBR(Math.abs(m.para/m.de-1),0)}</b></div></div>`;
  // por setor
  const porSet=setoresP.map(sid=>{ const c=A0.comp.filter(x=>x.setor===sid), pond=c.filter(x=>x.qMes>0), sN=pond.reduce((a,x)=>a+x.nosso*x.qMes,0), sC=pond.reduce((a,x)=>a+x.alvo.p*x.qMes,0);
    return {sid, n:c.length, idx: sC? sN/sC*100 : (c.length? c.reduce((a,x)=>a+(1+x.dif),0)/c.length*100 : null), caros:A0.caros.filter(x=>x.setor===sid).length, baratos:A0.baratos.filter(x=>x.setor===sid).length, perde:A0.caros.filter(x=>x.setor===sid).reduce((a,x)=>a+x.vMes,0)}; }).filter(x=>x.n).sort((a,b)=>(b.idx||0)-(a.idx||0));
  const chips=`<div class="tl-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px"><button class="chip ${S.ppSoA?'on':''}" data-ppsoa="1" title="Liga/desliga: analisar só os produtos da curva A">${S.ppSoA?'✔ ':''}⭐ Só curva A</button><span style="width:8px"></span><button class="chip ${!S.ppSet?'on':''}" data-ppset="">🏪 Geral</button>${setoresP.map(s=>`<button class="chip ${S.ppSet===s?'on':''}" data-ppset="${s}">${esc(nomeSetor(s))}</button>`).join('')}</div>
    <div class="tl-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px"><span class="small muted" style="align-self:center">comparar com:</span><button class="chip ${S.ppConc==='min'?'on':''}" data-ppc="min">o mais barato</button>${P.concorrentes.map((n,i)=>`<button class="chip ${String(S.ppConc)===String(i)?'on':''}" data-ppc="${i}">${esc(nomeConc(n))}</button>`).join('')}</div>`;
  box.innerHTML=`${chips}
    <div class="grid kpis">
      <div class="kpi hero"><div class="l">Nosso preço contra ${S.ppConc==='min'?'o concorrente mais barato':esc(nomeConc(P.concorrentes[S.ppConc]))}</div><div class="v" style="color:${A.indice>102?'#ff8a8a':A.indice<98?'#9be7b0':'#fff'}">${A.indice!=null?A.indice.toFixed(1).replace('.',','):'—'}</div><div class="d">${idxTxt(A.indice)} · pesando pela venda do mês (100 = igual)</div></div>
      <div class="kpi click" data-ppvk="caros" title="Abrir a lista"><div class="l">🔴 Onde estou perdendo ›</div><div class="v" style="color:var(--bad)">${A.caros.length}</div><div class="d">produtos ${pctBR(PP.caroMin,0)} ou mais caros · vendem ${brl0(A.perdeuMes)}/mês</div></div>
      <div class="kpi click" data-ppvk="baratos" title="Abrir a lista"><div class="l">🟢 Oportunidade de margem ›</div><div class="v" style="color:var(--good)">${brl0(A.ganhoMes)}/mês</div><div class="d">${A.baratos.length} produtos ${pctBR(PP.oportMin,0)} ou mais baratos que o concorrente</div></div>
      <div class="kpi"><div class="l">Comparados</div><div class="v">${A.comp.length}</div><div class="d">${A.iguais.length} no mesmo preço (±${pctBR(PP.caroMin,0)}) · pesquisa nº ${P.numero??'—'} de ${fD(P.periodo_fim)}</div></div>
      ${porConc.length>1?porConc.map(c=>`<div class="kpi"><div class="l">Contra ${esc(c.n)}</div><div class="v" style="font-size:22px;color:${idxCor(c.indice)}">${c.indice!=null?c.indice.toFixed(1).replace('.',','):'—'}</div><div class="d">${idxTxt(c.indice)} · ${c.n2} produtos · mais caros em ${c.caros}</div></div>`).join(''):''}
    </div>
    `;
  const listaMarg=[...A.abaixoCusto, ...A.margBaixa.filter(x=>!A.abaixoCusto.includes(x))];
  const S_CV=S.ppCurva||'A';
  const daCurva=baseCurva.filter(x=>x.cv===S_CV), pesqSet=new Set(A.ls.filter(x=>x.nosso).map(x=>String(x.c)));
  const curvaPesq=A.ls.filter(x=>x.cv===S_CV && x.nosso).sort((a,b)=>(a.rank||1e9)-(b.rank||1e9));
  const curvaNao=daCurva.filter(x=>!pesqSet.has(x.c));
  const cvComp=curvaPesq.filter(x=>x.dif!=null), cvPond=cvComp.filter(x=>x.qMes>0);
  const cvIdx = cvPond.length? cvPond.reduce((a,x)=>a+x.nosso*x.qMes,0)/cvPond.reduce((a,x)=>a+x.alvo.p*x.qMes,0)*100 : null;
  const vendaCurva=daCurva.reduce((a,x)=>a+x.v,0), vendaPesq=curvaPesq.reduce((a,x)=>a+(curva.get(String(x.c))?.v||0),0);
  const itCv=x=>{ const st = x.dif==null ? '<span class="small muted">sem preço do concorrente</span>' : x.dif>=PP.caroMin ? `<b style="color:var(--bad)">${pp(x.dif)}</b><span class="small muted">mais caro</span>` : x.dif<=-PP.caroMin ? `<b style="color:var(--good)">${pp(x.dif)}</b><span class="small muted">mais barato</span>` : `<b>${pp(x.dif)}</b><span class="small muted">igual</span>`;
    return `<div class="pp-i"><div class="pp-p"><span class="pp-promo">#${x.rank}</span> ${cod(x)} <b>${esc(cap1(x.d))}</b>${x.setor?` <span class="small muted">· ${esc(nomeSetor(x.setor))}</span>`:''}<div class="small">nosso <b>${pr(x.nosso)}</b> · venda ${x.vMes?brl0(x.vMes)+'/mês':'—'}</div><div class="small">${todosConc(x).lst}</div>${todosConc(x).media}${x.dif>=PP.caroMin?veredito(x):''}</div><div class="pp-n">${st}</div></div>`; };
  const itCvN=x=>`<div class="pp-i"><div class="pp-p"><span class="pp-promo">#${x.rank}</span> <span class="small muted">${esc(x.c)}</span> <b>${esc(cap1(x.d||'produto '+x.c))}</b>${x.setor?` <span class="small muted">· ${esc(nomeSetor(x.setor))}</span>`:''}</div><div class="pp-n"><b>${brl0(x.vMes)}</b><span class="small muted">venda/mês</span></div></div>`;
  const C={
    curva: n=>`<div class="card"><div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><h2 style="margin:0">⭐ Curva ${S_CV}: os produtos que mais vendem${S.ppSet?' em '+esc(nomeSetor(S.ppSet)):' na loja'}</h2><div class="sp"></div><span class="tl-chips" style="display:flex;gap:6px">${['A','B','C'].map(k=>`<button class="chip ${S_CV===k?'on':''}" data-ppcv="${k}">Curva ${k}</button>`).join('')}</span></div>
      <div class="grid kpis" style="margin-top:10px">
        <div class="kpi"><div class="l">Produtos da curva ${S_CV}</div><div class="v">${daCurva.length}</div><div class="d">${totV?pctBR(vendaCurva/totV,0):'—'} da venda de unidade${S.ppSet?' do setor':' da loja'}</div></div>
        <div class="kpi"><div class="l">Pesquisados</div><div class="v">${curvaPesq.length}</div><div class="d">${daCurva.length?pctBR(curvaPesq.length/daCurva.length,0):'—'} dos produtos · ${vendaCurva?pctBR(vendaPesq/vendaCurva,0):'—'} da venda da curva</div></div>
        <div class="kpi"><div class="l">Nosso preço na curva ${S_CV}</div><div class="v" style="color:${idxCor(cvIdx)}">${cvIdx==null?'—':cvIdx.toFixed(1).replace('.',',')}</div><div class="d">${idxTxt(cvIdx)} · ${cvComp.filter(x=>x.dif>=PP.caroMin).length} mais caros, ${cvComp.filter(x=>x.dif<=-PP.caroMin).length} mais baratos</div></div>
      </div>
      <p class="small muted" style="margin:10px 0 6px">Do que mais vende para o que menos vende (#1 = o mais vendido do mês). Curva A = os produtos que fazem 80% da venda: são os que o cliente compara. Só produtos de unidade: os de quilo ficam de fora porque a pesquisa ainda não pega.</p>
      ${mostrar(curvaPesq,n,itCv,'ppCv')}
      <details style="margin-top:12px"><summary class="btn" style="display:inline-block">🔍 Ver os ${curvaNao.length} da curva ${S_CV} que não foram pesquisados</summary><p class="small muted" style="margin:8px 0 4px">Esses vendem muito e ficaram fora da pesquisa: vale incluir na próxima.</p>${mostrar(curvaNao,n,itCvN,'ppCvN')}</details></div>`,
    caros: n=>`<div class="card" style="border-color:#f1b5b5"><h2>🚨 Onde estou perdendo <span class="small muted" style="font-weight:400">(${A.caros.length})</span></h2><p class="small muted" style="margin:-4px 0 8px">Mais caros que o concorrente, dos que mais vendem para os que menos vendem. O veredito diz se dá para igualar mantendo a margem alvo.</p>${mostrar(A.caros,n,itCaro,'ppCaros')}</div>`,
    baratos: n=>`<div class="card" style="border-color:#a9d8b8"><h2>💰 Oportunidades de margem <span class="small muted" style="font-weight:400">(${A.baratos.length})</span></h2><p class="small muted" style="margin:-4px 0 8px">Bem mais baratos que o concorrente (sem promoção). A sugestão fica R$ ${PP.folga.toFixed(2).replace('.',',')} abaixo dele: continua mais barato e ganha margem.</p>${mostrar(A.baratos,n,itBar,'ppBar')}</div>`,
    promo: n=>`<div class="card"><h2>🏷️ Concorrente em promoção <span class="small muted" style="font-weight:400">(${A.promo.length})</span></h2><p class="small muted" style="margin:-4px 0 8px">Preço de promoção é passageiro: acompanhe, não precisa igualar.</p>${mostrar(A.promo,n,itPromo,'ppPromo')}</div>`,
    marg: n=>`<div class="card"><h2>📉 Nossa margem abaixo do alvo <span class="small muted" style="font-weight:400">(${A.margBaixa.length})</span></h2><p class="small muted" style="margin:-4px 0 8px">Independente do concorrente: o preço atual dá margem menor que a margem alvo do cadastro.${A.abaixoCusto.length?` <b style="color:var(--bad)">${A.abaixoCusto.length} vendendo abaixo do custo.</b>`:''}</p>${mostrar(listaMarg,n,itMarg,'ppMarg')}</div>`,
    setor: n=>`${!S.ppSet && porSet.length?`<div class="card" style="margin-top:12px"><h2>Por setor</h2><div class="fc-wrap"><table class="fc-t ord"><thead><tr><th>Setor</th><th class="n">Índice</th><th class="n">Comparados</th><th class="n">Mais caros</th><th class="n">Oportunidades</th><th class="n m-hide">Venda dos mais caros</th></tr></thead><tbody>
      ${porSet.map(x=>`<tr class="click" data-ppset="${x.sid}"><td><b>${esc(nomeSetor(x.sid))}</b></td><td class="n"><b style="color:${idxCor(x.idx)}">${x.idx!=null?x.idx.toFixed(1).replace('.',','):'—'}</b></td><td class="n">${x.n}</td><td class="n" style="color:var(--bad)">${x.caros}</td><td class="n" style="color:var(--good)">${x.baratos}</td><td class="n m-hide">${brl0(x.perde)}/mês</td></tr>`).join('')}</tbody></table></div><p class="small muted" style="margin:6px 0 0">Índice: 100 = mesmo preço do concorrente; acima de 100 = mais caro. Toque no setor para filtrar.</p></div>`:''}`,
    mud: n=>`${ant?`<div class="card" style="margin-top:12px"><h2>🔁 O concorrente mudou o preço <span class="small muted" style="font-weight:400">contra a pesquisa nº ${ant.numero??'—'} de ${fD(ant.periodo_fim)} · ${mud.length} produtos</span></h2>${mostrar(mud,n,itMud,'ppMud')}</div>`:''}`,
    cad: n=>`${(A.semPreco.length||A.semCusto.length)?`<div class="card" style="margin-top:12px"><h2>🧹 Para arrumar no cadastro</h2><p class="small" style="margin:0">${A.semPreco.length?`<b>${A.semPreco.length}</b> produto(s) da pesquisa sem preço de venda (muitos com “ZZ” na frente: fora de linha?)`:''}${A.semPreco.length&&A.semCusto.length?' · ':''}${A.semCusto.length?`<b>${A.semCusto.length}</b> sem custo no cadastro`:''}.</p>
      <details style="margin-top:6px"><summary class="small" style="cursor:pointer">ver a lista</summary><div class="small" style="margin-top:6px;columns:2;column-gap:20px">${[...A.semPreco,...A.semCusto].map(x=>`<div>${cod(x)} ${esc(cap1(x.d))}</div>`).join('')}</div></details></div>`:''}`,
    todos: n=>`<div class="card" style="margin-top:12px"><div class="row" style="flex-wrap:wrap;gap:8px"><h2 style="margin:0">Todos os produtos</h2><div class="sp"></div><input id="ppBusca" placeholder="Buscar produto ou código…" style="border:1px solid var(--line);border-radius:10px;padding:7px 10px;min-width:220px"></div>
      <div class="fc-wrap" style="margin-top:8px;max-height:520px;overflow:auto"><table class="fc-t ord"><thead><tr><th>Produto</th><th class="n">Nosso</th>${P.concorrentes.map(n=>`<th class="n">${esc(nomeConc(n))}</th>`).join('')}<th class="n">Dif.</th><th class="n m-hide">Custo</th><th class="n m-hide">Margem</th><th class="n m-hide">Venda/mês</th></tr></thead><tbody id="ppTb"></tbody></table></div></div>` };
  const V=S.ppVista||'resumo', N=V==='resumo'?10:30;
  const vistas=[['resumo','📋 Resumo'],['curva',`⭐ Curva A (${curvaPesq.length&&S_CV==='A'?curvaPesq.length:baseCurva.filter(x=>x.cv==='A'&&pesqSet.has(x.c)).length})`],['caros',`🚨 Onde estou perdendo (${A.caros.length})`],['baratos',`💰 Oportunidades (${A.baratos.length})`],['promo',`🏷️ Em promoção (${A.promo.length})`],['marg',`📉 Margem abaixo do alvo (${listaMarg.length})`],...(ant?[['mud',`🔁 Mudou de preço (${mud.length})`]]:[]),['todos','🔎 Todos os produtos']];
  const chipsVista=`<div class="tl-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 0"><span class="small muted" style="align-self:center">ver:</span>${vistas.map(([k,t])=>`<button class="chip ${V===k?'on':''}" data-ppv="${k}">${t}</button>`).join('')}<span style="flex:1"></span><button class="btn p" id="ppPdf" title="Gera um PDF do que está na tela para compartilhar">📄 PDF desta tela</button></div>`;
  /* ---------- PDF do que está na tela (mesma aba, setor, concorrente e filtro de curva) ---------- */
  const relPrecos=()=>{
    const t=v=>v==null?'':String(v), nm=x=>`${x.c} ${cap1(x.d)}`, pcN=v=>v==null?'—':`${v>=0?'+':'-'}${pctBR(Math.abs(v),1)}`;
    const cN=P.concorrentes.map(nomeConc);
    const precoConc=(x,i)=>{ const c=x.conc?.[i]; return c&&c.p>0? brl(c.p)+(c.promo?' (P)':'') : '—'; };
    const media=x=>{ const sp=(x.conc||[]).filter(c=>c&&c.p>0&&!c.promo); return sp.length>1? brl(sp.reduce((a,c)=>a+c.p,0)/sp.length) : '—'; };
    const mg=v=>v.toFixed(1).replace('.',',')+'%'; const ver=x=>{ if(x.custo>0 && x.alvo && x.alvo.p<x.custo) return 'abaixo do custo'; if(x.margemIgual!=null && x.mgAlvo!=null && x.margemIgual>=x.mgAlvo) return `iguala: mg ${mg(x.margemIgual)}`; if(x.margemIgual!=null) return `mg ${mg(x.margemIgual)} (baixa)`; return 'sem custo'; };
    const colsProd=(ult)=>[['Produto',cN.length>2?100:124,'l'],['Setor',S.ppSet?30:48,'l'],['Nosso',38,'r'],...cN.map(n=>[n.slice(0,9),44,'r']),['Média',38,'r'],['Dif.',38,'r'],['Venda mês',40,'r'],[ult,0,'l']];
    const linha=(x,ult)=>[nm(x), x.setor?nomeSetor(x.setor):'', brl(x.nosso), ...cN.map((_,i)=>precoConc(x,i)), media(x), pcN(x.dif), x.vMes?brl0(x.vMes):'—', ult];
    const sec=(titulo, arr, ultNome, ultFn, vazio)=>({ titulo:`${titulo} (${arr.length})`, cols:colsProd(ultNome), rows:arr.map(x=>linha(x, ultFn(x))), vazio:vazio||'Nada por aqui.' });
    const secoes=[];
    const caros=()=>sec('Onde estou perdendo', A.caros, 'Veredito', ver);
    const bar=()=>sec('Oportunidades de margem', A.baratos, 'Sugestão', x=>`${brl(x.sug)} +${brl0(x.ganho)}`);
    const promo=()=>({ titulo:`Concorrente em promoção (${A.promo.length})`, cols:[['Produto',190,'l'],['Concorrente',70,'l'],['Promoção',50,'r'],['Nosso',50,'r'],['Dif.',40,'r'],['Venda/mês',0,'r']], rows:A.promo.map(x=>[nm(x), x.cp.nome, brl(x.cp.p), brl(x.nosso), pcN(x.nosso/x.cp.p-1), x.vMes?brl0(x.vMes):'—']) });
    const marg=()=>({ titulo:`Margem abaixo do alvo (${listaMarg.length})`, cols:[['Produto',200,'l'],['Preço',50,'r'],['Custo',50,'r'],['Margem',45,'r'],['Alvo',40,'r'],['Venda/mês',0,'r']], rows:listaMarg.map(x=>[nm(x), brl(x.nosso), brl(x.custo), x.mgAtual.toFixed(1).replace('.',',')+'%', x.mgAlvo.toFixed(0)+'%', x.vMes?brl0(x.vMes):'—']) });
    if(V==='resumo'){ secoes.push(caros(), bar(), promo(), marg()); }
    else if(V==='caros') secoes.push(caros());
    else if(V==='baratos') secoes.push(bar());
    else if(V==='promo') secoes.push(promo());
    else if(V==='marg') secoes.push(marg());
    else if(V==='mud') secoes.push({ titulo:`Concorrente mudou de preço (${mud.length})`, cols:[['Produto',200,'l'],['Concorrente',70,'l'],['Antes',50,'r'],['Agora',50,'r'],['Nosso',0,'r']], rows:mud.map(m=>[nm(m.x), m.nome, brl(m.de), brl(m.para), brl(m.x.nosso)]) });
    else if(V==='curva'){ secoes.push(sec(`Curva ${S_CV} pesquisada`, curvaPesq, 'Posição', x=>'#'+x.rank));
      secoes.push({ titulo:`Curva ${S_CV} que não foi pesquisada (${curvaNao.length})`, cols:[['Posição',40,'r'],['Código',50,'l'],['Produto',250,'l'],['Setor',80,'l'],['Venda/mês',0,'r']], rows:curvaNao.map(x=>['#'+x.rank, x.c, cap1(x.d||''), x.setor?nomeSetor(x.setor):'', brl0(x.vMes)]) }); }
    else secoes.push(sec('Todos os produtos pesquisados', A.ls.filter(x=>x.nosso).sort((a,b)=>(b.vMes||0)-(a.vMes||0)), 'Situação', x=>x.dif==null?'sem concorrente':x.dif>=PP.caroMin?'mais caro':x.dif<=-PP.caroMin?'mais barato':'igual'));
    const nomeV=V==='curva'?`Curva ${S_CV}`:(vistas.find(v=>v[0]===V)?.[1]||'Resumo').replace(/\s*\(\d+\)$/,'').replace(/^[^\wÀ-ú]+/,'');
    const filtros=[S.ppSet?nomeSetor(S.ppSet):'Loja toda', S.ppSoA?'só curva A':'', `comparando com ${S.ppConc==='min'?'o mais barato':cN[S.ppConc]}`].filter(Boolean).join(' · ');
    return { arquivo:`pesquisa-${P.numero}-${V}${S.ppSet?'-'+S.ppSet:''}${S.ppSoA?'-curvaA':''}`, titulo:`Pesquisa de preço nº ${P.numero} — ${nomeV}`,
      sub:`${fD(P.periodo_inicio)} a ${fD(P.periodo_fim)} · ${filtros} · gerado em ${fD(todayIso())}`,
      kpis:[['Nosso preço × concorrente', A.indice!=null?A.indice.toFixed(1).replace('.',','):'—', A.indice!=null?(A.indice>100?`${pctBR(A.indice/100-1,1)} mais caro`:`${pctBR(1-A.indice/100,1)} mais barato`):''], ['Onde estou perdendo', String(A.caros.length), 'produtos 3% ou mais caros'], ['Oportunidade de margem', brl0(A.ganhoMes)+'/mês', `${A.baratos.length} produtos`], ['Comparados', String(A.comp.length), `de ${A.ls.filter(x=>x.nosso).length} com nosso preço`]],
      secoes };
  };
  /* ---------- procurar produto (código ou descrição) em qualquer aba: procura na pesquisa inteira ---------- */
  const buscaHtml=`<div class="card pp-busca" style="margin-top:12px;padding:10px 12px"><div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><b>🔎 Procurar produto</b><input id="ppQ" type="search" autocomplete="off" placeholder="código ou descrição (ex.: 1785, skol 350)" value="${esc(S.ppQ||'')}" style="flex:1;min-width:200px;border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:15px"><button class="btn" id="ppQx" title="Limpar">✕</button></div><div id="ppAchados"></div></div>`;
  box.insertAdjacentHTML('beforeend', buscaHtml);
  const bus={ bar:new Map(A0.baratos.map(x=>[String(x.c),x])) };
  const itBusca=x=>{ const b=bus.bar.get(String(x.c)); const cs=todosConc(x);
    const dir = !x.nosso ? '<span class="small muted">sem nosso preço</span>' : x.dif==null ? '<span class="small muted">sem preço do concorrente</span>' : x.dif>=PP.caroMin ? `<b style="color:var(--bad)">${pp(x.dif)}</b><span class="small muted">mais caro</span>` : x.dif<=-PP.caroMin ? `<b style="color:var(--good)">${pp(x.dif)}</b><span class="small muted">mais barato</span>` : `<b>${pp(x.dif)}</b><span class="small muted">no mesmo preço</span>`;
    return `<div class="pp-i"><div class="pp-p">${cod(x)} <b>${esc(cap1(x.d))}</b>${x.cv?` <span class="pp-promo">${x.cv==='A'?'⭐ ':''}curva ${x.cv}${x.rank?' · #'+x.rank:''}</span>`:''}${x.setor?` <span class="small muted">· ${esc(nomeSetor(x.setor))}</span>`:''}
      <div class="small">nosso <b>${x.nosso?pr(x.nosso):'—'}</b>${x.custo>0?` · custo ${pr(x.custo)}`:''}${x.mgAtual!=null?` · margem <b>${x.mgAtual.toFixed(1).replace('.',',')}%</b>${x.mgAlvo!=null?` (alvo ${x.mgAlvo.toFixed(0)}%)`:''}`:''} · venda ${x.vMes?brl0(x.vMes)+'/mês':'sem venda no mês'}</div>
      <div class="small">${cs.lst}</div>${cs.media}${x.dif!=null&&x.dif>=PP.caroMin?veredito(x):''}${b?`<div class="small">sugestão <b>${pr(b.sug)}</b> (ainda abaixo do concorrente)${b.ganho>0?` · ganha <b style="color:var(--good)">${brl0(b.ganho)}/mês</b>`:''}</div>`:''}</div><div class="pp-n">${dir}</div></div>`; };
  const procurar=()=>{ const raw=($('#ppQ').value||'').trim(); S.ppQ=raw; const out=$('#ppAchados'); if(!raw){ out.innerHTML=''; return; }
    const t=normN2(raw), pal=t.split(/[^A-Z0-9]+/).filter(Boolean), soNum=/^\d+$/.test(raw);
    const ach=A0.ls.filter(x=>{ const c=String(x.c); if(soNum && (c===raw || c.startsWith(raw))) return true; const ps=normN2(x.d).split(/[^A-Z0-9]+/).filter(Boolean); return pal.every(w=>c===w || ps.some(p=>p.startsWith(w))); })
      .sort((a,b)=>((String(b.c)===raw)-(String(a.c)===raw)) || ((b.vMes||0)-(a.vMes||0)));
    out.innerHTML = ach.length ? `<div class="small muted" style="margin:8px 0 2px">${ach.length} produto(s)${ach.length>40?' · mostrando os 40 que mais vendem':''}</div><div class="pp-l">${ach.slice(0,40).map(itBusca).join('')}</div>` : `<div class="small muted" style="margin-top:8px">Nenhum produto da pesquisa nº ${P.numero} com “${esc(raw)}”.</div>`; };
  let _qT=null; $('#ppQ').oninput=()=>{ clearTimeout(_qT); _qT=setTimeout(procurar,180); };
  $('#ppQ').onkeydown=e=>{ if(e.key==='Enter'){ clearTimeout(_qT); procurar(); } };
  $('#ppQx').onclick=()=>{ $('#ppQ').value=''; procurar(); $('#ppQ').focus(); };
  if(S.ppQ) procurar();
  box.insertAdjacentHTML('beforeend', chipsVista + (V==='resumo' ? `
    <div class="grid two pp-2" style="gap:12px;margin-top:12px">${C.caros(N)}${C.baratos(N)}</div>
    <div class="grid two pp-2" style="gap:12px;margin-top:12px">${C.promo(6)}${C.marg(6)}</div>
    ${C.setor(N)}${C.mud(8)}${C.cad(N)}${C.todos(N)}` : `<div style="margin-top:12px">${C[V](N)}</div>${V==='caros'||V==='baratos'?C.setor(N):''}`));
  const tb=$('#ppTb');
  const desenha=()=>{ if(!tb) return; return desenha0(); };
  const desenha0=()=>{ const t=normN2($('#ppBusca').value||''); const arr=A.ls.filter(x=>!t || normN2(x.d).includes(t) || String(x.c).includes(t)).sort((a,b)=>(b.vMes-a.vMes)||(String(a.d).localeCompare(b.d))).slice(0,400);
    tb.innerHTML=arr.map(x=>`<tr><td>${cod(x)} ${esc(cap1(x.d))}</td><td class="n"><b>${pr(x.nosso)}</b></td>${x.conc.map(c=>`<td class="n">${c&&c.p>0?pr(c.p)+(c.promo?' <span class="pp-promo">P</span>':''):'—'}</td>`).join('')}<td class="n">${x.dif!=null?`<b style="color:${x.dif>=PP.caroMin?'var(--bad)':x.dif<=-PP.caroMin?'var(--good)':'var(--ink)'}">${pp(x.dif)}</b>`:'—'}</td><td class="n m-hide">${x.custo>0?pr(x.custo):'—'}</td><td class="n m-hide">${x.mgAtual!=null&&x.nosso?x.mgAtual.toFixed(1).replace('.',',')+'%':'—'}</td><td class="n m-hide">${x.vMes?brl0(x.vMes):'—'}</td></tr>`).join(''); };
  if(tb){ $('#ppBusca').oninput=desenha; desenha(); }
  box.querySelectorAll('[data-ppv]').forEach(b=>b.onclick=()=>{ S.ppVista=b.dataset.ppv; renderPrecos(app); });
  box.querySelectorAll('[data-ppvk]').forEach(b=>b.onclick=()=>{ S.ppVista=b.dataset.ppvk; renderPrecos(app); });
  box.querySelectorAll('[data-ppset]').forEach(b=>b.onclick=()=>{ S.ppSet=b.dataset.ppset||null; renderPrecos(app); });
  $('#ppPdf')?.addEventListener('click',()=>{ const R=relPrecos(); pdfDaTela(box, {arquivo:R.arquivo, titulo:R.titulo, sub:R.sub, tirar:'.tl-chips, button, .pp-mbt, select, input, .an-olmais'}); });
  box.querySelectorAll('[data-ppsoa]').forEach(b=>b.onclick=()=>{ S.ppSoA=!S.ppSoA; renderPrecos(app); });
  box.querySelectorAll('[data-ppc]').forEach(b=>b.onclick=()=>{ S.ppConc=b.dataset.ppc==='min'?'min':+b.dataset.ppc; renderPrecos(app); });
  box.querySelectorAll('[data-ppcv]').forEach(b=>b.onclick=()=>{ S.ppCurva=b.dataset.ppcv; renderPrecos(app); });
  const fontes={ppCv:[curvaPesq,itCv], ppCvN:[curvaNao,itCvN], ppCaros:[A.caros,itCaro], ppBar:[A.baratos,itBar], ppPromo:[A.promo,itPromo], ppMarg:[listaMarg,itMarg], ppMud:[mud,itMud]};
  const abrirAte=(id,todos)=>{ const bx=box.querySelector(`[data-mbox="${id}"]`), n=+bx.dataset.n, [arr,fn]=fontes[id]; const passo=(S.ppVista&&S.ppVista!=='resumo')?30:10, ate=todos?arr.length:Math.min(arr.length,n+passo);
    $('#'+id).insertAdjacentHTML('beforeend', arr.slice(n,ate).map(fn).join('')); bx.dataset.n=ate; if(ate>=arr.length) bx.remove(); else bx.querySelector('[data-mais]').textContent=`Ver mais ${Math.min(passo,arr.length-ate)} de ${arr.length-ate}`; };
  box.querySelectorAll('[data-mais]').forEach(b=>b.onclick=()=>abrirAte(b.dataset.mais,false));
  box.querySelectorAll('[data-todos]').forEach(b=>b.onclick=()=>abrirAte(b.dataset.todos,true));
}

/* cartão no Painel: onde estou perdendo × oportunidade, da última pesquisa */
async function cardPrecosPainel(el){
  if(!el || !S.gerente) return;
  let P; try{ P=(await q(S.sb.from('pesquisas_preco').select('*').order('periodo_fim',{ascending:false}).order('numero',{ascending:false}).limit(1)))[0]; }catch(_){ return; }
  if(!P || !el.isConnected) return;
  let vendas=[]; try{ vendas=await vendasProdutoMes(); }catch(_){ }
  const A=analisarPesquisa(P, vendas, new Map(), 'min'); if(!el.isConnected) return;
  const top=A.caros.slice(0,3);
  el.innerHTML=`<div class="card" style="margin-top:12px"><div class="row" style="flex-wrap:wrap;gap:6px"><h2 style="margin:0">💲 Pesquisa de preço</h2><span class="small muted">nº ${P.numero??'—'} de ${fD(P.periodo_fim)}</span><div class="sp"></div><a class="btn" href="#precos">Ver a pesquisa</a></div>
    <div class="grid kpis" style="margin-top:8px">
      <div class="kpi"><div class="l">🔴 Onde estou perdendo</div><div class="v" style="color:var(--bad)">${A.caros.length}</div><div class="d">produtos mais caros que o concorrente · vendem ${brl0(A.perdeuMes)}/mês</div></div>
      <div class="kpi"><div class="l">🟢 Oportunidade de margem</div><div class="v" style="color:var(--good)">${brl0(A.ganhoMes)}/mês</div><div class="d">${A.baratos.length} produtos bem abaixo do concorrente</div></div>
    </div>
    ${top.length?`<div class="small" style="margin-top:8px"><b>Olhe primeiro:</b> ${top.map(x=>`${esc(cap1(x.d))} (${pctBR(x.dif,0)} mais caro)`).join(' · ')}</div>`:''}</div>`;
}
