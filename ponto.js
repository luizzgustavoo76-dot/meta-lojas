/* ===================== Conferência de ponto (AFD do relógio) =====================
   O gerente abre o AFD (.txt) gerado no Gerenciador Inner Rep. O arquivo é lido aqui
   no navegador: nada vai para o banco. Fica só uma cópia resumida neste aparelho
   (últimos 35 dias) para não precisar abrir de novo a cada vez que entrar na aba. */

const PT = { jornada:440, almMax:120, almMin:110, cont:360, maxExtra:120, aviso:30, tol:10, fech:19*60+30, fechDom:12*60, jornAprendiz:240 };
const PT_APRENDIZES = ['KLEBERSON GOMES MOREIRA','JOAO GABRIEL FOGO MOREIRA','VINICIUS GABRIEL TEIXEIRA SANTOS'];
const PT_KEY = 'metas_afd_v1';

const ptHm = x => `${String(Math.floor(x/60)).padStart(2,'0')}:${String(x%60).padStart(2,'0')}`;
const ptH  = x => { const s=x<0?'−':''; x=Math.abs(x); return `${s}${Math.floor(x/60)}h${String(x%60).padStart(2,'0')}`; };
const ptNorm = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const ptNome = s => String(s||'').toLowerCase().split(' ').map(w=>/^(da|de|do|das|dos|e)$/.test(w)? w : w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
const ptAprendiz = n => { const k=ptNorm(n); return PT_APRENDIZES.some(a=>k===a || k.startsWith(a)); };
const ptIso = d => d.toISOString().slice(0,10);
const ptAddDia = (iso,k) => { const d=new Date(iso+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+k); return ptIso(d); };
function ptAgoraBR(){ const d=new Date(Date.now()-3*3600e3); return { dia:ptIso(d), min:d.getUTCHours()*60+d.getUTCMinutes() }; }

/* lê o AFD (Portaria 1510 ou 671) → { empresa, gerado:{dia,min}, nomes:{pis:nome}, bat:{pis:{dia:[min]}} } */
function lerAFD(txt){
  const nomes={}, bat={}; let empresa='', gerado=null, maxDia='';
  const regs=[];
  for(const l0 of txt.split(/\r?\n/)){
    const l=l0; if(l.length<10) continue;
    const t=l[9], novo = l.length>14 && l[14]==='-' && l.slice(10,12)==='20';
    if(t==='1' && !empresa){
      empresa=l.slice(37,187).trim();
      if(!novo){ const g=l.slice(220,232); if(/^\d{12}$/.test(g)) gerado={ dia:`${g.slice(4,8)}-${g.slice(2,4)}-${g.slice(0,2)}`, min:+g.slice(8,10)*60 + +g.slice(10,12) }; }
    } else if(t==='5'){
      if(novo) nomes[l.slice(35,47)]=l.slice(47,99).trim(); else nomes[l.slice(23,35)]=l.slice(35,87).trim();
    } else if(t==='3'){
      let dia, hr, pis;
      if(novo){ dia=`${l.slice(10,14)}-${l.slice(15,17)}-${l.slice(18,20)}`; hr=+l.slice(21,23)*60 + +l.slice(24,26); pis=l.slice(34,46); }
      else { dia=`${l.slice(14,18)}-${l.slice(12,14)}-${l.slice(10,12)}`; hr=+l.slice(18,20)*60 + +l.slice(20,22); pis=l.slice(22,34); }
      if(!/^\d{4}-\d\d-\d\d$/.test(dia) || !(hr>=0 && hr<1440)) continue;
      regs.push([pis,dia,hr]); if(dia>maxDia) maxDia=dia;
    }
  }
  if(!regs.length) return null;
  const desde=ptAddDia(maxDia,-62);
  for(const [pis,dia,hr] of regs){ if(dia<desde) continue; ((bat[pis]=bat[pis]||{})[dia]=bat[pis][dia]||[]).push(hr); }
  const usados={}; for(const p in bat) usados[p]=nomes[p]||`PIS ${p}`;
  return { empresa, gerado, nomes:usados, bat, maxDia };
}

/* ---------- banco: o ponto fica salvo (só o gerente vê) ---------- */
async function ptTodas(mk){ const out=[]; for(let i=0;;i+=1000){ const pg=await q(mk().range(i,i+999)); out.push(...(pg||[])); if(!pg||pg.length<1000) break; } return out; }

async function abrirArquivoPonto(f){
  busy('Lendo o arquivo do ponto…');
  try{
    const buf=await f.arrayBuffer(); const txt=new TextDecoder('iso-8859-1').decode(buf);
    const A=lerAFD(txt);
    if(!A){ closeModal(); toast('Esse arquivo não parece um AFD do relógio de ponto.', 6000); return false; }
    busy('Salvando as batidas…');
    const agoraIso=new Date().toISOString();
    const funcs=Object.entries(A.nomes).map(([pis,nome])=>({pis, nome, atualizado_em:agoraIso}));
    for(let i=0;i<funcs.length;i+=500) await q(S.sb.from('ponto_funcionarios').upsert(funcs.slice(i,i+500),{onConflict:'pis'}));
    const apr=funcs.filter(x=>ptAprendiz(x.nome)).map(x=>x.pis); if(apr.length) await q(S.sb.from('ponto_funcionarios').update({aprendiz:true}).in('pis',apr));
    const rows=[]; for(const pis in A.bat) for(const dia in A.bat[pis]) for(const h of new Set(A.bat[pis][dia])) rows.push({pis, dia, hora:h, origem:'afd'});
    for(let i=0;i<rows.length;i+=1000) await q(S.sb.from('ponto_batidas').upsert(rows.slice(i,i+1000),{onConflict:'pis,dia,hora,origem', ignoreDuplicates:true}));
    await q(S.sb.from('ponto_arquivos').insert({arquivo:f.name, empresa:A.empresa||null, gerado_dia:A.gerado?.dia||null, gerado_min:A.gerado?.min??null, ultimo_dia:A.maxDia, batidas:rows.length}));
    closeModal(); S._ptCache=null; S._ptDias=null; S.ptDia=null;
    toast(`Ponto salvo ✔ ${rows.length.toLocaleString('pt-BR')} batidas de ${funcs.length} pessoas`);
    if(S.view!=='ponto') location.hash='#ponto'; else render();
    return true;
  }catch(e){ closeModal(); toast('Não consegui salvar o ponto: '+(e.message||e), 7000); return false; }
}

// monta os dados do dia a partir do banco: batidas do relógio + lançadas à mão − removidas
async function carregarPonto(dia){
  const ini=ptAddDia(dia,-10);
  const [funcs, arq, bats, js] = await Promise.all([
    ptTodas(()=>S.sb.from('ponto_funcionarios').select('pis,nome,aprendiz').order('pis')),
    q(S.sb.from('ponto_arquivos').select('*').order('criado_em',{ascending:false}).limit(1)),
    ptTodas(()=>S.sb.from('ponto_batidas').select('id,pis,dia,hora,origem,motivo').gte('dia',ini).lte('dia',dia).order('id')),
    q(S.sb.from('ponto_justificativas').select('*').gte('dia',ini).lte('dia',dia)) ]);
  const A={ nomes:{}, apr:{}, bat:{}, man:{}, rem:{}, just:{}, maxDia:'' };
  for(const x of funcs){ A.nomes[x.pis]=x.nome; A.apr[x.pis]=!!x.aprendiz; }
  const k=(o,p,d)=>((o[p]=o[p]||{})[d]=o[p][d]||{});
  for(const b of bats){ if(b.origem==='remover') k(A.rem,b.pis,b.dia)[b.hora]=b; }
  for(const b of bats){ if(b.origem==='remover') continue; if(A.rem[b.pis]?.[b.dia]?.[b.hora] && b.origem==='afd') continue;
    ((A.bat[b.pis]=A.bat[b.pis]||{})[b.dia]=A.bat[b.pis][b.dia]||[]).push(b.hora);
    if(b.origem==='manual') k(A.man,b.pis,b.dia)[b.hora]=b; if(b.dia>A.maxDia) A.maxDia=b.dia; }
  for(const j of (js||[])) k(A.just,j.pis,j.dia).j=j;
  const a=arq?.[0]; if(a){ A.arquivo=a.arquivo; A.empresa=a.empresa; if(a.gerado_dia) A.gerado={dia:a.gerado_dia, min:a.gerado_min}; if(a.ultimo_dia>A.maxDia) A.maxDia=a.ultimo_dia; }
  return A;
}

/* corrigir o ponto de uma pessoa num dia: tirar batida errada, lançar batida que faltou, justificar o dia */
function corrigirPonto(pis, dia, A, depois){
  const nome=ptNome(A.nomes[pis]||pis);
  const afd=new Set(); const man=A.man[pis]?.[dia]||{}; const rem=A.rem[pis]?.[dia]||{};
  (A.bat[pis]?.[dia]||[]).forEach(h=>{ if(!man[h]) afd.add(h); });
  const todas=[...new Set([...(A.bat[pis]?.[dia]||[]), ...Object.keys(rem).map(Number)])].sort((a,b)=>a-b);
  const j=A.just[pis]?.[dia]?.j;
  const m=modal(`<h2>✏️ Corrigir ponto</h2><p class="sub" style="margin:-4px 0 10px"><b>${esc(nome)}</b> · ${fD(dia)}</p>
    <div class="pp-l">${todas.map(h=>{ const ehMan=!!man[h], ehRem=!!rem[h];
      return `<div class="pp-i"><div class="pp-p"><b style="${ehRem?'text-decoration:line-through;color:var(--muted)':''}">${ptHm(h)}</b> <span class="small muted">${ehMan?'lançada à mão'+(man[h].motivo?' · '+esc(man[h].motivo):''):ehRem?'removida'+(rem[h].motivo?' · '+esc(rem[h].motivo):''):'do relógio'}</span></div>
        <div class="pp-n">${ehRem?`<button class="btn" data-pv="${h}">desfazer</button>`:`<button class="btn" data-px="${h}">✕ tirar</button>`}</div></div>`; }).join('')||'<div class="small muted">sem batidas neste dia</div>'}</div>
    <h3 style="margin:14px 0 6px">Lançar batida que faltou</h3>
    <div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end">
      <label class="f" style="margin:0">Horário<input type="time" id="pcH"></label>
      <label class="f" style="margin:0;flex:1;min-width:180px">Motivo<select id="pcM"><option>Esqueceu de bater</option><option>Relógio com problema</option><option>Trabalho externo</option><option>Ajuste combinado</option><option>Outro</option></select></label>
      <button class="btn p" id="pcAdd">＋ Lançar</button></div>
    <h3 style="margin:14px 0 6px">Justificar o dia</h3>
    <div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end">
      <label class="f" style="margin:0"><select id="pcJ"><option value="">— sem justificativa —</option>${[['folga','Folga'],['atestado','Atestado'],['ferias','Férias'],['dispensa','Dispensa'],['falta','Falta'],['outro','Outro']].map(([v,t])=>`<option value="${v}" ${j?.tipo===v?'selected':''}>${t}</option>`).join('')}</select></label>
      <label class="f" style="margin:0;flex:1;min-width:180px"><input id="pcO" placeholder="observação (opcional)" value="${esc(j?.obs||'')}"></label>
      <button class="btn" id="pcJs">Salvar justificativa</button></div>
    <div class="note err hide" id="pcErr" style="margin-top:8px"></div>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" id="mN">Fechar</button></div>`);
  const err=t=>{ const e=$('#pcErr',m); e.textContent=t; e.classList.remove('hide'); };
  const fim=async()=>{ closeModal(); S._ptCache=null; S._ptDias=null; toast('Ponto corrigido ✔'); depois&&depois(); };
  $('#mN',m).onclick=closeModal;
  m.querySelectorAll('[data-px]').forEach(b=>b.onclick=async()=>{ const h=+b.dataset.px; try{
      if(man[h]) await q(S.sb.from('ponto_batidas').delete().eq('id',man[h].id));
      else await q(S.sb.from('ponto_batidas').upsert({pis, dia, hora:h, origem:'remover', motivo:'batida errada'},{onConflict:'pis,dia,hora,origem'}));
      await fim(); }catch(e){ err(e.message||String(e)); } });
  m.querySelectorAll('[data-pv]').forEach(b=>b.onclick=async()=>{ const h=+b.dataset.pv; try{ await q(S.sb.from('ponto_batidas').delete().eq('id',rem[h].id)); await fim(); }catch(e){ err(e.message||String(e)); } });
  $('#pcAdd',m).onclick=async()=>{ const v=$('#pcH',m).value; if(!v) return err('Informe o horário.'); const [hh,mm]=v.split(':').map(Number); const h=hh*60+mm;
    if((A.bat[pis]?.[dia]||[]).includes(h)) return err('Já existe batida nesse horário.');
    try{ await q(S.sb.from('ponto_batidas').upsert({pis, dia, hora:h, origem:'manual', motivo:$('#pcM',m).value},{onConflict:'pis,dia,hora,origem'})); await fim(); }catch(e){ err(e.message||String(e)); } };
  $('#pcJs',m).onclick=async()=>{ const t=$('#pcJ',m).value; try{
      if(!t) await q(S.sb.from('ponto_justificativas').delete().eq('pis',pis).eq('dia',dia));
      else await q(S.sb.from('ponto_justificativas').upsert({pis, dia, tipo:t, obs:$('#pcO',m).value||null},{onConflict:'pis,dia'}));
      await fim(); }catch(e){ err(e.message||String(e)); } };
}

const ehArquivoPonto = f => /^AFD.*\.txt$/i.test(f?.name||'');

/* analisa um dia: devolve pessoas, alertas, extras etc. */
function conferirDia(A, dia, NOW){
  const dom = new Date(dia+'T12:00:00Z').getUTCDay()===0;
  const FECH = dom? PT.fechDom : PT.fech;
  let ultima=-1; for(const p in A.bat) for(const x of (A.bat[p][dia]||[])) ultima=Math.max(ultima,x);
  const CORTE = (A.gerado && A.gerado.dia===dia)? A.gerado.min : (ultima>=0? ultima : NOW);
  const REF = ultima>=0? Math.min(NOW, Math.max(ultima, CORTE)) : NOW;
  const al=[], pessoas=[], extras=[];
  const add=(k,n,d,extra={})=>al.push({k,n,d,...extra});
  for(const pis in A.bat){
    const v=[...new Set(A.bat[pis][dia]||[])].sort((a,b)=>a-b); if(!v.length) continue;
    const n=ptNome(A.nomes[pis]), apr=(A.apr&&A.apr[pis])||ptAprendiz(A.nomes[pis]), J = apr? PT.jornAprendiz : PT.jornada;
    const pares=[]; for(let i=0;i+1<v.length;i+=2) pares.push([v[i],v[i+1]]);
    const trab=pares.reduce((a,[x,y])=>a+y-x,0), intervalos=[]; for(let i=1;i+1<v.length;i+=2) intervalos.push(v[i+1]-v[i]);
    const aberto=v.length%2===1;
    const P={pis,n,apr,v,trab,J,intervalos, man:Object.keys(A.man?.[pis]?.[dia]||{}).length, just:A.just?.[pis]?.[dia]?.j||null};
    // almoço
    if(intervalos.length && !apr){ const alm=Math.max(...intervalos); P.alm=alm;
      if(alm>PT.almMax) add('ALMOÇO > 2h',n,`almoço de ${ptH(alm)} (${alm-PT.almMax} min a mais)`,{tipo:'alm',leve:alm-PT.almMax<=2});
      if(alm<PT.almMin) add('ALMOÇO < 1h50',n,`almoço de ${ptH(alm)} (${PT.almMin-alm} min a menos)`,{tipo:'alm',leve:PT.almMin-alm<=2});
      intervalos.forEach(x=>{ if(x!==alm) add('PAUSA EXTRA',n,`pausa a mais de ${ptH(x)}`,{tipo:'alm'}); });
    }
    for(const [x,y] of pares) if(y-x>PT.cont && !apr) add('MAIS DE 6h SEM PAUSA',n,`${ptHm(x)}–${ptHm(y)} = ${ptH(y-x)} seguidas`);
    const tarde = v.length===2 && v[0]>=12*60 && trab>=3*60;      // turno só da tarde: 2 batidas = turno fechado
    if(!aberto){
      if(!apr && !tarde && v.length===2 && trab<J-60 && NOW-v[1]<4*60 && NOW<1440){
        const fora=NOW-v[1]; P.st='intervalo'; P.volta=v[1]+PT.almMax;
        P.txt=`no intervalo desde ${ptHm(v[1])} (${ptH(fora)})`;
        if(fora>PT.almMax) add('ATRASO NA VOLTA DO ALMOÇO',n,`saiu ${ptHm(v[1])}, já são ${ptH(fora)} fora (devia voltar até ${ptHm(v[1]+PT.almMax)})`);
        else if(fora>PT.almMax-15) add('PERTO DE 2h DE ALMOÇO',n,`saiu ${ptHm(v[1])}, precisa voltar até ${ptHm(v[1]+PT.almMax)}`);
        P.prev = v[1]+PT.almMax + (J-trab);
        if(REF-v[1]>3*60) add('PERDA: NÃO VOLTOU / BATIDA FALTANDO',n,`saiu ${ptHm(v[1])} e não bateu mais — foi embora ou esqueceu de bater?`,{tipo:'perda'});
      } else {
        const ex=trab-J; P.st='saiu'; P.saida=v[v.length-1]; P.saldo=ex;
        P.txt=`saiu ${ptHm(P.saida)} · trabalhou ${ptH(trab)} · saldo ${ex>=0?'+':''}${ptH(ex)}`;
        if(apr){ if(ex>0) add('APRENDIZ PASSOU DE 4h',n,`trabalhou ${ptH(trab)} — ${ex} min acima das 4h (aprendiz não pode fazer extra)`); }
        else {
          if(ex>0) extras.push({n,ex});
          if(ex>PT.maxExtra) add('MAIS DE 2h EXTRAS',n,`fez ${ptH(ex)} de extra`);
          if(trab>6*60 && !intervalos.length) add('SEM INTERVALO',n,`trabalhou ${ptH(trab)} sem intervalo`);
        }
        if(!dom && !apr && ex<-PT.tol && !(tarde && trab<=4*60+15)) add('PERDA: SAIU ANTES / HORAS A MENOS',n,`trabalhou ${ptH(trab)} — ${ptH(-ex)} abaixo da jornada (saída ${ptHm(P.saida)})`,{tipo:'perda'});
        if(apr && ex<-PT.tol && !dom) add('PERDA: SAIU ANTES / HORAS A MENOS',n,`aprendiz trabalhou ${ptH(trab)} — ${ptH(-ex)} abaixo das 4h`,{tipo:'perda'});
      }
    } else {
      const ini=v[v.length-1], agoraTrab=trab+Math.max(0,NOW-ini), trecho=Math.max(0,NOW-ini);
      const prev=ini+(J-trab); P.st='trab'; P.prev=prev; P.agoraTrab=agoraTrab;
      P.saldoFech = trab+(FECH-ini)-J;
      P.txt=`trabalhando · ${ptH(agoraTrab)} no dia · ${ptH(trecho)} seguidas${!intervalos.length && !apr && J>PT.cont && agoraTrab<J?' · ainda não almoçou':''}`;
      if(apr){
        const ex=agoraTrab-J;
        if(ex>0) add('APRENDIZ PASSOU DE 4h',n,`completou 4h às ${ptHm(prev)} e não bateu a saída — já está com +${ex} min (aprendiz não pode fazer extra)${prev>CORTE?' · pode ter saído depois da geração do arquivo':''}`);
        else if(NOW>=prev-PT.aviso) add('APRENDIZ PERTO DE 4h',n,`completa 4h às ${ptHm(prev)} — tem que bater a saída até lá`);
      } else {
        const lim6=ini+PT.cont;
        if(trecho>PT.cont) add('MAIS DE 6h SEM PAUSA',n,`desde ${ptHm(ini)}, já são ${ptH(trecho)} seguidas`);
        else if(NOW>=lim6-PT.aviso && prev>lim6) add('PERTO DE 6h SEM PAUSA',n,`desde ${ptHm(ini)} — completa 6h às ${ptHm(lim6)}`);
        else if(!intervalos.length && trab===0 && FECH-ini<=PT.cont+15 && ini+240<=NOW+PT.aviso && prev>ini+240)
          add('PAUSA DE 15 MIN',n,`entrou ${ptHm(ini)} sem intervalo; completa 4h às ${ptHm(ini+240)} → precisa de 15 min de pausa`);
        const exAgora=agoraTrab-J, lim2=ini+(J+PT.maxExtra-trab);
        if(exAgora>PT.maxExtra) add('MAIS DE 2h EXTRAS',n,`já está com ${ptH(exAgora)} de extra (saída prevista era ${ptHm(prev)})`);
        else if(exAgora>0) add('PASSOU DA SAÍDA',n,`saída prevista ${ptHm(prev)} — se ainda estiver na loja já está com +${ptH(exAgora)}; passa de 2h extras às ${ptHm(lim2)}.${prev>CORTE?' A saída prevista é depois da geração do arquivo — pode já ter saído.':' Esqueceu de bater?'}`);
        else if(P.saldoFech>PT.maxExtra && prev>=FECH-90) add('RISCO DE +2h EXTRAS',n,`saída prevista ${ptHm(prev)}; se ficar até o fechamento faz ${ptH(P.saldoFech)} de extra`);
      }
      if(REF-prev>3*60) add('PERDA: NÃO VOLTOU / BATIDA FALTANDO',n,`última batida ${ptHm(ini)}, sem saída há mais de 3h do previsto`,{tipo:'perda'});
    }
    // CLT: interjornada e dias seguidos
    const ontem=ptAddDia(dia,-1), bo=A.bat[pis][ontem];
    if(bo && bo.length){ const fim=Math.max(...bo), desc=(1440-fim)+v[0]; if(desc<11*60) add('INTERJORNADA < 11h',n,`saiu ontem ${ptHm(fim)} e entrou hoje ${ptHm(v[0])} — descanso de ${ptH(desc)}`,{tipo:'clt'}); }
    let seq=1, d=ontem; while(A.bat[pis][d]?.length){ seq++; d=ptAddDia(d,-1); }
    P.seq=seq; if(seq>=7) add('7+ DIAS SEGUIDOS SEM FOLGA',n,`${seq}º dia seguido trabalhando`,{tipo:'clt'});
    if(P.just) for(let i=al.length-1;i>=0;i--) if(al[i].n===n && al[i].tipo==='perda') al.splice(i,1); // dia justificado (atestado, folga…)
    pessoas.push(P);
  }
  // quem trabalhou nos últimos 7 dias e não bateu neste dia
  const faltou=[]; if(dia<=A.maxDia) for(const pis in A.bat){ if(A.bat[pis][dia]?.length) continue;
    let ult=null; for(let k=1;k<=7;k++){ const d=ptAddDia(dia,-k); if(A.bat[pis][d]?.length){ ult=d; break; } }
    if(ult) faltou.push({pis, n:ptNome(A.nomes[pis]), ult, apr:(A.apr&&A.apr[pis])||ptAprendiz(A.nomes[pis]), just:A.just?.[pis]?.[dia]?.j||null}); }
  faltou.sort((a,b)=>b.ult.localeCompare(a.ult)||a.n.localeCompare(b.n));
  return { dia, dom, FECH, NOW, ultima, CORTE, pessoas, al, extras, faltou };
}

const PT_ORDEM = ['MAIS DE 6h SEM PAUSA','APRENDIZ PASSOU DE 4h','MAIS DE 2h EXTRAS','ATRASO NA VOLTA DO ALMOÇO','PASSOU DA SAÍDA','APRENDIZ PERTO DE 4h',
  'PERTO DE 6h SEM PAUSA','PAUSA DE 15 MIN','RISCO DE +2h EXTRAS','PERTO DE 2h DE ALMOÇO'];
const PT_COR = { 'MAIS DE 6h SEM PAUSA':'bad','APRENDIZ PASSOU DE 4h':'bad','MAIS DE 2h EXTRAS':'bad','ATRASO NA VOLTA DO ALMOÇO':'bad','PASSOU DA SAÍDA':'warn','APRENDIZ PERTO DE 4h':'warn','PERTO DE 6h SEM PAUSA':'warn','PAUSA DE 15 MIN':'warn','RISCO DE +2h EXTRAS':'warn','PERTO DE 2h DE ALMOÇO':'warn' };
const PT_ROT = { 'MAIS DE 6h SEM PAUSA':'Mais de 6h sem pausa','APRENDIZ PASSOU DE 4h':'Aprendiz passou de 4h','MAIS DE 2h EXTRAS':'Mais de 2h extras','ATRASO NA VOLTA DO ALMOÇO':'Atrasou a volta do almoço','PASSOU DA SAÍDA':'Passou da saída','APRENDIZ PERTO DE 4h':'Aprendiz perto de 4h','PERTO DE 6h SEM PAUSA':'Perto de 6h sem pausa','PAUSA DE 15 MIN':'Pausa de 15 min','RISCO DE +2h EXTRAS':'Risco de +2h extras','PERTO DE 2h DE ALMOÇO':'Perto de 2h de almoço',
  'ALMOÇO > 2h':'Almoço acima de 2h','ALMOÇO < 1h50':'Almoço abaixo de 1h50','PAUSA EXTRA':'Pausa a mais','INTERJORNADA < 11h':'Interjornada menor que 11h','7+ DIAS SEGUIDOS SEM FOLGA':'7 ou mais dias sem folga',
  'PERDA: NÃO VOLTOU / BATIDA FALTANDO':'Não voltou / batida faltando','PERDA: SAIU ANTES / HORAS A MENOS':'Saiu antes / horas a menos','SEM INTERVALO':'Sem intervalo' };

async function renderPonto(app){
  if(!S.gerente){ app.innerHTML='<div class="card empty">Só o gerente vê a conferência de ponto.</div>'; return; }
  const agora0=ptAgoraBR();
  if(!S._ptDias){ app.innerHTML='<div class="empty"><span class="spin"></span> Carregando o ponto…</div>'; try{ S._ptDias=(await q(S.sb.rpc('ponto_dias')))||[]; }catch(e){ app.innerHTML=`<div class="note err">Erro ao carregar o ponto: ${esc(e.message||e)}</div>`; return; } }
  const diasDb=S._ptDias.map(x=>x.dia);
  if(!S.ptDia || !diasDb.includes(S.ptDia)) S.ptDia = diasDb.includes(agora0.dia)? agora0.dia : diasDb[0];
  let A=null;
  if(S.ptDia){ if(!S._ptCache || S._ptCache.dia!==S.ptDia){ app.innerHTML='<div class="empty"><span class="spin"></span> Carregando o ponto…</div>';
      try{ S._ptCache={dia:S.ptDia, A:await carregarPonto(S.ptDia)}; }catch(e){ app.innerHTML=`<div class="note err">Erro ao carregar o ponto: ${esc(e.message||e)}</div>`; return; } }
    A=S._ptCache.A; }
  if(S.view!=='ponto') return;
  const topo=`<div class="row" style="align-items:flex-end;margin-bottom:12px;gap:8px;flex-wrap:wrap"><div><h1>🕒 Conferência de ponto</h1><p class="sub" style="margin:0">Abra o arquivo AFD do relógio: o site confere todo mundo e diz quem sai a que horas, quem passou, almoço, extras e regras da CLT.</p></div><div class="sp"></div><button class="btn p" id="ptAbrir">📥 Abrir arquivo do ponto (AFD)</button><input type="file" id="ptArq" accept=".txt" class="hide"></div>`;
  if(!A){
    app.innerHTML=topo+`<div class="card empty"><h2>Nenhum arquivo aberto ainda</h2><p>No Gerenciador Inner Rep, gere o <b>AFD</b> (arquivo <code>AFD…txt</code>, fica em Downloads) e abra aqui.<br>As batidas ficam salvas no site (só o gerente vê) e cada arquivo novo completa os dias.</p></div>`;
    ligarPonto(); return;
  }
  const agora=ptAgoraBR();
  const dias=diasDb;
  const hoje = S.ptDia===agora.dia;
  const NOW = S.ptAgora!=null && hoje? S.ptAgora : (hoje? agora.min : 1440);
  const R=conferirDia(A, S.ptDia, NOW);
  const geradoTxt = A.gerado? `${fD(A.gerado.dia)} ${ptHm(A.gerado.min)}` : '—';
  const velho = hoje && (!A.gerado || A.gerado.dia!==agora.dia || agora.min-A.gerado.min>90);
  const nomeDia = d => new Date(d+'T12:00:00Z').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',timeZone:'UTC'}).replace('.','');
  const seletor=`<div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">
      <label class="f" style="margin:0">Dia<select id="ptDia">${dias.slice(0,31).map(d=>`<option value="${d}" ${d===S.ptDia?'selected':''}>${nomeDia(d)}${d===agora.dia?' · hoje':''}</option>`).join('')}</select></label>
      ${hoje?`<label class="f" style="margin:0">Conferir como se fossem<input type="time" id="ptAgora" value="${ptHm(Math.min(NOW,1439))}"></label>${S.ptAgora!=null?'<button class="btn" id="ptAgoraJa">agora</button>':''}`:''}
    </div>`;
  const aviso = velho? `<div class="note warn" style="margin-bottom:10px">⚠️ O arquivo foi gerado em <b>${geradoTxt}</b>${A.gerado&&A.gerado.dia===agora.dia?` (há ${ptH(agora.min-A.gerado.min)})`:''}. Batidas depois disso não aparecem: saídas e voltas do almoço podem estar faltando. Gere o AFD de novo no Gerenciador Inner Rep e abra aqui.</div>` : '';
  const P=R.pessoas;
  const naLoja=P.filter(p=>p.st==='trab'), inter=P.filter(p=>p.st==='intervalo'), sairam=P.filter(p=>p.st==='saiu');
  const totEx=R.extras.reduce((a,x)=>a+x.ex,0), totExTol=R.extras.filter(x=>x.ex>PT.tol).reduce((a,x)=>a+x.ex,0);
  const agoraAl=PT_ORDEM.flatMap(k=>R.al.filter(a=>a.k===k));
  const outros=(f)=>R.al.filter(f);
  const almoco=outros(a=>a.tipo==='alm'), perdas=outros(a=>a.tipo==='perda'), clt=outros(a=>a.tipo==='clt'), semInt=outros(a=>a.k==='SEM INTERVALO');
  const itAl=a=>`<div class="pp-i"><div class="pp-p"><b>${esc(a.n)}</b><div class="small">${esc(a.d)}</div></div><div class="pp-n"><span class="pp-v ${PT_COR[a.k]||(a.leve?'':'warn')}">${esc(PT_ROT[a.k]||a.k)}${a.leve?' · tolerância':''}</span></div></div>`;
  const lista=(arr,vazio)=>`<div class="pp-l">${arr.map(itAl).join('')||`<div class="small muted" style="padding:6px 0">${vazio||'nada por aqui ✔'}</div>`}</div>`;
  // parecer: quem sai a que horas
  const alDe=n=>R.al.filter(a=>a.n===n && PT_COR[a.k]);
  const situ=p=>{ const a=alDe(p.n);
    if(p.st==='saiu') return `<span class="pp-v good">✔ saiu ${ptHm(p.saida)}</span>`;
    if(p.st==='intervalo') return `<span class="pp-v ${a.length?PT_COR[a[0].k]:'warn'}">🍽 almoço · volta até ${ptHm(p.volta)}</span>`;
    if(a.length) return `<span class="pp-v ${PT_COR[a[0].k]}">${esc(PT_ROT[a[0].k])}</span>`;
    return `<span class="pp-v good">no horário</span>`; };
  const ordem=[...naLoja.sort((a,b)=>a.prev-b.prev), ...inter.sort((a,b)=>a.prev-b.prev), ...sairam.sort((a,b)=>a.saida-b.saida)];
  const JT={folga:'folga',atestado:'atestado',ferias:'férias',dispensa:'dispensa',falta:'falta',outro:'justificado'};
  const btCor=pis=>`<button class="btn" data-ptcor="${esc(pis)}" title="Corrigir o ponto" style="padding:3px 8px;font-size:12.5px;margin-top:4px">✏️ corrigir</button>`;
  const itP=p=>`<div class="pp-i"><div class="pp-p"><b>${esc(p.n)}</b>${p.apr?' <span class="pp-promo">aprendiz 4h</span>':''}${p.man?' <span class="pp-promo">corrigido</span>':''}${p.just?` <span class="pp-promo">${JT[p.just.tipo]||p.just.tipo}</span>`:''}<div class="small muted">batidas: ${p.v.map(ptHm).join(' · ')}</div><div class="small">${esc(p.txt)}</div>${situ(p)}</div>
      <div class="pp-n">${p.st==='saiu'?`<b>${ptHm(p.saida)}</b><span class="small muted">saiu</span>`:`<b style="font-size:18px">${ptHm(p.prev)}</b><span class="small muted">${p.st==='intervalo'?'sai (se voltar no limite)':'deve sair'}</span>${p.st==="trab"&&!p.apr&&p.saldoFech>0&&p.prev<R.FECH&&p.prev>=R.FECH-90?`<span class="small muted">se ficar até ${ptHm(R.FECH)}: +${ptH(p.saldoFech)}</span>`:''}`}${btCor(p.pis)}</div></div>`;
  // turno da noite
  const noite=naLoja.filter(p=>!p.apr && p.prev>=R.FECH-60).sort((a,b)=>a.prev-b.prev);
  const itN=p=>{ const d=p.prev-R.FECH; return `<div class="pp-i"><div class="pp-p"><b>${esc(p.n)}</b><div class="small">entrou ${ptHm(p.v[0])} · saída prevista ${ptHm(p.prev)}</div></div><div class="pp-n">${d>0?`<span class="pp-v warn">fecha ${ptH(d)} abaixo da jornada</span><span class="small muted">se sair no fechamento</span>`:d<0?`<span class="pp-v good">sai ${ptH(-d)} antes do fechamento</span>`:'<span class="pp-v good">sai no fechamento</span>'}</div></div>`; };
  const mais=(arr,n,fn,id)=>`<div class="pp-l" id="${id}">${arr.slice(0,n).map(fn).join('')}</div>${arr.length>n?`<button class="btn" data-ptmais="${id}" style="margin-top:8px">Ver todos (${arr.length})</button>`:''}`;
  app.innerHTML = topo + seletor + aviso + `
    <div class="small muted" style="margin:-2px 0 10px">${esc(A.empresa||'')} · arquivo gerado ${geradoTxt} · última batida do dia ${R.ultima>=0?ptHm(R.ultima):'—'}${hoje?` · conferindo às ${ptHm(Math.min(NOW,1439))}`:''} · jornada ${ptH(PT.jornada)} · fechamento ${ptHm(R.FECH)}${R.dom?' (domingo)':''}</div>
    <div class="grid kpis">
      <div class="kpi hero"><div class="l">🚨 Alertas agora</div><div class="v" style="color:${agoraAl.length?'#ff8a8a':'#9be7b0'}">${agoraAl.length}</div><div class="d">${agoraAl.length?'veja abaixo quem precisa de atenção':'tudo em ordem neste momento'}</div></div>
      <div class="kpi"><div class="l">Na loja</div><div class="v">${naLoja.length}</div><div class="d">${inter.length} no intervalo · ${sairam.length} já saíram · ${P.length} bateram ponto</div></div>
      <div class="kpi"><div class="l">Horas extras de quem já saiu</div><div class="v">${ptH(totEx)}</div><div class="d">${ptH(totExTol)} tirando a tolerância de ${PT.tol} min · ${R.extras.length} pessoas</div></div>
      <div class="kpi"><div class="l">Perdas de horas</div><div class="v" style="color:${perdas.length?'var(--bad)':'var(--good)'}">${perdas.length}</div><div class="d">saíram antes ou estão com batida faltando</div></div>
    </div>
    <div class="card" style="margin-top:12px"><h2>🚨 Alertas agora</h2>${lista(agoraAl,'nenhum alerta neste momento ✔')}</div>
    <div class="card" style="margin-top:12px"><h2>🕒 Parecer: quem sai a que horas</h2><p class="small muted" style="margin-top:-4px">Pela jornada de ${ptH(PT.jornada)} (aprendiz 4h), com as batidas do dia. Quem está trabalhando aparece primeiro, na ordem em que deve sair.</p>${mais(ordem,12,itP,'ptLs')}</div>
    <div class="grid two pp-2" style="gap:12px;margin-top:12px">
      <div class="card"><h2>🍽 Almoço</h2><p class="small muted" style="margin-top:-4px">Permitido entre 1h50 e 2h. "Tolerância" = só 1 ou 2 minutos.</p>${lista(almoco)}${semInt.length?lista(semInt):''}</div>
      <div class="card"><h2>⏱ Horas extras de hoje</h2><p class="small muted" style="margin-top:-4px">De quem já saiu · total ${ptH(totEx)} (${ptH(totExTol)} tirando a tolerância). Aprendizes não entram.</p><div class="pp-l">${R.extras.sort((a,b)=>b.ex-a.ex).map(x=>`<div class="pp-i"><div class="pp-p"><b>${esc(x.n)}</b></div><div class="pp-n"><b style="color:${x.ex>PT.tol?'var(--bad)':'var(--ink)'}">+${ptH(x.ex)}</b></div></div>`).join('')||'<div class="small muted" style="padding:6px 0">ninguém fez extra ainda</div>'}</div></div>
    </div>
    <div class="grid two pp-2" style="gap:12px;margin-top:12px">
      <div class="card"><h2>📉 Perdas de horas</h2><p class="small muted" style="margin-top:-4px">Teve atestado, dispensa ou precisa lançar batida?${R.dom?' Domingo tem jornada menor: saldo negativo não conta como falta.':''}</p>${lista(perdas)}</div>
      <div class="card"><h2>⚖️ CLT</h2><p class="small muted" style="margin-top:-4px">Descanso mínimo de 11h entre um dia e outro, e folga dentro de 7 dias.</p>${lista(clt)}</div>
    </div>
    <div class="grid two pp-2" style="gap:12px;margin-top:12px">
      <div class="card"><h2>🌙 Turno da noite</h2><p class="small muted" style="margin-top:-4px">Quem sai perto do fechamento (${ptHm(R.FECH)}).</p><div class="pp-l">${noite.map(itN).join('')||'<div class="small muted" style="padding:6px 0">ninguém no fechamento</div>'}</div></div>
      <div class="card"><h2>❔ Não bateram ponto ${hoje?'hoje':'neste dia'}</h2><p class="small muted" style="margin-top:-4px">Trabalharam nos últimos 7 dias. Folga ou falta?</p>${mais(R.faltou,10,f=>`<div class="pp-i"><div class="pp-p"><b>${esc(f.n)}</b>${f.apr?' <span class="pp-promo">aprendiz</span>':''}${f.just?` <span class="pp-promo">${JT[f.just.tipo]||f.just.tipo}</span>`:''}</div><div class="pp-n"><span class="small muted">último dia: ${fD(f.ult)}</span>${btCor(f.pis)}</div></div>`,'ptFl')||''}${R.faltou.length?'':'<div class="small muted" style="padding:6px 0">todo mundo bateu ✔</div>'}</div>
    </div>
    <p class="small muted" style="margin-top:12px">Último arquivo: ${esc(A.arquivo||'')} · as batidas ficam salvas no site (só o gerente vê). ✏️ corrige batida que faltou ou está errada e justifica o dia.</p>`;
  ligarPonto();
  const dados={ordem,R};
  $('#ptDia')?.addEventListener('change',e=>{ S.ptDia=e.target.value; S.ptAgora=null; renderPonto(app); });
  $('#ptAgora')?.addEventListener('change',e=>{ const [h,m]=(e.target.value||'').split(':').map(Number); if(isFinite(h)&&isFinite(m)){ S.ptAgora=h*60+m; renderPonto(app); } });
  $('#ptAgoraJa')?.addEventListener('click',()=>{ S.ptAgora=null; renderPonto(app); });
  const ligarCor=()=>app.querySelectorAll('[data-ptcor]').forEach(b=>b.onclick=()=>corrigirPonto(b.dataset.ptcor, S.ptDia, A, ()=>renderPonto(app))); ligarCor();
  app.querySelectorAll('[data-ptmais]').forEach(b=>b.onclick=()=>{ const id=b.dataset.ptmais, arr= id==='ptLs'? dados.ordem : dados.R.faltou;
    $('#'+id).innerHTML = id==='ptLs'? arr.map(itP).join('') : arr.map(f=>`<div class="pp-i"><div class="pp-p"><b>${esc(f.n)}</b>${f.apr?' <span class="pp-promo">aprendiz</span>':''}${f.just?` <span class="pp-promo">${JT[f.just.tipo]||f.just.tipo}</span>`:''}</div><div class="pp-n"><span class="small muted">último dia: ${fD(f.ult)}</span>${btCor(f.pis)}</div></div>`).join(''); b.remove(); ligarCor(); });
}
function ligarPonto(){
  const b=$('#ptAbrir'), i=$('#ptArq'); if(!b||!i) return;
  b.onclick=()=>i.click(); i.onchange=()=>{ const f=i.files[0]; i.value=''; if(f) abrirArquivoPonto(f); };
}
