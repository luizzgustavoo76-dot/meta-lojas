/* ===================== Calendários dia a dia =====================
   - grade do mês (um quadrinho por dia) usada em Perdas, Vendas e Trocas
   - mesmo dia da semana do ano passado
   - trocas: acumula o relatório de um dia só no acumulado do mês */

const diaAnt = k => isoOf(new Date(new Date(k+'T12:00:00').getTime()-864e5));
const diaSeg = k => isoOf(new Date(new Date(k+'T12:00:00').getTime()+864e5));
const menos364 = k => isoOf(new Date(new Date(k+'T12:00:00').getTime()-364*864e5));
const DOW_NOME = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
const DOW_FEM = w => (w===0||w===6)? 'Mesmo' : 'Mesma';
const kBR = v => { v=+v||0; return Math.abs(v)>=1000 ? (v/1000).toLocaleString('pt-BR',{maximumFractionDigits:Math.abs(v)>=10000?0:1})+'k' : Math.round(v).toLocaleString('pt-BR'); };
const curtoBR = v => { v=+v||0; return Math.abs(v)>=10000 ? (v/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mil' : Math.round(v).toLocaleString('pt-BR'); };

/* grade: cell(k) devolve o html do quadrinho (ou null = vazio); rodape = 7 itens {html, on} ou null */
function calGrid(mes, cell, rodape){
  const dias=diasDoMes(mes), pad=new Date(dias[0]+'T12:00:00').getDay(), fill=(7-(pad+dias.length)%7)%7;
  return `<div class="cal">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(n=>`<div class="cal-h">${n}</div>`).join('')}
    ${'<div></div>'.repeat(pad)}${dias.map(k=>cell(k)||`<div class="cal-c cal-vazio"><span class="cal-n">${+k.slice(8)}</span></div>`).join('')}${'<div></div>'.repeat(fill)}
    ${rodape? rodape.map(r=>`<div class="cal-m ${r&&r.on?'cal-mp':''}">${r?r.html:''}</div>`).join('') : ''}</div>`;
}
function ligarCal(el, abrir){
  el.querySelectorAll('.cal-c[data-dia]').forEach(c=>c.onclick=()=>{
    const cd=$('.cal-det',el), aberto=c.classList.contains('cal-sel');
    el.querySelectorAll('.cal-c').forEach(b=>{ b.classList.remove('cal-sel'); if(b.dataset.dia) b.setAttribute('aria-expanded','false'); });
    if(aberto){ cd.classList.add('hide'); cd.innerHTML=''; return; }
    c.classList.add('cal-sel'); c.setAttribute('aria-expanded','true'); cd.classList.remove('hide'); abrir(c.dataset.dia, cd);
  });
}
/* dias do mês que têm o relatório de produtos do próprio dia (só do dia, ou acumulado do dia e da véspera) */
function diasComRelatorio(rows, mes){
  const ini=mes+'-01', K=new Set(rows.map(r=>r.periodo_inicio+'|'+r.periodo_fim)), out=new Set();
  for(const k of diasDoMes(mes)) if(K.has(k+'|'+k) || (k!==ini && K.has(ini+'|'+k) && K.has(ini+'|'+diaAnt(k)))) out.add(k);
  return out;
}
/* quantos dias seguidos (com venda) o setor ficou sem perda antes do dia k */
function diasSemPerdaAntes(porDia, k){
  let n=0, x=diaAnt(k); const mes=k.slice(0,7);
  while(x.startsWith(mes)){ const d=porDia[x]; if(!d || !(d.v>0)) break; if((d.p||0)>=1) break; n++; x=diaAnt(x); }
  return n;
}

/* ---------- mesmo dia da semana do ano passado ---------- */
const _ly={};
async function lyMesmoDia(sid, k){
  const d=menos364(k), key=(sid||'*')+'|'+d; if(key in _ly) return _ly[key];
  let r; try{ let b=S.sb.from('lancamentos').select('venda,perda').eq('data',d); if(sid) b=b.eq('setor_id',sid); r=await q(b); }catch(_){ return null; }
  return _ly[key] = r.length ? { data:d, v:r.reduce((a,x)=>a+(+x.venda||0),0), p:r.reduce((a,x)=>a+(+x.perda||0),0) } : { data:d, vazio:true };
}
function setaVar(atual, antes, ruimSobe){
  if(!antes) return ''; const v=atual/antes-1; const ruim = ruimSobe? v>0 : v<0;
  return ` <b style="color:${ruim?'var(--bad)':'var(--good)'}">${v>0?'▲':'▼'} ${pctBR(Math.abs(v),0)}</b>`;
}
function htmlLyPerda(ly, d, k){
  if(!ly) return ''; const w=new Date(k+'T12:00:00').getDay();
  const t=`${DOW_FEM(w)} ${DOW_NOME[w]} do ano passado (${fD(ly.data)})`;
  if(ly.vazio) return `<div class="cal-ly">📆 ${t}: sem lançamento.</div>`;
  return `<div class="cal-ly">📆 ${t}: perdeu <b>${brl0(ly.p)}</b>${ly.v?` · ${pctBR(ly.p/ly.v,1)} da venda`:''}${d&&ly.p?` → este ano${setaVar(d.p||0, ly.p, true)}`:''}</div>`;
}

/* ---------- vendas dia a dia (aba Dia a dia do setor) ---------- */
function montarCalVendas(box, s, doc, opts={}){
  if(!box) return;
  const fim=S.cutoff||todayIso(), por=Object.fromEntries(s.daily.map(d=>[d.k,d]));
  const cor=p=>({good:'cal-good',warn:'cal-warn',bad:'cal-bad'})[status(p)]||'';
  const W=[0,1,2,3,4,5,6].map(()=>({r:0,m:0,n:0}));
  for(const d of s.daily){ if(d.k>fim || !(d.real>0)) continue; const w=new Date(d.k+'T12:00:00').getDay(); W[w].r+=d.real; W[w].m+=d.meta; W[w].n++; }
  const comP=W.map((x,w)=>({...x,w,p:x.m? x.r/x.m : null})).filter(x=>x.n&&x.p!=null), pior=comP.length? [...comP].sort((a,b)=>a.p-b.p)[0] : null;
  const cel=k=>{ const d=por[k]; if(!d) return null; const dd=+k.slice(8);
    if(k>fim || !(d.real>0)) return `<div class="cal-c cal-vazio"><span class="cal-n">${dd}</span>${d.meta?`<span class="cal-p">meta <span class="d-inl">${curtoBR(d.meta)}</span><span class="m-inl">${kBR(d.meta)}</span></span>`:''}</div>`;
    const p=d.meta? d.real/d.meta : null;
    return `<button type="button" class="cal-c ${cor(p)}" data-dia="${k}" aria-expanded="false" title="${fD(k)}: vendeu ${brl0(d.real)}${p!=null?` (${pctBR(p,0)} da meta)`:''}"><span class="cal-n">${dd}</span><span class="cal-v"><span class="d-inl">${curtoBR(d.real)}</span><span class="m-inl">${kBR(d.real)}</span></span><span class="cal-p">${p!=null?pctBR(p,0):''}</span></button>`; };
  const rod=W.map((x,w)=>x.n? {on:pior&&pior.w===w, html:`<span>média</span><b><span class="d-inl">${curtoBR(x.r/x.n)}</span><span class="m-inl">${kBR(x.r/x.n)}</span></b><span>${x.m?pctBR(x.r/x.m,0)+' da meta':''}</span>`} : null);
  const nomes=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
  box.innerHTML=`<div class="card" style="margin-top:12px"><div class="row" style="flex-wrap:wrap;gap:6px"><h2 style="margin:0">${opts.titulo||'📅 Vendas dia a dia'}</h2><div class="sp"></div><span class="small muted">${mesLabel(doc.mes)} · até ${fD(fim)}</span></div>
    ${calGrid(doc.mes, cel, rod)}
    <p class="small muted" style="margin:6px 0 0">Valores em R$ e % da meta do dia · <span class="cal-lg cal-good"></span> bateu a meta · <span class="cal-lg cal-warn"></span> de 90% a 99% · <span class="cal-lg cal-bad"></span> abaixo de 90% · 👆 toque num dia para ver os detalhes.</p>
    <div class="cal-det hide"></div>
    ${pior&&pior.p<1?`<p class="small" style="margin:8px 0 0">O dia da semana que mais fica abaixo da meta é <b>${nomes[pior.w]}</b>: ${pctBR(pior.p,0)} da meta, em média.</p>`:''}</div>`;
  ligarCal(box, async(k, cd)=>{
    const d=por[k], p=d.meta? d.real/d.meta : null, w=new Date(k+'T12:00:00').getDay();
    cd.innerHTML=`<div class="dsm-h"><b>${cap1(DOW_NOME[w])}, ${fD(k)}</b> · vendeu <b>${brl0(d.real)}</b> de meta ${brl0(d.meta)}${p!=null?` (${pctBR(p,0)})`:''} · ${d.real>=d.meta?'sobrou':'faltou'} <b style="color:${d.real>=d.meta?'var(--good)':'var(--bad)'}">${brl0(Math.abs(d.real-d.meta))}</b></div>
      <div class="small" style="margin-top:4px">Perda do dia: <b>${brl0(d.perda||0)}</b>${d.perda&&d.real?` · ${pctBR(d.perda/d.real,1)} da venda`:''}</div><div class="small muted cal-lyv">carregando o ano passado…</div>${opts.setores? htmlSetoresDia(opts.setores, k) : ''}`;
    const ly=await lyMesmoDia(s.id, k); const e=$('.cal-lyv',cd); if(!e) return;
    e.classList.remove('muted');
    e.innerHTML = !ly? '' : ly.vazio? `📆 ${DOW_FEM(w)} ${DOW_NOME[w]} do ano passado (${fD(ly.data)}): sem lançamento.` : `📆 ${DOW_FEM(w)} ${DOW_NOME[w]} do ano passado (${fD(ly.data)}): vendeu <b>${brl0(ly.v)}</b> → este ano${setaVar(d.real, ly.v, false)}`;
  });
}

function htmlSetoresDia(setores, k){
  const ls=setores.map(s=>{ const d=s.daily.find(x=>x.k===k); return d&&d.meta? {nome:s.nome, real:d.real, meta:d.meta, p:d.real/d.meta} : null; }).filter(Boolean).sort((a,b)=>a.p-b.p);
  if(!ls.length) return '';
  const bat=ls.filter(x=>x.p>=1).length, cor=p=>({good:'var(--good)',warn:'var(--warn)',bad:'var(--bad)'})[status(p)];
  return `<div class="small" style="margin:8px 0 4px"><b>${bat} de ${ls.length}</b> setores bateram a meta do dia</div>
    <div class="dsm-pl small">${ls.map(x=>`<div><span>${esc(x.nome)}</span><span class="muted">${brl0(x.real)} de ${brl0(x.meta)}</span><b style="color:${cor(x.p)}">${pctBR(x.p,0)}</b></div>`).join('')}</div>`;
}

/* ---------- trocas dia a dia ---------- */
function trocasDoDia(R, ini, k){
  const s=R.get(k+'|'+k); if(s) return { v:+s.custo||0, itens:(s.dados?.itens||[]).map(i=>({...i, tc:+i.tc||0, q:+i.q||0})) };
  if(k===ini) return null;
  const a=R.get(ini+'|'+k), b=R.get(ini+'|'+diaAnt(k)); if(!a||!b) return null;
  const m=new Map((b.dados?.itens||[]).map(i=>[String(i.c),i]));
  return { v:round2((+a.custo||0)-(+b.custo||0)), itens:(a.dados?.itens||[]).map(i=>{ const o=m.get(String(i.c)); return {...i, tc:round2((+i.tc||0)-(+o?.tc||0)), q:round2((+i.q||0)-(+o?.q||0))}; }) };
}
async function cardTrocasDia(box, sid){
  const doc=curDoc(); if(!doc||!box) return; const mes=doc.mes, ini=mes+'-01', fim=S.cutoff||todayIso();
  let rows; try{ rows=await q(S.sb.from('analise_trocas').select('periodo_inicio,periodo_fim,custo,dados').eq('setor_id',sid).gte('periodo_fim',ini).lte('periodo_fim',fimDoMes(mes))); }catch(_){ return; }
  if(!box.isConnected) return;
  const R=new Map(rows.map(r=>[r.periodo_inicio+'|'+r.periodo_fim,r])), D={};
  for(const k of diasDoMes(mes)) if(k<=fim){ const x=trocasDoDia(R, ini, k); if(x) D[k]=x; }
  const n=Object.keys(D).length;
  if(!n){ box.innerHTML=`<div class="card" style="margin-top:12px"><h2 style="margin:0">📅 Trocas dia a dia</h2><p class="small muted" style="margin:6px 0 0">Ainda não tem relatório de trocas de um dia só neste mês. ${S.gerente?'Importe o relatório de trocas de cada dia (por exemplo, de 19/11 a 19/11): o site monta o calendário e soma no acumulado do mês.':'Assim que o gerente importar os relatórios de cada dia, o calendário aparece aqui.'}</p></div>`; return; }
  const mx=Math.max(0,...Object.values(D).map(x=>x.v))||1, venda=k=>+(doc.dias?.[k]?.vendas?.[sid]||0);
  const cel=k=>{ const x=D[k], dd=+k.slice(8); if(!x) return k<=fim? `<div class="cal-c cal-vazio" title="sem relatório do dia"><span class="cal-n">${dd}</span><span class="cal-p">sem rel.</span></div>` : null;
    const a=x.v>0? 0.12+0.6*x.v/mx : 0, vd=venda(k);
    return `<button type="button" class="cal-c" data-dia="${k}" aria-expanded="false" style="background:${x.v>0?`rgba(42,120,214,${a.toFixed(2)})`:'#fff'}" title="${fD(k)}: trocas ${brl0(x.v)}"><span class="cal-n">${dd}</span><span class="cal-v">${x.v>0?curtoBR(x.v):'—'}</span><span class="cal-p">${x.v>0&&vd?pctBR(x.v/vd,1):''}</span></button>`; };
  box.innerHTML=`<div class="card" style="margin-top:12px"><div class="row" style="flex-wrap:wrap;gap:6px"><h2 style="margin:0">📅 Trocas dia a dia</h2><div class="sp"></div><span class="small muted">${mesLabel(mes)} · ${n} dia(s) com relatório</span></div>
    ${calGrid(mes, cel, null)}
    <p class="small muted" style="margin:6px 0 0">Valores em R$ a custo e % da venda do dia · quanto mais azul, mais trocou · "sem rel." = falta o relatório de trocas só desse dia · 👆 toque num dia para ver os produtos.</p>
    <div class="cal-det hide"></div></div>`;
  ligarCal(box, (k, cd)=>{
    const x=D[k], w=new Date(k+'T12:00:00').getDay(), ls=x.itens.filter(i=>i.tc>0.009).sort((a,b)=>b.tc-a.tc), top=ls.slice(0,12), vd=venda(k);
    cd.innerHTML=`<div class="dsm-h"><b>${cap1(DOW_NOME[w])}, ${fD(k)}</b> · trocas <b>${brl0(x.v)}</b>${vd?` · ${pctBR(x.v/vd,2)} da venda de ${brl0(vd)}`:''}</div>
      ${ls.length?`<div class="dsm-pl small" style="margin-top:6px">${top.map(i=>`<div><span>${esc(cap1(i.d))} <span class="muted">${esc(String(i.c))}</span></span><span class="muted">${qtBR(i.q)} un/kg</span><b>${brl(i.tc)}</b></div>`).join('')}</div>
      <div class="small muted" style="margin-top:4px">${ls.length} produto(s)${ls.length>top.length?` · mostrando os ${top.length} maiores`:''}${top[0]&&x.v?` · <b>${esc(cap1(top[0].d))}</b> foi ${pctBR(top[0].tc/x.v,0)} das trocas do dia`:''}</div>`:'<div class="small muted" style="margin-top:4px">Nenhum produto trocado nesse dia.</div>'}`;
  });
}
function somarTrocas(base, dia){
  const its=JSON.parse(JSON.stringify(base.itens||[])), m=new Map(its.map(i=>[String(i.c),i]));
  for(const it of (dia.itens||[])){ const x=m.get(String(it.c));
    if(x){ x.q=round2((+x.q||0)+(+it.q||0)); x.tc=round2((+x.tc||0)+(+it.tc||0)); x.tv=round2((+x.tv||0)+(+it.tv||0)); x.cu=x.q? Math.round(x.tc/x.q*10000)/10000 : x.cu; if(it.d) x.d=it.d; }
    else { const n={...it}; its.push(n); m.set(String(it.c),n); } }
  return {...base, itens:its, emitido:dia.emitido||base.emitido, somado:true};
}
// soma o relatório (de um dia ou de alguns dias seguidos) no acumulado do mês: 01 até o último dia
async function acumularTrocasDia(rows, dia, iniPer){
  iniPer=iniPer||dia; const ini=dia.slice(0,8)+'01'; if(iniPer<=ini || iniPer.slice(0,7)!==dia.slice(0,7)) return 0;
  const base=await q(S.sb.from('analise_trocas').select('setor_id,custo,venda,dados').eq('periodo_inicio',ini).eq('periodo_fim',diaAnt(iniPer)));
  if(!base.length) return -2;
  const emitNovo=(rows.find(x=>x.dados?.emitido)||{}).dados?.emitido||null;
  try{ const ex=await q(S.sb.from('analise_trocas').select('setor_id,dados->>emitido,dados->>somado').eq('periodo_inicio',ini).eq('periodo_fim',dia));
    if(ex.length && ex.every(x=>x.somado!=='true') && ex.some(x=>x.emitido && (!emitNovo || x.emitido>=emitNovo))) return -1; }catch(_){ }
  const porS=Object.fromEntries(rows.map(x=>[x.setor_id,x]));
  const out=base.map(b=>{ const d=porS[b.setor_id]; return { setor_id:b.setor_id, periodo_inicio:ini, periodo_fim:dia, arquivo_nome:'acumulado do mês',
    custo:round2((+b.custo||0)+(d?+d.custo||0:0)), venda:round2((+b.venda||0)+(d?+d.venda||0:0)), dados: d? somarTrocas(b.dados||{}, d.dados||{}) : {...(b.dados||{}), somado:true} }; });
  for(const d of rows) if(!base.some(b=>b.setor_id===d.setor_id)) out.push({ ...d, periodo_inicio:ini, periodo_fim:dia, arquivo_nome:'acumulado do mês', dados:{...d.dados, somado:true} });
  await q(S.sb.from('analise_trocas').upsert(out, {onConflict:'setor_id,periodo_inicio,periodo_fim'}));
  return out.length;
}
