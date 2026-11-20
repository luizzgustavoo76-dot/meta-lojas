/* ===================== Busca de produto (só o gerente) =====================
   Bolinha 🔍 no canto: produto (nome ou código) + dia/período → quantidade, venda e preço médio.
   A venda de um período sai dos relatórios acumulados guardados na Análise de vendas:
   01..fim direto, ou acumulado(01..fim) − acumulado(01..dia anterior ao início). */

function botaoBusca(){
  const old=$('#fabBusca'); if(!S.gerente){ if(old) old.remove(); return; } if(old) return;
  const b=document.createElement('button'); b.id='fabBusca'; b.className='fab-busca'; b.title='Buscar venda de um produto'; b.setAttribute('aria-label','Buscar venda de um produto'); b.textContent='🔍';
  b.onclick=()=>abrirBusca(); document.body.appendChild(b);
}

const semAcento=t=>String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const diaAntes=k=>isoOf(new Date(new Date(k+'T12:00:00').getTime()-864e5));

function abrirBusca(){
  const ult=(curDoc() && (lastSetorDay(curDoc())||lastDataDay(curDoc()))) || diaAntes(todayIso());
  const st=S._busca||{termo:'', de:ult, ate:ult};
  const m=modal(`<div class="row" style="gap:8px"><h2 style="margin:0">🔍 Buscar venda de produto</h2><div class="sp"></div><button class="btn" id="bsX" aria-label="Fechar">✕</button></div>
    <div class="bs-form">
      <label class="f bs-termo">Produto (nome ou código)<input id="bsTermo" type="search" autocomplete="off" placeholder="ex.: pão francês" value="${esc(st.termo)}"></label>
      <label class="f">De<input id="bsDe" type="date" value="${st.de}"></label>
      <label class="f">Até<input id="bsAte" type="date" value="${st.ate}"></label>
    </div>
    <div class="row bs-atalhos" style="gap:6px;flex-wrap:wrap;margin:8px 0">
      <button class="btn" data-at="dia">Último dia</button><button class="btn" data-at="mes">Mês até agora</button><button class="btn" data-at="ly">Mesmo período ano passado</button>
      <div class="sp"></div><button class="btn p" id="bsGo">Buscar</button></div>
    <div id="bsRes" class="small muted">Digite o nome ou o código e toque em Buscar. Ex.: <b>pão francês</b>, <b>coca 2l</b>, <b>3972</b>.</div>`);
  m.classList.add('modal-busca');
  const ti=$('#bsTermo',m), de=$('#bsDe',m), ate=$('#bsAte',m);
  $('#bsX',m).onclick=closeModal;
  m.querySelectorAll('[data-at]').forEach(b=>b.onclick=()=>{ const a=b.dataset.at;
    if(a==='dia'){ de.value=ult; ate.value=ult; }
    else if(a==='mes'){ de.value=ult.slice(0,8)+'01'; ate.value=ult; }
    else if(a==='ly'){ de.value=addAnos(de.value||ult,-1); ate.value=addAnos(ate.value||ult,-1); }
    if(ti.value.trim()) buscar(); });
  const buscar=()=>executarBusca(m, ti.value, de.value, ate.value);
  $('#bsGo',m).onclick=buscar; ti.onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); buscar(); } };
  setTimeout(()=>{ if(!ehCelular()) ti.focus(); },50);
  if(st.termo) buscar();
}

async function executarBusca(m, termo, de, ate){
  const res=$('#bsRes',m); termo=semAcento(termo);
  if(termo.length<2) { res.innerHTML='<span style="color:var(--bad)">Digite pelo menos 2 letras ou o código.</span>'; return; }
  if(!de||!ate) { res.innerHTML='<span style="color:var(--bad)">Escolha as datas.</span>'; return; }
  if(de>ate) [de,ate]=[ate,de];
  S._busca={termo, de, ate};
  res.innerHTML='<span class="spin"></span> Buscando…';
  let linhas, periodos;
  try{
    [linhas, periodos]=await Promise.all([
      q(S.sb.rpc('buscar_produto',{termo})),
      S._bsPer || q(S.sb.from('analise_vendas').select('setor_id,periodo_inicio,periodo_fim'))
    ]);
    S._bsPer=periodos; setTimeout(()=>{ S._bsPer=null; }, 5*60*1000);
  }catch(e){ res.innerHTML=`<span style="color:var(--bad)">Não foi possível buscar: ${esc(e.message||e)}</span>`; return; }
  if(!m.isConnected) return;
  if(!linhas.length){ res.innerHTML=`Nenhum produto encontrado com <b>${esc(termo)}</b>. Tente uma palavra só (ex.: <b>FRANCES</b>) ou o código.`; return; }

  // produtos encontrados (código → nome, setor, valores por período)
  const prods=new Map();
  for(const l of linhas){ const k=String(l.c); let p=prods.get(k); if(!p){ p={c:k, d:l.d, setores:new Set(), per:new Map()}; prods.set(k,p); }
    p.setores.add(l.setor_id); const pk=`${l.setor_id}|${l.periodo_inicio}|${l.periodo_fim}`; p.per.set(pk,{q:+l.q||0, v:+l.v||0}); if(l.periodo_fim>=(p.ultFim||'')){ p.ultFim=l.periodo_fim; p.d=l.d; } }
  const temPer=(sid,i,f)=>periodos.some(x=>x.setor_id===sid && x.periodo_inicio===i && x.periodo_fim===f);
  const val=(p,sid,i,f)=>p.per.get(`${sid}|${i}|${f}`)||{q:0,v:0};

  // venda do produto num período: direto, ou diferença entre dois acumulados com o mesmo início
  function calcular(p, a, b){
    let tot={q:0,v:0}, ok=false, como='';
    for(const sid of p.setores){
      if(temPer(sid,a,b)){ const x=val(p,sid,a,b); tot.q+=x.q; tot.v+=x.v; ok=true; como='relatório do período'; continue; }
      const inis=[...new Set(periodos.filter(x=>x.setor_id===sid && x.periodo_fim===b && x.periodo_inicio<a).map(x=>x.periodo_inicio))];
      const ini=inis.find(i=>temPer(sid,i,diaAntes(a)));
      if(ini){ const A=val(p,sid,ini,b), B=val(p,sid,ini,diaAntes(a)); tot.q+=A.q-B.q; tot.v+=A.v-B.v; ok=true; como=`acumulado até ${fD(b)} − acumulado até ${fD(diaAntes(a))}`; }
    }
    return ok? {q:round2(tot.q), v:round2(tot.v), como} : null;
  }

  const lista=[...prods.values()].map(p=>({p, r:calcular(p,de,ate), ly:calcular(p,addAnos(de,-1),addAnos(ate,-1))}))
    .sort((x,y)=>(y.r?.v||0)-(x.r?.v||0) || x.p.d.localeCompare(y.p.d));
  const achou=lista.filter(x=>x.r), falta=lista.filter(x=>!x.r);
  const perTxt=de===ate?`no dia ${fDateL(de)}`:`de ${fD(de)} a ${fD(ate)}`;
  const unid=d=>/\bKG\b/.test(d)?'kg':'un';
  const qtd=(q,d)=>`${q.toLocaleString('pt-BR',{maximumFractionDigits:unid(d)==='kg'?2:0})} ${unid(d)}`;
  const preco=(r,d)=>r.q? `${brl(r.v/r.q)}/${unid(d)}` : '—';
  const cmp=(x)=>{ if(!x.ly||!x.ly.v) return ''; const vv=x.r.v/x.ly.v-1, vq=x.ly.q? x.r.q/x.ly.q-1 : null;
    return `<div class="bs-ly">Ano passado (${de===ate?fD(addAnos(de,-1)):fD(addAnos(de,-1))+' a '+fD(addAnos(ate,-1))}): ${brl(x.ly.v)} · ${qtd(x.ly.q,x.p.d)} → <b style="color:${vv>=0?'var(--good)':'var(--bad)'}">${vv>=0?'+':''}${pct(vv,1)}</b> em reais${vq!=null?`, <b style="color:${vq>=0?'var(--good)':'var(--bad)'}">${vq>=0?'+':''}${pct(vq,1)}</b> em quantidade`:''}</div>`; };

  const cards=achou.slice(0,30).map(x=>`<div class="bs-item">
      <div class="bs-top"><div><b>${esc(x.p.d)}</b><div class="muted">cód. ${esc(x.p.c)} · ${[...x.p.setores].map(nomeSetor).map(esc).join(', ')}</div></div>
        <div class="bs-v">${brl(x.r.v)}</div></div>
      <div class="bs-nums"><span>Quantidade <b>${qtd(x.r.q,x.p.d)}</b></span><span>Preço médio <b>${preco(x.r,x.p.d)}</b></span></div>${cmp(x)}
    </div>`).join('');

  // períodos que existem, para orientar quando a data pedida não dá para calcular
  const disp=[...new Set(periodos.map(x=>`${x.periodo_inicio}|${x.periodo_fim}`))].sort().map(k=>{ const [i,f]=k.split('|'); return i===f?fD(i):`${fD(i)} a ${fD(f)}`; });
  const avisoFalta = !achou.length
    ? `<div class="note small" style="margin-top:6px">Encontrei ${lista.length} produto(s) com <b>${esc(termo)}</b>, mas não há relatório de venda por produto que cubra <b>${perTxt}</b>.<br>Para esse dia, importe o relatório de vendas dele pelo 📥 Importar relatórios (só o dia, ou os acumulados até o dia e até o dia anterior).<br><span class="muted">Períodos que o site tem hoje: ${disp.join(' · ')}</span></div>`
    : (falta.length? `<p class="muted" style="margin:6px 0 0">${falta.length} outro(s) produto(s) com esse nome não têm relatório nesse período.</p>`:'');
  const total = achou.length>1 ? `<div class="bs-tot">Total dos ${achou.length} produtos: <b>${brl(achou.reduce((a,x)=>a+x.r.v,0))}</b></div>` : '';
  res.className='small';
  res.innerHTML = (achou.length?`<div class="muted" style="margin-bottom:6px">Venda ${perTxt}${achou[0].r.como.includes('−')?` <span title="${esc(achou[0].r.como)}">(pela diferença entre os acumulados)</span>`:''}</div>${cards}${achou.length>30?`<p class="muted">Mostrando 30 de ${achou.length}. Refine a busca.</p>`:''}${total}`:'') + avisoFalta;
}
