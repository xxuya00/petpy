/**
 * petpy — Google Apps Script 웹앱 (구글 시트를 JSON API로 사용)
 * 한 스프레드시트의 여러 탭(community/comments/record/visitors/3d_demand)을 읽고 씁니다.
 *
 * ────────────────────────────────────────────────────────────
 * [배포 방법]
 * 1) 데이터가 쌓일 구글 시트 열기 → 상단 메뉴 "확장 프로그램 > Apps Script"
 *    (이렇게 시트에서 열어야 getActiveSpreadsheet() 가 이 시트를 가리킵니다)
 * 2) 편집기의 Code.gs 내용을 전부 지우고 이 파일을 그대로 붙여넣기 → 저장(💾)
 * 3) 오른쪽 위 "배포 > 새 배포" → 유형 톱니바퀴에서 "웹 앱" 선택
 *      - 설명: petpy api (아무거나)
 *      - 실행 계정: 나
 *      - 액세스 권한: 모든 사용자(Anyone)     ← 브라우저에서 호출하려면 반드시 이걸로
 *    "배포" → 권한 검토/승인(본인 구글 계정, "안전하지 않음 > 이동" 거쳐 허용)
 *    → "웹 앱 URL"(끝이 /exec) 복사
 * 4) config.js 의 window.PETPY_GAS 에 그 /exec URL 붙여넣기
 *    ※ 코드 수정 후엔 "배포 관리 > (연필)편집 > 버전: 새 버전 > 배포" 로 같은 URL 유지
 *      ("새 배포"를 또 하면 URL이 바뀝니다)
 *
 * [필요한 탭 + 1행 헤더] — 헤더에 없는 필드는 무시되고, 없는 값은 빈 칸으로 저장됩니다.
 *   community : post_id | user_id | content | image_url | created_at
 *   comments  : post_id | user_id | comment_content | created_at
 *   record    : user_id | pet_name | image_url | memo | created_at
 *   beta      : email | message | created_at        (랜딩 베타 신청 — petpy 전용 새 탭)
 *   visits    : landingUrl | referer | utm | device | ip | created_at   (랜딩 방문 로깅 — petpy 전용 새 탭)
 *   clicks    : feature | sid | created_at           (랜딩 기능별 '기대돼요' 클릭 — 가짜문 수요검증, petpy 전용 새 탭)
 *   feedback  : user_id | message | created_at        (웹앱 내 '의견 보내기' — petpy 전용 새 탭)
 *   3d_demand : user_id | email | created_at
 *   ※ 'visitors'는 외부 방문자-분석 로깅이 쓰는 탭이라 건드리지 않고, 랜딩 신청은 'beta' 탭 사용.
 *
 * [프론트엔드와의 규약] (app.js / petpy.js 가 이 형식으로 호출)
 *   읽기:  GET  ...exec?sheet=<탭이름>          → 행 객체 배열 반환
 *   쓰기:  POST ...exec  (Content-Type: text/plain)  body = {"sheet":"<탭>","row":{...}}
 *   ※ POST를 text/plain 으로 보내는 이유: Apps Script는 CORS 프리플라이트(OPTIONS)를
 *      처리하지 못해서, application/json 으로 보내면 브라우저에서 막힙니다.
 *      text/plain 은 "단순 요청"이라 프리플라이트 없이 통과합니다. (바꾸지 마세요)
 * ────────────────────────────────────────────────────────────
 */

function doGet(e) {
  var name = (e && e.parameter && e.parameter.sheet) || "";
  if (!name) return json_({ ok: true });            // 헬스체크
  return json_(readSheet_(name));
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (err) {}
  var name = body.sheet || "";
  var row = body.row || {};
  if (!name) return json_({ ok: false, error: "no sheet" });
  appendRow_(name, row);
  return json_({ ok: true });
}

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

// 탭 전체를 [{헤더:값, ...}, ...] 로 반환 (1행을 헤더로 사용)
function readSheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var headers = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var key = String(headers[c]).trim();
      if (key) obj[key] = values[i][c];
    }
    out.push(obj);
  }
  return out;
}

// row 객체를 헤더 순서에 맞춰 한 줄 추가 (동시 쓰기 보호: ScriptLock)
function appendRow_(name, row) {
  var sh = ss_().getSheetByName(name);
  if (!sh) return;
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    var headers = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
    var line = headers.map(function (h) {
      var key = String(h).trim();
      return Object.prototype.hasOwnProperty.call(row, key) ? row[key] : "";
    });
    sh.appendRow(line);
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
