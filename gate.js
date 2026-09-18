/*
  접속 암호 게이트 (마스터 샘플 트렌드 전용, QR 정보관리 시스템의 gate.js와 별개)

  - 이 프로젝트는 기술문서·PDF 뷰어가 없어 2차 암호 단계도 없다. 암호는 1개뿐.
  - 브라우저 데이터를 지우거나 다른 기기로 바꾸면 다시 물어본다.
  - 암호를 바꾸려면 새 암호의 SHA-256 해시로 아래 PASS_HASH를 교체:
    node -e "console.log(require('crypto').createHash('sha256').update('새암호','utf8').digest('hex'))"
  - index.html은 QR 정보관리 시스템과 동일하게 window.dnkGate.ready 를 기다렸다가 화면을 그린다.

  2026-09-19 (7차): QR 정보관리 시스템과 "개념이 다르다"는 지적을 받아, 화면 구조를
  QR 시스템(intro.js → gate.js)과 같은 **진짜 2단계**로 다시 짰다.
  - 이전 구조: 배경 애니메이션 위에 카드 하나만 있고, 그 카드 안에 브랜드·제목과
    (필요하면) 암호 입력칸이 처음부터 같이 들어있었다 — "1단계"와 "2단계"가 사실상
    한 화면이었다.
  - 새 구조: **1단계(항상 재생)** = 격자·스캔·꺾은선 그래프가 그려지고 브랜드명·설비명·
    밑줄이 떠오르는 장면. 입력칸은 전혀 없다. QR 시스템의 intro.js와 같은 역할.
    → 이 장면이 끝나면: 이미 인증된 탭이면 **2단계 없이 바로** 콘텐츠로 넘어가고,
    아직이면 1단계 전용 요소(스캔선·그래프·문구)만 빠르게 사라지면서(SCENE_FADE_MS)
    **2단계** = 순수 암호 카드(브랜드·제목·입력칸)가 새로 나타난다 — QR 시스템의
    intro.js→gate.js `ask()` 전환과 같은 "화면이 한 번 바뀌는" 구조.
  - 타이밍도 QR 시스템의 `인트로_암호게이트_구현상세.md`에 맞춰 다시 잡았다 — 1단계가
    다 그려진 뒤 멈춰 있는 시간(TAIL_MS)과 마지막에 콘텐츠로 넘어가는 페이드(FADE_MS)를
    QR 시스템의 intro.js와 같은 값(1000ms / 1200ms)으로 맞췄다. 이전 값(900/700)은
    QR 시스템보다 빨라서 "느낌이 다르다"는 인상의 일부였을 것으로 본다.
  - 1단계는 이 프로젝트의 정체성(트렌드 그래프)을 보여주는 자리라, QR 시스템의 단순한
    모서리 브래킷 아이콘 대신 격자+꺾은선 그래프를 계속 쓴다 — 이 부분은 QR 시스템과
    의도적으로 다르게 유지한다(개선이력.md 참고).
  - 암호가 맞았을 때도 이제는 즉시 넘어가지 않고 FADE_MS만큼 페이드아웃한 뒤 넘어간다
    (예전엔 즉시 reveal() — "이미 통과한 탭" 흐름과 마감 방식이 달라 어색했다).

  2026-09-19 (5차): sessionStorage로 전환 — QR 정보관리 시스템과 동일하게 맞춰 달라는 요청.
  원래는 "QR 코드 목적 자체가 찍을 때마다 즉시 입력 화면이므로, 매번(새 탭마다) 다시 묻는
  QR 시스템 방식은 이 프로젝트에 안 맞는다"는 판단으로 localStorage(기기당 평생 1회)를 썼는데,
  그 판단을 뒤집는 명시적 요청을 받아 QR 시스템과 같은 sessionStorage(탭 닫으면 다시 물어봄)로
  바꿨다. **트레이드오프를 기록해 둔다:** 같은 탭 안에서 새로고침하는 정도는 다시 안 물어보지만,
  QR을 다시 찍어 새 탭이 열리거나 앱을 완전히 종료했다 재실행하면 매번 다시 암호를 입력해야
  한다 — 하루에 QR을 여러 번 찍는 운영이라면 이전보다 손이 더 간다. 이후 다시 "한 번만 물어보게"
  요청이 오면 localStorage로 되돌리면 된다(이 파일의 git 이력 참고).

  2026-09-19 (6차): 암호 카드 안내 문구에서 "탭을 닫지 않는 동안에는 다시 안 묻는다"는
  구체적인 지속 방식 설명을 뺐다 — 어떻게 하면 재인증을 피할 수 있는지를 화면에 그대로
  알려주는 셈이라 악용 소지가 있다는 지적을 받음. 지금은 그냥 "접속 암호를 입력해 주세요"
  정도의 중립적인 문구만 보여준다. 실제 동작(sessionStorage, 위 5차 설명)은 안 바뀌었다 —
  화면에 설명을 안 할 뿐이다.

  2026-09-18: 배경 연출 추가 (계측 그리드 스캔 + 꺾은선 그리기 결합). 이 앱이 "누설값 트렌드"
  앱이라는 정체성을 게이트 화면에서부터 보여주려고 넣었다. 색상은 QR 정보관리 시스템과
  공유하던 네이비+시안 대신 이 프로젝트만의 팔레트(따뜻한 크림 + 다크 틸)로 바꿨다 —
  styles.css :root 및 index.html의 하드코딩 hex와 같은 값.

  2026-09-19: 처음에는 "기기당 1회만" 재생했는데(이미 통과한 폰은 애니메이션 없이 즉시 화면이
  떴다), QR을 찍을 때마다 이 연출을 보고 싶다는 요청으로 항상 재생하도록 바꿨다. 다만 암호까지
  다시 묻지는 않는다 — 이미 통과한 탭은 1단계 연출만 보여주고, 끝나면 화면이 페이드아웃되며
  바로 앱으로 넘어간다(암호 카드가 뜨는 대신). 처음 통과하는 탭만 1단계 뒤에 암호 카드(2단계)가
  뜬다.
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
  // TAIL_MS/FADE_MS는 QR 시스템의 intro.js와 같은 값으로 맞췄다(7차) — 두 시스템의
  // "체감 속도"가 같아야 한다는 지적을 받아, 임의로 고른 값 대신 참고 구현의 값을 그대로 썼다.
  var TAIL_MS = 1000;       // 1단계 연출이 다 끝난 뒤 화면이 그대로 멈춰 있는 시간
  var FADE_MS = 1200;       // 콘텐츠로 넘어가는 마지막 페이드 길이
  var SCENE_FADE_MS = 450;  // 1단계 전용 요소(스캔·그래프·문구)가 2단계로 넘어가며 사라지는 길이
  var TIMEOUT_MS = 6000;    // animationend가 안 올 때(백그라운드 탭 등) 안전 종료

  function isUnlocked() {
    try {
      return sessionStorage.getItem(KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function markUnlocked() {
    try {
      sessionStorage.setItem(KEY, "1");
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
    "#dnk-gate .bg-grid{position:absolute;inset:0;background-image:linear-gradient(#3d7a78 1px,transparent 1px),linear-gradient(90deg,#3d7a78 1px,transparent 1px);background-size:28px 28px;opacity:0;animation:dnkGridIn .6s ease .1s forwards;}" +
    "#dnk-gate .bg-grid-major{position:absolute;inset:0;background-image:linear-gradient(#4a8f8c 1px,transparent 1px),linear-gradient(90deg,#4a8f8c 1px,transparent 1px);background-size:112px 112px;opacity:0;animation:dnkGridIn .6s ease .1s forwards;}" +
    "#dnk-gate .bg-scan{position:absolute;left:0;right:0;top:-18%;height:30%;background:linear-gradient(180deg,rgba(159,196,192,0),rgba(159,196,192,.28),rgba(159,196,192,0));animation:dnkScan 1.3s cubic-bezier(.4,0,.2,1) .3s forwards;}" +
    // 꺾은선은 카드 글자 뒤(화면 한가운데)를 가로지르지 않도록 아래쪽에 둔다.
    // width가 없으면 SVG(교체 요소)가 viewBox 비율과 height만으로 폭을 역산해 버려
    // left/right로 정한 폭을 무시하고 왼쪽에 쏠려 그려진다(개선이력.md 참고).
    // 그래프 전체 밝기(opacity) — 요청에 따라 .55에서 .75로 올려 숫자·점선·실선이
    // 더 진하게 보이도록 했다(개별 요소 opacity는 아래 SVG 마크업에서 추가로 조정).
    "#dnk-gate .bg-line{position:absolute;left:8%;right:8%;top:68%;width:84%;height:18%;opacity:.75;}" +
    // 카드·문구 뒤에 배경색 음영을 깔아, 격자·스캔선 위에서도 항상 또렷하게 읽히게 한다.
    "#dnk-gate .bg-scrim{position:absolute;inset:0;z-index:1;pointer-events:none;" +
      "background:radial-gradient(ellipse 72% 34% at 50% 47%,rgba(27,74,73,.94) 0%,rgba(27,74,73,.82) 55%,rgba(27,74,73,0) 100%);" +
      "opacity:0;animation:dnkGridIn .5s ease .25s forwards;}" +
    // 1단계(항상 재생) — 브랜드·설비명·밑줄. 입력칸은 없다(QR 시스템 intro.js와 같은 역할).
    // 2026-09-19(8차): 그래프가 그려지기 시작할 때(.5s) 위쪽 글자도 같이 나오도록
    // delay를 앞당기고(전에는 그래프가 다 그려진 2s 뒤에야 글자가 시작됐다), 글자가
    // 화면에 머무르는 느낌을 살리려 등장 시간(duration)도 함께 늘렸다(요청: "그래프
    // 등장할 때 같이 위에 글도 나오게 하고, 그 등장 타임을 조금 더 길게").
    ".intro-text{position:relative;z-index:2;text-align:center;padding:0 24px;}" +
    ".intro-text .brand{color:#9fc4c0;font-size:11px;letter-spacing:.06em;margin-bottom:10px;opacity:0;animation:dnkUp 1.6s ease .6s forwards;}" +
    ".intro-text .title{color:#fff;font-size:17px;font-weight:800;opacity:0;animation:dnkUp 1.8s ease .75s forwards;}" +
    ".intro-text .rule{margin:13px auto 0;width:0;height:2px;background:#9fc4c0;animation:dnkRuleDraw 1s cubic-bezier(.4,0,.2,1) 1.1s forwards;}" +
    // 1단계 전용 요소를 2단계로 넘어가며 지울 때 쓰는 빠른 페이드(JS가 클래스를 붙인다).
    ".intro-fade-out{transition:opacity " + (SCENE_FADE_MS / 1000) + "s ease;opacity:0!important;}" +
    // 2단계 — 순수 암호 카드(브랜드·제목·입력칸). 1단계가 사라진 뒤 새로 나타난다.
    ".dnk-gate-card{position:relative;z-index:2;width:100%;max-width:300px;padding:0 24px;text-align:center;opacity:0;transform:translateY(8px);animation:dnkCardIn .6s ease .05s forwards;}" +
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
    "@keyframes dnkUp{from{opacity:0;transform:translateY(7px);}to{opacity:1;transform:none;}}" +
    "@keyframes dnkRuleDraw{to{width:92px;}}" +
    "@keyframes dnkCardIn{to{opacity:1;transform:none;}}" +
    "@keyframes dnkLineDraw{to{stroke-dashoffset:0;}}" +
    "@keyframes dnkAreaIn{to{opacity:1;}}" +
    "@keyframes dnkDotsIn{to{opacity:1;}}" +
    "@keyframes dnkGateOut{to{opacity:0;}}" +
    // 동작 줄이기: 애니메이션만 끄고, 각 요소는 "다 끝난 상태"로 고정한다.
    // (음영·문구도 함께 켜 줘야 한다 — 기본값이 opacity:0이라 빼먹으면 안 보이게 된다)
    "@media (prefers-reduced-motion:reduce){" +
      "#dnk-gate .bg-grid,#dnk-gate .bg-grid-major,#dnk-gate .bg-scan,#dnk-gate .bg-line path,#dnk-gate .bg-line-area,#dnk-gate .bg-line-dots,#dnk-gate .bg-line-labels,#dnk-gate .bg-scrim,.intro-text .brand,.intro-text .title,.intro-text .rule,.dnk-gate-card{" +
        "animation:none!important;transform:none!important;}" +
      "#dnk-gate .bg-grid,#dnk-gate .bg-grid-major,#dnk-gate .bg-scan,#dnk-gate .bg-line-area,#dnk-gate .bg-line-dots,#dnk-gate .bg-line-labels,#dnk-gate .bg-scrim,.intro-text .brand,.intro-text .title,.dnk-gate-card{opacity:1!important;}" +
      // path는 opacity가 아니라 stroke-dashoffset으로 그려지므로, 애니메이션을 꺼도
      // 이것까지 0으로 같이 고정해야 "다 그려진 상태"로 보인다.
      "#dnk-gate .bg-line path{stroke-dashoffset:0!important;}" +
      "#dnk-gate .intro-text .rule{width:92px!important;}" +
      "#dnk-gate .intro-fade-out{transition:none!important;}}";
  document.documentElement.appendChild(style);

  var wrap = document.createElement("div");
  wrap.id = "dnk-gate";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-labelledby", "dnk-gate-introTitle");

  // 1단계 — 격자·스캔·꺾은선 그래프(디테일 보강: 지점 10개, 기준선, 면적 채우기,
  // 축 눈금 숫자 — "더 전문적이고 멋있게" 요청) + 브랜드·설비명·밑줄. 입력칸 없음.
  wrap.innerHTML =
    '<div class="bg-grid"></div>' +
    '<div class="bg-grid-major"></div>' +
    '<div class="bg-scan"></div>' +
    '<svg class="bg-line" viewBox="0 0 200 60" preserveAspectRatio="none">' +
      '<defs>' +
        '<linearGradient id="dnkLineFill" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#9fc4c0" stop-opacity=".24"/>' +
          '<stop offset="100%" stop-color="#9fc4c0" stop-opacity="0"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<line x1="0" y1="20" x2="200" y2="20" stroke="#9fc4c0" stroke-width="1.2" stroke-dasharray="3 3" opacity=".45"/>' +
      '<path class="bg-line-area" d="M0,48 L22,42 L44,46 L66,30 L88,36 L110,20 L132,28 L154,14 L176,22 L200,8 L200,60 L0,60 Z" ' +
        'fill="url(#dnkLineFill)" style="opacity:0;animation:dnkAreaIn .6s ease 1.1s forwards;"/>' +
      '<path d="M0,48 L22,42 L44,46 L66,30 L88,36 L110,20 L132,28 L154,14 L176,22 L200,8" fill="none" stroke="#9fc4c0" stroke-width="2.6" ' +
        'stroke-linecap="round" stroke-linejoin="round" pathLength="1" ' +
        'style="stroke-dasharray:1;stroke-dashoffset:1;animation:dnkLineDraw 1.15s ease .5s forwards;"/>' +
      '<g class="bg-line-dots" style="opacity:0;animation:dnkDotsIn .4s ease 1.7s forwards;">' +
        '<circle cx="0" cy="48" r="2" fill="#9fc4c0"/>' +
        '<circle cx="22" cy="42" r="2" fill="#9fc4c0"/>' +
        '<circle cx="44" cy="46" r="2" fill="#9fc4c0"/>' +
        '<circle cx="66" cy="30" r="2" fill="#9fc4c0"/>' +
        '<circle cx="88" cy="36" r="2" fill="#9fc4c0"/>' +
        '<circle cx="110" cy="20" r="2" fill="#9fc4c0"/>' +
        '<circle cx="132" cy="28" r="2" fill="#9fc4c0"/>' +
        '<circle cx="154" cy="14" r="2" fill="#9fc4c0"/>' +
        '<circle cx="176" cy="22" r="2" fill="#9fc4c0"/>' +
        '<circle cx="200" cy="8" r="3.2" fill="#f0e6d2" stroke="#1b4a49" stroke-width="1"/>' +
      '</g>' +
      // 실측 그래프처럼 보이도록 y축 눈금 숫자 3개 + 단위 라벨을 더했다(장식용 — 실제
      // 값과는 무관, 판독보다는 "계측기 화면" 인상을 주는 목적이라 작고 옅게 둔다).
      '<g class="bg-line-labels" style="opacity:0;animation:dnkDotsIn .4s ease 1.85s forwards;">' +
        '<text x="3" y="9" font-size="5.5" font-weight="700" fill="#9fc4c0" opacity=".85">6</text>' +
        '<text x="3" y="22" font-size="5.5" font-weight="700" fill="#9fc4c0" opacity=".85">3</text>' +
        '<text x="3" y="52" font-size="5.5" font-weight="700" fill="#9fc4c0" opacity=".85">0</text>' +
        '<text x="197" y="8" font-size="5" font-weight="700" fill="#9fc4c0" opacity=".7" text-anchor="end">mL/min</text>' +
      '</g>' +
    '</svg>' +
    '<div class="bg-scrim"></div>' +
    '<div class="intro-text">' +
      '<div class="brand">DnK MOBILITY · 후공정 생산기술팀</div>' +
      '<div class="title" id="dnk-gate-introTitle">e-AWD 70kW 모터 하우징<br>마스터 누설값 관리 시스템</div>' +
      '<div class="rule"></div>' +
    '</div>';
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

  function revealApp() {
    wrap.classList.add("dnk-gate-out");
    setTimeout(function () {
      wrap.remove();
      style.remove();
      document.documentElement.style.visibility = "visible";
      resolveReady(true);
    }, FADE_MS + 60);
  }

  // 2단계 — 암호 카드. 1단계 전용 요소가 사라진 자리(격자·음영은 그대로 남는다)에
  // 새로 나타난다. QR 시스템의 intro.js → gate.js `ask()` 전환과 같은 구조.
  function mountPasswordCard() {
    var card = document.createElement("div");
    card.className = "dnk-gate-card";
    card.innerHTML =
      '<div class="dnk-gate-brand">DnK MOBILITY · 후공정 생산기술팀</div>' +
      '<div class="dnk-gate-title" id="dnk-gate-title">사내 전용 페이지입니다</div>' +
      '<div class="dnk-gate-sub">계속하려면 접속 암호를 입력해 주세요.</div>' +
      '<input id="dnk-gate-pw" class="dnk-gate-input" type="password" placeholder="접속 암호" aria-label="접속 암호" autocomplete="off" />' +
      '<div id="dnk-gate-err" class="dnk-gate-err" role="alert"></div>' +
      '<button id="dnk-gate-go" class="dnk-gate-btn" type="button">확인</button>';
    wrap.appendChild(card);
    wrap.setAttribute("aria-labelledby", "dnk-gate-title");

    var input = card.querySelector("#dnk-gate-pw");
    var err = card.querySelector("#dnk-gate-err");
    var btn = card.querySelector("#dnk-gate-go");

    function tryUnlock() {
      // 모바일 자동완성/자동교정이 앞뒤 공백을 붙여 넣는 경우가 있어, 비교 전에 trim한다.
      sha256Hex(input.value.trim()).then(function (hex) {
        if (hex === PASS_HASH) {
          markUnlocked();
          revealApp();
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
    // 키보드가 먼저 올라와 카드 등장을 가린다(카드는 .05s 지연 + .6s 동안 등장).
    setTimeout(function () {
      input.focus();
    }, 700);
  }

  // 1단계 전용 요소(스캔선·그래프·문구)만 빠르게 지우고 2단계 카드를 띄운다.
  // 격자·음영은 그대로 남겨 둬 화면이 완전히 새로 시작하는 느낌 없이 이어지게 한다.
  function showPasswordScene() {
    var introBits = wrap.querySelectorAll(".bg-scan, .bg-line, .intro-text");
    for (var i = 0; i < introBits.length; i++) introBits[i].classList.add("intro-fade-out");
    setTimeout(function () {
      for (var j = 0; j < introBits.length; j++) introBits[j].remove();
      mountPasswordCard();
    }, SCENE_FADE_MS + 40);
  }

  // pending이 0 밑으로 내려간 뒤에도 animationend가 더 올 수 있어(카운트가 실제와
  // 살짝 어긋나거나, 초기화 타이밍 오차로 이벤트가 한 번 더 들어오는 경우 등), 반드시
  // "한 번만 실행" 가드를 둔다 — 이게 없으면 pending<=0인 동안 들어오는 이벤트마다
  // setTimeout(finishPhase1, TAIL_MS)가 매번 새로 걸려 finishPhase1()이 여러 번
  // 실행되고, 2단계에서는 암호 카드가 여러 장 겹쳐 쌓이는 눈에 띄는 버그가 된다
  // (구현 중 실제로 겪음 — 재확인 없이 넘어갔으면 그대로 배포될 뻔했다).
  var phase1Done = false;
  function finishPhase1() {
    if (phase1Done) return;
    phase1Done = true;
    if (already) {
      revealApp();
    } else {
      showPasswordScene();
    }
  }

  // 고정 타이머로 "몇 초 뒤 종료"를 재지 않는다. 최초 로드 때 애니메이션 시작이
  // 수백 ms 밀리면 마지막 동작이 잘리고, delay·duration을 나중에 조정하면 어느
  // 것이 가장 늦게 끝나는지가 바뀌기 때문. 그래서 끝난 개수를 센다.
  // wrap에서 발생하는 모든 animationend가 이 카운트를 깎으므로(아래 리스너가
  // 선택자로 걸러 듣지 않음), 1단계에 애니메이션이 걸린 요소를 새로 추가할 때마다
  // 이 목록도 같이 늘려야 한다 — 안 그러면 실제보다 이르게 pending이 0이 되어
  // 뒤에 남은 애니메이션이 안 끝났는데도 2단계로 먼저 넘어가 버린다.
  var animated = wrap.querySelectorAll(
    ".bg-grid,.bg-grid-major,.bg-scan,.bg-line path,.bg-line-area,.bg-line-dots,.bg-line-labels,.intro-text .brand,.intro-text .title,.intro-text .rule"
  );
  var pending = animated.length;

  // 동작 줄이기 설정이면 CSS가 애니메이션을 꺼버려 animationend가 아예 오지 않는다.
  // (화면을 건너뛰라는 뜻이 아니라, 끝을 셀 수 없으니 시간으로 재야 한다는 뜻 —
  //  연출 화면 자체는 이 경우에도 항상 보여준다.)
  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  if (reduceMotion || !pending) {
    setTimeout(finishPhase1, TAIL_MS + 600);
  } else {
    var safety = setTimeout(finishPhase1, TIMEOUT_MS);
    wrap.addEventListener("animationend", function () {
      pending -= 1;
      if (pending > 0) return;
      clearTimeout(safety);
      setTimeout(finishPhase1, TAIL_MS);
    });
  }
})();
