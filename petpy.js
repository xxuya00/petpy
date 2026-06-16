  // ============ 소통하기: 글 작성 → 게시 → 이웃 댓글 시나리오 애니메이션 ============
  // 실제 앱 흐름(동네 글 올리기 → 댓글 달기)을 4개 시나리오로 순서대로 반복:
  //   ① 산책메이트 찾기 ② 야간병원 찾기 ③ 간식 추천 ④ 미용 자랑(사진 첨부)
  // #connect(소통 목업)가 화면에 보일 때 시작.
  (function(){
    const mock=document.getElementById('commMock');
    if(!mock) return;
    const post=document.getElementById('cPost');
    const author=document.getElementById('cAuthor');
    const photo=document.getElementById('cPhoto');
    const photoImg=photo.querySelector('img');
    const body=document.getElementById('cBody');
    const cmts=document.getElementById('cCmts');
    const typing=document.getElementById('cTyping');
    const typingWho=document.getElementById('cTypingWho');
    const scenes=[
      {author:'초코맘 · 도보 3분', post:'오늘 저녁 7시에 같이 산책하실 분 계세요? 🐕', photo:null, comments:[
        {who:'두부아빠', t:'저요! 두부도 친구 필요했어요 ㅎㅎ'},
        {who:'콩이맘', t:'콩이도 갈게요! 공원 입구에서 봬요 🙌'},
      ]},
      {author:'레오파파 · 도보 4분', post:'우리 동네 야간 진료 되는 병원 있을까요? 😢', photo:null, comments:[
        {who:'몽이언니', t:"사거리 '행복동물병원' 9시까지 해요!"},
        {who:'토리맘', t:'거기 응급도 잘 봐주셔서 추천이요 🏥'},
      ]},
      {author:'보리맘 · 도보 6분', post:'소화 약한 강아지 간식 추천 받아요 🤔', photo:null, comments:[
        {who:'콩이님', t:'동결건조 닭가슴살 강추! 치석에도 좋아요 🍗'},
        {who:'두부아빠', t:'우리도 그거 먹어요~ 소화 잘돼요 👍'},
      ]},
      {author:'초코맘 · 도보 3분', post:'우리 초코 미용했어요 ✂️ 너무 귀엽죠? ☺️', photo:'images/2.png', comments:[
        {who:'몽이언니', t:'헉 인형인 줄… 너무 귀여워요 🥹'},
        {who:'레오파파', t:'미용 어디서 하셨어요? 정보 공유 좀요 🙏'},
      ]},
    ];
    let started=false;
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    function loadImg(src){return new Promise(res=>{photoImg.onload=res;photoImg.onerror=res;photoImg.src=src;});}
    async function typeBody(text){
      body.innerHTML='<span class="cur"></span>';
      const cur=body.querySelector('.cur');
      for(const ch of Array.from(text)){cur.insertAdjacentText('beforebegin',ch);await wait(55);}
      await wait(450);cur.remove();
    }
    async function scene(s){
      // 리셋
      post.classList.remove('in');
      cmts.innerHTML='';body.textContent='';typing.classList.add('off');photo.classList.remove('show');
      await wait(350);
      author.textContent=s.author;
      if(s.photo){await loadImg(s.photo);photo.classList.add('show');}
      // 글 게시(슬라이드 인)
      post.classList.add('in');
      await wait(320);
      // 본문 작성(타이핑)
      await typeBody(s.post);
      await wait(500);
      // 이웃 댓글 하나씩(입력중 → 등록)
      for(const c of s.comments){
        typingWho.textContent=c.who+'님이 입력 중';
        typing.classList.remove('off');
        await wait(1100);
        typing.classList.add('off');
        const d=document.createElement('div');
        d.className='ccmt';
        d.innerHTML='<b></b>';
        d.querySelector('b').textContent=c.who;
        d.appendChild(document.createTextNode(c.t));
        cmts.appendChild(d);
        await wait(950);
      }
      await wait(2400); // 시나리오 끝나고 잠시 멈춤
    }
    async function loop(){let i=0;while(started){await scene(scenes[i]);i=(i+1)%scenes.length;}}
    const io=new IntersectionObserver((es)=>es.forEach(e=>{
      if(e.isIntersecting && !started){started=true;loop();}
    }),{threshold:.3});
    io.observe(mock);
  })();

  // hero word swap: 기록이 ↔ 기억이 — CSS 페이드 한 사이클이 끝나는(글자가 안 보이는) 순간에만 교체.
  // setInterval 대신 animationiteration에 묶어, 양방향(기록이→기억이, 기억이→기록이) 모두
  // '페이드아웃 → 교체 → 페이드인'으로 동일하게 흐르게 함(예전엔 한쪽이 보이는 채로 톡 바뀌어 어색했음).
  (function(){
    const el=document.getElementById('swapWord');
    if(!el) return;
    const words=['기록이','기억이'];let i=0;
    el.addEventListener('animationiteration',()=>{i=(i+1)%words.length;el.textContent=words[i];});
  })();

  // ============ 기록하기 업로드 데모 애니메이션 ============
  // 실제 앱 흐름 재현: 사진 선택(슬롯 채움) → 캡션 타이핑 → '추억 등록하기' → 업로드 진행 → 카드 완성(방금·327→328) → 리셋 반복.
  // #record 가 화면에 보일 때 시작(소통 섹션과 동일 패턴).
  (function(){
    const mock=document.getElementById('recMock');
    if(!mock) return;
    const slot=document.getElementById('upSlot');
    const img=slot.querySelector('.up-img');
    const capB=slot.querySelector('.up-cap b');
    const capS=slot.querySelector('.up-cap span');
    const cmp=document.getElementById('recComposer');
    const typed=document.getElementById('recTyped');
    const btn=document.getElementById('recBtn');
    const cnt=document.getElementById('recCount');
    const PH='추억 캡션 적기 (예: 오늘 산책 최고였어!)';
    const BASE=327;
    // 업로드 슬롯 전용 사진은 그리드 base 카드(images/1·2·4)에 없는 images/3 → 화면에 같은 사진이 중복돼 보이지 않음
    const UP_IMG='images/3.png';
    const caps=['햇살 아래 단잠 😴','오늘의 간식 타임 🍖','창밖 구경 삼매경 🐶','산책 다녀왔어요 🐾'];
    const items=caps.map(c=>({img:UP_IMG,cap:c}));
    let idx=0,started=false;
    const wait=ms=>new Promise(r=>setTimeout(r,ms));

    function reset(){
      slot.classList.remove('filled','uploading','done');
      img.removeAttribute('src');
      capB.textContent='';capS.textContent='';
      typed.textContent=PH;typed.classList.add('cmp-ph');
      cmp.classList.remove('up');btn.classList.remove('press');
      cnt.textContent=BASE;
    }
    async function typeOut(text){
      typed.classList.remove('cmp-ph');typed.textContent='';
      for(const ch of Array.from(text)){typed.textContent+=ch;await wait(85);}
    }
    function loadImg(src){return new Promise(res=>{img.onload=res;img.onerror=res;img.src=src;});}

    async function cycle(){
      const it=items[idx%items.length];idx++;
      reset();
      await wait(750);
      // 1) 앨범에서 사진 선택 → 슬롯 채움
      await loadImg(it.img);
      slot.classList.add('filled');
      await wait(650);
      // 2) 작성 시트 올라오고 캡션 타이핑
      cmp.classList.add('up');
      await wait(460);
      await typeOut(it.cap);
      await wait(520);
      // 3) '추억 등록하기' 누름
      btn.classList.add('press');await wait(160);btn.classList.remove('press');
      await wait(140);
      // 4) 시트 내려가고 업로드 진행(사진 위 진행바)
      cmp.classList.remove('up');
      await wait(360);
      slot.classList.add('uploading');
      await wait(960);
      // 5) 완료 — 캡션(굵게)/날짜/방금 뱃지/카운트
      capB.textContent=it.cap;capS.textContent='오늘';
      slot.classList.remove('uploading');slot.classList.add('done');
      cnt.textContent=BASE+1;
      await wait(2600);
    }
    async function loop(){while(started){await cycle();}}
    const io=new IntersectionObserver((es)=>es.forEach(e=>{
      if(e.isIntersecting&&!started){started=true;reset();loop();}
    }),{threshold:.3});
    io.observe(mock);
  })();
  // AR: 영상 파일(ar_reunion.mp4)이 로드되면 영상 표시, 없으면 플레이스홀더 연출 유지
  (function(){
    const v=document.getElementById('arVideo'),ph=document.getElementById('arPlaceholder');
    v.addEventListener('loadeddata',()=>{v.classList.add('ready');ph.classList.add('hidden');});
    v.addEventListener('error',()=>{v.classList.remove('ready');ph.classList.remove('hidden');});
  })();
  const io=new IntersectionObserver((es)=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('in')}),{threshold:.18});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

  // counter tick
  let c=1247;setInterval(()=>{if(Math.random()>.6){c++;document.getElementById('cnt').textContent=c.toLocaleString()}},3500);

  // 화면 하단 토스트 팝업(공용) — #toast 사용
  function petpyToast(msg){
    var t=document.getElementById('toast'); if(!t) return;
    t.textContent=msg; t.classList.add('show');
    clearTimeout(t._t); t._t=setTimeout(function(){ t.classList.remove('show'); }, 3200);
  }
  // beta — 이메일/피드백을 Apps Script 'beta' 탭에 실제 저장(관심 수요 데이터)
  function submitBeta(){
    const e=document.getElementById('email').value.trim();
    const fb=document.getElementById('feedback').value.trim();
    const msg=document.getElementById('betaMsg');
    if(!e||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)){msg.style.color='#c47a4c';msg.textContent='올바른 이메일 주소를 입력해 주세요.';petpyToast('이메일 주소를 다시 확인해 주세요 🙏');return;}
    // Apps Script 'beta' 탭에 저장 (PETPY_GAS 비어있으면 데모: 저장 생략) — fire-and-forget
    // ('visitors'는 이미 외부 방문자-분석 로깅이 쓰는 탭이라 petpy 전용 'beta' 탭 사용)
    // text/plain = 단순 요청이라 Apps Script CORS 프리플라이트 회피
    const GAS=(window.PETPY_GAS||'').replace(/\/+$/,'');
    if(GAS){
      fetch(GAS,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({sheet:'beta',row:{email:e,message:fb,created_at:window.PETPY_now()}})}).catch(()=>{});
    }
    msg.style.color='#7E8E76';
    const done=fb ? '신청 완료! 소중한 의견 감사해요. 가장 먼저 소식 전할게요 💛'
                  : '베타 신청 완료! 가장 먼저 소식을 전해드릴게요 💛';
    msg.textContent=done;
    petpyToast(done);
    document.getElementById('email').value='';
    document.getElementById('feedback').value='';
    c++;document.getElementById('cnt').textContent=c.toLocaleString();
  }
  document.getElementById('email').addEventListener('keydown',e=>{if(e.key==='Enter')submitBeta()});
  document.getElementById('feedback').addEventListener('keydown',e=>{if(e.key==='Enter')submitBeta()});

  // ============ Memorial Garden 체험 (코어 기능) ============
  // 흐름: 사진 업로드 → (백엔드)/api/cutout 으로 AI 배경 분리 → 메모리얼 무대에 배치
  //       → 움직임(i2v)은 사전 생성 영상 재생 → 메시지 남기기(localStorage)
  // window.PETPY_API 가 비어있거나 호출 실패 시: 원본 이미지로 폴백(데모 모드)
  (function(){
    const overlay=document.getElementById('mgOverlay');
    if(!overlay) return;
    const API=(window.PETPY_API||'').replace(/\/+$/,'');
    const fileInput=document.getElementById('mgFile');
    const drop=document.getElementById('mgDrop');
    const cutout=document.getElementById('mgCutout');
    const video=document.getElementById('mgVideo');
    const spinner=document.getElementById('mgSpinner');
    const empty=document.getElementById('mgEmpty');
    const cap=document.getElementById('mgCap');
    const animBtn=document.getElementById('mgAnimate');
    const msgWrap=document.getElementById('mgMsgWrap');
    const msgInput=document.getElementById('mgMsg');
    const note=document.getElementById('mgNote');

    function reset(){
      cutout.classList.remove('show');cutout.removeAttribute('src');
      video.classList.remove('show');try{video.pause();}catch(e){}
      spinner.classList.remove('show');empty.style.display='';
      cap.textContent='';animBtn.disabled=true;msgWrap.classList.remove('show');
      fileInput.value='';
      note.innerHTML=API?'백엔드 연결 · 사진을 올려보세요':'데모 모드 · 사진을 올려보세요';
    }
    function open(){overlay.classList.add('open');document.body.style.overflow='hidden';reset();}
    function close(){overlay.classList.remove('open');document.body.style.overflow='';try{video.pause();}catch(e){}}
    window.openMemorial=open;

    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    document.getElementById('mgClose').addEventListener('click',close);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay.classList.contains('open'))close();});

    drop.addEventListener('click',()=>fileInput.click());
    fileInput.addEventListener('change',()=>{if(fileInput.files[0])handle(fileInput.files[0]);});
    ['dragover','dragenter'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.style.background='rgba(157,127,196,.14)';}));
    ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.style.background='';}));
    drop.addEventListener('drop',e=>{const f=e.dataTransfer.files&&e.dataTransfer.files[0];if(f)handle(f);});

    function readDataURL(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);});}

    async function handle(file){
      if(!file.type||!file.type.startsWith('image/')){note.innerHTML='이미지 파일을 올려주세요.';return;}
      const dataURL=await readDataURL(file);
      empty.style.display='none';
      video.classList.remove('show');cutout.classList.remove('show');
      let shown=dataURL;
      if(API){
        spinner.classList.add('show');
        try{
          const r=await fetch(API+'/api/cutout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:dataURL})});
          const j=await r.json().catch(()=>({}));
          if(r.ok&&j.image){shown=j.image;note.innerHTML='AI 배경 분리 완료 · <b>Replicate</b>';}
          else throw new Error(j.error||('HTTP '+r.status));
        }catch(err){
          note.innerHTML='백엔드 미연결 — 원본으로 표시 <b>(데모 폴백)</b>';
        }finally{spinner.classList.remove('show');}
      }else{
        note.innerHTML='데모 모드 — 백엔드 연결 시 <b>AI가 배경을 분리</b>합니다';
      }
      cutout.onload=()=>cutout.classList.add('show');
      cutout.src=shown;
      if(cutout.complete)cutout.classList.add('show');
      cap.textContent='다시, 늘 있던 그 자리에서.';
      animBtn.disabled=false;
      msgWrap.classList.add('show');
    }

    // 움직임: 사전 생성 영상(ar_reunion.mp4)이 있으면 재생, 없으면 컷아웃의 호흡 애니로 폴백
    animBtn.addEventListener('click',()=>{
      let ok=false;
      const onData=()=>{ok=true;cap.textContent='';video.classList.add('show');};
      video.addEventListener('loadeddata',onData,{once:true});
      const p=video.play&&video.play();
      if(p&&p.catch)p.catch(()=>{});
      setTimeout(()=>{if(!ok)cap.textContent='조금씩, 다시 움직이기 시작했어요.';},800);
    });

    // 메시지 남기기(localStorage 보존 + 무대 자막)
    document.getElementById('mgSave').addEventListener('click',()=>{
      const t=msgInput.value.trim();if(!t)return;
      try{
        const key='petpy.memorial.msgs';
        const arr=JSON.parse(localStorage.getItem(key)||'[]');
        arr.push({t,ts:Date.now()});
        localStorage.setItem(key,JSON.stringify(arr));
      }catch(e){}
      cap.textContent='“'+t+'”';
      msgInput.value='';
      note.innerHTML='메시지를 기억에 담았어요 💜';
    });
  })();

  // ============ 기능별 '기대돼요' 관심 클릭(가짜문) → Apps Script 'clicks' 탭 ============
  // 기록/기억/소통 섹션의 동일 CTA 클릭을 기능별로 적재 → 기능별 수요(이항검정)·상호 비교 근거.
  // 세션당 기능별 1회만 적재(중복 방지). 분모 n(visits)·분자 k(clicks) 모두 '세션' 단위로 일치.
  // clicks 탭 헤더: feature | sid | created_at
  (function(){
    var btns=document.querySelectorAll('.feat-cta');
    if(!btns.length) return;
    var GAS=(window.PETPY_GAS||'').replace(/\/+$/,'');
    function sid(){try{var s=sessionStorage.getItem('petpy_sid');if(!s){s='s'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);sessionStorage.setItem('petpy_sid',s);}return s;}catch(e){return '';}}
    function toast(msg){var t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(function(){t.classList.remove('show');},2600);}
    function markDone(b){b.classList.add('done');b.textContent='기대 표시 완료 ✓';}
    function seen(f){try{return !!sessionStorage.getItem('petpy_click_'+f);}catch(e){return false;}}
    btns.forEach(function(b){ if(seen(b.dataset.feature)) markDone(b); });  // 같은 세션이면 완료 상태 복원
    btns.forEach(function(b){ b.addEventListener('click',function(){
      var f=b.dataset.feature;
      if(!seen(f)){
        try{sessionStorage.setItem('petpy_click_'+f,'1');}catch(e){}
        if(GAS){ fetch(GAS,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
          body:JSON.stringify({sheet:'clicks',row:{feature:f,sid:sid(),created_at:window.PETPY_now()}})}).catch(function(){}); }
      }
      markDone(b);
      toast('기대해 주셔서 감사해요! 베타에서 가장 먼저 알려드릴게요 💛');
    }); });
  })();

  // ============ 방문 로깅 (Apps Script 'visits' 탭) ============
  // 기존 'visitors' 탭은 IMPORTRANGE/보호라 쓰기 불가 → petpy 새 'visits' 탭에 방문 기록 적재.
  // visits 탭 헤더: landingUrl | referer | utm | device | ip | created_at
  (function logVisit(){
    var GAS=(window.PETPY_GAS||'').replace(/\/+$/,'');
    if(!GAS) return;                       // 데모 모드면 로깅 안 함
    try{ if(sessionStorage.getItem('petpy_visit_logged')) return; sessionStorage.setItem('petpy_visit_logged','1'); }catch(e){}
    function utmStr(){
      try{ var p=new URLSearchParams(location.search),a=[];
        ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(function(k){var v=p.get(k); if(v)a.push(k.replace('utm_','')+'='+v);});
        return a.join('|');
      }catch(e){ return ''; }
    }
    function send(ip){
      var row={ landingUrl:location.href, referer:document.referrer||'(direct)', utm:utmStr(),
                device:navigator.userAgent, ip:ip||'', created_at:window.PETPY_now() };
      fetch(GAS,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({sheet:'visits',row:row})}).catch(function(){});
    }
    // 방문자 IP는 클라이언트에서 직접 못 얻어 ipify로 조회(실패하면 빈 값)
    fetch('https://api.ipify.org?format=json').then(function(r){return r.json();})
      .then(function(j){ send(j&&j.ip); }, function(){ send(''); });
  })();
