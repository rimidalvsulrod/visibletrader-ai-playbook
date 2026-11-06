// Market data: crypto is live from Coinbase's public API, stocks are seeded snapshots with a gentle drift.
const ICONS = {
  NVDA:{bg:'#76b900',svg:'<path d="M5 9.5c3-3 9-3 14 1-5 4-11 4-14 1m3-1.2c2-1 4-.8 6 .6-2 1.4-4 1.6-6 .6" stroke="#0b0b0b" stroke-width="1.6" fill="none"/>'},
  AAPL:{bg:'#ffffff',svg:'<path fill="#000" d="M15.6 12.6c0-2 1.6-2.9 1.7-3-1-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7s-1.6-.7-2.6-.7C7.4 8 6 9 5.4 10.5c-1.4 2.4-.4 6 1 8 .7 1 1.4 2 2.5 2 1 0 1.4-.7 2.6-.7s1.5.7 2.6.6c1.1 0 1.8-1 2.4-2 .8-1.1 1.1-2.2 1.1-2.3 0 0-2-.8-2-3.5zM13.7 6.6c.5-.7.9-1.6.8-2.5-.8 0-1.8.5-2.3 1.2-.5.6-1 1.5-.8 2.4.9.1 1.8-.4 2.3-1.1z"/>'},
  TSLA:{bg:'#e31937',svg:'<path fill="#fff" d="M12 20l2-10.5c1.6 0 2.2.2 2.3 1.5 0 0 1-.4 1.4-1.1C16 8.9 14 8.8 14 8.8L12 11.3 10 8.8s-2 .1-3.7 1.1c.4.7 1.4 1.1 1.4 1.1.1-1.3.7-1.5 2.3-1.5zM12 7.9c1.7 0 3.6.2 5.6 1.1.3-.5.4-.8.4-.8C15.9 7.3 13.9 7 12 7s-3.9.3-6 1.2c0 0 .1.3.4.8 2-.9 3.9-1.1 5.6-1.1z"/>'},
  AMZN:{bg:'#ff9900',svg:'<text x="12" y="15" text-anchor="middle" font-family="Arial" font-weight="700" font-size="12" fill="#111">a</text><path d="M7 16.5c3 1.8 7 1.8 10 0" stroke="#111" stroke-width="1.3" fill="none"/>'},
  META:{bg:'#0866ff',svg:'<path d="M5 15c0-4 2-6 3.5-6S11 11 12 13s2.5 5 4 5 2.5-1.5 2.5-3.5S17 9 15.5 9 13 11 12 13s-2.5 5-4 5-3-1-3-3z" stroke="#fff" stroke-width="1.6" fill="none"/>'},
  MSFT:{bg:'#1b1b1d',svg:'<rect x="6" y="6" width="5.5" height="5.5" fill="#fff"/><rect x="12.5" y="6" width="5.5" height="5.5" fill="#fff"/><rect x="6" y="12.5" width="5.5" height="5.5" fill="#fff"/><rect x="12.5" y="12.5" width="5.5" height="5.5" fill="#fff"/>'},
  GOOGL:{bg:'#ffffff',svg:'<path d="M18 12.2c0-.5 0-.9-.1-1.3H12v2.5h3.4a3 3 0 01-1.3 1.9v1.6h2.1c1.2-1.1 1.8-2.8 1.8-4.7z" fill="#4285f4"/><path d="M12 18.5c1.7 0 3.2-.6 4.2-1.6l-2.1-1.6c-.6.4-1.3.6-2.1.6-1.6 0-3-1.1-3.5-2.6H6.4v1.7a6.4 6.4 0 005.6 3.5z" fill="#34a853"/><path d="M8.5 13.3a3.8 3.8 0 010-2.5V9.1H6.4a6.4 6.4 0 000 5.8z" fill="#fbbc05"/><path d="M12 8.1c.9 0 1.8.3 2.4.9l1.8-1.8A6.4 6.4 0 006.4 9.1l2.1 1.7C9 9.3 10.4 8.1 12 8.1z" fill="#ea4335"/>'},
  COIN:{bg:'#0052ff',svg:'<text x="12" y="13.6" text-anchor="middle" font-family="Arial" font-size="4.4" fill="#fff">coinbase</text>'},
  HOOD:{bg:'#ccff00',svg:'<path d="M9 18c1-5 3-9 7-11-2 3-3 6-3.5 9M8 12c2-1 4-1 6 0" stroke="#111" stroke-width="1.7" fill="none" stroke-linecap="round"/>'},
  AMD:{bg:'#1b1b1d',svg:'<text x="12" y="13.8" text-anchor="middle" font-family="Arial" font-weight="700" font-size="5.6" fill="#fff">AMD</text>'},
  NFLX:{bg:'#0b0b0b',svg:'<path d="M9 6h2.2l2 7V6H15v12h-2.2l-2-7v7H9z" fill="#e50914"/>'},
  PLTR:{bg:'#ffffff',svg:'<circle cx="12" cy="10.5" r="4" stroke="#111" stroke-width="1.8" fill="none"/><path d="M7 17.5l5 2 5-2" stroke="#111" stroke-width="1.8" fill="none"/>'},
  SHOP:{bg:'#95bf47',svg:'<path d="M8 8h8l1 11H7z" fill="#fff"/><path d="M10 8a2 2 0 014 0" stroke="#fff" stroke-width="1.4" fill="none"/><text x="12" y="16.5" text-anchor="middle" font-family="Arial" font-weight="700" font-size="6" fill="#5e8e3e">S</text>'},
  ABNB:{bg:'#ff5a5f',svg:'<path d="M12 6c-1 0-1.6 1-2.5 3L7 14.5c-.8 2 .5 3.5 2 3.5 1.2 0 2-1 3-2 1 1 1.8 2 3 2 1.5 0 2.8-1.5 2-3.5L14.5 9C13.6 7 13 6 12 6zm0 9c-1-1.2-1.6-2.4-1.6-3.2a1.6 1.6 0 013.2 0c0 .8-.6 2-1.6 3.2z" fill="#fff"/>'},
  MSTR:{bg:'#d9232e',svg:'<path d="M6 17V8l6 5 6-5v9" stroke="#fff" stroke-width="2" fill="none" stroke-linejoin="round"/>'},
  INTC:{bg:'#0068b5',svg:'<text x="12" y="14.6" text-anchor="middle" font-family="Arial" font-weight="700" font-size="7.5" fill="#fff">intel</text>'},
  BTC:{bg:'#f7931a',svg:'<text x="12" y="16.3" text-anchor="middle" font-family="Arial" font-weight="700" font-size="12" fill="#fff">₿</text>'},
  ETH:{bg:'#627eea',svg:'<path d="M12 5l-4.2 7.1L12 14.6l4.2-2.5zM7.8 13l4.2 6 4.2-6-4.2 2.5z" fill="#fff"/>'},
  SOL:{bg:'#111',svg:'<path d="M8 8h9l-1.5 1.6h-9zM6.5 11.2h9l1.5 1.6H8zM8 14.4h9l-1.5 1.6h-9z" fill="#14f195"/>'},
  XRP:{bg:'#23292f',svg:'<path d="M7 7l3.5 3.4a2 2 0 003 0L17 7M7 17l3.5-3.4a2 2 0 013 0L17 17" stroke="#fff" stroke-width="1.6" fill="none"/>'},
  DOGE:{bg:'#c2a633',svg:'<text x="12" y="16.3" text-anchor="middle" font-family="Arial" font-weight="700" font-size="11" fill="#fff">Ð</text>'},
  LINK:{bg:'#2a5ada',svg:'<path d="M12 6l5 3v6l-5 3-5-3V9z" stroke="#fff" stroke-width="1.8" fill="none"/>'},
  ADA:{bg:'#0033ad',svg:'<g fill="#fff"><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="7" r="1"/><circle cx="12" cy="17" r="1"/><circle cx="7.7" cy="9.5" r="1"/><circle cx="16.3" cy="9.5" r="1"/><circle cx="7.7" cy="14.5" r="1"/><circle cx="16.3" cy="14.5" r="1"/></g>'},
  LTC:{bg:'#345d9d',svg:'<path d="M11 6.5L9.6 12l-1.6.6M9.6 12l-1 4.5h7.4M9 13l5-1.8" stroke="#fff" stroke-width="1.7" fill="none" stroke-linecap="round"/>'},
};

const STOCKS = [
  ['NVDA','Nvidia',183.86,-8.13],['AAPL','Apple',343.32,-1.77],['TSLA','Tesla',345.70,-10.25],
  ['AMZN','Amazon',257.75,-3.11],['META','Meta Platforms',605.55,-3.88],['MSFT','Microsoft',533.09,-4.09],
  ['GOOGL','Alphabet',282.46,-2.24],['COIN','Coinbase',137.42,-9.29],['HOOD','Robinhood',79.46,-9.10],
  ['AMD','AMD',418.04,-14.47],['NFLX','Netflix',64.80,-2.39],['PLTR','Palantir',155.00,-9.73],
  ['MSTR','Strategy',127.39,-11.17],['INTC','Intel',53.74,-5.07],
];
const CRYPTO = [
  ['BTC','Bitcoin',75488.51,-0.65],['ETH','Ethereum',2223.77,-0.51],['SOL','Solana',89.24,0.08],
  ['XRP','XRP',1.1977,-0.70],['DOGE','Dogecoin',0.07144,0.59],['LINK','Chainlink',10.72,0.64],
  ['ADA','Cardano',0.1836,1.69],['LTC','Litecoin',52.36,1.58],
];

function rng(seed){let s=0;for(const c of seed)s=(s*31+c.charCodeAt(0))>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}}

// Intraday shape like the reference: a flat open, a sharp drop, then chop that drifts toward the close.
function synthSeries(sym, price, chg, n=160){
  const r=rng(sym), open=price/(1+chg/100), out=[];
  const dropAt=0.22+r()*0.1;
  for(let i=0;i<n;i++){
    const t=i/(n-1);
    const move=price-open;
    let base;
    if(t<dropAt) base=open+move*0.08*Math.sin(t*14);
    else if(t<dropAt+0.07) base=open+move*((t-dropAt)/0.07)*1.05;
    else base=open+move*(1.05-0.05*Math.sin((t-dropAt)*11)-0.04*Math.sin(t*37));
    out.push(base+move*(r()-0.5)*0.22);
  }
  out[n-1]=price;return out;
}

const MARKETS = [
  ...STOCKS.map(([sym,name,price,chg])=>({sym,name,price,chg,type:'stock',series:synthSeries(sym,price,chg)})),
  ...CRYPTO.map(([sym,name,price,chg])=>({sym,name,price,chg,type:'crypto',open:price/(1+chg/100),series:synthSeries(sym,price,chg)})),
];
const BY_SYM = Object.fromEntries(MARKETS.map(m=>[m.sym,m]));

function iconHTML(sym,size=38){
  const i=ICONS[sym]||{bg:'#333',svg:''};
  return `<span class="ticker-icon" style="width:${size}px;height:${size}px;background:${i.bg}"><svg viewBox="0 0 24 24" width="${size*0.66}" height="${size*0.66}">${i.svg}</svg></span>`;
}

function fmtPrice(p){
  if(p>=1000) return '$'+p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  if(p>=1) return '$'+p.toFixed(2);
  if(p>=0.1) return '$'+p.toFixed(4);
  return '$'+p.toFixed(5);
}
function fmtChg(c){return (c>=0?'+':'−')+Math.abs(c).toFixed(2)+'%'}

function sparkPath(series,w,h,pad=2){
  const min=Math.min(...series),max=Math.max(...series),span=max-min||1;
  return series.map((v,i)=>`${i?'L':'M'}${(i/(series.length-1)*w).toFixed(1)},${(pad+(1-(v-min)/span)*(h-pad*2)).toFixed(1)}`).join('');
}

// US stocks trade 4am-8pm ET on weekdays (matches the reference's "Closed · stocks trade 4am–8pm ET").
function stocksOpen(){
  const et=new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'}));
  const d=et.getDay(),h=et.getHours();
  return d>0&&d<6&&h>=4&&h<20;
}

const listeners=new Set();
function onTick(fn){listeners.add(fn)}
function emit(){listeners.forEach(f=>f())}

// Live data: Hyperliquid public info API. Crypto from the main perp dex, stocks from the "xyz" equity perps dex.
const HL='https://api.hyperliquid.xyz/info';
const hl=body=>fetch(HL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
const coinOf=m=>m.type==='stock'?'xyz:'+m.sym:m.sym;
let feedOk=false;

async function pollPrices(){
  try{
    const [main,xyz]=await Promise.all([hl({type:'metaAndAssetCtxs'}),hl({type:'metaAndAssetCtxs',dex:'xyz'})]);
    for(const [meta,ctxs] of [main,xyz]) meta.universe.forEach((u,i)=>{
      const m=BY_SYM[u.name.replace(/^xyz:/,'')],c=ctxs[i];
      if(!m||coinOf(m)!==u.name||!c)return;
      const p=+c.markPx,prev=+c.prevDayPx;if(!p)return;
      m.price=p;if(prev){m.open=prev;m.chg=(p/prev-1)*100}
      if(m.series.at(-1)!==p){m.series.push(p);if(m.series.length>300)m.series.shift()}
    });
    feedOk=true;
  }catch(e){feedOk=false}
  emit();
}
async function loadHistory(){
  const end=Date.now(),start=end-16*3600e3;
  await Promise.all(MARKETS.map(async m=>{
    try{
      const c=await hl({type:'candleSnapshot',req:{coin:coinOf(m),interval:'5m',startTime:start,endTime:end}});
      if(Array.isArray(c)&&c.length>10)m.series=c.map(x=>+x.c);
    }catch(e){}
  }));
}
function startFeed(){
  pollPrices();
  loadHistory().then(pollPrices);
  setInterval(pollPrices,3000);
}

// Candles for the ticker page. Returns [{time (seconds, shifted to local time for display), open, high, low, close, value}].
const TF = {
  live:{label:'Live',interval:'1m',span:2*3600e3,step:60e3},
  '1d':{label:'1D',interval:'5m',span:24*3600e3,step:300e3},
  '1w':{label:'1W',interval:'1h',span:7*864e5,step:3600e3},
  '1m':{label:'1M',interval:'4h',span:30*864e5,step:4*3600e3},
  '3m':{label:'3M',interval:'1d',span:90*864e5,step:864e5},
};
const TZ_SHIFT=-new Date().getTimezoneOffset()*60;
async function candles(sym,tf){
  const m=BY_SYM[sym],end=Date.now(),t=TF[tf];
  const c=await hl({type:'candleSnapshot',req:{coin:coinOf(m),interval:t.interval,startTime:end-t.span,endTime:end}});
  return (Array.isArray(c)?c:[]).map(x=>({time:Math.floor(x.t/1000)+TZ_SHIFT,open:+x.o,high:+x.h,low:+x.l,close:+x.c,value:+x.v}));
}

const ABOUT = {
  NVDA:'NVIDIA designs graphics processors and system-on-chip units for gaming, professional visualization, data centers and AI. Its GPUs power much of the modern machine-learning industry.',
  AAPL:'Apple makes the iPhone, Mac, iPad, Apple Watch and AirPods, and runs services like the App Store, iCloud and Apple Music for over two billion active devices.',
  TSLA:'Tesla builds electric cars, batteries and solar products, and is working on self-driving software and humanoid robots.',
  AMZN:'Amazon runs the largest online store in the US and Amazon Web Services, the biggest cloud computing platform in the world.',
  META:'Meta owns Facebook, Instagram, WhatsApp and Messenger, and builds AI models and virtual-reality headsets under the Quest brand.',
  MSFT:'Microsoft makes Windows, Office and the Xbox, and runs Azure, one of the largest cloud platforms. It is a major backer of OpenAI.',
  GOOGL:'Alphabet is the parent of Google: Search, YouTube, Android, Chrome, Google Cloud and the Gemini AI models.',
  COIN:'Coinbase runs the largest regulated crypto exchange in the US, plus custody, staking and the Base blockchain.',
  HOOD:'Robinhood is a commission-free trading app for stocks, options and crypto, with retirement accounts and a credit card.',
  AMD:'AMD designs CPUs and GPUs for PCs, game consoles and data centers, and competes with NVIDIA in AI accelerators.',
  NFLX:'Netflix is the largest paid streaming service in the world, producing films, series and live events in over 190 countries.',
  PLTR:'Palantir builds data and AI platforms used by governments, militaries and large companies to run their operations.',
  MSTR:'Strategy (formerly MicroStrategy) sells business software and holds one of the largest corporate Bitcoin treasuries.',
  INTC:'Intel designs and manufactures processors for PCs and servers and is building out a contract chip-making business.',
  BTC:'Bitcoin is the first and largest cryptocurrency: a fixed supply of 21 million coins secured by a global proof-of-work network.',
  ETH:'Ethereum is a programmable blockchain that runs smart contracts, stablecoins, DeFi and NFTs. ETH pays for its transactions.',
  SOL:'Solana is a fast, low-fee blockchain popular for trading, payments and memecoins.',
  XRP:'XRP is the native token of the XRP Ledger, built for quick, cheap cross-border payments.',
  DOGE:'Dogecoin started as a joke in 2013 and became one of the most traded cryptocurrencies, with a large online community.',
  LINK:'Chainlink is an oracle network that brings real-world data like prices onto blockchains for smart contracts.',
  ADA:'Cardano is a proof-of-stake blockchain built with a research-first approach to security and scaling.',
  LTC:'Litecoin is one of the oldest cryptocurrencies, a lighter, faster-confirming cousin of Bitcoin.',
};
