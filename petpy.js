  // 소통하기: 3개 시나리오 자동 재생 (산책 → 병원 찾기 → 간식 추천)
  (function(){
    const scenes=[
      {tag:'산책 메이트 찾기', msgs:[
        {who:'초코맘 · 도보 3분', side:'them', t:'오늘 저녁 7시에 같이 산책하실 분 계세요? 🐕'},
        {who:'두부아빠 · 도보 5분', side:'them', t:'저요! 두부도 친구 필요했는데 좋아요 ㅎㅎ'},
        {side:'me', t:'콩이도 갈게요! 공원 입구에서 봬요 🙌'},
        {who:'초코맘 · 도보 3분', side:'them', t:'완전 좋아요~ 이따 봬요! 💛'},
      ]},
      {tag:'동물병원 찾기', msgs:[
        {side:'me', t:'우리 동네 야간 진료 되는 병원 있을까요? 😢'},
        {who:'몽이언니 · 도보 8분', side:'them', t:'사거리 \'행복동물병원\' 9시까지 해요! 친절하세요'},
        {who:'레오파파 · 도보 4분', side:'them', t:'맞아요 거기 응급도 잘 봐주셔서 추천이요 🏥'},
        {side:'me', t:'감사해요 ㅠㅠ 지금 바로 가볼게요!'},
      ]},
      {tag:'간식 추천', msgs:[
        {who:'보리맘 · 도보 6분', side:'them', t:'소화 약한 강아지 간식 뭐 주시나요? 🤔'},
        {side:'me', t:'저흰 동결건조 닭가슴살이요! 콩이 환장해요 🍗'},
        {who:'두부아빠 · 도보 5분', side:'them', t:'오 그거 좋죠~ 치석에도 도움돼요 👍'},
        {who:'보리맘 · 도보 6분', side:'them', t:'오늘 바로 주문할게요 고마워요! 🥹'},
      ]},
    ];
    const body=document.getElementById('chatbody');
    const tag=document.getElementById('sceneTag');
    const typing=document.getElementById('typingDots');
    if(!body||!tag||!typing) return;  // 소통 목업이 게시글+댓글 피드로 바뀌어 채팅 요소 없음 → 무동작
    let started=false;

    function bubble(m){
      const d=document.createElement('div');
      d.className='bubble '+m.side;
      d.innerHTML=(m.who?`<div class="who">${m.who}</div>`:'')+m.t;
      body.appendChild(d);
      body.scrollTop=body.scrollHeight;
    }
    function clear(){body.innerHTML='';}

    async function wait(ms){return new Promise(r=>setTimeout(r,ms));}
    async function playScene(s){
      tag.style.opacity=0;
      await wait(350);
      tag.textContent=s.tag;tag.style.opacity=1;
      clear();
      for(const m of s.msgs){
        typing.classList.remove('off');
        await wait(900);
        typing.classList.add('off');
        bubble(m);
        await wait(1100);
      }
      await wait(2200); // 시나리오 끝나고 잠시 멈춤
    }
    async function loop(){
      let i=0;
      while(true){await playScene(scenes[i]);i=(i+1)%scenes.length;}
    }
    // 소통 섹션이 화면에 보일 때 시작
    const co=new IntersectionObserver((es)=>{es.forEach(e=>{
      if(e.isIntersecting && !started){started=true;loop();}
    })},{threshold:.3});
    co.observe(document.getElementById('connect'));
  })();

  // hero word swap: 기록이 ↔ 기억이 (텍스트가 사라진 순간에 교체)
  (function(){
    const el=document.getElementById('swapWord');
    const words=['기록이','기억이'];let i=0;
    // 5s cycle, 단어 안 보이는 ~50% 지점(2.5s)에서 교체
    setInterval(()=>{i=(i+1)%words.length;el.textContent=words[i];},2500);
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

  // beta — 이메일/피드백을 SheetDB 'visitors' 탭에 실제 저장(관심 수요 데이터)
  function submitBeta(){
    const e=document.getElementById('email').value.trim();
    const fb=document.getElementById('feedback').value.trim();
    const msg=document.getElementById('betaMsg');
    if(!e||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)){msg.style.color='#c47a4c';msg.textContent='올바른 이메일 주소를 입력해 주세요.';return;}
    // Apps Script 'beta' 탭에 저장 (PETPY_GAS 비어있으면 데모: 저장 생략) — fire-and-forget
    // ('visitors'는 이미 외부 방문자-분석 로깅이 쓰는 탭이라 petpy 전용 'beta' 탭 사용)
    // text/plain = 단순 요청이라 Apps Script CORS 프리플라이트 회피
    const GAS=(window.PETPY_GAS||'').replace(/\/+$/,'');
    if(GAS){
      fetch(GAS,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({sheet:'beta',row:{email:e,message:fb,created_at:new Date().toISOString()}})}).catch(()=>{});
    }
    msg.style.color='#7E8E76';
    msg.textContent=fb ? '신청 완료! 소중한 의견 감사해요. 가장 먼저 소식 전할게요 💛'
                       : '신청 완료! 가장 먼저 소식을 전해드릴게요. 💛';
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
                device:navigator.userAgent, ip:ip||'', created_at:new Date().toISOString() };
      fetch(GAS,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({sheet:'visits',row:row})}).catch(function(){});
    }
    // 방문자 IP는 클라이언트에서 직접 못 얻어 ipify로 조회(실패하면 빈 값)
    fetch('https://api.ipify.org?format=json').then(function(r){return r.json();})
      .then(function(j){ send(j&&j.ip); }, function(){ send(''); });
  })();
