# Petpy Backend (분리 백엔드)

Netlify에 올라간 **정적 프론트엔드**가 호출하는 **별도 Node/Express 서버**입니다.
API 키는 이 서버의 환경변수에만 존재하고 프론트엔드에는 절대 노출되지 않습니다.

```
[브라우저: Netlify 정적 사이트]
      │  fetch(window.PETPY_API + "/api/...")
      ▼
[이 서버: Node/Express]  ──► Replicate (이미지→비디오)
                         ──► AWS Rekognition (동물 판별)
                         ──► AWS S3 (이미지 저장) + DynamoDB (피드 메타)
```

## 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/health` | 서비스 설정 상태 |
| POST | `/api/moderate` | `{ image }` → `{ ok, matched, labels }` (동물 여부) |
| POST | `/api/posts` | `{ image, name, handle?, desc? }` → 동물이면 S3 저장 후 `{ ok, post }`, 아니면 422 |
| GET | `/api/posts` | 공유 피드 목록(최신순) |
| POST | `/api/animate` | `{ image }` → `{ id, status }` (예측 시작) |
| GET | `/api/animate/:id` | `{ status, video, error }` (폴링) |

`image`는 `data:image/...;base64,...` 형식의 Data URL입니다(프론트가 그렇게 보냄).

---

## 1. 로컬 실행

```bash
cd server
npm install
cp .env.example .env      # 값 채우기 (아래 참고)
npm start                 # http://localhost:8787
# 또는 자동 재시작: npm run dev
```

키를 아직 안 넣어도 서버는 뜨고 `/health`는 동작합니다. 키가 없으면 해당 기능만 에러를 반환하고, **프론트는 자동으로 기존(로컬) 동작으로 폴백**합니다.

---

## 2. 환경변수 (`.env`)

`.env.example`를 복사해서 채웁니다.

| 변수 | 필수 | 설명 |
|---|---|---|
| `REPLICATE_API_TOKEN` | 영상생성 | replicate.com → Account → API tokens |
| `REPLICATE_MODEL` | | 기본 `stability-ai/stable-video-diffusion`. 버전 고정은 `owner/name:hash` |
| `REPLICATE_IMAGE_KEY` | | 모델 입력 이미지 필드명(SVD=`input_image`) |
| `REPLICATE_INPUT_JSON` | | (선택) 추가 입력 파라미터 JSON 한 줄 |
| `AWS_REGION` | AWS | 예: `ap-northeast-2`(서울) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | AWS | IAM 사용자 키 |
| `S3_BUCKET` | 피드/영상 | 이미지 저장 버킷명 |
| `DDB_TABLE` | 피드 | 기본 `petpy-posts` |
| `ALLOWED_ORIGINS` | | 프론트 도메인(콤마 구분). 개발 중 `*` 가능 |
| `MODERATION_MIN_CONFIDENCE` | | 동물 판정 임계값(%) 기본 80 |
| `PRESIGN_EXPIRES` | | presigned URL 만료(초) 최대 604800 |

---

## 3. AWS 준비

### 3-1. S3 버킷
1. S3 → 버킷 생성 (예: `petpy-uploads-<본인구분>`), 리전은 `AWS_REGION`과 동일하게.
2. **퍼블릭 액세스 차단은 켠 채로 둬도 됩니다** — 이 서버는 presigned URL로 접근하므로 버킷을 공개할 필요가 없습니다.

### 3-2. DynamoDB 테이블
- 테이블명 `petpy-posts`, **파티션 키 `id` (String)**, 온디맨드(요청당 과금) 모드.

### 3-3. IAM 사용자 + 정책
프로그래밍 방식 액세스(액세스 키) 사용자 1명을 만들고 아래 정책을 부여:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["rekognition:DetectLabels"], "Resource": "*" },
    { "Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject"], "Resource": "arn:aws:s3:::<버킷명>/*" },
    { "Effect": "Allow", "Action": ["dynamodb:PutItem", "dynamodb:Scan"], "Resource": "arn:aws:dynamodb:<리전>:<계정ID>:table/petpy-posts" }
  ]
}
```

생성된 액세스 키를 `.env`의 `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`에 넣습니다.

---

## 4. Replicate 준비
1. replicate.com 가입 → **Account → API tokens**에서 토큰 생성 → `REPLICATE_API_TOKEN`.
2. 결제수단 등록(영상 모델은 실행당 과금, 데모 몇십 회는 보통 몇 달러 이내).
3. 모델 페이지에서 입력 스키마 확인. 기본값(SVD)은 입력 필드가 `input_image`입니다.
   - SVD 권장 입력은 `.env.example`의 `REPLICATE_INPUT_JSON` 주석 참고.

---

## 5. 배포 (Render 예시)
1. 코드를 GitHub에 push.
2. render.com → **New → Web Service** → 레포 연결.
3. 설정:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. **Environment**에 위 `.env` 값들을 모두 추가.
5. 배포되면 `https://<your-service>.onrender.com` 주소가 생깁니다.
6. `ALLOWED_ORIGINS`에 Netlify 도메인을 넣어주세요. (예: `https://your-site.netlify.app`)

> Railway/Fly/EC2 등 어디든 가능합니다. Node 18+ 환경에 `npm start`만 돌리면 됩니다.

---

## 6. 프론트엔드 연결
배포된 백엔드 주소를 `index.html` 상단 설정에 넣으면 됩니다:

```html
<script>window.PETPY_API = "https://<your-service>.onrender.com";</script>
```

- 값이 **비어 있으면** 프론트는 백엔드를 호출하지 않고 기존(로컬 localStorage/캔버스 애니) 동작으로 폴백합니다.
- 값이 있으면: 피드 업로드 시 동물 판별 + 공유 저장, Forever Garden에서 “영상으로 움직이게” 버튼이 활성화됩니다.

---

## 7. 비용 / 보안 메모
- **키는 서버에만**. 프론트(`index.html`, `*.js`)에 절대 넣지 마세요.
- `.env`는 git에 커밋되지 않습니다(`.gitignore` 처리됨).
- 데모 후에는 IAM 키 비활성화/삭제, Replicate 토큰 폐기를 권장합니다.
- 예상 비용(데모 규모): Rekognition ≈ 이미지당 $0.001, Replicate 영상 ≈ 실행당 $0.03–0.36, S3/DynamoDB는 프리티어 내.
