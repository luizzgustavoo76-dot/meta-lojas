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
    let comRel=null; if(sid && modo==='mes' && doc){ try{ comRel=diasComRelatorio(await q(S.sb.from('analise_perdas').select('periodo_inicio,periodo_fim').eq('setor_id',sid).gte('periodo_fim',ini).lte('periodo_fim',fimDoMes(doc.mes))), doc.mes); }catch(_){ } }
    if(!box.isConnected) return false;
    const porDia={}; for(const x of L){ const d=porDia[x.data]=porDia[x.data]||{data:x.data,p:0,v:0,set:[]}; d.p+=+x.perda||0; d.v+=+x.venda||0; if(+x.perda) d.set.push(x); }
    const ds=Object.values(porDia).filter(x=>x.v>0);
    const W=[0,1,2,3,4,5,6].map(w=>({w, n:0, p:0, v:0, dias:[]}));
    for(const x of ds){ const w=new Date(x.data+'T12:00:00').getDay(); W[w].n++; W[w].p+=x.p; W[w].v+=x.v; W[w].dias.push(x); }
    const nomes=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'], plural=['Domingos','Segundas','Terças','Quartas','Quintas','Sextas','Sábados'];
    const ws=W.filter(x=>x.n).map(x=>({...x, media:x.p/x.n, pc:x.v? x.p/x.v : 0}));
    const tot=ws.reduce((a,x)=>a+x.n,0), mediaGeral=tot? ws.reduce((a,x)=>a+x.p,0)/tot : 0; const max=Math.max(0,...ws.map(x=>x.media))||1;
    const pior=mediaGeral? [...ws].sort((a,b)=>b.media-a.media)[0] : null;
    const poucos = false;
    const sel=(m,t)=>`<button type="button" class="dsm-m ${modo===m?'on':''}" data-m="${m}">${t}</button>`;
    el.innerHTML=`<div class="row" style="flex-wrap:wrap;gap:6px"><h2 style="margin:0">📅 ${modo==='mes'?'Perda dia a dia':'Perda por dia da semana'}</h2><div class="sp"></div>
      <div class="dsm-ms" role="group" aria-label="Período">${sel('mes',doc?mesLabel(doc.mes):'Este mês')}${sel('8s','Últimas 8 semanas')}</div></div>
      <div class="small muted" style="margin-top:4px">${modo==='mes'?'média do mês':'média das últimas 8 semanas'} (${fD(ini)} a ${fD(fim)}) · sem balanços${poucos?' · ainda são poucas datas de cada dia, a média vai firmar com o mês':''}</div>
      ${ws.length && modo==='mes' ? htmlCalPerda(doc, porDia, fim, ws, pior, nomes, mediaGeral, comRel) : ws.length?`<div class="dsm">${ws.map(x=>`<button type="button" class="dsm-i ${x===pior?'dsm-pior':''}" data-w="${x.w}" aria-expanded="false" title="Ver dia a dia"><div class="dsm-n">${nomes[x.w].slice(0,3)}</div><div class="dsm-ds">${modo==='mes'? [...x.dias].sort((a,b)=>a.data.localeCompare(b.data)).map(d=>+d.data.slice(8)).join(' · ') : `${x.n} datas`}</div><div class="dsm-bar"><i style="height:${Math.max(4,x.media/max*100)}%"></i></div><div class="dsm-v">${brl0(x.media)}</div><div class="small muted">${pctBR(x.pc,1)} da venda</div></button>`).join('')}</div>
      <p class="small muted" style="margin:6px 0 0">👆 Toque num dia para ver cada data e o que foi perdido.</p>
      <div class="dsm-det hide"></div>
      ${pior?`<p class="small" style="margin:8px 0 0"><b>${nomes[pior.w]}</b> é o dia que mais perde: ${brl0(pior.media)} em média, ${(pior.media/mediaGeral).toLocaleString('pt-BR',{maximumFractionDigits:1})}× a média dos outros dias. Vale olhar o pedido e a exposição da véspera.</p>`:''}`
      : '<p class="small muted" style="margin:8px 0 0">Ainda não tem venda lançada nesse período.</p>'}`;
    el.querySelectorAll('.dsm-m').forEach(b=>b.onclick=()=>{ if(b.dataset.m!==modo) desenhar(b.dataset.m); });
    ligarCal(el, (k, cd)=>{
      const d=porDia[k], dow=nomes[new Date(k+'T12:00:00').getDay()], n=diasSemPerdaAntes(porDia, k);
      cd.innerHTML=`<div class="dsm-h"><b>${dow}, ${fD(k)}</b> · perdeu <b>${brl0(d?.p||0)}</b> · ${d?.v?`${pctBR(d.p/d.v,1)} da venda de ${brl0(d.v)}`:'sem venda lançada'}</div>
        ${n>=3 && (d?.p||0)>=100?`<div class="note small" style="margin-top:6px">⚠️ Antes desse dia o ${sid?'setor':'loja'} ficou <b>${n} dias sem lançar perda</b> (${fD(diaAnt(k).slice(0,8)+String(+k.slice(8)-n).padStart(2,'0'))} a ${fD(diaAnt(k))}). Esse valor pode ser a perda de vários dias lançada junta.</div>`:''}
        <div class="dsm-dd small muted" style="padding:8px 0 0">carregando…</div>`;
      abrirDiaPerda($('.dsm-dd',cd), d, sid);
    });
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
function htmlCalPerda(doc, porDia, fim, ws, pior, nomes, mediaGeral, comRel){
  const vals=Object.values(porDia).filter(d=>d.v>0&&d.data<=fim).map(d=>d.p), mx=Math.max(0,...vals)||1;
  const srt=[...vals].sort((a,b)=>a-b), med=srt.length? srt[Math.floor(srt.length/2)] : 0;
  const num=v=>Math.round(v).toLocaleString('pt-BR');
  let temJunta=false;
  const cel=k=>{ const d=porDia[k], dd=+k.slice(8);
    if(k>fim || !d || !(d.v>0)) return null;
    const fora=d.p>0 && d.p>=2*med && d.p-med>=100 && d.p>=mediaGeral*1.5;
    const junta=d.p>=100 && diasSemPerdaAntes(porDia, k)>=3; if(junta) temJunta=true;
    const a=d.p>0? 0.12+0.6*d.p/mx : 0;
    return `<button type="button" class="cal-c ${fora?'cal-fora':''}" data-dia="${k}" aria-expanded="false" title="${fD(k)}: perdeu ${brl0(d.p)}${junta?' · pode ser perda de vários dias lançada junta':''}" style="background:${d.p>0?`rgba(42,120,214,${a.toFixed(2)})`:'#fff'}">
      <span class="cal-n">${dd}${junta?' <span class="cal-j">⚠</span>':''}</span>${comRel&&comRel.has(k)?'<span class="cal-r" title="relatório de produtos do dia importado"></span>':''}<span class="cal-v">${d.p>0?num(d.p):'—'}</span><span class="cal-p">${d.p>0?pctBR(d.p/d.v,1):''}</span></button>`; };
  const porW=Object.fromEntries(ws.map(x=>[x.w,x]));
  const rod=[0,1,2,3,4,5,6].map(w=>{ const x=porW[w]; return x? {on:x===pior, html:`<span>média</span><b>${num(x.media)}</b><span>${pctBR(x.pc,1)}</span>`} : null; });
  const grade=calGrid(doc.mes, cel, rod);
  const nRel=comRel? [...comRel].filter(k=>k<=fim).length : 0;
  return `${grade}
    <p class="small muted" style="margin:6px 0 0">Valores em R$ · quanto mais azul, mais perdeu · borda vermelha = dia fora do normal${temJunta?' · ⚠ = veio depois de 3 dias ou mais sem perda (pode ser perda lançada junta)':''}${comRel?` · <span class="cal-r cal-r-lg"></span> = tem os produtos do dia (${nRel? nRel+' dia'+(nRel===1?'':'s') : 'nenhum ainda'})`:''} · 👆 toque num dia para ver o que foi perdido.</p>
    <div class="cal-det hide"></div>
    ${pior&&mediaGeral?`<p class="small" style="margin:8px 0 0">Em média, <b>${nomes[pior.w].toLowerCase()}</b> é o dia que mais perde: ${brl0(pior.media)}, ${(pior.media/mediaGeral).toLocaleString('pt-BR',{maximumFractionDigits:1})}× a média dos outros dias.</p>`:''}`;
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
  const lyP=lyMesmoDia(sid, d.data);
  let corpo;
  if(!(d.p>0)) corpo='<div class="muted">Nenhuma perda lançada nesse dia.</div>';
  else if(!sid){ const ls=[...d.set].sort((a,b)=>b.perda-a.perda);
    corpo=`<div class="dsm-pl">${ls.map(x=>`<div><span>${esc(nomeSetor(x.setor_id))}</span><span class="muted">${x.venda?pctBR(x.perda/x.venda,1):''}</span><b>${brl0(+x.perda)}</b></div>`).join('')}</div>`; }
  else { const it=await itensPerdaDoDia(sid, d.data).catch(()=>null);
    if(!it) corpo=`<div class="muted">Os produtos desse dia não estão no site. Para ver o que foi perdido, importe na aba Perdas o relatório de perdas <b>só do dia ${fD(d.data)}</b> (de ${fD(d.data)} a ${fD(d.data)}).</div>`;
    else { const ls=it.filter(i=>i.val>0.009).sort((a,b)=>b.val-a.val), tot=ls.reduce((a,i)=>a+i.val,0), top=ls.slice(0,12);
      corpo= !ls.length? '<div class="muted">Nenhum produto com perda nesse dia.</div>' : `<div class="dsm-pl">${top.map(i=>`<div><span>${esc(cap1(i.d))} <span class="muted">${esc(String(i.c))}</span></span><span class="muted">${qtBR(i.q)} ${/(^|\s)KG(\s|$)/i.test(i.d||'')?'kg':'un'}</span><b>${brl(i.val)}</b></div>`).join('')}</div>
        <div class="muted" style="margin-top:4px">${ls.length} produto(s) · ${brl(tot)}${ls.length>top.length?` · mostrando os ${top.length} maiores`:''}${top[0]&&tot?` · <b>${esc(cap1(top[0].d))}</b> foi ${pctBR(top[0].val/tot,0)} da perda do dia`:''}</div>`; } }
  const ly=await lyP; if(!box.isConnected) return;
  box.classList.remove('muted');
  box.innerHTML=htmlLyPerda(ly, d, d.data)+corpo;
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

/* ---------- preço × quantidade e o que melhorou ---------- */
function mesesAtras(k, n){ const [y,m,d]=k.split('-').map(Number); const t=new Date(y, m-1-n, 1); const ult=new Date(t.getFullYear(), t.getMonth()+1, 0).getDate(); return isoOf(new Date(t.getFullYear(), t.getMonth(), Math.min(d, ult), 12)); }
function decomporPerda(itens, base){
  const bm=new Map(base.map(i=>[String(i.c),i])), vistos=new Set(), ls=[];
  for(const i of itens){ const o=bm.get(String(i.c)); vistos.add(String(i.c));
    const v1=+i.val||0, q1=+i.q||0, v0=o?+o.val||0:0, q0=o?+o.q||0:0; if(!v1&&!v0) continue;
    let dq, dp;
    if(!o || q0<=0 || q1<=0){ dq=v1-v0; dp=0; }
    else { const c0=v0/q0, c1=v1/q1; dq=(q1-q0)*c0; dp=(c1-c0)*q1; }
    ls.push({c:i.c, d:i.d, v1, v0, q1, q0, dq, dp, dt:v1-v0, novo:!o||!v0}); }
  for(const o of base){ if(vistos.has(String(o.c)) || !(+o.val>0)) continue; ls.push({c:o.c, d:o.d, v1:0, v0:+o.val, q1:0, q0:+o.q||0, dq:-(+o.val), dp:0, dt:-(+o.val), sumiu:true}); }
  const Q=ls.reduce((a,x)=>a+x.dq,0), P=ls.reduce((a,x)=>a+x.dp,0);
  return { ls, Q, P, T:Q+P };
}
async function cardPerdaComparar(el, sid, reg, itens, gruposS){
  const per=[ {k:'mp', t:'mês passado', ini:mesesAtras(reg.periodo_inicio,1), fim:mesesAtras(reg.periodo_fim,1)}, {k:'ap', t:'ano passado', ini:addAnos(reg.periodo_inicio,-1), fim:addAnos(reg.periodo_fim,-1)} ];
  let bases=[];
  try{ for(const p of per){ const r=(await q(S.sb.from('analise_perdas').select('valor,dados').eq('setor_id',sid).eq('periodo_inicio',p.ini).eq('periodo_fim',p.fim).limit(1)))[0]; if(r) bases.push({...p, itens:agruparItensPerda(r.dados.secoes.flatMap(x=>x.itens.map(i=>({...i, sec:x.nome}))), gruposS)}); } }catch(_){ }
  let acoes=new Set(); try{ acoes=new Set((await carregarAcoes(sid)).map(a=>String(a.codigo))); }catch(_){ }
  if(!el.isConnected) return;
  if(!bases.length){ el.innerHTML=`<div class="card" style="margin-top:12px"><h2 style="margin:0">⚖️ Preço ou quantidade? · ✅ O que melhorou</h2><p class="small muted" style="margin:6px 0 0">Para comparar, importe o relatório de perdas do mesmo período do mês passado (${fD(per[0].ini)} a ${fD(per[0].fim)}) ou do ano passado (${fD(per[1].ini)} a ${fD(per[1].fim)}).</p></div>`; return; }
  S.perBase=S.perBase||{}; let b=bases.find(x=>x.k===S.perBase[sid])||bases[0];
  const desenhar=()=>{
    const D=decomporPerda(itens, b.itens), cor=v=>Math.abs(v)<1?'var(--muted)':v>0?'var(--bad)':'var(--good)', sg=v=>Math.abs(v)<1?'R$ 0':(v>0?'+':'−')+brl0(Math.abs(v));
    const sel=bases.length>1? `<div class="dsm-ms" role="group" aria-label="Comparar com">${bases.map(x=>`<button type="button" class="dsm-m ${x===b?'on':''}" data-b="${x.k}">${x.t[0].toUpperCase()+x.t.slice(1)}</button>`).join('')}</div>` : `<span class="small muted">contra o ${b.t}</span>`;
    const tot0=b.itens.reduce((a,i)=>a+(+i.val||0),0), tot1=itens.reduce((a,i)=>a+(+i.val||0),0);
    const mx=Math.max(Math.abs(D.Q),Math.abs(D.P),1);
    const barra=(v,t,sub)=>`<div class="pq-l"><div class="pq-t"><b>${t}</b><span class="small muted">${sub}</span></div><div class="pq-b"><i style="width:${Math.abs(v)/mx*100}%;background:${cor(v)}"></i></div><b style="color:${cor(v)}">${sg(v)}</b></div>`;
    let frase;
    if(Math.abs(D.T)<1) frase='A perda ficou praticamente igual.';
    else if(D.T>0) frase = D.P>0 && D.P>=D.Q ? `A perda subiu mais pelo <b>custo mais alto</b> dos produtos do que por perder mais. A quantidade perdida ${D.Q>=1?'também subiu, mas menos':D.Q<=-1?'até caiu':'ficou igual'}.` : `A perda subiu principalmente porque <b>se perdeu mais quantidade</b>${D.P>0?'; o custo mais alto também ajudou a subir':'; o custo até ajudou a segurar'}.`;
    else frase = D.Q<0 && D.Q<=D.P ? `A perda caiu porque <b>se perdeu menos quantidade</b>${D.P>0?', mesmo com o custo mais alto':''}. Melhora de verdade.` : `A perda caiu mais por <b>custo mais baixo</b> dos produtos do que por perder menos.`;
    const topQ=[...D.ls].filter(x=>x.dq>0).sort((a,b)=>b.dq-a.dq).slice(0,5), topP=[...D.ls].filter(x=>x.dp>0).sort((a,b)=>b.dp-a.dp).slice(0,5);
    const lista=(ls,f)=>ls.length? `<div class="dsm-pl small">${ls.map(x=>`<div><span>${esc(cap1(x.d))}${x.novo?' <span class="an-novo">nova</span>':''}</span><span class="muted">${f(x)}</span><b style="color:var(--bad)">+${brl0(f===fq?x.dq:x.dp)}</b></div>`).join('')}</div>` : '<div class="small muted">nenhum</div>';
    const fq=x=>x.novo? `${qtBR(x.q1)} perdidos (não tinha)` : `${qtBR(x.q0)} → ${qtBR(x.q1)}`;
    const fp=x=>`${brl(x.v0/x.q0)} → ${brl(x.v1/x.q1)}`;
    // o que melhorou
    const mel=[...D.ls].filter(x=>x.dt<-0.5).sort((a,b)=>a.dt-b.dt), somaMel=mel.reduce((a,x)=>a+x.dt,0);
    const melQ=mel.filter(x=>x.dq<0 && x.dq<=x.dp);
    el.innerHTML=`<div class="card" style="margin-top:12px"><div class="row" style="flex-wrap:wrap;gap:6px"><h2 style="margin:0">⚖️ Preço ou quantidade?</h2><div class="sp"></div>${sel}</div>
      <div class="small muted" style="margin-top:4px">${b.t[0].toUpperCase()+b.t.slice(1)} (${fD(b.ini)} a ${fD(b.fim)}): ${brl0(tot0)} → agora: ${brl0(tot1)} · <b style="color:${cor(D.T)}">${sg(D.T)}</b></div>
      <div class="pq" style="margin-top:8px">${barra(D.Q,'Quantidade','perdeu mais ou menos quilos/unidades')}${barra(D.P,'Preço','custo dos produtos mais alto ou mais baixo')}</div>
      <p class="small" style="margin:8px 0 0">${frase}</p>
      <div class="pq-2"><div><div class="small" style="font-weight:700;margin:8px 0 4px">Mais subiram por quantidade</div>${lista(topQ,fq)}</div>
        <div><div class="small" style="font-weight:700;margin:8px 0 4px">Mais subiram por preço (custo do kg/un)</div>${lista(topP,fp)}</div></div>
      ${(()=>{ const todosP=[...D.ls].sort((a,b)=>b.dt-a.dt); const sub=todosP.filter(x=>x.dt>=0.5), des=todosP.filter(x=>x.dt<=-0.5).reverse();
        const lin=x=>{ const qtd = x.novo? `não tinha · agora ${qtBR(x.q1)}` : x.sumiu? `tinha ${qtBR(x.q0)} · agora nada` : `qtd ${qtBR(x.q0)} → ${qtBR(x.q1)}`;
          const cu = (x.q0>0&&x.q1>0)? ` · custo ${brl(x.v0/x.q0)} → ${brl(x.v1/x.q1)}` : '';
          return `<div><span><span class="muted">${esc(String(x.c))}</span> ${esc(cap1(x.d))}<span class="muted" style="display:block;font-size:11.5px">${qtd}${cu}</span></span><span class="muted" style="text-align:right;font-size:11.5px">qtd ${sg(x.dq)}<br>preço ${sg(x.dp)}</span><b style="color:${cor(x.dt)}">${sg(x.dt)}</b></div>`; };
        const blk=(t,arr)=>`<div><div class="small" style="font-weight:700;margin:8px 0 4px">${t} (${arr.length})</div><div class="dsm-pl small">${arr.map(lin).join('')||'<span class="muted">nenhum</span>'}</div></div>`;
        return `<details style="margin-top:10px"><summary class="small" style="cursor:pointer;font-weight:700">🔎 Ver todos os produtos: o que aumentou e o que diminuiu (${todosP.length})</summary>
          <div class="pq-2">${blk('📈 Aumentaram a perda', sub)}${blk('📉 Diminuíram a perda', des)}</div></details>`; })()}
      </div>
    <div class="card" style="margin-top:12px"><div class="row" style="flex-wrap:wrap;gap:6px"><h2 style="margin:0">✅ O que melhorou</h2><div class="sp"></div><span class="small muted">contra o ${b.t}</span></div>
      ${mel.length? `<p class="small" style="margin:6px 0 8px"><b>${mel.length} produto(s)</b> perderam menos, somando <b style="color:var(--good)">${brl0(-somaMel)} a menos</b>. ${melQ.length} deles por perder menos quantidade.</p>
      <div class="dsm-pl small">${mel.slice(0,10).map(x=>{ const qtd=x.sumiu? 'não teve perda agora' : x.q0? `qtd ${qtBR(x.q0)} → ${qtBR(x.q1)}` : ''; const porQ=x.dq<0 && x.dq<=x.dp;
        return `<div><span>${esc(cap1(x.d))}${acoes.has(String(x.c))?' <span class="badge" title="tem plano de ação">📝 ação</span>':''}<span class="muted" style="display:block;font-size:11.5px">${brl0(x.v0)} → ${brl0(x.v1)} · ${qtd}${porQ?'':' · <span title="caiu mais pelo custo do que pela quantidade">mais pelo preço</span>'}</span></span><span class="muted">${x.v0?'▼ '+pctBR(-x.dt/x.v0,0):''}</span><b style="color:var(--good)">−${brl0(-x.dt)}</b></div>`; }).join('')}</div>`
      : '<p class="small muted" style="margin:6px 0 0">Nenhum produto perdeu menos do que no período de comparação.</p>'}</div>`;
    el.querySelectorAll('[data-b]').forEach(x=>x.onclick=()=>{ b=bases.find(y=>y.k===x.dataset.b); S.perBase[sid]=b.k; desenhar(); });
  };
  desenhar();
}

/* ---------- folha do encarregado (imprimir / PDF no celular) ---------- */
async function dadosFolhaPerdas(s, reg, itens, LY, lyMap, venda){
  const sid=s.id, doc=curDoc(); let tetos={}, A=[];
  try{ [tetos, A]=await Promise.all([carregarTetos(), carregarAcoes(sid)]); }catch(_){ }
  const O = doc? orcamentoPerda(doc, tetos, sid).ls[0] : null;
  const tot=itens.reduce((a,i)=>a+(+i.val||0),0), com=itens.filter(i=>i.q>0).sort((a,b)=>b.val-a.val);
  const saida=i=>i.v+i.q>0? i.q/(i.v+i.q) : 0;
  let ac=0,n80=0; for(const i of com){ ac+=i.val; n80++; if(ac>=tot*0.8) break; }
  const hoje=todayIso();
  const dica=i=>{ const sd=saida(i); return sd>=0.3? 'pedir menos e rebaixar' : sd>=0.15? 'rebaixar mais cedo' : i.e>0&&i.q/i.e>=0.1? 'conferir validade' : ''; };
  return { setor:s.nome, sid, periodo:`${fD(reg.periodo_inicio)} a ${fD(reg.periodo_fim)}`, hoje, tot, venda, LY, O, n80, temLy:!!LY,
    kpis:[ ['Perda no período', brl0(tot), LY?`ano passado ${brl0(+LY.valor)}`:''],
           ['% da venda', venda?pctBR(tot/venda,2):'—', O?`teto ${O.teto.toLocaleString('pt-BR')}%`:''],
           [O&&O.falta<0?'Passou do teto':'Ainda pode perder no mês', O?brl0(Math.abs(O.falta)):'—', O&&O.falta>=0&&O.porDia!=null?`cerca de ${brl0(O.porDia)} por dia`:''],
           ['Concentração', `${n80} produto(s)`, 'fazem 80% da perda'] ],
    prods: com.slice(0,12).map((i,k)=>{ const o=lyMap&&lyMap.get(String(i.c)); return { n:k+1, d:cap1(i.d), c:i.grupo?i.grupo.map(g=>g.c).join(' - '):String(i.c), e:qtBR(i.e), q:qtBR(i.q), val:brl0(i.val), sai:pctBR(saida(i),0), ly:o?brl0(o.val):'—', dica:dica(i) }; }),
    acoes: A.filter(a=>a.status==='aberta').map(a=>({ d:cap1(a.descricao||a.codigo), acao:a.acao, quem:a.responsavel||'', ate:a.prazo? fD(a.prazo)+(a.prazo<hoje?' (atrasada)':'') : '' })) };
}
function usarPdfFolha(){ return matchMedia('(max-width:760px)').matches || matchMedia('(pointer:coarse)').matches || !!navigator.standalone; }
async function imprimirFolhaPerdas(s, reg, itens, LY, lyMap, venda){
  if(usarPdfFolha()) return pdfFolhaPerdas(s, reg, itens, LY, lyMap, venda);
  const F=await dadosFolhaPerdas(s, reg, itens, LY, lyMap, venda);
  const html=`<div class="fi">
    <div class="fi-h"><div><div class="fi-loja">Bom Dia São Luiz · Araruna</div><h1>Folha de perdas — ${esc(F.setor)}</h1><div class="fi-sub">Período ${F.periodo} · impresso em ${fD(F.hoje)}</div></div><img src="logo.png" alt=""></div>
    <div class="fi-k">${F.kpis.map(k=>`<div><span>${esc(k[0])}</span><b>${esc(k[1])}</b><small>${esc(k[2])||'&nbsp;'}</small></div>`).join('')}</div>
    <h2>Produtos que mais perdem</h2>
    <table><thead><tr><th>#</th><th>Produto</th><th class="n">Entrou</th><th class="n">Perdeu</th><th class="n">R$</th><th class="n">% do que sai</th>${F.temLy?'<th class="n">Ano pass.</th>':''}<th>O que fazer</th></tr></thead><tbody>
      ${F.prods.map(p=>`<tr><td>${p.n}</td><td>${esc(p.d)} <small>${esc(p.c)}</small></td><td class="n">${p.e}</td><td class="n">${p.q}</td><td class="n"><b>${p.val}</b></td><td class="n">${p.sai}</td>${F.temLy?`<td class="n">${p.ly}</td>`:''}<td>${esc(p.dica)}</td></tr>`).join('')}
    </tbody></table>
    <h2>Plano de ação em aberto</h2>
    ${F.acoes.length? `<table><thead><tr><th>Produto</th><th>O que vai ser feito</th><th>Quem</th><th>Até</th><th>Feito?</th></tr></thead><tbody>${F.acoes.map(a=>`<tr><td>${esc(a.d)}</td><td>${esc(a.acao)}</td><td>${esc(a.quem)}</td><td>${esc(a.ate)}</td><td class="fi-box">☐</td></tr>`).join('')}</tbody></table>` : '<p class="fi-vazio">Nenhuma ação em aberto. Anote abaixo o que vai ser feito nos produtos da lista.</p>'}
    <h2>Anotações</h2>
    <div class="fi-lin">${'<div></div>'.repeat(F.acoes.length>3?3:5)}</div>
    <div class="fi-ass"><div>Encarregado</div><div>Gerente</div></div>
  </div>`;
  let el=document.getElementById('folhaImp'); if(!el){ el=document.createElement('div'); el.id='folhaImp'; document.body.appendChild(el); }
  el.innerHTML=html; document.body.classList.add('imprimindo');
  const fim=()=>{ document.body.classList.remove('imprimindo'); window.removeEventListener('afterprint', fim); };
  window.addEventListener('afterprint', fim);
  const img=el.querySelector('img'); const vai=()=>setTimeout(()=>window.print(), 50);
  if(img && !img.complete){ img.onload=vai; img.onerror=vai; } else vai();
}
function carregarPdfLib(){
  if(window.PDFLib) return Promise.resolve();
  return new Promise((ok,erro)=>{ const sc=document.createElement('script'); sc.src='vendor/pdf-lib.min.js?v=1'; sc.onload=()=>ok(); sc.onerror=()=>erro(new Error('não consegui carregar o gerador de PDF')); document.head.appendChild(sc); });
}
async function gerarPdfFolha(F){
  const {PDFDocument, StandardFonts, rgb}=window.PDFLib;
  const pdf=await PDFDocument.create(); const pg=pdf.addPage([595.28, 841.89]);
  const R=await pdf.embedFont(StandardFonts.Helvetica), B=await pdf.embedFont(StandardFonts.HelveticaBold);
  const W=595.28, M=32, cinza=rgb(.33,.33,.33), linha=rgb(.8,.8,.8), preto=rgb(.07,.07,.07), verm=rgb(.84,.12,.15);
  const safe=(t,f)=>{ let o=''; for(const ch of String(t??'').replace(/≈/g,'~').replace(/→/g,'->').replace(/[   ]/g,' ')){ try{ f.widthOfTextAtSize(ch,10); o+=ch; }catch(_){ o+='?'; } } return o; };
  const fit=(t,f,z,w)=>{ t=safe(t,f); if(f.widthOfTextAtSize(t,z)<=w) return t; while(t.length>1 && f.widthOfTextAtSize(t+'…',z)>w) t=t.slice(0,-1); return t+'…'; };
  const txt=(t,x,y,{f=R,z=10,c=preto,w=null,dir='l'}={})=>{ let s=w? fit(t,f,z,w) : safe(t,f); const tw=f.widthOfTextAtSize(s,z); pg.drawText(s,{x: dir==='r'? x-tw : x, y, size:z, font:f, color:c}); };
  const hl=(y,x1=M,x2=W-M,t=.6,c=linha)=>pg.drawLine({start:{x:x1,y},end:{x:x2,y},thickness:t,color:c});
  let y=841.89-M;
  // cabeçalho
  try{ const png=await (await fetch('logo.png')).arrayBuffer(); const img=await pdf.embedPng(png); const h=46, w=img.width/img.height*h; pg.drawImage(img,{x:W-M-w, y:y-h, width:w, height:h}); }catch(_){ }
  txt('Bom Dia São Luiz · Araruna', M, y-9, {z:9, c:cinza});
  txt(`Folha de perdas — ${F.setor}`, M, y-29, {f:B, z:18});
  txt(`Período ${F.periodo} · impresso em ${fD(F.hoje)}`, M, y-43, {z:9, c:cinza});
  y-=54; hl(y, M, W-M, 2.5, verm); y-=8;
  // kpis
  const kw=(W-2*M-18)/4;
  F.kpis.forEach((k,i)=>{ const x=M+i*(kw+6); pg.drawRectangle({x, y:y-46, width:kw, height:46, borderColor:rgb(.7,.7,.7), borderWidth:.8}); txt(k[0], x+6, y-12, {z:8, c:cinza, w:kw-12}); txt(k[1], x+6, y-29, {f:B, z:14, w:kw-12}); if(k[2]) txt(k[2], x+6, y-40, {z:8, c:cinza, w:kw-12}); });
  y-=62;
  // produtos
  txt('Produtos que mais perdem', M, y, {f:B, z:12}); y-=14;
  const cols = F.temLy
    ? [['#',14,'l'],['Produto',150,'l'],['Entrou',42,'r'],['Perdeu',40,'r'],['R$',48,'r'],['% sai',30,'r'],['Ano pass.',46,'r'],['O que fazer',0,'l']]
    : [['#',16,'l'],['Produto',200,'l'],['Entrou',50,'r'],['Perdeu',48,'r'],['R$',58,'r'],['% sai',40,'r'],['O que fazer',0,'l']];
  const xs=[]; let cx=M; cols.forEach(c=>{ xs.push(cx); cx+=c[1]+6; }); const ultW=W-M-xs[xs.length-1];
  const cel=(i,t,yy,o={})=>{ const c=cols[i], w=c[1]||ultW; txt(t, c[2]==='r'? xs[i]+w : xs[i], yy, {...o, w, dir:c[2]}); };
  cols.forEach((c,i)=>cel(i,c[0],y,{f:B,z:8,c:cinza})); y-=4; hl(y,M,W-M,1.2,rgb(.2,.2,.2)); y-=12;
  for(const p of F.prods){ const vals=[p.n, `${p.d}  ${p.c}`, p.e, p.q, p.val, p.sai].concat(F.temLy?[p.ly]:[]).concat([p.dica]);
    vals.forEach((v,i)=>cel(i, v, y, {z:9, f: cols[i][0]==='R$'?B:R})); y-=5; hl(y); y-=12; }
  y-=8;
  // ações
  txt('Plano de ação em aberto', M, y, {f:B, z:12}); y-=14;
  if(F.acoes.length){
    const ac=[['Produto',115],['O que vai ser feito',200],['Quem',62],['Até',98],['Feito?',0]]; const ax=[]; let x=M; ac.forEach(c=>{ ax.push(x); x+=c[1]+6; });
    ac.forEach((c,i)=>txt(c[0], ax[i], y, {f:B, z:8, c:cinza})); y-=4; hl(y,M,W-M,1.2,rgb(.2,.2,.2)); y-=12;
    for(const a of F.acoes.slice(0,6)){ [a.d,a.acao,a.quem,a.ate].forEach((v,i)=>txt(v, ax[i], y, {z:9, w:ac[i][1]})); pg.drawRectangle({x:ax[4]+6, y:y-2, width:10, height:10, borderColor:rgb(.2,.2,.2), borderWidth:.8}); y-=5; hl(y); y-=12; }
  } else { txt('Nenhuma ação em aberto. Anote abaixo o que vai ser feito nos produtos da lista.', M, y, {z:9, c:cinza}); y-=14; }
  y-=8;
  txt('Anotações', M, y, {f:B, z:12}); y-=6;
  const nLin=Math.max(2, Math.min(6, Math.floor((y-M-50)/20))); for(let i=0;i<nLin;i++){ y-=20; hl(y,M,W-M,.6,rgb(.65,.65,.65)); }
  y=Math.min(y-34, M+40); const half=(W-2*M-40)/2;
  hl(y, M, M+half, .8, rgb(.2,.2,.2)); hl(y, W-M-half, W-M, .8, rgb(.2,.2,.2));
  txt('Encarregado', M+half/2-R.widthOfTextAtSize('Encarregado',9)/2, y-11, {z:9}); txt('Gerente', W-M-half/2-R.widthOfTextAtSize('Gerente',9)/2, y-11, {z:9});
  return await pdf.save();
}
async function pdfFolhaPerdas(s, reg, itens, LY, lyMap, venda){
  busy('Montando a folha em PDF…');
  let file;
  try{ const [F]=await Promise.all([dadosFolhaPerdas(s, reg, itens, LY, lyMap, venda), carregarPdfLib()]);
    const bytes=await gerarPdfFolha(F);
    const nome=`folha-perdas-${normN2(s.nome).toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${reg.periodo_fim}.pdf`;
    file=new File([bytes], nome, {type:'application/pdf'}); }
  catch(e){ closeModal(); toast('Não consegui montar o PDF: '+(e.message||e), 6000); return; }
  closeModal();
  const url=URL.createObjectURL(file);
  const podeComp = navigator.canShare && navigator.canShare({files:[file]});
  const m=modal(`<h2>🖨️ Folha do encarregado</h2><p class="small" style="margin:0 0 10px">A folha de <b>${esc(s.nome)}</b> está pronta em PDF (uma página A4).</p>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${podeComp?`<button class="btn p" id="fpShare">📤 Imprimir ou enviar</button><p class="small muted" style="margin:-2px 0 2px">Abre o menu do celular: escolha <b>Imprimir</b>, ou mande pelo WhatsApp para o encarregado.</p>`:''}
      <a class="btn ${podeComp?'':'p'}" id="fpAbrir" href="${url}" target="_blank" rel="noopener" download="${esc(file.name)}" style="text-align:center;text-decoration:none">📄 Abrir / baixar o PDF</a>
    </div>
    <div class="row" style="margin-top:12px"><div class="sp"></div><button class="btn" id="mN">Fechar</button></div>`);
  $('#mN',m).onclick=()=>{ closeModal(); setTimeout(()=>URL.revokeObjectURL(url), 60000); };
  const sh=$('#fpShare',m); if(sh) sh.onclick=async()=>{ try{ await navigator.share({files:[file], title:`Folha de perdas — ${s.nome}`}); }catch(e){ if(e.name!=='AbortError') toast('Não deu para compartilhar: '+e.message, 5000); } };
}
