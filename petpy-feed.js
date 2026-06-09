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

    function renderGrid() {
        if (!grid) return;
        var posts = loadPosts();
        if (posts.length === 0) {
            grid.innerHTML = '<div class="community-empty">아직 올라온 사진이 없어요.<br>우리 아이를 가장 먼저 자랑해 보세요! 🐾</div>';
            return;
        }
        grid.innerHTML = posts.map(cardHtml).join("");
        syncHearts();
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

    function submitPost() {
        var name = (nameInput.value || "").trim();
        if (!pendingImg) { toast("사진을 먼저 선택해 주세요"); return; }
        if (!name) { toast("아이 이름을 입력해 주세요 🐾"); nameInput.focus(); return; }
        var handle = (handleInput.value || "").trim();
        if (handle && handle[0] !== "@") handle = "@" + handle;
        var post = {
            id: Math.random().toString(36).slice(2, 8),
            img: pendingImg,
            name: name.slice(0, 20),
            handle: handle.slice(0, 24),
            desc: (descInput.value || "").trim().slice(0, 60),
            ts: Date.now()
        };
        var posts = loadPosts();
        posts.unshift(post);
        savePosts(posts);
        prependCard(post);
        track("FEED_POST");
        closeModal();
        toast("🎉 " + post.name + "(이)가 피드에 올라왔어요!");
        var sec = document.getElementById("community");
        if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
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
