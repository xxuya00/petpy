/*
 * Petpy — thin backend (Node/Express, ESM)
 *
 * Memorial Garden(기억) 코어 기능을 위한 Replicate 전용 프록시.
 * AWS 없음(S3/DynamoDB/Rekognition 제거). 이미지는 Replicate 파일 업로드로 전달하므로
 * 별도 스토리지가 필요 없습니다. API 키는 서버 환경변수에만 존재합니다.
 *
 *   [브라우저: 정적 프론트] ──fetch(window.PETPY_API)──► [이 서버] ──► Replicate
 *                                                                 ├─ 배경 제거(컷아웃)  : 라이브
 *                                                                 └─ 이미지→비디오(애니) : 사전 생성
 *
 * 엔드포인트
 *   GET  /health             설정 상태 { ok, services }
 *   POST /api/cutout         배경 제거  { image } -> { ok, image }            (데모: 라이브/빠름)
 *   POST /api/animate        이미지→비디오 예측 시작 { image } -> { id, status } (데모: 사전 생성/느림)
 *   GET  /api/animate/:id    예측 상태/결과 -> { status, video, error }
 *
 * 환경변수 (.env.example 참고)
 *   REPLICATE_API_TOKEN (필수)
 *   REPLICATE_CUTOUT_MODEL, REPLICATE_CUTOUT_IMAGE_KEY, REPLICATE_CUTOUT_INPUT_JSON
 *   REPLICATE_ANIMATE_MODEL, REPLICATE_ANIMATE_IMAGE_KEY, REPLICATE_ANIMATE_INPUT_JSON
 *   PORT, ALLOWED_ORIGINS
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import Replicate from "replicate";

/* ---------------- 설정 ---------------- */
const PORT = process.env.PORT || 8787;
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || "";

// 배경 제거(컷아웃) — 빠르고 저렴, 데모에서 라이브로 호출
const CUTOUT_MODEL = process.env.REPLICATE_CUTOUT_MODEL || "851-labs/background-remover";
const CUTOUT_IMAGE_KEY = process.env.REPLICATE_CUTOUT_IMAGE_KEY || "image";

// 이미지→비디오(애니메이트) — 느리고 유료, 데모에서는 사전 생성 권장
//  (구버전 .env 호환: REPLICATE_MODEL / REPLICATE_IMAGE_KEY 도 인식)
const ANIMATE_MODEL =
    process.env.REPLICATE_ANIMATE_MODEL ||
    process.env.REPLICATE_MODEL ||
    "stability-ai/stable-video-diffusion";
const ANIMATE_IMAGE_KEY =
    process.env.REPLICATE_ANIMATE_IMAGE_KEY ||
    process.env.REPLICATE_IMAGE_KEY ||
    "input_image";

const CUTOUT_EXTRA = parseJsonEnv(process.env.REPLICATE_CUTOUT_INPUT_JSON);
const ANIMATE_EXTRA = parseJsonEnv(
    process.env.REPLICATE_ANIMATE_INPUT_JSON || process.env.REPLICATE_INPUT_JSON
);

/* ---------------- 클라이언트(지연 생성) ---------------- */
let _replicate;
function replicate() {
    if (!REPLICATE_TOKEN) throw httpError(503, "REPLICATE_API_TOKEN 미설정");
    // useFileOutput:false → 출력 파일을 일반 URL 문자열로 받음(프록시로 그대로 전달하기 쉬움)
    return (_replicate ||= new Replicate({ auth: REPLICATE_TOKEN, useFileOutput: false }));
}

/* ---------------- 유틸 ---------------- */
function httpError(status, message) {
    const e = new Error(message);
    e.status = status;
    return e;
}

function parseJsonEnv(raw) {
    if (!raw) return {};
    try {
        const v = JSON.parse(raw);
        return v && typeof v === "object" ? v : {};
    } catch {
        console.warn("[warn] INPUT_JSON 파싱 실패 — 무시:", raw);
        return {};
    }
}

// "data:image/png;base64,xxxx" 또는 순수 base64 → { buffer, contentType }
function decodeImage(input) {
    if (!input || typeof input !== "string") throw httpError(400, "image(dataURL) 필요");
    const m = /^data:([^;]+);base64,(.*)$/s.exec(input);
    const contentType = m ? m[1] : "image/jpeg";
    const b64 = m ? m[2] : input;
    const buffer = Buffer.from(b64, "base64");
    if (!buffer.length) throw httpError(400, "이미지 디코드 실패");
    return { buffer, contentType };
}

// Replicate 파일 스토리지에 업로드 → 모델이 가져갈 수 있는 URL 반환(S3 대체)
async function uploadImage(buffer, contentType) {
    const blob = new Blob([buffer], { type: contentType || "application/octet-stream" });
    const file = await replicate().files.create(blob);
    const url = file && file.urls && file.urls.get;
    if (!url) throw httpError(502, "Replicate 파일 업로드 실패");
    return url;
}

// 모델 출력에서 최종 결과 URL 한 개만 추출(문자열/배열/객체 모두 대응)
function outputToUrl(o) {
    if (o == null) return null;
    if (typeof o === "string") return o;
    if (Array.isArray(o)) return outputToUrl(o[o.length - 1]);
    if (typeof o === "object") {
        const u = o.url;
        if (typeof u === "function") {
            const r = u.call(o);
            return r && r.href ? r.href : typeof r === "string" ? r : null;
        }
        if (u && typeof u === "object" && u.href) return u.href;
        if (typeof u === "string") return u;
        return o.video || o.image || o.output || o.mp4 || null;
    }
    return null;
}

// "owner/model" 또는 "owner/model:version" → predictions.create 인자
function predictionArgs(ref, input) {
    return ref.includes(":")
        ? { version: ref.split(":")[1], input }
        : { model: ref, input };
}

// 컷아웃 모델 레퍼런스 해석: "owner/name"이면 최신 버전을 붙여 "owner/name:version"으로.
// (851-labs/background-remover 같은 커뮤니티 모델은 /v1/models/.../predictions 가 404 →
//  버전 핀이 있어야 /v1/predictions 로 정상 실행됨. 첫 호출에 1번만 조회 후 캐시.)
let _cutoutRef;
async function cutoutRef() {
    if (_cutoutRef) return _cutoutRef;
    if (CUTOUT_MODEL.includes(":")) return (_cutoutRef = CUTOUT_MODEL);
    const [owner, name] = CUTOUT_MODEL.split("/");
    try {
        const m = await replicate().models.get(owner, name);
        const ver = m && m.latest_version && m.latest_version.id;
        _cutoutRef = ver ? `${CUTOUT_MODEL}:${ver}` : CUTOUT_MODEL;
    } catch {
        _cutoutRef = CUTOUT_MODEL; // 조회 실패 시 원본 그대로(원래대로 시도)
    }
    return _cutoutRef;
}

/* ---------------- 앱 ---------------- */
const app = express();
app.use(express.json({ limit: "15mb" }));

const origins = (process.env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim());
app.use(cors({ origin: origins.includes("*") ? true : origins }));

app.get("/", (_req, res) => {
    res.type("text").send("Petpy thin backend — see /health, POST /api/cutout, /api/animate");
});

app.get("/health", (_req, res) => {
    res.json({
        ok: true,
        services: {
            replicate: !!REPLICATE_TOKEN,
            cutoutModel: CUTOUT_MODEL,
            animateModel: ANIMATE_MODEL,
        },
    });
});

// 배경 제거(컷아웃) — 라이브 호출. run()은 완료까지 기다렸다 결과 URL을 돌려줌.
app.post("/api/cutout", async (req, res, next) => {
    try {
        const { buffer, contentType } = decodeImage(req.body && req.body.image);
        const imageUrl = await uploadImage(buffer, contentType);
        const input = { [CUTOUT_IMAGE_KEY]: imageUrl, ...CUTOUT_EXTRA };
        const output = await replicate().run(await cutoutRef(), { input });
        const image = outputToUrl(output);
        if (!image) throw httpError(502, "컷아웃 결과 없음");
        res.json({ ok: true, image });
    } catch (e) {
        next(e);
    }
});

// 이미지 → 비디오: 예측 시작(느림 → 폴링). 데모에서는 사전 생성 권장.
app.post("/api/animate", async (req, res, next) => {
    try {
        const { buffer, contentType } = decodeImage(req.body && req.body.image);
        const imageUrl = await uploadImage(buffer, contentType);
        const input = { [ANIMATE_IMAGE_KEY]: imageUrl, ...ANIMATE_EXTRA };
        const prediction = await replicate().predictions.create(predictionArgs(ANIMATE_MODEL, input));
        res.json({ id: prediction.id, status: prediction.status });
    } catch (e) {
        next(e);
    }
});

// 이미지 → 비디오: 상태/결과 폴링
app.get("/api/animate/:id", async (req, res, next) => {
    try {
        const p = await replicate().predictions.get(req.params.id);
        const video = p.status === "succeeded" ? outputToUrl(p.output) : null;
        res.json({ status: p.status, video, error: p.error || null });
    } catch (e) {
        next(e);
    }
});

// 에러 핸들러
app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500) console.error("[error]", err.message);
    res.status(status).json({ ok: false, error: err.message || "server error" });
});

app.listen(PORT, () => {
    console.log(`Petpy thin backend listening on :${PORT}`);
    console.log(`  replicate=${!!REPLICATE_TOKEN} cutout=${CUTOUT_MODEL} animate=${ANIMATE_MODEL}`);
});
