// ==UserScript==
// @name         SAÓ FCT - Exportar diarios a DOCX
// @namespace    https://tampermonkey.net/
// @version      1.0
// @description  Exporta diarios FCT a DOCX o RTF desde el listado de FCTs
// @match        *://foremp.edu.gva.es/*
// @author       Manuel Alamar y Roberto Tubilleja
// @grant        none
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
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = nombre;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
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
    <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="0" w:after="160"/></w:pPr>
    <w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="40"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="H2">
    <w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:color w:val="2E4B8C"/><w:sz w:val="26"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="H3">
    <w:name w:val="heading 3"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="140" w:after="60"/></w:pPr>
    <w:rPr><w:b/><w:i/><w:color w:val="333355"/><w:sz w:val="22"/></w:rPr>
  </w:style>
</w:styles>`;

    function buildResumen(analisis) {
        const fecha = new Date().toLocaleDateString("es-ES", {
            year: "numeric",
            month: "long",
            day: "numeric"
        });

        return `
<w:p><w:r><w:t>Resumen FCT</w:t></w:r></w:p>
<w:p><w:r><w:t>Generado el ${xe(fecha)}</w:t></w:r></w:p>
<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
    }

    function buildAlumnos(datos) {
        let body = "";

        datos.forEach((al, idx) => {
            const horas = al.horas || calcHorasDiario(al);

            body += `
<w:p><w:pPr><w:pStyle w:val="H1"/></w:pPr><w:r><w:t>${xe(al.nombre)}</w:t></w:r></w:p>
<w:p><w:r><w:t>Horas realizadas: ${xe(horas)}</w:t></w:r></w:p>`;

            al.semanas.forEach(sem => {
                body += `
<w:p><w:pPr><w:pStyle w:val="H2"/></w:pPr><w:r><w:t>${xe(sem.label)}</w:t></w:r></w:p>`;

                sem.dias.forEach(dia => {
                    body += `
<w:p><w:pPr><w:pStyle w:val="H3"/></w:pPr><w:r><w:t>${xe(dia.titulo)}</w:t></w:r></w:p>`;

                    if (dia.descripcion) {
                        body += `<w:p><w:r><w:t>Descripción: ${xe(dia.descripcion)}</w:t></w:r></w:p>`;
                    }
                    if (dia.orientaciones) {
                        body += `<w:p><w:r><w:t>Orientaciones: ${xe(dia.orientaciones)}</w:t></w:r></w:p>`;
                    }
                    if (dia.observaciones) {
                        body += `<w:p><w:r><w:t>Observaciones: ${xe(dia.observaciones)}</w:t></w:r></w:p>`;
                    }
                    if (dia.horas) {
                        body += `<w:p><w:r><w:t>Horas: ${xe(dia.horas)}</w:t></w:r></w:p>`;
                    }
                });
            });

            if (idx < datos.length - 1) {
                body += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
            }
        });

        return body;
    }

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
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
</Types>`;

    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const zip = new JSZip();
    zip.file("[Content_Types].xml", contentTypes);
    zip.file("_rels/.rels", rels);
    zip.file("word/document.xml", documentXml);
    zip.file("word/_rels/document.xml.rels", wordRels);
    zip.file("word/styles.xml", stylesXml);

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

            function generarRTF(datos) {
                log("Generando fallback RTF");
                let rtf = "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\f0\\fs22\n";
                datos.forEach((al, idx) => {
                    rtf += `\\b ${rtfEsc(al.nombre)}\\b0\\par\n`;
                    rtf += `Horas realizadas: ${rtfEsc(al.horas || "—")}\\par\n`;
                    al.semanas.forEach(sem => {
                        rtf += `\\i ${rtfEsc(sem.label)}\\i0\\par\n`;
                        sem.dias.forEach(dia => {
                            rtf += `${rtfEsc(dia.titulo)}\\par\n`;
                            if (dia.descripcion) rtf += `Descripción: ${rtfEsc(dia.descripcion)}\\par\n`;
                            if (dia.orientaciones) rtf += `Orientaciones: ${rtfEsc(dia.orientaciones)}\\par\n`;
                            if (dia.observaciones) rtf += `Observaciones: ${rtfEsc(dia.observaciones)}\\par\n`;
                            if (dia.horas) rtf += `Horas: ${rtfEsc(dia.horas)}\\par\n`;
                            rtf += `\\par\n`;
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
                const blob = generarRTF(datos);
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
