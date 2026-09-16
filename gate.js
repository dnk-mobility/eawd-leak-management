/*
  접속 암호 게이트 — 기기 기억 방식 (마스터 샘플 트렌드 전용, QR 정보관리 시스템의 gate.js와 별개)

  - QR 코드 목적 자체가 "찍을 때마다 즉시 입력 화면"이므로, 예전 시스템처럼 매번(같은 탭이 아니면)
    다시 묻는 방식(sessionStorage)은 이 프로젝트에는 맞지 않는다. 그래서 localStorage로 "이 폰"
    단위로 한 번만 확인하고, 이후로는 화면이 즉시 뜬다.
  - 이 프로젝트는 기술문서·PDF 뷰어가 없어 2차 암호 단계도 없다. 암호는 1개뿐.
  - 설비별 전용 폰/태블릿 1대를 쓰는 운영 방식(개선이력 참고)과 맞는 선택 — 그 폰에서 최초 1회만
    맞히면, 이후 교대 작업자가 계속 써도 다시 묻지 않는다.
  - 브라우저 데이터를 지우거나 다른 기기로 바꾸면 다시 물어본다.
  - 암호를 바꾸려면 새 암호의 SHA-256 해시로 아래 PASS_HASH를 교체:
    node -e "console.log(require('crypto').createHash('sha256').update('새암호','utf8').digest('hex'))"
  - index.html은 QR 정보관리 시스템과 동일하게 window.dnkGate.ready 를 기다렸다가 화면을 그린다.

  2026-09-18: 배경 연출 추가 (계측 그리드 스캔 + 꺾은선 그리기 결합). 이 앱이 "누설값 트렌드"
  앱이라는 정체성을 게이트 화면에서부터 보여주려고 넣었다 — 격자가 옅게 깔리고, 스캔 라인이
  한 번 훑고 지나가면서 그 뒤로 꺾은선 그래프가 그려지고, 마지막에 암호 카드가 뜬다.
  기기당 1회만 보이므로(요청 시 잠깐씩만 재생) 길게 잡아도 방해가 안 된다 — 약 1.9초.
  색상은 QR 정보관리 시스템과 공유하던 네이비+시안 대신 이 프로젝트만의 팔레트(따뜻한 크림 +
  다크 틸)로 바꿨다 — styles.css :root 및 index.html의 하드코딩 hex와 같은 값.
*/
(function () {
  "use strict";

  var KEY = "leak_trend_gate_ok_v1";
  var PASS_HASH = "6712da30aaaa05bee4d101db4fd64542e8ac7176769bab88f87e826456678fa9"; // dnkm8721 (기존 QR 시스템과 동일 암호)

  function isUnlocked() {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function markUnlocked() {
    try {
      localStorage.setItem(KEY, "1");
    } catch (e) {}
  }

  function sha256Hex(text) {
    var buf = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", buf).then(function (hash) {
      return Array.prototype.map
        .call(new Uint8Array(hash), function (b) {
          return ("0" + b.toString(16)).slice(-2);
        })
        .join("");
    });
  }

  document.documentElement.style.visibility = "hidden";

  if (isUnlocked()) {
    document.documentElement.style.visibility = "visible";
    window.dnkGate = { ready: Promise.resolve(true) };
    return;
  }

  var style = document.createElement("style");
  style.textContent =
    "#dnk-gate{position:fixed;inset:0;background:#1b4a49;display:flex;align-items:center;justify-content:center;overflow:hidden;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic','Apple SD Gothic Neo',sans-serif;visibility:visible;}" +
    "#dnk-gate .bg-grid{position:absolute;inset:0;background-image:linear-gradient(#2c5f5d 1px,transparent 1px),linear-gradient(90deg,#2c5f5d 1px,transparent 1px);background-size:28px 28px;opacity:0;animation:dnkGridIn .5s ease .1s forwards;}" +
    "#dnk-gate .bg-scan{position:absolute;left:0;right:0;top:-18%;height:30%;background:linear-gradient(180deg,rgba(159,196,192,0),rgba(159,196,192,.28),rgba(159,196,192,0));animation:dnkScan 1.1s cubic-bezier(.4,0,.2,1) .3s forwards;}" +
    "#dnk-gate .bg-line{position:absolute;left:8%;right:8%;top:38%;height:24%;}" +
    ".dnk-gate-card{position:relative;z-index:2;width:100%;max-width:300px;padding:0 24px;text-align:center;opacity:0;transform:translateY(8px);animation:dnkCardIn .55s ease .95s forwards;}" +
    ".dnk-gate-brand{color:#9fc4c0;font-size:11px;letter-spacing:.06em;margin-bottom:10px;}" +
    ".dnk-gate-title{color:#fff;font-size:17px;font-weight:800;margin-bottom:6px;}" +
    ".dnk-gate-sub{color:#9fc4c0;font-size:12px;line-height:1.5;margin-bottom:18px;}" +
    ".dnk-gate-input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:8px;border:1px solid #3d7a78;background:#235857;color:#fff;font-size:16px;text-align:center;outline:none;}" +
    ".dnk-gate-input::placeholder{color:#9c9382;}" +
    ".dnk-gate-err{color:#e8a99e;font-size:12px;min-height:16px;margin-top:8px;}" +
    ".dnk-gate-btn{margin-top:6px;width:100%;padding:12px;border:none;border-radius:8px;background:#2f6e6c;color:#fff;font-size:14px;font-weight:700;cursor:pointer;}" +
    ".dnk-gate-btn:active{opacity:.85;}" +
    "@keyframes dnkGridIn{to{opacity:1;}}" +
    "@keyframes dnkScan{0%{top:-18%;}100%{top:100%;}}" +
    "@keyframes dnkCardIn{to{opacity:1;transform:none;}}" +
    "@keyframes dnkLineDraw{to{stroke-dashoffset:0;}}" +
    "@media (prefers-reduced-motion:reduce){#dnk-gate .bg-grid,#dnk-gate .bg-scan,#dnk-gate .bg-line path,.dnk-gate-card{animation:none!important;opacity:1!important;transform:none!important;}}";
  document.documentElement.appendChild(style);

  var wrap = document.createElement("div");
  wrap.id = "dnk-gate";
  wrap.innerHTML =
    '<div class="bg-grid"></div>' +
    '<div class="bg-scan"></div>' +
    '<svg class="bg-line" viewBox="0 0 200 60" preserveAspectRatio="none">' +
      '<path d="M0,46 L34,30 L68,38 L102,14 L136,24 L200,6" fill="none" stroke="#9fc4c0" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" pathLength="1" ' +
        'style="stroke-dasharray:1;stroke-dashoffset:1;animation:dnkLineDraw .85s ease .45s forwards;"/>' +
    '</svg>' +
    '<div class="dnk-gate-card">' +
    '<div class="dnk-gate-brand">DnK MOBILITY · 후공정 생산기술팀</div>' +
    '<div class="dnk-gate-title">사내 전용 페이지입니다</div>' +
    '<div class="dnk-gate-sub">이 기기에서 처음 한 번만 확인합니다.<br>다음부터는 QR을 찍으면 바로 입력 화면이 뜹니다.</div>' +
    '<input id="dnk-gate-pw" class="dnk-gate-input" type="password" placeholder="접속 암호" autocomplete="off" />' +
    '<div id="dnk-gate-err" class="dnk-gate-err"></div>' +
    '<button id="dnk-gate-go" class="dnk-gate-btn">확인</button>' +
    "</div>";
  document.documentElement.appendChild(wrap);

  var input = wrap.querySelector("#dnk-gate-pw");
  var err = wrap.querySelector("#dnk-gate-err");
  var btn = wrap.querySelector("#dnk-gate-go");

  var resolveReady;
  window.dnkGate = {
    ready: new Promise(function (res) {
      resolveReady = res;
    }),
  };

  function tryUnlock() {
    sha256Hex(input.value).then(function (hex) {
      if (hex === PASS_HASH) {
        markUnlocked();
        wrap.remove();
        style.remove();
        document.documentElement.style.visibility = "visible";
        resolveReady(true);
      } else {
        err.textContent = "암호가 올바르지 않습니다";
        input.value = "";
        input.focus();
      }
    });
  }

  btn.addEventListener("click", tryUnlock);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") tryUnlock();
  });
  setTimeout(function () {
    input.focus();
  }, 50);
})();
