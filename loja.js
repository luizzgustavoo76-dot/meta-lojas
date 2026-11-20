/* Visão da loja inteira: checklist de importações, importação de vários arquivos, teto de perda,
   perdas e balanços da loja e cruzamento venda × perda × balanço por produto. */

const ontemIso = () => isoOf(new Date(Date.now()-864e5));
const nomeTipo = { vendas:'Vendas por departamento', vendas_secao:'Vendas por seção', bandeja:'Embandeijados (por classe)', perdas:'Perdas por produto', acertos:'Acertos de balanço', balanco:'Resultado de balanço', trocas:'Trocas (produtos transferidos)', planilha:'Planilha / relatório de vendas' };

/* ---------- impressão digital do arquivo (para avisar repetidos) ---------- */
async function hashArquivo(f){ const b=await crypto.subtle.digest('SHA-256', await f.arrayBuffer()); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
const esperaModalFechar = () => new Promise(r=>{ const t=setInterval(()=>{ if(!$('#modalRoot').innerHTML.trim()){ clearInterval(t); r(); } }, 400); });

async function identificarArquivo(f){
  const nome=f.name.toLowerCase();
  if(/\.(xlsx|xls|xlsm|csv)$/.test(nome) || f.type.startsWith('image/')) return { tipo:'planilha' };
  const linhas=await linhasDoArquivo(f);
  const rv=Parser.analisarRelatorioVendas(linhas); if(rv) return { tipo: rv.nivel==='CLASSE'?'bandeja':(rv.nivel && rv.nivel!=='DEPTO'?'vendas_secao':'vendas'), r:rv, ini:rv.periodo.ini, fim:rv.periodo.fim, valor:rv.venda };
  const tr=Parser.analisarRelatorioTransferencias(linhas); if(tr) return { tipo:'trocas', r:tr, ini:tr.periodo.ini, fim:tr.periodo.fim, valor:tr.custo };
  const ac=Parser.analisarRelatorioAcertos(linhas); if(ac) return { tipo:'acertos', r:ac, ini:ac.periodo.ini, fim:ac.periodo.fim, valor:ac.diferenca };
  const pe=Parser.analisarRelatorioPerdas(linhas); if(pe) return { tipo:'perdas', r:pe, ini:pe.periodo.ini, fim:pe.periodo.fim, valor:pe.valor };
  const ba=Parser.analisarBalancoSistema(linhas); if(ba) return { tipo:'balanco', r:ba, ini:ba.periodo?.ini, fim:ba.periodo?.fim, valor:ba.valorPerda };
  return { tipo:null };
}

/* ---------- importar vários arquivos de uma vez ---------- */
async function importarVarios(files){
  files=[...files].filter(Boolean); if(!files.length) return;
  if(files.length===1 && /\.(xlsx|xls|xlsm|csv|txt)$/i.test(files[0].name)) return importFile(files[0]);
  busy(`Identificando ${files.length} arquivo(s)…`);
  const itens=[];
  for(const f of files){
    const it={f, hash:null, tipo:null, avisos:[]};
    try{ it.hash=await hashArquivo(f); Object.assign(it, await identificarArquivo(f)); }catch(e){ it.erro=e.message; }
    itens.push(it);
  }
  // lança do período mais antigo para o mais novo (os acumulados dependem dos dias anteriores)
  itens.sort((a,b)=>String(a.fim||'9').localeCompare(String(b.fim||'9')) || String(a.ini||'').localeCompare(String(b.ini||'')));
  // repetidos: no mesmo lote e já importados antes
  let ja=[]; try{ ja=await q(S.sb.from('importacoes').select('hash,tipo,periodo_inicio,periodo_fim,arquivo_nome,criado_em').in('hash', itens.map(i=>i.hash).filter(Boolean))); }catch(_){}
  const vistos=new Set();
  for(const it of itens){
    if(it.hash && vistos.has(it.hash)) it.avisos.push('arquivo repetido neste lote'); vistos.add(it.hash);
    const j=ja.find(x=>x.hash===it.hash); if(j) it.avisos.push(`já importado em ${fD(j.criado_em.slice(0,10))}${j.arquivo_nome?' ('+j.arquivo_nome+')':''}`);
    if(it.ini){ const ano=+it.ini.slice(0,4), atual=+todayIso().slice(0,4);
      if(/passad|anterior|\bly\b|ant\b/i.test(it.f.name) && ano===atual) it.avisos.push(`o nome diz “ano passado”, mas o período é de ${ano}`);
      if(it.fim>todayIso()) it.avisos.push('o período termina no futuro'); }
    if(!it.tipo && !it.erro) it.avisos.push('não reconheci esse relatório');
    it.importar = !!it.tipo && !it.avisos.some(a=>/repetido|já importado|não reconheci/.test(a));
  }
  closeModal();
  const ok = await new Promise(res=>{
    const m=modal(`<h2>📥 Importar ${itens.length} arquivo(s)</h2>
      <p class="small muted" style="margin-top:-4px">O site reconheceu cada arquivo. Os marcados entram em sequência; cada um abre a conferência dele antes de salvar.</p>
      <div class="tw"><table><thead><tr><th></th><th>Arquivo</th><th>Tipo</th><th>Período</th><th class="n">Valor</th></tr></thead><tbody>
      ${itens.map((it,i)=>`<tr style="${it.avisos.length?'background:#fff6dc':''}"><td><input type="checkbox" data-k="${i}" ${it.importar?'checked':''} ${it.tipo?'':'disabled'}></td><td>${esc(it.f.name)}${it.avisos.map(a=>`<div class="small" style="color:var(--bad)">⚠ ${esc(a)}</div>`).join('')}${it.erro?`<div class="small" style="color:var(--bad)">${esc(it.erro)}</div>`:''}</td><td>${it.tipo?esc(nomeTipo[it.tipo]):'—'}</td><td>${it.ini?fD(it.ini)+' a '+fD(it.fim):'—'}</td><td class="n">${it.valor!=null?brl0(it.valor):'—'}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="row" style="margin-top:12px"><div class="sp"></div><button class="btn" id="mN">Cancelar</button><button class="btn p" id="mY">Importar marcados</button></div>`);
    $('#mN',m).onclick=()=>{ closeModal(); res(false); };
    $('#mY',m).onclick=()=>{ m.querySelectorAll('[data-k]').forEach(c=>itens[+c.dataset.k].importar=c.checked); closeModal(); res(true); };
  });
  if(!ok) return;
  const feitos=[];
  for(const it of itens.filter(x=>x.importar)){
    try{
      let r=null;
      const antes=S._salvouEm||0;
      if(it.tipo==='vendas'||it.tipo==='vendas_secao'){ const um=it.ini===it.fim; const atual=it.fim.slice(0,7)===todayIso().slice(0,7) || it.fim>=isoOf(new Date(Date.now()-40*864e5));
        if(atual){ await lancarPorRelatorio(it.r, it.f); await esperaModalFechar(); r=(S._salvouEm||0)>antes; } else { S.setorAba='ana'; r=await importarRelatorioVendas(it.f, S.setorSel||'acougue', {pre:it.r}); } }
      else if(it.tipo==='bandeja'){ const ab=S.setorAba; S.setorAba='bdj'; r=await importarRelatorioVendas(it.f,'acougue',{pre:it.r}); if(!r) S.setorAba=ab; }
      else if(it.tipo==='perdas') r=await importarRelatorioPerdas(it.f, '');
      else if(it.tipo==='acertos') r=await importarRelatorioAcertos(it.f);
      else if(it.tipo==='trocas') r=await importarRelatorioTrocas(it.f);
      else if(it.tipo==='balanco'){ formBalanco(null); const inp=$('#fbArq'); if(inp){ const dt=new DataTransfer(); dt.items.add(it.f); inp.files=dt.files; inp.dispatchEvent(new Event('change',{bubbles:true})); } await esperaModalFechar(); r=(S._salvouEm||0)>antes; }
      else if(it.tipo==='planilha'){ await importFile(it.f); await esperaModalFechar(); r=(S._salvouEm||0)>antes; }
      if(r){ feitos.push(it.f.name); try{ await q(S.sb.from('importacoes').upsert({hash:it.hash, tipo:it.tipo, periodo_inicio:it.ini||null, periodo_fim:it.fim||null, arquivo_nome:it.f.name})); }catch(_){} }
    }catch(e){ toast(`${it.f.name}: ${e.message||e}`, 6000); }
  }
  if(feitos.length) toast(`Importação concluída: ${feitos.length} arquivo(s)`, 4000);
  S._ck=null; S._alertas=null; render(); atualizarSino(true);
  if(feitos.length) setTimeout(()=>mostrarConferencia(true), 800);
}
function botaoImportarVarios(id='bVarios'){ return `<button class="btn p" id="${id}">📥 Importar relatórios</button><input type="file" id="${id}Arq" multiple accept=".pdf,.txt,.xlsx,.xls,.xlsm,.csv" class="hide">`; }
function ligarImportarVarios(id='bVarios'){ const b=$('#'+id); if(!b) return; const i=$('#'+id+'Arq'); b.onclick=()=>i.click(); i.onchange=()=>{ const fs=[...i.files]; i.value=''; if(fs.length) importarVarios(fs); }; }

/* ---------- checklist "Importações de hoje" (Painel do gerente) ---------- */
async function cardChecklist(app){
  if(!S.gerente) return; const head=app.querySelector('.row'); if(!head) return;
  const box=document.createElement('div'); box.id='ckBox'; head.after(box);
  box.innerHTML='<div class="card" style="margin-bottom:12px"><span class="spin"></span> Conferindo as importações…</div>';
  const ontem=ontemIso();
  const ult=async(t,extra)=>{ let b=S.sb.from(t).select('periodo_inicio,periodo_fim').order('periodo_fim',{ascending:false}).limit(1); if(extra) b=extra(b); return (await q(b))[0]||null; };
  const temLy=async(t,x)=>{ if(!x) return 0; const r=await q(S.sb.from(t).select('periodo_inicio,periodo_fim').gte('periodo_fim',addAnos(x.periodo_fim,-1).slice(0,8)+'01').lte('periodo_fim',fimDoMes(addAnos(x.periodo_fim,-1).slice(0,7))).limit(50)); const fLy=addAnos(x.periodo_fim,-1), iLy=addAnos(x.periodo_inicio,-1); return r.some(y=>y.periodo_fim===fLy && (y.periodo_inicio===iLy || (x.periodo_inicio===x.periodo_fim && y.periodo_inicio===fLy.slice(0,8)+'01'))) ? 2 : (r.length?1:0); };
  let d={};
  try{
    const [lv, av, ap, ab, aa] = await Promise.all([ q(S.sb.from('lancamentos').select('data').not('venda','is',null).order('data',{ascending:false}).limit(1)), ult('analise_vendas',b=>b.gte('periodo_fim',ontem.slice(0,8)+'01')), ult('analise_perdas',b=>b.gte('periodo_fim',ontem.slice(0,8)+'01')), ult('analise_bandeja',b=>b.gte('periodo_fim',ontem.slice(0,8)+'01')), ult('analise_acertos',b=>b.gte('periodo_fim',ontem.slice(0,8)+'01')) ]);
    d={ lv:lv[0]?.data||null, av, ap, ab, aa };
    [d.avLy, d.apLy, d.abLy] = await Promise.all([ temLy('analise_vendas',av), temLy('analise_perdas',ap), temLy('analise_bandeja',ab) ]);
    try{ d.cf=await conferencia(); }catch(_){ d.cf=null; }
  }catch(e){ box.innerHTML=''; return; }
  if(!box.isConnected) return;
  const st=(ok,meio)=> ok?'<span style="color:var(--good);font-weight:700">✔</span>':meio?'<span style="color:var(--warn);font-weight:700">●</span>':'<span style="color:var(--bad);font-weight:700">✗</span>';
  const ate=x=>x?`até ${fD(x.periodo_fim)}`:'nada neste mês';
  const linhas=[
    [st(d.lv>=ontem), 'Venda do dia lançada', d.lv?`último dia: ${fD(d.lv)}`:'nenhum dia', 'Vendas por departamento, acumulado até ontem'],
    [st(d.av?.periodo_fim>=ontem, !!d.av), 'Análise de vendas', ate(d.av), 'mesmo relatório (entra junto com a venda)'],
    [st(d.ap?.periodo_fim>=ontem, !!d.ap), 'Perdas por produto', ate(d.ap), 'Perdas da filial — Açougue, Hortifrúti e Padaria'],
    [st(d.ab?.periodo_fim>=isoOf(new Date(Date.now()-8*864e5)), !!d.ab), 'Embandeijados (semanal)', ate(d.ab), 'Vendas por classe'],
    [st(d.avLy===2 && d.apLy===2 && d.abLy===2, d.avLy||d.apLy||d.abLy), 'Base do ano passado', [['vendas',d.avLy,d.av],['perdas',d.apLy,d.ap],['embandeijados',d.abLy,d.ab]].map(([n,v,x])=>`${n} ${v===2?'✔':v===1?`● (falta ${x?fD(addAnos(x.periodo_inicio,-1))+' a '+fD(addAnos(x.periodo_fim,-1)):''})`:'✗'}`).join(' · '), 'para comparar: mesmo período do ano passado'],
    [st(d.cf && !d.cf.erros.length && (d.cf.periodoV||d.cf.periodoP), d.cf && d.cf.erros.length && d.cf.erros.every(x=>Math.abs(x.dif)<=Math.max(50,x.relatorio*0.005))), 'Conferência site × relatórios', d.cf? (d.cf.recomendar&&d.cf.recomendar.length? `tirar o relatório só do dia ${d.cf.recomendar.map(k=>fD(k).slice(0,5)).join(', ')} e importar` : d.cf.erros.length? d.cf.erros.slice(0,3).map(x=>`${nomeSetor(x.setor)} ${x.tipo} ${x.dif>0?'+':''}${brl0(x.dif)}`).join(' · ')+(d.cf.erros.length>3?` +${d.cf.erros.length-3}`:'') : (d.cf.periodoV||d.cf.periodoP?'tudo bate ✔':'sem relatório no mês')) : '—', 'toque em Conferir para ver setor por setor'],
    [st(!!d.aa, true), 'Acertos de balanço (opcional)', ate(d.aa), 'Resumo de acertos/perdas por produto'],
  ];
  const pend=linhas.filter(l=>!l[0].includes('✔')).length;
  box.innerHTML=`<div class="card" style="margin-bottom:12px">
    <div class="row" style="gap:8px;flex-wrap:wrap"><h2 style="margin:0">📋 Importações de hoje</h2><span class="small muted">${pend?`${pend} item(ns) para olhar`:'tudo em dia ✔'}</span><div class="sp"></div><button class="btn" id="bConf">🔎 Conferir</button>${botaoImportarVarios('bCk')}</div>
    <div class="tw" style="margin-top:8px"><table><tbody>${linhas.map(l=>`<tr><td style="width:24px">${l[0]}</td><td><b>${l[1]}</b><div class="small muted m-only">${esc(l[2])}</div></td><td class="small m-hide">${esc(l[2])}</td><td class="small muted m-hide">${esc(l[3])}</td></tr>`).join('')}</tbody></table></div>
    <p class="small muted" style="margin:6px 0 0">Pode selecionar todos os PDFs de uma vez: o site reconhece cada relatório, avisa se algum é repetido ou está com o período errado, e abre a conferência de um por um.</p></div>`;
  ligarImportarVarios('bCk'); const bc=$('#bConf'); if(bc) bc.onclick=()=>mostrarConferencia(false);
}

/* ---------- teto de perda por setor ---------- */
const TETO_FONTE = 'Referência: Pesquisa de Eficiência Operacional ABRAS (índice de perdas por seção, Brasil). Açougue 2,74% · FLV 4,73% · Padaria e confeitaria 4,62% · Demais perecíveis 2,49% · Mercearia seca 0,48% · Mercearia líquida 0,82% · Limpeza 0,57% · Higiene e perfumaria 0,90% · Bazar 1,18% · Eletroeletrônicos 0,61%.';
async function carregarTetos(){ if(S._tetos) return S._tetos; const r=await q(S.sb.from('setores').select('id,teto_perda')); S._tetos=Object.fromEntries((r||[]).map(x=>[x.id, x.teto_perda==null?null:+x.teto_perda])); return S._tetos; }
function perdaVendaMes(doc, ate){ const p={}, v={}; for(const k of diasDoMes(doc.mes)){ if(ate && k>ate) break; const d=doc.dias?.[k]; if(!d) continue;
    for(const [id,x] of Object.entries(d.vendas||{})) v[id]=(v[id]||0)+(+x||0); for(const [id,x] of Object.entries(d.perdas||{})) p[id]=(p[id]||0)+(+x||0); } return {p,v}; }
function semaforo(pc, teto){ if(teto==null||pc==null) return {cor:'var(--muted)', ico:'—', txt:'sem teto'}; const r=pc/teto; return r<=0.8?{cor:'var(--good)',ico:'🟢',txt:'dentro'}:r<=1?{cor:'var(--warn)',ico:'🟡',txt:'perto do teto'}:{cor:'var(--bad)',ico:'🔴',txt:'acima do teto'}; }
function tabelaTeto(doc, tetos, ate){
  const {p,v}=perdaVendaMes(doc, ate);
  const ls=doc.setores.map(s=>{ const pc=v[s.id]? (p[s.id]||0)/v[s.id]*100 : null; return {s, perda:p[s.id]||0, venda:v[s.id]||0, pc, teto:tetos[s.id], sm:p[s.id]?semaforo(pc,tetos[s.id]):{cor:'var(--muted)',ico:'⚪',txt:'sem perda lançada'}}; }).sort((a,b)=>((b.pc||0)/(b.teto||99))-((a.pc||0)/(a.teto||99)));
  const lst=`<div class="m-only">${ls.map(x=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 2px;border-bottom:1px solid var(--line)"><span>${x.sm.ico}</span><div style="flex:1"><b>${esc(x.s.nome)}</b><div class="small muted">perda ${brl0(x.perda)} · teto ${x.teto==null?'—':x.teto.toLocaleString('pt-BR')+'%'}</div></div><b style="color:${x.sm.cor}">${x.pc==null||!x.perda?'—':x.pc.toLocaleString('pt-BR',{maximumFractionDigits:2})+'%'}</b></div>`).join('')}</div>`;
  return lst+`<div class="tw d-only"><table><thead><tr><th>Setor</th><th class="n">Perda no mês</th><th class="n m-hide">Venda</th><th class="n">% da venda</th><th class="n">Teto</th><th>Situação</th></tr></thead><tbody>
    ${ls.map(x=>`<tr><td><b>${esc(x.s.nome)}</b></td><td class="n">${brl0(x.perda)}</td><td class="n m-hide">${brl0(x.venda)}</td><td class="n" style="color:${x.sm.cor};font-weight:600">${x.pc==null?'—':x.pc.toLocaleString('pt-BR',{maximumFractionDigits:2})+'%'}</td><td class="n">${x.teto==null?'—':x.teto.toLocaleString('pt-BR')+'%'}</td><td>${x.sm.ico} <span class="small">${x.sm.txt}</span></td></tr>`).join('')}
  </tbody></table></div>`;
}
async function cardTetoPainel(app, doc){
  if(!S.gerente) return; let tetos; try{ tetos=await carregarTetos(); }catch(_){ return; } if(!app.isConnected) return;
  const {p,v}=perdaVendaMes(doc, S.cutoff); const acima=doc.setores.filter(s=>v[s.id] && tetos[s.id]!=null && (p[s.id]||0)/v[s.id]*100>tetos[s.id]);
  const box=document.createElement('div'); box.className='card'; box.style.marginTop='12px';
  box.innerHTML=`<details ${acima.length?'open':''}><summary style="cursor:pointer"><h2 style="display:inline;margin:0">🎯 Perda × teto</h2> <span class="small muted">${acima.length?`🔴 ${acima.length} setor(es) acima do teto: ${acima.map(s=>esc(s.nome)).join(', ')}`:'🟢 todos os setores dentro do teto'}</span></summary>
    <div style="margin-top:10px">${tabelaTeto(doc,tetos,S.cutoff)}</div><p class="small muted" style="margin:6px 0 0">Perda lançada no mês até ${fD(S.cutoff)} (dia a dia + balanços) ÷ venda do setor. Ajuste os tetos em <a href="#metas">Painel do administrador → Metas do mês</a>. <a href="#perdas">Ver perdas da loja →</a></p></details>`;
  app.appendChild(box);
}
async function cardTetoConfig(app){
  if(!S.gerente) return; let tetos; try{ S._tetos=null; tetos=await carregarTetos(); }catch(_){ return; } if(!app.isConnected) return;
  const box=document.createElement('div'); box.className='card'; box.style.marginTop='12px';
  box.innerHTML=`<h2>🎯 Teto de perda por setor (% da venda)</h2><p class="small muted" style="margin-top:-4px">${esc(TETO_FONTE)} Os valores começam na média do Brasil; ajuste para a meta da loja.</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px">${S.setoresAll.map(s=>`<label class="f">${esc(s.nome)}<input class="in" inputmode="decimal" data-teto="${s.id}" value="${tetos[s.id]==null?'':String(tetos[s.id]).replace('.',',')}" placeholder="%"></label>`).join('')}</div>
    <div class="row" style="margin-top:10px"><div class="sp"></div><button class="btn p" id="bTeto">Salvar tetos</button></div>`;
  app.appendChild(box);
  $('#bTeto').onclick=async()=>{ try{ for(const i of box.querySelectorAll('[data-teto]')){ const v=i.value.trim()===''?null:parseNum(i.value); if(v!=null && (isNaN(v)||v<0||v>100)) return toast('Teto inválido em '+nomeSetor(i.dataset.teto),4000);
      if(v!==tetos[i.dataset.teto]) await q(S.sb.from('setores').update({teto_perda:v}).eq('id',i.dataset.teto)); } S._tetos=null; toast('Tetos salvos ✔'); }catch(e){ toast(e.message,5000); } };
}

/* ---------- Perdas da loja inteira ---------- */
async function renderPerdasLoja(app, doc){
  app.innerHTML=`<div class="row" style="align-items:flex-end;margin-bottom:12px"><div><h1>Perdas da loja</h1><p class="sub" style="margin:0">Todos os setores: teto, perdas por produto, acertos de balanço e os produtos que mais pesam</p></div><div class="sp"></div>${botaoImportarVarios('bVL')}</div><div id="plBox"><div class="empty"><span class="spin"></span> Carregando…</div></div>`;
  ligarImportarVarios('bVL');
  cardAlertas(app, null, app.querySelector('.row'));
  const box=$('#plBox'); const vivo=()=>S.view==='perdas' && box.isConnected;
  let tetos, perPer=[], acPer=[];
  try{ [tetos, perPer, acPer] = await Promise.all([ carregarTetos(), q(S.sb.from('analise_perdas').select('periodo_inicio,periodo_fim').order('periodo_fim',{ascending:false}).limit(300)), q(S.sb.from('analise_acertos').select('periodo_inicio,periodo_fim').order('periodo_fim',{ascending:false}).limit(300)) ]); }
  catch(e){ box.innerHTML=`<div class="note err">Erro: ${esc(e.message)}</div>`; return; }
  if(!vivo()) return;
  const periodos=[...new Map([...perPer,...acPer].map(x=>[x.periodo_inicio+'|'+x.periodo_fim,x])).values()].sort((a,b)=>b.periodo_fim.localeCompare(a.periodo_fim)||a.periodo_inicio.localeCompare(b.periodo_inicio));
  const atual=new Date().getFullYear()+'';
  S.plPer = S.plPer && periodos.some(p=>p.periodo_inicio+'|'+p.periodo_fim===S.plPer) ? S.plPer : ((periodos.find(p=>p.periodo_fim.startsWith(atual))||periodos[0]) ? (()=>{ const p=periodos.find(p=>p.periodo_fim.startsWith(atual))||periodos[0]; return p.periodo_inicio+'|'+p.periodo_fim; })() : null);
  const tetoHtml=`<div class="card"><h2>🎯 Perda do mês × teto — ${mesLabel(doc.mes)}</h2>${tabelaTeto(doc,tetos,S.cutoff)}<p class="small muted" style="margin:6px 0 0">Até ${fD(S.cutoff)}. ${esc(TETO_FONTE)}</p></div>`;
  if(!S.plPer){ box.innerHTML=tetoHtml+'<div class="card empty" style="margin-top:12px"><h2>Nenhum relatório de perdas ainda</h2><p>Importe o relatório “Perdas da filial” e o “Resumo de acertos/perdas por produto” do sistema.</p></div>'; return; }
  const [ini,fim]=S.plPer.split('|'); const lyI=addAnos(ini,-1), lyF=addAnos(fim,-1);
  let P=[],PL=[],A=[],AL=[],V=[],L=[],BAL=[],TR=[];
  try{ [P,PL,A,AL,V,L,BAL,TR]=await Promise.all([
      q(S.sb.from('analise_perdas').select('setor_id,valor,dados').eq('periodo_inicio',ini).eq('periodo_fim',fim)),
      q(S.sb.from('analise_perdas').select('setor_id,valor,dados').eq('periodo_inicio',lyI).eq('periodo_fim',lyF)),
      q(S.sb.from('analise_acertos').select('setor_id,diferenca,faltas,sobras,dados').eq('periodo_inicio',ini).eq('periodo_fim',fim)),
      q(S.sb.from('analise_acertos').select('setor_id,diferenca,faltas,sobras').eq('periodo_inicio',lyI).eq('periodo_fim',lyF)),
      q(S.sb.from('analise_vendas').select('setor_id,venda,dados').eq('periodo_inicio',ini).eq('periodo_fim',fim)),
      todasLinhas(()=>S.sb.from('lancamentos').select('setor_id,venda').gte('data',ini).lte('data',fim)),
      q(S.sb.from('balancos').select('setor_id,data,periodo_inicio,analise').gte('data',ini).lte('data',fim)),
      q(S.sb.from('analise_trocas').select('setor_id,custo,dados').eq('periodo_inicio',ini).eq('periodo_fim',fim)) ]); }
  catch(e){ box.innerHTML=`<div class="note err">Erro: ${esc(e.message)}</div>`; return; }
  if(!vivo()) return;
  const vendaSet={}; for(const x of L) vendaSet[x.setor_id]=(vendaSet[x.setor_id]||0)+(+x.venda||0);
  const by=(arr,k='setor_id')=>Object.fromEntries(arr.map(x=>[x[k],x]));
  const mP=by(P), mPL=by(PL), mA=by(A), mAL=by(AL), mT=by(TR);
  const ids=[...new Set([...P,...PL,...A,...AL,...TR].map(x=>x.setor_id))];
  const varP=(a,b)=>{ if(b==null) return '<span class="muted">—</span>'; if(!b) return a?'<span class="an-novo">nova</span>':'—'; const v=a/b-1; return `<span style="color:${v>0?'var(--bad)':'var(--good)'};font-weight:600">${v>0?'▲':'▼'} ${pctBR(Math.abs(v),0)}</span>`; };
  const tot=(o,f)=>ids.reduce((a,id)=>a+(o[id]?+o[id][f]:0),0);
  const ranking=ids.map(id=>({id, p:mP[id]?+mP[id].valor:0, pl:mPL[id]?+mPL[id].valor:null, a:mA[id]?-mA[id].diferenca:null, al:mAL[id]?-mAL[id].diferenca:null, t:mT[id]?+mT[id].custo:null, v:vendaSet[id]||0})).sort((x,y)=>(y.p+(y.a||0))-(x.p+(x.a||0)));
  // produtos: perda + falta de balanço, cruzando com a venda
  const prod=new Map(); const pk=c=>{ c=String(c); if(!prod.has(c)) prod.set(c,{c, d:'', setor:'', venda:0, perda:0, qp:0, falta:0, sobra:0}); return prod.get(c); };
  for(const r of P) for(const s of r.dados.secoes) for(const i of s.itens){ if(!i.q && !i.v) continue; const x=pk(i.c); x.d=x.d||i.d.replace(/^[FV] /,''); x.setor=x.setor||r.setor_id; x.perda+=i.val; x.qp+=i.q; }
  const temAcertos=A.length>0;
  if(temAcertos){ for(const r of A) for(const i of r.dados.itens){ const x=pk(i.c); x.d=x.d||i.d; x.setor=x.setor||r.setor_id; if(i.vd<0) x.falta+=-i.vd; else x.sobra+=i.vd; } }
  else { for(const b of BAL){ if((b.periodo_inicio||b.data)<ini) continue; const an=b.analise||{}; const lista=an.perdasProdutos||(an.top||[]).map(p=>[p.codigo,-p.valor]); for(const [c,v] of lista){ if(v>0 && prod.has(String(c))){ const x=pk(c); x.falta+=v; x.setor=x.setor||b.setor_id; } } } }
  for(const r of V) for(const dep of r.dados.departamentos) for(const p of dep.produtos){ const c=String(p.c); if(prod.has(c)){ const x=prod.get(c); x.venda+=p.v; x.d=x.d||p.d; x.setor=x.setor||r.setor_id; } }
  const lista=[...prod.values()].map(x=>({...x, total:x.perda+x.falta})).filter(x=>x.total>0).sort((a,b)=>b.total-a.total);
  const nSem=lista.filter(x=>!x.venda).length;
  box.innerHTML=`${tetoHtml}
    <div class="card" style="margin-top:12px"><div class="row" style="gap:8px;flex-wrap:wrap"><h2 style="margin:0">📊 Perdas e balanços por setor</h2><div class="sp"></div>
      <label class="f" style="margin:0">Período<select id="plSel">${periodos.map(p=>{ const k=p.periodo_inicio+'|'+p.periodo_fim; return `<option value="${k}" ${k===S.plPer?'selected':''}>${fD(p.periodo_inicio)} a ${fD(p.periodo_fim)}</option>`; }).join('')}</select></label></div>
      <div class="grid kpis" style="margin-top:10px">
        <div class="kpi hero"><div class="l">Perdas por produto (relatório de perdas)</div><div class="v">${brl0(tot(mP,'valor'))}</div><div class="d">${PL.length?`ano passado ${brl0(tot(mPL,'valor'))} · ${varP(tot(mP,'valor'),tot(mPL,'valor'))}`:'sem base do ano passado'}</div></div>
        <div class="kpi"><div class="l">Trocas (a custo)</div><div class="v">${TR.length?brl0(tot(mT,'custo')):'—'}</div><div class="d">${TR.length?'produtos transferidos para troca — fora da perda':'importe o “Resumo de produtos transferidos”'}</div></div>
        <div class="kpi"><div class="l">Resultado dos balanços (faltas − sobras)</div><div class="v">${A.length?brl0(-tot(mA,'diferenca')):'—'}</div><div class="d">${A.length?(AL.length?`ano passado ${brl0(-tot(mAL,'diferenca'))} · ${varP(-tot(mA,'diferenca'),-tot(mAL,'diferenca'))}`:'sem base do ano passado'):(AL.length?`ano passado ${brl0(-tot(mAL,'diferenca'))} · importe o “Resumo de acertos” deste período`:'importe o “Resumo de acertos/perdas por produto”')}</div></div>
      </div>
      <div class="m-only" style="margin-top:8px">${ranking.map(x=>{ const t=x.p+(x.a||0); const pc=x.v? t/x.v*100:null; const sm=semaforo(pc,tetos[x.id]); return `<div style="padding:8px 2px;border-bottom:1px solid var(--line)"><div style="display:flex;gap:8px"><b style="flex:1">${esc(nomeSetor(x.id))}</b><b>${brl0(t)}</b></div><div class="small muted">perdas ${brl0(x.p)} ${varP(x.p,x.pl)}${x.a!=null?` · balanço ${brl0(x.a)}`:''}${x.t!=null?` · trocas ${brl0(x.t)}`:''} · <span style="color:${sm.cor}">${pc==null?'—':pc.toLocaleString('pt-BR',{maximumFractionDigits:2})+'% da venda'} ${sm.ico}</span></div></div>`; }).join('')}</div>
      <div class="tw d-only" style="margin-top:10px"><table><thead><tr><th>Setor</th><th class="n">Perdas</th><th class="n m-hide">Ano pass.</th><th class="n">Var.</th><th class="n">Balanço</th><th class="n m-hide">Ano pass.</th><th class="n">Perdas + balanço</th><th class="n">% da venda</th><th class="n">Trocas</th></tr></thead><tbody>
      ${ranking.map(x=>{ const t=x.p+(x.a||0); const pc=x.v? t/x.v*100:null; const sm=semaforo(pc,tetos[x.id]); return `<tr><td><b>${esc(nomeSetor(x.id))}</b></td><td class="n">${brl0(x.p)}</td><td class="n m-hide">${x.pl==null?'—':brl0(x.pl)}</td><td class="n">${varP(x.p,x.pl)}</td><td class="n">${x.a==null?'—':brl0(x.a)}</td><td class="n m-hide">${x.al==null?'—':brl0(x.al)}</td><td class="n"><b>${brl0(t)}</b></td><td class="n" style="color:${sm.cor}">${pc==null?'—':pc.toLocaleString('pt-BR',{maximumFractionDigits:2})+'%'} ${sm.ico}</td><td class="n">${x.t==null?'—':brl0(x.t)}</td></tr>`; }).join('')}
      </tbody></table></div>
      <p class="small muted" style="margin:6px 0 0">Balanço positivo = faltou mercadoria (perda); negativo = sobrou. % da venda usa a venda lançada no período.</p></div>
    <div class="card" style="margin-top:12px"><div class="row" style="gap:8px;flex-wrap:wrap"><h2 style="margin:0">🧩 Produtos problema — venda × perda × balanço</h2><div class="sp"></div>
      <select id="plSet" style="border:1px solid var(--line);border-radius:8px;padding:5px 6px"><option value="">Todos os setores</option>${ids.map(id=>`<option value="${id}" ${S.plSet===id?'selected':''}>${esc(nomeSetor(id))}</option>`).join('')}</select>
      <input id="plBusca" placeholder="Buscar produto…" style="border:1px solid var(--line);border-radius:8px;padding:6px 8px;min-width:150px"></div>
      <p class="small muted" style="margin:6px 0 8px">Soma o que o produto perdeu (relatório de perdas) com o que faltou no balanço ${temAcertos?'(resumo de acertos)':'(balanços lançados no período)'}, e compara com o que ele vendeu${V.length?'':' — importe o relatório de vendas desse período para ver a venda'}.${nSem?` ${nSem} produto(s) com perda não tiveram venda no período.`:''}</p>
      <div class="tw" style="max-height:65vh"><table><thead><tr><th>#</th><th>Produto</th><th class="m-hide">Setor</th><th class="n m-hide">Venda</th><th class="n m-hide">Perda</th><th class="n m-hide">Falta balanço</th><th class="n">Total</th><th class="n">% venda</th></tr></thead><tbody id="plBody"></tbody></table></div></div>`;
  const desenha=()=>{ const t=normN2($('#plBusca').value), s=$('#plSet').value; S.plSet=s;
    const ls=lista.filter(x=>(!s||x.setor===s) && (!t||normN2(x.d).includes(t)||x.c===t)).slice(0,150);
    $('#plBody').innerHTML = ls.map((x,i)=>{ const pc=x.venda? x.total/x.venda : null; return `<tr><td class="muted">${i+1}</td><td><span class="muted small">${esc(x.c)}</span> ${esc(cap1(x.d))}<div class="small muted m-only">${esc(nomeSetor(x.setor))} · venda ${x.venda?brl0(x.venda):'—'} · perda ${x.perda?brl0(x.perda):'—'} · falta ${x.falta?brl0(x.falta):'—'}</div></td><td class="small m-hide">${esc(nomeSetor(x.setor))}</td><td class="n m-hide">${x.venda?brl0(x.venda):'<span class="muted">sem venda</span>'}</td><td class="n m-hide">${x.perda?brl0(x.perda):'—'}</td><td class="n m-hide">${x.falta?brl0(x.falta):'—'}</td><td class="n"><b>${brl0(x.total)}</b></td><td class="n" style="${pc!=null&&pc>=0.1?'color:var(--bad);font-weight:600':''}">${pc==null?'—':pctBR(pc,1)}</td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">Nada encontrado.</td></tr>'; };
  $('#plBusca').oninput=desenha; $('#plSet').onchange=desenha; desenha();
  cardTendencia(box, null);
  $('#plSel').onchange=e=>{ S.plPer=e.target.value; renderPerdasLoja(app,doc); };
}

/* ---------- Tela "Trocas" (menu de cima, só gerente): relatório geral de trocas ---------- */
async function renderTrocasLoja(app, doc){
  app.innerHTML=`<div class="row" style="align-items:flex-end;margin-bottom:12px;gap:8px;flex-wrap:wrap"><div><h1>Trocas da loja</h1><p class="sub" style="margin:0">Produtos transferidos para troca — por setor e por produto. Ficam fora da perda e do teto.</p></div><div class="sp"></div><span id="tlPer"></span>${botaoImportarVarios('bVT')}</div><div id="tlBox"><div class="empty"><span class="spin"></span> Carregando…</div></div>`;
  ligarImportarVarios('bVT');
  const box=$('#tlBox'); const vivo=()=>S.view==='trocas' && box.isConnected;
  let per=[]; try{ per=await q(S.sb.from('analise_trocas').select('periodo_inicio,periodo_fim').order('periodo_fim',{ascending:false}).limit(500)); }catch(e){ box.innerHTML=`<div class="note err">Erro: ${esc(e.message)}</div>`; return; }
  if(!vivo()) return;
  const periodos=[...new Map(per.map(x=>[x.periodo_inicio+'|'+x.periodo_fim,x])).values()].sort((a,b)=>b.periodo_fim.localeCompare(a.periodo_fim)||a.periodo_inicio.localeCompare(b.periodo_inicio));
  if(!periodos.length){ box.innerHTML='<div class="card empty"><h2>Nenhum relatório de trocas ainda</h2><p>Importe o “Resumo de produtos transferidos” do sistema pelo botão 📥 Importar relatórios.</p></div>'; return; }
  const atual=todayIso().slice(0,4);
  if(!S.tlPer || !periodos.some(p=>p.periodo_inicio+'|'+p.periodo_fim===S.tlPer)){ const p=periodos.find(p=>p.periodo_fim.startsWith(atual))||periodos[0]; S.tlPer=p.periodo_inicio+'|'+p.periodo_fim; }
  $('#tlPer').innerHTML=`<label class="f" style="margin:0">Período<select id="tlSel">${periodos.map(p=>{ const k=p.periodo_inicio+'|'+p.periodo_fim; return `<option value="${k}" ${k===S.tlPer?'selected':''}>${fD(p.periodo_inicio)} a ${fD(p.periodo_fim)}</option>`; }).join('')}</select></label>`;
  $('#tlSel').onchange=e=>{ S.tlPer=e.target.value; renderTrocasLoja(app,doc); };
  const [ini,fim]=S.tlPer.split('|');
  let T=[],TL=[],L=[];
  try{ [T,TL,L]=await Promise.all([ q(S.sb.from('analise_trocas').select('setor_id,custo,venda,dados').eq('periodo_inicio',ini).eq('periodo_fim',fim)), q(S.sb.from('analise_trocas').select('setor_id,custo,dados').eq('periodo_inicio',addAnos(ini,-1)).eq('periodo_fim',addAnos(fim,-1))), todasLinhas(()=>S.sb.from('lancamentos').select('setor_id,venda').gte('data',ini).lte('data',fim)) ]); }
  catch(e){ box.innerHTML=`<div class="note err">Erro: ${esc(e.message)}</div>`; return; }
  if(!vivo()) return;
  const vs={}; let vLoja=0; for(const x of L){ vs[x.setor_id]=(vs[x.setor_id]||0)+(+x.venda||0); vLoja+=(+x.venda||0); }
  const tot=T.reduce((a,x)=>a+(+x.custo||0),0), totV=T.reduce((a,x)=>a+(+x.venda||0),0), totL=TL.reduce((a,x)=>a+(+x.custo||0),0);
  const mL=Object.fromEntries(TL.map(x=>[x.setor_id,+x.custo]));
  const lyP=new Map(); for(const x of TL) for(const i of x.dados.itens) lyP.set(String(i.c),i);
  const set=T.map(x=>({id:x.setor_id, c:+x.custo, n:x.dados.itens.length, v:vs[x.setor_id]||0, l:mL[x.setor_id]??null})).sort((a,b)=>b.c-a.c);
  const prods=T.flatMap(x=>x.dados.itens.map(i=>({...i, setor:x.setor_id}))).filter(i=>i.tc>0).sort((a,b)=>b.tc-a.tc);
  const varP=(a,b)=>{ if(b==null) return ''; if(!b) return a?'<span class="an-novo">nova</span>':''; const v=a/b-1; return `<span style="color:${v>0?'var(--bad)':'var(--good)'};font-weight:600">${v>0?'▲':'▼'} ${pctBR(Math.abs(v),0)}</span>`; };
  const maior=set[0], menor=set[set.length-1];
  let ac=0,n80=0; for(const p of prods){ ac+=p.tc; n80++; if(ac>=tot*0.8) break; }
  const subiu=TL.length? prods.map(p=>({p,d:p.tc-((lyP.get(String(p.c))||{}).tc||0)})).filter(x=>x.d>0).sort((a,b)=>b.d-a.d).slice(0,5):[];
  box.innerHTML=`
    <div class="grid kpis">
      <div class="kpi hero"><div class="l">Total de trocas (custo)</div><div class="v">${brl0(tot)}</div><div class="d">${prods.length} produtos · a preço de venda ${brl0(totV)}</div></div>
      <div class="kpi"><div class="l">Sobre a venda da loja</div><div class="v">${vLoja?pctBR(tot/vLoja,2):'—'}</div><div class="d">venda lançada no período ${brl0(vLoja)}</div></div>
      <div class="kpi"><div class="l">Ano passado, mesmo período</div><div class="v">${TL.length?brl0(totL):'—'}</div><div class="d">${TL.length?varP(tot,totL)+' em relação ao ano passado':'importe o relatório de trocas de '+fD(addAnos(ini,-1))+' a '+fD(addAnos(fim,-1))}</div></div>
      <div class="kpi"><div class="l">Maior troca por setor</div><div class="v" style="font-size:20px">${esc(nomeSetor(maior.id))}</div><div class="d">${brl0(maior.c)} · ${pctBR(maior.c/tot,0)} das trocas</div></div>
      <div class="kpi"><div class="l">Menor troca por setor</div><div class="v" style="font-size:20px">${esc(nomeSetor(menor.id))}</div><div class="d">${brl0(menor.c)} · ${pctBR(menor.c/tot,1)} das trocas</div></div>
      <div class="kpi"><div class="l">Produto com maior troca</div><div class="v" style="font-size:16px">${esc(cap1(prods[0]?.d||'—'))}</div><div class="d">${prods[0]?brl(prods[0].tc)+' · '+esc(nomeSetor(prods[0].setor)):''}</div></div>
    </div>
    <div class="card" style="margin-top:12px"><h2>👀 Onde olhar primeiro</h2><ul class="small" style="margin:6px 0 0 18px;line-height:1.6">
      <li><b>${n80} produto(s)</b> fazem 80% das trocas da loja (de ${prods.length}).</li>
      <li><b>${esc(nomeSetor(maior.id))}</b> responde por ${pctBR(maior.c/tot,0)} das trocas${maior.v?` (${pctBR(maior.c/maior.v,2)} da venda do setor)`:''}.</li>
      <li>Menor troca: <b>${esc(cap1(prods[prods.length-1]?.d||'—'))}</b> (${brl(prods[prods.length-1]?.tc)}, ${esc(nomeSetor(prods[prods.length-1]?.setor))}).</li>
      ${subiu.length?`<li>Mais subiram contra o ano passado: ${subiu.map(x=>`<b>${esc(cap1(x.p.d))}</b> +${brl0(x.d)}`).join(' · ')}</li>`:''}
    </ul></div>
    <div class="grid two" style="gap:12px;margin-top:12px">
      <div class="card"><h2>Ranking dos setores</h2>${set.map((x,i)=>{ const ps=prods.filter(p=>p.setor===x.id); return `<div style="border-bottom:1px solid var(--line)"><div style="padding:6px 0;cursor:pointer" data-trset="${x.id}"><div style="display:flex;gap:8px;align-items:baseline"><span class="tl-seta muted" style="width:14px">▸</span><span class="muted small" style="width:20px">${i+1}º</span><b style="flex:1">${esc(nomeSetor(x.id))}</b><b>${brl0(x.c)}</b></div><div class="small muted" style="margin-left:42px">${pctBR(x.c/tot,0)} das trocas · ${x.v?pctBR(x.c/x.v,2)+' da venda do setor':'sem venda lançada'} · ${x.n} produtos${x.l!=null?' · ano passado '+brl0(x.l)+' '+varP(x.c,x.l):''}</div><div style="margin-left:42px">${barraPct(x.c/maior.c)}</div></div>
        <div class="tl-det hide" data-det="${x.id}" style="margin:0 0 10px 42px;padding:8px 10px;background:#faf8f4;border-radius:10px">${ps.map((p,k)=>`<div style="padding:5px 0;border-bottom:1px dashed var(--line)"><div style="display:flex;gap:8px;align-items:baseline"><span class="muted small" style="width:22px">${k+1}</span><span style="flex:1">${esc(cap1(p.d))}</span><b>${brl(p.tc)}</b></div><div class="small muted" style="margin-left:30px">${qtBR(p.q)} un/kg · ${brl(p.cu)}/un · ${pctBR(p.tc/x.c,1)} do setor${(()=>{ const o=lyP.get(String(p.c)); return TL.length?` · ano passado ${o?brl(o.tc):'—'}`:''; })()}</div></div>`).join('')}</div></div>`; }).join('')}<p class="small muted" style="margin:6px 0 0">Toque no setor para abrir os produtos dele aqui mesmo.</p></div>
      <div class="card"><h2>10 produtos com maior troca</h2>${prods.slice(0,10).map((p,i)=>`<div style="padding:6px 0;border-bottom:1px solid var(--line)"><div style="display:flex;gap:8px;align-items:baseline"><span class="muted small" style="width:20px">${i+1}</span><span style="flex:1">${esc(cap1(p.d))}</span><b>${brl0(p.tc)}</b></div><div class="small muted" style="margin-left:28px">${esc(nomeSetor(p.setor))} · ${qtBR(p.q)} un/kg · ${brl(p.cu)}/un</div></div>`).join('')}</div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px"><h2 style="margin:0">Todos os produtos</h2><div class="sp"></div>
        <select id="tlSet" style="border:1px solid var(--line);border-radius:8px;padding:5px 6px"><option value="">Todos os setores</option>${set.map(x=>`<option value="${x.id}">${esc(nomeSetor(x.id))}</option>`).join('')}</select>
        <input id="tlBusca" placeholder="Buscar produto…" style="border:1px solid var(--line);border-radius:8px;padding:6px 8px;min-width:150px"></div>
      <div class="tw" style="max-height:60vh"><table><thead><tr><th>Produto</th><th class="m-hide">Setor</th><th class="n m-hide">Qtd</th><th class="n m-hide">Custo un.</th><th class="n">Custo</th>${TL.length?'<th class="n m-hide">Ano pass.</th>':''}<th class="n">Part.</th></tr></thead><tbody id="tlBody"></tbody></table></div></div>`;
  const desenha=()=>{ const t=normN2($('#tlBusca').value), st=$('#tlSet').value;
    $('#tlBody').innerHTML=prods.map((p,k)=>({p,k})).filter(({p})=>(!st||p.setor===st)&&(!t||normN2(p.d).includes(t)||String(p.c)===t)).slice(0,500).map(({p,k})=>{ const o=lyP.get(String(p.c)); return `<tr><td><span class="muted small">${k+1}º · ${esc(p.c)}</span> ${esc(cap1(p.d))}<div class="small muted m-only">${esc(nomeSetor(p.setor))} · ${qtBR(p.q)} un/kg · ${brl(p.cu)}/un</div></td><td class="small m-hide">${esc(nomeSetor(p.setor))}</td><td class="n m-hide">${qtBR(p.q)}</td><td class="n m-hide">${brl(p.cu)}</td><td class="n"><b>${brl(p.tc)}</b></td>${TL.length?`<td class="n m-hide">${o?brl(o.tc):'—'}</td>`:''}<td class="n" style="min-width:64px">${pctBR(p.tc/tot,1)}${barraPct(p.tc/prods[0].tc)}</td></tr>`; }).join('')||'<tr><td colspan="7" class="muted">Nada encontrado.</td></tr>'; };
  $('#tlBusca').oninput=desenha; $('#tlSet').onchange=desenha; desenha();
  box.querySelectorAll('[data-trset]').forEach(d=>d.onclick=()=>{ const det=box.querySelector(`[data-det="${d.dataset.trset}"]`); const ab=det.classList.toggle('hide'); d.querySelector('.tl-seta').textContent=ab?'▸':'▾'; });
}

/* ---------- Conferência automática: lançado no site × relatórios do sistema ---------- */
async function conferencia(mes){
  mes=mes||S.mes; const ini=mes+'-01', fim=fimDoMes(mes); const out={periodoV:null, periodoP:null, linhas:[]};
  const ult=async t=>{ const r=await q(S.sb.from(t).select('periodo_inicio,periodo_fim').gte('periodo_fim',ini).lte('periodo_fim',fim).eq('periodo_inicio',ini).order('periodo_fim',{ascending:false}).limit(1)); return r[0]||null; };
  const [pv,pp]=await Promise.all([ult('analise_vendas'), ult('analise_perdas')]);
  const lanc = async (a,b)=> todasLinhas(()=>S.sb.from('lancamentos').select('setor_id,venda,perda').gte('data',a).lte('data',b));
  if(pv){ out.periodoV=pv; const [R,L]=await Promise.all([ q(S.sb.from('analise_vendas').select('setor_id,venda').eq('periodo_inicio',pv.periodo_inicio).eq('periodo_fim',pv.periodo_fim)), lanc(pv.periodo_inicio,pv.periodo_fim) ]);
    const l={}; for(const x of L) l[x.setor_id]=(l[x.setor_id]||0)+(+x.venda||0);
    for(const r of R){ const d=(l[r.setor_id]||0)-(+r.venda||0); out.linhas.push({tipo:'venda', setor:r.setor_id, lancado:l[r.setor_id]||0, relatorio:+r.venda||0, dif:d}); } }
  if(pp){ out.periodoP=pp; const [R,L]=await Promise.all([ q(S.sb.from('analise_perdas').select('setor_id,valor').eq('periodo_inicio',pp.periodo_inicio).eq('periodo_fim',pp.periodo_fim)), lanc(pp.periodo_inicio,pp.periodo_fim) ]);
    const l={}; for(const x of L) l[x.setor_id]=(l[x.setor_id]||0)+(+x.perda||0);
    for(const r of R){ const d=(l[r.setor_id]||0)-(+r.valor||0); out.linhas.push({tipo:'perda', setor:r.setor_id, lancado:l[r.setor_id]||0, relatorio:+r.valor||0, dif:d}); } }
  out.erros=out.linhas.filter(x=>Math.abs(x.dif)>=1);
  // venda com diferença: procura o dia. Venda do dia pelo relatório = acumulado até o dia − acumulado até o dia anterior
  out.dias=[]; out.recomendar=[]; out.semRel=[];
  if(pv && out.erros.some(x=>x.tipo==='venda')){ try{
    const A=await q(S.sb.from('analise_vendas').select('setor_id,periodo_fim,venda,emit:dados->>emitido').eq('periodo_inicio',pv.periodo_inicio).lte('periodo_fim',pv.periodo_fim));
    const acc={}, emit={}; for(const x of A){ (acc[x.periodo_fim]=acc[x.periodo_fim]||{})[x.setor_id]=+x.venda||0; if(x.emit && (!emit[x.periodo_fim]||x.emit<emit[x.periodo_fim])) emit[x.periodo_fim]=x.emit; }
    const L=await todasLinhas(()=>S.sb.from('lancamentos').select('data,setor_id,venda').gte('data',pv.periodo_inicio).lte('data',pv.periodo_fim));
    const ld={}; for(const x of L) (ld[x.data]=ld[x.data]||{})[x.setor_id]=(+x.venda||0);
    const antes=k=>isoOf(new Date(new Date(k+'T12:00:00').getTime()-864e5));
    for(const k of diasDoMes(mes).filter(k=>k>=pv.periodo_inicio && k<=pv.periodo_fim)){
      const a=acc[k], b= k===pv.periodo_inicio ? {} : acc[antes(k)];
      if(!a || !b){ out.semRel.push(k); continue; }
      const sets=new Set([...Object.keys(a),...Object.keys(ld[k]||{})]); const difs=[];
      for(const sid of sets){ const rel=(a[sid]||0)-(b[sid]||0), lan=(ld[k]||{})[sid]||0, d=lan-rel; if(Math.abs(d)>=1) difs.push({setor:sid, dif:d}); }
      if(difs.length) out.dias.push({dia:k, dif:difs.reduce((x,y)=>x+y.dif,0), setores:difs.sort((x,y)=>Math.abs(y.dif)-Math.abs(x.dif)), emit:emit[k], emitAnt:emit[antes(k)]});
    }
    const R=new Set(); for(const d of out.dias){ R.add(d.dia); const a0=antes(d.dia); if(d.dia!==pv.periodo_inicio && d.emitAnt && d.emit && d.emitAnt<d.emit) R.add(a0); }
    if(!out.dias.length) out.semRel.forEach(k=>R.add(k));
    out.recomendar=[...R].sort();
  }catch(_){ } }
  return out;
}
function htmlConferencia(c){
  if(!c.periodoV && !c.periodoP) return '<p class="small muted">Ainda não há relatório do mês para conferir.</p>';
  const tab=(tipo,per)=>{ const ls=c.linhas.filter(x=>x.tipo===tipo); if(!ls.length) return ''; const err=ls.filter(x=>Math.abs(x.dif)>=1);
    return `<h3 style="margin:10px 0 4px">${tipo==='venda'?'💰 Venda':'🗑️ Perda'} · ${fD(per.periodo_inicio)} a ${fD(per.periodo_fim)} ${err.length?`<span class="small" style="color:var(--bad)">· ${err.length} diferença(s)</span>`:'<span class="small" style="color:var(--good)">· ✔ tudo bate</span>'}</h3>
    <div class="tw"><table><thead><tr><th>Setor</th><th class="n m-hide">Lançado no site</th><th class="n m-hide">Relatório</th><th class="n">Diferença</th></tr></thead><tbody>
    ${ls.sort((a,b)=>Math.abs(b.dif)-Math.abs(a.dif)).map(x=>`<tr><td><b>${esc(nomeSetor(x.setor))}</b><div class="small muted m-only">site ${brl(x.lancado)} · relatório ${brl(x.relatorio)}</div></td><td class="n m-hide">${brl(x.lancado)}</td><td class="n m-hide">${brl(x.relatorio)}</td><td class="n" style="color:${Math.abs(x.dif)<1?'var(--good)':'var(--bad)'};font-weight:600">${Math.abs(x.dif)<1?'✔':(x.dif>0?'+':'')+brl(x.dif)}</td></tr>`).join('')}</tbody></table></div>`; };
  const dm=k=>fD(k).slice(0,5);
  const fazer = c.recomendar&&c.recomendar.length ? `<div class="note" style="background:#fff6dc;border-color:#ecd28a;margin:6px 0 4px">
      <b>👉 O que fazer:</b> tire no sistema o relatório de vendas <b>só do dia</b> de <b>${c.recomendar.map(dm).join(', ')}</b> e importe pelo <b>📥 Importar relatórios</b> (pode selecionar todos de uma vez). Depois toque em <b>Conferir</b> de novo.
      ${c.dias&&c.dias.length?`<div class="small" style="margin-top:6px">${c.dias.map(d=>`<div>• <b>${dm(d.dia)}</b>: lançado ${d.dif>0?'+':''}${brl0(d.dif)} vs. relatório — ${d.setores.slice(0,3).map(x=>`${esc(nomeSetor(x.setor))} ${x.dif>0?'+':''}${brl0(x.dif)}`).join(' · ')}${d.emit&&d.emitAnt&&d.emit!==d.emitAnt?` <span class="muted">(relatórios tirados em ${fD(d.emitAnt).slice(0,5)} e ${fD(d.emit).slice(0,5)}: o sistema pode ter mudado entre um e outro)</span>`:''}</div>`).join('')}</div>`:''}
      ${c.semRel&&c.semRel.length&&!(c.dias&&c.dias.length)?`<div class="small muted" style="margin-top:4px">Esses dias não têm relatório do dia guardado, então o site não consegue saber qual está diferente.</div>`:''}
    </div>` : '';
  return fazer+tab('venda',c.periodoV||{})+tab('perda',c.periodoP||{})+`<p class="small muted" style="margin-top:8px">Diferença = lançado no site − relatório do sistema, no mesmo período. Diferença de venda costuma ser dia lançado pela divisão antiga ou venda de hoje incluída; de perda, balanço lançado que o relatório de perdas não traz.</p>`;
}
async function mostrarConferencia(silencioso){
  let c; try{ c=await conferencia(); }catch(e){ if(!silencioso) toast('Não consegui conferir: '+e.message,5000); return; }
  if(silencioso && !c.erros.length){ toast('✔ Conferido: o lançado no site bate com os relatórios',4000); return; }
  const m=modal(`<h2>🔎 Conferência: site × relatórios</h2>${htmlConferencia(c)}<div class="row" style="margin-top:12px"><div class="sp"></div><button class="btn p" id="mN">Ok</button></div>`);
  $('#mN',m).onclick=closeModal;
}
