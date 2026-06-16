/*
 * petpy 공통 설정 — 실제 연동 시 이 파일의 두 값만 채우면 됩니다.
 * (index.html 랜딩페이지와 app.html 웹앱이 같은 설정을 공유)
 */

// Replicate 백엔드 주소(기억창구 AI 누끼). 로컬 데모면 그대로, 배포면 배포 URL로.
// 비우면("") 백엔드 호출 안 하고 데모 폴백(원본 이미지)으로 동작.
window.PETPY_API = "https://petpy.onrender.com";

// Google Apps Script 웹앱 URL (Apps Script 배포 > 웹 앱 > 끝이 /exec 인 주소).
// 예: "https://script.google.com/macros/s/AKfycb.../exec"
// 비우면("") localStorage 데모 모드 — 발표는 이 상태로도 동작.
// 채우면 소통(community/comments)·기록(record)·랜딩폼(beta)·3D수요조사(3d_demand)가 구글시트에 실제 저장.
window.PETPY_GAS = "https://script.google.com/macros/s/AKfycbzFOn4asiMS1vQNV-VZamW72YSszDAeYCZdYqnHnzoiX7wN0dFOrhZAYQCj0joZ6NjpaQ/exec";

// created_at 등 모든 타임스탬프는 한국시간(KST, +09:00)으로 기록합니다.
// new Date().toISOString()는 UTC('…Z')라 시트엔 9시간 이른 값으로 보입니다 — 대신 이걸 쓰세요.
// 반환 예: "2026-06-16T14:30:00+09:00" — ISO 8601이라 Date.parse로 같은 시각이 그대로 복원됩니다.
window.PETPY_now = function () {
  var kst = new Date(Date.now() + 9 * 60 * 60 * 1000);   // 현재 시각을 +9h 이동
  return kst.toISOString().replace(/\.\d{3}Z$/, "+09:00"); // UTC 표기를 KST 벽시계+오프셋으로
};
