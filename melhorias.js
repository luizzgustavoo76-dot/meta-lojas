/* Sugestão de pedido e rebaixa · Tendência em gráfico · Ranking dos encarregados */

const DIAS_SEM = ['dom','seg','ter','qua','qui','sex','sáb'];
const COR_SERIE = '#2a78d6';   // série principal dos gráficos (paleta validada, slot 1)

/* fator de cada dia da semana na venda do setor (últimas 8 semanas) */
async function fatoresSemana(sid){
  const ate=ontemIso(), de=isoOf(new Date(Date.now()-57*864e5));
  const ls=await todasLinhas(()=>{ let b=S.sb.from('lancamentos').select('data,venda,setor_id').gte('data',de).lte('data',ate); return sid? b.eq('setor_id',sid) : b; });
  const soma=[0,0,0,0,0,0,0], n=[0,0,0,0,0,0,0], porDia={};
  for(const x of ls){ porDia[x.data]=(porDia[x.data]||0)+(+x.venda||0); }
  for(const [d,v] of Object.entries(porDia)){ if(!v) continue; const w=new Date(d+'T12:00').getDay(); soma[w]+=v; n[w]++; }
  const med=soma.map((s,i)=>n[i]?s/n[i]:0); const geral=med.filter(Boolean).reduce((a,b)=>a+b,0)/(med.filter(Boolean).length||1);
  return med.map(m=>geral? m/geral : 1);
}

/* ---------- Sugestão de pedido e rebaixa (aba Perdas do setor) ---------- */
async function cardSugestaoPedido(box, sid, reg){
  const dias=Math.max(1, Math.round((new Date(reg.periodo_fim)-new Date(reg.periodo_inicio))/864e5)+1);
  const its=reg.dados.secoes.flatMap(x=>x.itens).filter(i=>i.q>0 && i.e>0 && i.val>=20);
  if(!its.length) return;
  let f=[1,1,1,1,1,1,1]; try{ f=await fatoresSemana(sid); }catch(_){}
  if(!box.isConnected) return;
  const sug=its.map(i=>{ const vd=i.v/dias, ed=i.e/dias, saida=i.v+i.q>0?i.q/(i.v+i.q):0;
      const alvo=vd*1.05; const red=ed>0? 1-alvo/ed : 0;
      const rebaixa = saida>=0.35 ? 30 : saida>=0.2 ? 20 : saida>=0.1 ? 10 : 0;
      return {...i, vd, ed, alvo, red, saida, rebaixa}; })
    .filter(x=>x.red>=0.05 || x.rebaixa>0).sort((a,b)=>b.val-a.val).slice(0,40);
  if(!sug.length) return;
  const un=x=>/\bKG\b/i.test(x.d)?'kg':'un';
  const fmt=v=>v>=10?Math.round(v).toLocaleString('pt-BR'):v.toLocaleString('pt-BR',{maximumFractionDigits:1});
  const el=document.createElement('div'); el.className='card'; el.style.marginTop='12px';
  el.innerHTML=`<details ${ehCelular()?'':'open'}><summary style="cursor:pointer"><h2 style="display:inline;margin:0">📦 Sugestão de pedido e rebaixa</h2> <span class="small muted">${sug.length} produto(s) · base ${fD(reg.periodo_inicio)} a ${fD(reg.periodo_fim)} (${dias} dias)</span></summary>
    <p class="small muted" style="margin:8px 0">Pedido por dia = o que <b>vendeu</b> por dia + 5% de folga, distribuído pelo movimento de cada dia da semana do setor (últimas 8 semanas). Rebaixa sugerida conforme o quanto o produto perde do que sai. É uma estimativa: confira com a validade e o estoque.</p>
    <div class="small" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${DIAS_SEM.map((d,i)=>`<span class="badge b-none">${d} ${f[i]>=1?'+':''}${Math.round((f[i]-1)*100)}%</span>`).join('')}</div>
    <div class="tw" style="max-height:60vh"><table><thead><tr><th>Produto</th><th class="n m-hide">Entra/dia</th><th class="n">Vende/dia</th><th class="n">Pedir/dia</th><th class="n m-hide">Reduzir</th><th class="n">Rebaixa</th>${DIAS_SEM.map(d=>`<th class="n d-only">${d}</th>`).join('')}</tr></thead><tbody>
    ${sug.map(x=>`<tr><td>${esc(cap1(x.d))}<div class="small muted">perde ${pctBR(x.saida,0)} do que sai · ${brl0(x.val)}</div><div class="small m-only">entra ${fmt(x.ed)} ${un(x)}/dia · reduzir ${x.red>0?pctBR(x.red,0):'—'}<br>${DIAS_SEM.map((d,i)=>`${d} ${fmt(x.alvo*f[i])}`).join(' · ')}</div></td>
      <td class="n m-hide">${fmt(x.ed)} ${un(x)}</td><td class="n">${fmt(x.vd)} ${un(x)}</td><td class="n"><b>${fmt(x.alvo)} ${un(x)}</b></td><td class="n m-hide" style="${x.red>=0.15?'color:var(--bad);font-weight:600':''}">${x.red>0?'−'+pctBR(x.red,0):'—'}</td>
      <td class="n">${x.rebaixa?`<span class="badge" style="background:#fff1e6;color:#9a3c00">${x.rebaixa}% off</span>`:'—'}</td>${DIAS_SEM.map((d,i)=>`<td class="n d-only">${fmt(x.alvo*f[i])}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div></details>`;
  box.appendChild(el);
}

/* ---------- Tendência em gráfico (perda % da venda por semana) ---------- */
function semanaDe(d){ const t=new Date(d+'T12:00'); const w=(t.getDay()+6)%7; t.setDate(t.getDate()-w); return isoOf(t); }
async function cardTendencia(box, sidFixo){
  const el=document.createElement('div'); el.className='card'; el.style.marginTop='12px';
  const opc = sidFixo ? '' : `<select id="tdSet" style="border:1px solid var(--line);border-radius:8px;padding:5px 6px"><option value="">Loja inteira</option>${S.setoresAll.map(s=>`<option value="${s.id}" ${S.tdSet===s.id?'selected':''}>${esc(s.nome)}</option>`).join('')}</select>`;
  el.innerHTML=`<div class="row" style="gap:8px;flex-wrap:wrap"><h2 style="margin:0">📈 Tendência da perda</h2><div class="sp"></div>${opc}
    <select id="tdSem" style="border:1px solid var(--line);border-radius:8px;padding:5px 6px">${[13,26,52].map(n=>`<option value="${n}" ${(S.tdSem||26)===n?'selected':''}>${n} semanas</option>`).join('')}</select></div>
    <p class="small muted" style="margin:4px 0 8px">Perda lançada ÷ venda, por semana (segunda a domingo). A linha tracejada é o teto do setor.</p>
    <div style="position:relative;height:260px"><canvas id="tdCv" aria-label="Perda em % da venda por semana"></canvas></div>
    <details style="margin-top:8px"><summary class="small" style="cursor:pointer">Ver em tabela</summary><div class="tw" id="tdTab" style="max-height:260px;margin-top:6px"></div></details>`;
  box.appendChild(el);
  const desenhar=async()=>{
    const sid=sidFixo||$('#tdSet')?.value||''; const nS=+($('#tdSem')?.value||26); S.tdSem=nS; if(!sidFixo) S.tdSet=sid;
    const de=isoOf(new Date(Date.now()-nS*7*864e5));
    let ls=[]; try{ ls=await todasLinhas(()=>{ let b=S.sb.from('lancamentos').select('data,setor_id,venda,perda').gte('data',de).lte('data',todayIso()); return sid? b.eq('setor_id',sid) : b; }); }catch(e){ return; }
    let tetos={}; try{ tetos=await carregarTetos(); }catch(_){}
    const sem={}; for(const x of ls){ const k=semanaDe(x.data); const o=sem[k]=sem[k]||{v:0,p:0}; o.v+=+x.venda||0; o.p+=+x.perda||0; }
    const ks=Object.keys(sem).sort().filter(k=>sem[k].v>0);
    const pct=ks.map(k=>+(sem[k].p/sem[k].v*100).toFixed(2));
    const teto = sid ? tetos[sid] : null;
    const lab=ks.map(k=>fD(k).slice(0,5));
    const cv=$('#tdCv',el); if(!cv || !window.Chart) return;
    if(el._ch){ try{ el._ch.destroy(); }catch(_){} }
    const ds=[{label:'Perda % da venda', data:pct, borderColor:COR_SERIE, backgroundColor:COR_SERIE, borderWidth:2, pointRadius:3, pointHoverRadius:6, tension:0.25}];
    if(teto!=null) ds.push({label:`Teto ${teto.toLocaleString('pt-BR')}%`, data:ks.map(()=>teto), borderColor:'#8a8984', borderDash:[6,5], borderWidth:1.5, pointRadius:0, pointHoverRadius:0});
    el._ch=new Chart(cv,{type:'line',data:{labels:lab,datasets:ds},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:teto!=null,labels:{boxWidth:14,color:'#52514e'}},tooltip:{callbacks:{title:it=>'Semana de '+fD(ks[it[0].dataIndex]),label:c=>c.datasetIndex===0?` perda ${c.parsed.y.toLocaleString('pt-BR')}% · ${brl0(sem[ks[c.dataIndex]].p)} de ${brl0(sem[ks[c.dataIndex]].v)}`:` teto ${c.parsed.y.toLocaleString('pt-BR')}%`}}},
      scales:{y:{beginAtZero:true,ticks:{callback:v=>v+'%',color:'#52514e'},grid:{color:'#eeece6'}},x:{ticks:{color:'#52514e',maxRotation:0,autoSkip:true,maxTicksLimit:ehCelular()?6:13},grid:{display:false}}}}});
    S.charts.push(el._ch);
    $('#tdTab',el).innerHTML=`<table><thead><tr><th>Semana</th><th class="n">Venda</th><th class="n">Perda</th><th class="n">% da venda</th></tr></thead><tbody>${ks.slice().reverse().map(k=>`<tr><td>${fD(k)}</td><td class="n">${brl0(sem[k].v)}</td><td class="n">${brl0(sem[k].p)}</td><td class="n">${(sem[k].p/sem[k].v*100).toLocaleString('pt-BR',{maximumFractionDigits:2})}%</td></tr>`).join('')}</tbody></table>`;
  };
  if(!sidFixo) $('#tdSet',el).onchange=desenhar; $('#tdSem',el).onchange=desenhar;
  desenhar();
}

/* ---------- Ranking dos encarregados (Painel do administrador) ---------- */
async function cardRankingEncarregados(box, usuarios){
  const doc=curDoc(); if(!doc) return;
  const enc=(usuarios||[]).filter(u=>u.papel==='encarregado' && (u.setores||[]).length);
  if(!enc.length) return;
  let tetos={}, T=[]; try{ tetos=await carregarTetos(); T=await q(S.sb.from('analise_trocas').select('setor_id,periodo_inicio,periodo_fim,custo').gte('periodo_fim',doc.mes+'-01').lte('periodo_fim',fimDoMes(doc.mes))); }catch(_){}
  const ultT={}; for(const r of T){ const a=ultT[r.setor_id]; if(!a||r.periodo_fim>a.periodo_fim) ultT[r.setor_id]=r; }
  const {setores}=calc(doc,S.cutoff); const bySet=Object.fromEntries(setores.map(s=>[s.id,s]));
  const vendaPer=(sid,a,b)=>{ let v=0; for(const k of diasDoMes(doc.mes)){ if(k<a||k>b) continue; v+=+(doc.dias?.[k]?.vendas?.[sid]||0); } return v; };
  const ptMeta=p=>p>=1?3:p>=0.95?2:p>=0.9?1:0, ptPerda=r=>r<=0.8?3:r<=1?2:r<=1.2?1:0, ptTroca=p=>p<=0.5?3:p<=1?2:p<=1.5?1:0;
  const linhas=enc.map(u=>{ let metaAte=0, real=0, perda=0, pts=0, nPts=0, trc=0, venT=0;
    for(const id of u.setores){ const s=bySet[id]; if(!s) continue; metaAte+=s.metaAte; real+=s.real; perda+=s.perda;
      if(s.metaAte){ pts+=ptMeta(s.real/s.metaAte); nPts++; }
      const t=tetos[id]; if(t!=null && s.real){ pts+=ptPerda((s.perda/s.real*100)/t); nPts++; }
      const tr=ultT[id]; if(tr){ const v=vendaPer(id,tr.periodo_inicio,tr.periodo_fim); if(v){ pts+=ptTroca(+tr.custo/v*100); nPts++; trc+=+tr.custo; venT+=v; } } }
    return { u, ating: metaAte? real/metaAte : null, perdaPc: real? perda/real : null, trocaPc: venT? trc/venT : null, nota: nPts? pts/nPts : 0, n:u.setores.length }; })
    .sort((a,b)=>b.nota-a.nota || (b.ating||0)-(a.ating||0));
  const med=i=>['🥇','🥈','🥉'][i]||`${i+1}º`;
  const el=document.createElement('div'); el.className='card'; el.style.marginTop='12px';
  el.innerHTML=`<h2>🏆 Ranking dos encarregados — ${mesLabel(doc.mes)}</h2>
    <p class="small muted" style="margin:-4px 0 8px">Até ${fD(S.cutoff)}. Nota de 0 a 3 = média dos setores de cada um em três pontos: <b>meta</b> (100% ou mais = 3), <b>perda × teto</b> (até 80% do teto = 3) e <b>trocas</b> (até 0,5% da venda = 3).</p>
    ${linhas.map((x,i)=>`<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div style="display:flex;gap:10px;align-items:baseline"><span style="width:28px;font-size:18px">${med(i)}</span><b style="flex:1">${esc(x.u.nome||x.u.email)}</b><b>${x.nota.toLocaleString('pt-BR',{maximumFractionDigits:1})}</b><span class="small muted">/3</span></div>
      <div class="small muted" style="margin-left:38px">${x.n===S.setoresAll.length?'todos os setores':esc((x.u.setores||[]).map(nomeSetor).join(', '))}</div>
      <div class="small" style="margin-left:38px">meta ${x.ating==null?'—':pctBR(x.ating,1)} · perda ${x.perdaPc==null?'—':pctBR(x.perdaPc,2)+' da venda'} · trocas ${x.trocaPc==null?'—':pctBR(x.trocaPc,2)+' da venda'}</div>
      <div style="margin-left:38px">${barraPct(x.nota/3, x.nota>=2.5?'var(--good)':x.nota>=1.5?'var(--warn)':'var(--bad)')}</div></div>`).join('')}`;
  box.appendChild(el);
}
