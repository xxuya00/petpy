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

  // beta (fake door — capture intent only)
  function submitBeta(){
    const e=document.getElementById('email').value.trim();
    const fb=document.getElementById('feedback').value.trim();
    const msg=document.getElementById('betaMsg');
    if(!e||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)){msg.style.color='#c47a4c';msg.textContent='올바른 이메일 주소를 입력해 주세요.';return;}
    // 페이크 도어: 이메일 + 피드백 의향을 수집 (실제 저장은 Tally/구글폼 연동 시)
    msg.style.color='#7E8E76';
    msg.textContent=fb ? '신청 완료! 소중한 의견 감사해요. 가장 먼저 소식 전할게요 💛'
                       : '신청 완료! 가장 먼저 소식을 전해드릴게요. 💛';
    document.getElementById('email').value='';
    document.getElementById('feedback').value='';
    c++;document.getElementById('cnt').textContent=c.toLocaleString();
  }
  document.getElementById('email').addEventListener('keydown',e=>{if(e.key==='Enter')submitBeta()});
  document.getElementById('feedback').addEventListener('keydown',e=>{if(e.key==='Enter')submitBeta()});
