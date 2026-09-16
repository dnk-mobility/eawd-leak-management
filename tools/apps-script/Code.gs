/**
 * 마스터 샘플 누설값 트렌드 — 구글시트 저장 서버 (Google Apps Script)
 * =====================================================================
 * 이 파일은 저장소에 보관용으로 두는 "원본"입니다. 실제로는 구글 스프레드시트의
 * [확장 프로그램] → [Apps Script] 편집기에 이 내용을 그대로 붙여넣고 배포합니다.
 * 설정 절차는 `구글시트_연동_설정방법.md` 참고.
 *
 * 하는 일
 *   - 작업자 폰(leak-sync.js)이 보내온 점검 기록을 구글 스프레드시트에 저장
 *   - 폰이 요청하면 해당 설비·해당 월의 기록을 돌려줌
 *   → 그래서 작업자 A의 폰에서 넣은 값이 작업자 B의 폰에서도 보임
 *
 * 통신 방식 (JSONP)
 *   브라우저가 다른 도메인(script.google.com)으로 직접 요청하면 CORS 정책에
 *   막히는 경우가 있어, <script> 태그로 불러오는 JSONP 방식을 씁니다.
 *   그래서 쓰기도 GET(URL 파라미터)으로 받습니다. 기록 1건이 1KB 이하라
 *   URL 길이 제한(약 8,000자)에 걸리지 않습니다.
 *
 * 보안 수준
 *   TOKEN 문자열 하나로만 구분합니다. 사이트의 접속 암호와 같은 성격의
 *   "간이 구분"이며 실제 보안 장치가 아닙니다 (PROJECT_OVERVIEW.md §8과 동일한
 *   트레이드오프). 배포 URL과 TOKEN을 아는 사람은 읽고 쓸 수 있습니다.
 */

/** leak-sync.js 의 TOKEN 과 반드시 같은 값이어야 합니다. 둘 다 바꾸세요. */
var TOKEN = 'dnk-leak-2026';

var SHEET_RECS = '기록';
var SHEET_SAMPLES = '마스터샘플';

var REC_HEAD = ['공정No.', '일자', '교대', '기록ID', '샘플ID', '샘플명', '구분',
                '누설값', '고유지정값', '하한값', '상한값', '판정',
                '설비주변온도', '확인자', '비고', '수정시각'];
var SAM_HEAD = ['공정No.', '샘플ID', '샘플명', '구분', '고유지정값', '하한값', '상한값',
                '수정시각', '삭제'];

/* =========================================================================
   진입점
   ========================================================================= */

function doGet(e) { return handle(e); }
function doPost(e) { return handle(e); }

function handle(e) {
  var p = (e && e.parameter) || {};
  var out;
  try {
    if (p.t !== TOKEN) throw new Error('토큰이 올바르지 않습니다');
    switch (p.action) {
      case 'ping':
        out = { ok: true, data: { ver: 1, time: nowStr() } };
        break;
      case 'pull':
        out = { ok: true, data: pull(String(p.eq || ''), String(p.ym || '')) };
        break;
      case 'push':
        out = { ok: true, data: push(JSON.parse(p.data)) };
        break;
      case 'samples':
        out = { ok: true, data: saveSamples(JSON.parse(p.data)) };
        break;
      case 'wipe':
        out = { ok: true, data: wipe(String(p.eq || '')) };
        break;
      default:
        throw new Error('알 수 없는 요청: ' + p.action);
    }
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return reply(out, p.callback);
}

function reply(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/* =========================================================================
   시트 준비
   ========================================================================= */

function sheet(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
    // 일자가 날짜 서식으로 자동 변환되면 "2026-09-15"가 숫자로 바뀌므로 텍스트 고정
    sh.getRange(2, 1, sh.getMaxRows() - 1, head.length).setNumberFormat('@');
  }
  return sh;
}

function recSheet() { return sheet(SHEET_RECS, REC_HEAD); }
function samSheet() { return sheet(SHEET_SAMPLES, SAM_HEAD); }

function nowStr() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ss");
}

/** 시트 값이 Date로 읽혀도 "YYYY-MM-DD" 문자열로 되돌린다 */
function asText(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v).trim();
}

/** 빈칸은 null, 숫자는 숫자로 */
function asNum(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

/* =========================================================================
   읽기 — 설비 1개소의 마스터 샘플 정의 + 지정한 달의 기록
   ========================================================================= */

function pull(eq, ym) {
  var out = { eq: eq, ym: ym, samples: [], recs: [], time: nowStr() };
  if (!eq) throw new Error('공정No.가 비어 있습니다');

  // --- 마스터 샘플 정의 ---
  var sam = samSheet();
  var svals = sam.getDataRange().getValues();
  for (var i = 1; i < svals.length; i++) {
    var r = svals[i];
    if (asText(r[0]) !== eq) continue;
    if (asText(r[8]) === 'Y') continue;           // 삭제 표시된 행은 건너뜀
    out.samples.push({
      id: asText(r[1]), name: asText(r[2]), type: asText(r[3]) === 'NG' ? 'NG' : 'OK',
      nominal: asNum(r[4]), lsl: asNum(r[5]), usl: asNum(r[6])
    });
  }

  // --- 기록 (기록ID 단위로 묶음) ---
  var rec = recSheet();
  var rvals = rec.getDataRange().getValues();
  var byId = {};
  var order = [];
  for (var j = 1; j < rvals.length; j++) {
    var v = rvals[j];
    if (asText(v[0]) !== eq) continue;
    var date = asText(v[1]);
    if (ym && date.slice(0, 7) !== ym) continue;

    var id = asText(v[3]);
    if (!byId[id]) {
      byId[id] = {
        id: id, date: date, shift: asText(v[2]),
        temp: asNum(v[12]), by: asText(v[13]), note: asText(v[14]),
        ts: asText(v[15]), items: []
      };
      order.push(id);
    }
    byId[id].items.push({
      sid: asText(v[4]), name: asText(v[5]), type: asText(v[6]) === 'NG' ? 'NG' : 'OK',
      v: asNum(v[7]), nominal: asNum(v[8]), lsl: asNum(v[9]), usl: asNum(v[10]),
      judge: asText(v[11]) || '-'
    });
  }
  for (var k = 0; k < order.length; k++) out.recs.push(byId[order[k]]);

  return out;
}

/* =========================================================================
   쓰기 — 점검 기록 1건 저장 / 삭제
   payload = { eq, rec:{id,date,shift,temp,by,note,items:[...]}, deleted:true? }
   같은 (설비 + 일자 + 교대) 기록은 1건만 존재하도록 기존 행을 지우고 새로 넣는다.
   ========================================================================= */

function push(payload) {
  var eq = String(payload.eq || '');
  var rec = payload.rec || {};
  if (!eq) throw new Error('공정No.가 비어 있습니다');
  if (!rec.date || !rec.shift) throw new Error('일자·교대가 비어 있습니다');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);                       // 두 사람이 동시에 저장할 때 섞이지 않게
  try {
    var sh = recSheet();
    removeRows(sh, function (v) {
      return asText(v[0]) === eq &&
             (asText(v[3]) === asText(rec.id) ||
              (asText(v[1]) === asText(rec.date) && asText(v[2]) === asText(rec.shift)));
    });

    if (payload.deleted) return { deleted: true };

    var ts = nowStr();
    var rows = [];
    for (var i = 0; i < rec.items.length; i++) {
      var it = rec.items[i];
      if (it.v === null || it.v === undefined || it.v === '') continue;
      rows.push([eq, rec.date, rec.shift, rec.id, it.sid, it.name, it.type,
                 it.v, it.nominal, it.lsl, it.usl, it.judge,
                 rec.temp, rec.by, rec.note, ts]);
    }
    if (rows.length) {
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, REC_HEAD.length).setValues(rows);
    }
    return { saved: rows.length, ts: ts };
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================================
   쓰기 — 설비 1개소의 마스터 샘플 정의 전체 교체
   payload = { eq, samples:[{id,name,type,nominal,lsl,usl}] }
   ========================================================================= */

function saveSamples(payload) {
  var eq = String(payload.eq || '');
  var samples = payload.samples || [];
  if (!eq) throw new Error('공정No.가 비어 있습니다');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = samSheet();
    removeRows(sh, function (v) { return asText(v[0]) === eq; });

    var ts = nowStr();
    var rows = samples.map(function (s) {
      return [eq, s.id, s.name, s.type, s.nominal, s.lsl, s.usl, ts, ''];
    });
    if (rows.length) {
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, SAM_HEAD.length).setValues(rows);
    }
    return { saved: rows.length, ts: ts };
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================================
   쓰기 — 설비 1개소의 기록 전체 삭제 (마스터 샘플 정의는 남긴다)
   ========================================================================= */

function wipe(eq) {
  if (!eq) throw new Error('공정No.가 비어 있습니다');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var n = removeRows(recSheet(), function (v) { return asText(v[0]) === eq; });
    return { deleted: n };
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================================
   공통 — 조건에 맞는 행 삭제 (아래에서 위로 지워야 행 번호가 밀리지 않음)
   ========================================================================= */

function removeRows(sh, match) {
  var vals = sh.getDataRange().getValues();
  var hits = [];
  for (var i = 1; i < vals.length; i++) {
    if (match(vals[i])) hits.push(i + 1);      // 시트 행 번호 = 배열 인덱스 + 1
  }
  for (var j = hits.length - 1; j >= 0; j--) sh.deleteRow(hits[j]);
  return hits.length;
}

/* =========================================================================
   설정 확인용 — Apps Script 편집기에서 직접 실행해 볼 수 있는 함수
   ========================================================================= */

function 설정확인() {
  recSheet();
  samSheet();
  Logger.log('시트 준비 완료: "%s", "%s"', SHEET_RECS, SHEET_SAMPLES);
  Logger.log('TOKEN: %s', TOKEN);
  Logger.log('이 값을 leak-sync.js 의 TOKEN 과 똑같이 맞추세요.');
}
