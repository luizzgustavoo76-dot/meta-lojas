/* Alertas de perdas e trocas — calculados a partir do que já está no banco.
   Gerente: todos os setores. Encarregado: só os setores dele (o banco já filtra). */

const LIMITES_PADRAO = { tetoAmarelo:80, perdaSubiu:20, prodSaida:30, prodSaidaMin:50, prodConc:15, trocaPctVenda:1, trocaSubiu:20, trocaProdMin:100 };
const LIMITES_TXT = {
  tetoAmarelo:['Perda: aviso amarelo quando passar de (% do teto)','%'],
  perdaSubiu:['Perda subiu contra o ano passado mais de','%'],
  prodSaida:['Produto perde mais de (% do que sai)','%'],
  prodSaidaMin:['… e a perda do produto é de pelo menos','R$'],
  prodConc:['Um produto concentra mais de (% da perda do setor)','%'],
  trocaPctVenda:['Trocas passam de (% da venda do setor)','%'],
  trocaSubiu:['Trocas subiram contra o ano passado mais de','%'],
  trocaProdMin:['Produto com troca de pelo menos','R$'],
};
async function carregarLimites(){
  if(S._limites) return S._limites;
  let v={}; try{ const r=await q(S.sb.from('configuracoes').select('valor').eq('chave','alertas').limit(1)); v=r[0]?.valor||{}; }catch(_){}
  return S._limites={...LIMITES_PADRAO, ...v};
}

async function calcularAlertas(forcar){
  if(!forcar && S._alertas && Date.now()-S._alertas.t<5*60e3 && S._alertas.mes===S.mes) return S._alertas.lista;
  const L=await carregarLimites(); const doc=curDoc(); if(!doc) return [];
  const al=[]; const meus = S.gerente ? null : new Set(S.perfil?.setores||[]);
  const pode = id => !meus || meus.has(id);
  const add=(nivel,tipo,setor,titulo,detalhe,aba,itens)=>{ if(pode(setor)) al.push({nivel,tipo,setor,titulo,detalhe,aba,itens:itens||[]}); };
  const ini=doc.mes+'-01', fim=fimDoMes(doc.mes);
  let tetos={}, P=[], PL=[], T=[], TL=[];
  try{
    [tetos, P, T] = await Promise.all([ carregarTetos(), q(S.sb.from('analise_perdas').select('setor_id,periodo_inicio,periodo_fim,valor,dados').gte('periodo_fim',ini).lte('periodo_fim',fim)), q(S.sb.from('analise_trocas').select('setor_id,periodo_inicio,periodo_fim,custo,dados').gte('periodo_fim',ini).lte('periodo_fim',fim)) ]);
  }catch(_){ return []; }
  const ultimo=arr=>{ const m=new Map(); for(const r of arr){ const a=m.get(r.setor_id); if(!a || r.periodo_fim>a.periodo_fim || (r.periodo_fim===a.periodo_fim && r.periodo_inicio<a.periodo_inicio)) m.set(r.setor_id,r); } return [...m.values()]; };
  P=ultimo(P); T=ultimo(T);
  try{
    const lyP=[...new Set(P.map(r=>addAnos(r.periodo_inicio,-1)+'|'+addAnos(r.periodo_fim,-1)))], lyT=[...new Set(T.map(r=>addAnos(r.periodo_inicio,-1)+'|'+addAnos(r.periodo_fim,-1)))];
    for(const k of lyP){ const [a,b]=k.split('|'); PL.push(...await q(S.sb.from('analise_perdas').select('setor_id,periodo_inicio,periodo_fim,valor').eq('periodo_inicio',a).eq('periodo_fim',b))); }
    for(const k of lyT){ const [a,b]=k.split('|'); TL.push(...await q(S.sb.from('analise_trocas').select('setor_id,periodo_inicio,periodo_fim,custo').eq('periodo_inicio',a).eq('periodo_fim',b))); }
  }catch(_){}
  const lyDe=(arr,r)=>arr.find(x=>x.setor_id===r.setor_id && x.periodo_inicio===addAnos(r.periodo_inicio,-1) && x.periodo_fim===addAnos(r.periodo_fim,-1));
  const vendaPer=(sid,a,b)=>{ let v=0; for(const k of diasDoMes(doc.mes)){ if(k<a||k>b) continue; v+=+(doc.dias?.[k]?.vendas?.[sid]||0); } return v; };

  // 1) perda do mês × teto
  const {p,v}=perdaVendaMes(doc, S.cutoff);
  for(const s of doc.setores){ const t=tetos[s.id]; if(t==null || !v[s.id] || !p[s.id]) continue; const pc=p[s.id]/v[s.id]*100;
    if(pc>t) add('alto','perda',s.id,`${s.nome}: perda acima do teto`,`${pc.toLocaleString('pt-BR',{maximumFractionDigits:2})}% da venda no mês (teto ${t.toLocaleString('pt-BR')}%) · ${brl0(p[s.id])}`,'per');
    else if(pc>t*L.tetoAmarelo/100) add('medio','perda',s.id,`${s.nome}: perda perto do teto`,`${pc.toLocaleString('pt-BR',{maximumFractionDigits:2})}% da venda (teto ${t.toLocaleString('pt-BR')}%)`,'per'); }

  // 2) perdas por produto
  for(const r of P){ const its=r.dados.secoes.flatMap(x=>x.itens).filter(i=>i.q>0); const tot=+r.valor||0; if(!tot) continue; const per=`${fD(r.periodo_inicio)} a ${fD(r.periodo_fim)}`;
    const ly=lyDe(PL,r); if(ly){ const b=+ly.valor||0; if(b>=200){ const d=tot/b-1; if(d*100>L.perdaSubiu) add(d>0.5?'alto':'medio','perda',r.setor_id,`${nomeSetor(r.setor_id)}: perda subiu ${pctBR(d,0)} contra o ano passado`,`${brl0(tot)} em ${per} · ano passado ${brl0(b)}`,'per'); }
      else if(tot>=200 && tot-b>=200) add('alto','perda',r.setor_id,`${nomeSetor(r.setor_id)}: perda saiu de ${brl0(b)} para ${brl0(tot)}`,`${per} · no ano passado quase não teve perda`,'per'); }
    const alt=its.filter(i=>{ const s=i.v+i.q>0?i.q/(i.v+i.q):0; return s*100>=L.prodSaida && i.val>=L.prodSaidaMin; }).sort((a,b)=>b.val-a.val);
    if(alt.length) add(alt.some(i=>i.val>=L.prodSaidaMin*4)?'alto':'medio','perda',r.setor_id,`${nomeSetor(r.setor_id)}: ${alt.length} produto(s) perdem ${L.prodSaida}% ou mais do que sai`,`${per}`,'per', alt.slice(0,8).map(i=>`${cap1(i.d)} — perde ${pctBR(i.q/(i.v+i.q),0)} · ${brl0(i.val)}`));
    const conc=its.length>=5 ? its.filter(i=>i.val/tot*100>=L.prodConc && i.val>=L.prodSaidaMin).sort((a,b)=>b.val-a.val) : [];
    if(conc.length) add('medio','perda',r.setor_id,`${nomeSetor(r.setor_id)}: perda concentrada em ${conc.length===1?'um produto':conc.length+' produtos'}`,`${per}`,'per', conc.map(i=>`${cap1(i.d)} — ${pctBR(i.val/tot,0)} da perda do setor · ${brl0(i.val)}`));
  }

  // 3) trocas
  for(const r of T){ const tot=+r.custo||0; if(!tot) continue; const per=`${fD(r.periodo_inicio)} a ${fD(r.periodo_fim)}`;
    const ven=vendaPer(r.setor_id, r.periodo_inicio, r.periodo_fim);
    if(ven && tot/ven*100>L.trocaPctVenda) add(tot/ven*100>L.trocaPctVenda*2?'alto':'medio','troca',r.setor_id,`${nomeSetor(r.setor_id)}: trocas em ${pctBR(tot/ven,2)} da venda`,`${brl0(tot)} em ${per} (limite ${L.trocaPctVenda.toLocaleString('pt-BR')}%)`,'trc');
    const ly=lyDe(TL,r); if(ly && +ly.custo>=100){ const d=tot/+ly.custo-1; if(d*100>L.trocaSubiu) add(d>0.5?'alto':'medio','troca',r.setor_id,`${nomeSetor(r.setor_id)}: trocas subiram ${pctBR(d,0)} contra o ano passado`,`${brl0(tot)} · ano passado ${brl0(+ly.custo)}`,'trc'); }
    const big=r.dados.itens.filter(i=>i.tc>=L.trocaProdMin).sort((a,b)=>b.tc-a.tc);
    if(big.length) add('medio','troca',r.setor_id,`${nomeSetor(r.setor_id)}: ${big.length} produto(s) com troca de ${brl0(L.trocaProdMin)} ou mais`,`${per}`,'trc', big.slice(0,8).map(i=>`${cap1(i.d)} — ${brl(i.tc)} · ${qtBR(i.q)} un/kg`));
  }
  // 4) produto que aparece em perda e em troca no mesmo setor
  for(const r of T){ const pr=P.find(x=>x.setor_id===r.setor_id); if(!pr) continue; const perd=new Map(pr.dados.secoes.flatMap(x=>x.itens).filter(i=>i.q>0).map(i=>[String(i.c),i]));
    const amb=r.dados.itens.filter(i=>perd.has(String(i.c))).map(i=>({d:i.d, t:i.tc, p:perd.get(String(i.c)).val})).sort((a,b)=>(b.t+b.p)-(a.t+a.p));
    if(amb.length) add('medio','troca',r.setor_id,`${nomeSetor(r.setor_id)}: ${amb.length} produto(s) com perda e troca ao mesmo tempo`,'vale olhar validade, armazenamento e pedido','trc', amb.slice(0,8).map(x=>`${cap1(x.d)} — perda ${brl0(x.p)} + troca ${brl0(x.t)}`)); }

  al.sort((a,b)=>(a.nivel==='alto'?0:1)-(b.nivel==='alto'?0:1));
  S._alertas={t:Date.now(), mes:S.mes, lista:al};
  return al;
}

function htmlAlerta(a,i){
  const cor=a.nivel==='alto'?'var(--bad)':'var(--warn)';
  return `<div class="alerta" style="border-left:4px solid ${cor};padding:8px 10px;margin:6px 0;background:#fff;border-radius:8px;border:1px solid var(--line);border-left-width:4px;border-left-color:${cor}">
    <div style="display:flex;gap:8px;align-items:flex-start;cursor:${a.itens.length?'pointer':'default'}" data-alt="${i}"><span>${a.nivel==='alto'?'🔴':'🟡'}</span><div style="flex:1"><b>${esc(a.titulo)}</b><div class="small muted">${a.tipo==='troca'?'🔄 Trocas':'🗑️ Perdas'} · ${esc(a.detalhe)}</div></div>${a.itens.length?'<span class="muted" data-alts="'+i+'">▸</span>':''}</div>
    ${a.itens.length?`<div class="hide small" data-altd="${i}" style="margin:6px 0 2px 26px;line-height:1.6">${a.itens.map(t=>'• '+esc(t)).join('<br>')}</div>`:''}
    <div style="margin:6px 0 0 26px"><a class="small" href="#setor" data-ir="${a.setor}|${a.aba}">Abrir ${a.aba==="trc"?"🔄 Trocas":"🗑️ Perdas"} · ${esc(nomeSetor(a.setor))} →</a></div></div>`;
}
function ligarAlertas(el){
  el.querySelectorAll('[data-alt]').forEach(h=>h.onclick=()=>{ const i=h.dataset.alt; const d=el.querySelector(`[data-altd="${i}"]`); if(!d) return; const ab=d.classList.toggle('hide'); const s=el.querySelector(`[data-alts="${i}"]`); if(s) s.textContent=ab?'▸':'▾'; });
  el.querySelectorAll('[data-ir]').forEach(a=>a.onclick=e=>{ e.preventDefault(); const [sid,aba]=a.dataset.ir.split('|'); closeModal(); S.setorSel=sid; S.setorAba=aba; if(S.view==='setor') render(); else location.hash='#setor'; });
}

async function atualizarSino(forcar){
  const b=$('#bAlertas'); if(!b) return;
  const al=await calcularAlertas(forcar); const n=al.length, alto=al.filter(a=>a.nivel==='alto').length;
  b.innerHTML=`🔔${n?`<span class="sino-n" style="background:${alto?'var(--bad)':'var(--warn)'}">${n}</span>`:''}`;
  b.title=n?`${n} alerta(s) de perdas e trocas`:'Nenhum alerta';
}
async function abrirAlertas(){
  const m=modal(`<h2>🔔 Alertas de perdas e trocas</h2><div id="alBody"><span class="spin"></span> Calculando…</div>
    <div class="row" style="margin-top:12px"><div class="sp"></div><button class="btn" id="mN">Fechar</button></div>`);
  $('#mN',m).onclick=closeModal;
  const al=await calcularAlertas(true); atualizarSino();
  const b=$('#alBody',m); if(!b) return;
  b.innerHTML = al.length ? `<p class="small muted" style="margin:0 0 6px">${al.filter(a=>a.nivel==='alto').length} importante(s) · ${al.filter(a=>a.nivel!=='alto').length} de atenção · mês de ${mesLabel(S.mes)}. Toque no alerta para ver os produtos.</p>${al.map(htmlAlerta).join('')}${S.gerente?'<p class="small muted" style="margin-top:8px">Ajuste os limites em 👤 → Painel do administrador → Metas do mês → Limites dos alertas.</p>':''}` : '<div class="empty">✔ Nenhum alerta no momento.</div>';
  ligarAlertas(b);
}
async function cardAlertas(app, filtroSetor){
  const anc=$('#ckBox')||app.querySelector('.row'); if(!anc) return;
  const box=document.createElement('div'); box.className='card'; box.style.margin='0 0 12px'; anc.after(box);
  box.innerHTML='<span class="spin"></span> Conferindo alertas…';
  let al=await calcularAlertas(); if(filtroSetor) al=al.filter(a=>a.setor===filtroSetor);
  if(!box.isConnected) return;
  if(!al.length){ box.innerHTML=`<div class="row"><h2 style="margin:0">🔔 Alertas de perdas e trocas</h2><div class="sp"></div><span class="small" style="color:var(--good)">✔ nenhum alerta</span></div>`; return; }
  const alto=al.filter(a=>a.nivel==='alto').length;
  box.innerHTML=`<details ${alto?'open':''}><summary style="cursor:pointer"><h2 style="display:inline;margin:0">🔔 Alertas de perdas e trocas</h2> <span class="small" style="color:${alto?'var(--bad)':'var(--warn)'}">${alto?`🔴 ${alto} importante(s)`:''}${alto&&al.length>alto?' · ':''}${al.length>alto?`🟡 ${al.length-alto} de atenção`:''}</span></summary>
    <div style="margin-top:6px">${al.slice(0,6).map(htmlAlerta).join('')}</div>${al.length>6?`<button class="btn" id="alTodos" style="margin-top:6px">Ver todos os ${al.length} alertas</button>`:''}</details>`;
  ligarAlertas(box); const t=$('#alTodos'); if(t) t.onclick=abrirAlertas;
}

async function cardLimitesAlertas(app){
  if(!S.gerente) return; S._limites=null; const L=await carregarLimites(); if(!app.isConnected) return;
  const box=document.createElement('div'); box.className='card'; box.style.marginTop='12px';
  box.innerHTML=`<h2>🔔 Limites dos alertas</h2><p class="small muted" style="margin-top:-4px">Quando um número passa destes limites, o alerta aparece no 🔔 do topo e no Painel (encarregados veem só os setores deles).</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">${Object.entries(LIMITES_TXT).map(([k,[t,u]])=>`<label class="f">${esc(t)} (${u})<input class="in" inputmode="decimal" data-lim="${k}" value="${String(L[k]).replace('.',',')}"></label>`).join('')}</div>
    <div class="row" style="margin-top:10px"><button class="btn" id="bLimPad">Voltar ao padrão</button><div class="sp"></div><button class="btn p" id="bLim">Salvar limites</button></div>`;
  app.appendChild(box);
  const salvar=async(v)=>{ try{ await q(S.sb.from('configuracoes').upsert({chave:'alertas', valor:v, atualizado_em:new Date().toISOString()})); S._limites=null; S._alertas=null; atualizarSino(true); toast('Limites salvos ✔'); }catch(e){ toast(e.message,5000); } };
  $('#bLim').onclick=()=>{ const v={}; for(const i of box.querySelectorAll('[data-lim]')){ const n=parseNum(i.value); if(isNaN(n)||n<0) return toast('Valor inválido: '+LIMITES_TXT[i.dataset.lim][0],4000); v[i.dataset.lim]=n; } salvar(v); };
  $('#bLimPad').onclick=()=>{ box.querySelectorAll('[data-lim]').forEach(i=>i.value=String(LIMITES_PADRAO[i.dataset.lim]).replace('.',',')); salvar({...LIMITES_PADRAO}); };
}
