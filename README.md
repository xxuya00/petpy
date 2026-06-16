# 🐾 petpy — 반려동물 커뮤니티

> **기록이 기억이 되도록.**
> 반려 일상을 남기고(**기록**), 떠나보낸 아이를 AI·AR로 다시 만나고(**기억**), 같은 동네 이웃과 소통하는(**소통**) 반려동물 전용 커뮤니티.

페이크도어(fake-door) 기반 **수요검증 프로젝트**입니다. 실제 작동하는 프론트엔드 + 얇은 백엔드(AI 누끼) + 서버리스 DB(구글시트)로 사용자 행동을 실시간 계측합니다.

---

## 🔗 라이브 주소

| 구분 | URL |
|---|---|
| 서비스(프론트, Netlify) | https://petpy.netlify.app |
| 웹앱 진입 | https://petpy.netlify.app/app.html |
| 백엔드(Render) | https://petpy.onrender.com |
| 소스코드(GitHub) | https://github.com/xxuya00/petpy |

> 백엔드/구글시트 없이도 **데모 모드**로 단독 실행됩니다(아래 참고).

---

## 🧩 핵심 기능 (3 Core)

| Core | 화면 | 설명 |
|---|---|---|
| **기록하기** | `app.html` → 기록 탭 | 우리 아이의 오늘을 사진+캡션으로 기록 (구글시트 `record`) |
| **기억하기** | 기억 탭 (`app-ar.js`) | 사진을 **AI 배경분리(누끼)** → **2.5D AR**(Three.js)로 '소환', 추모 한마디 |
| **소통하기** | 소통 탭 | 동네 인증 기반 이웃 반려인과 글·댓글 (`community`/`comments`) |

---

## 🏗️ 아키텍처

```
[브라우저]
  ├─ 정적 프론트(Netlify) ── index.html(랜딩) / app.html(웹앱)
  │     ├─ config.js   : 백엔드·DB·이미지 호스팅 설정
  │     ├─ Three.js    : 2.5D AR 렌더
  │     └─ getUserMedia: 웹캠 배경
  │
  ├─ 백엔드(Render, Node/Express) ── POST /api/cutout (AI 누끼)
  │     └─ Replicate API (851-labs/background-remover)
  │
  ├─ DB(Google Apps Script 웹앱 → Google Sheets) ── 행 단위 읽기/쓰기
  │
  └─ 이미지 호스팅(ImgBB) ── 업로드 사진 URL
```

데이터·외부 연동 상세는 [`apps-script.gs`](apps-script.gs) 상단 주석과 [`config.js`](config.js)를 참고하세요.

---

## 📁 폴더 구조

```
petpy/
├─ index.html            랜딩 페이지
├─ app.html              웹앱(기록/기억/소통)
├─ config.js             공통 설정(백엔드·DB·이미지 호스팅 키)
├─ petpy.js / petpy.css  랜딩 로직·스타일
├─ app.js / app.css      웹앱 로직·스타일 (기록·소통·i18n·DB저장)
├─ app-ar.js             기억하기(AR 메모리얼) 모듈
├─ forever-garden.*      메모리얼 가든 연출
├─ apps-script.gs        Google Apps Script(구글시트 JSON API) — 배포용 원본
├─ netlify.toml          정적 배포 설정(빌드 없음)
└─ server/               백엔드(Replicate 누끼 프록시)
   ├─ index.js
   ├─ package.json
   └─ .env.example
```

---

## 🚀 로컬 실행

### 0) 클론
```bash
git clone https://github.com/xxuya00/petpy.git
cd petpy
```

### 1) 프론트엔드 (정적 — 빌드 불필요)
빌드 단계가 없으므로 아무 정적 서버로 루트를 띄우면 됩니다.
```bash
python3 -m http.server 8000
```
- 랜딩: http://localhost:8000/
- 웹앱: http://localhost:8000/app.html

> 기본 `config.js`는 **라이브 백엔드/구글시트**를 가리킵니다. 완전 오프라인 데모를 원하면 `config.js`에서 `PETPY_GAS`(그리고 필요시 `PETPY_API`)를 `""`로 비우세요 → localStorage 데모 모드로 동작.

### 2) 백엔드 (선택 — AI 누끼를 직접 돌릴 때만, Node ≥ 18)
```bash
cd server
npm install
cp .env.example .env      # .env.example 안내대로 값 채우기
npm start                 # http://localhost:8787  (개발용 핫리로드: npm run dev)
```
헬스체크: `curl http://localhost:8787/health`

백엔드를 로컬에서 돌렸다면 `config.js`의 `window.PETPY_API`를 `"http://localhost:8787"`로 바꿔 프론트와 연결하세요. **백엔드가 없으면** 기억하기는 원본 이미지로 자동 폴백(데모)됩니다.

---

## 🗄️ DB 설정 (Google Apps Script + Sheets)

1. 데이터가 쌓일 **구글 시트**를 열고 → 확장 프로그램 > **Apps Script**
2. [`apps-script.gs`](apps-script.gs) 내용을 붙여넣고 저장 → **배포 > 새 배포 > 웹 앱**(실행: 나, 액세스: **모든 사용자**) → `/exec` URL 복사
3. `config.js`의 `window.PETPY_GAS`에 그 URL 입력
4. 아래 **탭(1행 헤더)** 을 시트에 생성 — 헤더에 없는 필드는 무시, 없는 값은 빈칸:

| 탭 | 1행 헤더 |
|---|---|
| `community` | `post_id` `user_id` `content` `image_url` `created_at` |
| `comments` | `post_id` `user_id` `comment_content` `created_at` |
| `record` | `user_id` `pet_name` `image_url` `memo` `created_at` |
| `memorial` | `user_id` `pet_name` `type` `message` `source` `result` `created_at` |
| `beta` | `email` `message` `created_at` |
| `feedback` | `user_id` `message` `created_at` |
| `visits` | `landingUrl` `referer` `utm` `device` `ip` `created_at` |
| `clicks` | `feature` `sid` `created_at` |
| `3d_demand` | `user_id` `email` `created_at` |

> 모든 `created_at`은 한국시간(KST, `+09:00`)으로 기록됩니다.

---

## 🛠️ 기술 스택

- **Frontend**: Vanilla JS · HTML · CSS, Three.js(2.5D AR), getUserMedia(웹캠), 4개국어 i18n(한/영/일/중) — **Netlify** 배포
- **Backend**: Node.js + Express, Replicate API(AI 배경분리) — **Render** 배포
- **DB**: Google Apps Script 웹앱 + Google Sheets (서버리스, `text/plain` POST로 CORS 프리플라이트 회피)
- **이미지 호스팅**: ImgBB

---

## 📊 수요검증 (XYZ 가설)

페이크도어로 핵심 기능 수요를 검정합니다. 모든 행동 이벤트가 구글시트에 적재되어 전환 퍼널을 계측합니다.

- **H1 (기억하기)** 방문자의 ≥35%가 메모리얼 AR 소환을 시도한다
- **H2 (기록하기)** 방문자의 ≥20%가 추억을 1건 이상 기록한다
- **H3 (소통하기)** 방문자의 ≥15%가 글/댓글을 작성한다
- **H4 (이메일)** 방문자의 ≥5%가 베타 신청 이메일을 제출한다

검정: **Exact Binomial test**(단일표본 비율). 상세 결과는 발표자료 참조.

---

## 📄 라이선스 / 문의

학습용 프로젝트. 문의: pbw0511@yonsei.ac.kr
