/*
 * Forever Garden — Petpy core feature
 * 펫 사진을 카메라(거실) 위에 소환해 떠다니게 하고, 스크린샷으로 저장·공유한다.
 * 정적 / 백엔드 없음 / API 키 없음. 카메라 불가 시 가든 배경으로 폴백.
 */
(function () {
    "use strict";

    var overlay, modal, canvas, ctx, video, loadingEl, fileInput, dropZone,
        nameInput, startBtn, stepUpload, stepScene, feedbackLink, hintEl, aiBadge, bgBar,
        videoBtn, resultVideo, videoStatusEl, videoBack;

    var state = {
        img: null,          // 즉시 표시용(부드러운 페더 마스크) 캔버스
        imgRatio: 1,        // 페더 펫 세로/가로 비율
        cutout: null,       // AI 누끼(배경 투명) 캔버스
        cutoutRatio: 1,     // 누끼 펫 세로/가로 비율
        aiStatus: "idle",   // idle | running | done | failed
        swapT0: 0,          // 페더→누끼 크로스페이드 시작 시각
        appearT0: 0,        // 등장 애니메이션 시작 시각
        burst: [],          // 전환 반짝임 파티클
        bgKey: "night",     // 배경 테마 키 또는 "camera"
        ambient: [],        // 떠다니는 하트/반짝임
        lastHeart: 0,       // 마지막 하트 생성 시각
        petName: "",
        stream: null,
        raf: null,
        useCamera: false,
        pet: { x: 0, y: 0, scale: 1 },
        particles: [],
        pointers: {},       // 드래그/핀치용
        pinchDist: 0,
        t0: 0,
        // ----- Replicate 이미지→비디오 -----
        srcDataUrl: null,   // 원본 사진 Data URL (영상 생성 입력)
        videoStatus: "idle",// idle | running | done | failed
        videoUrl: null,     // 완성된 mp4 URL
        animPollTimer: null // 폴링 타이머
    };

    /* ---------- 유틸 ---------- */
    function track(name) {
        try { if (window.trackClick) window.trackClick(name); } catch (e) {}
    }
    function api() { return (window.PETPY_API || "").replace(/\/+$/, ""); }
    // 원본 이미지를 Data URL(JPEG)로 — /api/animate 입력용
    function imageToDataUrl(image, maxSize, quality) {
        var w = image.naturalWidth, h = image.naturalHeight;
        var s = Math.min(1, maxSize / Math.max(w, h));
        w = Math.round(w * s); h = Math.round(h * s);
        var c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(image, 0, 0, w, h);
        return c.toDataURL("image/jpeg", quality || 0.85);
    }
    function toast(msg) {
        try { if (window.showToast) window.showToast(msg); } catch (e) {}
    }
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function easeOutBack(t) {
        var c1 = 1.70158, c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    /* ---------- 펫 이미지 소프트 마스크 ---------- */
    // 직사각 사진을 부드러운 원형 페더 마스크로 처리해 '소환된 형상'처럼 보이게 한다.
    function buildMaskedPet(image) {
        var w = image.naturalWidth, h = image.naturalHeight;
        var max = 900;
        if (Math.max(w, h) > max) {
            var s = max / Math.max(w, h);
            w = Math.round(w * s); h = Math.round(h * s);
        }
        var c = document.createElement("canvas");
        c.width = w; c.height = h;
        var x = c.getContext("2d");
        x.drawImage(image, 0, 0, w, h);

        // 가장자리를 부드럽게 녹여 '소환된 형상'처럼 보이게 (타원형 페더 마스크)
        x.globalCompositeOperation = "destination-in";
        x.save();
        x.translate(w / 2, h / 2);
        x.scale(w, h); // 단위 좌표계 → 종횡비에 맞는 타원
        var g = x.createRadialGradient(0, 0, 0.1, 0, 0, 0.52);
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(0.55, "rgba(0,0,0,1)");
        g.addColorStop(0.8, "rgba(0,0,0,0.55)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        x.fillStyle = g;
        x.fillRect(-0.5, -0.5, 1, 1);
        x.restore();
        x.globalCompositeOperation = "source-over";

        state.imgRatio = h / w;
        return c;
    }

    /* ---------- AI 누끼 (배경 제거) — @imgly/background-removal, 100% 브라우저 ---------- */
    var _bgLib = null;
    function loadBgLib() {
        if (!_bgLib) {
            _bgLib = import("https://cdn.jsdelivr.net/npm/@imgly/background-removal@1/+esm");
        }
        return _bgLib;
    }

    function blobToCanvas(blob, maxSize) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(blob);
            var img = new Image();
            img.onload = function () {
                var w = img.naturalWidth, h = img.naturalHeight;
                var s = Math.min(1, maxSize / Math.max(w, h));
                w = Math.round(w * s); h = Math.round(h * s);
                var c = document.createElement("canvas");
                c.width = w; c.height = h;
                c.getContext("2d").drawImage(img, 0, 0, w, h);
                URL.revokeObjectURL(url);
                resolve(c);
            };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("blob load fail")); };
            img.src = url;
        });
    }

    // 투명 여백을 잘라 펫을 꽉 차게 — 접지 그림자/배치가 자연스러워진다.
    function trimAlpha(cv, pad) {
        var w = cv.width, h = cv.height;
        var data;
        try { data = cv.getContext("2d").getImageData(0, 0, w, h).data; }
        catch (e) { return cv; }
        var minX = w, minY = h, maxX = 0, maxY = 0, found = false;
        for (var yy = 0; yy < h; yy++) {
            for (var xx = 0; xx < w; xx++) {
                if (data[(yy * w + xx) * 4 + 3] > 12) {
                    found = true;
                    if (xx < minX) minX = xx;
                    if (xx > maxX) maxX = xx;
                    if (yy < minY) minY = yy;
                    if (yy > maxY) maxY = yy;
                }
            }
        }
        if (!found) return cv;
        pad = pad || 0;
        minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
        maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
        var cw = maxX - minX + 1, ch = maxY - minY + 1;
        var out = document.createElement("canvas");
        out.width = cw; out.height = ch;
        out.getContext("2d").drawImage(cv, minX, minY, cw, ch, 0, 0, cw, ch);
        return out;
    }

    function setAiBadgeText(txt) {
        if (!aiBadge) return;
        aiBadge.textContent = txt;
        aiBadge.classList.add("show");
    }
    function setAiBadge(status) {
        if (!aiBadge) return;
        if (status === "running") {
            aiBadge.textContent = "✨ AI 누끼 준비 중…";
            aiBadge.classList.remove("done");
            aiBadge.classList.add("show");
        } else if (status === "done") {
            aiBadge.textContent = "✅ AI 누끼 적용됨";
            aiBadge.classList.add("show", "done");
            clearTimeout(aiBadge._t);
            aiBadge._t = setTimeout(function () { aiBadge.classList.remove("show"); }, 2800);
        } else {
            aiBadge.classList.remove("show", "done");
        }
    }

    function runCutout(file) {
        state.aiStatus = "running";
        setAiBadge("running");
        track("AR_AI_START");
        loadBgLib().then(function (mod) {
            return mod.removeBackground(file, {
                model: "isnet_fp16",
                output: { format: "image/png" },
                progress: function (key, cur, total) {
                    if (total && /fetch|download/i.test(key)) {
                        setAiBadgeText("✨ AI 모델 받는 중 " + Math.round(cur / total * 100) + "% (최초 1회)");
                    } else if (/compute|inference|process/i.test(key)) {
                        setAiBadgeText("✨ AI가 누끼 따는 중…");
                    }
                }
            });
        }).then(function (blob) {
            return blobToCanvas(blob, 1100);
        }).then(function (cv) {
            var trimmed = trimAlpha(cv, 6);
            state.cutout = trimmed;
            state.cutoutRatio = trimmed.height / trimmed.width;
            state.aiStatus = "done";
            setAiBadge("done");
            track("AR_AI_DONE");
            triggerSwap();
        }).catch(function (e) {
            state.aiStatus = "failed";
            setAiBadge("failed");
            track("AR_AI_FAIL");
        });
    }

    function triggerSwap() {
        if (!stepScene || !stepScene.classList.contains("active")) {
            state.swapT0 = 0;   // 씬 진입 시 자연스럽게 누끼로 표시됨
            return;
        }
        state.swapT0 = performance.now();
        var px = state.pet.x || (canvas.clientWidth / 2);
        var py = state.pet.y || (canvas.clientHeight * 0.55);
        spawnBurst(px, py);
        toast("✨ AI 누끼 완성! 더 또렷해졌어요");
    }

    /* ---------- 파티클 (반딧불) ---------- */
    function initParticles(w, h) {
        state.particles = [];
        var n = 42;
        for (var i = 0; i < n; i++) {
            state.particles.push({
                x: Math.random() * w,
                y: Math.random() * h,
                r: 1 + Math.random() * 2.4,
                sp: 0.15 + Math.random() * 0.5,
                sway: 6 + Math.random() * 18,
                phase: Math.random() * Math.PI * 2,
                swaySpeed: 0.01 + Math.random() * 0.02,
                pulse: Math.random() * Math.PI * 2
            });
        }
    }

    function drawParticles(w, h, dt) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (var i = 0; i < state.particles.length; i++) {
            var p = state.particles[i];
            p.y -= p.sp;
            p.phase += p.swaySpeed;
            p.pulse += 0.03;
            var px = p.x + Math.sin(p.phase) * p.sway;
            if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
            var a = 0.35 + Math.sin(p.pulse) * 0.3;
            var gg = ctx.createRadialGradient(px, p.y, 0, px, p.y, p.r * 4);
            gg.addColorStop(0, "rgba(255,228,170," + a + ")");
            gg.addColorStop(1, "rgba(255,228,170,0)");
            ctx.fillStyle = gg;
            ctx.beginPath();
            ctx.arc(px, p.y, p.r * 4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    /* ---------- 소환 반짝임 (페더→누끼 전환 시) ---------- */
    function spawnBurst(px, py) {
        state.burst = [];
        for (var i = 0; i < 30; i++) {
            var ang = Math.random() * Math.PI * 2;
            var spd = 1.2 + Math.random() * 4;
            state.burst.push({
                x: px, y: py,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd - 0.6,
                life: 1,
                decay: 0.012 + Math.random() * 0.022,
                r: 1.6 + Math.random() * 3.2,
                hue: Math.random() < 0.5 ? "255,205,140" : "255,150,190"
            });
        }
    }
    function drawBurst() {
        if (!state.burst || !state.burst.length) return;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (var i = state.burst.length - 1; i >= 0; i--) {
            var b = state.burst[i];
            b.x += b.vx; b.y += b.vy; b.vy += 0.05; b.life -= b.decay;
            if (b.life <= 0) { state.burst.splice(i, 1); continue; }
            var rr = b.r * 3;
            var gg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, rr);
            gg.addColorStop(0, "rgba(" + b.hue + "," + b.life.toFixed(3) + ")");
            gg.addColorStop(1, "rgba(" + b.hue + ",0)");
            ctx.fillStyle = gg;
            ctx.beginPath();
            ctx.arc(b.x, b.y, rr, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    /* ---------- 떠다니는 하트 / 반짝임 (펫 주변 생동감) ---------- */
    function heartPath(cx, cy, s) {
        var top = cy - s * 0.35;
        ctx.beginPath();
        ctx.moveTo(cx, cy + s * 0.5);
        ctx.bezierCurveTo(cx - s, cy - s * 0.1, cx - s * 0.55, top - s * 0.45, cx, top);
        ctx.bezierCurveTo(cx + s * 0.55, top - s * 0.45, cx + s, cy - s * 0.1, cx, cy + s * 0.5);
        ctx.closePath();
    }
    function spawnHeart() {
        state.ambient.push({
            x: state.pet.x + (Math.random() - 0.5) * 50,
            y: state.pet.y + (Math.random() - 0.2) * 30,
            vy: -(0.35 + Math.random() * 0.5),
            sway: Math.random() * Math.PI * 2,
            swaySp: 0.02 + Math.random() * 0.025,
            life: 1,
            decay: 0.006 + Math.random() * 0.004,
            s: 7 + Math.random() * 7,
            kind: Math.random() < 0.45 ? "heart" : "spark",
            hue: Math.random() < 0.5 ? "255,150,190" : "255,210,150"
        });
    }
    function drawHearts() {
        if (!state.ambient.length) return;
        ctx.save();
        for (var i = state.ambient.length - 1; i >= 0; i--) {
            var a = state.ambient[i];
            a.y += a.vy; a.sway += a.swaySp; a.life -= a.decay;
            if (a.life <= 0) { state.ambient.splice(i, 1); continue; }
            var x = a.x + Math.sin(a.sway) * 9;
            var al = Math.min(a.life, 1);
            if (a.kind === "heart") {
                ctx.globalCompositeOperation = "source-over";
                ctx.globalAlpha = al * 0.7;
                ctx.fillStyle = "rgba(" + a.hue + ",1)";
                heartPath(x, a.y, a.s);
                ctx.fill();
            } else {
                ctx.globalCompositeOperation = "lighter";
                ctx.globalAlpha = 1;
                var rr = a.s * 0.7;
                var gg = ctx.createRadialGradient(x, a.y, 0, x, a.y, rr);
                gg.addColorStop(0, "rgba(" + a.hue + "," + (al * 0.8).toFixed(3) + ")");
                gg.addColorStop(1, "rgba(" + a.hue + ",0)");
                ctx.fillStyle = gg;
                ctx.beginPath(); ctx.arc(x, a.y, rr, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.restore();
    }

    /* ---------- 배경 테마 (카메라 또는 다양한 가든 씬) ---------- */
    function hash01(i, seed) {
        var x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
        return x - Math.floor(x);
    }
    function fillV(w, h, stops) {
        var g = ctx.createLinearGradient(0, 0, 0, h);
        for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
    }
    function drawStars(w, h, t, count, seed, maxA) {
        ctx.save();
        ctx.fillStyle = "#ffffff";
        for (var i = 0; i < count; i++) {
            var sx = hash01(i, seed) * w;
            var sy = hash01(i, seed + 1) * h * 0.95;
            var r = 0.5 + hash01(i, seed + 2) * 1.7;
            var tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.0015 + i * 1.7));
            ctx.globalAlpha = tw * (maxA || 0.9);
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    function auroraBand(w, h, t, baseY, amp, color, phase) {
        var steps = Math.ceil(w / 14), i, x, y;
        ctx.beginPath();
        for (i = 0; i <= steps; i++) {
            x = i * 14;
            y = baseY + Math.sin(x * 0.012 + t * 0.0006 + phase) * amp + Math.sin(x * 0.028 - t * 0.0011 + phase) * amp * 0.4;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        for (i = steps; i >= 0; i--) {
            x = i * 14;
            y = baseY + h * 0.16 + Math.sin(x * 0.012 + t * 0.0006 + phase) * amp;
            ctx.lineTo(x, y);
        }
        ctx.closePath();
        var lg = ctx.createLinearGradient(0, baseY - amp, 0, baseY + h * 0.16);
        lg.addColorStop(0, "rgba(" + color + ",0)");
        lg.addColorStop(0.45, "rgba(" + color + ",0.30)");
        lg.addColorStop(1, "rgba(" + color + ",0)");
        ctx.fillStyle = lg;
        ctx.fill();
    }
    function nebula(x, y, r, color) {
        var g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, "rgba(" + color + ",0.5)");
        g.addColorStop(0.5, "rgba(" + color + ",0.18)");
        g.addColorStop(1, "rgba(" + color + ",0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    function drawPetals(w, h, t, n) {
        ctx.save();
        for (var i = 0; i < n; i++) {
            var px = hash01(i, 5) * w + Math.sin(t * 0.0006 + i) * w * 0.05;
            var fall = t * 0.018 * (0.5 + hash01(i, 6)) + hash01(i, 7) * (h + 80);
            var py = (fall % (h + 80)) - 40;
            var s = 5 + hash01(i, 9) * 6;
            var rot = t * 0.0011 * (0.5 + hash01(i, 8)) + i;
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(rot);
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = i % 3 === 0 ? "rgba(255,225,235,0.9)" : "rgba(255,183,206,0.9)";
            ctx.beginPath();
            ctx.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    var BG_THEMES = [
        {
            key: "night", label: "🌙 밤 정원",
            draw: function (w, h, t) {
                fillV(w, h, [[0, "#1a0f2e"], [0.5, "#2d1b3d"], [1, "#3d2a3a"]]);
                var rg = ctx.createRadialGradient(w / 2, h * 1.05, h * 0.1, w / 2, h * 1.05, h * 0.7);
                rg.addColorStop(0, "rgba(255,142,83,0.35)");
                rg.addColorStop(0.5, "rgba(196,113,237,0.15)");
                rg.addColorStop(1, "rgba(196,113,237,0)");
                ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
                drawStars(w, h, t, 60, 1, 0.8);
            }
        },
        {
            key: "sunset", label: "🌅 노을",
            draw: function (w, h, t) {
                fillV(w, h, [[0, "#241844"], [0.45, "#7a3f6b"], [0.75, "#ff8e53"], [1, "#ffd28a"]]);
                ctx.save();
                ctx.globalCompositeOperation = "lighter";
                var sun = ctx.createRadialGradient(w * 0.5, h * 0.82, 0, w * 0.5, h * 0.82, h * 0.42);
                sun.addColorStop(0, "rgba(255,240,200,0.9)");
                sun.addColorStop(0.4, "rgba(255,180,110,0.45)");
                sun.addColorStop(1, "rgba(255,150,90,0)");
                ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h);
                ctx.restore();
                drawStars(w, h, t, 26, 4, 0.5);
            }
        },
        {
            key: "aurora", label: "🌌 오로라",
            draw: function (w, h, t) {
                fillV(w, h, [[0, "#050a1f"], [0.6, "#0a1b34"], [1, "#06101e"]]);
                drawStars(w, h, t, 90, 7, 0.9);
                ctx.save();
                ctx.globalCompositeOperation = "lighter";
                auroraBand(w, h, t, h * 0.30, h * 0.05, "120,255,180", 0);
                auroraBand(w, h, t, h * 0.40, h * 0.045, "90,210,255", 1.6);
                auroraBand(w, h, t, h * 0.50, h * 0.04, "180,130,255", 3.1);
                ctx.restore();
            }
        },
        {
            key: "sakura", label: "🌸 벚꽃",
            draw: function (w, h, t) {
                fillV(w, h, [[0, "#3a2740"], [0.5, "#7e4a72"], [1, "#e89ab5"]]);
                ctx.save();
                ctx.globalCompositeOperation = "lighter";
                var moon = ctx.createRadialGradient(w * 0.72, h * 0.22, 0, w * 0.72, h * 0.22, h * 0.18);
                moon.addColorStop(0, "rgba(255,240,250,0.85)");
                moon.addColorStop(1, "rgba(255,240,250,0)");
                ctx.fillStyle = moon; ctx.fillRect(0, 0, w, h);
                ctx.restore();
                drawPetals(w, h, t, 24);
            }
        },
        {
            key: "galaxy", label: "✨ 우주",
            draw: function (w, h, t) {
                var bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
                bg.addColorStop(0, "#1c1238"); bg.addColorStop(0.6, "#0b0820"); bg.addColorStop(1, "#04030a");
                ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
                ctx.save();
                ctx.globalCompositeOperation = "lighter";
                nebula(w * (0.35 + 0.04 * Math.sin(t * 0.0004)), h * 0.4, h * 0.32, "120,80,220");
                nebula(w * (0.65 + 0.04 * Math.cos(t * 0.0005)), h * 0.55, h * 0.30, "60,120,230");
                nebula(w * 0.5, h * (0.3 + 0.03 * Math.sin(t * 0.0006)), h * 0.26, "230,90,170");
                ctx.restore();
                drawStars(w, h, t, 130, 11, 1);
            }
        }
    ];

    function themeByKey(k) {
        for (var i = 0; i < BG_THEMES.length; i++) if (BG_THEMES[i].key === k) return BG_THEMES[i];
        return null;
    }
    function setActiveBg(key) {
        state.bgKey = key;
        if (!bgBar) return;
        var chips = bgBar.querySelectorAll(".fg-bgchip");
        for (var i = 0; i < chips.length; i++) {
            chips[i].classList.toggle("active", chips[i].getAttribute("data-bg") === key);
        }
    }

    function drawBackground(w, h, time) {
        if (state.bgKey === "camera" && state.useCamera && video.readyState >= 2) {
            var vw = video.videoWidth, vh = video.videoHeight;
            var scale = Math.max(w / vw, h / vh);
            var dw = vw * scale, dh = vh * scale;
            ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
            return;
        }
        (themeByKey(state.bgKey) || BG_THEMES[0]).draw(w, h, time);
    }

    /* ---------- 펫 그리기 (등장·호흡·점프·꼬리흔들기 + 누끼 크로스페이드) ---------- */
    function fitDims(ratio, w, h) {
        var maxDim = Math.min(w, h) * 0.56;
        return ratio > 1 ? maxDim / ratio : maxDim;   // 반환: 펫 너비
    }

    // 한 프레임의 생동감 모션 — 둥둥/드리프트/스쿼시·스트레치/점프/꼬리흔들기
    function petMotion(t, h) {
        var bob = Math.sin(t * 0.0016) * h * 0.011 + Math.sin(t * 0.0027 + 1.3) * h * 0.005;
        var dx = Math.sin(t * 0.0011) * h * 0.006;
        var rot = Math.sin(t * 0.0009) * 0.05;
        var sp = Math.sin(t * 0.0016);
        var sy = 1 + sp * 0.045;          // 부피 보존 스쿼시/스트레치
        var sx = 1 - sp * 0.04;

        // 가벼운 점프 (약 6초마다)
        var T = 6000, ph = (((t % T) + T) % T) / T, hw = 0.22, hopY = 0;
        if (ph < hw) {
            var u = ph / hw;
            var arc = Math.sin(u * Math.PI);
            hopY = -arc * h * 0.085;
            sy *= 1 + arc * 0.06;
            sx *= 1 - arc * 0.05;
            if (u > 0.88) { var l = (u - 0.88) / 0.12, sq = Math.sin(l * Math.PI); sy *= 1 - 0.08 * sq; sx *= 1 + 0.08 * sq; }
        }
        // 신난 꼬리흔들기 (약 5초마다, 점프와 엇갈리게)
        var T2 = 5000, ph2 = ((((t + 1700) % T2) + T2) % T2) / T2, ww = 0.13;
        if (ph2 < ww) { var v = ph2 / ww; rot += Math.sin(v * Math.PI * 5) * (1 - v) * 0.10; }

        var dy = bob + hopY;
        var lift = clamp(-dy / (h * 0.09), 0, 1);
        return { dx: dx, dy: dy, sx: sx, sy: sy, rot: rot, lift: lift };
    }

    function drawPet(w, h, time) {
        var hasCut = state.aiStatus === "done" && !!state.cutout;
        var primary = hasCut ? state.cutout : state.img;
        if (!primary) return;

        var primRatio = hasCut ? state.cutoutRatio : state.imgRatio;
        var ap = state.appearT0 ? clamp((time - state.appearT0) / 720, 0, 1) : 1;
        var appearScale = 0.62 + easeOutBack(ap) * 0.38;
        var appearAlpha = easeOutCubic(ap);

        var m = petMotion(time, h);
        var px = state.pet.x + m.dx;
        var py = state.pet.y + m.dy;

        var primW = fitDims(primRatio, w, h) * state.pet.scale * appearScale;
        var primH = primW * primRatio;

        // 접지 그림자 — 지면에 고정, 점프할수록 작아지고 옅어짐
        var groundY = state.pet.y + primH / 2 * 0.98;
        var shW = primW * 0.6 * (1 - m.lift * 0.45);
        ctx.save();
        ctx.globalAlpha = (0.32 - m.lift * 0.16) * appearAlpha;
        var sg = ctx.createRadialGradient(px, groundY, 0, px, groundY, shW);
        sg.addColorStop(0, "rgba(0,0,0,0.55)");
        sg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.ellipse(px, groundY, shW, shW * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 글로우 헤일로
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = appearAlpha;
        var glowR = Math.max(primW, primH) * 0.62;
        var glow = ctx.createRadialGradient(px, py, 0, px, py, glowR);
        glow.addColorStop(0, "rgba(255,190,130,0.5)");
        glow.addColorStop(0.5, "rgba(255,140,170,0.22)");
        glow.addColorStop(1, "rgba(255,140,170,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, glowR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 펫 (등장 스케일 + 스쿼시/스트레치 + 회전)
        function blit(imgC, ratio, alpha) {
            var iw = fitDims(ratio, w, h) * state.pet.scale * appearScale;
            var ih = iw * ratio;
            ctx.save();
            ctx.globalAlpha = clamp(alpha, 0, 1) * appearAlpha;
            ctx.translate(px, py);
            ctx.rotate(m.rot);
            ctx.scale(m.sx, m.sy);
            ctx.drawImage(imgC, -iw / 2, -ih / 2, iw, ih);
            ctx.restore();
        }

        if (hasCut && state.swapT0) {
            var swp = clamp((time - state.swapT0) / 680, 0, 1);
            if (swp < 1 && state.img) blit(state.img, state.imgRatio, 1 - easeOutCubic(swp));
            blit(state.cutout, state.cutoutRatio, easeOutCubic(swp));
        } else {
            blit(primary, primRatio, 1);
        }
    }

    /* ---------- 캡션 (공유 이미지 브랜딩) ---------- */
    function drawCaption(w, h) {
        ctx.save();
        ctx.textAlign = "center";
        if (state.petName) {
            ctx.font = "700 " + Math.round(w * 0.07) + "px Inter, sans-serif";
            ctx.fillStyle = "rgba(255,255,255,0.95)";
            ctx.shadowColor = "rgba(0,0,0,0.6)";
            ctx.shadowBlur = 12;
            ctx.fillText(state.petName, w / 2, h * 0.12);
        }
        ctx.shadowBlur = 0;
        ctx.font = "600 " + Math.round(w * 0.032) + "px Inter, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fillText("Forever Garden · Petpy 🐾", w / 2, h - h * 0.035);
        ctx.restore();
    }

    /* ---------- 렌더 루프 ---------- */
    function resizeCanvas() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = canvas.clientWidth, h = canvas.clientHeight;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { w: w, h: h };
    }

    function render(now) {
        var size = resizeCanvas();
        var w = size.w, h = size.h;
        if (state.pet.x === 0 && state.pet.y === 0) {
            state.pet.x = w / 2;
            state.pet.y = h * 0.58;
        }
        ctx.clearRect(0, 0, w, h);
        drawBackground(w, h, now);
        drawParticles(w, h);
        drawPet(w, h, now);
        if (state.img && now - state.lastHeart > 1300) { spawnHeart(); state.lastHeart = now; }
        drawHearts();
        drawBurst();
        drawCaption(w, h);
        state.raf = requestAnimationFrame(render);
    }

    /* ---------- 카메라 ---------- */
    function startCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return Promise.reject(new Error("no camera api"));
        }
        return navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } }, audio: false
        }).catch(function () {
            return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        });
    }

    function stopCamera() {
        if (state.stream) {
            state.stream.getTracks().forEach(function (t) { t.stop(); });
            state.stream = null;
        }
        state.useCamera = false;
    }

    /* ---------- 단계 전환 ---------- */
    function showStep(which) {
        stepUpload.classList.toggle("active", which === "upload");
        stepScene.classList.toggle("active", which === "scene");
    }

    function goScene() {
        state.petName = (nameInput.value || "").trim().slice(0, 20);
        showStep("scene");
        loadingEl.classList.remove("hidden");
        state.pet.x = 0; state.pet.y = 0; state.pet.scale = 1;
        state.appearT0 = performance.now();
        state.burst = [];
        state.ambient = [];
        state.lastHeart = 0;
        resetVideoState();   // 새 씬: 영상 상태 초기화 (srcDataUrl은 유지)
        setActiveBg("night");
        if (state.aiStatus === "done") setAiBadge("done");
        else if (state.aiStatus === "running") setAiBadge("running");
        else setAiBadge("idle");

        startCamera().then(function (stream) {
            state.stream = stream;
            video.srcObject = stream;
            video.play();
            state.useCamera = true;
            loadingEl.classList.add("hidden");
            var camChip = bgBar && bgBar.querySelector('[data-bg="camera"]');
            if (camChip) camChip.style.display = "";
            setActiveBg("camera");
            hintEl.textContent = "끌어서 이동 · 두 손가락으로 크기 · 아래에서 배경 선택 🌿";
        }).catch(function () {
            state.useCamera = false;
            loadingEl.classList.add("hidden");
            var camChip = bgBar && bgBar.querySelector('[data-bg="camera"]');
            if (camChip) camChip.style.display = "none";
            setActiveBg("night");
            hintEl.textContent = "카메라가 없어 가든으로 소환했어요 — 아래에서 배경을 바꿔보세요 🌙";
        });

        var size = { w: canvas.clientWidth, h: canvas.clientHeight };
        initParticles(size.w || 360, size.h || 640);
        if (!state.raf) state.raf = requestAnimationFrame(render);
    }

    /* ---------- 업로드 ---------- */
    function loadFile(file) {
        if (!file || !/^image\//.test(file.type)) {
            toast("이미지 파일을 올려주세요 🐾");
            return;
        }
        var url = URL.createObjectURL(file);
        var image = new Image();
        image.onload = function () {
            state.img = buildMaskedPet(image);   // 즉시 표시용 페더
            state.srcDataUrl = imageToDataUrl(image, 1024, 0.85);  // 영상 생성 입력용 원본
            state.cutout = null;
            state.cutoutRatio = state.imgRatio;
            state.aiStatus = "idle";
            state.swapT0 = 0;
            URL.revokeObjectURL(url);
            startBtn.disabled = false;
            dropZone.innerHTML = "<strong>좋아요! 사진이 준비됐어요 ✓</strong><small>AI가 누끼를 따는 중이에요 — '소환하기'를 눌러도 돼요</small>";
            track("AR_PHOTO_LOADED");
            runCutout(file);   // 백그라운드 AI 누끼 시작
        };
        image.onerror = function () { toast("사진을 불러오지 못했어요"); };
        image.src = url;
    }

    /* ---------- 스크린샷 저장 / 공유 ---------- */
    function getDataUrl() {
        return canvas.toDataURL("image/png");
    }
    function downloadImg(url) {
        var a = document.createElement("a");
        a.href = url;
        a.download = "petpy-forever-garden.png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
    function saveImg() {
        downloadImg(getDataUrl());
        toast("📸 거실에 소환한 모습을 저장했어요!");
        track("AR_SAVE");
    }
    function shareImg() {
        var url = getDataUrl();
        if (navigator.share && navigator.canShare) {
            fetch(url).then(function (r) { return r.blob(); }).then(function (blob) {
                var file = new File([blob], "petpy-forever-garden.png", { type: "image/png" });
                if (navigator.canShare({ files: [file] })) {
                    return navigator.share({
                        files: [file],
                        title: "펫피 Forever Garden",
                        text: "우리 아이를 다시 만났어요 🐾 #펫피 #PETPY"
                    }).then(function () { track("AR_SHARE"); });
                }
                downloadImg(url);
                toast("📸 이미지를 저장했어요. 함께 공유해 주세요!");
                track("AR_SAVE");
            }).catch(function () { /* 사용자가 공유 취소 */ });
        } else {
            downloadImg(url);
            toast("📸 이미지를 저장했어요. 함께 공유해 주세요!");
            track("AR_SAVE");
        }
    }

    /* ---------- 진짜로 움직이게 (Replicate 이미지→비디오) ---------- */
    function setVideoStatus(txt) {
        if (!videoStatusEl) return;
        var span = videoStatusEl.querySelector(".fg-video-status-txt");
        if (span) span.textContent = txt;
        videoStatusEl.classList.add("show");
    }
    function hideVideoStatus() {
        if (videoStatusEl) videoStatusEl.classList.remove("show");
    }
    function showResultVideo(url) {
        if (!resultVideo) return;
        resultVideo.src = url;
        resultVideo.classList.add("show");
        if (videoBack) videoBack.classList.add("show");
        var p = resultVideo.play();
        if (p && p.catch) p.catch(function () {});
    }
    function hideResultVideo() {
        if (resultVideo) { resultVideo.pause(); resultVideo.classList.remove("show"); }
        if (videoBack) videoBack.classList.remove("show");
    }
    // 영상 상태 초기화 — open/goScene/close에서 공용 사용
    function resetVideoState() {
        state.videoStatus = "idle";
        state.videoUrl = null;
        if (state.animPollTimer) { clearTimeout(state.animPollTimer); state.animPollTimer = null; }
        hideResultVideo();
        hideVideoStatus();
        if (videoBtn) {
            videoBtn.disabled = false;
            videoBtn.textContent = "🎬 진짜로 움직이게";
            videoBtn.style.display = api() ? "" : "none";  // 백엔드 없으면 숨김
        }
    }
    function videoFailed(msg) {
        state.videoStatus = "failed";
        if (state.animPollTimer) { clearTimeout(state.animPollTimer); state.animPollTimer = null; }
        if (videoBtn) { videoBtn.disabled = false; videoBtn.textContent = "🎬 진짜로 움직이게"; }
        hideVideoStatus();
        track("AR_VIDEO_FAIL");
        // 캔버스 애니메이션이 그대로 폴백으로 동작 중
        toast(msg || "영상 생성에 실패했어요 — 가든 애니메이션으로 보여드릴게요 🌿");
    }

    function makeVideo() {
        var base = api();
        if (!base) { toast("영상 기능은 백엔드 연결이 필요해요"); return; }
        if (!state.srcDataUrl) { toast("사진을 먼저 올려주세요 🐾"); return; }
        if (state.videoStatus === "running") return;
        // 이미 완성된 영상이 있으면 다시 재생
        if (state.videoStatus === "done" && state.videoUrl) { showResultVideo(state.videoUrl); track("AR_VIDEO_REPLAY"); return; }

        state.videoStatus = "running";
        if (videoBtn) { videoBtn.disabled = true; }
        track("AR_VIDEO_START");
        setVideoStatus("🎬 AI가 영상으로 만드는 중… (최대 1~2분)");

        fetch(base + "/api/animate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ image: state.srcDataUrl })
        })
            .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
            .then(function (res) {
                if (res.status !== 200 || !res.data || !res.data.id) { throw new Error("create fail"); }
                pollVideo(base, res.data.id, Date.now());
            })
            .catch(function () { videoFailed(); });
    }

    function pollVideo(base, id, startedAt) {
        if (state.videoStatus !== "running") return;     // 닫힘/취소됨
        if (Date.now() - startedAt > 180000) { videoFailed("영상 생성이 너무 오래 걸려요 — 다시 시도해 주세요"); return; }
        fetch(base + "/api/animate/" + encodeURIComponent(id))
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (state.videoStatus !== "running") return;
                var st = d && d.status;
                if (st === "succeeded" && d.video) {
                    state.videoStatus = "done";
                    state.videoUrl = d.video;
                    if (videoBtn) { videoBtn.disabled = false; videoBtn.textContent = "🎬 영상 다시 보기"; }
                    hideVideoStatus();
                    track("AR_VIDEO_DONE");
                    toast("🎉 영상이 완성됐어요!");
                    showResultVideo(d.video);
                } else if (st === "failed" || st === "canceled" || (d && d.error)) {
                    videoFailed();
                } else {
                    var sec = Math.round((Date.now() - startedAt) / 1000);
                    setVideoStatus("🎬 AI가 영상으로 만드는 중… (" + sec + "초 · 최대 1~2분)");
                    state.animPollTimer = setTimeout(function () { pollVideo(base, id, startedAt); }, 2500);
                }
            })
            .catch(function () {
                if (state.videoStatus !== "running") return;
                // 일시적 네트워크 오류 → 잠시 후 재시도 (전체 타임아웃 내)
                state.animPollTimer = setTimeout(function () { pollVideo(base, id, startedAt); }, 3000);
            });
    }

    /* ---------- 포인터 (드래그 / 핀치) ---------- */
    function pointerPos(e) {
        var rect = canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function onPointerDown(e) {
        canvas.setPointerCapture(e.pointerId);
        state.pointers[e.pointerId] = pointerPos(e);
        var ids = Object.keys(state.pointers);
        if (ids.length === 2) {
            state.pinchDist = pinchDistance();
        }
    }
    function onPointerMove(e) {
        if (!state.pointers[e.pointerId]) return;
        var prev = state.pointers[e.pointerId];
        var cur = pointerPos(e);
        state.pointers[e.pointerId] = cur;
        var ids = Object.keys(state.pointers);
        if (ids.length >= 2) {
            var d = pinchDistance();
            if (state.pinchDist > 0) {
                state.pet.scale = clamp(state.pet.scale * (d / state.pinchDist), 0.25, 3);
            }
            state.pinchDist = d;
        } else {
            state.pet.x += cur.x - prev.x;
            state.pet.y += cur.y - prev.y;
        }
    }
    function onPointerUp(e) {
        delete state.pointers[e.pointerId];
        state.pinchDist = 0;
    }
    function pinchDistance() {
        var pts = Object.keys(state.pointers).map(function (k) { return state.pointers[k]; });
        if (pts.length < 2) return 0;
        var dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    function onWheel(e) {
        e.preventDefault();
        state.pet.scale = clamp(state.pet.scale * (1 - e.deltaY * 0.0012), 0.25, 3);
    }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    /* ---------- 열기 / 닫기 ---------- */
    function open() {
        if (!overlay) build();
        overlay.classList.add("open");
        document.body.style.overflow = "hidden";
        // 초기화
        state.img = null;
        state.cutout = null;
        state.cutoutRatio = 1;
        state.aiStatus = "idle";
        state.swapT0 = 0;
        state.appearT0 = 0;
        state.burst = [];
        state.ambient = [];
        state.lastHeart = 0;
        state.bgKey = "night";
        state.srcDataUrl = null;
        resetVideoState();
        if (bgBar) {
            var camChip = bgBar.querySelector('[data-bg="camera"]');
            if (camChip) camChip.style.display = "none";
            setActiveBg("night");
        }
        setAiBadge("idle");
        startBtn.disabled = true;
        nameInput.value = "";
        fileInput.value = "";
        dropZone.innerHTML = "<strong>탭하여 사진 선택</strong><small>또는 사진을 여기로 끌어다 놓기</small>";
        if (feedbackLink) feedbackLink.href = window.FORM_URL || "#";
        showStep("upload");
    }
    function close() {
        overlay.classList.remove("open");
        document.body.style.overflow = "";
        if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
        if (state.animPollTimer) { clearTimeout(state.animPollTimer); state.animPollTimer = null; }
        state.videoStatus = "idle";   // 진행 중 폴링 중단
        hideResultVideo();
        hideVideoStatus();
        stopCamera();
    }

    /* ---------- DOM 빌드 ---------- */
    function build() {
        overlay = document.getElementById("fgOverlay");
        if (!overlay) return;
        modal = overlay.querySelector(".fg-modal");
        canvas = document.getElementById("fgCanvas");
        ctx = canvas.getContext("2d");
        video = document.getElementById("fgVideo");
        loadingEl = document.getElementById("fgLoading");
        fileInput = document.getElementById("fgFile");
        dropZone = document.getElementById("fgDrop");
        nameInput = document.getElementById("fgName");
        startBtn = document.getElementById("fgStart");
        stepUpload = document.getElementById("fgStepUpload");
        stepScene = document.getElementById("fgStepScene");
        feedbackLink = document.getElementById("fgFeedback");
        hintEl = document.getElementById("fgHint");

        aiBadge = document.createElement("div");
        aiBadge.className = "fg-ai-badge";
        stepScene.appendChild(aiBadge);

        bgBar = document.createElement("div");
        bgBar.className = "fg-bgbar";
        var bgHtml = '<button class="fg-bgchip" data-bg="camera" style="display:none">📷 카메라</button>';
        for (var bi = 0; bi < BG_THEMES.length; bi++) {
            bgHtml += '<button class="fg-bgchip" data-bg="' + BG_THEMES[bi].key + '">' + BG_THEMES[bi].label + '</button>';
        }
        bgBar.innerHTML = bgHtml;
        bgBar.addEventListener("click", function (e) {
            var chip = e.target.closest(".fg-bgchip");
            if (!chip) return;
            var key = chip.getAttribute("data-bg");
            if (key === "camera" && !state.useCamera) return;
            setActiveBg(key);
            track("AR_BG_" + key.toUpperCase());
        });
        var fgControls = stepScene.querySelector(".fg-controls");
        if (fgControls) fgControls.insertBefore(bgBar, fgControls.firstChild);

        // ----- 진짜로 움직이게 (Replicate 이미지→비디오) -----
        // 결과 영상: 캔버스 위에 오버레이로 재생
        resultVideo = document.createElement("video");
        resultVideo.className = "fg-result-video";
        resultVideo.setAttribute("playsinline", "");
        resultVideo.setAttribute("loop", "");
        resultVideo.muted = true;
        stepScene.appendChild(resultVideo);

        // 생성 진행 상태 오버레이 (스피너 + 텍스트)
        videoStatusEl = document.createElement("div");
        videoStatusEl.className = "fg-video-status";
        videoStatusEl.innerHTML = '<div class="fg-spinner"></div><span class="fg-video-status-txt"></span>';
        stepScene.appendChild(videoStatusEl);

        // 결과 영상에서 가든(캔버스)으로 돌아가기
        videoBack = document.createElement("button");
        videoBack.className = "fg-video-back";
        videoBack.type = "button";
        videoBack.textContent = "← 가든으로 돌아가기";
        videoBack.addEventListener("click", function () { hideResultVideo(); track("AR_VIDEO_BACK"); });
        stepScene.appendChild(videoBack);

        // 트리거 버튼 (btnrow 위에 prominent CTA). 백엔드 없으면 open()에서 숨김.
        videoBtn = document.createElement("button");
        videoBtn.className = "fg-video-btn";
        videoBtn.type = "button";
        videoBtn.textContent = "🎬 진짜로 움직이게";
        videoBtn.addEventListener("click", makeVideo);
        var btnrow = stepScene.querySelector(".fg-btnrow");
        if (btnrow && btnrow.parentNode) btnrow.parentNode.insertBefore(videoBtn, btnrow);

        document.getElementById("fgClose").addEventListener("click", close);
        dropZone.addEventListener("click", function () { fileInput.click(); });
        fileInput.addEventListener("change", function (e) {
            if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]);
        });
        ["dragover", "dragenter"].forEach(function (ev) {
            dropZone.addEventListener(ev, function (e) { e.preventDefault(); dropZone.classList.add("drag"); });
        });
        ["dragleave", "drop"].forEach(function (ev) {
            dropZone.addEventListener(ev, function (e) { e.preventDefault(); dropZone.classList.remove("drag"); });
        });
        dropZone.addEventListener("drop", function (e) {
            if (e.dataTransfer.files && e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
        });
        startBtn.addEventListener("click", goScene);
        document.getElementById("fgSave").addEventListener("click", saveImg);
        document.getElementById("fgShare").addEventListener("click", shareImg);
        document.getElementById("fgRetry").addEventListener("click", function () {
            if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
            stopCamera();
            open();
        });

        canvas.addEventListener("pointerdown", onPointerDown);
        canvas.addEventListener("pointermove", onPointerMove);
        canvas.addEventListener("pointerup", onPointerUp);
        canvas.addEventListener("pointercancel", onPointerUp);
        canvas.addEventListener("wheel", onWheel, { passive: false });

        overlay.addEventListener("click", function (e) {
            if (e.target === overlay) close();
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && overlay.classList.contains("open")) close();
        });
    }

    window.openForeverGarden = open;
})();
