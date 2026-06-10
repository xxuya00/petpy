/*
 * Community Feed — Petpy
 * 사진 업로드 → 피드 그리드에 추가. localStorage에 저장(이 기기에서 유지).
 * 공유 백엔드는 다음 단계(이미지 호스팅 필요).
 */
(function () {
    "use strict";

    var KEY = "petpy_posts";
    var MAX = 30;

    var grid, overlay, fileInput, dropZone, nameInput, handleInput, descInput, submitBtn;
    var pendingImg = null;

    /* ---------- 저장소 ---------- */
    function loadPosts() {
        try { return JSON.parse(localStorage.getItem(KEY)) || []; }
        catch (e) { return []; }
    }
    function savePosts(posts) {
        try { localStorage.setItem(KEY, JSON.stringify(posts.slice(0, MAX))); }
        catch (e) { /* 용량 초과 등 */ }
    }

    /* ---------- 유틸 ---------- */
    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }
    function toast(msg) { try { if (window.showToast) window.showToast(msg); } catch (e) {} }
    function track(name) { try { if (window.trackClick) window.trackClick(name); } catch (e) {} }
    function api() { return (window.PETPY_API || "").replace(/\/+$/, ""); }
    function scrollToFeed() {
        var sec = document.getElementById("community");
        if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function fileToDataUrl(file, maxSize, quality) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () {
                var w = img.naturalWidth, h = img.naturalHeight;
                var s = Math.min(1, maxSize / Math.max(w, h));
                w = Math.round(w * s); h = Math.round(h * s);
                var c = document.createElement("canvas");
                c.width = w; c.height = h;
                c.getContext("2d").drawImage(img, 0, 0, w, h);
                URL.revokeObjectURL(url);
                resolve(c.toDataURL("image/jpeg", quality));
            };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("img load fail")); };
            img.src = url;
        });
    }

    /* ---------- 렌더 ---------- */
    function cardHtml(post) {
        var petKey = post.name + "·" + post.id;
        var handle = post.handle ? esc(post.handle) : "@petpy_friend";
        return '<div class="community-card">' +
            '<img src="' + post.img + '" alt="' + esc(post.name) + '" loading="lazy">' +
            '<div class="cc-body">' +
                '<div class="cc-handle">' + handle + '</div>' +
                '<div class="cc-name">' + esc(post.name) + '<span class="cc-badge">NEW</span></div>' +
                '<div class="cc-desc">' + (post.desc ? esc(post.desc) : "우리 아이를 소개합니다 🐾") + '</div>' +
                '<button class="heart-btn" data-pet="' + esc(petKey) + '" onclick="handleHeart(this)">🤍 <span class="heart-count">0</span></button>' +
            '</div>' +
        '</div>';
    }

    function emptyHtml() {
        return '<div class="community-empty">아직 올라온 사진이 없어요.<br>우리 아이를 가장 먼저 자랑해 보세요! 🐾</div>';
    }

    function renderLocal() {
        var posts = loadPosts();
        if (posts.length === 0) { grid.innerHTML = emptyHtml(); return; }
        grid.innerHTML = posts.map(cardHtml).join("");
        syncHearts();
    }

    // 백엔드가 설정돼 있으면 공유 피드를 불러오고, 실패하면 로컬로 폴백
    function renderGrid() {
        if (!grid) return;
        var base = api();
        if (!base) { renderLocal(); return; }
        grid.innerHTML = '<div class="community-empty">불러오는 중… 🐾</div>';
        fetch(base + "/api/posts")
            .then(function (r) { if (!r.ok) throw new Error("bad status"); return r.json(); })
            .then(function (data) {
                var posts = (data && data.posts) || [];
                if (!posts.length) { grid.innerHTML = emptyHtml(); return; }
                grid.innerHTML = posts.map(cardHtml).join("");
                syncHearts();
            })
            .catch(function () { renderLocal(); });
    }

    function prependCard(post) {
        var empty = grid.querySelector(".community-empty");
        if (empty) empty.remove();
        var wrap = document.createElement("div");
        wrap.innerHTML = cardHtml(post);
        grid.insertBefore(wrap.firstChild, grid.firstChild);
        syncHearts();
    }

    function syncHearts() {
        try { if (window.loadHeartCounts) window.loadHeartCounts(); } catch (e) {}
    }

    /* ---------- 업로드 모달 ---------- */
    function openModal() {
        overlay.classList.add("open");
        document.body.style.overflow = "hidden";
        pendingImg = null;
        submitBtn.disabled = true;
        fileInput.value = "";
        nameInput.value = ""; handleInput.value = ""; descInput.value = "";
        dropZone.innerHTML = "<strong>탭하여 사진 선택</strong><small>또는 사진을 여기로 끌어다 놓기</small>";
    }
    function closeModal() {
        overlay.classList.remove("open");
        document.body.style.overflow = "";
    }

    function handleFile(file) {
        if (!file || !/^image\//.test(file.type)) { toast("이미지 파일을 올려주세요 🐾"); return; }
        fileToDataUrl(file, 900, 0.82).then(function (dataUrl) {
            pendingImg = dataUrl;
            submitBtn.disabled = false;
            dropZone.innerHTML = '<img src="' + dataUrl + '" alt="미리보기" style="max-height:140px;border-radius:12px;">';
            track("FEED_PHOTO_LOADED");
        }).catch(function () { toast("사진을 불러오지 못했어요"); });
    }

    // 백엔드 없이/실패 시: 기존 localStorage 동작으로 저장
    function localFallbackSave(name, handle, desc) {
        var post = {
            id: Math.random().toString(36).slice(2, 8),
            img: pendingImg,
            name: name.slice(0, 20),
            handle: handle.slice(0, 24),
            desc: (desc || "").slice(0, 60),
            ts: Date.now()
        };
        var posts = loadPosts();
        posts.unshift(post);
        savePosts(posts);
        prependCard(post);
        track("FEED_POST");
        closeModal();
        toast("🎉 " + post.name + "(이)가 피드에 올라왔어요!");
        scrollToFeed();
    }

    function submitPost() {
        var name = (nameInput.value || "").trim();
        if (!pendingImg) { toast("사진을 먼저 선택해 주세요"); return; }
        if (!name) { toast("아이 이름을 입력해 주세요 🐾"); nameInput.focus(); return; }
        var handle = (handleInput.value || "").trim();
        if (handle && handle[0] !== "@") handle = "@" + handle;
        var desc = (descInput.value || "").trim();

        var base = api();
        // 백엔드 미설정 → 로컬 저장으로 폴백
        if (!base) { localFallbackSave(name, handle, desc); return; }

        // 백엔드 사용: 동물 판별 + 공유 피드 저장
        submitBtn.disabled = true;
        var prev = submitBtn.textContent;
        submitBtn.textContent = "올리는 중… ⏳";
        fetch(base + "/api/posts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                image: pendingImg,
                name: name.slice(0, 20),
                handle: handle.slice(0, 24),
                desc: desc.slice(0, 60)
            })
        })
            .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
            .then(function (res) {
                submitBtn.disabled = false;
                submitBtn.textContent = prev;
                if (res.status === 200 && res.data && res.data.ok) {
                    prependCard(res.data.post);
                    track("FEED_POST");
                    closeModal();
                    toast("🎉 " + res.data.post.name + "(이)가 피드에 올라왔어요!");
                    scrollToFeed();
                } else if (res.status === 422) {
                    // 동물이 아니라고 판별됨 → 거부 (로컬 폴백 안 함)
                    track("FEED_REJECT_NONANIMAL");
                    var labels = (res.data && res.data.labels) || [];
                    var hint = labels.length
                        ? " (인식: " + labels.slice(0, 3).map(function (l) { return l.name; }).join(", ") + ")"
                        : "";
                    toast("🐾 동물 사진만 올릴 수 있어요!" + hint);
                } else {
                    // 서버 오류 등 → 로컬 폴백
                    localFallbackSave(name, handle, desc);
                }
            })
            .catch(function () {
                submitBtn.disabled = false;
                submitBtn.textContent = prev;
                localFallbackSave(name, handle, desc);
            });
    }

    /* ---------- init ---------- */
    function init() {
        grid = document.getElementById("communityGrid");
        overlay = document.getElementById("upOverlay");
        if (!grid || !overlay) return;
        fileInput = document.getElementById("upFile");
        dropZone = document.getElementById("upDrop");
        nameInput = document.getElementById("upName");
        handleInput = document.getElementById("upHandle");
        descInput = document.getElementById("upDesc");
        submitBtn = document.getElementById("upSubmit");

        document.getElementById("upClose").addEventListener("click", closeModal);
        overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && overlay.classList.contains("open")) closeModal();
        });
        dropZone.addEventListener("click", function () { fileInput.click(); });
        fileInput.addEventListener("change", function (e) {
            if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
        });
        ["dragover", "dragenter"].forEach(function (ev) {
            dropZone.addEventListener(ev, function (e) { e.preventDefault(); dropZone.classList.add("drag"); });
        });
        ["dragleave", "drop"].forEach(function (ev) {
            dropZone.addEventListener(ev, function (e) { e.preventDefault(); dropZone.classList.remove("drag"); });
        });
        dropZone.addEventListener("drop", function (e) {
            if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
        });
        submitBtn.addEventListener("click", submitPost);

        renderGrid();
    }

    window.openUpload = openModal;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
