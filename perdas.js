/* Análise de perdas por produto — relatório do sistema "PERDAS DA FILIAL ... NO PERIODO DE x A y".
   Gerente importa; cada produto vai para o setor certo (cadastro de produtos → regras → setor da seção).
   Opcional: acerta a perda lançada no site para bater com o relatório (a diferença vai no último dia do período). */

const pctBR = (v,d=1) => (v==null||!isFinite(v)) ? '—' : (v*100).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})+'%';
const qtBR = v => (+v||0).toLocaleString('pt-BR',{maximumFractionDigits:2});

async function perdaLancada(sid, ini, fim){
  const r=await q(S.sb.from('lancamentos').select('perda').eq('setor_id',sid).gte('data',ini).lte('data',fim));
  return round2((r||[]).reduce((a,x)=>a+(+x.perda||0),0));
}

async function importarRelatorioPerdas(f, setorAtual){
  busy('Lendo o relatório de perdas…');
  let r=null, mapa=[], prod=new Map();
  try{
    r=Parser.analisarRelatorioPerdas(await linhasDoArquivo(f));
    if(r){ mapa=await q(S.sb.from('departamentos').select('codigo,nome,setor_id'));
      for(let i=0;;i+=1000){ const pg=await q(S.sb.from('produtos_setor').select('codigo,setor_id').range(i,i+999)); (pg||[]).forEach(x=>prod.set(String(x.codigo),x.setor_id)); if(!pg||pg.length<1000) break; } }
  }catch(e){ closeModal(); toast('Não consegui ler o arquivo: '+e.message, 6000); return null; }
  if(!r){ closeModal(); toast('Esse arquivo não parece o relatório “Perdas da filial” do sistema.', 6000); return null; }
  // separa cada item no setor certo
  const normN=t=>String(t||'').toUpperCase().replace(/\s+/g,' ').trim();
  const grupos=[];
  for(const sec of r.secoes){
    const pad=(mapa.find(x=>x.codigo===sec.codigo && normN(x.nome)===normN(sec.nome))||{}).setor_id || Parser.matchSector(sec.nome) || (r.secoes.length===1?setorAtual:'') || '';
    const por=new Map();
    for(const it of sec.itens){ const s=prod.get(String(it.c)) || setorPorRegra(sec.codigo, it.d.replace(/^[FV] /,'')) || pad; if(!por.has(s)) por.set(s,[]); por.get(s).push(it); }
    for(const [s,its] of por) grupos.push({sec, itens:its, setor:s});
  }
  const lanc={}; try{ for(const id of new Set(grupos.map(g=>g.setor).filter(Boolean))) lanc[id]=await perdaLancada(id, r.periodo.ini, r.periodo.fim); }catch(_){}
  closeModal();
  const totG=g=>round2(g.itens.reduce((a,i)=>a+i.val,0));
  const opcoes=sel=>`<option value="">— não importar —</option>${S.setoresAll.map(x=>`<option value="${x.id}" ${x.id===sel?'selected':''}>${esc(x.nome)}</option>`).join('')}`;
  const confere = r.total ? Math.abs(r.total.q-r.qtd)<0.05 : null;
  return await new Promise(resolver=>{
  const m=modal(`<h2>🗑️ Relatório de perdas por produto</h2>
    <div class="grid kpis" style="margin:8px 0">
      <div class="kpi"><div class="l">Período</div><div class="v" style="font-size:20px">${fD(r.periodo.ini)} a ${fD(r.periodo.fim)}</div><div class="d">filial ${esc(r.filial||'')}${r.emitido?' · emitido '+fD(r.emitido):''}</div></div>
      <div class="kpi"><div class="l">Perda total (qtd × custo médio)</div><div class="v" style="font-size:20px">${brl(r.valor)}</div><div class="d">${r.itens} produtos · ${qtBR(r.qtd)} perdidos</div></div>
    </div>
    ${confere===true?'<div class="note small" style="background:var(--good-bg);border-color:#a9d8b8">✔ Conferido: a quantidade perdida bate com o TOTAL do relatório.</div>':confere===false?`<div class="note err small">A soma das perdas (${qtBR(r.qtd)}) não bate com o TOTAL (${qtBR(r.total.q)}). Confira o arquivo.</div>`:''}
    <div class="tw" style="max-height:300px;overflow:auto;margin-top:8px"><table><thead><tr><th>Seção</th><th class="n">Produtos</th><th class="n">Perda</th><th>Setor do site</th></tr></thead><tbody>
      ${grupos.map((g,i)=>`<tr><td><b>${g.sec.codigo}</b> ${esc(cap1(g.sec.nome))}</td><td class="n">${g.itens.length}</td><td class="n">${brl0(totG(g))}</td><td><select data-g="${i}" style="border:1px solid var(--line);border-radius:8px;padding:4px 6px">${opcoes(g.setor)}</select></td></tr>`).join('')}
    </tbody></table></div>
    <label class="small" style="display:flex;gap:8px;align-items:flex-start;margin-top:12px"><input type="checkbox" id="rpAcerta" ${r.periodo.fim>=isoOf(new Date(Date.now()-60*864e5))?'checked':''} style="margin-top:3px"><span><b>Acertar a perda lançada no site</b> para ficar igual ao relatório. A diferença vai no dia ${fD(r.periodo.fim)}.</span></label>
    <div id="rpResumo" class="small" style="margin-top:8px"></div>
    <div id="rpErr" class="note err small hide" style="margin-top:8px"></div>
    <div class="row" style="margin-top:12px"><div class="sp"></div><button class="btn" id="mN">Cancelar</button><button class="btn p" id="mY">Salvar perdas</button></div>`);
  const escolhas=()=>{ const por={}; m.querySelectorAll('select[data-g]').forEach(s=>{ if(!s.value) return; (por[s.value]=por[s.value]||[]).push(grupos[+s.dataset.g]); }); return por; };
  const resumo=async()=>{ const por=escolhas(); const ac=$('#rpAcerta',m).checked;
    for(const id of Object.keys(por)) if(lanc[id]==null){ try{ lanc[id]=await perdaLancada(id,r.periodo.ini,r.periodo.fim); }catch(_){ lanc[id]=0; } }
    m.querySelectorAll('select[data-g]').forEach(x=>x.closest('tr').style.background=x.value?'':'#fff6dc');
    $('#rpResumo',m).innerHTML = Object.keys(por).length ? `<table style="width:100%"><thead><tr><th>Setor</th><th class="n">Relatório</th><th class="n">Lançado no site</th>${ac?'<th class="n">Lança no dia '+fD(r.periodo.fim)+'</th>':''}</tr></thead><tbody>${Object.entries(por).map(([id,gs])=>{ const v=round2(gs.reduce((a,g)=>a+totG(g),0)); const d=round2(v-(lanc[id]||0));
      return `<tr><td><b>${esc(nomeSetor(id))}</b></td><td class="n">${brl(v)}</td><td class="n">${brl(lanc[id]||0)}</td>${ac?`<td class="n" style="color:${d>=0?'var(--bad)':'var(--good)'}">${d>=0?'+':''}${brl(d)}</td>`:''}</tr>`; }).join('')}</tbody></table>` : '<span style="color:var(--bad)">Nenhuma seção escolhida.</span>'; };
  m.querySelectorAll('select[data-g]').forEach(s=>s.onchange=resumo); $('#rpAcerta',m).onchange=resumo; resumo();
  $('#mN',m).onclick=()=>{ closeModal(); resolver(null); };
  $('#mY',m).onclick=async()=>{
    const err=t=>{ const e=$('#rpErr',m); e.textContent=t; e.classList.remove('hide'); };
    const por=escolhas(); if(!Object.keys(por).length) return err('Escolha o setor de pelo menos uma seção.');
    const acertar=$('#rpAcerta',m).checked;
    $('#mY',m).disabled=true; $('#mY',m).textContent='Salvando…';
    try{
      const rows=Object.entries(por).map(([id,gs])=>({ setor_id:id, periodo_inicio:r.periodo.ini, periodo_fim:r.periodo.fim, arquivo_nome:f.name,
        valor:round2(gs.reduce((a,g)=>a+totG(g),0)),
        dados:{ emitido:r.emitido, filial:r.filial, secoes:gs.map(g=>({codigo:g.sec.codigo, nome:g.sec.nome, itens:g.itens})) } }));
      await q(S.sb.from('analise_perdas').upsert(rows, {onConflict:'setor_id,periodo_inicio,periodo_fim'}));
      let msg=`Perdas salvas ✔ — ${rows.map(x=>nomeSetor(x.setor_id)).join(', ')}`;
      if(acertar){
        const fim=r.periodo.fim, mes=fim.slice(0,7);
        if(!S.mesList.includes(mes)) throw new Error(`o mês ${mesLabel(mes)} não está cadastrado — a análise foi salva, mas a perda não foi acertada.`);
        if(S.mes!==mes) await trocarMes(mes);
        const nd=clone(curDoc()); nd.dias=nd.dias||{}; const dia=nd.dias[fim]=nd.dias[fim]||{}; dia.perdas=dia.perdas||{};
        const ajustes=[];
        for(const x of rows){ const ja=await perdaLancada(x.setor_id, r.periodo.ini, fim); const d=round2(x.valor-ja); if(Math.abs(d)<0.01) continue;
          const novo=round2((+dia.perdas[x.setor_id]||0)+d); if(novo<0){ ajustes.push(`${nomeSetor(x.setor_id)}: o site tem mais perda que o relatório (${brl(-d)}) e o dia ${fD(fim)} não comporta — confira`); continue; }
          dia.perdas[x.setor_id]=novo; ajustes.push(`${nomeSetor(x.setor_id)} ${d>=0?'+':''}${brl(d)}`); }
        if(ajustes.length){ await saveDoc(nd, 'Perda acertada pelo relatório'); msg+=` · perda do dia ${fD(fim)} acertada: ${ajustes.join(' · ')}`; }
      }
      S._alertas=null; closeModal(); toast(msg, 7000); if(acertar) setTimeout(()=>mostrarConferencia(true), 1500);
      if(S.view==='setor'){ if(!por[S.setorSel]) S.setorSel=Object.keys(por)[0]; S.setorAba='per'; render(); }
      resolver(true);
    }catch(e){ err('Não foi possível concluir: '+(e.message||e)); $('#mY',m).disabled=false; $('#mY',m).textContent='Salvar perdas'; }
  };
  });
}

async function renderPerdasSetor(box, s){
  const sid=s.id; const vivo=()=>S.view==='setor' && S.setorAba==='per' && S.setorSel===sid && box.isConnected;
  const btnImp = S.gerente? `<button class="btn p" id="pdImp">＋ Importar relatório de perdas</button><input type="file" id="pdArq" accept=".pdf,.txt" class="hide">`:'';
  const ligar=()=>{ const b=$('#pdImp'); if(b){ b.onclick=()=>$('#pdArq').click(); $('#pdArq').onchange=e=>{ const f=e.target.files[0]; e.target.value=''; if(f) importarRelatorioPerdas(f, sid); }; } };
  let lista=[];
  try{ lista=await q(S.sb.from('analise_perdas').select('id,periodo_inicio,periodo_fim,valor').eq('setor_id',sid).order('periodo_fim',{ascending:false}).limit(100)); }
  catch(e){ box.innerHTML=`<div class="note err">Erro ao carregar: ${esc(e.message)}</div>`; return; }
  if(!vivo()) return;
  if(!lista.length){ box.innerHTML=`<div class="card empty"><h2>Nenhum relatório de perdas do ${esc(s.nome)} ainda</h2><p>${S.gerente?'Importe o relatório “Perdas da filial” do sistema (PDF). O site mostra o que mais pesa na perda, produto por produto, e pode acertar a perda lançada para bater com o sistema.':'Assim que o gerente importar o relatório de perdas do sistema, a análise por produto aparece aqui.'}</p><div style="margin-top:12px">${btnImp}</div></div><div id="acBox"></div>`; ligar(); cardAcertos($('#acBox'), sid); return; }
  S.perSel=S.perSel||{}; const selId=S.perSel[sid] && lista.some(x=>x.id===S.perSel[sid]) ? S.perSel[sid] : lista[0].id;
  let reg, lancado=null, venda=null;
  try{ reg=(await q(S.sb.from('analise_perdas').select('*').eq('id',selId)))[0];
    lancado=await perdaLancada(sid, reg.periodo_inicio, reg.periodo_fim);
    const lv=await q(S.sb.from('lancamentos').select('venda').eq('setor_id',sid).gte('data',reg.periodo_inicio).lte('data',reg.periodo_fim)); venda=(lv||[]).reduce((a,x)=>a+(+x.venda||0),0);
    const l=await q(S.sb.from('analise_perdas').select('valor,dados,periodo_inicio,periodo_fim').eq('setor_id',sid).eq('periodo_inicio',addAnos(reg.periodo_inicio,-1)).eq('periodo_fim',addAnos(reg.periodo_fim,-1)).limit(1)); reg._ly=l[0]||null;
  }catch(e){ box.innerHTML=`<div class="note err">Erro ao carregar: ${esc(e.message)}</div>`; return; }
  if(!vivo()) return;
  const LY=reg._ly, lyMap=new Map(); if(LY) for(const x of LY.dados.secoes) for(const i of x.itens) lyMap.set(String(i.c),i);
  const varP=(a,b)=>{ if(b==null) return '<span class="muted">—</span>'; if(!b) return a>0?'<span class="an-novo">nova</span>':'<span class="muted">—</span>'; const v=a/b-1; return `<span style="color:${v>0?'var(--bad)':'var(--good)'};font-weight:600">${v>0?'▲':'▼'} ${pctBR(Math.abs(v),0)}</span>`; };
  const itens=reg.dados.secoes.flatMap(x=>x.itens.map(i=>({...i, sec:x.nome})));
  const tot=itens.reduce((a,i)=>a+i.val,0), qt=itens.reduce((a,i)=>a+i.q,0), ent=itens.reduce((a,i)=>a+i.e,0);
  const comPerda=itens.filter(i=>i.q>0).sort((a,b)=>b.val-a.val);
  const saida=i=>i.v+i.q>0 ? i.q/(i.v+i.q) : 0;
  // curva: quantos produtos fazem 80% da perda
  let ac=0, n80=0; for(const i of comPerda){ ac+=i.val; n80++; if(ac>=tot*0.8) break; }
  const altos=comPerda.filter(i=>saida(i)>=0.3 && i.val>=30).slice(0,6);
  const top=comPerda.slice(0,3);
  const ant=lista.find(x=>x.id!==reg.id && x.periodo_fim<reg.periodo_inicio);
  box.innerHTML=`
    <div class="row" style="margin-bottom:10px;gap:8px;flex-wrap:wrap">
      <label class="f" style="margin:0">Período<select id="pdSel">${lista.map(x=>`<option value="${x.id}" ${x.id===reg.id?'selected':''}>${fD(x.periodo_inicio)} a ${fD(x.periodo_fim)} · ${brl0(x.valor)}</option>`).join('')}</select></label>
      <div class="sp"></div>${btnImp}
    </div>
    <div class="grid kpis">
      <div class="kpi hero"><div class="l">Perda de ${fD(reg.periodo_inicio)} até ${fD(reg.periodo_fim)}</div><div class="v">${brl0(tot)}</div><div class="d">${comPerda.length} produtos com perda · ${qtBR(qt)} perdidos</div></div>
      <div class="kpi"><div class="l">Ano passado (${LY?fD(LY.periodo_inicio)+' a '+fD(LY.periodo_fim):'mesmo período'})</div><div class="v">${LY?brl0(LY.valor):'—'}</div><div class="d">${LY?varP(tot,+LY.valor)+' em relação ao ano passado':'importe o relatório de perdas do ano passado para comparar'}</div></div>
      <div class="kpi"><div class="l">Perda sobre as entradas</div><div class="v">${pctBR(ent?qt/ent:null)}</div><div class="d">quantidade perdida ÷ quantidade que entrou</div></div>
      <div class="kpi"><div class="l">Perda sobre a venda</div><div class="v">${pctBR(venda?tot/venda:null,2)}</div><div class="d">venda lançada no período: ${brl0(venda)}</div></div>
      <div class="kpi"><div class="l">Lançado no site</div><div class="v">${brl0(lancado)}</div><div class="d">${Math.abs(lancado-tot)<1?'✔ igual ao relatório':`diferença de ${brl(tot-lancado)} para o relatório`}</div></div>
    </div>
    <div class="card" style="margin-top:12px"><h2>👀 Onde olhar primeiro</h2><ul class="small" style="margin:6px 0 0 18px;line-height:1.6">
      <li><b>${n80} produto(s)</b> fazem 80% da perda do setor.</li>
      ${top.map(i=>`<li><b>${esc(cap1(i.d))}</b> — ${brl0(i.val)} (${pctBR(i.val/tot,0)} da perda do setor; ${qtBR(i.q)} perdidos)</li>`).join('')}
      ${altos.length?`<li>Perdem 30% ou mais do que sai da loja: ${altos.map(i=>`<b>${esc(cap1(i.d))}</b> ${pctBR(saida(i),0)}`).join(' · ')}</li>`:''}
      ${LY?(()=>{ const piores=comPerda.map(i=>({i, d:i.val-((lyMap.get(String(i.c))||{}).val||0)})).filter(x=>x.d>0).sort((a,b)=>b.d-a.d).slice(0,3); const melhores=[...lyMap.values()].map(o=>{ const n=itens.find(i=>String(i.c)===String(o.c)); return {o, d:(n?n.val:0)-o.val}; }).filter(x=>x.d<0).sort((a,b)=>a.d-b.d).slice(0,3);
        return `${piores.length?`<li>Mais subiram contra o ano passado: ${piores.map(x=>`<b>${esc(cap1(x.i.d))}</b> +${brl0(x.d)}`).join(' · ')}</li>`:''}${melhores.length?`<li>Mais caíram: ${melhores.map(x=>`<b>${esc(cap1(x.o.d))}</b> ${brl0(x.d)}`).join(' · ')}</li>`:''}`; })():''}
      ${ant?`<li>Período anterior importado (${fD(ant.periodo_inicio)} a ${fD(ant.periodo_fim)}): ${brl0(ant.valor)}.</li>`:''}
    </ul></div>
    <div class="card" style="margin-top:12px">
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px"><h2 style="margin:0">Produtos</h2><div class="sp"></div>
        <input id="pdBusca" placeholder="Buscar produto…" style="border:1px solid var(--line);border-radius:8px;padding:6px 8px;min-width:160px">
        <label class="small" style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="pdSo" checked> só com perda</label></div>
      <div class="tw" style="max-height:60vh"><table><thead><tr><th>Produto</th><th class="n">Entrou</th><th class="n">Vendeu</th><th class="n">Perdeu</th><th class="n m-hide">Custo méd.</th><th class="n">Perda R$</th>${LY?'<th class="n">Ano pass.</th><th class="n">Var.</th>':''}<th class="n">% da saída</th><th class="n m-hide">Part.</th></tr></thead><tbody id="pdBody"></tbody></table></div>
    </div>`;
  const desenha=()=>{ const t=normN2($('#pdBusca').value), so=$('#pdSo').checked;
    const ls=(so?comPerda:[...itens].sort((a,b)=>b.val-a.val||b.v-a.v)).filter(i=>!t || normN2(i.d).includes(t) || String(i.c)===t);
    $('#pdBody').innerHTML = ls.slice(0,400).map(i=>{ const sd=saida(i); return `<tr><td><span class="muted small">${esc(i.c)}</span> ${esc(cap1(i.d))}</td><td class="n">${qtBR(i.e)}</td><td class="n">${qtBR(i.v)}</td><td class="n">${qtBR(i.q)}</td><td class="n m-hide">${brl(i.cu)}</td><td class="n"><b>${brl(i.val)}</b></td>${LY?(()=>{ const o=lyMap.get(String(i.c)); return `<td class="n">${o?brl(o.val)+`<div class="small muted">${qtBR(o.q)} perdidos</div>`:'—'}</td><td class="n">${varP(i.val,o?o.val:0)}${o&&o.q?`<div class="small muted">qtd ${i.q>=o.q?'▲':'▼'} ${pctBR(Math.abs(i.q/o.q-1),0)}</div>`:''}</td>`; })():''}<td class="n" style="${sd>=0.3?'color:var(--bad);font-weight:600':''}">${i.q?pctBR(sd,0):'—'}</td><td class="n m-hide">${tot?pctBR(i.val/tot,1):'—'}</td></tr>`; }).join('') || '<tr><td colspan="10" class="muted">Nenhum produto.</td></tr>'; };
  box.insertAdjacentHTML('beforeend','<div id="acBox"></div>'); cardAcertos($('#acBox'), sid);
  cardAlertas(box, sid, box.querySelector('.row'));
  cardTendencia(box, sid); cardSugestaoPedido(box, sid, reg);
  $('#pdBusca').oninput=desenha; $('#pdSo').onchange=desenha; desenha();
  $('#pdSel').onchange=e=>{ S.perSel[sid]=+e.target.value; renderPerdasSetor(box,s); };
  ligar();
}
const normN2=t=>String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().trim();

/* ===== Acertos de balanço: "RESUMO DE ACERTOS/PERDAS POR PRODUTO" (vem sem seção: separa pelo cadastro de produtos e pela descrição) ===== */
function setorPorDescricao(d){ d=String(d||'').toUpperCase().trim();
  if(/^[FV] /.test(d)) return 'hortifruti';
  if(/^(ZZ)?(LING|BACON|QJO|QUEIJO|PRESUNTO|MORTADELA|SALAME|APRESUNTADO|PEITO PERU|EMBUTIDO|PIZZA|SALSICHA|BLANQUET|REQUEIJAO|IOGURTE|MANTEIGA|MARGARINA|NUGGETS|HAMBURGUER|LASANHA)/.test(d)) return 'pereciveis';
  if(/^(BOV|SUI|FGO|FRANGO|CARNE|OVINO|CORDEIRO|CAPRINO)\b/.test(d)) return 'acougue';
  if(/^(SALG|TORTA|PAO|BOLO|BISC|ROSCA|CUCA|SONHO|BOLINHO|CHURROS|LANCHE|FOCACCIA|ESFIHA)/.test(d)) return 'padaria';
  return ''; }

async function importarRelatorioAcertos(f){
  busy('Lendo o resumo de acertos do balanço…');
  let r=null, prod=new Map();
  try{ r=Parser.analisarRelatorioAcertos(await linhasDoArquivo(f));
    if(r){ for(let i=0;;i+=1000){ const pg=await q(S.sb.from('produtos_setor').select('codigo,setor_id').range(i,i+999)); (pg||[]).forEach(x=>prod.set(String(x.codigo),x.setor_id)); if(!pg||pg.length<1000) break; } } }
  catch(e){ closeModal(); toast('Não consegui ler o arquivo: '+e.message, 6000); return null; }
  closeModal();
  if(!r){ toast('Esse arquivo não parece o “Resumo de acertos/perdas por produto” do sistema.', 6000); return null; }
  const por=new Map(); let porDesc=0;
  for(const it of r.itens){ let s=prod.get(String(it.c)); if(!s){ s=setorPorDescricao(it.d); if(s) porDesc++; } s=s||''; if(!por.has(s)) por.set(s,[]); por.get(s).push(it); }
  const grupos=[...por.entries()].map(([setor,itens])=>({setor, itens, v:round2(itens.reduce((a,i)=>a+i.vd,0))})).sort((a,b)=>a.v-b.v);
  const opcoes=sel=>`<option value="">— não importar —</option>${S.setoresAll.map(x=>`<option value="${x.id}" ${x.id===sel?'selected':''}>${esc(x.nome)}</option>`).join('')}`;
  return await new Promise(resolver=>{
  const m=modal(`<h2>📦 Acertos de balanço por produto</h2>
    <div class="grid kpis" style="margin:8px 0">
      <div class="kpi"><div class="l">Período</div><div class="v" style="font-size:20px">${fD(r.periodo.ini)} a ${fD(r.periodo.fim)}</div><div class="d">filial ${esc(r.filial||'')}${r.emitido?' · emitido '+fD(r.emitido):''}</div></div>
      <div class="kpi"><div class="l">Resultado (sobras − faltas)</div><div class="v" style="font-size:20px;color:${r.diferenca<0?'var(--bad)':'var(--good)'}">${brl(r.diferenca)}</div><div class="d">${r.itens.length} produtos</div></div>
    </div>
    ${r.total!=null?(Math.abs(r.total-r.diferenca)<1?'<div class="note small" style="background:var(--good-bg);border-color:#a9d8b8">✔ Conferido: bate com o TOTAL DIFERENÇA do relatório.</div>':`<div class="note err small">A soma (${brl(r.diferenca)}) não bate com o TOTAL DIFERENÇA (${brl(r.total)}).</div>`):''}
    <p class="small muted" style="margin:8px 0 6px">O relatório não separa por seção: cada produto foi para o setor pelo cadastro de produtos${porDesc?` (${porDesc} pela descrição, como BOV, LING, F/V…)`:''}. Confira as linhas em amarelo.</p>
    <div class="tw" style="max-height:320px;overflow:auto"><table><thead><tr><th>Grupo</th><th class="n">Produtos</th><th class="n">Resultado</th><th>Setor do site</th></tr></thead><tbody>
      ${grupos.map((g,i)=>`<tr style="${g.setor?'':'background:#fff6dc'}"><td>${g.setor?esc(nomeSetor(g.setor)):'<b>Não identificados</b><div class="small muted">'+esc(g.itens.slice().sort((a,b)=>a.vd-b.vd).slice(0,4).map(x=>cap1(x.d)).join(', '))+'…</div>'}</td><td class="n">${g.itens.length}</td><td class="n">${brl0(g.v)}</td><td><select data-g="${i}" style="border:1px solid var(--line);border-radius:8px;padding:4px 6px">${opcoes(g.setor)}</select></td></tr>`).join('')}
    </tbody></table></div>
    <p class="small muted" style="margin-top:8px">Isso entra só na análise (aba Perdas → Acertos de balanço). Não mexe na perda lançada nos dias.</p>
    <div id="raErr" class="note err small hide"></div>
    <div class="row" style="margin-top:12px"><div class="sp"></div><button class="btn" id="mN">Cancelar</button><button class="btn p" id="mY">Salvar acertos</button></div>`);
  $('#mN',m).onclick=()=>{ closeModal(); resolver(null); };
  $('#mY',m).onclick=async()=>{
    const por={}; m.querySelectorAll('select[data-g]').forEach(s=>{ if(s.value) (por[s.value]=por[s.value]||[]).push(...grupos[+s.dataset.g].itens); });
    if(!Object.keys(por).length){ const e=$('#raErr',m); e.textContent='Escolha o setor de pelo menos um grupo.'; e.classList.remove('hide'); return; }
    $('#mY',m).disabled=true; $('#mY',m).textContent='Salvando…';
    try{
      const rows=Object.entries(por).map(([id,its])=>({ setor_id:id, periodo_inicio:r.periodo.ini, periodo_fim:r.periodo.fim, arquivo_nome:f.name,
        diferenca:round2(its.reduce((a,i)=>a+i.vd,0)), sobras:round2(its.reduce((a,i)=>a+(i.vd>0?i.vd:0),0)), faltas:round2(its.reduce((a,i)=>a+(i.vd<0?-i.vd:0),0)),
        dados:{ emitido:r.emitido, filial:r.filial, itens:its } }));
      await q(S.sb.from('analise_acertos').upsert(rows, {onConflict:'setor_id,periodo_inicio,periodo_fim'}));
      closeModal(); toast(`Acertos salvos ✔ — ${rows.map(x=>nomeSetor(x.setor_id)).join(', ')}`, 5000);
      if(S.view==='setor' && S.setorAba==='per') render();
      resolver(true);
    }catch(e){ const x=$('#raErr',m); x.textContent='Não foi possível salvar: '+(e.message||e); x.classList.remove('hide'); $('#mY',m).disabled=false; $('#mY',m).textContent='Salvar acertos'; }
  };
  });
}

async function cardAcertos(box, sid){
  let ls=[]; try{ ls=await q(S.sb.from('analise_acertos').select('*').eq('setor_id',sid).order('periodo_fim',{ascending:false}).limit(24)); }catch(_){ return; }
  if(!box.isConnected) return;
  const btn=S.gerente?'<button class="btn" id="acImp">＋ Importar acertos de balanço</button><input type="file" id="acArq" accept=".pdf,.txt" class="hide">':'';
  const ligar=()=>{ const b=$('#acImp'); if(b){ b.onclick=()=>$('#acArq').click(); $('#acArq').onchange=e=>{ const f=e.target.files[0]; e.target.value=''; if(f) importarRelatorioAcertos(f); }; } };
  if(!ls.length){ box.innerHTML=`<div class="card" style="margin-top:12px"><div class="row"><h2 style="margin:0">📦 Acertos de balanço</h2><div class="sp"></div>${btn}</div><p class="small muted" style="margin:6px 0 0">Importe o “Resumo de acertos/perdas por produto” do sistema para ver as sobras e faltas dos balanços, produto por produto, e comparar com o ano passado.</p></div>`; ligar(); return; }
  S.acSel=S.acSel||{}; const a=ls.find(x=>x.id===S.acSel[sid])||ls[0];
  const ly=ls.find(x=>x.periodo_inicio===addAnos(a.periodo_inicio,-1) && x.periodo_fim===addAnos(a.periodo_fim,-1)) || (ls.find(x=>x.periodo_inicio===addAnos(a.periodo_inicio,1) && x.periodo_fim===addAnos(a.periodo_fim,1)) ? null : null);
  const lyMap=new Map(); if(ly) for(const i of ly.dados.itens) lyMap.set(String(i.c),i);
  const its=a.dados.itens.slice().sort((x,y)=>x.vd-y.vd);
  const cor=v=>v<0?'var(--bad)':'var(--good)';
  box.innerHTML=`<div class="card" style="margin-top:12px">
    <div class="row" style="gap:8px;flex-wrap:wrap"><h2 style="margin:0">📦 Acertos de balanço</h2><div class="sp"></div>
      <select id="acSel" style="border:1px solid var(--line);border-radius:8px;padding:5px 6px">${ls.map(x=>`<option value="${x.id}" ${x.id===a.id?'selected':''}>${fD(x.periodo_inicio)} a ${fD(x.periodo_fim)} · ${brl0(x.diferenca)}</option>`).join('')}</select>${btn}</div>
    <div class="grid kpis" style="margin-top:10px">
      <div class="kpi"><div class="l">Resultado ${fD(a.periodo_inicio)} a ${fD(a.periodo_fim)}</div><div class="v" style="color:${cor(+a.diferenca)}">${brl0(+a.diferenca)}</div><div class="d">faltas ${brl0(+a.faltas)} · sobras ${brl0(+a.sobras)}</div></div>
      <div class="kpi"><div class="l">Ano passado, mesmo período</div><div class="v" style="${ly?'color:'+cor(+ly.diferenca):''}">${ly?brl0(+ly.diferenca):'—'}</div><div class="d">${ly?`faltas ${brl0(+ly.faltas)} · sobras ${brl0(+ly.sobras)}`:'importe o mesmo relatório do ano passado para comparar'}</div></div>
    </div>
    <div class="tw" style="max-height:45vh;margin-top:10px"><table><thead><tr><th>Produto</th><th class="n">Sobrou</th><th class="n">Faltou</th><th class="n">Diferença qtd</th><th class="n">Resultado R$</th>${ly?'<th class="n">Ano pass.</th>':''}</tr></thead><tbody>
      ${its.slice(0,300).map(i=>{ const o=lyMap.get(String(i.c)); return `<tr><td><span class="muted small">${esc(i.c)}</span> ${esc(cap1(i.d))}</td><td class="n">${i.ve?brl(i.ve):'—'}</td><td class="n">${i.vs?brl(i.vs):'—'}</td><td class="n">${qtBR(i.qd)}</td><td class="n" style="color:${cor(i.vd)};font-weight:600">${brl(i.vd)}</td>${ly?`<td class="n">${o?brl(o.vd):'—'}</td>`:''}</tr>`; }).join('')}
    </tbody></table></div></div>`;
  $('#acSel').onchange=e=>{ S.acSel[sid]=+e.target.value; cardAcertos(box,sid); };
  ligar();
}

/* ===== Trocas: "RESUMO DE PRODUTOS TRANSFERIDOS DA FILIAL x PARA AS FILIAIS y" ===== */
const DEP_TROCA = { BAZAR:'bazar', BEBIDAS:'bebidas', LIMPEZA:'limpeza', PERECIVEIS:'pereciveis', PERFUMARIA:'perfumaria', ELETRO:'eletro', ACOUGUE:'acougue', HORTIFRUTI:'hortifruti', PADARIA:'padaria' };
async function importarRelatorioTrocas(f){
  busy('Lendo o relatório de trocas…');
  let r=null, prod=new Map();
  try{ r=Parser.analisarRelatorioTransferencias(await linhasDoArquivo(f));
    if(r){ for(let i=0;;i+=1000){ const pg=await q(S.sb.from('produtos_setor').select('codigo,setor_id').range(i,i+999)); (pg||[]).forEach(x=>prod.set(String(x.codigo),x.setor_id)); if(!pg||pg.length<1000) break; } } }
  catch(e){ closeModal(); toast('Não consegui ler o arquivo: '+e.message, 6000); return null; }
  closeModal();
  if(!r){ toast('Esse arquivo não parece o “Resumo de produtos transferidos” do sistema.', 6000); return null; }
  const por=new Map();
  for(const dp of r.deps) for(const it of dp.itens){ const s=prod.get(String(it.c)) || setorPorDescricao(it.d) || DEP_TROCA[normN2(dp.nome)] || ''; if(!por.has(s)) por.set(s,[]); por.get(s).push({...it, dep:dp.nome}); }
  const grupos=[...por.entries()].map(([setor,itens])=>({setor, itens, c:round2(itens.reduce((a,i)=>a+i.tc,0))})).sort((a,b)=>b.c-a.c);
  const opcoes=sel=>`<option value="">— não importar —</option>${S.setoresAll.map(x=>`<option value="${x.id}" ${x.id===sel?'selected':''}>${esc(x.nome)}</option>`).join('')}`;
  return await new Promise(resolver=>{
  const m=modal(`<h2>🔄 Trocas (produtos transferidos)</h2>
    <div class="grid kpis" style="margin:8px 0">
      <div class="kpi"><div class="l">Período</div><div class="v" style="font-size:20px">${fD(r.periodo.ini)} a ${fD(r.periodo.fim)}</div><div class="d">filial ${esc(r.origem)} → ${esc(r.destino)}</div></div>
      <div class="kpi"><div class="l">Total a custo</div><div class="v" style="font-size:20px">${brl(r.custo)}</div><div class="d">${r.itens} produtos · a preço de venda ${brl0(r.venda)}</div></div>
    </div>
    ${r.total?(Math.abs(r.total.custo-r.custo)<1?'<div class="note small" style="background:var(--good-bg);border-color:#a9d8b8">✔ Conferido: bate com o TOTAL GERAL do relatório.</div>':`<div class="note err small">A soma (${brl(r.custo)}) não bate com o TOTAL GERAL (${brl(r.total.custo)}).</div>`):''}
    <p class="small muted" style="margin:8px 0 6px">Cada produto foi para o setor pelo cadastro de produtos (ou pela descrição / departamento). Confira as linhas em amarelo.</p>
    <div class="tw" style="max-height:320px;overflow:auto"><table><thead><tr><th>Grupo</th><th class="n">Produtos</th><th class="n">Custo</th><th>Setor do site</th></tr></thead><tbody>
      ${grupos.map((g,i)=>`<tr style="${g.setor?'':'background:#fff6dc'}"><td>${g.setor?esc(nomeSetor(g.setor)):'<b>Não identificados</b><div class="small muted">'+esc(g.itens.slice().sort((a,b)=>b.tc-a.tc).slice(0,4).map(x=>cap1(x.d)).join(', '))+'…</div>'}</td><td class="n">${g.itens.length}</td><td class="n">${brl0(g.c)}</td><td><select data-g="${i}" style="border:1px solid var(--line);border-radius:8px;padding:4px 6px">${opcoes(g.setor)}</select></td></tr>`).join('')}
    </tbody></table></div>
    <p class="small muted" style="margin-top:8px">As trocas entram na análise (aba Trocas do setor, Painel e tela Perdas da loja), separadas da perda: não mexem na perda lançada nem no teto.</p>
    <div id="rtErr" class="note err small hide"></div>
    <div class="row" style="margin-top:12px"><div class="sp"></div><button class="btn" id="mN">Cancelar</button><button class="btn p" id="mY">Salvar trocas</button></div>`);
  $('#mN',m).onclick=()=>{ closeModal(); resolver(null); };
  $('#mY',m).onclick=async()=>{
    const por={}; m.querySelectorAll('select[data-g]').forEach(s=>{ if(s.value) (por[s.value]=por[s.value]||[]).push(...grupos[+s.dataset.g].itens); });
    if(!Object.keys(por).length){ const e=$('#rtErr',m); e.textContent='Escolha o setor de pelo menos um grupo.'; e.classList.remove('hide'); return; }
    $('#mY',m).disabled=true; $('#mY',m).textContent='Salvando…';
    try{
      const rows=Object.entries(por).map(([id,its])=>({ setor_id:id, periodo_inicio:r.periodo.ini, periodo_fim:r.periodo.fim, arquivo_nome:f.name,
        custo:round2(its.reduce((a,i)=>a+i.tc,0)), venda:round2(its.reduce((a,i)=>a+i.tv,0)), dados:{ emitido:r.emitido, origem:r.origem, destino:r.destino, itens:its } }));
      await q(S.sb.from('analise_trocas').upsert(rows, {onConflict:'setor_id,periodo_inicio,periodo_fim'}));
      S._alertas=null; closeModal(); toast(`Trocas salvas ✔ — ${rows.map(x=>nomeSetor(x.setor_id)).join(', ')}`, 5000);
      if(S.view==='setor'){ S.setorAba='trc'; if(!por[S.setorSel]) S.setorSel=Object.keys(por).find(x=>SETORES_TROCA.includes(x))||Object.keys(por)[0]; } render();
      resolver(true);
    }catch(e){ const x=$('#rtErr',m); x.textContent='Não foi possível salvar: '+(e.message||e); x.classList.remove('hide'); $('#mY',m).disabled=false; $('#mY',m).textContent='Salvar trocas'; }
  };
  });
}

async function cardTrocas(box, sid){
  let ls=[]; try{ ls=await q(S.sb.from('analise_trocas').select('*').eq('setor_id',sid).order('periodo_fim',{ascending:false}).limit(24)); }catch(_){ return; }
  if(!box.isConnected || !ls.length){ if(box.isConnected) box.innerHTML=''; return; }
  S.trSel=S.trSel||{}; const a=ls.find(x=>x.id===S.trSel[sid])||ls[0];
  const ly=ls.find(x=>x.periodo_inicio===addAnos(a.periodo_inicio,-1) && x.periodo_fim===addAnos(a.periodo_fim,-1));
  const its=a.dados.itens.slice().sort((x,y)=>y.tc-x.tc);
  box.innerHTML=`<div class="card" style="margin-top:12px">
    <div class="row" style="gap:8px;flex-wrap:wrap"><h2 style="margin:0">🔄 Trocas</h2><div class="sp"></div>
      <select id="trSel" style="border:1px solid var(--line);border-radius:8px;padding:5px 6px">${ls.map(x=>`<option value="${x.id}" ${x.id===a.id?'selected':''}>${fD(x.periodo_inicio)} a ${fD(x.periodo_fim)} · ${brl0(+x.custo)}</option>`).join('')}</select></div>
    <div class="grid kpis" style="margin-top:10px">
      <div class="kpi"><div class="l">Trocas ${fD(a.periodo_inicio)} a ${fD(a.periodo_fim)} (custo)</div><div class="v">${brl0(+a.custo)}</div><div class="d">${its.length} produtos · a preço de venda ${brl0(+a.venda)} · filial ${esc(a.dados.origem||'')} → ${esc(a.dados.destino||'')}</div></div>
      <div class="kpi"><div class="l">Ano passado, mesmo período</div><div class="v">${ly?brl0(+ly.custo):'—'}</div><div class="d">${ly?'':'importe o mesmo relatório do ano passado para comparar'}</div></div>
    </div>
    <div class="tw" style="max-height:45vh;margin-top:10px"><table><thead><tr><th>Produto</th><th class="n">Qtd</th><th class="n m-hide">Custo un.</th><th class="n">Custo</th><th class="n m-hide">Preço de venda</th></tr></thead><tbody>
      ${its.slice(0,300).map(i=>`<tr><td><span class="muted small">${esc(i.c)}</span> ${esc(cap1(i.d))}</td><td class="n">${qtBR(i.q)}</td><td class="n m-hide">${brl(i.cu)}</td><td class="n"><b>${brl(i.tc)}</b></td><td class="n m-hide">${brl(i.tv)}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  $('#trSel').onchange=e=>{ S.trSel[sid]=+e.target.value; cardTrocas(box,sid); };
}

/* ===== Aba "Trocas" do setor ===== */
const SETORES_TROCA = ['pereciveis','merc_seca','merc_salgada','merc_doce','bebidas','perfumaria','limpeza','bazar','leite_gas','eletro'];
function barraPct(p, cor='var(--brand, #d71f26)'){ return `<div style="height:6px;background:#eee;border-radius:9px;overflow:hidden;margin-top:3px"><div style="height:100%;width:${Math.max(2,Math.min(100,p*100))}%;background:${cor}"></div></div>`; }
async function renderTrocasSetor(box, s){
  const sid=s.id; const vivo=()=>S.view==='setor' && S.setorAba==='trc' && S.setorSel===sid && box.isConnected;
  const btnImp = S.gerente? `<button class="btn p" id="trImp">＋ Importar relatório de trocas</button><input type="file" id="trArq" accept=".pdf,.txt" class="hide">`:'';
  const ligar=()=>{ const b=$('#trImp'); if(b){ b.onclick=()=>$('#trArq').click(); $('#trArq').onchange=e=>{ const f=e.target.files[0]; e.target.value=''; if(f) importarRelatorioTrocas(f); }; } };
  let ls=[]; try{ ls=await q(S.sb.from('analise_trocas').select('id,periodo_inicio,periodo_fim,custo').eq('setor_id',sid).order('periodo_fim',{ascending:false}).limit(60)); }catch(e){ box.innerHTML=`<div class="note err">Erro: ${esc(e.message)}</div>`; return; }
  if(!vivo()) return;
  if(!ls.length){ box.innerHTML=`<div class="card empty"><h2>Nenhuma troca do ${esc(s.nome)} ainda</h2><p>${S.gerente?'Importe o “Resumo de produtos transferidos” (trocas) do sistema. O site separa os produtos por setor e mostra o que mais vai para troca.':'Assim que o gerente importar o relatório de trocas, a análise aparece aqui.'}</p><div style="margin-top:12px">${btnImp}</div></div>`; ligar(); return; }
  S.trSel=S.trSel||{}; const selId=ls.some(x=>x.id===S.trSel[sid])?S.trSel[sid]:ls[0].id;
  let a, ly=null, lojaTot=0, venda=0;
  try{ a=(await q(S.sb.from('analise_trocas').select('*').eq('id',selId)))[0];
    ly=(await q(S.sb.from('analise_trocas').select('custo,dados,periodo_inicio,periodo_fim').eq('setor_id',sid).eq('periodo_inicio',addAnos(a.periodo_inicio,-1)).eq('periodo_fim',addAnos(a.periodo_fim,-1)).limit(1)))[0]||null;
    lojaTot=(await q(S.sb.from('analise_trocas').select('custo').eq('periodo_inicio',a.periodo_inicio).eq('periodo_fim',a.periodo_fim))).reduce((x,r)=>x+(+r.custo||0),0);
    venda=(await todasLinhas(()=>S.sb.from('lancamentos').select('venda').eq('setor_id',sid).gte('data',a.periodo_inicio).lte('data',a.periodo_fim))).reduce((x,r)=>x+(+r.venda||0),0);
  }catch(e){ box.innerHTML=`<div class="note err">Erro: ${esc(e.message)}</div>`; return; }
  if(!vivo()) return;
  const its=a.dados.itens.slice().sort((x,y)=>y.tc-x.tc); const tot=+a.custo||0;
  const lyMap=new Map(); if(ly) for(const i of ly.dados.itens) lyMap.set(String(i.c),i);
  let ac=0,n80=0; for(const i of its){ ac+=i.tc; n80++; if(ac>=tot*0.8) break; }
  const varP=(x,b)=>{ if(b==null) return '<span class="muted">—</span>'; if(!b) return x?'<span class="an-novo">nova</span>':'—'; const v=x/b-1; return `<span style="color:${v>0?'var(--bad)':'var(--good)'};font-weight:600">${v>0?'▲':'▼'} ${pctBR(Math.abs(v),0)}</span>`; };
  const porDep={}; for(const i of its){ const k=i.dep||'—'; porDep[k]=(porDep[k]||0)+i.tc; }
  const subiu=ly? its.map(i=>({i,d:i.tc-((lyMap.get(String(i.c))||{}).tc||0)})).filter(x=>x.d>0).sort((x,y)=>y.d-x.d).slice(0,3):[];
  box.innerHTML=`
    <div class="row" style="margin-bottom:10px;gap:8px;flex-wrap:wrap"><label class="f" style="margin:0">Período<select id="trSel">${ls.map(x=>`<option value="${x.id}" ${x.id===a.id?'selected':''}>${fD(x.periodo_inicio)} a ${fD(x.periodo_fim)} · ${brl0(+x.custo)}</option>`).join('')}</select></label><div class="sp"></div>${btnImp}</div>
    <div class="grid kpis">
      <div class="kpi hero"><div class="l">Trocas de ${fD(a.periodo_inicio)} até ${fD(a.periodo_fim)}</div><div class="v">${brl0(tot)}</div><div class="d">a custo · ${its.length} produtos · a preço de venda ${brl0(+a.venda)}</div></div>
      <div class="kpi"><div class="l">Sobre a venda do setor</div><div class="v">${venda?pctBR(tot/venda,2):'—'}</div><div class="d">venda lançada no período: ${brl0(venda)}</div></div>
      <div class="kpi"><div class="l">Parte das trocas da loja</div><div class="v">${lojaTot?pctBR(tot/lojaTot,0):'—'}</div><div class="d">trocas da loja no período: ${brl0(lojaTot)}</div></div>
      <div class="kpi"><div class="l">Ano passado, mesmo período</div><div class="v">${ly?brl0(+ly.custo):'—'}</div><div class="d">${ly?varP(tot,+ly.custo)+' em relação ao ano passado':'importe o relatório de trocas do ano passado para comparar'}</div></div>
    </div>
    <div class="card" style="margin-top:12px"><h2>👀 Onde olhar primeiro</h2><ul class="small" style="margin:6px 0 0 18px;line-height:1.6">
      <li><b>${n80} produto(s)</b> fazem 80% das trocas do setor.</li>
      ${its.slice(0,3).map(i=>`<li><b>${esc(cap1(i.d))}</b> — ${brl0(i.tc)} (${pctBR(i.tc/tot,0)} das trocas do setor; ${qtBR(i.q)} un/kg)</li>`).join('')}
      ${its.length>1?`<li>Menor troca: <b>${esc(cap1(its[its.length-1].d))}</b> — ${brl(its[its.length-1].tc)}</li>`:''}
      ${subiu.length?`<li>Mais subiram contra o ano passado: ${subiu.map(x=>`<b>${esc(cap1(x.i.d))}</b> +${brl0(x.d)}`).join(' · ')}</li>`:''}
      ${Object.keys(porDep).length>1?`<li>Por departamento do sistema: ${Object.entries(porDep).sort((x,y)=>y[1]-x[1]).map(([k,v])=>`${esc(cap1(k))} ${brl0(v)}`).join(' · ')}</li>`:''}
    </ul></div>
    <div class="card" style="margin-top:12px">
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px"><h2 style="margin:0">Produtos</h2><div class="sp"></div><input id="trBusca" placeholder="Buscar produto…" style="border:1px solid var(--line);border-radius:8px;padding:6px 8px;min-width:150px"></div>
      <div class="tw" style="max-height:60vh"><table><thead><tr><th class="m-hide">#</th><th>Produto</th><th class="n m-hide">Qtd</th><th class="n m-hide">Custo un.</th><th class="n">Custo</th><th class="n m-hide">Preço venda</th>${ly?'<th class="n m-hide">Ano pass.</th>':''}<th class="n">Part.</th></tr></thead><tbody id="trBody"></tbody></table></div>
    </div>`;
  const desenha=()=>{ const t=normN2($('#trBusca').value);
    $('#trBody').innerHTML=its.map((i,k)=>({i,k})).filter(({i})=>!t||normN2(i.d).includes(t)||String(i.c)===t).slice(0,400).map(({i,k})=>{ const o=lyMap.get(String(i.c)); return `<tr><td class="muted m-hide">${k+1}</td><td><span class="muted small">${k+1}º · ${esc(i.c)}</span> ${esc(cap1(i.d))}<div class="small muted m-only">${qtBR(i.q)} un/kg · ${brl(i.cu)}/un · venda ${brl(i.tv)}${ly?` · ano pass. ${o?brl(o.tc):'—'}`:''}</div></td><td class="n m-hide">${qtBR(i.q)}</td><td class="n m-hide">${brl(i.cu)}</td><td class="n"><b>${brl(i.tc)}</b></td><td class="n m-hide">${brl(i.tv)}</td>${ly?`<td class="n m-hide">${o?brl(o.tc)+`<div class="small muted">${qtBR(o.q)} un/kg</div>`:'—'}</td>`:''}<td class="n" style="min-width:70px">${pctBR(i.tc/tot,1)}${barraPct(i.tc/its[0].tc)}</td></tr>`; }).join('')||'<tr><td colspan="8" class="muted">Nada encontrado.</td></tr>'; };
  $('#trBusca').oninput=desenha; desenha();
  $('#trSel').onchange=e=>{ S.trSel[sid]=+e.target.value; renderTrocasSetor(box,s); };
  ligar();
}
