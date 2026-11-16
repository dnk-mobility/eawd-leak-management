/*
  엑셀(.xlsx) 내보내기 — 그래프 포함 (2026-11-16)
  =========================================================================
  화면의 ② 그래프(OK 마스터·NG 마스터·설비주변온도)를 엑셀 "차트"로 함께 담은 파일을 만든다.
  외부 라이브러리 없이 .xlsx(= zip 안의 XML 묶음)를 직접 만든다 — 앱이 정적 파일만으로
  동작해야 하고, 그래프까지 만들어 주는 가벼운 라이브러리가 없어서다.

  파일 구성
    시트 「그래프」 : 샘플마다 꺾은선 차트 1개 + 설비주변온도 차트 1개 (상·하한선·지정값선 포함)
    시트 「기록」   : 차트가 읽는 표 — 한 행 = 한 번의 점검(일자·교대)
    시트 「상세」   : CSV와 같은 세로형 표(샘플마다 한 줄)

  차트는 「기록」 시트의 셀을 가리키므로, 엑셀에서 값을 고치면 그래프도 같이 바뀐다.
  글자 칸은 전부 "문자열"로 저장돼 CSV처럼 "=…" 가 수식으로 실행되는 일이 없다.

  사용: window.dnkXlsx.build(model) → Blob
  model = {
    title, unit,
    samples: [{ id, name, type, nominal, lsl, usl }],
    temp: { nominal, lsl, usl },               // 온도 스펙(없으면 값 null)
    recs: [{ date, shift, temp, by, note, items: [{ sid, v, judge }] }]
  }
*/
(function () {
  "use strict";

  /* ---------- zip (무압축 저장) ---------- */
  var CRC = (function () {
    var t = [], c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function u16(v) { return [v & 255, (v >>> 8) & 255]; }
  function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }

  function zip(files) {                       // files: [{ name, data: string }]
    var enc = new TextEncoder();
    var chunks = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      var head = [0x50, 0x4B, 3, 4].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x21),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      chunks.push(new Uint8Array(head), name, data);
      central.push({ name: name, crc: crc, size: data.length, offset: offset });
      offset += head.length + name.length + data.length;
    });
    var cdStart = offset, cdSize = 0;
    central.forEach(function (c) {
      var rec = [0x50, 0x4B, 1, 2].concat(u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21),
        u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset));
      chunks.push(new Uint8Array(rec), c.name);
      cdSize += rec.length + c.name.length;
    });
    chunks.push(new Uint8Array([0x50, 0x4B, 5, 6].concat(u16(0), u16(0), u16(central.length), u16(central.length), u32(cdSize), u32(cdStart), u16(0))));
    return new Blob(chunks, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  /* ---------- XML 도우미 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; })
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  }
  function colName(i) {                       // 0 → A
    var s = "";
    for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }
  function cellStr(r, c, text, style) {
    return '<c r="' + colName(c) + r + '" t="inlineStr"' + (style ? ' s="' + style + '"' : "") +
      '><is><t xml:space="preserve">' + esc(text) + "</t></is></c>";
  }
  function cellNum(r, c, v, style) {
    return '<c r="' + colName(c) + r + '"' + (style ? ' s="' + style + '"' : "") + "><v>" + v + "</v></c>";
  }
  function isNum(v) { return typeof v === "number" && isFinite(v); }

  var NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  var NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  var HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  // 스타일 번호: 1=머리글(흰 글씨·남색), 2=NG(빨강 굵게), 3=큰 제목
  var STYLES = HEAD + '<styleSheet xmlns="' + NS_MAIN + '">' +
    '<fonts count="4">' +
      '<font><sz val="11"/><name val="Malgun Gothic"/><family val="2"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Malgun Gothic"/><family val="2"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFB8453A"/><name val="Malgun Gothic"/><family val="2"/></font>' +
      '<font><b/><sz val="14"/><color rgb="FF1B4A49"/><name val="Malgun Gothic"/><family val="2"/></font>' +
    "</fonts>" +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF1B4A49"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    "</cellXfs>" +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function sheetXml(rows, widths, extra) {
    var cols = widths ? "<cols>" + widths.map(function (w, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
    }).join("") + "</cols>" : "";
    return HEAD + '<worksheet xmlns="' + NS_MAIN + '" xmlns:r="' + NS_R + '">' + cols +
      "<sheetData>" + rows.join("") + "</sheetData>" + (extra || "") + "</worksheet>";
  }

  /* ---------- 차트 ---------- */
  function ref(sheet, col, r1, r2) {
    return "'" + sheet + "'!$" + colName(col) + "$" + r1 + ":$" + colName(col) + "$" + r2;
  }
  function lineSer(idx, sheetName, nameCol, valCol, catCol, r1, r2, o) {
    var ln = '<a:ln w="' + (o.w || 22225) + '" cap="rnd"><a:solidFill><a:srgbClr val="' + o.color + '"/></a:solidFill>' +
      (o.dash ? '<a:prstDash val="' + o.dash + '"/>' : "") + '<a:round/></a:ln>';
    var marker = o.marker
      ? '<c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="' + o.color + '"/></a:solidFill>' +
        '<a:ln w="9525"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:marker>'
      : '<c:marker><c:symbol val="none"/></c:marker>';
    return '<c:ser><c:idx val="' + idx + '"/><c:order val="' + idx + '"/>' +
      '<c:tx><c:strRef><c:f>' + esc("'" + sheetName + "'!$" + colName(nameCol) + "$1") + "</c:f></c:strRef></c:tx>" +
      "<c:spPr>" + ln + "</c:spPr>" + marker +
      "<c:cat><c:strRef><c:f>" + esc(ref(sheetName, catCol, r1, r2)) + "</c:f></c:strRef></c:cat>" +
      "<c:val><c:numRef><c:f>" + esc(ref(sheetName, valCol, r1, r2)) + "</c:f></c:numRef></c:val>" +
      '<c:smooth val="0"/></c:ser>';
  }
  function axTitle(text, rot) {
    return '<c:title><c:tx><c:rich><a:bodyPr' + (rot ? ' rot="-5400000" vert="horz"' : "") + "/><a:lstStyle/><a:p><a:pPr><a:defRPr sz=\"900\" b=\"0\"/></a:pPr><a:r><a:rPr lang=\"ko-KR\" sz=\"900\" b=\"0\"/><a:t>" +
      esc(text) + "</a:t></a:r></a:p></c:rich></c:tx><c:overlay val=\"0\"/></c:title>";
  }
  function chartXml(title, series, yTitle) {
    return HEAD + '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ' +
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="' + NS_R + '">' +
      '<c:roundedCorners val="0"/><c:chart>' +
      '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="ko-KR" sz="1200" b="1"/><a:t>' +
        esc(title) + "</a:t></a:r></a:p></c:rich></c:tx><c:overlay val=\"0\"/></c:title>" +
      '<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>' +
      '<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>' + series.join("") +
      '<c:marker val="1"/><c:axId val="111111"/><c:axId val="222222"/></c:lineChart>' +
      '<c:catAx><c:axId val="111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>' +
        axTitle("일자 (주·야간)", false) +
        '<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
        '<c:txPr><a:bodyPr rot="-2700000" vert="horz"/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="800"/></a:pPr><a:endParaRPr lang="ko-KR"/></a:p></c:txPr>' +
        '<c:crossAx val="222222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>' +
      '<c:valAx><c:axId val="222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>' +
        '<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="DED5C3"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>' +
        axTitle(yTitle, true) +
        '<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
        '<c:crossAx val="111111"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>' +
      '</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>' +
      "</c:chart></c:chartSpace>";
  }
  function anchorXml(n, r1, r2, rId) {
    return "<xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>" + r1 + "</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>" +
      "<xdr:to><xdr:col>12</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>" + r2 + "</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>" +
      '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + (n + 1) + '" name="그래프 ' + n + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>' +
      '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">' +
      '<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="' + rId + '"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>';
  }

  /* ---------- 본체 ---------- */
  function build(m) {
    var recs = m.recs.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.shift === b.shift ? 0 : a.shift === "야간" ? 1 : -1;
    });
    var unit = m.unit || "mL/min";
    var DATA = "기록", DETAIL = "상세", GRAPH = "그래프";

    /* 「기록」 표 — 열 배치: 일자, 교대, 표시(가로축), [샘플마다: 값·판정·하한·상한·지정값], [온도: 값·하한·상한·지정값], 확인자, 비고 */
    var head = ["일자", "교대", "가로축 표시"];
    var colOf = {};                                   // sid → { v, j, lo, hi, nom }
    m.samples.forEach(function (s) {
      var c0 = head.length;
      colOf[s.id] = { v: c0, j: c0 + 1, lo: c0 + 2, hi: c0 + 3, nom: c0 + 4 };
      head.push(s.name + " (" + unit + ")", s.name + " 판정", s.name + " 하한", s.name + " 상한", s.name + " 지정값");
    });
    var tc0 = head.length;
    var tcol = { v: tc0, lo: tc0 + 1, hi: tc0 + 2, nom: tc0 + 3 };
    head.push("설비주변온도 (℃)", "온도 하한", "온도 상한", "온도 지정값", "확인자", "비고");
    var byCol = tc0 + 4, noteCol = tc0 + 5;

    var ts = m.temp || {};
    var rows = [];
    rows.push('<row r="1" ht="32" customHeight="1">' + head.map(function (h, i) { return cellStr(1, i, h, 1); }).join("") + "</row>");
    recs.forEach(function (r, ri) {
      var R = ri + 2, cells = [];
      var d = r.date.slice(5);
      cells.push(cellStr(R, 0, r.date), cellStr(R, 1, r.shift), cellStr(R, 2, d + (r.shift === "야간" ? " 야" : " 주")));
      m.samples.forEach(function (s) {
        var it = null;
        for (var i = 0; i < r.items.length; i++) if (r.items[i].sid === s.id) { it = r.items[i]; break; }
        var c = colOf[s.id], has = it && isNum(it.v);
        if (has) cells.push(cellNum(R, c.v, it.v, it.judge === "NG" ? 2 : 0));
        if (has && it.judge) cells.push(cellStr(R, c.j, it.judge, it.judge === "NG" ? 2 : 0));
        if (has) {
          if (isNum(s.lsl)) cells.push(cellNum(R, c.lo, s.lsl));
          if (isNum(s.usl)) cells.push(cellNum(R, c.hi, s.usl));
          if (isNum(s.nominal)) cells.push(cellNum(R, c.nom, s.nominal));
        }
      });
      if (isNum(r.temp)) {
        var tOut = (isNum(ts.lsl) && r.temp < ts.lsl) || (isNum(ts.usl) && r.temp > ts.usl);
        cells.push(cellNum(R, tcol.v, r.temp, tOut ? 2 : 0));
        if (isNum(ts.lsl)) cells.push(cellNum(R, tcol.lo, ts.lsl));
        if (isNum(ts.usl)) cells.push(cellNum(R, tcol.hi, ts.usl));
        if (isNum(ts.nominal)) cells.push(cellNum(R, tcol.nom, ts.nominal));
      }
      if (r.by) cells.push(cellStr(R, byCol, r.by));
      if (r.note) cells.push(cellStr(R, noteCol, r.note));
      cells.sort(function (a, b) {                       // 열 순서대로 (엑셀 규칙)
        return colIndex(a) - colIndex(b);
      });
      rows.push('<row r="' + R + '">' + cells.join("") + "</row>");
    });
    var last = recs.length + 1;
    var dataWidths = head.map(function (h, i) { return i < 3 ? 12 : (i === noteCol ? 30 : 14); });

    /* 「상세」 표 (CSV와 같은 모양) */
    var dHead = ["공정No.", "설비명", "일자", "교대", "샘플명", "구분", "고유지정값", "하한값", "상한값", "누설값(" + unit + ")", "판정", "설비주변온도(℃)", "확인자", "비고"];
    var dRows = ['<row r="1" ht="28" customHeight="1">' + dHead.map(function (h, i) { return cellStr(1, i, h, 1); }).join("") + "</row>"];
    var dr = 1;
    recs.forEach(function (r) {
      r.items.forEach(function (it) {
        if (!isNum(it.v)) return;
        var s = null;
        for (var i = 0; i < m.samples.length; i++) if (m.samples[i].id === it.sid) s = m.samples[i];
        dr++;
        var cs = [cellStr(dr, 0, m.eqId || ""), cellStr(dr, 1, m.eqTitle || ""), cellStr(dr, 2, r.date), cellStr(dr, 3, r.shift),
          cellStr(dr, 4, s ? s.name : ""), cellStr(dr, 5, s ? s.type : "")];
        if (s && isNum(s.nominal)) cs.push(cellNum(dr, 6, s.nominal));
        if (s && isNum(s.lsl)) cs.push(cellNum(dr, 7, s.lsl));
        if (s && isNum(s.usl)) cs.push(cellNum(dr, 8, s.usl));
        cs.push(cellNum(dr, 9, it.v, it.judge === "NG" ? 2 : 0));
        if (it.judge) cs.push(cellStr(dr, 10, it.judge, it.judge === "NG" ? 2 : 0));
        if (isNum(r.temp)) cs.push(cellNum(dr, 11, r.temp));
        if (r.by) cs.push(cellStr(dr, 12, r.by));
        if (r.note) cs.push(cellStr(dr, 13, r.note));
        dRows.push('<row r="' + dr + '">' + cs.join("") + "</row>");
      });
    });

    /* 「그래프」 시트와 차트들 */
    var charts = [];                                    // { title, xml }
    var catCol = 2;
    function addSampleChart(s) {
      var c = colOf[s.id], ser = [], k = 0;
      ser.push(lineSer(k++, DATA, c.v, c.v, catCol, 2, last, { color: "2F6E6C", marker: true }));
      if (isNum(s.usl)) ser.push(lineSer(k++, DATA, c.hi, c.hi, catCol, 2, last, { color: "B8453A", dash: "dash", w: 15875 }));
      if (isNum(s.lsl)) ser.push(lineSer(k++, DATA, c.lo, c.lo, catCol, 2, last, { color: "B8453A", dash: "dash", w: 15875 }));
      if (isNum(s.nominal)) ser.push(lineSer(k++, DATA, c.nom, c.nom, catCol, 2, last, { color: "8A8071", dash: "sysDot", w: 15875 }));
      charts.push({ title: (m.eqTitle || "") + " — " + s.name + "(" + s.type + ") 누설값 추이", xml: chartXml((m.eqTitle || "") + " — " + s.name + "(" + s.type + ") 누설값 추이", ser, unit) });
    }
    m.samples.forEach(addSampleChart);
    if (recs.some(function (r) { return isNum(r.temp); })) {
      var tser = [], k2 = 0;
      tser.push(lineSer(k2++, DATA, tcol.v, tcol.v, catCol, 2, last, { color: "8A6D3B", marker: true }));
      if (isNum(ts.usl)) tser.push(lineSer(k2++, DATA, tcol.hi, tcol.hi, catCol, 2, last, { color: "B8453A", dash: "dash", w: 15875 }));
      if (isNum(ts.lsl)) tser.push(lineSer(k2++, DATA, tcol.lo, tcol.lo, catCol, 2, last, { color: "B8453A", dash: "dash", w: 15875 }));
      if (isNum(ts.nominal)) tser.push(lineSer(k2++, DATA, tcol.nom, tcol.nom, catCol, 2, last, { color: "8A8071", dash: "sysDot", w: 15875 }));
      var tTitle = (m.eqTitle || "") + " — 설비주변온도 추이";
      charts.push({ title: tTitle, xml: chartXml(tTitle, tser, "℃") });
    }

    var ROWS_PER = 21;
    var drawing = HEAD + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ' +
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="' + NS_R + '">' +
      charts.map(function (c, i) { return anchorXml(i + 1, 2 + i * ROWS_PER, 2 + i * ROWS_PER + ROWS_PER - 1, "rId" + (i + 1)); }).join("") + "</xdr:wsDr>";
    var drawingRels = HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      charts.map(function (c, i) {
        return '<Relationship Id="rId' + (i + 1) + '" Type="' + NS_R + '/chart" Target="../charts/chart' + (i + 1) + '.xml"/>';
      }).join("") + "</Relationships>";

    var graphSheet = sheetXml(
      ['<row r="1" ht="24" customHeight="1">' + cellStr(1, 0, (m.title || "마스터 샘플 누설값 그래프") + " · 내보낸 날 " + (m.exportedAt || ""), 3) + "</row>"],
      [14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14],
      '<drawing r:id="rId1"/>');

    var files = [
      { name: "[Content_Types].xml", data: HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        [1, 2, 3].map(function (n) { return '<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("") +
        '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' +
        charts.map(function (c, i) { return '<Override PartName="/xl/charts/chart' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>'; }).join("") +
        "</Types>" },
      { name: "_rels/.rels", data: HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="' + NS_R + '/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: "xl/workbook.xml", data: HEAD + '<workbook xmlns="' + NS_MAIN + '" xmlns:r="' + NS_R + '"><bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
        '<sheet name="' + GRAPH + '" sheetId="1" r:id="rId1"/><sheet name="' + DATA + '" sheetId="2" r:id="rId2"/><sheet name="' + DETAIL + '" sheetId="3" r:id="rId3"/></sheets></workbook>' },
      { name: "xl/_rels/workbook.xml.rels", data: HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        [1, 2, 3].map(function (n) { return '<Relationship Id="rId' + n + '" Type="' + NS_R + '/worksheet" Target="worksheets/sheet' + n + '.xml"/>'; }).join("") +
        '<Relationship Id="rId4" Type="' + NS_R + '/styles" Target="styles.xml"/></Relationships>' },
      { name: "xl/styles.xml", data: STYLES },
      { name: "xl/worksheets/sheet1.xml", data: graphSheet },
      { name: "xl/worksheets/_rels/sheet1.xml.rels", data: HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="' + NS_R + '/drawing" Target="../drawings/drawing1.xml"/></Relationships>' },
      { name: "xl/worksheets/sheet2.xml", data: sheetXml(rows, dataWidths) },
      { name: "xl/worksheets/sheet3.xml", data: sheetXml(dRows, [9, 26, 12, 8, 16, 7, 11, 9, 9, 14, 7, 14, 10, 30]) },
      { name: "xl/drawings/drawing1.xml", data: drawing },
      { name: "xl/drawings/_rels/drawing1.xml.rels", data: drawingRels }
    ];
    charts.forEach(function (c, i) { files.push({ name: "xl/charts/chart" + (i + 1) + ".xml", data: c.xml }); });
    return zip(files);
  }

  function colIndex(cellXml) {                         // '<c r="AB3" …' → 열 번호
    var m = /r="([A-Z]+)\d+"/.exec(cellXml)[1], n = 0;
    for (var i = 0; i < m.length; i++) n = n * 26 + (m.charCodeAt(i) - 64);
    return n;
  }

  if (typeof window !== "undefined") window.dnkXlsx = { build: build };
  if (typeof module !== "undefined" && module.exports) module.exports = { build: build, zip: zip };
})();
