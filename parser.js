// Leitura de números, nomes de setores, relatórios de venda e da planilha mensal antiga (META DIARIA).
(function (root) {
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const round2 = v => Math.round((+v || 0) * 100) / 100;

  function parseNum(str) {
    if (typeof str === 'number') return str;
    let s = String(str ?? '').replace(/R\$|\s/g, '').trim(); if (!s) return NaN;
    let neg = false; if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); } if (s.startsWith('-')) { neg = true; s = s.slice(1); }
    const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc > -1 && ld > -1) { s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''); }
    else if (lc > -1) { s = (s.split(',').length > 2) ? s.replace(/,/g, '') : s.replace(',', '.'); }
    else if (ld > -1) { const p = s.split('.'); if (p.length > 2 || p[p.length - 1].length === 3) s = s.replace(/\./g, ''); }
    const v = parseFloat(s); return isNaN(v) ? NaN : (neg ? -v : v);
  }
  const NUMRE = /\(?-?(?:R\$\s?)?\d{1,3}(?:\.\d{3})+(?:,\d{1,3})?\)?|\(?-?(?:R\$\s?)?\d{1,3}(?:,\d{3})+(?:\.\d{1,3})?\)?|\(?-?(?:R\$\s?)?\d+(?:[.,]\d{1,3})?\)?/g;
  function extractNums(str) { const out = []; (String(str).match(NUMRE) || []).forEach(t => { const v = parseNum(t.replace(/[()]/g, '')); if (!isNaN(v)) out.push(t.startsWith('(') ? -v : v); }); return out; }

  // sinônimos usados em relatórios e planilhas
  const ALIASES = {
    acougue: ['ACOUGUE', 'ACOUGE', 'CARNES', 'CARNE'],
    hortifruti: ['HORTIFRUTI', 'HORTIFRUTTI', 'HORTI FRUTI', 'HORTI FRUIT', 'HORTIFRUIT', 'HORT', 'HORTI', 'FLV', 'FRUTAS', 'VERDURAS'],
    panif_terc: ['PANIFICADORA TERCEIRO', 'PANIFICADORA TERCEIROS', 'PANIFICADORA TERCER', 'PANIFICADORA TERC', 'PADARIA TERCEIRO', 'PADARIA TERCEIROS', 'PADARIA TERC', 'PANIF TERC', 'PAES TERCEIROS'],
    padaria: ['PADARIA', 'PANIFICADORA', 'PANIFICACAO', 'PAES'],
    pereciveis: ['PERECIVEIS', 'PERECIVES', 'PERECIVEL', 'FRIOS', 'FRIOS E LATICINIOS', 'LATICINIOS'],
    merc_seca: ['MERCEARIA SECA', 'MERC SECA', 'MERC SEC'],
    merc_salgada: ['MERCEARIA SALGADA', 'MERC SALGADA', 'MERC SALG'],
    merc_doce: ['MERCEARIA DOCE', 'MERC DOCE', 'DOCES'],
    bebidas: ['BEBIDAS', 'BEBIDA'],
    perfumaria: ['PERFUMARIA', 'HIGIENE', 'HIGIENE E BELEZA'],
    limpeza: ['LIMPEZA', 'PRODUTOS DE LIMPEZA'],
    bazar: ['BAZAR', 'UTILIDADES'],
    leite_gas: ['LEITE GAS', 'LEITE E GAS', 'LEITE', 'GAS'],
    eletro: ['ELETRO TEXT OUTROS', 'ELETRO TEXTIL OUTROS', 'ELETRO', 'TEXTIL', 'ELETRONICOS', 'OUTROS']
  };
  const ALIAS_LIST = Object.entries(ALIASES).flatMap(([id, arr]) => arr.map(a => ({ id, a: norm(a) }))).sort((x, y) => y.a.length - x.a.length);
  function matchSector(text) {
    const n = ' ' + norm(text) + ' ';
    for (const { id, a } of ALIAS_LIST) { if (n.includes(' ' + a + ' ')) return id; }
    return null;
  }
  // nome de setor como cabeçalho de planilha (precisa começar pelo nome)
  function sectorHeader(text) {
    const n = norm(text); if (!n) return null;
    for (const { id, a } of ALIAS_LIST) { if (n === a || n.startsWith(a + ' ')) return id; }
    return null;
  }

  function parseLines(rows) {
    const vendas = {}, avisos = []; let data = null;
    for (const r of rows) {
      const text = r.text || '';
      if (!data) { const dm = text.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{2,4})/); if (dm) { const y = dm[3].length === 2 ? '20' + dm[3] : dm[3]; data = `${y}-${dm[2]}-${dm[1]}`; } }
      const id = matchSector(r.label ?? text); if (!id || vendas[id] != null) continue;
      let nums = r.nums ?? extractNums(text.replace(/^\s*\d{1,6}\s*[-–.]?\s+(?=[A-Za-zÀ-ú])/, ''));
      nums = nums.filter(v => !(Number.isInteger(v) && v >= 0 && v < 100 && nums.length > 1));
      if (!nums.length) continue;
      const v = nums.length === 1 ? nums[0] : Math.max(...nums);
      if (nums.length > 1) avisos.push(id);
      vendas[id] = round2(v);
    }
    return { vendas, perdas: {}, data, avisos, obs: avisos.length ? 'Algumas linhas tinham mais de um número — foi usado o maior valor. Confira os destacados.' : '' };
  }

  /* ---------- planilha mensal (modelo antigo, abas META DIARIA / PERCA-VENDA SETORES / Planilha1..31) ---------- */
  const MESES_N = { JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6, JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12 };
  const ORDER = ['acougue', 'hortifruti', 'padaria', 'panif_terc', 'pereciveis', 'merc_seca', 'merc_salgada', 'merc_doce', 'bebidas', 'perfumaria', 'limpeza', 'bazar', 'leite_gas', 'eletro'];
  const pad = n => String(n).padStart(2, '0');

  // ws: objeto de células no formato SheetJS ({A1:{t,v}}); devolve a célula (linha e coluna começando em 1)
  function colName(c) { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
  const cell = (ws, r, c) => ws ? ws[colName(c) + r] : undefined;
  const val = (ws, r, c) => { const x = cell(ws, r, c); return x ? x.v : null; };
  const num = (ws, r, c) => { const x = cell(ws, r, c); return x && x.t === 'n' && isFinite(x.v) ? x.v : null; };
  const dt = (ws, r, c) => { const x = cell(ws, r, c); if (!x) return null; if (x.v instanceof Date) { const d = new Date(x.v.getTime() + 12 * 3600e3); return d; } return null; };

  function parseModelo(wb, fileName) {
    const md = wb.Sheets['META DIARIA'], pv = wb.Sheets['PERCA-VENDA SETORES'];
    if (!md || !pv) throw new Error('Não é a planilha mensal (faltam as abas META DIARIA / PERCA-VENDA SETORES).');
    // mês: pelo nome do arquivo ("NOVEMBRO 2026.xlsx") ou pelas datas
    let yr = null, mon = null;
    const parts = norm(String(fileName || '').replace(/\.[^.]+$/, '')).split(' ');
    for (let i = 0; i < parts.length - 1; i++) if (MESES_N[parts[i]] && /^\d{4}$/.test(parts[i + 1])) { mon = MESES_N[parts[i]]; yr = +parts[i + 1]; }
    if (!mon) { const d = dt(md, 1, 1) || dt(pv, 9, 1); if (d) { mon = d.getMonth() + 1; yr = d.getFullYear(); } }
    if (!mon) throw new Error('Não consegui descobrir o mês. Renomeie o arquivo como "MÊS ANO.xlsx".');
    const mes = `${yr}-${pad(mon)}`, nd = new Date(yr, mon, 0).getDate();
    const avisos = [];
    // metas mensais da loja e dos setores
    let metaLoja = null; const smeta = {};
    for (let r = 1; r <= 7; r++) for (let c = 4; c <= 10; c++) {
      const v = val(md, r, c);
      if (typeof v === 'string') {
        const below = num(md, r + 1, c);
        if (norm(v) === 'META LOJA') { if (below != null) metaLoja = below; }
        else { const i = sectorHeader(v); if (i && below != null && smeta[i] == null) smeta[i] = below; }
      }
    }
    // meta e total do caixa por dia
    const dias = {};
    if (dt(md, 1, 1)) {
      for (let r = 1; r < 40; r++) {
        const d = dt(md, r, 1); if (!d || d.getMonth() + 1 !== mon || d.getFullYear() !== yr) continue;
        const k = `${mes}-${pad(d.getDate())}`; const m = num(md, r, 2), t = num(md, r, 3);
        dias[k] = { meta: m != null ? round2(m) : 0 }; if (t) dias[k].total = round2(t);
      }
    } else {
      for (let day = 1; day <= nd; day++) {
        const m = num(md, day, 1), t = num(md, day, 2), k = `${mes}-${pad(day)}`;
        dias[k] = { meta: m != null ? round2(m) : 0 }; if (t) dias[k].total = round2(t);
      }
    }
    for (let day = 1; day <= nd; day++) { const k = `${mes}-${pad(day)}`; if (!dias[k]) dias[k] = { meta: 0 }; }
    // vendas e perdas por setor (blocos da aba PERCA-VENDA SETORES)
    const blockMeta = {};
    for (const r0 of [1, 42, 83, 124]) for (const c0 of [1, 7, 13, 19]) {
      const i = sectorHeader(val(pv, r0, c0)); if (!i) continue;
      let bm = 0;
      for (let day = 1; day <= nd; day++) {
        const r = r0 + 8 + day - 1, k = `${mes}-${pad(day)}`;
        const m = num(pv, r, c0 + 1), v = num(pv, r, c0 + 2), p = num(pv, r, c0 + 4);
        if (m != null) bm += m;
        if (v) (dias[k].vendas = dias[k].vendas || {})[i] = round2(v);
        if (p) (dias[k].perdas = dias[k].perdas || {})[i] = round2(p);
      }
      blockMeta[i] = bm;
    }
    // vendas direto das abas Planilha1..31 (evita erros de fórmula)
    let usadas = 0;
    for (let day = 1; day <= nd; day++) {
      const ws = wb.Sheets['Planilha' + day]; if (!ws) continue;
      const got = {};
      for (let r = 1; r <= 20; r++) { const i = sectorHeader(val(ws, r, 1)); if (i && !(i in got)) got[i] = num(ws, r, 2); }
      if (Object.keys(got).length >= 10) {
        const k = `${mes}-${pad(day)}`; const vend = {};
        for (const [i, v] of Object.entries(got)) if (v) vend[i] = round2(v);
        if (Object.keys(vend).length) { const old = dias[k].vendas || {}; for (const i in old) if (!(i in vend)) vend[i] = old[i]; dias[k].vendas = vend; usadas++; }
      }
    }
    const ids = ORDER.filter(i => i in smeta || i in blockMeta);
    const setores = ids.map(i => { let m = smeta[i]; if (!m) { m = blockMeta[i] || 0; avisos.push(`meta de ${i} calculada pela soma diária`); } return { id: i, meta: round2(m) }; });
    const somaDias = Object.values(dias).reduce((a, d) => a + d.meta, 0);
    if (!metaLoja) metaLoja = somaDias;
    // diárias
    let diarias = null;
    for (let r = 1; r < 12; r++) if (norm(val(md, r, 12)) === 'DIARIAS') {
      const lanc = [];
      for (let rr = r + 1; rr < r + 20; rr++) { const a = dt(md, rr, 12), b = num(md, rr, 13); if (a && b) lanc.push({ data: `${a.getFullYear()}-${pad(a.getMonth() + 1)}-${pad(a.getDate())}`, valor: b }); }
      const orc = num(md, 4, 13); diarias = { orcamento: orc || 0, lancamentos: lanc };
    }
    return { mes, metaLoja: round2(metaLoja), setores, dias, diarias, avisos, diasComSetor: usadas };
  }


  /* ---------- relatório "RESULTADO DO BALANCO DO SETOR" do sistema da loja ---------- */
  const dataBR = t => { const m=String(t||'').match(/(\d{2})\/(\d{2})\/(\d{2,4})/); if(!m) return null; const y=m[3].length===2?'20'+m[3]:m[3]; return `${y}-${m[2]}-${m[1]}`; };
  const qtd = t => { const v=parseFloat(String(t).replace(/[?*]/g,'')); return isNaN(v)?0:v; };            // quantidades: ponto decimal
  const din = t => { let x=String(t).replace(/[?*%]/g,''); let neg=false; if(/-$/.test(x)){ neg=true; x=x.slice(0,-1); } if(/\+$/.test(x)) x=x.slice(0,-1); const v=parseNum(x); return isNaN(v)?0:(neg?-v:v); }; // reais: vírgula decimal
  const RESUMO = [['perdas',/^TOTAL DE PERDAS\b/],['pctPerdas',/^% PERDAS \(S\/CUSTO\)/],['custo',/^TOTAL DO CUSTO\b/],['vendas',/^TOTAL DE VENDAS\b/],['pctLucro',/^% LUCRO SOBRE VENDA\b/],['lucro',/^LUCRO APURADO\b/]];
  function analisarBalancoSistema(linhas){
    const textos = linhas.map(l => typeof l==='string' ? l : String(l.text||''));
    if(!textos.some(t=>/RESULTADO (DO BALANCO DO (SETOR|SUBGRUPO|GRUPO|DEPARTAMENTO)|GERAL DO BALANCO)/i.test(t))) return null;
    const res = { tipo:'balanco_setorial', emitido:null, periodo:{ini:null,fim:null}, geral:null, setores:[], produtos:[] };
    let atual=null, geral=false;
    const novoSetor = cod => { let s=res.setores.find(x=>x.codigo===cod); if(!s){ s={codigo:cod, itens:0, prefixos:{}}; res.setores.push(s); } return s; };
    for(const raw of textos){
      const t=raw.replace(/\s+/g,' ').trim(); if(!t) continue;
      if(!res.emitido){ const m=t.match(/EMITIDO EM:?\s*(\d{2}\/\d{2}\/\d{2,4})/i); if(m) res.emitido=dataBR(m[1]); }
      let m=t.match(/RESULTADO DO BALANCO DO (?:SETOR|SUBGRUPO|GRUPO|DEPARTAMENTO) (\d+).*?DE (\d{2}\/\d{2}\/\d{2,4}) A (\d{2}\/\d{2}\/\d{2,4})/i);
      if(m){ atual=novoSetor(m[1]); geral=false; res.periodo.ini=res.periodo.ini||dataBR(m[2]); res.periodo.fim=res.periodo.fim||dataBR(m[3]); continue; }
      m=t.match(/RESULTADO GERAL DO BALANCO.*?DE (\d{2}\/\d{2}\/\d{2,4}) A (\d{2}\/\d{2}\/\d{2,4})/i);
      if(m){ geral=true; atual=null; res.geral=res.geral||{}; res.periodo.ini=dataBR(m[1]); res.periodo.fim=dataBR(m[2]); continue; }
      // linhas de resumo (TOTAL DE PERDAS...: -85,320 etc.)
      let achou=false;
      for(const [k,re] of RESUMO){ if(re.test(t)){ const mm=t.match(/:\s*(-?[\d.]*\d(?:,\d+)?-?)\s*%?/); if(mm){ const alvo=geral?res.geral:atual; if(alvo && alvo[k]==null) alvo[k]=din(mm[1]); } achou=true; break; } }
      if(achou) continue;
      // linha de produto: CODIGO DESCRICAO TIPO + 13 colunas numéricas
      if(/^\d+\s+\D/.test(t) && atual){
        let tk=t.split(' '); const fixed=[]; for(const x of tk){ if((x==='-'||x==='+') && fixed.length) fixed[fixed.length-1]+=x; else fixed.push(x); } tk=fixed;
        if(tk.length<16) continue;
        const nums=tk.slice(-13); if(!/^-?\d/.test(nums[0])) continue;
        const tipo=tk[tk.length-14], desc=tk.slice(1,tk.length-14).join(' ');
        const p={ codigo:tk[0], produto:desc, tipo, setor:atual.codigo, qtdPerdas:qtd(nums[4]), pctPerdas:din(nums[5]), qtdVendida:qtd(nums[6]), custoMedio:din(nums[7]), vendaMedia:din(nums[8]) };
        p.valor=round2(p.qtdPerdas*p.custoMedio);
        res.produtos.push(p); atual.itens++; const pre=desc.split(' ')[0]; atual.prefixos[pre]=(atual.prefixos[pre]||0)+1;
      }
    }
    for(const s of res.setores){ const top=Object.entries(s.prefixos).sort((a,b)=>b[1]-a[1])[0]; s.grupo=top?top[0]:''; delete s.prefixos; }
    if(!res.geral){ // relatório de um setor só
      if(res.setores.length===1){ const s=res.setores[0]; res.geral={perdas:s.perdas,pctPerdas:s.pctPerdas,custo:s.custo,vendas:s.vendas,pctLucro:s.pctLucro,lucro:s.lucro}; }
      else if(res.setores.length){ const g={perdas:0,custo:0,vendas:0,lucro:0}; for(const s of res.setores){ for(const k in g) g[k]+=s[k]||0; } g.pctPerdas=g.custo?round2(g.perdas/g.custo*100):null; g.pctLucro=g.vendas?round2(g.lucro/g.vendas*100):null; res.geral=g; }
    }
    if(!res.geral || res.geral.perdas==null) return null;
    const perdas=res.produtos.filter(p=>p.valor<0).sort((a,b)=>a.valor-b.valor), sobras=res.produtos.filter(p=>p.valor>0).sort((a,b)=>b.valor-a.valor);
    res.totalProdutos=res.produtos.length; res.produtosComPerda=perdas.length; res.produtosComSobra=sobras.length;
    res.top=perdas.slice(0,15); res.sobras=sobras.slice(0,8);
    // faltas positivas e sobras negativas: somando tudo dá o TOTAL DE PERDAS do relatório (falta menos sobra)
    res.perdasProdutos=res.produtos.filter(p=>p.valor).map(p=>[p.codigo, round2(-p.valor)]); res.versao=2; delete res.produtos;
    res.valorPerda = res.geral.perdas<0 ? round2(-res.geral.perdas) : 0;
    return res;
  }

  /* ---------- "RELACAO DE VENDAS COM RENTABILIDADE" (produtos por departamento) ---------- */
  const numBR = t => { let x=String(t).trim(); if(/^\*+[,.]?\*+$/.test(x)) return 0; if(x.includes(',')) x=x.replace(/\./g,'').replace(',','.'); const v=parseFloat(x); return isNaN(v)?null:v; };
  function analisarRelatorioVendas(linhas){
    const textos = linhas.map(l => typeof l==='string' ? l : String(l.text||''));
    if(!textos.some(t=>/RELACAO\s+DE\s+VENDAS/i.test(t))) return null;
    const res={ tipo:'vendas_rentabilidade', emitido:null, periodo:{ini:null,fim:null}, filial:null, cupons:null, totalGeral:null, departamentos:[] };
    let dep=null;
    for(const raw of textos){
      const t=raw.replace(/\s+/g,' ').trim(); if(!t) continue;
      if(!res.emitido){ const m=t.match(/EMITIDO EM:?\s*(\d{2}\/\d{2}\/\d{2,4})/i); if(m) res.emitido=dataBR(m[1]); }
      let m=t.match(/RENTABILIDADE DE (\d{2}\/\d{2}\/\d{2,4}) A (\d{2}\/\d{2}\/\d{2,4})/i);
      if(m){ if(!res.periodo.ini){ res.periodo.ini=dataBR(m[1]); res.periodo.fim=dataBR(m[2]); } const f=t.match(/FILIAL:?\s*(\d+)/i); if(f) res.filial=f[1]; continue; }
      m=t.match(/PRODUTOS D[OA] (DEPTO|DEPARTAMENTO|SECAO|SUBGRUPO|SETOR|GRUPO|CLASSE):?\s*(\d+)\s*-?\s*(.+)$/i);
      if(m){ if(!res.nivel) res.nivel=m[1].toUpperCase(); m=[m[0],m[2],m[3]]; const cod=parseInt(m[1],10); dep=res.departamentos.find(d=>d.codigo===cod); if(!dep){ dep={codigo:cod, nome:m[2].trim(), produtos:[]}; res.departamentos.push(dep); } continue; }
      m=t.match(/^TOTAL GERAL:?\s*(.*)$/i);
      if(m){ const tk=m[1].split(' '); res.totalGeral={ itens:parseInt(tk[0],10)||null, qt:null, venda: tk.length>=7 ? numBR(tk[tk.length-6]) : numBR(tk[5]) }; dep=null; continue; }
      m=t.match(/TOTAL DE CUPONS:?\s*(\d+)/i); if(m){ res.cupons=+m[1]; continue; }
      if(dep && /^\d+\s+\S/.test(t)){
        // o sistema às vezes gruda %S/VEN e %S/LUC (ex.: "11,972-202,833", "52,058****,***", "47,9421260,654"): separa antes de contar as colunas
        const tk=t.replace(/(^|\s)(-?\d+,\d{3})(-?\d+,\d{3}|\*+,\*+)(?=\s|$)/g,'$1$2 $3').split(' '); if(tk.length<14) continue;
        const nums=tk.slice(-12).map(numBR); if(nums.some(v=>v==null)) continue;
        const desc=tk.slice(1,-12).join(' '); if(!desc) continue;
        // QT.VENDA CUSTO_UN ENC_UN VENDA_UN TOT_CUSTO TOT_VENDA TOT_LUCRO LS/CUS LS/VEN %S/VEN %S/LUC MG.TRA
        dep.produtos.push({ c:tk[0], d:desc, q:nums[0], v:round2(nums[5]), m:nums[8], mt:nums[11], z:nums[1]<=0 });
      }
    }
    res.departamentos=res.departamentos.filter(d=>d.produtos.length);
    if(!res.periodo.ini || !res.departamentos.length) return null;
    res.itens=res.departamentos.reduce((a,d)=>a+d.produtos.length,0);
    res.venda=round2(res.departamentos.reduce((a,d)=>a+d.produtos.reduce((b,p)=>b+p.v,0),0));
    return res;
  }

  /* ---------- "PERDAS DA FILIAL ... NO PERIODO DE x A y" (perdas por produto) ---------- */
  function analisarRelatorioPerdas(linhas){
    const textos = linhas.map(l => (typeof l==='string' ? l : String(l.text||'')).replace(/\s+/g,' ').trim());
    const cab = textos.find(t=>/PERDAS DA FILIAL .*PERIODO DE \d{2}\/\d{2}\/\d{2,4} A \d{2}\/\d{2}\/\d{2,4}/i.test(t)); if(!cab) return null;
    const pm = cab.match(/FILIAL (\d+).*PERIODO DE (\d{2}\/\d{2}\/\d{2,4}) A (\d{2}\/\d{2}\/\d{2,4})/i);
    const res={ tipo:'perdas', filial:pm[1], periodo:{ini:dataBR(pm[2]), fim:dataBR(pm[3])}, emitido:null, secoes:[], total:null };
    let sec=null;
    for(const t of textos){ if(!t) continue;
      if(!res.emitido){ const m=t.match(/EMITIDO EM:?\s*(\d{2}\/\d{2}\/\d{2,4})/i); if(m) res.emitido=dataBR(m[1]); }
      let m=t.match(/^(SECAO|DEPTO|DEPARTAMENTO|GRUPO|SUBGRUPO):?\s*(\d+)\s*-\s*(.+)$/i);
      if(m){ const cod=+m[2]; sec=res.secoes.find(x=>x.codigo===cod); if(!sec){ sec={codigo:cod, nome:m[3].trim(), nivel:m[1].toUpperCase(), itens:[]}; res.secoes.push(sec); } continue; }
      m=t.match(/^TOTAL:?\s+(.+)$/i); if(m){ const n=m[1].split(' ').map(numBR); if(n.length>=4) res.total={ent:n[0],sai:n[1],ven:n[2],q:n[3]}; continue; }
      if(sec && /^\d+\s+\S/.test(t)){
        const tk=t.split(' '); if(tk.length<8) continue;
        const ult=tk.slice(-6); if(!/%$/.test(ult[4])) continue;
        const nums=[ult[0],ult[1],ult[2],ult[3],ult[5]].map(numBR); if(nums.some(v=>v==null)) continue;
        const desc=tk.slice(1,-6).join(' '); if(!desc) continue;
        const [e,sa,v,q,cu]=nums; const pc=parseFloat(ult[4])||0;
        sec.itens.push({ c:tk[0], d:desc, e, s:sa, v, q, pc, cu, val:round2(q*cu) });
      }
    }
    res.secoes=res.secoes.filter(x=>x.itens.length); if(!res.secoes.length || !res.periodo.ini) return null;
    res.itens=res.secoes.reduce((a,x)=>a+x.itens.length,0);
    res.qtd=round2(res.secoes.reduce((a,x)=>a+x.itens.reduce((b,i)=>b+i.q,0),0));
    res.valor=round2(res.secoes.reduce((a,x)=>a+x.itens.reduce((b,i)=>b+i.val,0),0));
    return res;
  }

  /* ---------- "RESUMO DE ACERTOS/PERDAS POR PRODUTO NO PERIODO DE x A y" (acertos de balanço) ---------- */
  function analisarRelatorioAcertos(linhas){
    const textos = linhas.map(l => (typeof l==='string' ? l : String(l.text||'')).replace(/\s+/g,' ').trim());
    const cab = textos.find(t=>/RESUMO DE ACERTOS.*PERIODO DE \d{2}\/\d{2}\/\d{2,4} A \d{2}\/\d{2}\/\d{2,4}/i.test(t)); if(!cab) return null;
    const pm = cab.match(/PERIODO DE (\d{2}\/\d{2}\/\d{2,4}) A (\d{2}\/\d{2}\/\d{2,4})/i);
    const res={ tipo:'acertos', periodo:{ini:dataBR(pm[1]), fim:dataBR(pm[2])}, filial:null, emitido:null, itens:[], total:null };
    for(const t of textos){ if(!t) continue;
      if(!res.filial){ const f=t.match(/FILIAL:?\s*(\d+)/i); if(f) res.filial=f[1]; }
      if(!res.emitido){ const e=t.match(/EMISS[AÃ]O:?\s*(\d{2}\/\d{2}\/\d{2,4})/i); if(e) res.emitido=dataBR(e[1]); }
      let m=t.match(/TOTAL DIFERENCA:?\s*(-?[\d.,]+)/i); if(m){ res.total=numBR(m[1]); continue; }
      if(/^\d+\s+\S/.test(t)){ const tk=t.split(' '); if(tk.length<11) continue; const n=tk.slice(-9).map(numBR); if(n.some(v=>v==null)) continue;
        const d=tk.slice(1,-9).join(' '); if(!d) continue;
        res.itens.push({ c:tk[0], d, qe:n[0], ve:n[2], qs:n[3], vs:n[5], qd:n[6], vd:n[8] }); }
    }
    if(!res.itens.length) return null;
    res.diferenca=round2(res.itens.reduce((a,i)=>a+i.vd,0));
    return res;
  }

  /* ---------- "RESUMO DE PRODUTOS TRANSFERIDOS DA FILIAL x PARA AS FILIAIS y" (trocas) ---------- */
  function analisarRelatorioTransferencias(linhas){
    const textos = linhas.map(l => (typeof l==='string' ? l : String(l.text||'')).replace(/\s+/g,' ').trim());
    const cab = textos.find(t=>/PRODUTOS TRANSFERIDOS.*PERIODO DE \d{2}\/\d{2}\/\d{2,4} A \d{2}\/\d{2}\/\d{2,4}/i.test(t)); if(!cab) return null;
    const pm = cab.match(/FILIAL (\d+) PARA AS FILIAIS? ([\d, ]+?) NO PERIODO DE (\d{2}\/\d{2}\/\d{2,4}) A (\d{2}\/\d{2}\/\d{2,4})/i);
    if(!pm) return null;
    const res={ tipo:'transferencias', origem:pm[1], destino:pm[2].trim(), periodo:{ini:dataBR(pm[3]), fim:dataBR(pm[4])}, emitido:null, deps:[], total:null };
    let dep=null;
    for(const t of textos){ if(!t) continue;
      if(!res.emitido){ const e=t.match(/EMITIDO EM:?\s*(\d{2}\/\d{2}\/\d{2,4})/i); if(e) res.emitido=dataBR(e[1]); }
      let m=t.match(/^Departamento\s*:\s*(\d+)\s*-\s*(.+)$/i);
      if(m){ const cod=+m[1]; dep=res.deps.find(x=>x.codigo===cod); if(!dep){ dep={codigo:cod, nome:m[2].trim(), itens:[]}; res.deps.push(dep); } continue; }
      m=t.match(/^TOTAL GERAL:?\s+(.+)$/i); if(m){ const n=m[1].split(' ').map(numBR); res.total={venda:n[n.length-3], custo:n[n.length-1]}; dep=null; continue; }
      if(/^CODIGO\s+DESCRICAO/i.test(t)){ res._cab=true; continue; }
      // relatório tirado por SUBGRUPO não traz a linha "Departamento": os produtos vêm direto (o setor sai do cadastro de produtos)
      if(!dep && res._cab && /^\d+\s+\S/.test(t)){ dep=res.deps.find(x=>x.codigo===0); if(!dep){ dep={codigo:0, nome:'', itens:[]}; res.deps.push(dep); } }
      if(dep && /^\d+\s+\S/.test(t)){ const tk=t.split(' '); if(tk.length<10) continue; const n=tk.slice(-5).map(numBR); if(n.some(v=>v==null)) continue;
        const d=tk.slice(1,-8).join(' '); if(!d) continue;
        dep.itens.push({ c:tk[0], d, pv:n[0], tv:round2(n[1]), q:n[2], cu:n[3], tc:round2(n[4]) }); }
    }
    delete res._cab; res.deps=res.deps.filter(x=>x.itens.length); if(!res.deps.length) return null;
    res.itens=res.deps.reduce((a,x)=>a+x.itens.length,0);
    res.custo=round2(res.deps.reduce((a,x)=>a+x.itens.reduce((b,i)=>b+i.tc,0),0));
    res.venda=round2(res.deps.reduce((a,x)=>a+x.itens.reduce((b,i)=>b+i.tv,0),0));
    return res;
  }
  const api = { norm, round2, parseNum, extractNums, ALIASES, matchSector, sectorHeader, parseLines, parseModelo, analisarBalancoSistema, analisarRelatorioVendas, analisarRelatorioPerdas, analisarRelatorioAcertos, analisarRelatorioTransferencias };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Parser = api;
})(typeof window !== 'undefined' ? window : globalThis);
