# Petpy Backend (thin Replicate proxy)

petpy의 코어 기능 **Memorial Garden(기억)** 을 위한 **별도 Node/Express 서버**입니다.
정적 프론트엔드가 이 서버를 호출하고, 서버가 클라우드 AI(Replicate)를 실행합니다.
**API 키는 이 서버의 환경변수에만 존재하며 프론트엔드에는 절대 노출되지 않습니다.**

```
[브라우저: 정적 프론트]
      │  fetch(window.PETPY_API + "/api/...")
      ▼
[이 서버: Node/Express]  ──► Replicate · 배경 제거(컷아웃)      [데모: 라이브]
                         ──► Replicate · 이미지→비디오(애니)   [데모: 사전 생성]
```

- **AWS 없음** — S3/DynamoDB/Rekognition 의존성을 모두 제거했습니다. 업로드 이미지는
  Replicate 파일 스토리지에 직접 올려 모델이 가져가므로 별도 버킷이 필요 없습니다.

## 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/health` | 설정 상태 `{ ok, services }` |
| POST | `/api/cutout` | `{ image }` → `{ ok, image }` 배경 제거된 이미지 URL (라이브) |
| POST | `/api/animate` | `{ image }` → `{ id, status }` 이미지→비디오 예측 시작 |
| GET | `/api/animate/:id` | `{ status, video, error }` 폴링 |

`image`는 `data:image/...;base64,...` 형식의 Data URL 또는 순수 base64 문자열입니다.

> **데모 전략:** 컷아웃은 빠르므로 **라이브**로 호출하고, 이미지→비디오는 느리고
> 유료이므로 **미리 생성한 영상 파일을 재생**합니다(라이브 호출 금지). 백엔드가 진짜
> 동작함은 리허설 녹화/예측 상태 폴링으로 증명합니다.

---

## 1. 로컬 실행 (데모 권장)

```bash
cd server
npm install
cp .env.example .env      # REPLICATE_API_TOKEN 채우기
npm start                 # http://localhost:8787
# 자동 재시작: npm run dev
```

토큰이 없어도 서버는 뜨고 `/health`는 동작합니다(해당 기능만 503 반환).
발표 때는 콜드스타트/네트워크 리스크를 피하려 **로컬 실행을 권장**합니다.

## 2. 환경변수 (`.env`)

`.env.example` 복사해서 채웁니다.

| 변수 | 필수 | 설명 |
|---|---|---|
| `REPLICATE_API_TOKEN` | ✅ | replicate.com → Account → API tokens |
| `REPLICATE_CUTOUT_MODEL` | | 기본 `851-labs/background-remover` |
| `REPLICATE_CUTOUT_IMAGE_KEY` | | 컷아웃 모델 입력 이미지 필드명(기본 `image`) |
| `REPLICATE_ANIMATE_MODEL` | | 기본 `stability-ai/stable-video-diffusion` |
| `REPLICATE_ANIMATE_IMAGE_KEY` | | 애니 모델 입력 이미지 필드명(SVD=`input_image`) |
| `REPLICATE_*_INPUT_JSON` | | (선택) 추가 입력 파라미터 JSON 한 줄 |
| `ALLOWED_ORIGINS` | | 프론트 도메인(콤마 구분). 개발 중 `*` |
| `PORT` | | 기본 8787 |

## 3. Replicate 준비
1. replicate.com 가입 → **Account → API tokens** → 토큰 생성 → `REPLICATE_API_TOKEN`.
2. 결제수단 등록(실행당 과금). 컷아웃은 실행당 수 센트, 영상은 실행당 $0.03–0.36 수준.
3. 모델 페이지에서 입력 스키마(이미지 필드명) 확인 후 `*_IMAGE_KEY` 맞추기.

## 4. 프론트엔드 연결
프론트에서 백엔드 주소를 지정합니다(없으면 호출하지 않고 로컬 폴백):

```html
<script>window.PETPY_API = "http://localhost:8787";</script>
```

## 5. 배포(선택, Render 예시)
1. GitHub push → render.com **New → Web Service** → 레포 연결.
2. Root Directory `server`, Build `npm install`, Start `npm start`.
3. Environment에 `.env` 값 추가. `ALLOWED_ORIGINS`에 프론트 도메인 지정.

## 6. 비용 / 보안
- **키는 서버에만.** 프론트(`index.html`, `*.js`)에 절대 넣지 마세요.
- `.env`는 커밋 금지(`.gitignore` 확인).
- 데모 후 Replicate 토큰 폐기 권장.
