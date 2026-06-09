/*
 * Forever Garden — Petpy core feature
 * 펫 사진을 카메라(거실) 위에 소환해 떠다니게 하고, 스크린샷으로 저장·공유한다.
 * 정적 / 백엔드 없음 / API 키 없음. 카메라 불가 시 가든 배경으로 폴백.
 */
(function () {
    "use strict";

    var overlay, modal, canvas, ctx, video, loadingEl, fileInput, dropZone,
        nameInput, startBtn, stepUpload, stepScene, feedbackLink, hintEl;

    var state = {
        img: null,          // 마스크 처리된 펫 캔버스
        imgRatio: 1,        // 펫 세로/가로 비율
        petName: "",
        stream: null,
        raf: null,
        useCamera: false,
        pet: { x: 0, y: 0, scale: 1 },
        particles: [],
        pointers: {},       // 드래그/핀치용
        pinchDist: 0,
        t0: 0
    };

    /* ---------- 유틸 ---------- */
    function track(name) {
        try { if (window.trackClick) window.trackClick(name); } catch (e) {}
    }
    function toast(msg) {
        try { if (window.showToast) window.showToast(msg); } catch (e) {}
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

    /* ---------- 배경 (카메라 cover 또는 가든 그라데이션) ---------- */
    function drawBackground(w, h) {
        if (state.useCamera && video.readyState >= 2) {
            var vw = video.videoWidth, vh = video.videoHeight;
            var scale = Math.max(w / vw, h / vh);
            var dw = vw * scale, dh = vh * scale;
            ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
        } else {
            var g = ctx.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, "#1a0f2e");
            g.addColorStop(0.5, "#2d1b3d");
            g.addColorStop(1, "#3d2a3a");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
            // 지평선 무지개 빛
            var rg = ctx.createRadialGradient(w / 2, h * 1.05, h * 0.1, w / 2, h * 1.05, h * 0.7);
            rg.addColorStop(0, "rgba(255,142,83,0.35)");
            rg.addColorStop(0.5, "rgba(196,113,237,0.15)");
            rg.addColorStop(1, "rgba(196,113,237,0)");
            ctx.fillStyle = rg;
            ctx.fillRect(0, 0, w, h);
        }
    }

    /* ---------- 펫 그리기 (글로우 + 보빙) ---------- */
    function drawPet(w, h, time) {
        if (!state.img) return;
        var base = Math.min(w, h) * 0.5;
        var dw = base * state.pet.scale;
        var dh = dw * state.imgRatio;
        var bob = Math.sin(time * 0.0018) * (h * 0.012);
        var breathe = 1 + Math.sin(time * 0.0022) * 0.015;
        var px = state.pet.x;
        var py = state.pet.y + bob;

        // 글로우 헤일로
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        var glow = ctx.createRadialGradient(px, py, 0, px, py, dw * 0.72);
        glow.addColorStop(0, "rgba(255,190,130,0.5)");
        glow.addColorStop(0.5, "rgba(255,140,170,0.22)");
        glow.addColorStop(1, "rgba(255,140,170,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, dw * 0.72, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 펫
        var fw = dw * breathe, fh = dh * breathe;
        ctx.drawImage(state.img, px - fw / 2, py - fh / 2, fw, fh);
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
        drawBackground(w, h);
        drawParticles(w, h);
        drawPet(w, h, now);
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

        startCamera().then(function (stream) {
            state.stream = stream;
            video.srcObject = stream;
            video.play();
            state.useCamera = true;
            loadingEl.classList.add("hidden");
            hintEl.textContent = "끌어서 위치 이동 · 손가락 모으기/벌리기로 크기 조절";
        }).catch(function () {
            state.useCamera = false;
            loadingEl.classList.add("hidden");
            hintEl.textContent = "카메라를 못 켰어요 — 가든 배경으로 소환했어요 🌙";
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
            state.img = buildMaskedPet(image);
            URL.revokeObjectURL(url);
            startBtn.disabled = false;
            dropZone.innerHTML = "<strong>좋아요! 사진이 준비됐어요 ✓</strong><small>'우리 집에 소환하기'를 눌러주세요</small>";
            track("AR_PHOTO_LOADED");
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
