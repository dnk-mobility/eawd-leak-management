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
  한 번 훑고 지나가면서 그 뒤로 꺾은선 그래프가 그려지고, 마지막에 암호 카드가 뜬다. 약 1.9초.
  색상은 QR 정보관리 시스템과 공유하던 네이비+시안 대신 이 프로젝트만의 팔레트(따뜻한 크림 +
  다크 틸)로 바꿨다 — styles.css :root 및 index.html의 하드코딩 hex와 같은 값.

  2026-09-19: 처음에는 "기기당 1회만" 재생했는데(이미 통과한 폰은 애니메이션 없이 즉시 화면이
  떴다), QR을 찍을 때마다 이 연출을 보고 싶다는 요청으로 항상 재생하도록 바꿨다. 다만 암호까지
  다시 묻지는 않는다 — 이미 통과한 폰은 같은 연출이 재생되는 동안 입력칸 없는 환영 카드만 보여
  주고, 끝나면 화면이 페이드아웃되며 바로 앱으로 넘어간다(암호 카드가 뜨는 대신). 처음 통과하는
  폰만 원래대로 연출 뒤에 암호 카드가 뜬다.
  (처음에는 prefers-reduced-motion 기기에서 이미 통과한 경우 연출 자체를 건너뛰게 했었는데,
  실사용 폰 중 "동작 줄이기"가 켜진 기기에서 "항상 보이면 좋겠다"는 요청과 정면으로 충돌해
  애니메이션도 카드도 전혀 안 뜨는 것처럼 보였다. "항상"이라는 요청이 더 명확한 의도라 그
  예외를 없앴다 — reduced-motion이어도 이 화면 자체는 항상 뜨고, CSS의
  prefers-reduced-motion 미디어쿼리가 격자·스캔·선·카드의 전환 "애니메이션"만 정적으로
  바꿔 보여준다(그림 자체는 그대로 나온다).
*/
(function () {
  "use strict";

  var KEY = "leak_trend_gate_ok_v1";
  var PASS_HASH = "6712da30aaaa05bee4d101db4fd64542e8ac7176769bab88f87e826456678fa9";

  // 연출 속도를 조정할 때는 TAIL_MS부터 만진다.
  // 등장 시간(duration)을 늘리면 "또렷해지는 시점"만 뒤로 밀릴 뿐, 또렷한 상태로
  // 멈춰 있는 시간은 그대로라 "너무 빠르다"는 체감이 안 바뀐다.
  // (QR 정보관리 시스템 `인트로_암호게이트_구현상세.md` §3.4의 교훈)
  var TAIL_MS = 900;      // 애니메이션이 다 끝난 뒤 화면이 그대로 멈춰 있는 시간
  var FADE_MS = 700;      // 페이드아웃 길이
  var TIMEOUT_MS = 6000;  // animationend가 안 올 때(백그라운드 탭 등) 안전 종료

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

  var already = isUnlocked();

  var style = document.createElement("style");
  style.textContent =
    "#dnk-gate{position:fixed;inset:0;background:#1b4a49;display:flex;align-items:center;justify-content:center;overflow:hidden;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic','Apple SD Gothic Neo',sans-serif;visibility:visible;}" +
    "#dnk-gate .bg-grid{position:absolute;inset:0;background-image:linear-gradient(#2c5f5d 1px,transparent 1px),linear-gradient(90deg,#2c5f5d 1px,transparent 1px);background-size:28px 28px;opacity:0;animation:dnkGridIn .6s ease .1s forwards;}" +
    "#dnk-gate .bg-scan{position:absolute;left:0;right:0;top:-18%;height:30%;background:linear-gradient(180deg,rgba(159,196,192,0),rgba(159,196,192,.28),rgba(159,196,192,0));animation:dnkScan 1.3s cubic-bezier(.4,0,.2,1) .3s forwards;}" +
    "#dnk-gate .bg-line{position:absolute;left:8%;right:8%;top:38%;height:24%;}" +
    ".dnk-gate-card{position:relative;z-index:2;width:100%;max-width:300px;padding:0 24px;text-align:center;opacity:0;transform:translateY(8px);animation:dnkCardIn .7s ease 1.1s forwards;}" +
    ".dnk-gate-brand{color:#9fc4c0;font-size:11px;letter-spacing:.06em;margin-bottom:10px;}" +
    ".dnk-gate-title{color:#fff;font-size:17px;font-weight:800;margin-bottom:6px;}" +
    ".dnk-gate-sub{color:#9fc4c0;font-size:12px;line-height:1.5;margin-bottom:18px;}" +
    ".dnk-gate-input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:8px;border:1px solid #3d7a78;background:#235857;color:#fff;font-size:16px;text-align:center;outline:none;}" +
    ".dnk-gate-input::placeholder{color:#9c9382;}" +
    ".dnk-gate-err{color:#e8a99e;font-size:12px;min-height:16px;margin-top:8px;}" +
    ".dnk-gate-btn{margin-top:6px;width:100%;padding:12px;border:none;border-radius:8px;background:#2f6e6c;color:#fff;font-size:14px;font-weight:700;cursor:pointer;}" +
    ".dnk-gate-btn:active{opacity:.85;}" +
    "#dnk-gate.dnk-gate-out{animation:dnkGateOut " + (FADE_MS / 1000) + "s ease forwards;}" +
    "@keyframes dnkGridIn{to{opacity:1;}}" +
    "@keyframes dnkScan{0%{top:-18%;}100%{top:100%;}}" +
    "@keyframes dnkCardIn{to{opacity:1;transform:none;}}" +
    "@keyframes dnkLineDraw{to{stroke-dashoffset:0;}}" +
    "@keyframes dnkGateOut{to{opacity:0;}}" +
    "@media (prefers-reduced-motion:reduce){#dnk-gate .bg-grid,#dnk-gate .bg-scan,#dnk-gate .bg-line path,.dnk-gate-card{animation:none!important;opacity:1!important;transform:none!important;}}";
  document.documentElement.appendChild(style);

  var wrap = document.createElement("div");
  wrap.id = "dnk-gate";
  if (!already) {
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-labelledby", "dnk-gate-title");
  }
  wrap.innerHTML =
    '<div class="bg-grid"></div>' +
    '<div class="bg-scan"></div>' +
    '<svg class="bg-line" viewBox="0 0 200 60" preserveAspectRatio="none">' +
      '<path d="M0,46 L34,30 L68,38 L102,14 L136,24 L200,6" fill="none" stroke="#9fc4c0" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" pathLength="1" ' +
        'style="stroke-dasharray:1;stroke-dashoffset:1;animation:dnkLineDraw 1s ease .5s forwards;"/>' +
    '</svg>' +
    (already
      ? '<div class="dnk-gate-card">' +
        '<div class="dnk-gate-brand">DnK MOBILITY · 후공정 생산기술팀</div>' +
        '<div class="dnk-gate-title">e-AWD 모터 하우징<br>누설값 관리 시스템</div>' +
        "</div>"
      : '<div class="dnk-gate-card">' +
        '<div class="dnk-gate-brand">DnK MOBILITY · 후공정 생산기술팀</div>' +
        '<div class="dnk-gate-title" id="dnk-gate-title">사내 전용 페이지입니다</div>' +
        '<div class="dnk-gate-sub">이 기기에서 처음 한 번만 확인합니다.<br>다음부터는 QR을 찍으면 바로 입력 화면이 뜹니다.</div>' +
        '<input id="dnk-gate-pw" class="dnk-gate-input" type="password" placeholder="접속 암호" aria-label="접속 암호" autocomplete="off" />' +
        '<div id="dnk-gate-err" class="dnk-gate-err" role="alert"></div>' +
        '<button id="dnk-gate-go" class="dnk-gate-btn" type="button">확인</button>' +
        "</div>");
  document.documentElement.appendChild(wrap);

  var resolveReady;
  window.dnkGate = {
    ready: new Promise(function (res) {
      resolveReady = res;
    }),
    // index.html의 "기타사항 잠금"이 같은 암호를 쓴다 — 해시를 복사해 두면 암호를
    // 바꿀 때 한쪽만 바뀌는 사고가 나므로, 여기서 넘겨준다(값 자체는 해시라 노출돼도
    // 게이트에 이미 들어있는 것과 같은 수준이다).
    passHash: PASS_HASH,
    sha256Hex: sha256Hex,
  };

  function reveal() {
    wrap.remove();
    style.remove();
    document.documentElement.style.visibility = "visible";
    resolveReady(true);
  }

  // 이미 통과한 폰: 연출만 보여주고, 암호는 다시 묻지 않은 채 끝나면 화면으로 넘어간다.
  if (already) {
    var closed = false;
    function finish() {
      if (closed) return;
      closed = true;
      wrap.classList.add("dnk-gate-out");
      setTimeout(reveal, FADE_MS + 60);
    }

    // 고정 타이머로 "몇 초 뒤 종료"를 재지 않는다. 최초 로드 때 애니메이션 시작이
    // 수백 ms 밀리면 마지막 동작이 잘리고, delay·duration을 나중에 조정하면 어느
    // 것이 가장 늦게 끝나는지가 바뀌기 때문. 그래서 끝난 개수를 센다.
    var animated = wrap.querySelectorAll(".bg-grid,.bg-scan,.bg-line path,.dnk-gate-card");
    var pending = animated.length;

    // 동작 줄이기 설정이면 CSS가 애니메이션을 꺼버려 animationend가 아예 오지 않는다.
    // (화면을 건너뛰라는 뜻이 아니라, 끝을 셀 수 없으니 시간으로 재야 한다는 뜻 —
    //  연출 화면 자체는 이 경우에도 항상 보여준다.)
    var reduceMotion = false;
    try {
      reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {}

    if (reduceMotion || !pending) {
      setTimeout(finish, TAIL_MS + 600);
    } else {
      var safety = setTimeout(finish, TIMEOUT_MS);
      wrap.addEventListener("animationend", function () {
        pending -= 1;
        if (pending > 0) return;
        clearTimeout(safety);
        setTimeout(finish, TAIL_MS);
      });
    }
    return;
  }

  var input = wrap.querySelector("#dnk-gate-pw");
  var err = wrap.querySelector("#dnk-gate-err");
  var btn = wrap.querySelector("#dnk-gate-go");

  function tryUnlock() {
    sha256Hex(input.value).then(function (hex) {
      if (hex === PASS_HASH) {
        markUnlocked();
        reveal();
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

  // 카드가 실제로 떠오른 뒤에 포커스를 준다. 연출 중에 미리 포커스하면 폰에서
  // 키보드가 먼저 올라와 연출을 가린다 (카드는 1.1s 지연 + 0.7s 동안 등장).
  setTimeout(function () {
    input.focus();
  }, 1850);
})();
