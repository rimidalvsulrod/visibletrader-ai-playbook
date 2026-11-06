const $=s=>document.querySelector(s);
const KEY='maxout-clone-v1';
const today=()=>new Date().toISOString().slice(0,10);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- state ----------
   Guests trade Paper saved in this browser. Signed-in users trade Paper held on the server (api/account). */
const S=Object.assign({cur:'paper',paper:1000,refilled:today(),positions:[],sel:'NVDA',side:'short',amount:10,mult:100,filter:'all',q:'',hidden:false,tf:'1d',ct:'candle'},
  (()=>{try{return JSON.parse(localStorage.getItem(KEY))||{}}catch(e){return {}}})());
if(S.refilled!==today()){if(S.paper<1000)S.paper=1000;S.refilled=today()}
S.cur='paper';
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({paper:S.paper,refilled:S.refilled,positions:S.positions,sel:S.sel,side:S.side,amount:S.amount,mult:S.mult,hidden:S.hidden,tf:S.tf,ct:S.ct}))}catch(e){}};

let CFG={googleClientId:null,accounts:false};
let ACC=null; // {user, paper, positions, history} when signed in
const signedIn=()=>!!ACC;
const paperBal=()=>signedIn()?ACC.paper:S.paper;
const positions=()=>signedIn()?ACC.positions:S.positions;

async function api(path,opts={}){
  const r=await fetch('/api/'+path,{method:opts.body?'POST':(opts.method||'GET'),headers:opts.body?{'content-type':'application/json'}:{},body:opts.body?JSON.stringify(opts.body):undefined,credentials:'same-origin'});
  const j=await r.json().catch(()=>({error:'Network error'}));
  if(!r.ok) throw Object.assign(new Error(j.error||'Request failed'),{status:r.status});
  return j;
}

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
  $('#pfSub').innerHTML=S.cur==='cash'?'Get Cash to trade for real stakes'
    :signedIn()?'Practice with Paper. It refills to 1,000 every day.'
    :'Practice with Paper. It refills to 1,000 every day. <button class="link" data-signin>Sign in</button> to keep it.';
  const u=ACC?.user;
  $('#who').innerHTML=u
    ?`<button class="avatar" id="avatar" title="${esc(u.email)}">${u.picture?`<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">`:esc((u.name||u.email)[0].toUpperCase())}</button>`
    :`<button class="btn-signin" data-signin>Sign in</button>`;
}

function renderPositions(){
  const el=$('#positions');
  const list=S.cur==='paper'?positions():[];
  if(!list.length){
    el.innerHTML=`<div class="empty">No open positions. ${S.cur==='paper'?'<b>Pick a market below.</b>':'<b>Top up, then pick a market.</b>'}</div>`;return;
  }
  el.innerHTML=`<div class="card">${list.map(p=>{
    const m=BY_SYM[p.sym],v=pnl(p),pct=v/p.amount*100;
    return `<div class="pos">
      <a class="mrow-id" href="/m/${p.sym}" data-nav="/m/${p.sym}">${iconHTML(p.sym,34)}<div class="stack"><div class="sym">${p.sym}<span class="tag ${p.side}">${p.side==='long'?'LONG':'SHORT'} ${p.mult}×</span></div>
      <div class="pos-meta">${fmt2(p.amount)} @ ${fmtPrice(p.entry)} → ${fmtPrice(m.price)}</div></div></a>
      <div class="pos-pnl ${v>=0?'up':'down'}">${v>=0?'+':'−'}${fmt2(Math.abs(v))}<small>${v>=0?'+':'−'}${Math.abs(pct).toFixed(1)}%</small></div>
      <button class="btn-close" data-close-pos="${p.id}">Close</button></div>`}).join('')}</div>`;
}

function renderHistory(){
  const h=ACC?.history||[];
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
      <div class="chips" id="multChips">${MULTS.map(v=>`<button class="chip" data-mult="${v}">${v}×</button>`).join('')}</div>
    </div>
    <div class="summary">
      <div>Exposure<b id="sExp"></b></div>
      <div>Liquidation<b id="sLiq"></b></div>
      <div>Max loss<b id="sLoss"></b></div>
    </div>
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

let busy=false;
function updateTrade(){
  const m=BY_SYM[S.sel];if(!$('#tGo'))return;
  if($('#tPrice')){
    $('#tPrice').textContent=fmtPrice(m.price);
    $('#tChg').className='c '+(m.chg>=0?'up':'down');$('#tChg').textContent=fmtChg(m.chg)+' today';
    $('#tChart').innerHTML=chartSVG(m);
  }
  document.querySelectorAll('.seg button').forEach(b=>b.classList.toggle('on',b.dataset.side===S.side));
  $('#tAvail').innerHTML=money(balance());
  document.querySelectorAll('#amtChips .chip').forEach(b=>b.classList.toggle('on',+b.dataset.amt===S.amount));
  document.querySelectorAll('#multChips .chip').forEach(b=>b.classList.toggle('on',+b.dataset.mult===S.mult));
  $('#tMult').textContent=S.mult+'×';
  $('#tSlider').style.setProperty('--p',(multToSlider(S.mult)/10)+'%');
  const amt=S.amount||0,liq=m.price*(1+(S.side==='long'?-1:1)/S.mult);
  $('#sExp').innerHTML=money(amt*S.mult);
  $('#sLiq').textContent=fmtPrice(liq);
  $('#sLoss').innerHTML=money(amt);
  const go=$('#tGo');
  go.className='btn-primary btn-block';
  if(S.cur==='cash'){go.disabled=false;go.textContent='Get Cash to trade'}
  else if(busy){go.disabled=true;go.textContent='Placing…'}
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
    handleScroll:true,handleScale:true,
  });
  const prec=precisionFor(m.price),pf={type:'price',precision:prec,minMove:1/10**prec};
  const main=S.ct==='candle'
    ?chart.addCandlestickSeries({upColor:'#2fe08a',downColor:'#ff5470',borderVisible:false,wickUpColor:'#2fe08a',wickDownColor:'#ff5470',priceFormat:pf})
    :chart.addAreaSeries({lineColor:m.chg>=0?'#2fe08a':'#ff5470',topColor:m.chg>=0?'rgba(47,224,138,.25)':'rgba(255,84,112,.25)',bottomColor:'rgba(0,0,0,0)',lineWidth:2,priceFormat:pf});
  const vol=chart.addHistogramSeries({priceScaleId:'vol',priceFormat:{type:'volume'},lastValueVisible:false,priceLineVisible:false});
  chart.priceScale('vol').applyOptions({scaleMargins:{top:.85,bottom:0}});
  CH={chart,main,vol,sym:m.sym,tf:S.tf,ct:S.ct,bars:[]};
  const mine=CH;
  try{
    const bars=await candles(m.sym,S.tf);
    if(CH!==mine)return;
    mine.bars=bars;
    setSeries();
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
}

/* ---------- routing: /app = dashboard, /m/SYM = ticker page ---------- */
function route(){
  const m=/^\/m\/([A-Za-z]+)/.exec(location.pathname);
  return m&&BY_SYM[m[1].toUpperCase()]?{view:'ticker',sym:m[1].toUpperCase()}:{view:'dash'};
}
function go(path){if(path!==location.pathname)history.pushState(null,'',path);applyRoute();scrollTo({top:0})}
function applyRoute(){
  const r=route();
  $('#dashView').hidden=r.view!=='dash';
  $('#tickerView').hidden=r.view!=='ticker';
  document.body.classList.toggle('ticker-mode',r.view==='ticker');
  if(r.view==='ticker'){S.sel=r.sym;save();renderTrade();renderTicker()}
  else{document.title='maxout.so';if(CH){CH.chart.remove();CH=null}renderAll()}
}
addEventListener('popstate',applyRoute);

/* ---------- sheets ---------- */
function openSheet(html){$('#sheetBody').innerHTML=html;$('#sheet').classList.add('open')}
function closeSheet(){$('#sheet').classList.remove('open')}
const devLogin=()=>CFG.googleClientId==='dev-client'&&/^(localhost|127\.)/.test(location.hostname);
function loginSheet(){
  const live=CFG.googleClientId&&CFG.accounts&&!devLogin();
  openSheet(`<h3>Log in</h3><p>Welcome to Maxout.</p>
  <div class="opts">
    ${live?`<div class="gbtn" id="gbtn"><div class="gbtn-wait">Loading Google…</div></div>`
      :devLogin()?`<form class="devlogin" id="devForm"><input id="devEmail" type="email" placeholder="you@example.com (local test login)" required><button class="btn-oauth">Continue (dev)</button></form>`
      :`<button class="btn-oauth" data-gnotready>${GLOGO}Continue with Google</button>`}
    <button class="btn-oauth soon">${ALOGO}Continue with Apple<span class="pill">COMING SOON</span></button>
  </div>
  <div class="foot">Don’t have an account? <b>Sign up</b> happens automatically.</div>
  <div class="foot small">Your Paper balance, positions and history are saved to your account.</div>`);
  if(live) mountGoogle();
}
const GLOGO=`<svg width="18" height="18" viewBox="0 0 24 24"><path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 01-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285f4"/><path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0012 22z" fill="#34a853"/><path d="M6.4 14a6 6 0 010-3.9V7.5H3.1a10 10 0 000 9z" fill="#fbbc05"/><path d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 003.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z" fill="#ea4335"/></svg>`;
const ALOGO=`<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9s-2-.9-3.4-.9C7 6.8 5.3 7.8 4.4 9.4c-1.8 3.2-.5 7.9 1.3 10.5.9 1.3 1.9 2.7 3.3 2.6 1.3-.1 1.8-.9 3.4-.9s2 .9 3.4.8c1.4 0 2.3-1.3 3.2-2.6 1-1.5 1.4-2.9 1.4-3-.1 0-2.8-1-2.8-4.2zM15 4.8c.7-.9 1.2-2.1 1.1-3.3-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.2 1.1.1 2.3-.6 3-1.5z"/></svg>`;
let gisLoaded;
function loadGIS(){return gisLoaded??=new Promise((ok,bad)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=ok;s.onerror=bad;document.head.appendChild(s)})}
async function mountGoogle(){
  try{
    await loadGIS();
    google.accounts.id.initialize({client_id:CFG.googleClientId,callback:r=>finishLogin(r.credential),ux_mode:'popup'});
    const el=$('#gbtn');if(!el)return;el.innerHTML='';
    google.accounts.id.renderButton(el,{theme:'filled_black',size:'large',shape:'pill',text:'continue_with',width:Math.min(340,el.clientWidth||340)});
  }catch(e){const el=$('#gbtn');if(el)el.innerHTML='<div class="gbtn-wait">Could not load Google sign-in</div>'}
}
async function finishLogin(credential){
  try{
    await api('auth',{body:{credential}});
    closeSheet();
    await loadAccount();
    // bring a guest's open trades along? Keep it simple: guests start fresh on the server.
    toast(`Signed in as ${esc(ACC.user.email)}`);
  }catch(e){toast(esc(e.message))}
}
function accountSheet(){
  const u=ACC.user,h=ACC.history||[],wins=h.filter(p=>p.pnl>0).length,net=h.reduce((a,p)=>a+p.pnl,0);
  openSheet(`<div class="acct-pic">${u.picture?`<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">`:esc((u.name||u.email)[0].toUpperCase())}</div>
  <h3>${esc(u.name||'')}</h3><p>${esc(u.email)}</p>
  <div class="acct-stats"><div><span>Paper</span><b>${money(ACC.paper)}</b></div><div><span>Open</span><b>${ACC.positions.length}</b></div><div><span>Recent trades</span><b>${h.length}${h.length?` · ${wins} won`:''}</b></div><div><span>Recent P&amp;L</span><b class="${net>=0?'up':'down'}">${net>=0?'+':'−'}${fmt2(Math.abs(net))}</b></div></div>
  <div class="opts"><button class="btn-oauth" data-signout>Sign out</button></div>`);
}
function topUpSheet(){
  openSheet(`<h3>Top up</h3><p>${S.cur==='paper'?'Add Paper to practice with. It’s free.':'Apple Pay, Google Pay, card or crypto.'}</p>
  <div class="topup-grid">${[100,500,1000,2500,5000,10000].map(v=>`<button data-topup="${v}">${v.toLocaleString()}</button>`).join('')}</div>`);
}

/* ---------- account sync ---------- */
async function loadAccount(){
  try{ACC=await api('account')}catch(e){ACC=null}
  renderAll();
}
let lastSync=0;
async function syncIfLiquidated(){
  if(!signedIn()||Date.now()-lastSync<4000)return;
  if(ACC.positions.some(p=>pnl(p)<=-p.amount)||Date.now()-lastSync>30000){
    lastSync=Date.now();
    const before=new Set(ACC.positions.map(p=>p.id));
    try{ACC=await api('account')}catch(e){if(e.status===401){ACC=null}return renderAll()}
    const gone=(ACC.history||[]).filter(p=>before.has(p.id)&&p.status==='liquidated');
    gone.forEach(p=>toast(`${p.sym} ${p.side} was liquidated`));
    renderAll();
  }
}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-nav],a.mrow');
  if(nav&&!e.metaKey&&!e.ctrlKey&&e.button===0){e.preventDefault();S.q='';$('#search').value='';renderSearchPop();go(nav.dataset.nav||nav.getAttribute('href'));return}
  const t=e.target.closest('button,[data-close]');if(!t)return;
  if(t.dataset.close!==undefined){closeSheet();return}
  if(t.dataset.signin!==undefined){loginSheet();return}
  if(t.dataset.signout!==undefined){api('auth',{method:'DELETE'}).finally(()=>{ACC=null;closeSheet();renderAll();toast('Signed out')});return}
  if(t.dataset.gnotready!==undefined){toast('Google sign-in turns on once the site has its Google client ID');return}
  if(t.dataset.cur){
    if(t.dataset.cur==='cash'){S.cur='cash';renderAll();if(!signedIn())loginSheet();else toast('Cash trading is coming soon. Practice with Paper for now.');return}
    S.cur='paper';renderAll();return}
  if(t.dataset.f){S.filter=t.dataset.f;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b===t));renderRows();return}
  if(t.dataset.tf){S.tf=t.dataset.tf;save();renderTicker();return}
  if(t.dataset.ct){S.ct=t.dataset.ct;save();document.querySelectorAll('#ctype button').forEach(b=>b.classList.toggle('on',b===t));buildChart();return}
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
  if(e.target.id==='devForm'){e.preventDefault();finishLogin('dev:'+$('#devEmail').value.trim())}
});
document.addEventListener('input',e=>{
  if(e.target.id==='tAmount'){const v=parseFloat(e.target.value.replace(/[^0-9.]/g,''));S.amount=isNaN(v)?0:v;save();updateTrade()}
  if(e.target.id==='tSlider'){S.mult=sliderToMult(+e.target.value);save();updateTrade()}
  if(e.target.id==='search'){S.q=e.target.value.trim();renderSearchPop();if(route().view==='dash')renderRows()}
});
document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#search').focus()}
  if(e.key==='Escape'){closeSheet();S.q='';$('#search').value='';renderSearchPop();$('#search').blur();if(route().view==='dash')renderRows()}
  if(e.key==='Enter'&&e.target.id==='search'){const m=visibleMarkets(S.q)[0];if(m){S.q='';e.target.value='';renderSearchPop();e.target.blur();go('/m/'+m.sym)}}
});
document.addEventListener('focusout',e=>{if(e.target.id==='search')setTimeout(()=>$('#searchPop').classList.remove('open'),150)});
document.addEventListener('focusin',e=>{if(e.target.id==='search'&&S.q)renderSearchPop()});

/* ---------- trading ---------- */
async function placeTrade(){
  if(S.cur==='cash'){loginSheet();return}
  const m=BY_SYM[S.sel];
  if(signedIn()){
    busy=true;updateTrade();
    try{ACC=await api('account',{body:{op:'open',sym:m.sym,side:S.side,amount:S.amount,mult:S.mult}});const p=ACC.positions[0];
      toast(`${S.side==='long'?'Longed':'Shorted'} ${m.sym} at ${fmtPrice(p?.entry??m.price)} · ${S.mult}×`)}
    catch(e){toast(esc(e.message))}
    busy=false;renderAll();return;
  }
  S.paper-=S.amount;
  S.positions.unshift({id:Date.now().toString(36),sym:m.sym,side:S.side,amount:S.amount,mult:S.mult,entry:m.price});
  save();renderAll();
  toast(`${S.side==='long'?'Longed':'Shorted'} ${m.sym} at ${fmtPrice(m.price)} · ${S.mult}×`);
}
async function closePosition(id,liquidated){
  if(signedIn()){
    try{const r=await api('account',{body:{op:'close',id}});ACC=r;const p=r.history.find(h=>h.id===id);
      toast(p?`Closed ${p.sym} · ${p.pnl>=0?'+':'−'}${fmt2(Math.abs(p.pnl))}`:'Closed')}
    catch(e){toast(esc(e.message))}
    renderAll();return;
  }
  const i=S.positions.findIndex(p=>p.id===id);if(i<0)return;
  const p=S.positions[i],v=pnl(p);
  S.paper+=Math.max(0,p.amount+v);S.positions.splice(i,1);save();renderAll();
  toast(liquidated?`${p.sym} ${p.side} was liquidated`:`Closed ${p.sym} · ${v>=0?'+':'−'}${fmt2(Math.abs(v))}`);
}
async function topUp(n){
  if(S.cur!=='paper'){closeSheet();loginSheet();return}
  if(signedIn()){try{ACC=await api('account',{body:{op:'topup',amount:n}})}catch(e){return toast(esc(e.message))}}
  else{S.paper+=n;save()}
  closeSheet();renderAll();toast(`<span class="cur-icon sm paper"></span>Added ${n.toLocaleString()} Paper`);
}

function renderAll(){
  renderHeader();
  if(route().view==='dash'){renderPositions();renderRows();renderHistory()}
  if(!$('#tGo')||$('#tradeTitle').hidden!==(route().view!=='ticker'))renderTrade();else updateTrade();
}
onTick(()=>{
  if(!signedIn()) for(const p of [...S.positions]) if(pnl(p)<=-p.amount) closePosition(p.id,true);
  syncIfLiquidated();
  renderHeader();
  if(route().view==='dash'){renderPositions();renderRows()}
  else{updateTickerPrice();tickChart()}
  updateTrade();
});

applyRoute();
startFeed();
api('config').then(async c=>{CFG=c;if(c.accounts&&(await api('auth')).user)return loadAccount()}).catch(()=>{});
