/*
  마스터 샘플 누설값 트렌드 — 구글시트 동기화 (leak-master-trend.html 전용)
  =========================================================================
  작업자마다 폰이 달라도 같은 데이터를 보게 하려고, 입력한 기록을 구글 스프레드시트에
  올리고 내려받는 부분입니다. 서버 쪽 코드는 `tools/apps-script/Code.gs` 이며,
  설정 절차는 `구글시트_연동_설정방법.md` 를 따라 한 번만 하면 됩니다.

  [동작 원칙]
  - 저장은 항상 폰에 먼저 합니다 (오프라인·전파 불량에서도 입력이 막히지 않게).
    그 다음 구글시트로 보내고, 실패하면 "미전송"으로 쌓아 뒀다가 다음 기회에 자동 재전송합니다.
  - 화면을 열거나 달을 바꾸면 그 달치를 구글시트에서 내려받아 폰 데이터를 갱신합니다.

  [주소를 넣는 곳 — 두 가지]
  1. 아래 URL 상수 : 여기에 넣고 push 하면 그 뒤로 **모든 폰이 자동으로** 공유됩니다.
                     실제 운영은 반드시 이 방법을 씁니다.
  2. 페이지 ⑤ 화면 : 그 폰에만 임시로 적용됩니다 (localStorage). 처음 연결 시험용.

  [통신 방식]
  구글 Apps Script 주소로 브라우저가 직접 fetch 하면 CORS 정책에 막히는 경우가 있어,
  <script> 태그로 불러오는 JSONP 방식을 씁니다. 그래서 저장도 GET(URL 파라미터)입니다.
  기록 1건이 1KB 이하라 URL 길이 제한(약 8,000자)에 걸리지 않습니다.
*/
(function () {
  "use strict";

  /* ▼▼▼ 설정 — 구글시트 연동 후 이 두 줄만 채워서 push 하면 됩니다 ▼▼▼ */

  // Apps Script "웹 앱" 배포 주소 (https://script.google.com/macros/s/..../exec)
  var URL = "https://script.google.com/macros/s/AKfycby6xYrIG3Ff4b52FKutqh7HAAXjAj69c7fe8mWKTLdJpzxWPBqVuFSirIl0ojTdhrac/exec";

  // tools/apps-script/Code.gs 의 TOKEN 과 반드시 같은 값
  var TOKEN = "dnk-leak-2026";

  /* ▲▲▲ 여기까지 ▲▲▲ */

  var URL_KEY = "dnk_sync_url";        // 이 폰에만 적용되는 임시 주소 (시험용)
  var QUEUE_KEY = "dnk_sync_queue_v1"; // 아직 못 보낸 기록
  var TIMEOUT_MS = 25000;

  var seq = 0;

  /* ===== 주소 ===== */

  function getUrl() {
    if (URL) return URL;
    try { return localStorage.getItem(URL_KEY) || ""; } catch (e) { return ""; }
  }

  function setUrl(u) {
    u = (u || "").trim();
    try {
      if (u) localStorage.setItem(URL_KEY, u);
      else localStorage.removeItem(URL_KEY);
    } catch (e) {}
  }

  // 코드에 박아 넣은 주소가 있으면 그것이 우선 (폰마다 다른 주소를 보는 사고 방지)
  function urlIsFixed() { return !!URL; }

  function enabled() { return !!getUrl(); }

  /* ===== JSONP 요청 ===== */

  function call(params) {
    var base = getUrl();
    return new Promise(function (resolve, reject) {
      if (!base) { reject(new Error("연동 주소가 설정되지 않았습니다")); return; }

      var cb = "dnkSyncCb" + (++seq) + "_" + Date.now().toString(36);
      var script = document.createElement("script");
      var done = false;

      var timer = setTimeout(function () {
        finish(function () { reject(new Error("응답 시간 초과 — 통신 상태를 확인하세요")); });
      }, TIMEOUT_MS);

      function finish(fn) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
        fn();
      }

      window[cb] = function (res) {
        finish(function () {
          if (res && res.ok) resolve(res.data);
          else reject(new Error((res && res.error) || "서버가 오류를 반환했습니다"));
        });
      };

      script.onerror = function () {
        finish(function () { reject(new Error("연결 실패 — 주소가 맞는지, 인터넷이 되는지 확인하세요")); });
      };

      var q = ["t=" + encodeURIComponent(TOKEN), "callback=" + cb];
      for (var k in params) {
        if (Object.prototype.hasOwnProperty.call(params, k) && params[k] !== undefined) {
          q.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k]));
        }
      }
      script.src = base + (base.indexOf("?") < 0 ? "?" : "&") + q.join("&");
      document.head.appendChild(script);
    });
  }

  /* ===== 미전송 대기열 ===== */

  function queueRead() {
    try {
      var raw = localStorage.getItem(QUEUE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function queueWrite(arr) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  function queueAdd(job) {
    var arr = queueRead();
    // 같은 대상에 대한 이전 대기 건은 버린다 (마지막 것만 보내면 충분)
    arr = arr.filter(function (j) { return j.key !== job.key; });
    arr.push(job);
    queueWrite(arr);
  }

  function queueSize() { return queueRead().length; }

  // 쌓인 것을 앞에서부터 순서대로 보낸다. 하나라도 실패하면 거기서 멈춘다
  // (순서가 뒤바뀌면 오래된 값이 최신 값을 덮어쓸 수 있으므로).
  function flush() {
    var arr = queueRead();
    if (!arr.length || !enabled()) return Promise.resolve({ sent: 0, left: arr.length });

    var sent = 0;
    function step() {
      var cur = queueRead();
      if (!cur.length) return Promise.resolve({ sent: sent, left: 0 });
      var job = cur[0];
      return call(job.params).then(function () {
        sent++;
        var rest = queueRead();
        rest.shift();
        queueWrite(rest);
        return step();
      }, function (err) {
        return { sent: sent, left: queueRead().length, error: err.message };
      });
    }
    return step();
  }


  /* ===== 새 서버로 이사 시 1회 전체 업로드 (2026-11-19) =====
     서버 주소가 바뀌면 새 시트는 비어 있다. 그대로 "서버가 정답"으로 내려받으면 이 폰의
     기록이 지워지므로, 새 주소를 처음 쓰는 폰은 가진 것을 전부 미전송 대기열에 넣어 둔다.
     대기열은 내려받기보다 먼저 비워지고(미전송이 남으면 pull 안 함), 서버 쪽 push 는
     같은 날짜·교대면 덮어쓰기라 여러 폰이 같은 걸 올려도 중복되지 않는다. */
  function migrationFlagKey() { return "dnk_migrated_" + getUrl().slice(-24); }

  function migrateNeeded() {
    if (!enabled()) return false;
    try { return !localStorage.getItem(migrationFlagKey()); } catch (e) { return false; }
  }

  function fillKey() { return "dnk_migfill_" + getUrl().slice(-24); }

  // 기본값 그대로가 아닌(스펙·QR·폐기 등을 손본) 샘플이 있는가 — 기본 샘플은 올릴 가치가 없고
  // 올리면 오히려 서버의 진짜 스펙을 덮어쓴다.
  function hasCustomSpec(samples) {
    return (samples || []).some(function (s) {
      return s.nominal != null || s.lsl != null || s.usl != null || !!s.qrNo || !!s.retired;
    });
  }

  // 첫 내려받기에서 호출: 이 설비의 샘플·앱 설정을 "서버가 비어 있으면 올려도 되는가"
  function fillTake(eq) {
    var res = { samples: false, settings: false };
    try {
      var raw = localStorage.getItem(fillKey());
      if (!raw) return res;
      var m = JSON.parse(raw), i = (m.eqs || []).indexOf(eq);
      if (i >= 0) { res.samples = true; m.eqs.splice(i, 1); }
      if (m.settings) { res.settings = true; m.settings = false; }
      if (m.eqs.length || m.settings) localStorage.setItem(fillKey(), JSON.stringify(m));
      else localStorage.removeItem(fillKey());
    } catch (e) {}
    return res;
  }

  // 새 서버 주소를 처음 쓰는 폰이 가진 기록을 올릴 준비를 한다. 설비마다 서버 전체를 먼저 읽어서
  //  - 서버에 없는 기록, 이 폰 쪽이 더 새로운(ts) 기록, 서버에 없는 보정 이력만 대기열에 넣는다
  //    (여러 폰이 같은 걸 또 올리지 않고, 오래된 폰이 최신 값을 덮어쓰지도 않게).
  // 하나라도 읽기에 실패하면 거부(reject)한다 — 이 경우 호출 쪽은 이번 동기화를 건너뛰어야 한다
  // (서버를 못 읽은 채 내려받기까지 가면 이 폰 기록이 서버 기준으로 교체될 수 있으므로).
  var migrating = null;
  function queueAllFrom(db) {
    if (!migrateNeeded()) return Promise.resolve(0);
    if (migrating) return migrating;
    var ids = Object.keys((db && db.eq) || {}), arr = [], n = 0, fillEqs = [];
    var hasSettings = false, st = (db && db.settings) || {};
    Object.keys(st).forEach(function (k) { if (st[k]) hasSettings = true; });
    function add(key, params) {
      arr.push({ key: key, params: params, at: new Date().toISOString() });
      n++;
    }
    function one(i) {
      if (i >= ids.length) return Promise.resolve();
      var id = ids[i], e = db.eq[id] || {};
      if (!(e.recs && e.recs.length) && !(e.calib && e.calib.length) && !hasCustomSpec(e.samples)) return one(i + 1);
      return pull(id, "").then(function (srv) {
        var byKey = {};
        (srv.recs || []).forEach(function (r) { byKey[r.date + "|" + r.shift] = r; });
        var calKeys = {};
        (srv.calib || []).forEach(function (c) { calKeys[c.id] = true; });
        if (hasCustomSpec(e.samples)) fillEqs.push(id);
        (e.calib || []).forEach(function (it) {
          if (!calKeys[it.id])
            add("calib:" + id + ":" + it.id, { action: "calibPush", data: JSON.stringify({ eq: id, item: it }) });
        });
        (e.recs || []).forEach(function (r) {
          var o = byKey[r.date + "|" + r.shift];
          if (!o || String(r.ts || "") > String(o.ts || ""))
            add("rec:" + id + ":" + r.date + ":" + r.shift, { action: "push", data: JSON.stringify({ eq: id, rec: r }) });
        });
        return one(i + 1);
      });
    }
    migrating = one(0).then(function () {
      var q = queueRead().filter(function (j) {
        return !arr.some(function (a) { return a.key === j.key; });   // 같은 대상의 이전 대기 건은 새 것으로 교체
      }).concat(arr);
      queueWrite(q);
      try { localStorage.setItem(fillKey(), JSON.stringify({ eqs: fillEqs, settings: hasSettings })); } catch (e) {}
      try { localStorage.setItem(migrationFlagKey(), new Date().toISOString()); } catch (e) {}
      migrating = null;
      return n;
    }, function (err) { migrating = null; throw err; });
    return migrating;
  }

  /* ===== 공개 동작 ===== */

  function ping() {
    return call({ action: "ping" });
  }

  function pull(eq, ym) {
    return call({ action: "pull", eq: eq, ym: ym });
  }

  // 저장·삭제·스펙변경 공통 — 보내고, 실패하면 대기열에 넣고 조용히 성공 처리한다
  // (폰에는 이미 저장돼 있으므로 작업자 입장에서 입력은 끝난 것)
  function send(key, params) {
    if (!enabled()) return Promise.resolve({ offline: true });
    return call(params).then(function (data) {
      return { ok: true, data: data };
    }, function (err) {
      queueAdd({ key: key, params: params, at: new Date().toISOString() });
      return { queued: true, error: err.message };
    });
  }

  function pushRecord(eq, rec) {
    return send("rec:" + eq + ":" + rec.date + ":" + rec.shift,
      { action: "push", data: JSON.stringify({ eq: eq, rec: rec }) });
  }

  function deleteRecord(eq, rec) {
    return send("rec:" + eq + ":" + rec.date + ":" + rec.shift,
      { action: "push", data: JSON.stringify({ eq: eq, rec: rec, deleted: true }) });
  }

  function wipe(eq) {
    return send("wipe:" + eq, { action: "wipe", eq: eq });
  }

  function pushSamples(eq, samples) {
    return send("samples:" + eq,
      { action: "samples", data: JSON.stringify({ eq: eq, samples: samples }) });
  }

  // 보정 이력(QR 정보관리 시스템에서 이관, 2026-09-19) — 추가·삭제만 지원
  function pushCalib(eq, item) {
    return send("calib:" + eq + ":" + item.id,
      { action: "calibPush", data: JSON.stringify({ eq: eq, item: item }) });
  }

  function deleteCalib(eq, item) {
    return send("calib:" + eq + ":" + item.id,
      { action: "calibPush", data: JSON.stringify({ eq: eq, item: item, deleted: true }) });
  }

  // 앱 전체 설정 (설비 구분 없음) — 모든 폰이 같은 상태를 보게 하는 값
  function setSetting(key, value) {
    return send("setting:" + key,
      { action: "setting", data: JSON.stringify({ key: key, value: value }) });
  }

  window.dnkSync = {
    enabled: enabled,
    urlIsFixed: urlIsFixed,
    getUrl: getUrl,
    setUrl: setUrl,
    ping: ping,
    pull: pull,
    pushRecord: pushRecord,
    deleteRecord: deleteRecord,
    pushSamples: pushSamples,
    pushCalib: pushCalib,
    deleteCalib: deleteCalib,
    setSetting: setSetting,
    wipe: wipe,
    queueAllFrom: queueAllFrom,
    fillTake: fillTake,
    queueSize: queueSize,
    flush: flush
  };
})();
