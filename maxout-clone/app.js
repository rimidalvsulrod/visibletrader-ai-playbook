const $=s=>document.querySelector(s);
const KEY='maxout-clone-v1';
const today=()=>new Date().toISOString().slice(0,10);

const S=Object.assign({cur:'paper',paper:1000,refilled:today(),positions:[],sel:'NVDA',side:'short',amount:10,mult:100,filter:'all',q:'',hidden:false},
  (()=>{try{return JSON.parse(localStorage.getItem(KEY))||{}}catch(e){return {}}})());
// Paper refills to 1,000 every day.
if(S.refilled!==today()){if(S.paper<1000)S.paper=1000;S.refilled=today()}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({cur:S.cur,paper:S.paper,refilled:S.refilled,positions:S.positions,sel:S.sel,side:S.side,amount:S.amount,mult:S.mult,hidden:S.hidden}))}catch(e){}};

const fmt2=v=>v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
function money(v,{icon=true,size='sm'}={}){
  const [i,c]=fmt2(Math.max(0,v)).split('.');
  const shown=S.hidden?'••••':`${i}<span class="cents">.${c}</span>`;
  return `<span class="money">${icon?`<span class="cur-icon ${size} ${S.cur}"></span>`:''}${shown}</span>`;
}
const balance=()=>S.cur==='paper'?S.paper:0;
const pnl=p=>{const m=BY_SYM[p.sym];return Math.max(-p.amount,p.amount*p.mult*(m.price/p.entry-1)*(p.side==='long'?1:-1))};
const portfolio=()=>balance()+(S.cur==='paper'?S.positions.reduce((a,p)=>a+p.amount+pnl(p),0):0);
const canTrade=m=>m.type==='crypto'||stocksOpen();

function toast(msg){const t=$('#toast');t.innerHTML=msg;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2200)}

/* ---------- Header + portfolio ---------- */
function renderHeader(){
  document.querySelectorAll('#curSwitch button').forEach(b=>b.classList.toggle('on',b.dataset.cur===S.cur));
  $('#availTop').innerHTML=money(balance());
  const [i,c]=fmt2(portfolio()).split('.');
  $('#pfTotal').innerHTML=S.hidden?'••••••':`${i}<span class="cents">.${c}</span>`;
  $('#pfIcon').className='cur-icon big '+S.cur;
  $('#pfSub').textContent=S.cur==='paper'?'Practice with Paper. It refills to 1,000 every day.':'Get Cash to trade for real stakes';
}

function renderPositions(){
  const el=$('#positions');
  const list=S.cur==='paper'?S.positions:[];
  if(!list.length){
    el.innerHTML=`<div class="empty">No open positions. ${S.cur==='paper'?'<b>Pick a market below.</b>':'<b>Top up, then pick a market.</b>'}</div>`;return;
  }
  el.innerHTML=`<div class="card">${list.map(p=>{
    const m=BY_SYM[p.sym],v=pnl(p),pct=v/p.amount*100;
    return `<div class="pos">
      <div class="mrow-id">${iconHTML(p.sym,34)}<div class="stack"><div class="sym">${p.sym}<span class="tag ${p.side}">${p.side==='long'?'LONG':'SHORT'} ${p.mult}×</span></div>
      <div class="pos-meta">${fmt2(p.amount)} @ ${fmtPrice(p.entry)} → ${fmtPrice(m.price)}</div></div></div>
      <div class="pos-pnl ${v>=0?'up':'down'}">${v>=0?'+':'−'}${fmt2(Math.abs(v))}<small>${v>=0?'+':'−'}${Math.abs(pct).toFixed(1)}%</small></div>
      <button class="btn-close" data-close-pos="${p.id}">Close</button></div>`}).join('')}</div>`;
}

/* ---------- Markets table ---------- */
function visibleMarkets(){
  let list=MARKETS.filter(m=>S.filter==='all'||S.filter==='movers'||m.type===S.filter);
  if(S.q){const q=S.q.toLowerCase();list=list.filter(m=>m.sym.toLowerCase().includes(q)||m.name.toLowerCase().includes(q))}
  if(S.filter==='movers')list=[...list].sort((a,b)=>Math.abs(b.chg)-Math.abs(a.chg));
  return list;
}
const lastPrice={};
function renderRows(){
  const list=visibleMarkets();
  $('#rows').innerHTML=list.length?list.map(m=>{
    const dir=m.chg>=0?'up':'down',col=m.chg>=0?'var(--green)':'var(--red)';
    const prev=lastPrice[m.sym];lastPrice[m.sym]=m.price;
    const flash=prev&&prev!==m.price?(m.price>prev?'flash-up':'flash-down'):'';
    return `<button class="mrow${m.sym===S.sel?' selected':''}" data-sym="${m.sym}">
      <span class="mrow-id">${iconHTML(m.sym)}<span class="stack"><span class="sym">${m.sym}</span><span class="name">${m.name}</span></span></span>
      <span class="mrow-spark"><svg width="80" height="28"><path d="${sparkPath(m.series.slice(-120),80,28)}" fill="none" stroke="${col}" stroke-width="1.2"/></svg></span>
      <span class="mrow-price ${flash}">${fmtPrice(m.price)}</span>
      <span class="mrow-change ${dir}">${fmtChg(m.chg)}</span></button>`}).join('')
    :`<div class="empty" style="margin:14px;border-radius:12px">No markets match “${S.q}”.</div>`;
  const anyStock=stocksOpen();
  $('#feedText').textContent=`Live from Hyperliquid · Stocks market ${anyStock?'open':'closed'}`;
}

/* ---------- Trade panel ---------- */
const MULTS=[10,50,100,500,1000];
const multToSlider=m=>Math.log10(m)/3*1000;
const sliderToMult=v=>{const m=Math.round(Math.pow(10,v/1000*3));return m<10?m:m<100?Math.round(m/5)*5:m<1000?Math.round(m/10)*10:1000};

function renderTrade(){
  const m=BY_SYM[S.sel];
  $('#trade').innerHTML=`
    <div class="trade-head">${iconHTML(m.sym,40)}<div class="stack"><span class="sym">${m.sym}</span><span class="name">${m.name}</span></div></div>
    <div class="trade-price"><span class="p" id="tPrice"></span><span class="c" id="tChg"></span></div>
    <div class="area-chart" id="tChart"></div>
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

function updateTrade(){
  const m=BY_SYM[S.sel];if(!$('#tPrice'))return;
  $('#tPrice').textContent=fmtPrice(m.price);
  $('#tChg').className='c '+(m.chg>=0?'up':'down');$('#tChg').textContent=fmtChg(m.chg)+' today';
  $('#tChart').innerHTML=chartSVG(m);
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
  else if(!canTrade(m)){go.disabled=true;go.textContent='Closed · stocks trade 4am–8pm ET'}
  else if(!amt||amt>S.paper){go.disabled=true;go.textContent=amt?'Not enough Paper':'Enter an amount'}
  else{go.disabled=false;go.classList.add(S.side);go.textContent=`${S.side==='long'?'Long':'Short'} ${m.sym} · ${S.mult}×`}
}

/* ---------- Sheets ---------- */
function openSheet(html){$('#sheetBody').innerHTML=html;$('#sheet').classList.add('open')}
function closeSheet(){$('#sheet').classList.remove('open')}
function loginSheet(){
  openSheet(`<h3>Log in</h3><p>Welcome to Maxout.</p>
  <div class="opts">
    <button class="btn-oauth" data-demo><svg width="18" height="18" viewBox="0 0 24 24"><path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 01-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285f4"/><path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0012 22z" fill="#34a853"/><path d="M6.4 14a6 6 0 010-3.9V7.5H3.1a10 10 0 000 9z" fill="#fbbc05"/><path d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 003.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z" fill="#ea4335"/></svg>Continue with Google</button>
    <button class="btn-oauth soon"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9s-2-.9-3.4-.9C7 6.8 5.3 7.8 4.4 9.4c-1.8 3.2-.5 7.9 1.3 10.5.9 1.3 1.9 2.7 3.3 2.6 1.3-.1 1.8-.9 3.4-.9s2 .9 3.4.8c1.4 0 2.3-1.3 3.2-2.6 1-1.5 1.4-2.9 1.4-3-.1 0-2.8-1-2.8-4.2zM15 4.8c.7-.9 1.2-2.1 1.1-3.3-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.2 1.1.1 2.3-.6 3-1.5z"/></svg>Continue with Apple<span class="pill">COMING SOON</span></button>
  </div>
  <div class="foot">Don’t have an account? <b>Sign up</b></div>`);
}
function topUpSheet(){
  openSheet(`<h3>Top up</h3><p>${S.cur==='paper'?'Add Paper to practice with. It’s free.':'Apple Pay, Google Pay, card or crypto.'}</p>
  <div class="topup-grid">${[100,500,1000,2500,5000,10000].map(v=>`<button data-topup="${v}">${v.toLocaleString()}</button>`).join('')}</div>`);
}

/* ---------- Events ---------- */
document.addEventListener('click',e=>{
  const t=e.target.closest('button,[data-close]');if(!t)return;
  if(t.dataset.close!==undefined){closeSheet();return}
  if(t.dataset.cur){S.cur=t.dataset.cur;save();renderAll();if(S.cur==='cash')loginSheet();return}
  if(t.dataset.sym){S.sel=t.dataset.sym;save();renderRows();renderTrade();if(innerWidth<1000)$('#trade').scrollIntoView({behavior:'smooth'});return}
  if(t.dataset.f){S.filter=t.dataset.f;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b===t));renderRows();return}
  if(t.dataset.side){S.side=t.dataset.side;save();updateTrade();return}
  if(t.dataset.amt){S.amount=t.dataset.amt==='max'?Math.floor(balance()*100)/100:+t.dataset.amt;$('#tAmount').value=S.amount;save();updateTrade();return}
  if(t.dataset.mult){S.mult=+t.dataset.mult;$('#tSlider').value=multToSlider(S.mult);save();updateTrade();return}
  if(t.dataset.closePos){closePosition(t.dataset.closePos);return}
  if(t.dataset.topup){
    if(S.cur==='paper'){S.paper+=+t.dataset.topup;save();closeSheet();renderAll();toast(`<span class="cur-icon sm paper"></span>Added ${(+t.dataset.topup).toLocaleString()} Paper`)}
    else{closeSheet();loginSheet()}
    return}
  if(t.dataset.demo!==undefined){closeSheet();toast('Sign-in is turned off in this design demo');return}
  if(t.id==='topUp'){S.cur==='cash'?loginSheet():topUpSheet();return}
  if(t.id==='eye'){S.hidden=!S.hidden;save();renderAll();return}
  if(t.id==='avatar'){toast('Signed in as a demo trader');return}
  if(t.id==='tGo'){placeTrade();return}
});
document.addEventListener('input',e=>{
  if(e.target.id==='tAmount'){const v=parseFloat(e.target.value.replace(/[^0-9.]/g,''));S.amount=isNaN(v)?0:v;save();updateTrade()}
  if(e.target.id==='tSlider'){S.mult=sliderToMult(+e.target.value);save();updateTrade()}
  if(e.target.id==='search'){S.q=e.target.value.trim();renderRows()}
});
document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#search').focus()}
  if(e.key==='Escape'){closeSheet();$('#search').blur()}
  if(e.key==='Enter'&&e.target.id==='search'){const m=visibleMarkets()[0];if(m){S.sel=m.sym;renderRows();renderTrade()}}
});

function placeTrade(){
  if(S.cur==='cash'){loginSheet();return}
  const m=BY_SYM[S.sel];
  S.paper-=S.amount;
  S.positions.unshift({id:Date.now().toString(36),sym:m.sym,side:S.side,amount:S.amount,mult:S.mult,entry:m.price});
  save();renderAll();
  toast(`${S.side==='long'?'Longed':'Shorted'} ${m.sym} at ${fmtPrice(m.price)} · ${S.mult}×`);
}
function closePosition(id,liquidated){
  const i=S.positions.findIndex(p=>p.id===id);if(i<0)return;
  const p=S.positions[i],v=pnl(p);
  S.paper+=Math.max(0,p.amount+v);S.positions.splice(i,1);save();renderAll();
  toast(liquidated?`${p.sym} ${p.side} was liquidated`:`Closed ${p.sym} · ${v>=0?'+':'−'}${fmt2(Math.abs(v))}`);
}

function renderAll(){renderHeader();renderPositions();renderRows();renderTrade()}
onTick(()=>{
  for(const p of [...S.positions]) if(pnl(p)<=-p.amount) closePosition(p.id,true);
  renderHeader();renderPositions();renderRows();updateTrade();
});
renderAll();
startFeed();
