/*
 * petpy 앱 — 온보딩(로그인 우회) + 하단 탭바 전환
 * 고유 ID는 localStorage('petpy_user_id')에 저장. (서버/계정 없음)
 */
(function () {
  "use strict";
  var KEY = "petpy_user_id";

  var onb = document.getElementById("onb");
  var stepName = document.getElementById("stepName");
  var stepCreated = document.getElementById("stepCreated");
  var stepFind = document.getElementById("stepFind");

  var nameInput = document.getElementById("onbName");
  var nameNote = document.getElementById("onbNameNote");
  var idBadge = document.getElementById("onbIdBadge");
  var copyNote = document.getElementById("onbCopyNote");
  var findInput = document.getElementById("onbFindInput");
  var findNote = document.getElementById("onbFindNote");

  var OK = "#7E8E76";   // sage-deep
  var ERR = "#C47A4C";  // terra

  function setNote(el, msg, ok) {
    el.textContent = msg;
    el.style.color = ok ? OK : ERR;
  }

  function showStep(el) {
    [stepName, stepCreated, stepFind].forEach(function (s) {
      s.classList.toggle("active", s === el);
    });
  }

  // 저장된 ID를 상단바(이름/이니셜)에 반영
  function applyUser() {
    var id = localStorage.getItem(KEY) || "";
    var name = id.split("_")[0] || "보호자";
    document.querySelectorAll("[data-user-name]").forEach(function (e) { e.textContent = name; });
    document.querySelectorAll("[data-user-id]").forEach(function (e) { e.textContent = id; });
    document.querySelectorAll("[data-user-initial]").forEach(function (e) {
      e.textContent = (name.trim().charAt(0) || "?").toUpperCase();
    });
  }

  function enterApp() {
    applyUser();
    onb.classList.add("hidden");
  }

  // ---------- 최초 진입 판단 ----------
  if (localStorage.getItem(KEY)) {
    enterApp();
  } else {
    onb.classList.remove("hidden");
    showStep(stepName);
  }

  // ---------- 이름 → 고유 ID 생성 ----------
  function createId() {
    var name = nameInput.value.trim().replace(/\s+/g, " ");
    if (!name) {
      setNote(nameNote, "이름을 입력해 주세요.", false);
      nameInput.focus();
      return;
    }
    var rnd = String(Math.floor(1000 + Math.random() * 9000)); // 무작위 4자리
    var id = name + "_" + rnd;
    localStorage.setItem(KEY, id);
    idBadge.textContent = id;
    copyNote.textContent = "";
    showStep(stepCreated);
  }
  document.getElementById("onbConfirm").addEventListener("click", createId);
  nameInput.addEventListener("keydown", function (e) { if (e.key === "Enter") createId(); });
  nameInput.addEventListener("input", function () { nameNote.textContent = ""; });

  // ---------- 고유 ID 복사 ----------
  function copyId() {
    var id = localStorage.getItem(KEY) || idBadge.textContent || "";
    function done() { setNote(copyNote, "복사됐어요! 안전한 곳에 보관해 주세요 💛", true); }
    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = id;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        done();
      } catch (e) {
        setNote(copyNote, "복사에 실패했어요. ID를 길게 눌러 직접 복사해 주세요.", false);
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(id).then(done).catch(fallback);
    } else {
      fallback();
    }
  }
  document.getElementById("onbCopy").addEventListener("click", copyId);

  // ---------- 시작하기 ----------
  document.getElementById("onbStart").addEventListener("click", enterApp);

  // ---------- 기존 ID로 찾아오기(탈출구) ----------
  document.getElementById("onbFindLink").addEventListener("click", function () {
    findNote.textContent = "";
    showStep(stepFind);
    setTimeout(function () { findInput.focus(); }, 60);
  });
  document.getElementById("onbBack").addEventListener("click", function () { showStep(stepName); });

  function findExisting() {
    var id = findInput.value.trim();
    if (!id) {
      setNote(findNote, "고유 ID를 입력해 주세요.", false);
      findInput.focus();
      return;
    }
    localStorage.setItem(KEY, id);
    enterApp();
  }
  document.getElementById("onbFindBtn").addEventListener("click", findExisting);
  findInput.addEventListener("keydown", function (e) { if (e.key === "Enter") findExisting(); });
  findInput.addEventListener("input", function () { findNote.textContent = ""; });

  // ---------- 하단 탭바 전환 ----------
  var tabs = document.querySelectorAll(".tab");
  var panels = document.querySelectorAll(".panel");
  var main = document.querySelector(".app-main");
  tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      var name = t.getAttribute("data-tab");
      tabs.forEach(function (x) { x.classList.toggle("active", x === t); });
      panels.forEach(function (p) { p.classList.toggle("active", p.getAttribute("data-panel") === name); });
      if (main) main.scrollTop = 0;
      // 기억창구 AR 등 외부 모듈이 탭 전환을 알 수 있도록 이벤트 발행
      window.dispatchEvent(new CustomEvent("petpy:tab", { detail: { tab: name } }));
    });
  });

  // ---------- 공용 유틸 ----------
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  var toast = document.getElementById("toast");
  var toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 1800);
  }

  function copyText(text, okMsg) {
    function done() { showToast(okMsg); }
    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta); done();
      } catch (e) { showToast("복사에 실패했어요"); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else { fallback(); }
  }

  // ---------- 다국어(i18n) ----------
  var i18n = {
    ko: {
      recordTab: "기록하기", memoryTab: "기억하기", communityTab: "소통하기",
      uploadBtn: "내 앨범에서 사진 선택", captionPlaceholder: "추억 캡션 적기...", submitBtn: "등록하기",
      addPetBtn: "아이 추가", noPetMsg: "먼저 위의 ➕ 버튼을 눌러 아이를 등록해주세요!", communityTitle: "현재 지역: 전체",
      fakeDoorBtn: "AI 3D로 보기", welcomeMsg: "오늘 우리 {petName}의 어떤 순간을 기록할까요?",
      recordTitle: "오늘 이 아이의 하루", recordDesc: "아이를 선택하고, 오늘의 순간을 사진으로 남겨요.",
      rememberTitle: "다시 만나는 순간", arEmpty: "아이를 선택하면<br>이 자리에서 다시 만나요",
      arMsgPh: "추모 한마디를 남겨요", arMsgBtn: "남기기",
      communityH1: "우리동네 댕댕이", communityDesc: "동네를 인증하면 진짜 이웃들과 마음을 나눌 수 있어요.",
      regionSub: "인증하면 더 가까운 이웃을 만나요", verifyBtn: "우리 동네 인증하기",
      petModalTitle: "우리 아이 등록", petModalDesc: "우리 아이의 이름을 입력해주세요", petSubmit: "추가하기"
    },
    en: {
      recordTab: "Record", memoryTab: "Sanctuary", communityTab: "Community",
      uploadBtn: "Select Photo from Gallery", captionPlaceholder: "Write a caption...", submitBtn: "Register",
      addPetBtn: "Add Pet", noPetMsg: "Tap the ➕ button above to add your pet first!", communityTitle: "Current Region: All",
      fakeDoorBtn: "View AI 3D", welcomeMsg: "Which moment of {petName} shall we record today?",
      recordTitle: "Today with our pet", recordDesc: "Pick a pet and capture today's moment in a photo.",
      rememberTitle: "The moment we meet again", arEmpty: "Pick a pet to<br>meet again right here",
      arMsgPh: "Leave a word of remembrance", arMsgBtn: "Post",
      communityH1: "Neighborhood Pets", communityDesc: "Verify your area to share your heart with real neighbors.",
      regionSub: "Verify to meet closer neighbors", verifyBtn: "Verify My Area",
      petModalTitle: "Register your pet", petModalDesc: "Please enter your pet's name", petSubmit: "Add"
    },
    ja: {
      recordTab: "記録", memoryTab: "思い出", communityTab: "コミュニティ",
      uploadBtn: "アルバムから写真を選択", captionPlaceholder: "キャプションを入力...", submitBtn: "登録",
      addPetBtn: "ペットを追加", noPetMsg: "まず上の➕ボタンでペットを追加してください！", communityTitle: "現在の地域: すべて",
      fakeDoorBtn: "AI 3Dで見る", welcomeMsg: "今日の{petName}のどんな瞬間を記録しますか？",
      recordTitle: "今日のこの子の一日", recordDesc: "ペットを選んで、今日の瞬間を写真で残しましょう。",
      rememberTitle: "再び出会う瞬間", arEmpty: "ペットを選ぶと<br>この場所で再会できます",
      arMsgPh: "追悼の一言を残す", arMsgBtn: "残す",
      communityH1: "ご近所のペット", communityDesc: "地域を認証すれば、本当のご近所さんと心を分かち合えます。",
      regionSub: "認証するともっと近いご近所さんに出会えます", verifyBtn: "地域を認証する",
      petModalTitle: "ペットを登録", petModalDesc: "ペットの名前を入力してください", petSubmit: "追加"
    },
    zh: {
      recordTab: "记录", memoryTab: "回忆", communityTab: "社区",
      uploadBtn: "从相册选择照片", captionPlaceholder: "写下说明...", submitBtn: "提交",
      addPetBtn: "添加宠物", noPetMsg: "请先点击上方的➕按钮添加宠物！", communityTitle: "当前地区: 全部",
      fakeDoorBtn: "查看 AI 3D", welcomeMsg: "今天记录{petName}的哪个瞬间呢？",
      recordTitle: "这孩子的今天", recordDesc: "选择宠物，用照片记录今天的瞬间。",
      rememberTitle: "再次相遇的瞬间", arEmpty: "选择宠物<br>就能在这里重逢",
      arMsgPh: "留下一句追思的话", arMsgBtn: "留言",
      communityH1: "邻里萌宠", communityDesc: "认证所在地区，即可与真实邻居分享心意。",
      regionSub: "认证后遇见更近的邻居", verifyBtn: "认证我的地区",
      petModalTitle: "登记宠物", petModalDesc: "请输入宠物的名字", petSubmit: "添加"
    }
  };
  var LANG_KEY = "petpy_lang";
  var lang = localStorage.getItem(LANG_KEY) || "ko";
  if (!i18n[lang]) lang = "ko";
  // 현재 언어의 키 텍스트 (모듈에서 동적 텍스트에 사용)
  function T(key) { return (i18n[lang] || i18n.ko)[key] || (i18n.ko[key] || key); }

  function updateLanguageUI() {
    var d = i18n[lang] || i18n.ko;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var k = el.getAttribute("data-i18n");
      if (d[k] != null) el.textContent = d[k];
    });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-ph");
      if (d[k] != null) el.setAttribute("placeholder", d[k]);
    });
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-html");
      if (d[k] != null) el.innerHTML = d[k];
    });
    document.documentElement.setAttribute("lang", lang);
    document.querySelectorAll(".lang-select").forEach(function (s) { if (s.value !== lang) s.value = lang; });
    // 동적 텍스트(기록 프롬프트·사진버튼 등)는 각 모듈이 이 이벤트로 갱신
    window.dispatchEvent(new CustomEvent("petpy:lang", { detail: { lang: lang } }));
  }
  function setLang(l) { if (!i18n[l]) return; lang = l; try { localStorage.setItem(LANG_KEY, l); } catch (e) {} updateLanguageUI(); }
  document.querySelectorAll(".lang-select").forEach(function (s) {
    s.value = lang;
    s.addEventListener("change", function () { setLang(s.value); });
  });
  // 모듈 초기화가 끝난 뒤(동기 IIFE 완료 후) 최초 1회 적용 → petpy:lang 리스너 등록 보장
  setTimeout(updateLanguageUI, 0);

  // ---------- 상단 헤더: 고유 ID 복사 ----------
  document.getElementById("idChip").addEventListener("click", function () {
    var id = localStorage.getItem(KEY) || "";
    if (id) copyText(id, "고유 ID를 복사했어요 📋");
  });

  // ---------- 공용: Google Apps Script(시트) + ImgBB 헬퍼 (기록창구·소통창구 공유) ----------
  // 저장소 = Google Apps Script 웹앱(/exec). config.js의 window.PETPY_GAS. 비우면 데모(localStorage).
  var GAS = (window.PETPY_GAS || "").replace(/\/+$/, "");
  var SHEET_MODE = GAS ? "sheet" : "demo";
  // ImgBB 업로드용 키(브라우저 공개용 — Replicate/AWS 같은 서버 비밀키가 아님). 본인 키로 교체 가능.
  var IMGBB_API_KEY = "58fd86ad9db403d1c8e7af3fa5593a70";

  // 읽기: GET ?sheet=<탭이름> → 행 객체 배열. 커스텀 헤더 없음 = CORS 프리플라이트 회피.
  function sheetGet(sheet) {
    return fetch(GAS + "?sheet=" + encodeURIComponent(sheet))
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) { return Array.isArray(j) ? j : (j.rows || j.data || []); });
  }
  // 쓰기: POST를 text/plain(단순 요청)으로 → Apps Script가 못 받는 CORS 프리플라이트 회피. body={sheet,row}
  function sheetPost(sheet, row) {
    return fetch(GAS, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ sheet: sheet, row: row })
    }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json().catch(function () { return {}; }); });
  }
  function readDataURL(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }
  // 선택한 이미지 파일을 ImgBB에 업로드하고 호스팅 URL(data.url)을 반환
  function uploadToImgbb(file) {
    return readDataURL(file).then(function (dataURL) {
      var base64 = String(dataURL).split(",")[1] || "";
      var fd = new FormData();
      fd.append("image", base64);
      return fetch("https://api.imgbb.com/1/upload?key=" + encodeURIComponent(IMGBB_API_KEY), { method: "POST", body: fd })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.success && j.data && j.data.url) return j.data.url;
          throw new Error((j && j.error && j.error.message) || "imgbb 업로드 실패");
        });
    });
  }

  // 외부 모듈(app-ar.js의 AI 3D 수요조사 등)이 SheetDB에 한 줄 저장하도록 노출.
  // 데모(PETPY_GAS URL 없음)면 저장을 건너뛰고 false 반환(페이크도어 성공 메시지는 그대로 노출).
  window.PETPY = window.PETPY || {};
  window.PETPY.saveRow = function (sheet, row) {
    if (SHEET_MODE !== "sheet") return Promise.resolve(false);
    return sheetPost(sheet, row).then(function () { return true; }, function () { return false; });
  };

  // ---------- 기록창구: 다두가정 추억 스튜디오 (아이별 기록 · 구글시트 record 탭) ----------
  (function recordStudio() {
    var MODE = SHEET_MODE;
    var LS_MEM = "petpy.record.memories";   // 데모/캐시: 추억(사진+캡션) 행
    var LS_PETS = "petpy_registered_pets";   // 등록된 아이 이름 배열
    var LS_ACTIVE = "petpy_active_pet";      // 마지막 선택 아이

    var petLine = document.getElementById("petLine");
    var petAddBtn = document.getElementById("petAdd");
    var recForm = document.getElementById("recForm");
    var recPrompt = document.getElementById("recPrompt");
    var recFile = document.getElementById("recFile");
    var recPhotoBtn = document.getElementById("recPhotoBtn");
    var recPreview = document.getElementById("recPreview");
    var recPreviewImg = document.getElementById("recPreviewImg");
    var recPhotoRemove = document.getElementById("recPhotoRemove");
    var recMemo = document.getElementById("recMemo");
    var recNote = document.getElementById("recNote");
    var recAddBtn = document.getElementById("recAdd");
    var recEmptyHint = document.getElementById("recEmptyHint");
    var recGrid = document.getElementById("recGrid");

    var petModal = document.getElementById("petModal");
    var petNameInput = document.getElementById("petNameInput");
    var petNote = document.getElementById("petNote");
    var petSubmit = document.getElementById("petSubmit");

    function uid() { return localStorage.getItem(KEY) || "보호자"; }
    function nowISO() { return new Date().toISOString(); }
    function lsRead(k) { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch (e) { return []; } }
    function lsWrite(k, arr) { try { localStorage.setItem(k, JSON.stringify(arr)); } catch (e) {} }
    function tsOf(m) { var t = Date.parse(m.created_at); return isNaN(t) ? 0 : t; }

    function loadPets() { return lsRead(LS_PETS); }  // 등록 전에는 빈 상태(➕로 직접 등록)

    var pets = loadPets();
    var activePet = localStorage.getItem(LS_ACTIVE) || null;
    var allMemories = [];        // 현재 유저의 모든 추억 (AR 기억창구 공유용)
    var selectedFile = null, lastPreviewDataURL = null;

    // ----- 아이 칩 라인 -----
    function renderPets() {
      petLine.querySelectorAll(".pet-chip").forEach(function (el) { el.remove(); });
      var chips = pets.map(function (name) {
        return '<button type="button" class="pet-chip' + (name === activePet ? " active" : "") +
          '" data-pet="' + esc(name) + '">' + esc(name) + "</button>";
      }).join("");
      petAddBtn.insertAdjacentHTML("beforebegin", chips);
    }

    // ----- 폼 / 빈 안내 토글 -----
    function syncForm() {
      if (!pets.length) {
        recForm.hidden = true; recEmptyHint.hidden = false; recGrid.innerHTML = "";
        return;
      }
      recEmptyHint.hidden = true;
      if (activePet && pets.indexOf(activePet) >= 0) {
        recForm.hidden = false;
        recPrompt.innerHTML = T("welcomeMsg").replace("{petName}", "<b>" + esc(activePet) + "</b>");
        loadAndRenderGrid();
      } else {
        recForm.hidden = true;
        recGrid.innerHTML = '<div class="rec-grid-hint">위에서 아이를 선택하면<br>추억을 기록할 수 있어요 🐾</div>';
      }
    }

    function selectPet(name) {
      activePet = name;
      localStorage.setItem(LS_ACTIVE, name);
      clearPhoto();
      setNote(recNote, "", true);
      renderPets();
      syncForm();
    }

    // ----- 사진 선택/미리보기 -----
    function showPhoto(dataURL) { lastPreviewDataURL = dataURL; recPreviewImg.src = dataURL; recPreview.hidden = false; recPhotoBtn.textContent = "📸 " + T("uploadBtn"); }
    function clearPhoto() { selectedFile = null; lastPreviewDataURL = null; if (recFile) recFile.value = ""; recPreviewImg.removeAttribute("src"); recPreview.hidden = true; recPhotoBtn.textContent = "📸 " + T("uploadBtn"); }
    function onFilePicked() {
      var f = recFile.files && recFile.files[0];
      if (!f) return;
      if (!f.type || f.type.indexOf("image/") !== 0) { setNote(recNote, "이미지 파일만 올릴 수 있어요.", false); recFile.value = ""; return; }
      selectedFile = f; setNote(recNote, "", true);
      readDataURL(f).then(showPhoto);
    }

    // ----- record 탭 GET (user_id + pet_name 더블 필터) -----
    function loadMemories(petName) {
      function pick(rows) {
        return rows.filter(function (r) {
          return String(r.user_id) === String(uid()) && String(r.pet_name) === String(petName);
        });
      }
      if (MODE === "sheet") {
        return sheetGet("record").then(function (rows) { lsWrite(LS_MEM, rows); return pick(rows); })
          .catch(function () { return pick(lsRead(LS_MEM)); });
      }
      return Promise.resolve(pick(lsRead(LS_MEM)));
    }
    // AR 기억창구 공유용: 현재 유저의 모든 추억(아이 구분 없이)
    function loadAllMine() {
      function mine(rows) { return rows.filter(function (r) { return String(r.user_id) === String(uid()); }); }
      if (MODE === "sheet") {
        return sheetGet("record").then(function (rows) { lsWrite(LS_MEM, rows); return mine(rows); })
          .catch(function () { return mine(lsRead(LS_MEM)); });
      }
      return Promise.resolve(mine(lsRead(LS_MEM)));
    }

    function memCardHTML(m) {
      var img = m.image_url ? '<img src="' + esc(m.image_url) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : "";
      return '<div class="rec-card"><div class="thumb">' + img +
        '<div class="cap"><span class="name">' + esc(m.pet_name || "") + "</span>" + esc(m.memo || "") +
        "</div></div></div>";
    }
    function loadAndRenderGrid() {
      recGrid.innerHTML = '<div class="rec-grid-hint">불러오는 중…</div>';
      var pet = activePet;
      loadMemories(pet).then(function (list) {
        if (pet !== activePet) return;  // 그 사이 다른 아이를 골랐으면 무시
        list = list.slice().sort(function (a, b) { return tsOf(b) - tsOf(a); });
        if (!list.length) {
          recGrid.innerHTML = '<div class="rec-grid-hint">아직 <b>' + esc(pet) + '</b>의 추억이 없어요.<br>첫 순간을 기록해볼까요? 📸</div>';
          return;
        }
        recGrid.innerHTML = list.map(memCardHTML).join("");
      });
    }

    // ----- 추억 등록 (POST): ImgBB 업로드 → record 탭 -----
    function submitMemory() {
      if (!activePet) { setNote(recNote, "먼저 위에서 아이를 선택해 주세요.", false); return; }
      if (!selectedFile) { setNote(recNote, "추억 사진을 선택해 주세요.", false); return; }
      var memo = recMemo.value.trim();
      recAddBtn.disabled = true;

      function publish(imageUrl) {
        var row = { user_id: uid(), pet_name: activePet, image_url: imageUrl || "", memo: memo, created_at: nowISO() };
        var cache = lsRead(LS_MEM); cache.push(row); lsWrite(LS_MEM, cache);  // 낙관적 + 오프라인
        var done = function () {
          recAddBtn.disabled = false; recAddBtn.textContent = T("submitBtn");
          clearPhoto(); recMemo.value = ""; setNote(recNote, "", true);
          showToast(activePet + "의 추억이 등록됐어요 🐾");
          loadAndRenderGrid();
          refreshAll();   // AR 공유 데이터 갱신
        };
        if (MODE === "sheet") sheetPost("record", row).then(done, done);
        else done();
      }

      recAddBtn.textContent = "사진 올리는 중…";
      setNote(recNote, "사진을 올리고 있어요…", true);
      uploadToImgbb(selectedFile).then(function (url) { publish(url); }, function () {
        if (MODE === "demo" && lastPreviewDataURL) publish(lastPreviewDataURL);
        else { setNote(recNote, "사진 업로드 실패 — 캡션만 저장돼요.", false); publish(""); }
      });
    }

    // ----- 아이 추가 모달 (중복 예외처리) -----
    function openPetModal() { petNameInput.value = ""; setNote(petNote, "", true); petModal.classList.add("open"); petModal.setAttribute("aria-hidden", "false"); setTimeout(function () { petNameInput.focus(); }, 60); }
    function closePetModal() { petModal.classList.remove("open"); petModal.setAttribute("aria-hidden", "true"); }
    function addPet() {
      var name = petNameInput.value.trim().replace(/\s+/g, " ");
      if (!name) { setNote(petNote, "아이 이름을 입력해 주세요.", false); petNameInput.focus(); return; }
      if (pets.indexOf(name) >= 0) {
        setNote(petNote, "이미 동일한 이름의 아이가 등록되어 있습니다. '초코(첫째)'와 같이 구분하여 입력해주세요.", false);
        petNameInput.focus();
        return;
      }
      pets.push(name); lsWrite(LS_PETS, pets);
      closePetModal();
      showToast(name + " 등록 완료 🐾");
      selectPet(name);  // 새 아이 자동 선택
    }

    // AR 기억창구에 노출할 현재 유저의 추억 갱신
    function refreshAll() {
      return loadAllMine().then(function (list) {
        allMemories = list.slice().sort(function (a, b) { return tsOf(b) - tsOf(a); });
      });
    }

    // ----- 이벤트 -----
    petAddBtn.addEventListener("click", openPetModal);
    document.getElementById("petClose").addEventListener("click", closePetModal);
    petSubmit.addEventListener("click", addPet);
    petNameInput.addEventListener("keydown", function (e) { if (e.key === "Enter") addPet(); });
    petModal.addEventListener("click", function (e) { if (e.target === petModal) closePetModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && petModal.classList.contains("open")) closePetModal(); });

    petLine.addEventListener("click", function (e) {
      var chip = e.target.closest && e.target.closest(".pet-chip[data-pet]");
      if (chip) selectPet(chip.getAttribute("data-pet"));
    });

    recPhotoBtn.addEventListener("click", function () { recFile.click(); });
    recFile.addEventListener("change", onFilePicked);
    recPhotoRemove.addEventListener("click", clearPhoto);
    recAddBtn.addEventListener("click", submitMemory);
    // 언어 전환 시 동적 텍스트 갱신
    window.addEventListener("petpy:lang", function () {
      if (!selectedFile) recPhotoBtn.textContent = "📸 " + T("uploadBtn");
      recAddBtn.textContent = T("submitBtn");
      if (!recForm.hidden && activePet) recPrompt.innerHTML = T("welcomeMsg").replace("{petName}", "<b>" + esc(activePet) + "</b>");
    });

    // 기억창구(AR) 모듈이 현재 유저의 추억을 가져가도록 노출 (라이브 참조)
    window.PETPY = window.PETPY || {};
    window.PETPY.getRecords = function () {
      return allMemories.map(function (m) { return { name: m.pet_name, memo: m.memo, img: m.image_url }; });
    };

    // ----- 초기화 -----
    if (activePet && pets.indexOf(activePet) < 0) activePet = null;
    if (!activePet && pets.length) activePet = pets[0];
    renderPets();
    syncForm();
    refreshAll();
  })();

  // ---------- 소통창구: 우리동네 피드 (SheetDB 실시간 연동) ----------
  // SheetDB가 설정되면(community/comments 탭) 실시간 누적, 비어있으면 localStorage 데모 모드.
  (function communityFeed() {
    var MODE = SHEET_MODE;
    var LS_POSTS = "petpy.community.posts";
    var LS_CMTS = "petpy.community.comments";

    var feedEl = document.getElementById("neighborFeed");
    var fab = document.getElementById("postFab");

    var pModal = document.getElementById("postModal");
    var pText = document.getElementById("postText");
    var pNote = document.getElementById("postNote");
    var pAuthor = document.getElementById("postAuthor");
    var pSubmit = document.getElementById("postSubmit");
    var pFile = document.getElementById("postFile");
    var pPhotoBtn = document.getElementById("postPhotoBtn");
    var pPreview = document.getElementById("postPreview");
    var pPreviewImg = document.getElementById("postPreviewImg");
    var pPhotoRemove = document.getElementById("postPhotoRemove");

    var dModal = document.getElementById("detailModal");
    var dAuthor = document.getElementById("detailAuthor");
    var dTime = document.getElementById("detailTime");
    var dBody = document.getElementById("detailBody");
    var dCmts = document.getElementById("detailComments");
    var dCount = document.getElementById("detailCmtCount");
    var dInput = document.getElementById("detailCmtInput");
    var dSend = document.getElementById("detailCmtSend");
    var dPhoto = document.getElementById("detailPhoto");
    var dPhotoImg = document.getElementById("detailPhotoImg");

    var feedPosts = [];          // 현재 렌더 중인 게시글
    var commentCounts = {};      // post_id -> 댓글 수
    var currentPostId = null;    // 상세 모달에서 보고 있는 글
    var selectedFile = null;     // 앨범에서 고른 사진(File)
    var lastPreviewDataURL = null; // 미리보기 + 업로드 실패 폴백용 dataURL

    function uid() { return localStorage.getItem(KEY) || "보호자"; }
    function nowISO() { return new Date().toISOString(); }

    // ----- localStorage (데모 + 오프라인 폴백 캐시) -----
    function lsRead(k) { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch (e) { return []; } }
    function lsWrite(k, arr) { try { localStorage.setItem(k, JSON.stringify(arr)); } catch (e) {} }

    // SheetDB GET/POST · ImgBB 업로드 헬퍼는 상단 공용 함수 사용
    // 소스 오브 트루스: 시트 성공 시 시트, 실패/데모 시 localStorage
    function loadRows(sheet, lsKey) {
      if (MODE !== "sheet") return Promise.resolve(lsRead(lsKey));
      return sheetGet(sheet).then(function (rows) {
        lsWrite(lsKey, rows);   // 백업 캐시
        return rows;
      }).catch(function () { return lsRead(lsKey); });  // 연결 끊김 → 캐시
    }

    // ----- 시간 표시 -----
    function tsOf(p) { var t = Date.parse(p.created_at); return isNaN(t) ? (Number(p.post_id) || 0) : t; }
    function friendly(iso) {
      var t = Date.parse(iso); if (isNaN(t)) return "";
      var m = Math.floor((Date.now() - t) / 60000);
      if (m < 1) return "방금 전";
      if (m < 60) return m + "분 전";
      var h = Math.floor(m / 60); if (h < 24) return h + "시간 전";
      var d = new Date(t); return (d.getMonth() + 1) + "월 " + d.getDate() + "일";
    }

    // ----- 피드 렌더 -----
    function postCardHTML(p) {
      var n = commentCounts[String(p.post_id)] || 0;
      // image_url 있으면 상단에 사진, 없으면 텍스트만(예외 처리). 로드 실패 시 사진 영역 제거.
      var photo = p.image_url
        ? '<div class="post-photo"><img src="' + esc(p.image_url) + '" alt="" loading="lazy" ' +
          'onerror="this.closest(\'.post-card\').classList.remove(\'has-photo\');this.parentNode.remove()"></div>'
        : "";
      return '<div class="post-item"><div class="post-card' + (p.image_url ? " has-photo" : "") +
        '" role="button" tabindex="0" data-post-id="' + esc(String(p.post_id)) + '">' +
        photo +
        '<div class="post-head"><span class="pa">' + esc(p.user_id || "보호자") + '</span>' +
        '<span class="pt">' + esc(friendly(p.created_at)) + "</span></div>" +
        '<div class="post-body">' + esc(p.content || "") + "</div>" +
        '<div class="post-meta"><span class="pc-cmt">💬 ' + n + '</span><span class="pc-more">자세히 ›</span></div>' +
        "</div></div>";
    }
    function renderFeed() {
      if (!feedPosts.length) {
        feedEl.innerHTML = '<div class="feed-empty">아직 동네 글이 없어요.<br>첫 이야기를 남겨보세요 🐾</div>';
        return;
      }
      feedEl.innerHTML = feedPosts.map(postCardHTML).join("");
    }

    // 게시글 + 댓글수 새로고침 (최신 작성 순)
    function refresh() {
      feedEl.classList.add("loading");
      return Promise.all([loadRows("community", LS_POSTS), loadRows("comments", LS_CMTS)])
        .then(function (res) {
          var ps = res[0], cs = res[1];
          commentCounts = {};
          cs.forEach(function (c) { var k = String(c.post_id); commentCounts[k] = (commentCounts[k] || 0) + 1; });
          feedPosts = ps.slice().sort(function (a, b) { return tsOf(b) - tsOf(a); });
          feedEl.classList.remove("loading");
          renderFeed();
        });
    }

    // ----- 사진: 앨범 선택 → 미리보기 (업로드는 공용 uploadToImgbb 사용) -----
    function showPhoto(dataURL) {
      lastPreviewDataURL = dataURL;
      pPreviewImg.src = dataURL;
      pPreview.hidden = false;
      pPhotoBtn.textContent = "📸 " + T("uploadBtn");
    }
    function clearPhoto() {
      selectedFile = null; lastPreviewDataURL = null;
      if (pFile) pFile.value = "";
      pPreviewImg.removeAttribute("src");
      pPreview.hidden = true;
      pPhotoBtn.textContent = "📸 " + T("uploadBtn");
    }
    function onFilePicked() {
      var f = pFile.files && pFile.files[0];
      if (!f) return;
      if (!f.type || f.type.indexOf("image/") !== 0) { setNote(pNote, "이미지 파일만 올릴 수 있어요.", false); pFile.value = ""; return; }
      selectedFile = f;
      setNote(pNote, "", true);
      readDataURL(f).then(showPhoto);
    }

    // ----- 글쓰기 모달 -----
    function openWrite() {
      pAuthor.textContent = "작성자: " + uid();
      pText.value = "";
      clearPhoto();
      setNote(pNote, "", true);
      pModal.classList.add("open");
      pModal.setAttribute("aria-hidden", "false");
      setTimeout(function () { pText.focus(); }, 60);
    }
    function closeWrite() { pModal.classList.remove("open"); pModal.setAttribute("aria-hidden", "true"); }

    function submitPost() {
      var content = pText.value.trim();
      if (!content && !selectedFile) { setNote(pNote, "내용을 입력하거나 사진을 올려주세요.", false); pText.focus(); return; }
      pSubmit.disabled = true;

      // image_url 확정 후 community 탭에 POST (사진 없으면 빈 값)
      function publish(imageUrl) {
        var row = { post_id: String(Date.now()), user_id: uid(), content: content, image_url: imageUrl || "", created_at: nowISO() };
        var cache = lsRead(LS_POSTS); cache.push(row); lsWrite(LS_POSTS, cache);  // 낙관적 + 오프라인
        var done = function () {
          pSubmit.disabled = false; pSubmit.textContent = T("submitBtn");
          closeWrite();
          showToast("동네에 글을 남겼어요 🐾");
          refresh();
        };
        if (MODE === "sheet") sheetPost("community", row).then(done, done);
        else done();
      }

      if (selectedFile) {
        pSubmit.textContent = "사진 올리는 중…";
        setNote(pNote, "사진을 올리고 있어요…", true);
        uploadToImgbb(selectedFile).then(function (url) {
          publish(url);
        }, function () {
          // 업로드 실패 폴백: 데모는 로컬 미리보기(dataURL)로, 시트모드는 글만 등록
          if (MODE === "demo" && lastPreviewDataURL) publish(lastPreviewDataURL);
          else { setNote(pNote, "사진 업로드에 실패해 글만 등록했어요.", false); publish(""); }
        });
      } else {
        publish("");
      }
    }

    // ----- 상세 + 댓글 모달 -----
    function openDetail(postId) {
      var p = feedPosts.filter(function (x) { return String(x.post_id) === String(postId); })[0];
      if (!p) return;
      currentPostId = String(postId);
      dAuthor.textContent = p.user_id || "보호자";
      dTime.textContent = friendly(p.created_at);
      if (p.image_url) { dPhotoImg.src = p.image_url; dPhoto.hidden = false; }
      else { dPhotoImg.removeAttribute("src"); dPhoto.hidden = true; }
      dBody.textContent = p.content || "";
      dInput.value = "";
      dCmts.innerHTML = '<div class="cmt-loading">댓글을 불러오는 중…</div>';
      dCount.textContent = "댓글";
      dModal.classList.add("open");
      dModal.setAttribute("aria-hidden", "false");
      renderComments();
    }
    function closeDetail() { dModal.classList.remove("open"); dModal.setAttribute("aria-hidden", "true"); currentPostId = null; }

    // 현재 글의 post_id와 일치하는 댓글만 필터 → 오래된 순 정렬
    function renderComments() {
      return loadRows("comments", LS_CMTS).then(function (all) {
        var mine = all.filter(function (c) { return String(c.post_id) === String(currentPostId); })
          .sort(function (a, b) { return (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0); });
        dCount.textContent = "댓글 " + mine.length;
        if (!mine.length) { dCmts.innerHTML = '<div class="cmt-empty">첫 댓글을 남겨보세요 💬</div>'; return; }
        dCmts.innerHTML = mine.map(function (c) {
          return '<div class="cmt-item"><div class="cmt-head"><span class="ca">' + esc(c.user_id || "보호자") + "</span>" +
            '<span class="ct">' + esc(friendly(c.created_at)) + "</span></div>" +
            '<div class="cmt-body">' + esc(c.comment_content || "") + "</div></div>";
        }).join("");
        dCmts.scrollTop = dCmts.scrollHeight;
      });
    }

    function submitComment() {
      var content = dInput.value.trim();
      if (!content || !currentPostId) return;
      var row = { post_id: currentPostId, user_id: uid(), comment_content: content, created_at: nowISO() };
      var cache = lsRead(LS_CMTS); cache.push(row); lsWrite(LS_CMTS, cache);
      dSend.disabled = true;
      dInput.value = "";
      var done = function () {
        dSend.disabled = false;
        renderComments();
        refresh();  // 피드 댓글수 갱신
      };
      if (MODE === "sheet") sheetPost("comments", row).then(done, done);
      else done();
    }

    // ----- 이벤트 -----
    if (fab) fab.addEventListener("click", openWrite);
    document.getElementById("postClose").addEventListener("click", closeWrite);
    document.getElementById("postCancel").addEventListener("click", closeWrite);
    pSubmit.addEventListener("click", submitPost);
    // 언어 전환 시 글쓰기 모달 동적 텍스트 갱신
    window.addEventListener("petpy:lang", function () {
      if (!selectedFile) pPhotoBtn.textContent = "📸 " + T("uploadBtn");
      pSubmit.textContent = T("submitBtn");
    });
    pModal.addEventListener("click", function (e) { if (e.target === pModal) closeWrite(); });
    if (pPhotoBtn) pPhotoBtn.addEventListener("click", function () { pFile.click(); });
    if (pFile) pFile.addEventListener("change", onFilePicked);
    if (pPhotoRemove) pPhotoRemove.addEventListener("click", clearPhoto);

    document.getElementById("detailClose").addEventListener("click", closeDetail);
    dSend.addEventListener("click", submitComment);
    dInput.addEventListener("keydown", function (e) { if (e.key === "Enter") submitComment(); });
    dModal.addEventListener("click", function (e) { if (e.target === dModal) closeDetail(); });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (pModal.classList.contains("open")) closeWrite();
      else if (dModal.classList.contains("open")) closeDetail();
    });

    feedEl.addEventListener("click", function (e) {
      var card = e.target.closest && e.target.closest(".post-card[data-post-id]");
      if (card) openDetail(card.getAttribute("data-post-id"));
    });
    feedEl.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var card = e.target.closest && e.target.closest(".post-card[data-post-id]");
      if (card) { e.preventDefault(); openDetail(card.getAttribute("data-post-id")); }
    });

    // FAB: 소통 탭에서만 노출
    function syncFab(tab) { if (fab) fab.classList.toggle("show", tab === "connect"); }
    window.addEventListener("petpy:tab", function (e) { syncFab(e.detail && e.detail.tab); });
    var activeTab = document.querySelector(".tab.active");
    syncFab(activeTab ? activeTab.getAttribute("data-tab") : "record");

    // 데모 모드 첫 진입: 살아있는 피드를 위한 시드
    if (MODE === "demo" && !lsRead(LS_POSTS).length) {
      var b = Date.now();
      lsWrite(LS_POSTS, [
        { post_id: String(b - 5400000), user_id: "초코맘_3174", content: "오늘 저녁 7시에 같이 산책하실 분 계세요? 🐕 공원 입구에서 만나요!", image_url: "", created_at: new Date(b - 5400000).toISOString() },
        { post_id: String(b - 2700000), user_id: "몽이언니_5093", content: "사거리 '행복동물병원' 야간 9시까지 진료해요. 친절하셔서 추천합니다!", image_url: "", created_at: new Date(b - 2700000).toISOString() },
        { post_id: String(b - 600000), user_id: "보리맘_6647", content: "소화 약한 강아지 간식 뭐 주시나요? 추천 받아요 🤔", image_url: "", created_at: new Date(b - 600000).toISOString() }
      ]);
      lsWrite(LS_CMTS, [
        { post_id: String(b - 600000), user_id: "두부아빠_8210", comment_content: "저흰 동결건조 닭가슴살이요! 치석에도 좋아요 👍", created_at: new Date(b - 300000).toISOString() }
      ]);
    }

    // 최초 로드: 누적 데이터 전부 긁어와 렌더
    refresh();
  })();

  // ---------- 동네 인증 안내 모달(베타: 전지역 통합, 정식 출시 시 동네 매칭) ----------
  var verifyModal = document.getElementById("verifyModal");
  function vOpen() { verifyModal.classList.add("open"); verifyModal.setAttribute("aria-hidden", "false"); }
  function vClose() { verifyModal.classList.remove("open"); verifyModal.setAttribute("aria-hidden", "true"); }
  document.getElementById("verifyBtn").addEventListener("click", vOpen);
  document.getElementById("verifyClose").addEventListener("click", vClose);
  document.getElementById("verifyOk").addEventListener("click", vClose);
  verifyModal.addEventListener("click", function (e) { if (e.target === verifyModal) vClose(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && verifyModal.classList.contains("open")) vClose();
  });
})();
