/*
 * petpy 기억창구 — 2.5D AR 메모리얼
 * ─────────────────────────────────────────────────────────────
 * 웹캠 스트림을 탭 배경으로 깔고, 그 위에 Three.js 렌더러를 투명 오버레이.
 * 기록창구에 등록된 사진 → Replicate 배경분리(컷아웃, 투명 PNG) → 빌보드 평면 텍스처.
 * 백엔드 미연결/실패/보안정책 시 원본 이미지를 그대로 3D 카드로 폴백.
 * 바이올렛 파티클 상승 + localStorage(petpy.memorial.msgs) 추모 자막 + 호흡 애니.
 * 추모글·소환(누끼) 실사용은 구글시트 memorial 탭에도 fire-and-forget 적재(데모면 자동 생략).
 * AI 3D 업그레이드는 이메일 수집 페이크도어.
 */
import * as THREE from "three";

const VIOLET = 0x9d7fc4;
const MSG_KEY = "petpy.memorial.msgs";
const API = (window.PETPY_API || "").replace(/\/+$/, "");
const OK = "#7E8E76";
const ERR = "#C47A4C";

const panel = document.querySelector('[data-panel="remember"]');
if (panel) initAR(panel);

function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

function initAR(panel) {
  const cam = panel.querySelector("#arCam");
  const fallback = panel.querySelector("#arFallback");
  const canvas = panel.querySelector("#arCanvas");
  const statusEl = panel.querySelector("#arStatus");
  const spinner = panel.querySelector("#arSpinner");
  const captionEl = panel.querySelector("#arCaption");
  const petsRow = panel.querySelector("#arPets");
  const fileInput = panel.querySelector("#arFile");
  const emptyEl = panel.querySelector("#arEmpty");
  const msgInput = panel.querySelector("#arMsg");
  const msgSave = panel.querySelector("#arMsgSave");

  function setStatus(t) { if (statusEl) statusEl.textContent = t; }

  /* ---------------- 기억하기 실사용 로깅(구글시트 memorial 탭) ----------------
   * 헤더: user_id | pet_name | type | message | source | result | created_at
   * type=message(추모글) / type=summon(소환·누끼; result=cutout|fallback|demo|original|load_fail)
   * fire-and-forget — 데모 모드(PETPY_GAS 미설정)면 saveRow가 자동 생략. */
  let lastPet = "";
  function logMemorial(row) {
    try {
      if (!(window.PETPY && window.PETPY.saveRow)) return;
      const base = {
        user_id: localStorage.getItem("petpy_user_id") || "",
        pet_name: "", type: "", message: "", source: "", result: "",
        created_at: window.PETPY_now()
      };
      window.PETPY.saveRow("memorial", Object.assign(base, row));
    } catch (e) {}
  }

  /* ---------------- Three.js 기본 세팅 ---------------- */
  const R = 3.3; // 카메라 궤도 반지름
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, R);

  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  } catch (e) {
    setStatus("이 기기에서는 3D 미리보기를 지원하지 않아요");
  }

  /* ---------------- 컷아웃 평면(빌보드 + 호흡) ---------------- */
  let cutMesh = null, baseW = 1.6, baseH = 2.0;
  const texLoader = new THREE.TextureLoader();
  texLoader.setCrossOrigin("anonymous");

  function setCutoutTexture(url) {
    return new Promise(function (resolve) {
      texLoader.load(
        url,
        function (tex) {
          tex.colorSpace = THREE.SRGBColorSpace;
          const img = tex.image;
          const aspect = img && img.width && img.height ? img.width / img.height : 1;
          baseH = 2.0;
          baseW = baseH * aspect;
          if (!cutMesh) {
            const geo = new THREE.PlaneGeometry(1, 1);
            const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
            cutMesh = new THREE.Mesh(geo, mat);
            scene.add(cutMesh);
          } else {
            if (cutMesh.material.map) cutMesh.material.map.dispose();
            cutMesh.material.map = tex;
            cutMesh.material.needsUpdate = true;
          }
          cutMesh.visible = true;
          if (emptyEl) emptyEl.style.display = "none";
          resolve(true);
        },
        undefined,
        function () { resolve(false); }
      );
    });
  }

  /* ---------------- 바이올렛 파티클(상승) ---------------- */
  const P = 150;
  const pos = new Float32Array(P * 3);
  const spd = new Float32Array(P);
  function seedParticle(i, anyY) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.55 + Math.random() * 1.5;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = anyY ? Math.random() * 4.6 - 2.2 : -2.2;
    pos[i * 3 + 2] = Math.sin(a) * r;
    spd[i] = 0.004 + Math.random() * 0.011;
  }
  for (let i = 0; i < P; i++) seedParticle(i, true);

  function dotTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const rad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rad.addColorStop(0, "rgba(255,255,255,1)");
    rad.addColorStop(0.3, "rgba(212,190,240,.9)");
    rad.addColorStop(1, "rgba(157,127,196,0)");
    g.fillStyle = rad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pmat = new THREE.PointsMaterial({
    color: VIOLET, size: 0.075, map: dotTexture(), transparent: true,
    opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false
  });
  const points = new THREE.Points(pgeo, pmat);
  scene.add(points);

  /* ---------------- 터치/마우스 드래그 오비트 ---------------- */
  let az = 0, targetAz = 0, pol = 0, targetPol = 0, dragging = false, lx = 0, ly = 0;
  function ptXY(e) { return { x: e.clientX, y: e.clientY }; }
  if (canvas) {
    canvas.addEventListener("pointerdown", function (e) { dragging = true; const p = ptXY(e); lx = p.x; ly = p.y; });
  }
  window.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    const p = ptXY(e);
    targetAz += (p.x - lx) * 0.006;
    targetPol = Math.max(-0.5, Math.min(0.5, targetPol + (p.y - ly) * 0.004));
    lx = p.x; ly = p.y;
  });
  window.addEventListener("pointerup", function () { dragging = false; });

  /* ---------------- 렌더 루프 ---------------- */
  let raf = 0, t0 = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!renderer) return;
    const t = (now - t0) / 1000;
    az += (targetAz - az) * 0.08;
    pol += (targetPol - pol) * 0.08;
    const cp = Math.cos(pol);
    camera.position.set(Math.sin(az) * R * cp, Math.sin(pol) * R, Math.cos(az) * R * cp);
    camera.lookAt(0, 0.1, 0);

    if (cutMesh) {
      cutMesh.quaternion.copy(camera.quaternion);     // 빌보드: 항상 정면
      const s = 1 + Math.sin(t * 1.7) * 0.035;          // 호흡(스케일)
      cutMesh.scale.set(baseW * s, baseH * s, 1);
      cutMesh.position.y = 0.1 + Math.sin(t * 1.3) * 0.05; // 살짝 떠오르는 호흡
    }
    for (let i = 0; i < P; i++) {
      pos[i * 3 + 1] += spd[i];
      if (pos[i * 3 + 1] > 2.4) seedParticle(i, false);
    }
    pgeo.attributes.position.needsUpdate = true;
    points.rotation.y += 0.0008;
    renderer.render(scene, camera);
  }

  function resize() {
    if (!renderer) return;
    const w = panel.clientWidth, h = panel.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);

  /* ---------------- 웹캠 스트림 ---------------- */
  let stream = null;
  async function startCam() {
    if (stream) return;
    setStatus("카메라를 준비하고 있어요…");
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("unsupported");
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      cam.srcObject = stream;
      await cam.play().catch(function () {});
      cam.classList.add("on");
      setStatus(cutMesh ? "휴대폰을 천천히 움직여 보세요" : "아이를 선택해 다시 만나보세요");
    } catch (e) {
      cam.classList.remove("on"); // 폴백 가든이 비쳐 보임
      setStatus("카메라가 없어 가든 모드로 보여드려요");
    }
  }
  function stopCam() {
    if (stream) {
      stream.getTracks().forEach(function (tk) { tk.stop(); });
      stream = null;
      cam.srcObject = null;
      cam.classList.remove("on");
    }
  }

  /* ---------------- 소환 썸네일(기록창구 사진) + 업로드 ---------------- */
  function getRecords() {
    try { return (window.PETPY && window.PETPY.getRecords && window.PETPY.getRecords()) || []; }
    catch (e) { return []; }
  }
  function buildPets() {
    const withImg = getRecords().filter(function (r) { return r && r.img; });
    let html = "";
    withImg.forEach(function (r, i) {
      html += '<button type="button" class="ar-pet" data-i="' + i + '">' +
        '<img src="' + esc(r.img) + '" alt="" onerror="this.parentNode.classList.add(\'noimg\')">' +
        "<span>" + esc(r.name || "우리 아이") + "</span></button>";
    });
    html += '<button type="button" class="ar-pet add" id="arAdd"><span class="plus">＋</span><span>사진</span></button>';
    petsRow.innerHTML = html;
    petsRow.querySelectorAll(".ar-pet[data-i]").forEach(function (btn) {
      btn.addEventListener("click", function () { summonRecord(withImg[+btn.dataset.i]); });
    });
    const addBtn = panel.querySelector("#arAdd");
    if (addBtn) addBtn.addEventListener("click", function () { fileInput.click(); });
  }
  fileInput.addEventListener("change", function () {
    const f = fileInput.files && fileInput.files[0];
    if (f) summonFile(f);
    fileInput.value = "";
  });

  function readDataURL(file) {
    return new Promise(function (res, rej) {
      const r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }
  async function urlToDataURL(url) {
    const r = await fetch(url, { mode: "cors" });
    const b = await r.blob();
    return await new Promise(function (res, rej) {
      const fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = rej;
      fr.readAsDataURL(b);
    });
  }

  // 파일 업로드 → dataURL → (컷아웃) → 텍스처
  async function summonFile(file) {
    if (!file.type || file.type.indexOf("image/") !== 0) { setStatus("이미지 파일을 올려주세요."); return; }
    const dataURL = await readDataURL(file);
    lastPet = "";
    await summon(dataURL, true, { source: "upload", pet_name: "" });
  }
  // 기록 사진(URL) → dataURL 변환 시도 후 컷아웃, 실패 시 원본 URL 카드로 폴백
  async function summonRecord(rec) {
    if (!rec || !rec.img) return;
    lastPet = rec.name || "";
    if (emptyEl) emptyEl.style.display = "none";
    let dataURL = null;
    if (API) {
      setStatus("사진을 불러오는 중…");
      try { dataURL = await urlToDataURL(rec.img); } catch (e) { dataURL = null; }
    }
    const meta = { source: "record", pet_name: rec.name || "" };
    if (dataURL) await summon(dataURL, true, meta);
    else await summonUrlOnly(rec.img, meta);
  }

  async function summon(dataURL, canCutout, meta) {
    meta = meta || { source: "upload", pet_name: lastPet };
    if (emptyEl) emptyEl.style.display = "none";
    let shown = dataURL, result;
    if (API && canCutout) {
      if (spinner) spinner.classList.add("on");
      setStatus("AI가 배경을 분리하는 중…");
      try {
        const r = await fetch(API + "/api/cutout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: dataURL })
        });
        const j = await r.json().catch(function () { return {}; });
        if (r.ok && j.image) { shown = j.image; result = "cutout"; setStatus("AI 배경 분리 완료 · 다시, 늘 있던 그 자리에서"); }
        else throw new Error(j.error || "HTTP " + r.status);
      } catch (e) {
        result = "fallback";
        setStatus("백엔드 미연결 — 원본으로 보여드려요 (데모 폴백)");
      } finally {
        if (spinner) spinner.classList.remove("on");
      }
    } else {
      result = "demo";
      setStatus(API ? "원본으로 보여드려요 (데모 폴백)" : "데모 모드 — 백엔드 연결 시 AI가 배경을 분리해요");
    }
    const ok = await setCutoutTexture(shown);
    if (!ok) setStatus("이미지를 불러오지 못했어요. 다른 사진을 올려주세요.");
    logMemorial({ pet_name: meta.pet_name, type: "summon", source: meta.source, result: ok ? result : "load_fail" });
  }
  async function summonUrlOnly(url, meta) {
    meta = meta || { source: "record", pet_name: lastPet };
    if (emptyEl) emptyEl.style.display = "none";
    setStatus("원본 사진으로 보여드려요");
    const ok = await setCutoutTexture(url);
    if (!ok) setStatus("이 사진은 보안 정책으로 불러올 수 없어요. 사진을 직접 올려보세요.");
    logMemorial({ pet_name: meta.pet_name, type: "summon", source: meta.source, result: ok ? "original" : "load_fail" });
  }

  /* ---------------- 추모 자막(localStorage) ---------------- */
  let capList = [], capIdx = 0, capTimer = 0;
  function loadMsgs() {
    try { return JSON.parse(localStorage.getItem(MSG_KEY) || "[]"); } catch (e) { return []; }
  }
  function showCap() {
    captionEl.classList.remove("show");
    setTimeout(function () {
      captionEl.textContent = "“" + capList[capIdx % capList.length] + "”";
      captionEl.classList.add("show");
      capIdx++;
    }, 350);
  }
  function renderCaptions() {
    capList = loadMsgs().map(function (m) { return m && m.t ? m.t : ""; }).filter(Boolean);
    clearInterval(capTimer);
    capIdx = 0;
    if (!capList.length) {
      captionEl.textContent = "“늘 있던 그 자리에서, 다시 만나요.”";
      captionEl.classList.add("show");
      return;
    }
    showCap();
    capTimer = setInterval(showCap, 4200);
  }
  msgSave.addEventListener("click", function () {
    const v = msgInput.value.trim();
    if (!v) return;
    try {
      const arr = loadMsgs();
      arr.push({ t: v, ts: Date.now() });
      localStorage.setItem(MSG_KEY, JSON.stringify(arr));
    } catch (e) {}
    logMemorial({ pet_name: lastPet, type: "message", message: v });
    msgInput.value = "";
    renderCaptions();
    setStatus("메시지를 기억에 담았어요 💜");
  });
  msgInput.addEventListener("keydown", function (e) { if (e.key === "Enter") msgSave.click(); });

  /* ---------------- AI 3D 업그레이드(페이크도어) ---------------- */
  const ar3dBtn = panel.querySelector("#ar3dBtn");
  const modal = document.getElementById("ar3dModal");
  const email = document.getElementById("ar3dEmail");
  const note = document.getElementById("ar3dNote");
  function mNote(msg, ok) { note.textContent = msg; note.style.color = ok ? OK : ERR; }
  function mOpen() { modal.classList.add("open"); note.textContent = ""; setTimeout(function () { email.focus(); }, 60); }
  function mClose() { modal.classList.remove("open"); }
  function mSubmit() {
    const v = email.value.trim();
    if (!v || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { mNote("올바른 이메일 주소를 입력해 주세요.", false); email.focus(); return; }
    // SheetDB 'demand' 수요조사 저장(데모면 자동 생략) — fire-and-forget
    var uid = localStorage.getItem("petpy_user_id") || "";
    if (window.PETPY && window.PETPY.saveRow) {
      window.PETPY.saveRow("3d_demand", { user_id: uid, email: v, created_at: window.PETPY_now() });
    }
    email.value = "";
    mNote("신청 완료! 3D 베타가 열리면 가장 먼저 모실게요 ✦", true);
    setTimeout(mClose, 1600);
  }
  ar3dBtn.addEventListener("click", mOpen);
  document.getElementById("ar3dClose").addEventListener("click", mClose);
  document.getElementById("ar3dSubmit").addEventListener("click", mSubmit);
  email.addEventListener("keydown", function (e) { if (e.key === "Enter") mSubmit(); });
  modal.addEventListener("click", function (e) { if (e.target === modal) mClose(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.classList.contains("open")) mClose();
  });

  /* ---------------- 탭 라이프사이클 ---------------- */
  let active = false;
  function activate() {
    if (active) return;
    active = true;
    resize();
    buildPets();
    renderCaptions();
    startCam();
    t0 = performance.now();
    if (renderer && !raf) raf = requestAnimationFrame(frame);
  }
  function deactivate() {
    if (!active) return;
    active = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    clearInterval(capTimer);
    stopCam();
  }
  window.addEventListener("petpy:tab", function (e) {
    if (e.detail && e.detail.tab === "remember") activate();
    else deactivate();
  });
  if (panel.classList.contains("active")) activate();

  // 외부/테스트 진입점(썸네일·업로드와 동일 경로)
  window.petpyAR = {
    activate: activate,
    deactivate: deactivate,
    summonDataURL: function (d) { return summon(d, true, { source: "external", pet_name: lastPet }); },
    summonUrl: summonUrlOnly
  };
}
