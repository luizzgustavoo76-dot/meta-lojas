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
    <label class="small" style="display:flex;gap:8px;align-items:flex-start;margin-top:12px"><input type="checkbox" id="rpAcerta" checked style="margin-top:3px"><span><b>Acertar a perda lançada no site</b> para ficar igual ao relatório. A diferença vai no dia ${fD(r.periodo.fim)}.</span></label>
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
      closeModal(); toast(msg, 7000);
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
  if(!lista.length){ box.innerHTML=`<div class="card empty"><h2>Nenhum relatório de perdas do ${esc(s.nome)} ainda</h2><p>${S.gerente?'Importe o relatório “Perdas da filial” do sistema (PDF). O site mostra o que mais pesa na perda, produto por produto, e pode acertar a perda lançada para bater com o sistema.':'Assim que o gerente importar o relatório de perdas do sistema, a análise por produto aparece aqui.'}</p><div style="margin-top:12px">${btnImp}</div></div>`; ligar(); return; }
  S.perSel=S.perSel||{}; const selId=S.perSel[sid] && lista.some(x=>x.id===S.perSel[sid]) ? S.perSel[sid] : lista[0].id;
  let reg, lancado=null, venda=null;
  try{ reg=(await q(S.sb.from('analise_perdas').select('*').eq('id',selId)))[0];
    lancado=await perdaLancada(sid, reg.periodo_inicio, reg.periodo_fim);
    const lv=await q(S.sb.from('lancamentos').select('venda').eq('setor_id',sid).gte('data',reg.periodo_inicio).lte('data',reg.periodo_fim)); venda=(lv||[]).reduce((a,x)=>a+(+x.venda||0),0);
  }catch(e){ box.innerHTML=`<div class="note err">Erro ao carregar: ${esc(e.message)}</div>`; return; }
  if(!vivo()) return;
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
      <div class="kpi"><div class="l">Perda sobre as entradas</div><div class="v">${pctBR(ent?qt/ent:null)}</div><div class="d">quantidade perdida ÷ quantidade que entrou</div></div>
      <div class="kpi"><div class="l">Perda sobre a venda</div><div class="v">${pctBR(venda?tot/venda:null,2)}</div><div class="d">venda lançada no período: ${brl0(venda)}</div></div>
      <div class="kpi"><div class="l">Lançado no site</div><div class="v">${brl0(lancado)}</div><div class="d">${Math.abs(lancado-tot)<1?'✔ igual ao relatório':`diferença de ${brl(tot-lancado)} para o relatório`}</div></div>
    </div>
    <div class="card" style="margin-top:12px"><h2>👀 Onde olhar primeiro</h2><ul class="small" style="margin:6px 0 0 18px;line-height:1.6">
      <li><b>${n80} produto(s)</b> fazem 80% da perda do setor.</li>
      ${top.map(i=>`<li><b>${esc(cap1(i.d))}</b> — ${brl0(i.val)} (${pctBR(i.val/tot,0)} da perda do setor; ${qtBR(i.q)} perdidos)</li>`).join('')}
      ${altos.length?`<li>Perdem 30% ou mais do que sai da loja: ${altos.map(i=>`<b>${esc(cap1(i.d))}</b> ${pctBR(saida(i),0)}`).join(' · ')}</li>`:''}
      ${ant?`<li>Período anterior importado (${fD(ant.periodo_inicio)} a ${fD(ant.periodo_fim)}): ${brl0(ant.valor)}.</li>`:''}
    </ul></div>
    <div class="card" style="margin-top:12px">
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px"><h2 style="margin:0">Produtos</h2><div class="sp"></div>
        <input id="pdBusca" placeholder="Buscar produto…" style="border:1px solid var(--line);border-radius:8px;padding:6px 8px;min-width:160px">
        <label class="small" style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="pdSo" checked> só com perda</label></div>
      <div class="tw" style="max-height:60vh"><table><thead><tr><th>Produto</th><th class="n">Entrou</th><th class="n">Vendeu</th><th class="n">Perdeu</th><th class="n m-hide">Custo méd.</th><th class="n">Perda R$</th><th class="n">% da saída</th><th class="n m-hide">Part.</th></tr></thead><tbody id="pdBody"></tbody></table></div>
    </div>`;
  const desenha=()=>{ const t=normN2($('#pdBusca').value), so=$('#pdSo').checked;
    const ls=(so?comPerda:[...itens].sort((a,b)=>b.val-a.val||b.v-a.v)).filter(i=>!t || normN2(i.d).includes(t) || String(i.c)===t);
    $('#pdBody').innerHTML = ls.slice(0,400).map(i=>{ const sd=saida(i); return `<tr><td><span class="muted small">${esc(i.c)}</span> ${esc(cap1(i.d))}</td><td class="n">${qtBR(i.e)}</td><td class="n">${qtBR(i.v)}</td><td class="n">${qtBR(i.q)}</td><td class="n m-hide">${brl(i.cu)}</td><td class="n"><b>${brl(i.val)}</b></td><td class="n" style="${sd>=0.3?'color:var(--bad);font-weight:600':''}">${i.q?pctBR(sd,0):'—'}</td><td class="n m-hide">${tot?pctBR(i.val/tot,1):'—'}</td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">Nenhum produto.</td></tr>'; };
  $('#pdBusca').oninput=desenha; $('#pdSo').onchange=desenha; desenha();
  $('#pdSel').onchange=e=>{ S.perSel[sid]=+e.target.value; renderPerdasSetor(box,s); };
  ligar();
}
const normN2=t=>String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().trim();
