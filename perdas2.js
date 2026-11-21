/* ===================== Perdas: melhorias =====================
   - acumula o relatório de um dia só no acumulado do mês
   - grupos de produto (kg) e a quilo / unidade-pacote
   - quanto ainda pode perder no mês (até o teto)
   - perda por dia da semana
   - perda × ruptura
   - plano de ação por produto */

/* ---------- acumulado do mês ---------- */
function somarPerdas(base, dia){
  const secs=JSON.parse(JSON.stringify(base.secoes||[]));
  const onde=new Map(); secs.forEach(s=>s.itens.forEach(i=>onde.set(String(i.c),i)));
  for(const ns of (dia.secoes||[])){
    let sec=secs.find(s=>String(s.codigo)===String(ns.codigo) && s.nome===ns.nome);
    for(const it of ns.itens){ const x=onde.get(String(it.c));
      if(x){ x.e=round2((+x.e||0)+(+it.e||0)); x.v=round2((+x.v||0)+(+it.v||0)); x.q=round2((+x.q||0)+(+it.q||0)); x.val=round2((+x.val||0)+(+it.val||0));
        x.s=it.s; x.cu=x.q? round2(x.val/x.q*100)/100 : it.cu; x.pc=x.e? Math.round(x.q/x.e*10000)/100 : x.pc; if(it.d) x.d=it.d; }
      else { if(!sec){ sec={codigo:ns.codigo, nome:ns.nome, itens:[]}; secs.push(sec); } const n={...it}; sec.itens.push(n); onde.set(String(it.c),n); } } }
  return {...base, secoes:secs, emitido:dia.emitido||base.emitido, somado:true};
}
async function acumularPerdasDia(rows, dia){
  const ini=dia.slice(0,8)+'01'; if(dia===ini) return 0;
  const ant=isoOf(new Date(new Date(dia+'T12:00:00').getTime()-864e5));
  const base=await q(S.sb.from('analise_perdas').select('setor_id,valor,dados,arquivo_nome').eq('periodo_inicio',ini).eq('periodo_fim',ant));
  if(!base.length) return 0;
  const emitNovo=(rows.find(x=>x.dados?.emitido)||{}).dados?.emitido||null;
  try{ const ex=await q(S.sb.from('analise_perdas').select('setor_id,dados->>emitido,dados->>somado').eq('periodo_inicio',ini).eq('periodo_fim',dia));
    if(ex.length && ex.every(x=>x.somado!=='true') && ex.some(x=>x.emitido && (!emitNovo || x.emitido>=emitNovo))) return -1; }catch(_){ }
  const porS=Object.fromEntries(rows.map(x=>[x.setor_id,x]));
  const out=base.map(b=>{ const d=porS[b.setor_id]; return { setor_id:b.setor_id, periodo_inicio:ini, periodo_fim:dia, arquivo_nome:'acumulado do mês',
    valor:round2((+b.valor||0)+(d?+d.valor||0:0)), dados: d? somarPerdas(b.dados||{}, d.dados||{}) : {...(b.dados||{}), somado:true} }; });
  for(const d of rows) if(!base.some(b=>b.setor_id===d.setor_id)) out.push({ ...d, periodo_inicio:ini, periodo_fim:dia, arquivo_nome:'acumulado do mês', dados:{...d.dados, somado:true} });
  await q(S.sb.from('analise_perdas').upsert(out, {onConflict:'setor_id,periodo_inicio,periodo_fim'}));
  return out.length;
}

/* ---------- grupos (kg) nas perdas ---------- */
function agruparItensPerda(itens, grupos){
  if(!grupos||!grupos.length) return itens;
  const deC=new Map(); grupos.forEach(g=>g.codigos.forEach(c=>deC.set(String(c),g)));
  const out=[], junt=new Map();
  for(const i of itens){ const g=deC.get(String(i.c)); if(!g){ out.push(i); continue; }
    let j=junt.get(g.id); if(!j){ j={c:'G'+g.id, d:g.nome, sec:i.sec, e:0, v:0, q:0, val:0, s:0, grupo:[]}; junt.set(g.id,j); out.push(j); }
    j.e+=+i.e||0; j.v+=+i.v||0; j.q+=+i.q||0; j.val+=+i.val||0; j.s+=+i.s||0; j.grupo.push(i); }
  for(const j of junt.values()){ j.e=round2(j.e); j.v=round2(j.v); j.q=round2(j.q); j.val=round2(j.val); j.cu=j.q? j.val/j.q : 0; j.pc=j.e? j.q/j.e*100 : 0; j.grupo.sort((a,b)=>b.val-a.val); }
  return out;
}
const perdaAQuilo = i => !!i.grupo || /(^|\s)KG(\s|$)/i.test(i.d||'');

/* ---------- quanto ainda pode perder ---------- */
function orcamentoPerda(doc, tetos, sid){
  const c=calc(doc, S.cutoff); const L=c.loja, mes=doc.mes, dias=diasDoMes(mes).length;
  const linha=s=>{ const teto=tetos[s.id]; if(teto==null) return null;
    const ritmo = s.metaAte? s.real/s.metaAte : null; const proj = ritmo!=null ? s.real + (L.metaRest*(s.share||0))*ritmo : s.real/Math.max(1,dias-L.diasRest)*dias;
    const permitido = proj*teto/100, perdido=s.perda||0, falta=permitido-perdido;
    return { s, teto, proj, permitido, perdido, falta, porDia: L.diasRest? falta/L.diasRest : null, pc: proj? perdido/proj : null, usado: permitido? perdido/permitido : null }; };
  const ls=c.setores.filter(s=>!sid||s.id===sid).map(linha).filter(Boolean);
  return { ls, diasRest:L.diasRest, ate:S.cutoff };
}
function htmlOrcamentoLinha(o){
  const cor = o.falta<0 ? 'var(--bad)' : o.usado>0.85 ? 'var(--warn)' : 'var(--good)';
  return `<div class="orc-i"><div class="orc-t"><b>${esc(o.s.nome)}</b><span class="small muted">teto ${o.teto.toLocaleString('pt-BR')}% · venda prevista ${brl0(o.proj)}</span></div>
    <div class="orc-v" style="color:${cor}">${o.falta<0?`passou ${brl0(-o.falta)}`:`${brl0(o.falta)}`}<div class="small" style="font-weight:600">${o.falta<0?'acima do teto':o.porDia!=null?`≈ ${brl0(o.porDia)}/dia`:''}</div></div>
    <div class="orc-b">${barraPct(Math.min(1,o.usado||0), cor)}<div class="small muted">perdeu ${brl0(o.perdido)} de ${brl0(o.permitido)} permitidos (${pctBR(o.usado||0,0)})</div></div></div>`;
}
async function cardOrcamentoPerda(box, sid){
  const doc=curDoc(); if(!doc) return; let tetos; try{ tetos=await carregarTetos(); }catch(_){ return; } if(!box.isConnected) return;
  const O=orcamentoPerda(doc, tetos, sid); if(!O.ls.length) return;
  const el=document.createElement('div'); el.className='card'; el.style.marginTop='12px';
  const ls=[...O.ls].sort((a,b)=>(a.falta/(a.permitido||1))-(b.falta/(b.permitido||1)));
  el.innerHTML=`<div class="row" style="flex-wrap:wrap;gap:6px"><h2 style="margin:0">💰 Quanto ainda pode perder no mês</h2><div class="sp"></div><span class="small muted">até o teto · ${O.diasRest} dia(s) restante(s) · lançado até ${fD(O.ate)}</span></div>
    <div class="orc-l" style="margin-top:8px">${ls.map(htmlOrcamentoLinha).join('')}</div>
    <p class="small muted" style="margin:6px 0 0">Permitido = teto de perda × venda prevista do mês (no ritmo atual da meta). Perdido = perda lançada no site, com balanços. Por dia = o que sobra ÷ dias que faltam.</p>`;
  box.appendChild(el);
}

/* ---------- perda por dia da semana ---------- */
async function cardPerdaDiaSemana(box, sid){
  const el=document.createElement('div'); el.className='card'; el.style.marginTop='12px';
  const desenhar=async modo=>{
    const doc=curDoc(), fim=S.cutoff||todayIso();
    const ini = modo==='mes' && doc ? doc.mes+'-01' : isoOf(new Date(new Date(fim+'T12:00:00').getTime()-55*864e5));
    let L; try{ L=await todasLinhas(()=>{ let b=S.sb.from('lancamentos').select('data,setor_id,venda,perda').gte('data',ini).lte('data',fim); if(sid) b=b.eq('setor_id',sid); return b; }); }catch(_){ return false; }
    if(!box.isConnected) return false;
    const porDia={}; for(const x of L){ const d=porDia[x.data]=porDia[x.data]||{data:x.data,p:0,v:0,set:[]}; d.p+=+x.perda||0; d.v+=+x.venda||0; if(+x.perda) d.set.push(x); }
    const ds=Object.values(porDia).filter(x=>x.v>0);
    const W=[0,1,2,3,4,5,6].map(w=>({w, n:0, p:0, v:0, dias:[]}));
    for(const x of ds){ const w=new Date(x.data+'T12:00:00').getDay(); W[w].n++; W[w].p+=x.p; W[w].v+=x.v; W[w].dias.push(x); }
    const nomes=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'], plural=['Domingos','Segundas','Terças','Quartas','Quintas','Sextas','Sábados'];
    const ws=W.filter(x=>x.n).map(x=>({...x, media:x.p/x.n, pc:x.v? x.p/x.v : 0}));
    const tot=ws.reduce((a,x)=>a+x.n,0), mediaGeral=tot? ws.reduce((a,x)=>a+x.p,0)/tot : 0; const max=Math.max(0,...ws.map(x=>x.media))||1;
    const pior=mediaGeral? [...ws].sort((a,b)=>b.media-a.media)[0] : null;
    const poucos = modo==='mes' && Math.min(...ws.map(x=>x.n).concat([9]))<3;
    const sel=(m,t)=>`<button type="button" class="dsm-m ${modo===m?'on':''}" data-m="${m}">${t}</button>`;
    el.innerHTML=`<div class="row" style="flex-wrap:wrap;gap:6px"><h2 style="margin:0">📅 Perda por dia da semana</h2><div class="sp"></div>
      <div class="dsm-ms" role="group" aria-label="Período">${sel('mes',doc?mesLabel(doc.mes):'Este mês')}${sel('8s','Últimas 8 semanas')}</div></div>
      <div class="small muted" style="margin-top:4px">${modo==='mes'?'média do mês':'média das últimas 8 semanas'} (${fD(ini)} a ${fD(fim)}) · sem balanços${poucos?' · ainda são poucas datas de cada dia, a média vai firmar com o mês':''}</div>
      ${ws.length?`<div class="dsm">${ws.map(x=>`<button type="button" class="dsm-i ${x===pior?'dsm-pior':''}" data-w="${x.w}" aria-expanded="false" title="Ver dia a dia"><div class="dsm-n">${nomes[x.w].slice(0,3)}</div><div class="dsm-ds">${modo==='mes'? [...x.dias].sort((a,b)=>a.data.localeCompare(b.data)).map(d=>+d.data.slice(8)).join(' · ') : `${x.n} datas`}</div><div class="dsm-bar"><i style="height:${Math.max(4,x.media/max*100)}%"></i></div><div class="dsm-v">${brl0(x.media)}</div><div class="small muted">${pctBR(x.pc,1)} da venda</div></button>`).join('')}</div>
      <p class="small muted" style="margin:6px 0 0">👆 Toque num dia para ver cada data e o que foi perdido.</p>
      <div class="dsm-det hide"></div>
      ${pior?`<p class="small" style="margin:8px 0 0"><b>${nomes[pior.w]}</b> é o dia que mais perde: ${brl0(pior.media)} em média, ${(pior.media/mediaGeral).toLocaleString('pt-BR',{maximumFractionDigits:1})}× a média dos outros dias. Vale olhar o pedido e a exposição da véspera.</p>`:''}`
      : '<p class="small muted" style="margin:8px 0 0">Ainda não tem venda lançada nesse período.</p>'}`;
    el.querySelectorAll('.dsm-m').forEach(b=>b.onclick=()=>{ if(b.dataset.m!==modo) desenhar(b.dataset.m); });
    const det=$('.dsm-det',el);
    el.querySelectorAll('.dsm-i').forEach(bt=>bt.onclick=()=>{
      const aberto=bt.classList.contains('dsm-sel');
      el.querySelectorAll('.dsm-i').forEach(b=>{ b.classList.remove('dsm-sel'); b.setAttribute('aria-expanded','false'); });
      if(aberto){ det.classList.add('hide'); det.innerHTML=''; return; }
      bt.classList.add('dsm-sel'); bt.setAttribute('aria-expanded','true');
      const x=ws.find(y=>y.w===+bt.dataset.w); det.innerHTML=htmlDiasDaSemana(x, plural[x.w], sid); det.classList.remove('hide');
      det.querySelectorAll('details[data-dia]').forEach(d=>d.addEventListener('toggle',()=>{ if(d.open && !d.dataset.ok){ d.dataset.ok=1; abrirDiaPerda($('.dsm-dd',d), x.dias.find(y=>y.data===d.dataset.dia), sid); } }));
    });
    return true;
  };
  if(await desenhar('mes')) box.appendChild(el);
}
function htmlDiasDaSemana(x, nome, sid){
  const dias=[...x.dias].sort((a,b)=>b.data.localeCompare(a.data));
  const vals=dias.map(d=>d.p).sort((a,b)=>a-b), med=vals.length%2? vals[(vals.length-1)/2] : (vals[vals.length/2-1]+vals[vals.length/2])/2;
  const mx=Math.max(...dias.map(d=>d.p))||1, fora=d=> d.p>0 && d.p>=Math.max(2*med, x.media*1.5) && d.p-med>=100;
  const outl=dias.filter(fora), semF=dias.filter(d=>!fora(d)), mediaSem=semF.length? semF.reduce((a,d)=>a+d.p,0)/semF.length : 0;
  const dow=['dom','seg','ter','qua','qui','sex','sáb']; const zeros=dias.filter(d=>!(d.p>0)).length;
  return `<div class="dsm-h"><b>${nome}</b> · ${dias.length} dia(s) · média ${brl0(x.media)} · no meio (mediana) ${brl0(med)}</div>
    ${outl.length?`<div class="note warn small" style="margin:6px 0">⚠️ ${outl.length===1?`O dia <b>${fD(outl[0].data)}</b> puxou a média para cima`:`<b>${outl.map(d=>fD(d.data)).join(', ')}</b> puxaram a média para cima`}. Sem ${outl.length===1?'ele':'eles'}, a média de ${nome.toLowerCase()} seria <b>${brl0(mediaSem)}</b>.${zeros>=2?` Em <b>${zeros} de ${dias.length}</b> ${nome.toLowerCase()} não teve perda lançada: a perda pode estar sendo lançada junta, de vários dias, numa data só.`:''}</div>`:''}
    <div class="dsm-dl">${dias.map(d=>`<details class="dsm-d ${fora(d)?'dsm-fora':''}" data-dia="${d.data}"><summary>
      <span class="dsm-dt">${fD(d.data)} <span class="muted">${dow[new Date(d.data+'T12:00:00').getDay()]}</span></span>
      <span class="dsm-db"><i style="width:${Math.max(d.p?2:0,d.p/mx*100)}%"></i></span>
      <span class="dsm-dv"><b>${brl0(d.p)}</b><span class="small muted">${d.v?pctBR(d.p/d.v,1):'—'} de ${brl0(d.v)}</span></span>
      ${fora(d)?'<span class="dsm-tag">fora do normal</span>':''}</summary><div class="dsm-dd small muted">carregando…</div></details>`).join('')}</div>`;
}
async function abrirDiaPerda(box, d, sid){
  if(!d){ box.textContent=''; return; }
  if(!(d.p>0)){ box.textContent='Nenhuma perda lançada nesse dia.'; return; }
  if(!sid){ // loja: por setor
    const ls=[...d.set].sort((a,b)=>b.perda-a.perda);
    box.innerHTML= ls.length? `<div class="dsm-pl">${ls.map(x=>`<div><span>${esc(nomeSetor(x.setor_id))}</span><span class="muted">${x.venda?pctBR(x.perda/x.venda,1):''}</span><b>${brl0(+x.perda)}</b></div>`).join('')}</div>` : 'Nenhuma perda lançada nesse dia.';
    box.classList.remove('muted'); return; }
  const it=await itensPerdaDoDia(sid, d.data).catch(()=>null);
  if(!box.isConnected) return;
  if(!it){ box.innerHTML=`Os produtos desse dia não estão no site. Para ver o que foi perdido, importe na aba Perdas o relatório de perdas <b>só do dia ${fD(d.data)}</b> (de ${fD(d.data)} a ${fD(d.data)}).`; return; }
  const ls=it.filter(i=>i.val>0.009).sort((a,b)=>b.val-a.val), tot=ls.reduce((a,i)=>a+i.val,0);
  if(!ls.length){ box.textContent='Nenhum produto com perda nesse dia.'; return; }
  const top=ls.slice(0,12);
  box.classList.remove('muted');
  box.innerHTML=`<div class="dsm-pl">${top.map(i=>`<div><span>${esc(cap1(i.d))} <span class="muted">${esc(String(i.c))}</span></span><span class="muted">${qtBR(i.q)} ${/(^|\s)KG(\s|$)/i.test(i.d||'')?'kg':'un'}</span><b>${brl(i.val)}</b></div>`).join('')}</div>
    <div class="muted" style="margin-top:4px">${ls.length} produto(s) · ${brl(tot)}${ls.length>top.length?` · mostrando os ${top.length} maiores`:''}${top[0]&&tot?` · <b>${esc(cap1(top[0].d))}</b> foi ${pctBR(top[0].val/tot,0)} da perda do dia`:''}</div>`;
}
const _itDia={};
async function itensPerdaDoDia(sid, dia){
  const k=sid+'|'+dia; if(k in _itDia) return _itDia[k];
  const ini=dia.slice(0,8)+'01', ant=isoOf(new Date(new Date(dia+'T12:00:00').getTime()-864e5));
  const R=await q(S.sb.from('analise_perdas').select('periodo_inicio,periodo_fim,dados').eq('setor_id',sid).in('periodo_fim',[dia,ant]).in('periodo_inicio',[dia,ini]));
  const itens=r=>(r?.dados?.secoes||[]).flatMap(s=>s.itens||[]);
  const so=R.find(r=>r.periodo_inicio===dia && r.periodo_fim===dia);
  let out=null;
  if(so) out=itens(so).map(i=>({...i, val:+i.val||0, q:+i.q||0}));
  else { const a=R.find(r=>r.periodo_inicio===ini && r.periodo_fim===dia), b=R.find(r=>r.periodo_inicio===ini && r.periodo_fim===ant);
    if(a && b){ const m=new Map(itens(b).map(i=>[String(i.c),i]));
      out=itens(a).map(i=>{ const o=m.get(String(i.c)); return {...i, val:round2((+i.val||0)-(+o?.val||0)), q:round2((+i.q||0)-(+o?.q||0))}; }); } }
  return _itDia[k]=out;
}

/* ---------- perda × ruptura ---------- */
async function cardPerdaRuptura(box, sid, itensComPerda, fim){
  let r; try{ r=await q(S.sb.rpc('ruptura_produtos',{p_setor:sid, p_fim:fim})); }catch(_){ return; }
  if(!box.isConnected || !r || !r.length) return;
  const porC=new Map(itensComPerda.map(i=>[String(i.c),i]));
  const ambos=r.map(x=>({x, i:porC.get(String(x.c))})).filter(y=>y.i && y.i.val>0);
  const el=document.createElement('div'); el.className='card'; el.style.marginTop='12px';
  el.innerHTML=`<div class="row" style="flex-wrap:wrap;gap:6px"><h2 style="margin:0">⚖️ Perde e também falta</h2><div class="sp"></div><span class="small muted">produtos com perda no período e em ruptura agora</span></div>
    ${ambos.length? `<p class="small muted" style="margin:4px 0 8px">Perder muito e ao mesmo tempo faltar na gôndola indica problema de pedido (chega muito de uma vez e depois some) ou de exposição/validade, não de quantidade.</p>
    <div class="rup-l">${ambos.map(({x,i})=>`<div class="an-oli" style="cursor:default"><span>${esc(cap1(i.d))}<span class="small" style="display:block">perdeu ${brl0(i.val)} (${qtBR(i.q)}) · <b style="color:var(--bad)">sem venda há ${x.dias_sem} dia${x.dias_sem>1?'s':''}</b> · vendia ${(+x.media_q).toLocaleString('pt-BR',{maximumFractionDigits:1})}/dia</span></span><b style="color:var(--bad)">${brl0(i.val)}</b></div>`).join('')}</div>`
    : `<p class="small" style="margin:6px 0 0;color:var(--good);font-weight:600">✔ Nenhum produto com perda está em ruptura agora.</p><p class="small muted" style="margin:2px 0 0">${r.length} produto(s) do setor estão em ruptura, mas nenhum deles teve perda no período.</p>`}`;
  box.appendChild(el);
}

/* ---------- plano de ação ---------- */
async function carregarAcoes(sid){ return await q(S.sb.from('acoes_perda').select('*').eq('setor_id',sid).order('status').order('prazo',{ascending:true,nullsFirst:false}).order('criado_em',{ascending:false})); }
function novaAcaoPerda(sid, item, periodo, dias, aoSalvar){
  const pd = dias? item.val/dias : null;
  const m=modal(`<h2>📝 Plano de ação</h2>
    <p style="margin:0 0 8px"><b>${esc(cap1(item.d))}</b> <span class="small muted">${esc(item.grupo?item.grupo.map(g=>g.c).join(' - '):item.c)}</span><br><span class="small">perdeu ${brl(item.val)} (${qtBR(item.q)}) de ${esc(periodo)}${pd!=null?` · ${brl(pd)} por dia`:''}</span></p>
    <label class="f">O que vai ser feito<textarea id="acTxt" rows="3" placeholder="Ex.: reduzir o pedido de segunda pela metade; expor na ilha de ofertas; rebaixar com 2 dias de validade" style="border:1px solid var(--line);border-radius:9px;padding:8px;font:inherit"></textarea></label>
    <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><label class="f" style="flex:1;min-width:160px">Quem faz<input id="acQuem" value="${esc(S.perfil?.nome||'')}" style="border:1px solid var(--line);border-radius:9px;padding:8px"></label>
      <label class="f" style="flex:1;min-width:140px">Até quando<input id="acPrazo" type="date" value="${isoOf(new Date(Date.now()+7*864e5))}" style="border:1px solid var(--line);border-radius:9px;padding:8px"></label></div>
    <div id="acErr" class="note err small hide" style="margin-top:8px"></div>
    <div class="row" style="margin-top:12px"><div class="sp"></div><button class="btn" id="mN">Cancelar</button><button class="btn p" id="mY">Salvar ação</button></div>`);
  $('#mN',m).onclick=closeModal;
  $('#mY',m).onclick=async()=>{ const acao=$('#acTxt',m).value.trim(); if(!acao){ const e=$('#acErr',m); e.textContent='Escreva o que vai ser feito.'; e.classList.remove('hide'); return; }
    $('#mY',m).disabled=true;
    try{ await q(S.sb.from('acoes_perda').insert({ setor_id:sid, codigo:String(item.c), descricao:item.d, acao, responsavel:$('#acQuem',m).value.trim()||null, prazo:$('#acPrazo',m).value||null, perda_dia_ref: pd!=null? round2(pd) : null, periodo_ref:periodo }));
      closeModal(); toast('Ação salva ✔'); aoSalvar&&aoSalvar(); }
    catch(e){ const er=$('#acErr',m); er.textContent='Não foi possível salvar: '+e.message; er.classList.remove('hide'); $('#mY',m).disabled=false; } };
}
async function cardPlanoAcao(el, sid, itens, dias, periodo, redesenhar){
  let A; try{ A=await carregarAcoes(sid); }catch(e){ el.innerHTML=''; return; } if(!el.isConnected) return;
  const porC=new Map(itens.map(i=>[String(i.c),i]));
  const hoje=todayIso();
  const linha=a=>{ const i=porC.get(String(a.codigo)); const agora = i&&dias? i.val/dias : (dias?0:null);
    const v = a.perda_dia_ref && agora!=null ? agora/a.perda_dia_ref-1 : null;
    const atras = a.status==='aberta' && a.prazo && a.prazo<hoje;
    return `<div class="acp-i ${a.status!=='aberta'?'acp-ok':''}">
      <div class="acp-t"><b>${esc(cap1(a.descricao||a.codigo))}</b> <span class="small muted">${esc(a.codigo.startsWith('G')?'grupo':a.codigo)}</span>
        <div>${esc(a.acao)}</div>
        <div class="small muted">${a.responsavel?`👤 ${esc(a.responsavel)} · `:''}${a.prazo?`<span style="${atras?'color:var(--bad);font-weight:700':''}">📅 até ${fD(a.prazo)}${atras?' (atrasada)':''}</span> · `:''}criada em ${fD(a.criado_em.slice(0,10))}</div>
        <div class="small">perda/dia quando criou: <b>${a.perda_dia_ref!=null?brl(a.perda_dia_ref):'—'}</b>${a.periodo_ref?` <span class="muted">(${esc(a.periodo_ref)})</span>`:''} → agora: <b>${agora!=null?brl(agora):'—'}</b>${v!=null?` <span style="color:${v<=0?'var(--good)':'var(--bad)'};font-weight:700">${v<=0?'▼':'▲'} ${pctBR(Math.abs(v),0)}</span>`:''} <span class="muted">(${esc(periodo)})</span></div></div>
      <div class="acp-s"><select data-acs="${a.id}" style="border:1px solid var(--line);border-radius:8px;padding:4px 6px">${[['aberta','Em aberto'],['feita','Feita'],['cancelada','Cancelada']].map(([k,t])=>`<option value="${k}" ${a.status===k?'selected':''}>${t}</option>`).join('')}</select>${S.gerente?`<button class="btn" data-acd="${a.id}" title="Apagar" aria-label="Apagar ação">✕</button>`:''}</div></div>`; };
  const abertas=A.filter(a=>a.status==='aberta'), outras=A.filter(a=>a.status!=='aberta');
  el.innerHTML=`<div class="card" style="margin-top:12px"><div class="row" style="flex-wrap:wrap;gap:6px"><h2 style="margin:0">📝 Plano de ação</h2>${abertas.length?`<span class="badge">${abertas.length} em aberto</span>`:''}<div class="sp"></div><span class="small muted">toque em <b>＋ ação</b> num produto da lista para criar</span></div>
    ${A.length? `<div class="acp-l">${abertas.map(linha).join('')}</div>${outras.length?`<details style="margin-top:6px"><summary class="small" style="cursor:pointer">${outras.length} feita(s)/cancelada(s)</summary><div class="acp-l">${outras.map(linha).join('')}</div></details>`:''}`
      : '<p class="small muted" style="margin:6px 0 0">Nenhuma ação ainda. Nos produtos que mais perdem, anote o que vai ser feito, quem faz e até quando. O site compara a perda por dia de quando a ação foi criada com a de agora.</p>'}</div>`;
  el.querySelectorAll('[data-acs]').forEach(s=>s.onchange=async()=>{ try{ await q(S.sb.from('acoes_perda').update({status:s.value, atualizado_em:new Date().toISOString()}).eq('id',+s.dataset.acs)); toast('Ação atualizada ✔'); redesenhar(); }catch(e){ toast(e.message,5000); } });
  el.querySelectorAll('[data-acd]').forEach(b=>b.onclick=()=>confirmBox('Apagar essa ação?', async()=>{ try{ await q(S.sb.from('acoes_perda').delete().eq('id',+b.dataset.acd)); redesenhar(); }catch(e){ toast(e.message,5000); } }));
}
