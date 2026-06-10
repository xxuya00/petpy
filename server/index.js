/*
 * Petpy — separate backend (Node/Express, ESM)
 *
 * Endpoints
 *   GET  /health                 서비스 설정 상태
 *   POST /api/moderate           Rekognition 동물 판별  { image } -> { ok, matched, labels }
 *   POST /api/posts              동물 통과 시 S3 업로드 + DynamoDB 저장  { image, name, handle, desc }
 *   GET  /api/posts              공유 피드 목록(최신순, presigned URL)
 *   POST /api/animate            Replicate 이미지→비디오 예측 시작  { image } -> { id }
 *   GET  /api/animate/:id        예측 상태/결과  -> { status, video, error }
 *
 * 키는 환경변수에서만 읽습니다(코드/프론트에 노출 금지).
 *   REPLICATE_API_TOKEN, REPLICATE_MODEL, REPLICATE_IMAGE_KEY, REPLICATE_INPUT_JSON
 *   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET, DDB_TABLE
 *   PORT, ALLOWED_ORIGINS, MODERATION_MIN_CONFIDENCE, PRESIGN_EXPIRES
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "node:crypto";

import Replicate from "replicate";
import { RekognitionClient, DetectLabelsCommand } from "@aws-sdk/client-rekognition";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

/* ---------------- 설정 ---------------- */
const PORT = process.env.PORT || 8787;
const REGION = process.env.AWS_REGION || "us-east-1";
const S3_BUCKET = process.env.S3_BUCKET || "";
const DDB_TABLE = process.env.DDB_TABLE || "petpy-posts";
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || "";
const REPLICATE_MODEL = process.env.REPLICATE_MODEL || "stability-ai/stable-video-diffusion";
const REPLICATE_IMAGE_KEY = process.env.REPLICATE_IMAGE_KEY || "input_image";
const MIN_CONF = Number(process.env.MODERATION_MIN_CONFIDENCE || 80);
const PRESIGN_EXPIRES = Math.min(Number(process.env.PRESIGN_EXPIRES || 604800), 604800); // SigV4 최대 7일

// 동물로 인정할 라벨/카테고리
const ANIMAL_LABELS = new Set(
    (process.env.ANIMAL_LABELS ||
        "Animal,Pet,Dog,Cat,Puppy,Kitten,Canine,Feline,Mammal,Bird,Hamster,Rabbit,Bunny,Reptile,Fish,Wildlife,Horse,Hedgehog,Ferret,Guinea Pig,Parrot,Turtle,Rodent,Pig,Lizard,Snake,Fox,Squirrel"
    ).split(",").map((s) => s.trim()).filter(Boolean)
);
const ANIMAL_CATEGORIES = new Set(["Animals and Pets"]);

/* ---------------- 클라이언트(지연 생성) ---------------- */
let _rek, _s3, _ddb, _replicate;
function rek() { return (_rek ||= new RekognitionClient({ region: REGION })); }
function s3() { return (_s3 ||= new S3Client({ region: REGION })); }
function ddb() { return (_ddb ||= DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }))); }
function replicate() {
    if (!REPLICATE_TOKEN) throw httpError(503, "REPLICATE_API_TOKEN 미설정");
    return (_replicate ||= new Replicate({ auth: REPLICATE_TOKEN }));
}

/* ---------------- 유틸 ---------------- */
function httpError(status, message) {
    const e = new Error(message);
    e.status = status;
    return e;
}

// "data:image/png;base64,xxxx" 또는 순수 base64 → { buffer, contentType, ext }
function decodeImage(input) {
    if (!input || typeof input !== "string") throw httpError(400, "image(dataURL) 필요");
    const m = /^data:([^;]+);base64,(.*)$/s.exec(input);
    const contentType = m ? m[1] : "image/jpeg";
    const b64 = m ? m[2] : input;
    const buffer = Buffer.from(b64, "base64");
    if (!buffer.length) throw httpError(400, "이미지 디코드 실패");
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[contentType] || "bin";
    return { buffer, contentType, ext };
}

function requireBucket() {
    if (!S3_BUCKET) throw httpError(503, "S3_BUCKET 미설정");
    return S3_BUCKET;
}

async function uploadToS3(buffer, contentType, key) {
    const Bucket = requireBucket();
    await s3().send(new PutObjectCommand({ Bucket, Key: key, Body: buffer, ContentType: contentType }));
    return key;
}

async function presign(key) {
    const Bucket = requireBucket();
    return getSignedUrl(s3(), new GetObjectCommand({ Bucket, Key: key }), { expiresIn: PRESIGN_EXPIRES });
}

// Rekognition 동물 판별
async function detectAnimal(buffer) {
    const out = await rek().send(new DetectLabelsCommand({
        Image: { Bytes: buffer },
        MaxLabels: 30,
        MinConfidence: Math.min(MIN_CONF, 55), // 후보는 낮게 받고 아래서 판정
    }));
    const labels = out.Labels || [];
    const matched = [];
    for (const l of labels) {
        const conf = l.Confidence || 0;
        if (conf < MIN_CONF) continue;
        const byName = ANIMAL_LABELS.has(l.Name);
        const byParent = (l.Parents || []).some((p) => ANIMAL_LABELS.has(p.Name));
        const byCat = (l.Categories || []).some((c) => ANIMAL_CATEGORIES.has(c.Name));
        if (byName || byParent || byCat) matched.push({ name: l.Name, confidence: Math.round(conf) });
    }
    const top = labels.slice(0, 8).map((l) => ({ name: l.Name, confidence: Math.round(l.Confidence || 0) }));
    return { ok: matched.length > 0, matched, labels: top };
}

/* ---------------- 앱 ---------------- */
const app = express();
app.use(express.json({ limit: "15mb" }));

const origins = (process.env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim());
app.use(cors({ origin: origins.includes("*") ? true : origins }));

app.get("/", (_req, res) => {
    res.type("text").send("Petpy backend — see /health, POST /api/moderate, /api/posts, /api/animate");
});

app.get("/health", (_req, res) => {
    res.json({
        ok: true,
        services: {
            replicate: !!REPLICATE_TOKEN,
            s3: !!S3_BUCKET,
            region: REGION,
            ddbTable: DDB_TABLE,
            replicateModel: REPLICATE_MODEL,
        },
    });
});

// 동물 판별만
app.post("/api/moderate", async (req, res, next) => {
    try {
        const { buffer } = decodeImage(req.body && req.body.image);
        const result = await detectAnimal(buffer);
        res.json(result);
    } catch (e) { next(e); }
});

// 공유 피드: 업로드(동물 통과 시 저장)
app.post("/api/posts", async (req, res, next) => {
    try {
        const body = req.body || {};
        const { buffer, contentType, ext } = decodeImage(body.image);
        const name = String(body.name || "").trim().slice(0, 20);
        if (!name) throw httpError(400, "name 필요");

        const verdict = await detectAnimal(buffer);
        if (!verdict.ok) {
            return res.status(422).json({ ok: false, reason: "not_animal", ...verdict });
        }

        const id = crypto.randomBytes(6).toString("hex");
        const key = `posts/${id}.${ext}`;
        await uploadToS3(buffer, contentType, key);

        const item = {
            id,
            name,
            handle: String(body.handle || "").trim().slice(0, 24),
            desc: String(body.desc || "").trim().slice(0, 60),
            key,
            ts: Date.now(),
        };
        await ddb().send(new PutCommand({ TableName: DDB_TABLE, Item: item }));

        const img = await presign(key);
        res.json({ ok: true, post: { id: item.id, name: item.name, handle: item.handle, desc: item.desc, ts: item.ts, img } });
    } catch (e) { next(e); }
});

// 공유 피드: 목록(최신순)
app.get("/api/posts", async (_req, res, next) => {
    try {
        const out = await ddb().send(new ScanCommand({ TableName: DDB_TABLE, Limit: 100 }));
        const items = (out.Items || []).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 50);
        const posts = await Promise.all(items.map(async (it) => ({
            id: it.id, name: it.name, handle: it.handle, desc: it.desc, ts: it.ts,
            img: await presign(it.key),
        })));
        res.json({ posts });
    } catch (e) { next(e); }
});

// 이미지 → 비디오: 예측 시작
app.post("/api/animate", async (req, res, next) => {
    try {
        const { buffer, contentType, ext } = decodeImage(req.body && req.body.image);
        // Replicate가 가져갈 수 있도록 S3에 임시 업로드 후 presigned URL 전달
        const key = `animate/${crypto.randomBytes(6).toString("hex")}.${ext}`;
        await uploadToS3(buffer, contentType, key);
        const imageUrl = await presign(key);

        let extra = {};
        if (process.env.REPLICATE_INPUT_JSON) {
            try { extra = JSON.parse(process.env.REPLICATE_INPUT_JSON); } catch { /* 무시 */ }
        }
        const input = { [REPLICATE_IMAGE_KEY]: imageUrl, ...extra };

        const args = REPLICATE_MODEL.includes(":")
            ? { version: REPLICATE_MODEL.split(":")[1], input }
            : { model: REPLICATE_MODEL, input };
        const prediction = await replicate().predictions.create(args);

        res.json({ id: prediction.id, status: prediction.status });
    } catch (e) { next(e); }
});

// 이미지 → 비디오: 상태/결과 폴링
app.get("/api/animate/:id", async (req, res, next) => {
    try {
        const p = await replicate().predictions.get(req.params.id);
        let video = null;
        if (p.status === "succeeded") {
            const o = p.output;
            if (Array.isArray(o)) video = o[o.length - 1];
            else if (typeof o === "string") video = o;
            else if (o && typeof o === "object") video = o.video || o.mp4 || null;
        }
        res.json({ status: p.status, video, error: p.error || null });
    } catch (e) { next(e); }
});

// 에러 핸들러
app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500) console.error("[error]", err.message);
    res.status(status).json({ ok: false, error: err.message || "server error" });
});

app.listen(PORT, () => {
    console.log(`Petpy backend listening on :${PORT}`);
    console.log(`  replicate=${!!REPLICATE_TOKEN} s3=${!!S3_BUCKET} region=${REGION} table=${DDB_TABLE} model=${REPLICATE_MODEL}`);
});
