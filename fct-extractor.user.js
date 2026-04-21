// ==UserScript==
// @name         Extractor FCT → DOCX
// @namespace    https://github.com/TU_USUARIO/fct-extractor
// @version      1.0.0
// @description  Extrae los diarios FCT del aula virtual y genera un DOCX con análisis de calidad
// @author       Roberto Tubilleja Calvo
// @match        *://*/*
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
// ==/UserScript==

(async function () {
  'use strict';

  // ── Panel flotante ─────────────────────────────────────────────────────────
  function crearPanel() {
    const viejo = document.getElementById('fct-panel');
    if (viejo) viejo.remove();

    const panel = document.createElement('div');
    panel.id = 'fct-panel';
    panel.style.cssText = `
      position:fixed; top:20px; right:20px; width:400px; max-height:70vh;
      z-index:999999; background:#0d0f14; color:#e8eaf0;
      border:1px solid #1e2840; border-radius:10px;
      box-shadow:0 10px 30px rgba(0,0,0,0.5);
      font-family:Arial,sans-serif; font-size:12px; overflow:hidden;
      display:flex; flex-direction:column;
    `;
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;
                  padding:10px 14px;background:#111827;border-bottom:1px solid #1e2840;flex-shrink:0">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:28px;height:28px;background:#2563eb;border-radius:6px;
                      display:flex;align-items:center;justify-content:center;font-size:14px">📋</div>
          <strong style="font-size:13px;color:#e2e8f8">Extractor FCT → DOCX</strong>
        </div>
        <button id="fct-cerrar" style="background:#1e2840;color:#94a3b8;border:1px solid #2d3f5e;
                border-radius:6px;padding:3px 10px;cursor:pointer;font-size:11px">✕ Cerrar</button>
      </div>
      <div style="padding:10px 14px;background:#111520;border-bottom:1px solid #1a2030;flex-shrink:0">
        <div style="display:flex;align-items:center;gap:8px">
          <div id="fct-dot" style="width:8px;height:8px;border-radius:50%;background:#374151;flex-shrink:0"></div>
          <span id="fct-estado" style="font-size:12px;color:#94a3b8">Listo. Abre el listado de FCTs y pulsa Extraer.</span>
        </div>
        <div id="fct-progreso-wrap" style="display:none;margin-top:8px;background:#1a2030;border-radius:4px;height:4px;overflow:hidden">
          <div id="fct-progreso" style="height:100%;background:#2563eb;width:0%;transition:width 0.4s;border-radius:4px"></div>
        </div>
      </div>
      <div id="fct-log" style="flex:1;overflow-y:auto;padding:10px 14px;background:#080a0f;
                                font-family:monospace;font-size:11px;color:#4a5568;
                                max-height:300px;min-height:60px"></div>
      <div style="padding:10px 14px;background:#0d0f14;border-top:1px solid #1a2030;flex-shrink:0">
        <button id="fct-btn" style="width:100%;padding:10px;background:#2563eb;color:#fff;
                border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer">
          ⬇ Extraer diarios y generar DOCX
        </button>
      </div>
    `;
    document.body.appendChild(panel);

    // Animación del dot
    let dotAnim;
    const dot = panel.querySelector('#fct-dot');

    return {
      setEstado(txt, estado = 'idle') {
        panel.querySelector('#fct-estado').textContent = txt;
        clearInterval(dotAnim);
        if (estado === 'running') {
          let on = true;
          dotAnim = setInterval(() => { dot.style.background = (on = !on) ? '#f59e0b' : '#7c6020'; }, 500);
          dot.style.background = '#f59e0b';
        } else if (estado === 'ok') {
          dot.style.background = '#22c55e';
        } else if (estado === 'error') {
          dot.style.background = '#ef4444';
        } else {
          dot.style.background = '#374151';
        }
      },
      log(txt, nivel = 'info') {
        const colores = { info: '#4a6080', warn: '#ca8a04', error: '#dc2626', ok: '#16a34a' };
        const t = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const linea = document.createElement('div');
        linea.style.cssText = `color:${colores[nivel] || colores.info};padding:1px 0;line-height:1.5`;
        linea.textContent = `[${t}] ${txt}`;
        const logEl = panel.querySelector('#fct-log');
        logEl.appendChild(linea);
        logEl.scrollTop = logEl.scrollHeight;
      },
      setProgreso(pct) {
        const wrap = panel.querySelector('#fct-progreso-wrap');
        wrap.style.display = 'block';
        panel.querySelector('#fct-progreso').style.width = Math.min(100, pct) + '%';
      },
      get btnExtract() { return panel.querySelector('#fct-btn'); },
      cerrar: () => panel.remove()
    };
  }

  const ui = crearPanel();
  ui.log('Panel listo. Haz clic en "Extraer" para comenzar.');

  document.getElementById('fct-cerrar').onclick = ui.cerrar;

  // ── Esperar al botón ───────────────────────────────────────────────────────
  ui.btnExtract.addEventListener('click', async () => {
    ui.btnExtract.disabled = true;
    ui.btnExtract.style.background = '#1e2840';
    ui.btnExtract.style.color = '#3a4560';
    await extraer(ui);
    ui.btnExtract.disabled = false;
    ui.btnExtract.style.background = '#2563eb';
    ui.btnExtract.style.color = '#fff';
  });

  // ── Función principal ──────────────────────────────────────────────────────
  async function extraer(ui) {

    // Escapado XML — BUG CORREGIDO: incluye comillas simples y filtra control chars
    function xe(s) {
      return String(s == null ? '' : s)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    }

    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    // BUG CORREGIDO: verificar response.ok
    async function fetchHTML(url) {
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.text();
    }

    // ── Localizar tabla ──────────────────────────────────────────────────────
    const tablaFCT =
      document.getElementById('tablaListadoFCTs') ||
      document.querySelector('table.tablaListadoFCTs');

    if (!tablaFCT) {
      ui.setEstado('Tabla no encontrada. ¿Estás en el listado de FCTs?', 'error');
      ui.log('ERROR: No se encontró la tabla de FCTs. Navega al listado primero.', 'error');
      return;
    }

    // ── Extraer alumnos ──────────────────────────────────────────────────────
    const alumnos = [];
    Array.from(tablaFCT.querySelectorAll('tr')).slice(1).forEach(fila => {
      const enlaceAlumno = fila.querySelector('a.enlaceDestacado');
      const enlaceDiario = fila.querySelector('a[href*="accion=11"]');
      if (!enlaceAlumno || !enlaceDiario) return;
      const m = enlaceDiario.getAttribute('href').match(/idFct=(\d+)/);
      if (m) alumnos.push({ nombre: enlaceAlumno.textContent.trim(), idFct: m[1] });
    });

    if (!alumnos.length) {
      ui.setEstado('No se encontraron alumnos en la tabla.', 'error');
      ui.log('ERROR: La tabla no tiene filas de alumnos reconocibles.', 'error');
      return;
    }

    ui.log(`Alumnos detectados: ${alumnos.length}`);
    ui.setEstado(`Procesando ${alumnos.length} alumnos…`, 'running');
    ui.setProgreso(5);

    const parser = new DOMParser();

    function extraerHoras(doc) {
      const tds = Array.from(doc.querySelectorAll('td'));
      for (let i = 0; i < tds.length; i++) {
        if (/horas\s+realiz/i.test(tds[i].textContent) && tds[i + 1]) {
          return tds[i + 1].textContent.trim();
        }
      }
      return null;
    }

    function calcHorasDiario(al) {
      let t = 0;
      al.semanas.forEach(s => s.dias.forEach(d => {
        const h = parseFloat(d.horas);
        if (!isNaN(h)) t += h;
      }));
      return t > 0 ? `${t} h` : '—';
    }

    // ── Extracción por alumno ────────────────────────────────────────────────
    const datos = [];
    const total = alumnos.length;

    for (let i = 0; i < total; i++) {
      const al = alumnos[i];
      ui.log(`[${i + 1}/${total}] ${al.nombre}`);
      ui.setEstado(`Alumno ${i + 1}/${total}: ${al.nombre}`, 'running');
      ui.setProgreso(5 + Math.round((i / total) * 70));

      const obj = { nombre: al.nombre, idFct: al.idFct, horas: null, semanas: [] };

      let htmlIni;
      try {
        htmlIni = await fetchHTML(`/index.php?accion=11&idFct=${al.idFct}`);
      } catch (e) {
        ui.log(`⚠ Sin diario: ${al.nombre} (${e.message})`, 'warn');
        datos.push(obj);
        continue;
      }

      const docIni = parser.parseFromString(htmlIni, 'text/html');
      obj.horas = extraerHoras(docIni);

      const sel = docIni.getElementById('semanaDiario');
      if (!sel) {
        ui.log(`⚠ Sin semanas: ${al.nombre}`, 'warn');
        datos.push(obj);
        continue;
      }

      const semanas = Array.from(sel.options).map(o => ({
        label: o.text.trim(),
        value: o.value.trim()
      }));
      ui.log(`  → ${semanas.length} semanas`);

      for (const sem of semanas) {
        const url = `/index.php?accion=11&idFct=${al.idFct}&semanaDiario=${encodeURIComponent(sem.value)}`;
        let htmlSem;
        try {
          htmlSem = await fetchHTML(url);
        } catch (e) {
          ui.log(`  ⚠ Semana ${sem.label}: ${e.message}`, 'warn');
          continue;
        }

        const docSem = parser.parseFromString(htmlSem, 'text/html');
        if (!obj.horas) obj.horas = extraerHoras(docSem);

        const bloques  = docSem.querySelectorAll('div[id^="diario"]');
        const spansDia = docSem.querySelectorAll('p.diasDelDiario span[style*="color"]');
        const dias = [];

        bloques.forEach((blq, idx) => {
          let titulo = `Día ${idx + 1}`;
          if (spansDia[idx]) {
            const p = spansDia[idx].closest('p');
            if (p) titulo = p.textContent.trim().replace(/\s+/g, ' ');
          }
          const filas = blq.querySelectorAll('table.tablaDiario tr');
          if (filas.length < 2) return;
          const cc    = filas[1].querySelectorAll('td.celda1');
          const desc  = cc[0]?.textContent.trim() || '';
          const horas = cc[3]?.textContent.trim() || '';
          const horasN = parseFloat(horas);
          const horasOk = horas && !isNaN(horasN) && horasN > 0;
          if (!desc && !horasOk) return;
          dias.push({
            titulo,
            descripcion:   desc,
            orientaciones: cc[1]?.textContent.trim() || '',
            observaciones: cc[2]?.textContent.trim() || '',
            horas:         horasOk ? horas : '',
            sinCampos:     !desc && horasOk
          });
        });

        if (dias.length) obj.semanas.push({ label: sem.label, dias });
        await delay(280);
      }

      datos.push(obj);
      ui.log(`  ✓ ${obj.horas || calcHorasDiario(obj)}`, 'ok');
      await delay(450);
    }

    // ── Análisis de calidad ──────────────────────────────────────────────────
    ui.log('Analizando calidad…');
    ui.setProgreso(80);

    const UMBRAL_TEXTO_CORTO = 40;
    const UMBRAL_SIMILITUD   = 0.85;

    function similitud(a, b) {
      if (!a || !b) return 0;
      const wa = new Set(a.toLowerCase().split(/\s+/));
      const wb = new Set(b.toLowerCase().split(/\s+/));
      let comunes = 0;
      wa.forEach(w => { if (wb.has(w)) comunes++; });
      return comunes / Math.max(wa.size, wb.size);
    }

    function analizarAlumno(al) {
      const diasConDatos = [];
      al.semanas.forEach(s => s.dias.forEach(d => diasConDatos.push(d)));
      const totalDias      = diasConDatos.length;
      const diasSinCampos  = diasConDatos.filter(d => d.sinCampos).length;
      const diasTextoCorto = diasConDatos.filter(d =>
        !d.sinCampos && d.descripcion.length > 0 && d.descripcion.length < UMBRAL_TEXTO_CORTO
      ).length;
      const descs = diasConDatos.map(d => d.descripcion).filter(Boolean);
      let diasRepetidos = 0;
      descs.forEach((desc, i) => {
        for (let j = 0; j < i; j++) {
          if (similitud(desc, descs[j]) >= UMBRAL_SIMILITUD) { diasRepetidos++; break; }
        }
      });
      diasConDatos.forEach((d, i) => {
        d.esCorto    = !d.sinCampos && d.descripcion.length > 0 && d.descripcion.length < UMBRAL_TEXTO_CORTO;
        d.esRepetido = false;
        if (d.descripcion) {
          for (let j = 0; j < i; j++) {
            if (diasConDatos[j].descripcion &&
                similitud(d.descripcion, diasConDatos[j].descripcion) >= UMBRAL_SIMILITUD) {
              d.esRepetido = true; break;
            }
          }
        }
      });
      return { totalDias, diasSinCampos, diasTextoCorto, diasRepetidos };
    }

    const analisis = datos.map(al => ({
      nombre: al.nombre,
      horas:  al.horas || calcHorasDiario(al),
      ...analizarAlumno(al)
    }));

    // ── Generación DOCX ──────────────────────────────────────────────────────
    ui.log('Generando DOCX…');
    ui.setEstado('Generando documento…', 'running');
    ui.setProgreso(90);

    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
    <w:sz w:val="22"/><w:lang w:val="es-ES"/>
  </w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="H1">
    <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="0" w:after="160"/>
      <w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="1F3864"/></w:pBdr>
    </w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="1F3864"/><w:sz w:val="40"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="H2">
    <w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="200" w:after="80"/>
      <w:shd w:val="clear" w:color="auto" w:fill="D9E1F2"/>
    </w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="2E4B8C"/><w:sz w:val="26"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="H3">
    <w:name w:val="heading 3"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="140" w:after="60"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:i/><w:color w:val="333355"/><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Campo">
    <w:name w:val="Campo"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="40" w:after="40"/><w:ind w:left="440"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Titulo">
    <w:name w:val="Titulo"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="0" w:after="200"/><w:jc w:val="center"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="1F3864"/><w:sz w:val="52"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Subtitulo">
    <w:name w:val="Subtitulo"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="0" w:after="80"/><w:jc w:val="center"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="555577"/><w:sz w:val="24"/></w:rPr>
  </w:style>
</w:styles>`;

    const BORDE = `
      <w:top    w:val="single" w:sz="4" w:space="0" w:color="AAAACC"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="AAAACC"/>
      <w:left   w:val="single" w:sz="4" w:space="0" w:color="AAAACC"/>
      <w:right  w:val="single" w:sz="4" w:space="0" w:color="AAAACC"/>`;

    function celda(texto, ancho, opts = {}) {
      const { bold = false, center = false, fill = 'FFFFFF', color = '000000', sz = 18 } = opts;
      return `<w:tc>
        <w:tcPr>
          <w:tcW w:w="${ancho}" w:type="dxa"/>
          <w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>
          <w:tcBorders>${BORDE}</w:tcBorders>
          <w:tcMar>
            <w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/>
            <w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/>
          </w:tcMar>
        </w:tcPr>
        <w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${center ? '<w:jc w:val="center"/>' : ''}</w:pPr>
        <w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:color w:val="${color}"/><w:sz w:val="${sz}"/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr>
        <w:t xml:space="preserve">${xe(texto)}</w:t></w:r></w:p>
      </w:tc>`;
    }

    function buildResumen() {
      const fecha = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
      let b = '';
      b += `<w:p><w:pPr><w:pStyle w:val="Titulo"/></w:pPr><w:r><w:t>Resumen FCT</w:t></w:r></w:p>`;
      b += `<w:p><w:pPr><w:pStyle w:val="Subtitulo"/></w:pPr><w:r><w:t>Generado el ${xe(fecha)}</w:t></w:r></w:p>`;
      b += `<w:p><w:pPr><w:spacing w:after="300"/></w:pPr></w:p>`;
      const W = [3600, 1100, 1000, 1200, 1200, 1300];
      const TOTAL = W.reduce((a, x) => a + x, 0);
      const cabeceras = ['Alumno/a', 'Horas', 'Días', 'Sin campos', 'Repetidos', 'Texto corto'];
      b += `<w:tbl>
        <w:tblPr>
          <w:tblW w:w="${TOTAL}" w:type="dxa"/>
          <w:tblLayout w:type="fixed"/>
        </w:tblPr>
        <w:tblGrid>${W.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>
        <w:tr>${cabeceras.map((h, i) => celda(h, W[i], { bold: true, center: i > 0, fill: '1F3864', color: 'FFFFFF' })).join('')}</w:tr>
        ${analisis.map((a, ri) => {
          const fondo = ri % 2 === 0 ? 'F4F6FB' : 'FFFFFF';
          const ac = n => n > 0 ? 'CC2200' : '228800';
          const at = n => n > 0 ? String(n) : '✓';
          return `<w:tr>
            ${celda(a.nombre, W[0], { fill: fondo })}
            ${celda(a.horas,  W[1], { center: true, fill: fondo })}
            ${celda(String(a.totalDias), W[2], { center: true, fill: fondo })}
            ${celda(at(a.diasSinCampos),  W[3], { center: true, fill: fondo, color: ac(a.diasSinCampos),  bold: a.diasSinCampos  > 0 })}
            ${celda(at(a.diasRepetidos),  W[4], { center: true, fill: fondo, color: ac(a.diasRepetidos),  bold: a.diasRepetidos  > 0 })}
            ${celda(at(a.diasTextoCorto), W[5], { center: true, fill: fondo, color: ac(a.diasTextoCorto), bold: a.diasTextoCorto > 0 })}
          </w:tr>`;
        }).join('')}
      </w:tbl>`;
      b += `<w:p><w:pPr><w:spacing w:before="300" w:after="60"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="18"/></w:rPr><w:t>Leyenda:</w:t></w:r></w:p>`;
      [
        ['Sin campos',  `Días con horas registradas pero sin texto de descripción.`],
        ['Repetidos',   `Descripción idéntica o muy similar (>${Math.round(UMBRAL_SIMILITUD * 100)}%) a otro día.`],
        ['Texto corto', `Descripción de menos de ${UMBRAL_TEXTO_CORTO} caracteres.`]
      ].forEach(([l, t]) => {
        b += `<w:p><w:pPr><w:spacing w:before="40" w:after="40"/><w:ind w:left="440"/></w:pPr>
          <w:r><w:rPr><w:b/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${xe(l)}: </w:t></w:r>
          <w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${xe(t)}</w:t></w:r></w:p>`;
      });
      b += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
      return b;
    }

    function buildAlumnos() {
      let b = '';
      datos.forEach((al, idx) => {
        const horas = al.horas || calcHorasDiario(al);
        b += `<w:p><w:pPr><w:pStyle w:val="H1"/></w:pPr><w:r><w:t>${xe(al.nombre)}</w:t></w:r></w:p>`;
        b += `<w:p><w:pPr><w:spacing w:after="200"/></w:pPr>
          <w:r><w:rPr><w:b/><w:color w:val="444444"/></w:rPr><w:t xml:space="preserve">Horas realizadas: </w:t></w:r>
          <w:r><w:t xml:space="preserve">${xe(horas)}</w:t></w:r>
          <w:r><w:rPr><w:color w:val="999999"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">   (idFct: ${xe(al.idFct)})</w:t></w:r></w:p>`;
        if (!al.semanas.length) {
          b += `<w:p><w:r><w:rPr><w:i/><w:color w:val="888888"/></w:rPr><w:t>Sin entradas registradas.</w:t></w:r></w:p>`;
        }
        al.semanas.forEach(sem => {
          b += `<w:p><w:pPr><w:pStyle w:val="H2"/></w:pPr><w:r><w:t>${xe(sem.label)}</w:t></w:r></w:p>`;
          sem.dias.forEach(dia => {
            b += `<w:p><w:pPr><w:pStyle w:val="H3"/></w:pPr><w:r><w:t>${xe(dia.titulo)}</w:t></w:r></w:p>`;
            if (dia.sinCampos) {
              b += `<w:p><w:pPr><w:spacing w:before="40" w:after="40"/><w:ind w:left="440"/></w:pPr>
                <w:r><w:rPr><w:i/><w:color w:val="CC2200"/><w:sz w:val="20"/></w:rPr>
                <w:t xml:space="preserve">⚠ Horas registradas (${xe(dia.horas)}h) pero sin descripción.</w:t></w:r></w:p>`;
              return;
            }
            const colorDesc = dia.esRepetido ? 'CC6600' : dia.esCorto ? '996600' : '000000';
            const sufijo    = dia.esRepetido ? '  ⚠ texto repetido' : dia.esCorto ? '  ⚠ texto muy corto' : '';
            [
              ['Descripción actividad', dia.descripcion,   colorDesc, sufijo],
              ['Orientaciones',         dia.orientaciones, '000000',  ''],
              ['Observaciones',         dia.observaciones, '000000',  '']
            ].forEach(([lbl, val, col, suf]) => {
              if (!val) return;
              b += `<w:p><w:pPr><w:pStyle w:val="Campo"/></w:pPr>
                <w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${xe(lbl)}: </w:t></w:r>
                <w:r><w:rPr><w:color w:val="${col}"/></w:rPr><w:t xml:space="preserve">${xe(val)}</w:t></w:r>
                ${suf ? `<w:r><w:rPr><w:i/><w:color w:val="${col}"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${xe(suf)}</w:t></w:r>` : ''}
              </w:p>`;
            });
            b += `<w:p><w:pPr><w:pStyle w:val="Campo"/></w:pPr>
              <w:r><w:rPr><w:b/><w:color w:val="555555"/></w:rPr><w:t xml:space="preserve">Horas: </w:t></w:r>
              <w:r><w:t>${xe(dia.horas || '—')}</w:t></w:r></w:p>`;
          });
        });
        if (idx < datos.length - 1) b += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
      });
      return b;
    }

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${buildResumen()}
    ${buildAlumnos()}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"
               w:header="709" w:footer="709" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

    // ── Empaquetar y descargar ───────────────────────────────────────────────
    try {
      if (typeof JSZip === 'undefined') throw new Error('JSZip no cargado');

      const zip = new JSZip();
      zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml"   ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>`);
      zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
      zip.file('word/document.xml', documentXml);
      zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"   Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`);
      zip.file('word/styles.xml',   stylesXml);
      zip.file('word/settings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>`);

      const blob = await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      const fecha    = new Date().toISOString().slice(0, 10);
      const filename = `diarios_fct_${fecha}.docx`;
      const a        = document.createElement('a');
      a.href         = URL.createObjectURL(blob);
      a.download     = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);

      ui.setProgreso(100);
      ui.setEstado(`✓ Completado — ${datos.length} alumnos → ${filename}`, 'ok');
      ui.log(`Descarga iniciada: ${filename}`, 'ok');

    } catch (e) {
      ui.setEstado('Error al generar el DOCX: ' + e.message, 'error');
      ui.log('ERROR: ' + e.message, 'error');
    }
  }

})();
