const $=s=>document.querySelector(s);
const isPhone=()=>innerWidth<1000;
const scroller=()=>isPhone()?$('#scroller'):document.scrollingElement;

/* ---------- app feel (same methods as Mimic) ---------- */
// Safari ignores user-scalable=no, so pinch zoom is stopped here instead.
for(const type of ['gesturestart','gesturechange','gestureend'])document.addEventListener(type,e=>e.preventDefault(),{passive:false});
// Haptics: Android uses navigator.vibrate. On iPhone the only haptic a page can reach is the tick iOS plays
// when a real tap flips an <input type=checkbox switch>, so a transparent label for a hidden switch is slipped
// under the finger on touch-down; the tap flips it with its own trust and passes the click on.
const IS_IOS=/iP(hone|od|ad)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const HAPTIC_TARGETS='button, a[href], .tappable';
const PULSES={light:[8],success:[10,70,14],error:[18,60,18,60,18]};
function haptic(kind='light'){if(!IS_IOS&&navigator.vibrate)try{navigator.vibrate(PULSES[kind]||PULSES.light)}catch(e){}}
if(IS_IOS){
  const toggle=Object.assign(document.createElement('input'),{type:'checkbox',id:'haptic-switch',tabIndex:-1});
  toggle.setAttribute('switch','');toggle.setAttribute('aria-hidden','true');
  toggle.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;margin:0;opacity:0;pointer-events:none';
  const pad=document.createElement('label');pad.htmlFor='haptic-switch';pad.setAttribute('aria-hidden','true');
  pad.style.cssText='position:fixed;top:0;left:0;width:48px;height:48px;z-index:2147483647';
  document.documentElement.append(toggle,pad);
  let hideTimer=0;const hide=()=>{pad.style.transform='translate(-200px,-200px)'};hide();
  document.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='touch'||e.target===pad)return;
    const el=e.target.closest?.(HAPTIC_TARGETS);
    if(!el||el.disabled||el.closest('input, textarea, select'))return;
    pad.style.transform=`translate(${e.clientX-24}px,${e.clientY-24}px)`;
    clearTimeout(hideTimer);hideTimer=setTimeout(hide,1500);
  },true);
  // pass the tap through to whatever is under the pad
  pad.addEventListener('click',e=>{hide();const el=document.elementFromPoint(e.clientX,e.clientY);if(el&&el!==pad)el.click()});
}
const KEY='maxout-clone-v1';
const today=()=>new Date().toISOString().slice(0,10);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- state ----------
   Guests trade Paper saved in this browser. Signed-in users trade Paper held on the server (api/account). */
const S=Object.assign({cur:'paper',paper:1000,refilled:today(),positions:[],sel:'NVDA',side:'short',amount:10,mult:100,filter:'all',q:'',hidden:false,tf:'1d',ct:'candle'},
  (()=>{try{return JSON.parse(localStorage.getItem(KEY))||{}}catch(e){return {}}})());
if(S.refilled!==today()){if(S.paper<1000)S.paper=1000;S.refilled=today()}
S.cur='paper';
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({paper:S.paper,refilled:S.refilled,positions:S.positions,history:S.history||[],sel:S.sel,side:S.side,amount:S.amount,mult:S.mult,hidden:S.hidden,tf:S.tf,ct:S.ct,ribbon:!!S.ribbon}))}catch(e){}};

/* ---------- accounts: username + password, everything saved in this browser ----------
   Passwords are never stored; only a PBKDF2-SHA256 hash with a random salt. */
const UKEY='maxout-users',SKEY='maxout-session';
const USERS=(()=>{try{return JSON.parse(localStorage.getItem(UKEY))||{}}catch(e){return {}}})();
const saveUsers=()=>{try{localStorage.setItem(UKEY,JSON.stringify(USERS))}catch(e){}};
let ACC=null; // the signed-in user's record: {user:{name}, salt, hash, paper, refilled, positions, history, created}
const signedIn=()=>!!ACC;
const acct=()=>ACC||S; // the account trades go to (guest = S)
const paperBal=()=>acct().paper;
const positions=()=>acct().positions;
const persist=()=>signedIn()?saveUsers():save();
function setSession(name){try{name?localStorage.setItem(SKEY,name):localStorage.removeItem(SKEY)}catch(e){}}
function refill(a){if(a.refilled!==today()){if(a.paper<1000)a.paper=1000;a.refilled=today()}}
async function hashPw(pw,saltB64){
  const salt=saltB64?Uint8Array.from(atob(saltB64),c=>c.charCodeAt(0)):crypto.getRandomValues(new Uint8Array(16));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:150000,hash:'SHA-256'},key,256);
  const b64=u=>btoa(String.fromCharCode(...new Uint8Array(u)));
  return {salt:b64(salt),hash:b64(bits)};
}
async function signUp(name,pw){
  const id=name.toLowerCase();
  if(!/^[a-z0-9_]{3,20}$/.test(id)) throw new Error('Username: 3–20 letters, numbers or _');
  if(pw.length<6) throw new Error('Password: at least 6 characters');
  if(USERS[id]) throw new Error('That username is taken on this browser');
  const {salt,hash}=await hashPw(pw);
  USERS[id]={user:{name},salt,hash,paper:1000,refilled:today(),positions:[],history:[],created:Date.now()};
  saveUsers();return id;
}
async function logIn(name,pw){
  const id=name.toLowerCase(),u=USERS[id];
  if(!u) throw new Error('No account with that username on this browser');
  const {hash}=await hashPw(pw,u.salt);
  if(hash!==u.hash) throw new Error('Wrong password');
  return id;
}
function startSession(id){ACC=USERS[id];refill(ACC);ACC.history??=[];saveUsers();setSession(id);renderAll()}

const fmt2=v=>v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
function money(v,{icon=true,size='sm'}={}){
  const [i,c]=fmt2(Math.max(0,v)).split('.');
  const shown=S.hidden?'••••':`${i}<span class="cents">.${c}</span>`;
  return `<span class="money">${icon?`<span class="cur-icon ${size} ${S.cur}"></span>`:''}${shown}</span>`;
}
const balance=()=>S.cur==='paper'?paperBal():0;
const pnl=p=>{const m=BY_SYM[p.sym];return Math.max(-p.amount,p.amount*p.mult*(m.price/p.entry-1)*(p.side==='long'?1:-1))};
const portfolio=()=>balance()+(S.cur==='paper'?positions().reduce((a,p)=>a+p.amount+pnl(p),0):0);
const canTrade=m=>m.type==='crypto'||stocksOpen();

function toast(msg){const t=$('#toast');t.innerHTML=msg;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2400)}

/* ---------- header + portfolio ---------- */
function renderHeader(){
  document.querySelectorAll('#curSwitch button').forEach(b=>b.classList.toggle('on',b.dataset.cur===S.cur));
  $('#availTop').innerHTML=money(balance());
  const [i,c]=fmt2(portfolio()).split('.');
  $('#pfTotal').innerHTML=S.hidden?'••••••':`${i}<span class="cents">.${c}</span>`;
  $('#pfIcon').className='cur-icon big '+S.cur;
  const open=S.cur==='paper'?positions():[],opnl=open.reduce((a,p)=>a+pnl(p),0);
  $('#pfPnl').innerHTML=open.length&&!S.hidden?`<span class="pnl-pill ${opnl>=0?'up':'down'}">${opnl>=0?'▲ +':'▼ −'}${fmt2(Math.abs(opnl))} open P&amp;L</span>`:'';
  $('#pfSub').innerHTML=S.cur==='cash'?'Get Cash to trade for real stakes'
    :signedIn()?'Practice with Paper. It refills to 1,000 every day.'
    :'Practice with Paper. It refills to 1,000 every day. <button class="link" data-signin>Sign in</button> to keep it.';
  const u=ACC?.user;
  $('#who').innerHTML=u
    ?`<button class="avatar" id="avatar" title="${esc(u.name)}">${esc(u.name[0].toUpperCase())}</button>`
    :`<button class="btn-signin" data-signin>Sign in</button>`;
}

/* A position as a card: live P&L, a liquidation meter, and a call to action that changes with the trade. */
function posCard(p){
  const m=BY_SYM[p.sym],v=pnl(p),pct=v/p.amount*100,win=v>0;
  const liq=p.entry*(1+(p.side==='long'?-1:1)/p.mult);
  const risk=Math.min(1,Math.max(0,-v/p.amount)); // 0 = safe, 1 = liquidated
  const state=win?'win':risk>.7?'danger':'lose';
  const cta=win
    ?`<button class="btn-tp" data-close-pos="${p.id}"><span>Take profit</span><b>+${fmt2(v)}</b></button>`
    :`<button class="btn-close" data-close-pos="${p.id}">${risk>.7?'Cut loss':'Close'}</button>`;
  return `<div class="pcard ${state}">
    <a class="pc-id" href="/m/${p.sym}" data-nav="/m/${p.sym}">${iconHTML(p.sym,36)}<div class="stack">
      <div class="sym">${p.sym}<span class="tag ${p.side}">${p.side==='long'?'LONG':'SHORT'} ${p.mult}×</span></div>
      <div class="pos-meta">${fmt2(p.amount)} in · entry ${fmtPrice(p.entry)}</div></div></a>
    <div class="pc-pnl">
      <div class="pc-big ${v>=0?'up':'down'}">${v>=0?'+':'−'}${fmt2(Math.abs(v))}<small>${v>=0?'+':'−'}${Math.abs(pct).toFixed(1)}%</small></div>
      <div class="pc-meter" title="How close this trade is to liquidation"><i style="width:${(risk*100).toFixed(1)}%"></i></div>
      <div class="pc-sub">${state==='win'?'In profit. Lock it in before it turns.':state==='danger'?`<b class="down">Near liquidation</b> at ${fmtPrice(liq)}`:`Liquidates at ${fmtPrice(liq)}`}</div>
    </div>
    ${cta}
  </div>`;
}
function renderPositions(){
  const el=$('#positions');
  const list=S.cur==='paper'?positions():[];
  if(!list.length){
    el.innerHTML=`<div class="empty">No open positions. ${S.cur==='paper'?'<b>Pick a market below.</b>':'<b>Top up, then pick a market.</b>'}</div>`;return;
  }
  el.innerHTML=`<div class="pcards">${list.map(posCard).join('')}</div>`;
}
function renderTickerPositions(){
  const el=$('#tkPos');if(!el)return;
  const list=S.cur==='paper'?positions().filter(p=>p.sym===S.sel):[];
  el.hidden=!list.length;
  el.innerHTML=list.length?`<h2>Your ${S.sel} position${list.length>1?'s':''}</h2><div class="pcards">${list.map(posCard).join('')}</div>`:'';
}

function renderHistory(){
  const h=(acct().history||[]).slice(0,20);
  $('#historyBlock').hidden=!h.length;
  if(!h.length) return;
  $('#history').innerHTML=`<div class="card">${h.map(p=>`<div class="pos">
    <div class="mrow-id">${iconHTML(p.sym,30)}<div class="stack"><div class="sym">${p.sym}<span class="tag ${p.side}">${p.side==='long'?'LONG':'SHORT'} ${p.mult}×</span>${p.status==='liquidated'?'<span class="tag liq">LIQUIDATED</span>':''}</div>
    <div class="pos-meta">${fmtPrice(p.entry)} → ${fmtPrice(p.exit)} · ${new Date(+p.closed).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</div></div></div>
    <div class="pos-pnl ${p.pnl>=0?'up':'down'}">${p.pnl>=0?'+':'−'}${fmt2(Math.abs(p.pnl))}<small>on ${fmt2(p.amount)}</small></div><span></span></div>`).join('')}</div>`;
}

/* ---------- markets table ---------- */
function visibleMarkets(q=S.q){
  let list=MARKETS.filter(m=>S.filter==='all'||S.filter==='movers'||m.type===S.filter);
  if(q){q=q.toLowerCase();list=MARKETS.filter(m=>m.sym.toLowerCase().includes(q)||m.name.toLowerCase().includes(q))}
  if(S.filter==='movers'&&!q)list=[...list].sort((a,b)=>Math.abs(b.chg)-Math.abs(a.chg));
  return list;
}
const lastPrice={};
function renderRows(){
  const list=visibleMarkets();
  $('#rows').innerHTML=list.map(m=>{
    const dir=m.chg>=0?'up':'down',col=m.chg>=0?'var(--green)':'var(--red)';
    const prev=lastPrice[m.sym];lastPrice[m.sym]=m.price;
    const flash=prev&&prev!==m.price?(m.price>prev?'flash-up':'flash-down'):'';
    return `<a class="mrow${m.sym===S.sel?' selected':''}" href="/m/${m.sym}" data-sym="${m.sym}">
      <span class="mrow-id">${iconHTML(m.sym)}<span class="stack"><span class="sym">${m.sym}</span><span class="name">${m.name}</span></span></span>
      <span class="mrow-spark"><svg width="80" height="28"><path d="${sparkPath(m.series.slice(-120),80,28)}" fill="none" stroke="${col}" stroke-width="1.2"/></svg></span>
      <span class="mrow-price ${flash}">${fmtPrice(m.price)}</span>
      <span class="mrow-change ${dir}">${fmtChg(m.chg)}</span></a>`}).join('');
  $('#feedText').textContent=`Live from Hyperliquid · Stocks market ${stocksOpen()?'open':'closed'}`;
}

function renderSearchPop(){
  const pop=$('#searchPop');
  if(!S.q){pop.classList.remove('open');return}
  const list=visibleMarkets(S.q).slice(0,6);
  pop.innerHTML=list.length?list.map((m,i)=>`<a class="sp-row${i===0?' hi':''}" href="/m/${m.sym}" data-nav="/m/${m.sym}">${iconHTML(m.sym,28)}<span class="stack"><span class="sym">${m.sym}</span><span class="name">${m.name}</span></span><span class="mono">${fmtPrice(m.price)}</span></a>`).join('')
    :`<div class="sp-empty">No markets match “${esc(S.q)}”</div>`;
  pop.classList.add('open');
}

/* ---------- trade panel ---------- */
const MULTS=[10,50,100,500,1000];
const multToSlider=m=>Math.log10(m)/3*1000;
// risk colour runs green -> yellow -> orange -> red -> magenta along the log scale
const multLevel=m=>{const t=Math.log10(Math.max(1,m))/3;const st=[[0,[47,224,138]],[.33,[250,204,21]],[.6,[255,138,61]],[.8,[255,84,112]],[1,[232,72,255]]];let i=0;while(i<st.length-2&&t>st[i+1][0])i++;const [t0,a]=st[i],[t1,b]=st[i+1],f=Math.min(1,Math.max(0,(t-t0)/(t1-t0)));const c=a.map((x,k)=>Math.round(x+(b[k]-x)*f));return {c:`rgb(${c})`,w:m<=10?'Chill':m<=50?'Bold':m<=200?'Spicy':m<1000?'Degen':'Max it out'}};
const sliderToMult=v=>{const m=Math.round(Math.pow(10,v/1000*3));return m<10?m:m<100?Math.round(m/5)*5:m<1000?Math.round(m/10)*10:1000};

function renderTrade(){
  const m=BY_SYM[S.sel],tick=route().view==='ticker';
  $('#tradeTitle').hidden=!tick;
  $('#tradeTitle').innerHTML=`<span>Trade ${m.sym}</span><span class="tt-brand">maxout.so</span>`;
  $('#trade').innerHTML=`
    ${tick?'':`<a class="trade-head" href="/m/${m.sym}" data-nav="/m/${m.sym}" title="Open the full chart">${iconHTML(m.sym,40)}<div class="stack"><span class="sym">${m.sym}</span><span class="name">${m.name}</span></div>
      <span class="open-chart">Chart <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></span></a>
    <div class="trade-price"><span class="p" id="tPrice"></span><span class="c" id="tChg"></span></div>
    <div class="area-chart" id="tChart"></div>`}
    <div class="seg"><button class="long" data-side="long">Long</button><button class="short" data-side="short">Short</button></div>
    <div class="field">
      <div class="field-head">Amount<span class="avail">Avail. <span id="tAvail"></span></span></div>
      <label class="amount-input"><span class="cur-icon ${S.cur}"></span><input id="tAmount" inputmode="decimal" value="${S.amount}"></label>
      <div class="chips" id="amtChips">${[5,10,25,50].map(v=>`<button class="chip" data-amt="${v}">${v}</button>`).join('')}<button class="chip" data-amt="max">Max</button></div>
    </div>
    <div class="field">
      <div class="field-head">Multiplier<span class="mult" id="tMult"></span></div>
      <input type="range" class="slider" id="tSlider" min="0" max="1000" step="1">
      <div class="chips" id="multChips">${MULTS.map(v=>`<button class="chip" data-mult="${v}" style="--lv:${multLevel(v).c}">${v}×</button>`).join('')}</div>
    </div>
    <div class="summary">
      <div>Exposure<b id="sExp"></b></div>
      <div>Liquidation<b id="sLiq"></b></div>
      <div>Max loss<b id="sLoss"></b></div>
    </div>
    <div class="move" id="tMove"></div>
    <button class="btn-primary btn-block" id="tGo"></button>`;
  $('#tSlider').value=multToSlider(S.mult);
  updateTrade();
}

function chartSVG(m){
  const s=m.series.slice(-160),w=340,h=130,up=m.chg>=0,col=up?'#2fe08a':'#ff5470';
  const min=Math.min(...s),max=Math.max(...s),span=max-min||1,pad=10;
  const pts=s.map((v,i)=>[i/(s.length-1)*w,pad+(1-(v-min)/span)*(h-pad*2)]);
  const d=pts.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const last=pts.at(-1);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    <path d="${d}L${w},${h}L0,${h}Z" fill="url(#ag)"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>
    <span class="live-dot" style="left:${last[0]/w*100}%;top:${last[1]/h*100}%;background:${col}"></span>`;
}

function updateTrade(){
  const m=BY_SYM[S.sel];if(!$('#tGo'))return;
  if($('#tPrice')){
    $('#tPrice').textContent=fmtPrice(m.price);
    $('#tChg').className='c '+(m.chg>=0?'up':'down');$('#tChg').textContent=fmtChg(m.chg)+' today';
    $('#tChart').innerHTML=chartSVG(m);
  }
  const amt=S.amount||0,liq=m.price*(1+(S.side==='long'?-1:1)/S.mult);
  document.querySelectorAll('.seg button').forEach(b=>b.classList.toggle('on',b.dataset.side===S.side));
  $('#tAvail').innerHTML=money(balance());
  document.querySelectorAll('#amtChips .chip').forEach(b=>b.classList.toggle('on',+b.dataset.amt===S.amount));
  document.querySelectorAll('#multChips .chip').forEach(b=>b.classList.toggle('on',+b.dataset.mult===S.mult));
  const lv=multLevel(S.mult);
  $('#tMult').innerHTML=`<span class="risk-word" style="color:${lv.c}">${lv.w}</span><span class="mult-num" style="color:${lv.c}">${S.mult}×</span>`;
  $('#tSlider').style.setProperty('--p',(multToSlider(S.mult)/10)+'%');
  $('#tSlider').style.setProperty('--thumb',lv.c);
  $('#tMove').innerHTML=amt?`Every 1% your way <b class="up">+${fmt2(amt*S.mult/100)}</b><span>·</span>1% against <b class="down">−${fmt2(Math.min(amt,amt*S.mult/100))}</b>`:'';
  $('#sExp').innerHTML=money(amt*S.mult);
  $('#sLiq').textContent=fmtPrice(liq);
  $('#sLoss').innerHTML=money(amt);
  const go=$('#tGo');
  go.className='btn-primary btn-block';
  if(S.cur==='cash'){go.disabled=false;go.textContent='Get Cash to trade'}
  else if(!canTrade(m)){go.disabled=true;go.textContent='Closed · stocks trade 4am–8pm ET'}
  else if(!amt||amt>paperBal()){go.disabled=true;go.textContent=amt?'Not enough Paper':'Enter an amount'}
  else{go.disabled=false;go.classList.add(S.side);go.textContent=`${S.side==='long'?'Long':'Short'} ${m.sym} · ${S.mult}×`}
}

/* ---------- ticker page: candlestick chart (TradingView Lightweight Charts) ---------- */
let CH=null; // {chart, main, vol, sym, tf, ct, bars}
function renderTicker(){
  const m=BY_SYM[S.sel];
  document.title=`${m.sym} ${fmtPrice(m.price)} · maxout.so`;
  $('#tkId').innerHTML=`${iconHTML(m.sym,48)}<div class="stack"><span class="sym">${m.sym}</span><span class="name">${m.name}</span></div>`;
  $('#tf').innerHTML=Object.entries(TF).map(([k,t])=>`<button data-tf="${k}" class="${k===S.tf?'on':''}">${k==='live'?'<i></i>':''}${t.label}</button>`).join('');
  document.querySelectorAll('#ctype button').forEach(b=>b.classList.toggle('on',b.dataset.ct===S.ct));
  $('#ribbonBtn').classList.toggle('on',!!S.ribbon);
  renderTickerPositions();
  $('#tkAboutH').textContent='About '+m.name;
  $('#tkAbout').textContent=ABOUT[m.sym]||'';
  updateTickerPrice();
  buildChart();
}
function updateTickerPrice(){
  const m=BY_SYM[S.sel];if(!m)return;
  const [i,c]=fmtPrice(m.price).split('.');
  $('#tkPrice').innerHTML=`${i}<span class="cents">${c?'.'+c:''}</span>`;
  const base=CH?.bars?.[0]?.open, ref=S.tf==='1d'||!base?m.open||m.price/(1+m.chg/100):base;
  const d=m.price-ref,p=d/ref*100;
  $('#tkChg').innerHTML=`<span class="${d>=0?'up':'down'}">${d>=0?'+':'−'}${fmtPrice(Math.abs(d))} &nbsp;${d>=0?'+':'−'}${Math.abs(p).toFixed(2)}%</span> · ${S.tf==='live'?'Live':TF[S.tf].label==='1D'?'Today':'Past '+({'1w':'week','1m':'month','3m':'3 months'}[S.tf])}`;
}
function precisionFor(p){return p>=1000?2:p>=1?2:p>=0.1?4:5}
async function buildChart(){
  const m=BY_SYM[S.sel],el=$('#tkChart');
  if(!window.LightweightCharts){$('#tkLoading').textContent='Chart library failed to load';return}
  if(CH){CH.chart.remove();CH=null}
  $('#tkLoading').hidden=false;$('#tkLoading').textContent='Loading chart…';
  const chart=LightweightCharts.createChart(el,{
    autoSize:true,
    layout:{background:{type:'solid',color:'transparent'},textColor:'#6b6b74',fontFamily:'Geist, sans-serif',fontSize:12},
    grid:{vertLines:{visible:false},horzLines:{color:'rgba(255,255,255,.04)'}},
    rightPriceScale:{borderVisible:false,scaleMargins:{top:.12,bottom:.18}},
    timeScale:{borderVisible:false,timeVisible:S.tf!=='3m',secondsVisible:false,rightOffset:4},
    crosshair:{mode:0,vertLine:{color:'rgba(255,255,255,.25)',labelBackgroundColor:'#1c1c1f'},horzLine:{color:'rgba(255,255,255,.25)',labelBackgroundColor:'#1c1c1f'}},
    watermark:{visible:true,text:'maxout.so',color:'rgba(255,255,255,.06)',fontSize:40,fontFamily:'Geist, sans-serif',fontStyle:'600',horzAlign:'right',vertAlign:'top'},
    handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true},
  });
  const prec=precisionFor(m.price),pf={type:'price',precision:prec,minMove:1/10**prec};
  const main=S.ct==='candle'
    ?chart.addCandlestickSeries({upColor:'#2fe08a',downColor:'#ff5470',borderVisible:false,wickUpColor:'#2fe08a',wickDownColor:'#ff5470',priceFormat:pf})
    :chart.addAreaSeries({lineColor:m.chg>=0?'#2fe08a':'#ff5470',topColor:m.chg>=0?'rgba(47,224,138,.25)':'rgba(255,84,112,.25)',bottomColor:'rgba(0,0,0,0)',lineWidth:2,priceFormat:pf});
  const vol=chart.addHistogramSeries({priceScaleId:'vol',priceFormat:{type:'volume'},lastValueVisible:false,priceLineVisible:false});
  chart.priceScale('vol').applyOptions({scaleMargins:{top:.85,bottom:0}});
  CH={chart,main,vol,sym:m.sym,tf:S.tf,ct:S.ct,bars:[],lines:[]};
  const mine=CH;
  try{
    const bars=await candles(m.sym,S.tf);
    if(CH!==mine)return;
    mine.bars=bars;
    setSeries();
    if(S.ribbon)addRibbon();
    syncPriceLines();
    chart.timeScale().fitContent();
    $('#tkLoading').hidden=true;
    updateTickerPrice();
  }catch(e){if(CH===mine)$('#tkLoading').textContent='Could not load candles. Try again.'}
}
function setSeries(){
  const {main,vol,bars,ct}=CH;
  main.setData(ct==='candle'?bars.map(({time,open,high,low,close})=>({time,open,high,low,close})):bars.map(b=>({time:b.time,value:b.close})));
  vol.setData(bars.map(b=>({time:b.time,value:b.value,color:b.close>=b.open?'rgba(47,224,138,.28)':'rgba(255,84,112,.28)'})));
  const hi=Math.max(...bars.map(b=>b.high)),lo=Math.min(...bars.map(b=>b.low)),v=bars.reduce((a,b)=>a+b.value*b.close,0);
  $('#tkStats').innerHTML=bars.length?`<span>High <b class="mono">${fmtPrice(hi)}</b></span><span>Low <b class="mono">${fmtPrice(lo)}</b></span><span>Volume <b class="mono">$${v>=1e9?(v/1e9).toFixed(2)+'B':v>=1e6?(v/1e6).toFixed(2)+'M':Math.round(v/1e3)+'K'}</b></span>`:'';
}
// Keep the last candle moving with the live price; open a new one when its interval rolls over.
function tickChart(){
  if(!CH||!CH.bars.length||CH.sym!==S.sel)return;
  const m=BY_SYM[S.sel],step=TF[CH.tf].step/1000,now=Math.floor(Date.now()/1000)+TZ_SHIFT;
  let last=CH.bars.at(-1);
  if(now>=last.time+step&&CH.tf!=='3m'){last={time:last.time+step*Math.floor((now-last.time)/step),open:last.close,high:last.close,low:last.close,close:last.close,value:0};CH.bars.push(last)}
  last.close=m.price;last.high=Math.max(last.high,m.price);last.low=Math.min(last.low,m.price);
  CH.main.update(CH.ct==='candle'?{time:last.time,open:last.open,high:last.high,low:last.low,close:last.close}:{time:last.time,value:last.close});
  tickRibbon();
}

/* EMA ribbon, exactly as VisibleTrader's indicators.js draws it: EMAs 8 to 55, hot pink to blue, 1.5px. */
const RIBBON_N=[8,11,14,18,22,27,33,40,47,55];
const RIBBON_C=['#ff2e5b','#f8336b','#ec387c','#df3e8e','#cf44a1','#bd4ab4','#a851c7','#9157d9','#795deb','#6262ff'];
function emaArr(a,n){const o=new Array(a.length).fill(null),k=2/(n+1);let e=null,c=0;for(let i=0;i<a.length;i++){if(a[i]==null)continue;e=e==null?a[i]:a[i]*k+e*(1-k);if(++c>=n)o[i]=e}return o}
function ribbonData(i){const C=CH.bars.map(b=>b.close),e=emaArr(C,RIBBON_N[i]);return CH.bars.map((b,j)=>e[j]==null?{time:b.time}:{time:b.time,value:e[j]})}
function addRibbon(){
  if(!CH||CH.ribbon)return;
  CH.ribbon=RIBBON_N.map((n,i)=>CH.chart.addLineSeries({color:RIBBON_C[i],lineWidth:1.5,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false}));
  if(CH.bars.length)CH.ribbon.forEach((s,i)=>s.setData(ribbonData(i)));
}
function removeRibbon(){if(CH?.ribbon){CH.ribbon.forEach(s=>CH.chart.removeSeries(s));CH.ribbon=null}}
function tickRibbon(){if(!CH?.ribbon||!CH.bars.length)return;const C=CH.bars.map(b=>b.close),t=CH.bars.at(-1).time;CH.ribbon.forEach((s,i)=>{const v=emaArr(C,RIBBON_N[i]).at(-1);if(v!=null)s.update({time:t,value:v})})}
/* Entry and liquidation lines for your open positions on this market */
function syncPriceLines(){
  if(!CH)return;
  (CH.lines||[]).forEach(l=>CH.main.removePriceLine(l));
  CH.lines=[];
  if(S.cur!=='paper')return;
  for(const p of positions().filter(p=>p.sym===CH.sym)){
    const liq=p.entry*(1+(p.side==='long'?-1:1)/p.mult);
    CH.lines.push(CH.main.createPriceLine({price:p.entry,color:'rgba(244,244,245,.55)',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:`${p.side==='long'?'Long':'Short'} ${p.mult}×`}));
    CH.lines.push(CH.main.createPriceLine({price:liq,color:'#ff5470',lineWidth:1,lineStyle:1,axisLabelVisible:true,title:'Liq'}));
  }
}

/* ---------- routing: /app = dashboard, /m/SYM = ticker page ---------- */
function route(){
  const m=/^\/m\/([A-Za-z]+)/.exec(location.pathname);
  return m&&BY_SYM[m[1].toUpperCase()]?{view:'ticker',sym:m[1].toUpperCase()}:{view:'dash'};
}
function go(path){if(path!==location.pathname)history.pushState(null,'',path);closeTrade();applyRoute();scroller().scrollTo({top:0})}
function applyRoute(){
  const r=route();
  $('#dashView').hidden=r.view!=='dash';
  $('#tickerView').hidden=r.view!=='ticker';
  document.body.classList.toggle('ticker-mode',r.view==='ticker');
  $('#dock').hidden=r.view!=='ticker';
  document.querySelectorAll('#tabbar a').forEach(a=>a.classList.toggle('on',a.dataset.tab===(r.view==='ticker'?'markets':'home')));
  if(r.view==='ticker'){S.sel=r.sym;save();renderTrade();renderTicker();updateDock()}
  else{document.title='maxout.so';if(CH){CH.chart.remove();CH=null}renderAll()}
}
addEventListener('popstate',applyRoute);

/* ---------- phones: the trade panel opens as a bottom sheet from the dock ---------- */
function openTrade(side){if(side){S.side=side;save()}updateTrade();document.body.classList.add('trade-open');haptic()}
function closeTrade(){document.body.classList.remove('trade-open')}
function updateDock(){const m=BY_SYM[S.sel];if(!m||$('#dock').hidden)return;$('#dockSym').textContent=m.sym;$('#dockPrice').textContent=fmtPrice(m.price);$('#dockPrice').className=m.chg>=0?'up':'down'}
function searchSheet(){
  openSheet(`<h3>Search</h3><input class="msearch" id="msearch" placeholder="Stocks and crypto" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="msr" id="msr"></div>`);
  renderMobileSearch('');setTimeout(()=>$('#msearch')?.focus(),60);
}
function renderMobileSearch(q){
  const list=q?visibleMarkets(q):MARKETS;
  $('#msr').innerHTML=list.slice(0,30).map(m=>`<a class="sp-row" href="/m/${m.sym}" data-nav="/m/${m.sym}">${iconHTML(m.sym,34)}<span class="stack"><span class="sym">${m.sym}</span><span class="name">${m.name}</span></span><span class="sp-r"><span class="mono">${fmtPrice(m.price)}</span><span class="mono ${m.chg>=0?'up':'down'}">${fmtChg(m.chg)}</span></span></a>`).join('')||`<div class="sp-empty">No markets match “${esc(q)}”</div>`;
}

/* ---------- sheets ---------- */
function openSheet(html){$('#sheetBody').innerHTML=html;$('#sheet').classList.add('open')}
function closeSheet(){$('#sheet').classList.remove('open')}
function loginSheet(mode='login'){
  const up=mode==='signup';
  openSheet(`<h3>${up?'Create account':'Log in'}</h3><p>${up?'Get 1,000 Paper to start. It refills every day.':'Welcome back to Maxout.'}</p>
  <form class="authform" id="authForm" data-mode="${mode}" autocomplete="on">
    <input id="authUser" name="username" placeholder="Username" autocomplete="username" autocapitalize="off" spellcheck="false" required>
    <input id="authPw" name="password" type="password" placeholder="Password" autocomplete="${up?'new-password':'current-password'}" required>
    <div class="autherr" id="authErr"></div>
    <button class="btn-primary btn-block" id="authGo">${up?'Create account':'Log in'}</button>
  </form>
  <div class="foot">${up?'Have an account? <button class="link" data-auth="login">Log in</button>':'Don’t have an account? <button class="link" data-auth="signup">Sign up</button>'}</div>
  <div class="foot small">Accounts are saved in this browser only.</div>`);
  setTimeout(()=>$('#authUser')?.focus(),50);
}
async function submitAuth(form){
  const name=$('#authUser').value.trim(),pw=$('#authPw').value,err=$('#authErr'),btn=$('#authGo');
  err.textContent='';btn.disabled=true;
  try{
    const id=form.dataset.mode==='signup'?await signUp(name,pw):await logIn(name,pw);
    startSession(id);closeSheet();
    toast(form.dataset.mode==='signup'?`Welcome, ${esc(USERS[id].user.name)}. You have 1,000 Paper.`:`Logged in as ${esc(USERS[id].user.name)}`);
  }catch(e){err.textContent=e.message;btn.disabled=false}
}
function accountSheet(){
  const u=ACC.user,h=ACC.history||[],wins=h.filter(p=>p.pnl>0).length,net=h.reduce((a,p)=>a+p.pnl,0);
  openSheet(`<div class="acct-pic">${esc(u.name[0].toUpperCase())}</div>
  <h3>${esc(u.name)}</h3><p>Member since ${new Date(ACC.created).toLocaleDateString([], {month:'short',day:'numeric',year:'numeric'})}</p>
  <div class="acct-stats"><div><span>Paper</span><b>${money(ACC.paper)}</b></div><div><span>Open</span><b>${ACC.positions.length}</b></div><div><span>Trades</span><b>${h.length}${h.length?` · ${wins} won`:''}</b></div><div><span>Realized P&amp;L</span><b class="${net>=0?'up':'down'}">${net>=0?'+':'−'}${fmt2(Math.abs(net))}</b></div></div>
  <div class="opts"><button class="btn-oauth" data-signout>Log out</button></div>`);
}
function topUpSheet(){
  openSheet(`<h3>Top up</h3><p>${S.cur==='paper'?'Add Paper to practice with. It’s free.':'Apple Pay, Google Pay, card or crypto.'}</p>
  <div class="topup-grid">${[100,500,1000,2500,5000,10000].map(v=>`<button data-topup="${v}">${v.toLocaleString()}</button>`).join('')}</div>`);
}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const tab=e.target.closest('#tabbar a');
  if(tab){e.preventDefault();closeSheet();closeTrade();const k=tab.dataset.tab;
    if(k==='home'){go('/app')}
    else if(k==='markets'){if(route().view!=='dash')go('/app');requestAnimationFrame(()=>$('#marketsBlock')?.scrollIntoView({behavior:'smooth',block:'start'}))}
    else if(k==='search'){searchSheet()}
    else if(k==='account'){signedIn()?accountSheet():loginSheet()}
    return}
  if(e.target.closest('#asideScrim')){closeTrade();return}
  const dk=e.target.closest('[data-dock]');if(dk){openTrade(dk.dataset.dock);return}
  const nav=e.target.closest('[data-nav],a.mrow');
  if(nav&&!e.metaKey&&!e.ctrlKey&&e.button===0){e.preventDefault();closeSheet();S.q='';$('#search').value='';renderSearchPop();go(nav.dataset.nav||nav.getAttribute('href'));return}
  const t=e.target.closest('button,[data-close]');if(!t)return;
  if(t.dataset.close!==undefined){closeSheet();return}
  if(t.dataset.signin!==undefined){loginSheet();return}
  if(t.dataset.signout!==undefined){ACC=null;setSession(null);closeSheet();renderAll();toast('Logged out');return}
  if(t.dataset.auth){loginSheet(t.dataset.auth);return}
  if(t.dataset.cur){
    if(t.dataset.cur==='cash'){S.cur='cash';renderAll();if(!signedIn())loginSheet();else toast('Cash trading is coming soon. Practice with Paper for now.');return}
    S.cur='paper';renderAll();return}
  if(t.dataset.f){S.filter=t.dataset.f;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b===t));renderRows();return}
  if(t.dataset.tf){S.tf=t.dataset.tf;save();renderTicker();return}
  if(t.dataset.ct){S.ct=t.dataset.ct;save();document.querySelectorAll('#ctype button').forEach(b=>b.classList.toggle('on',b===t));buildChart();return}
  if(t.id==='ribbonBtn'){S.ribbon=!S.ribbon;save();t.classList.toggle('on',S.ribbon);S.ribbon?addRibbon():removeRibbon();return}
  if(t.dataset.side){S.side=t.dataset.side;save();updateTrade();return}
  if(t.dataset.amt){S.amount=t.dataset.amt==='max'?Math.floor(balance()*100)/100:+t.dataset.amt;$('#tAmount').value=S.amount;save();updateTrade();return}
  if(t.dataset.mult){S.mult=+t.dataset.mult;$('#tSlider').value=multToSlider(S.mult);save();updateTrade();return}
  if(t.dataset.closePos){closePosition(t.dataset.closePos);return}
  if(t.dataset.topup){topUp(+t.dataset.topup);return}
  if(t.id==='topUp'){S.cur==='cash'?loginSheet():topUpSheet();return}
  if(t.id==='eye'){S.hidden=!S.hidden;save();renderAll();return}
  if(t.id==='avatar'){accountSheet();return}
  if(t.id==='share'){navigator.clipboard?.writeText(location.href).then(()=>toast('Link copied'),()=>toast(location.href));return}
  if(t.id==='tGo'){placeTrade();return}
});
document.addEventListener('submit',e=>{
  if(e.target.id==='authForm'){e.preventDefault();submitAuth(e.target)}
});
document.addEventListener('input',e=>{
  if(e.target.id==='tAmount'){const v=parseFloat(e.target.value.replace(/[^0-9.]/g,''));S.amount=isNaN(v)?0:v;save();updateTrade()}
  if(e.target.id==='tSlider'){S.mult=sliderToMult(+e.target.value);save();updateTrade()}
  if(e.target.id==='msearch'){renderMobileSearch(e.target.value.trim())}
  if(e.target.id==='search'){S.q=e.target.value.trim();renderSearchPop();if(route().view==='dash')renderRows()}
});
document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#search').focus()}
  if(e.key==='Enter'&&e.target.id==='msearch'){const m=visibleMarkets(e.target.value.trim())[0];if(m){closeSheet();go('/m/'+m.sym)}}
  if(e.key==='Escape'){closeSheet();closeTrade();S.q='';$('#search').value='';renderSearchPop();$('#search').blur();if(route().view==='dash')renderRows()}
  if(e.key==='Enter'&&e.target.id==='search'){const m=visibleMarkets(S.q)[0];if(m){S.q='';e.target.value='';renderSearchPop();e.target.blur();go('/m/'+m.sym)}}
});
document.addEventListener('focusout',e=>{if(e.target.id==='search')setTimeout(()=>$('#searchPop').classList.remove('open'),150)});
document.addEventListener('focusin',e=>{if(e.target.id==='search'&&S.q)renderSearchPop()});

/* ---------- trading (guest account or the signed-in user's, both in this browser) ---------- */
function placeTrade(){
  if(S.cur==='cash'){if(!signedIn())loginSheet();else toast('Cash trading is coming soon. Practice with Paper for now.');return}
  const m=BY_SYM[S.sel],a=acct();
  if(!canTrade(m)||!(S.amount>0)||S.amount>a.paper)return;
  a.paper-=S.amount;
  a.positions.unshift({id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),sym:m.sym,side:S.side,amount:S.amount,mult:S.mult,entry:m.price,opened:Date.now()});
  persist();closeTrade();renderAll();haptic('success');
  toast(`${S.side==='long'?'Longed':'Shorted'} ${m.sym} at ${fmtPrice(m.price)} · ${S.mult}×`);
}
function closePosition(id,liquidated){
  const a=acct(),i=a.positions.findIndex(p=>p.id===id);if(i<0)return;
  const p=a.positions[i],m=BY_SYM[p.sym],v=pnl(p);
  a.paper+=Math.max(0,p.amount+v);a.positions.splice(i,1);
  (a.history??=[]).unshift({...p,exit:m.price,pnl:v,status:liquidated?'liquidated':'closed',closed:Date.now()});
  a.history.length=Math.min(a.history.length,100);
  persist();renderAll();
  haptic(liquidated||v<0?'error':'success');
  toast(liquidated?`${p.sym} ${p.side} was liquidated`:`Closed ${p.sym} · ${v>=0?'+':'−'}${fmt2(Math.abs(v))}`);
}
function topUp(n){
  if(S.cur!=='paper'){closeSheet();if(!signedIn())loginSheet();return}
  acct().paper+=n;persist();
  closeSheet();renderAll();toast(`<span class="cur-icon sm paper"></span>Added ${n.toLocaleString()} Paper`);
}

function renderAll(){
  renderHeader();
  if(route().view==='dash'){renderPositions();renderRows();renderHistory()}
  else{renderTickerPositions();syncPriceLines()}
  if(!$('#tGo')||$('#tradeTitle').hidden!==(route().view!=='ticker'))renderTrade();else updateTrade();
}
onTick(()=>{
  for(const p of [...positions()]) if(pnl(p)<=-p.amount) closePosition(p.id,true);
  renderHeader();
  if(route().view==='dash'){renderPositions();renderRows()}
  else{updateTickerPrice();tickChart();renderTickerPositions();updateDock()}
  updateTrade();
});

applyRoute();
startFeed();
try{const id=localStorage.getItem(SKEY);if(id&&USERS[id])startSession(id)}catch(e){}
