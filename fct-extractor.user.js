// ==UserScript==
// @name         SAÓ FCT - Exportar diarios a DOCX
// @namespace    https://tampermonkey.net/
// @version      1.1
// @description  Exporta diarios FCT a DOCX o RTF desde el listado de FCTs
// @match        *://foremp.edu.gva.es/*
// @author       Manuel Alamar y Roberto Tubilleja
// @grant        none
// @run-at document-idle
// ==/UserScript==

(function () {
    'use strict';

    if (window.__fctDocxTamperLoaded) return;
    window.__fctDocxTamperLoaded = true;

    function crearBoton() {
        const viejo = document.getElementById("tm-fct-docx-btn");
        if (viejo) viejo.remove();

        const btn = document.createElement("button");
        btn.id = "tm-fct-docx-btn";
        btn.textContent = "Exportar FCT a DOCX";
        btn.style.position = "fixed";
        btn.style.bottom = "20px";
        btn.style.right = "20px";
        btn.style.zIndex = "999999";
        btn.style.padding = "10px 14px";
        btn.style.background = "#1f3864";
        btn.style.color = "#fff";
        btn.style.border = "none";
        btn.style.borderRadius = "8px";
        btn.style.boxShadow = "0 6px 18px rgba(0,0,0,0.25)";
        btn.style.cursor = "pointer";
        btn.style.fontSize = "14px";
        btn.style.fontFamily = "Arial, sans-serif";

        btn.addEventListener("mouseenter", () => btn.style.opacity = "0.9");
        btn.addEventListener("mouseleave", () => btn.style.opacity = "1");

        btn.onclick = () => ejecutarExtractor();

        document.body.appendChild(btn);
    }

    function crearPanel() {
        const viejo = document.getElementById("fct-docx-panel");
        if (viejo) viejo.remove();

        const panel = document.createElement("div");
        panel.id = "fct-docx-panel";
        panel.style.position = "fixed";
        panel.style.top = "20px";
        panel.style.right = "20px";
        panel.style.width = "420px";
        panel.style.maxHeight = "70vh";
        panel.style.zIndex = "1000000";
        panel.style.background = "#111";
        panel.style.color = "#fff";
        panel.style.border = "1px solid #444";
        panel.style.borderRadius = "10px";
        panel.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
        panel.style.fontFamily = "Arial,sans-serif";
        panel.style.fontSize = "12px";
        panel.style.overflow = "hidden";

        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#1b1b1b;border-bottom:1px solid #333;">
                <strong>Extractor FCT → DOCX</strong>
                <div>
                    <button id="fct-docx-limpiar" style="margin-right:6px;background:#333;color:#fff;border:1px solid #555;border-radius:6px;padding:4px 8px;cursor:pointer;">Limpiar</button>
                    <button id="fct-docx-cerrar" style="background:#333;color:#fff;border:1px solid #555;border-radius:6px;padding:4px 8px;cursor:pointer;">Cerrar</button>
                </div>
            </div>
            <div id="fct-docx-estado" style="padding:10px 12px;border-bottom:1px solid #222;background:#151515;">Iniciando...</div>
            <pre id="fct-docx-log" style="margin:0;padding:12px;max-height:50vh;overflow:auto;white-space:pre-wrap;background:#0b0b0b;"></pre>
        `;

        document.body.appendChild(panel);

        panel.querySelector("#fct-docx-cerrar").onclick = () => panel.remove();
        panel.querySelector("#fct-docx-limpiar").onclick = () => {
            panel.querySelector("#fct-docx-log").textContent = "";
            panel.querySelector("#fct-docx-estado").textContent = "Log limpiado";
        };

        return {
            panel,
            estado: panel.querySelector("#fct-docx-estado"),
            log: panel.querySelector("#fct-docx-log")
        };
    }

    let ui = null;
    let ejecutando = false;

    function setEstado(txt) {
        if (ui) ui.estado.textContent = txt;
    }

    function log(txt) {
        if (!ui) return;
        const linea = `[${new Date().toLocaleTimeString()}] ${txt}`;
        ui.log.textContent += linea + "\n";
        ui.log.scrollTop = ui.log.scrollHeight;
        ui.estado.textContent = txt;
        console.log(txt);
    }

    function warn(txt) {
        if (!ui) return;
        const linea = `[${new Date().toLocaleTimeString()}] ⚠ ${txt}`;
        ui.log.textContent += linea + "\n";
        ui.log.scrollTop = ui.log.scrollHeight;
        ui.estado.textContent = "⚠ " + txt;
        console.warn(txt);
    }

    function errorVisible(txt) {
        if (!ui) return;
        const linea = `[${new Date().toLocaleTimeString()}] ❌ ${txt}`;
        ui.log.textContent += linea + "\n";
        ui.log.scrollTop = ui.log.scrollHeight;
        ui.estado.textContent = "❌ " + txt;
        console.error(txt);
    }

    function xe(s) {
        return String(s || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function rtfEsc(s) {
        return String(s || "").split("").map(c => {
            const code = c.charCodeAt(0);
            if (code > 127) return `\\'${code.toString(16).padStart(2, "0")}`;
            if (c === "\\") return "\\\\";
            if (c === "{") return "\\{";
            if (c === "}") return "\\}";
            return c;
        }).join("");
    }

    function loadScript(url) {
        log("Cargando librería externa: " + url);
        return new Promise((resolve, reject) => {
            if (window.JSZip) {
                log("JSZip ya estaba cargado");
                resolve();
                return;
            }
            const s = document.createElement("script");
            s.src = url;
            s.onload = () => {
                log("Librería cargada correctamente");
                resolve();
            };
            s.onerror = () => reject(new Error("CDN bloqueado: " + url));
            document.head.appendChild(s);
        });
    }

    function descargar(blob, nombre) {
        log("Preparando descarga: " + nombre);

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nombre;
        a.style.display = "none";

        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            a.remove();
            URL.revokeObjectURL(url);
        }, 10000);
    }

    async function ejecutarExtractor() {
        if (ejecutando) {
            alert("Ya hay una exportación en curso.");
            return;
        }

        ejecutando = true;
        ui = crearPanel();

        try {
            log("Inicio del extractor FCT a DOCX");

            const tablaFCT =
                document.getElementById("tablaListadoFCTs") ||
                document.querySelector("table.tablaListadoFCTs");

            if (!tablaFCT) {
                errorVisible("Tabla no encontrada. Abre primero el listado de FCTs con la tabla cargada.");
                return;
            }

            log("Tabla encontrada, extrayendo filas");

            const alumnos = [];
            Array.from(tablaFCT.querySelectorAll("tr")).slice(1).forEach(fila => {
                const enlaceAlumno = fila.querySelector("a.enlaceDestacado");
                const enlaceDiario = fila.querySelector('a[href*="accion=11"]');
                if (!enlaceAlumno || !enlaceDiario) return;

                const m = enlaceDiario.getAttribute("href").match(/idFct=(\d+)/);
                if (m) {
                    alumnos.push({
                        nombre: enlaceAlumno.textContent.trim(),
                        idFct: m[1]
                    });
                }
            });

            if (!alumnos.length) {
                errorVisible("No se encontraron alumnos o no es el listado correcto de FCT.");
                return;
            }

            log(`Alumnos detectados: ${alumnos.length}`);

            const parser = new DOMParser();

            function extraerHoras(doc) {
                const tds = Array.from(doc.querySelectorAll("td"));
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
                return t > 0 ? `${t} h` : "—";
            }

            const datos = [];

            for (let i = 0; i < alumnos.length; i++) {
                const al = alumnos[i];
                setEstado(`Procesando alumno ${i + 1}/${alumnos.length}: ${al.nombre}`);
                log(`Procesando alumno [${i + 1}/${alumnos.length}]: ${al.nombre}`);

                const obj = {
                    nombre: al.nombre,
                    idFct: al.idFct,
                    horas: null,
                    semanas: []
                };

                let htmlIni;
                try {
                    htmlIni = await (await fetch(`/index.php?accion=11&idFct=${al.idFct}`, {
                        credentials: "include"
                    })).text();
                } catch (e) {
                    warn("No se pudo cargar diario inicial de: " + al.nombre);
                    datos.push(obj);
                    continue;
                }

                const docIni = parser.parseFromString(htmlIni, "text/html");
                obj.horas = extraerHoras(docIni);

                const sel = docIni.getElementById("semanaDiario");
                if (!sel) {
                    warn("Sin selector de semanas: " + al.nombre);
                    datos.push(obj);
                    continue;
                }

                const semanas = Array.from(sel.options).map(o => ({
                    label: o.text.trim(),
                    value: o.value.trim()
                }));

                log(`Semanas detectadas para ${al.nombre}: ${semanas.length}`);

                for (const sem of semanas) {
                    setEstado(`Alumno ${i + 1}/${alumnos.length}: ${al.nombre} | Semana: ${sem.label}`);

                    const url = `/index.php?accion=11&idFct=${al.idFct}&semanaDiario=${encodeURIComponent(sem.value)}`;
                    let htmlSem;

                    try {
                        htmlSem = await (await fetch(url, { credentials: "include" })).text();
                    } catch (e) {
                        warn(`No se pudo cargar semana ${sem.label} de ${al.nombre}`);
                        continue;
                    }

                    const docSem = parser.parseFromString(htmlSem, "text/html");
                    if (!obj.horas) obj.horas = extraerHoras(docSem);

                    const bloques = docSem.querySelectorAll('div[id^="diario"]');
                    const spansDia = docSem.querySelectorAll('p.diasDelDiario span[style*="color"]');
                    const dias = [];

                    bloques.forEach((blq, idx) => {
                        let titulo = `Día ${idx + 1}`;

                        if (spansDia[idx]) {
                            const p = spansDia[idx].closest("p");
                            if (p) titulo = p.textContent.trim().replace(/\s+/g, " ");
                        }

                        const filas = blq.querySelectorAll("table.tablaDiario tr");
                        if (filas.length < 2) return;

                        const cc = filas[1].querySelectorAll("td.celda1");
                        const desc = cc[0]?.textContent.trim() || "";
                        const horas = cc[3]?.textContent.trim() || "";

                        const horasNum = parseFloat(horas);
                        const horasValidas = horas && !isNaN(horasNum) && horasNum > 0;

                        if (!desc && !horasValidas) return;

                        dias.push({
                            titulo,
                            descripcion: desc,
                            orientaciones: cc[1]?.textContent.trim() || "",
                            observaciones: cc[2]?.textContent.trim() || "",
                            horas: horasValidas ? horas : "",
                            sinCampos: !desc && horasValidas
                        });
                    });

                    if (dias.length) obj.semanas.push({ label: sem.label, dias });

                    await new Promise(r => setTimeout(r, 280));
                }

                datos.push(obj);
                log(`Alumno completado: ${al.nombre} | horas: ${obj.horas || calcHorasDiario(obj)}`);
                await new Promise(r => setTimeout(r, 450));
            }

            log("Comenzando análisis de calidad");

            const UMBRAL_TEXTO_CORTO = 40;
            const UMBRAL_SIMILITUD = 0.85;

            function similitud(a, b) {
                if (!a || !b) return 0;
                const wa = new Set(a.toLowerCase().split(/\s+/));
                const wb = new Set(b.toLowerCase().split(/\s+/));
                let comunes = 0;
                wa.forEach(w => {
                    if (wb.has(w)) comunes++;
                });
                return comunes / Math.max(wa.size, wb.size);
            }

            function analizarAlumno(al) {
                const diasConDatos = [];
                al.semanas.forEach(s => s.dias.forEach(d => diasConDatos.push(d)));

                const totalDias = diasConDatos.length;
                const diasSinCampos = diasConDatos.filter(d => d.sinCampos).length;
                const diasTextoCorto = diasConDatos.filter(d =>
                    !d.sinCampos && d.descripcion.length < UMBRAL_TEXTO_CORTO
                ).length;

                let diasRepetidos = 0;
                const descs = diasConDatos.map(d => d.descripcion).filter(Boolean);

                descs.forEach((desc, i) => {
                    for (let j = 0; j < i; j++) {
                        if (similitud(desc, descs[j]) >= UMBRAL_SIMILITUD) {
                            diasRepetidos++;
                            break;
                        }
                    }
                });

                diasConDatos.forEach((d, i) => {
                    d.esCorto = !d.sinCampos && d.descripcion.length < UMBRAL_TEXTO_CORTO && d.descripcion.length > 0;
                    d.esRepetido = false;

                    if (d.descripcion) {
                        for (let j = 0; j < i; j++) {
                            if (
                                diasConDatos[j].descripcion &&
                                similitud(d.descripcion, diasConDatos[j].descripcion) >= UMBRAL_SIMILITUD
                            ) {
                                d.esRepetido = true;
                                break;
                            }
                        }
                    }
                });

                return { totalDias, diasSinCampos, diasTextoCorto, diasRepetidos };
            }

            const analisis = datos.map(al => ({
                nombre: al.nombre,
                horas: al.horas || calcHorasDiario(al),
                ...analizarAlumno(al)
            }));

            log("Análisis completado");

            analisis.forEach(a => {
                const alertas = [];
                if (a.diasSinCampos > 0) alertas.push(`${a.diasSinCampos} sin campos`);
                if (a.diasRepetidos > 0) alertas.push(`${a.diasRepetidos} repetidos`);
                if (a.diasTextoCorto > 0) alertas.push(`${a.diasTextoCorto} texto corto`);
                log(`${a.nombre}: ${a.horas} | ${a.totalDias} días | ${alertas.length ? alertas.join(", ") : "sin alertas"}`);
            });

            log("Generando documento");

            async function generarDocx(datos, analisis) {
                log("Cargando JSZip...");
                await loadScript("https://unpkg.com/jszip@3.10.1/dist/jszip.min.js");
                log("JSZip cargado.");

                log("Construyendo XML del documento...");

                const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
    <w:sz w:val="22"/><w:lang w:val="es-ES"/>
  </w:rPr></w:rPrDefault></w:docDefaults>

  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="80"/></w:pPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="H1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="0" w:after="160"/>
      <w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="1F3864"/></w:pBdr>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:b/><w:color w:val="1F3864"/><w:sz w:val="40"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="H2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="200" w:after="80"/>
      <w:shd w:val="clear" w:color="auto" w:fill="D9E1F2"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:b/><w:color w:val="2E4B8C"/><w:sz w:val="26"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="H3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="140" w:after="60"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:b/><w:i/><w:color w:val="333355"/><w:sz w:val="22"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Campo">
    <w:name w:val="Campo"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="40" w:after="40"/><w:ind w:left="440"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:sz w:val="20"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Titulo">
    <w:name w:val="Titulo"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="0" w:after="200"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:b/><w:color w:val="1F3864"/><w:sz w:val="52"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="Subtitulo">
    <w:name w:val="Subtitulo"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="0" w:after="80"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      <w:color w:val="555577"/><w:sz w:val="24"/>
    </w:rPr>
  </w:style>
</w:styles>`;

                const borde = `<w:top w:val="single" w:sz="4" w:space="0" w:color="AAAACC"/>
<w:bottom w:val="single" w:sz="4" w:space="0" w:color="AAAACC"/>
<w:left w:val="single" w:sz="4" w:space="0" w:color="AAAACC"/>
<w:right w:val="single" w:sz="4" w:space="0" w:color="AAAACC"/>`;

                function celda(texto, ancho, opts = {}) {
                    const {
                        bold = false,
                        center = false,
                        fill = "FFFFFF",
                        color = "000000",
                        sz = 18
                    } = opts;

                    return `<w:tc>
  <w:tcPr>
    <w:tcW w:w="${ancho}" w:type="dxa"/>
    <w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>
    <w:tcBorders>${borde}</w:tcBorders>
    <w:tcMar>
      <w:top w:w="60" w:type="dxa"/>
      <w:bottom w:w="60" w:type="dxa"/>
      <w:left w:w="100" w:type="dxa"/>
      <w:right w:w="100" w:type="dxa"/>
    </w:tcMar>
  </w:tcPr>
  <w:p>
    <w:pPr>
      <w:spacing w:before="0" w:after="0"/>
      ${center ? '<w:jc w:val="center"/>' : ''}
    </w:pPr>
    <w:r>
      <w:rPr>
        ${bold ? '<w:b/>' : ''}
        <w:color w:val="${color}"/>
        <w:sz w:val="${sz}"/>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
      </w:rPr>
      <w:t xml:space="preserve">${xe(texto)}</w:t>
    </w:r>
  </w:p>
</w:tc>`;
                }

                function buildResumen(analisis) {
                    const fecha = new Date().toLocaleDateString("es-ES", {
                        year: "numeric",
                        month: "long",
                        day: "numeric"
                    });

                    let body = "";

                    body += `<w:p>
  <w:pPr><w:pStyle w:val="Titulo"/></w:pPr>
  <w:r><w:t>Resumen FCT</w:t></w:r>
</w:p>`;

                    body += `<w:p>
  <w:pPr><w:pStyle w:val="Subtitulo"/></w:pPr>
  <w:r><w:t>Generado el ${xe(fecha)}</w:t></w:r>
</w:p>`;

                    body += `<w:p><w:pPr><w:spacing w:after="300"/></w:pPr></w:p>`;

                    const W = [3600, 1100, 1000, 1200, 1200, 1300];
                    const total = W.reduce((a, b) => a + b, 0);

                    const cabeceras = [
                        "Alumno/a",
                        "Horas",
                        "Días",
                        "Sin campos",
                        "Repetidos",
                        "Texto corto"
                    ];

                    const cabeceraFila = `<w:tr>
  ${cabeceras.map((h, i) =>
      celda(h, W[i], {
          bold: true,
          center: i > 0,
          fill: "1F3864",
          color: "FFFFFF",
          sz: 18
      })
  ).join("")}
</w:tr>`;

                    const filasAlumnos = analisis.map((a, rowIdx) => {
                        const fondo = rowIdx % 2 === 0 ? "F4F6FB" : "FFFFFF";
                        const alertaColor = n => n > 0 ? "CC2200" : "228800";
                        const alertaTexto = n => n > 0 ? String(n) : "✓";

                        return `<w:tr>
  ${celda(a.nombre, W[0], { fill: fondo })}
  ${celda(a.horas, W[1], { center: true, fill: fondo })}
  ${celda(String(a.totalDias), W[2], { center: true, fill: fondo })}
  ${celda(alertaTexto(a.diasSinCampos), W[3], {
      center: true,
      fill: fondo,
      color: alertaColor(a.diasSinCampos),
      bold: a.diasSinCampos > 0
  })}
  ${celda(alertaTexto(a.diasRepetidos), W[4], {
      center: true,
      fill: fondo,
      color: alertaColor(a.diasRepetidos),
      bold: a.diasRepetidos > 0
  })}
  ${celda(alertaTexto(a.diasTextoCorto), W[5], {
      center: true,
      fill: fondo,
      color: alertaColor(a.diasTextoCorto),
      bold: a.diasTextoCorto > 0
  })}
</w:tr>`;
                    }).join("");

                    body += `<w:tbl>
  <w:tblPr>
    <w:tblW w:w="${total}" w:type="dxa"/>
    <w:tblLayout w:type="fixed"/>
    <w:tblCellMar>
      <w:top w:w="0" w:type="dxa"/>
      <w:bottom w:w="0" w:type="dxa"/>
    </w:tblCellMar>
  </w:tblPr>
  <w:tblGrid>
    ${W.map(w => `<w:gridCol w:w="${w}"/>`).join("")}
  </w:tblGrid>
  ${cabeceraFila}
  ${filasAlumnos}
</w:tbl>`;

                    body += `<w:p>
  <w:pPr><w:spacing w:before="300" w:after="60"/></w:pPr>
  <w:r><w:rPr><w:b/><w:sz w:val="18"/></w:rPr><w:t>Leyenda:</w:t></w:r>
</w:p>`;

                    const leyendas = [
                        ["Sin campos", "Días con horas registradas pero sin texto en descripción/orientaciones/observaciones."],
                        ["Repetidos", `Días cuya descripción es idéntica o muy similar (>${Math.round(UMBRAL_SIMILITUD * 100)}%) a otro día del mismo alumno.`],
                        ["Texto corto", `Días con descripción de menos de ${UMBRAL_TEXTO_CORTO} caracteres.`]
                    ];

                    leyendas.forEach(([lbl, txt]) => {
                        body += `<w:p>
  <w:pPr>
    <w:spacing w:before="40" w:after="40"/>
    <w:ind w:left="440"/>
  </w:pPr>
  <w:r>
    <w:rPr><w:b/><w:sz w:val="18"/></w:rPr>
    <w:t xml:space="preserve">${xe(lbl)}: </w:t>
  </w:r>
  <w:r>
    <w:rPr><w:sz w:val="18"/></w:rPr>
    <w:t>${xe(txt)}</w:t>
  </w:r>
</w:p>`;
                    });

                    body += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

                    return body;
                }

                function buildAlumnos(datos) {
                    let body = "";

                    datos.forEach((al, idx) => {
                        const horas = al.horas || calcHorasDiario(al);

                        body += `<w:p><w:pPr><w:pStyle w:val="H1"/></w:pPr><w:r><w:t>${xe(al.nombre)}</w:t></w:r></w:p>`;
                        body += `<w:p><w:pPr><w:spacing w:after="200"/></w:pPr>
<w:r><w:rPr><w:b/><w:color w:val="444444"/></w:rPr><w:t xml:space="preserve">Horas realizadas: </w:t></w:r>
<w:r><w:t xml:space="preserve">${xe(horas)}</w:t></w:r>
<w:r><w:rPr><w:color w:val="999999"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">   (idFct: ${xe(al.idFct)})</w:t></w:r></w:p>`;

                        if (!al.semanas.length) {
                            body += `<w:p><w:r><w:rPr><w:i/><w:color w:val="888888"/></w:rPr><w:t>Sin entradas registradas en el diario.</w:t></w:r></w:p>`;
                        }

                        al.semanas.forEach(sem => {
                            body += `<w:p><w:pPr><w:pStyle w:val="H2"/></w:pPr><w:r><w:t>${xe(sem.label)}</w:t></w:r></w:p>`;

                            sem.dias.forEach(dia => {
                                body += `<w:p><w:pPr><w:pStyle w:val="H3"/></w:pPr><w:r><w:t>${xe(dia.titulo)}</w:t></w:r></w:p>`;

                                if (dia.sinCampos) {
                                    body += `<w:p><w:pPr><w:spacing w:before="40" w:after="40"/><w:ind w:left="440"/></w:pPr>
<w:r><w:rPr><w:i/><w:color w:val="CC2200"/><w:sz w:val="20"/></w:rPr>
<w:t xml:space="preserve">⚠ Horas registradas (${xe(dia.horas)}h) pero sin descripción rellenada.</w:t></w:r></w:p>`;
                                    return;
                                }

                                const colorDesc = dia.esRepetido ? "CC6600" : dia.esCorto ? "996600" : "000000";
                                const sufijo = dia.esRepetido ? "  ⚠ texto repetido" : dia.esCorto ? "  ⚠ texto muy corto" : "";

                                [
                                    ["Descripción actividad", dia.descripcion, colorDesc, sufijo],
                                    ["Orientaciones", dia.orientaciones, "000000", ""],
                                    ["Observaciones", dia.observaciones, "000000", ""]
                                ].forEach(([lbl, val, col, suf]) => {
                                    if (!val) return;

                                    body += `<w:p><w:pPr><w:pStyle w:val="Campo"/></w:pPr>
<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${xe(lbl)}: </w:t></w:r>
<w:r><w:rPr><w:color w:val="${col}"/></w:rPr><w:t xml:space="preserve">${xe(val)}</w:t></w:r>
${suf ? `<w:r><w:rPr><w:i/><w:color w:val="${col}"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${xe(suf)}</w:t></w:r>` : ""}
</w:p>`;
                                });

                                body += `<w:p><w:pPr><w:pStyle w:val="Campo"/></w:pPr>
<w:r><w:rPr><w:b/><w:color w:val="555555"/></w:rPr><w:t xml:space="preserve">Horas: </w:t></w:r>
<w:r><w:t>${xe(dia.horas)}</w:t></w:r></w:p>`;
                            });
                        });

                        if (idx < datos.length - 1) {
                            body += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
                        }
                    });

                    return body;
                }

                const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${buildResumen(analisis)}
    ${buildAlumnos(datos)}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>
    </w:sectPr>
  </w:body>
</w:document>`;

                const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>`;

                const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

                const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`;

                const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>`;

                const zip = new JSZip();
                zip.file("[Content_Types].xml", contentTypes);
                zip.file("_rels/.rels", rels);
                zip.file("word/document.xml", documentXml);
                zip.file("word/_rels/document.xml.rels", wordRels);
                zip.file("word/styles.xml", stylesXml);
                zip.file("word/settings.xml", settings);

                log("Iniciando empaquetado final del DOCX...");

                return await zip.generateAsync(
                    {
                        type: "blob",
                        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        compression: "STORE"
                    },
                    metadata => {
                        setEstado(`Generando DOCX... ${Math.round(metadata.percent)}%`);
                    }
                );
            }

            function generarRTF(datos, analisis) {
                log("Generando fallback RTF");

                let rtf = "{\\rtf1\\ansi\\ansicpg1252\\deff0\\deflang3082\n";
                rtf += "{\\fonttbl{\\f0\\fswiss\\fcharset0 Arial;}}\n";
                rtf += "{\\colortbl ;\\red31\\green56\\blue100;\\red46\\green75\\blue140;\\red80\\green80\\blue100;\\red180\\green30\\blue0;\\red160\\green90\\blue0;\\red20\\green120\\blue20;}\n";
                rtf += "\\f0\\fs22\\widowctrl\\hyphauto\n\n";

                rtf += `\\pard\\sb0\\sa200\\qc {\\b\\fs52\\cf1 Resumen FCT}\\par\n`;
                rtf += `\\pard\\sb0\\sa300\\qc {\\fs24\\cf3 Generado el ${rtfEsc(new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" }))}}\\par\n`;
                rtf += `\\pard\\sb100\\sa0 {\\b\\cf1 Alumno/a}\\tab{\\b\\cf1 Horas}\\tab{\\b\\cf1 D\\'edas}\\tab{\\b\\cf1 Sin campos}\\tab{\\b\\cf1 Repetidos}\\tab{\\b\\cf1 Texto corto}\\par\n`;
                rtf += `\\pard\\sb0\\sa0 {\\cf3 ${"─".repeat(80)}}\\par\n`;

                analisis.forEach(a => {
                    const alerta = n => n > 0 ? `{\\b\\cf4 ${n}}` : `{\\cf6 ok}`;
                    rtf += `\\pard\\sb0\\sa0 {${rtfEsc(a.nombre)}}\\tab{${rtfEsc(a.horas)}}\\tab{${a.totalDias}}\\tab${alerta(a.diasSinCampos)}\\tab${alerta(a.diasRepetidos)}\\tab${alerta(a.diasTextoCorto)}\\par\n`;
                });

                rtf += `\\pard\\sb200\\sa200 {\\fs18\\cf3 ${rtfEsc(`Sin campos: días con horas pero sin descripción. Repetidos: descripción similar a otro día. Texto corto: menos de ${UMBRAL_TEXTO_CORTO} caracteres.`)}}\\par\n`;
                rtf += "\\page\n";

                datos.forEach((al, idx) => {
                    const horas = al.horas || calcHorasDiario(al);

                    rtf += `\\pard\\sb0\\sa160\\brdrb\\brdrs\\brdrw10\\brdrcf1 {\\b\\fs40\\cf1 ${rtfEsc(al.nombre)}}\\par\n`;
                    rtf += `\\pard\\sb0\\sa200 {\\b\\cf3 Horas realizadas: }{${rtfEsc(horas)}}  {\\fs18\\cf3 (idFct: ${al.idFct})}\\par\n`;

                    if (!al.semanas.length) {
                        rtf += `\\pard\\sb0\\sa100 {\\i\\cf3 Sin entradas registradas.}\\par\n`;
                    }

                    al.semanas.forEach(sem => {
                        rtf += `\\pard\\sb200\\sa80 {\\b\\fs26\\cf2 ${rtfEsc(sem.label)}}\\par\n`;

                        sem.dias.forEach(dia => {
                            rtf += `\\pard\\sb140\\sa60 {\\b\\i\\cf3 ${rtfEsc(dia.titulo)}}\\par\n`;

                            if (dia.sinCampos) {
                                rtf += `\\pard\\sb40\\sa40\\li440 {\\i\\cf4 ${rtfEsc(`Horas registradas (${dia.horas}h) pero sin descripción.`)}}\\par\n`;
                                return;
                            }

                            const colDesc = dia.esRepetido ? "\\cf4" : dia.esCorto ? "\\cf5" : "";
                            const sufDesc = dia.esRepetido ? "  {\\i\\cf4 texto repetido}" : dia.esCorto ? "  {\\i\\cf5 texto corto}" : "";

                            [
                                ["Descripción actividad", dia.descripcion, colDesc, sufDesc],
                                ["Orientaciones", dia.orientaciones, "", ""],
                                ["Observaciones", dia.observaciones, "", ""]
                            ].forEach(([lbl, val, col, suf]) => {
                                if (!val) return;
                                rtf += `\\pard\\sb40\\sa40\\li440 {\\b ${lbl}: }{${col}${rtfEsc(val)}}${suf}\\par\n`;
                            });

                            rtf += `\\pard\\sb40\\sa40\\li440 {\\b\\cf3 Horas: }{${rtfEsc(dia.horas || "—")}}\\par\n`;
                        });
                    });

                    if (idx < datos.length - 1) rtf += "\\page\n";
                });

                rtf += "}";
                return new Blob([rtf], { type: "application/rtf" });
            }

            const fecha = new Date().toISOString().slice(0, 10);

            log("Intentando generar DOCX");

            try {
                const blob = await generarDocx(datos, analisis);
                descargar(blob, `diarios_fct_${fecha}.docx`);
                log(`DOCX descargado: diarios_fct_${fecha}.docx`);
                setEstado(`Completado. Alumnos: ${datos.length} | Formato: DOCX`);
            } catch (e) {
                warn("Fallo al generar DOCX, pasando a RTF");
                const blob = generarRTF(datos, analisis);
                descargar(blob, `diarios_fct_${fecha}.rtf`);
                log(`RTF descargado: diarios_fct_${fecha}.rtf`);
                setEstado(`Completado. Alumnos: ${datos.length} | Formato: RTF`);
            }
        } finally {
            ejecutando = false;
        }
    }

    function init() {
        crearBoton();
    }

    window.addEventListener("load", init);
    setTimeout(init, 1500);
})();
