// PROTÓTIPO — Corte 52 "Campo aberto" (opção D). Só simulação. Ver README.md.
// 5 colunas × 6 linhas de casas. Rei e Rainha são casas fixas nas pontas das colunas 2 e 4.
// As cartas andam pelo campo todo e atacam as vizinhas; o Arqueiro também atira a 2 casas.
const CARDS={
  A:{f:1,v:1,name:'Ás'},'2':{f:2,v:2,name:'Espião'},'3':{f:1,v:5,name:'Escudeiro'},'4':{f:2,v:3,name:'Arqueiro'},
  '5':{f:3,v:3,name:'Cavaleiro'},'6':{f:1,v:3,name:'Clérigo'},'7':{f:2,v:3,name:'Mensageiro'},'8':{f:0,v:6,name:'Muralha'},
  '9':{f:1,v:4,name:'Capitão'},'10':{f:2,v:4,name:'Campeão'},J:{f:3,v:2,name:'Valete'},Q:{f:0,v:5,name:'Rainha'},K:{f:0,v:6,name:'Rei'},
};
const DECK=['A','2','3','4','5','6','7','8','9','10','J'];
const TURN_LIMIT=60;
// travas (pacote 2026-10-24): baseLock = na base só corpo a corpo; los = tiro bloqueado por carta no caminho;
// spyInside = Espião só ataca monarca de dentro da zona inimiga. monarchDmg: 'full' (Força) | 'one'.
const RULES={secondBonus:1,fatigue:true,startHand:2,coins0:0,coinsCap:5,second0:2,freeMoves:1,maxMoves:2,moveAll:false,
  thorns:3,wallGuard:false,wallStop:true,monarchDmg:'full',baseLock:true,los:true,spyInside:true,retaliate:true,
  aiAppr:0.35,aiDang:1, // aiAppr/aiDang: pesos da IA (aproximar do monarca / medo de ficar exposta)
  noBackOnKill:false,recycle:false,siege:0,secondUnit:false,entryMid:false,firstNoPlay:false,secondUnitBack:false,homeDef:0,homeAtk:0,spyMid:-1};
// spyMid = Infiltrado: a partir do turno N da partida (0 = sempre, 2 = 2º turno de cada um), o Espião entra também nas casas do meio; -1 = desligado
// homeDef = carta na própria base leva N a menos de dano (mín. 0); homeAtk = carta na própria base causa +N
// firstNoPlay = quem começa não joga carta no 1º turno; secondUnitBack = a carta inicial do 2º entra na linha de trás
// alavancas de equilíbrio: noBackOnKill = carta derrubada não revida; recycle = baralho vazio reembaralha as caídas (em vez da fadiga);
// siege = no início do seu turno, cada carta sua na base inimiga causa N ao monarca inimigo mais perto;
// secondUnit = o 2º jogador começa com 1 carta da mão já na base; entryMid = também joga na linha do meio mais perto
const COST={move:1,draw2:2,order:2,decree:2,sacre:2};
const SPEED={'5':2};

function mkRng(seed){let a=seed>>>0;return ()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function shuffle(a,rng){for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

// grade: coluna c 0..4 e Y dobrado. Colunas ímpares: Y 0..12 (pontas = monarcas); pares: Y 1..11. P0 embaixo, P1 em cima.
const key=(c,Y)=>c+','+Y, parse=k=>k.split(',').map(Number);
const CELLS=[];for(let c=0;c<5;c++)for(let Y=c%2?0:1;Y<=(c%2?12:11);Y+=2)CELLS.push(key(c,Y));
const CELLSET=new Set(CELLS);
const MON={0:{K:key(1,12),Q:key(3,12)},1:{K:key(1,0),Q:key(3,0)}};
const DIRS=[[0,-2],[0,2],[1,-1],[1,1],[-1,-1],[-1,1]];
const NB=Object.fromEntries(CELLS.map(k=>{const [c,Y]=parse(k);return [k,DIRS.map(([a,b])=>key(c+a,Y+b)).filter(x=>CELLSET.has(x))];}));
const dist=(a,b)=>{const [c1,y1]=parse(a),[c2,y2]=parse(b),dc=Math.abs(c1-c2),dy=Math.abs(y1-y2);return dc+Math.max(0,dy-dc)/2;};
const zone=(k,p)=>{const Y=parse(k)[1];return (p===0?Y>=8:Y<=4)?'home':(p===0?Y<=4:Y>=8)?'enemy':'mid';};
const isMon=r=>r==='K'||r==='Q';

function newGame(rng=Math.random,first=0){
  const side=p=>({u:{},deck:shuffle([...DECK],rng),hand:[],out:[],coins:RULES.coins0+(p===first?0:RULES.second0),sacred:false});
  const G={sides:[side(0),side(1)],at:{},turn:first,first,turnNo:0,played:false,winner:null,log:[]};
  for(const p of [0,1]){for(const m of ['K','Q']){G.sides[p].u[m]={dmg:0,pos:MON[p][m]};G.at[MON[p][m]]={p,r:m};}
    for(let i=0;i<RULES.startHand+(p===first?0:RULES.secondBonus);i++)draw(G,p);}
  if(RULES.secondUnit){const p=1-first,S=G.sides[p],r=S.hand.find(x=>CARDS[x].f>0)||S.hand[0],k=homeEmpty(G,p).sort((a,b)=>(RULES.secondUnitBack?-1:1)*(dist(a,MON[first].K)-dist(b,MON[first].K)))[0];
    S.hand.splice(S.hand.indexOf(r),1);S.u[r]={dmg:0,pos:k};G.at[k]={p,r};}
  startTurn(G);return G;
}
const vmax=(S,r)=>CARDS[r].v+(S.u[r].flame||0);
const rem=(S,r)=>vmax(S,r)-S.u[r].dmg;
const forceOf=(S,r)=>CARDS[r].f+(S.u[r]?(S.u[r].flame||0)+(S.u[r].bonus||0):0);
const units=S=>Object.keys(S.u).filter(r=>!isMon(r));
const slotOf=(S,r)=>S.u[r]&&S.u[r].pos;
function draw(G,p,rng=Math.random){const S=G.sides[p];if(!S.deck.length&&RULES.recycle&&S.out.length){S.deck=shuffle(S.out.filter(r=>!isMon(r)),rng);S.out=S.out.filter(isMon);}
  if(S.deck.length){S.hand.push(S.deck.pop());return;}
  if(G.turnNo>0&&RULES.fatigue){const m=['K','Q'].filter(r=>S.u[r]).sort((a,b)=>rem(S,b)-rem(S,a))[0];if(m){G.log.push({t:'fatigue',p,r:m});hurt(G,p,S.u[m].pos,1,'fatigue');}}}
function startTurn(G){
  const p=G.turn,S=G.sides[p];S.coins=Math.min(RULES.coinsCap,S.coins+1);
  for(const r in S.u)Object.assign(S.u[r],{sick:false,att:false,extra:false,moved:false});
  G.played=false;G.moves=0;G.draws=0;G.used={K:false,Q:false};
  const a=S.u.A;if(a&&a.flame){a.flame--;if(a.dmg>=vmax(S,'A'))hurt(G,p,a.pos,0,'flame');}
  if(RULES.siege){const E=G.sides[1-p];for(const r of units(S)){if(G.winner!=null)break;if(!S.u[r]||zone(S.u[r].pos,p)!=='enemy')continue;
    const m=['K','Q'].filter(x=>E.u[x]).sort((x,y)=>dist(S.u[r].pos,E.u[x].pos)-dist(S.u[r].pos,E.u[y].pos))[0];
    if(m){G.log.push({t:'atk',p,r,target:m,n:RULES.siege,siege:true});hurt(G,1-p,E.u[m].pos,RULES.siege,'siege');}}}
  if(G.winner==null&&G.turnNo>0&&!S.deck.length)draw(G,p);
}
const can=(G,p)=>G.turn===p&&G.winner==null;
const canDraw=(G,p)=>can(G,p)&&G.turnNo>0&&G.sides[p].deck.length>0&&(G.draws===0||(G.draws===1&&G.sides[p].coins>=COST.draw2));
function drawAction(G,p){if(!canDraw(G,p))return false;const S=G.sides[p];if(G.draws)S.coins-=COST.draw2;G.draws++;draw(G,p);return true;}
function hurt(G,p,k,n,src){const S=G.sides[p],x=G.at[k];if(!x||x.p!==p)return false;const r=x.r;
  if(RULES.homeDef&&!isMon(r)&&src!=='fatigue'&&src!=='flame'&&zone(k,p)==='home')n=Math.max(0,n-RULES.homeDef);
  S.u[r].dmg=Math.max(0,S.u[r].dmg+n);
  if(S.u[r].dmg>=vmax(S,r)){delete G.at[k];delete S.u[r];S.out.push(r);G.log.push({t:'down',p,r,src});checkWin(G);return true;}return false;}
function checkWin(G){for(const p of [0,1]){const S=G.sides[p];if(!S.u.K&&!S.u.Q&&G.winner==null)G.winner=1-p;}}

// ---------- jogar, mover, atacar ----------
const midRow=(k,p)=>{const Y=parse(k)[1];return p===0?(Y===7||Y===6):(Y===5||Y===6);};
const homeEmpty=(G,p)=>CELLS.filter(k=>!G.at[k]&&(zone(k,p)==='home'||(RULES.entryMid&&midRow(k,p))));
const healTargets=(G,p)=>Object.keys(G.sides[p].u).filter(r=>G.sides[p].u[r].dmg>0&&!isMon(r));
function playOptions(G,p){
  const S=G.sides[p],out=[];if(G.played||!can(G,p)||(RULES.firstNoPlay&&G.turnNo===0))return out;
  for(const r of new Set(S.hand))for(const k of r==='2'&&RULES.spyMid>=0&&G.turnNo>=RULES.spyMid?CELLS.filter(k=>!G.at[k]&&zone(k,p)!=='enemy'):homeEmpty(G,p)){
    if(r==='6'){for(const t of healTargets(G,p))out.push({r,slot:k,target:t});}
    out.push({r,slot:k});}
  return out;
}
function play(G,p,o){const S=G.sides[p];S.hand.splice(S.hand.indexOf(o.r),1);G.played=true;
  S.u[o.r]={dmg:0,pos:o.slot,sick:o.r!=='5',att:false,moved:false};G.at[o.slot]={p,r:o.r};G.log.push({t:'play',p,r:o.r,slot:o.slot});
  if(o.r==='6'&&o.target&&S.u[o.target])S.u[o.target].dmg=Math.max(0,S.u[o.target].dmg-3);
  if(o.r==='7')draw(G,p);}
const moveCost=G=>RULES.moveAll||G.moves<RULES.freeMoves?0:COST.move;
function canMove(G,p,r){const S=G.sides[p],u=S.u[r];
  return can(G,p)&&!!u&&!isMon(r)&&!u.sick&&!u.moved&&!u.att&&(RULES.moveAll||(G.moves<RULES.maxMoves&&S.coins>=moveCost(G)));}
// casas de chegada: anda até SPEED casas vazias; o Espião passa por cima de cartas; vizinha da Muralha inimiga = para ali
function moveTargets(G,p,r){
  if(!canMove(G,p,r))return [];
  const start=G.sides[p].u[r].pos,sp=SPEED[r]||1,seen=new Set([start]),out=new Set();let fr=[start];
  const stops=k=>RULES.wallStop&&NB[k].some(x=>G.at[x]&&G.at[x].p!==p&&G.at[x].r==='8');
  for(let s=0;s<sp;s++){const nx=[];
    for(const k of fr)for(const n of NB[k]){if(seen.has(n))continue;seen.add(n);const o=G.at[n];
      if(o&&!(r==='2'&&!isMon(o.r)))continue;
      if(!o)out.add(n);if(!stops(n))nx.push(n);}
    fr=nx;}
  return [...out];
}
function move(G,p,r,to){if(!moveTargets(G,p,r).includes(to))return false;const S=G.sides[p],u=S.u[r];
  S.coins-=moveCost(G);delete G.at[u.pos];G.at[to]={p,r};G.log.push({t:'move',p,r,from:u.pos,to});u.pos=to;u.moved=true;G.moves++;return true;}
const inBase=(G,p,r)=>zone(G.sides[p].u[r].pos,p)==='home';
function targetsFor(G,p,r){
  const S=G.sides[p],u=S.u[r];if(!u||CARDS[r].f<=0)return [];
  const k=u.pos,enemy=x=>G.at[x]&&G.at[x].p!==p;
  const monOK=r!=='2'||!RULES.spyInside||zone(k,p)==='enemy';
  let t=NB[k].filter(x=>enemy(x)&&(monOK||!isMon(G.at[x].r)));
  // guarda: vizinho de Escudeiro inimigo (ou Muralha, na variante) ataca a guarda primeiro
  const g=NB[k].filter(x=>enemy(x)&&(G.at[x].r==='3'||(RULES.wallGuard&&G.at[x].r==='8')));
  if(g.length)return g;
  if(r==='4'&&!(RULES.baseLock&&inBase(G,p,r))){const [c,Y]=parse(k);
    for(const [a,b] of DIRS){const m=key(c+a,Y+b),f=key(c+2*a,Y+2*b);
      if(!CELLSET.has(f)||(RULES.los&&G.at[m]))continue;if(enemy(f))t.push(f);}}
  return t;
}
function canAttack(G,p,r){const u=G.sides[p].u[r];return can(G,p)&&!!u&&!isMon(r)&&!u.sick&&!u.att&&targetsFor(G,p,r).length>0;}
const dmgOf=(G,p,r)=>{const S=G.sides[p],k=S.u[r].pos;return forceOf(S,r)+(RULES.homeAtk&&zone(k,p)==='home'?RULES.homeAtk:0)+(r!=='9'&&NB[k].some(x=>G.at[x]&&G.at[x].p===p&&G.at[x].r==='9')?1:0);};
function backOf(G,p,r,t){const S=G.sides[p],E=G.sides[1-p],tr=G.at[t].r;
  if(dist(S.u[r].pos,t)>1)return 0; // tiro à distância: sem revide
  if(r==='2'&&!(RULES.baseLock&&inBase(G,p,r)))return 0;
  if(tr==='8')return RULES.thorns;
  return RULES.retaliate?CARDS[tr].f+(E.u[tr].flame||0):0;}
function attack(G,p,r,t){const S=G.sides[p],tr=G.at[t].r,m=isMon(tr),d=dmgOf(G,p,r),n=m&&RULES.monarchDmg==='one'?1:d;
  const back=backOf(G,p,r,t);S.u[r].att=true;G.log.push({t:'atk',p,r,target:tr,n});
  const killed=hurt(G,1-p,t,n,r);
  if(back>0&&!(killed&&RULES.noBackOnKill)&&S.u[r]&&hurt(G,p,S.u[r].pos,back,tr))return;
  if(killed&&r==='J'&&S.u.J&&!S.u.J.extra){S.u.J.extra=true;S.u.J.att=false;}}
// poderes do Trono
const royal=(G,p,m,c)=>can(G,p)&&!!G.sides[p].u[m]&&!G.used[m]&&G.sides[p].coins>=c;
const canSacre=(G,p)=>royal(G,p,'K',COST.sacre)&&!G.sides[p].sacred&&!!G.sides[p].u.A;
function sacre(G,p){if(!canSacre(G,p))return false;const S=G.sides[p];S.coins-=COST.sacre;S.sacred=true;G.used.K=true;S.u.A.flame=2;return true;}
const canOrder=(G,p,r)=>{const u=G.sides[p].u[r];return royal(G,p,'K',COST.order)&&!!u&&!isMon(r)&&CARDS[r].f>0&&!u.sick&&!u.att&&!u.bonus;};
function order(G,p,r){if(!canOrder(G,p,r))return false;const S=G.sides[p];S.coins-=COST.order;G.used.K=true;S.u[r].bonus=1;return true;}
function decree(G,p,o){const S=G.sides[p];if(!royal(G,p,'Q',COST.decree))return false;S.coins-=COST.decree;G.used.Q=true;
  if(o.draw)draw(G,p);else S.u[o.heal].dmg=Math.max(0,S.u[o.heal].dmg-2);return true;}
function endTurn(G){if(G.winner!=null)return;for(const r in G.sides[G.turn].u)delete G.sides[G.turn].u[r].bonus;
  G.turnNo++;
  if(G.turnNo>=TURN_LIMIT){const m=p=>['K','Q'].reduce((t,r)=>t+(G.sides[p].u[r]?rem(G.sides[p],r):0),0);const a=m(0),b=m(1);G.winner=a>b?0:b>a?1:-1;return;}
  G.turn=1-G.turn;startTurn(G);}

// ---------- IA local ----------
function valueOf(r){return {A:3,'2':3,'3':3,'4':3,'5':3.5,'6':3,'7':3.5,'8':3.5,'9':4,'10':5,J:4.5,K:20,Q:20}[r];}
function atkScore(G,p,r,t){const S=G.sides[p],E=G.sides[1-p],tr=G.at[t].r,m=isMon(tr),d=m&&RULES.monarchDmg==='one'?1:dmgOf(G,p,r),k=d>=rem(E,tr),back=backOf(G,p,r,t);
  return (k?valueOf(tr)+3:d*0.5)+(m?3+d:0)-(back>=rem(S,r)&&!k?valueOf(r)*0.6:back*0.15);}
// alvo de aproximação: monarca inimigo mais perto; tanques e quem está em casa protegem contra invasores
function approach(G,p,r,k){const E=G.sides[1-p];
  const mons=['K','Q'].filter(m=>E.u[m]).map(m=>dist(k,E.u[m].pos));
  const inv=units(E).filter(x=>zone(E.u[x].pos,p)==='home').map(x=>dist(k,E.u[x].pos)*(r==='8'||r==='3'?0.6:0.9));
  return Math.min(99,...mons,...inv);}
function danger(G,p,r,k){const S=G.sides[p],E=G.sides[1-p];let sum=0;
  for(const x of units(E)){const e=E.u[x];if(CARDS[x].f<=0)continue;const reach=(SPEED[x]||1)+1+(x==='4'?1:0);if(dist(e.pos,k)<=reach)sum+=forceOf(E,x);}
  return sum>=rem(S,r)?valueOf(r)*0.6:sum*0.12;}
// avalia ficar em k: melhor ataque de lá + aproximação − perigo
function spot(G,p,r,k){const S=G.sides[p],u=S.u[r],from=u.pos;
  if(k!==from){delete G.at[from];G.at[k]={p,r};u.pos=k;}
  const att=u.sick||u.att?0:Math.max(0,...targetsFor(G,p,r).map(t=>atkScore(G,p,r,t)));
  const sc=att-approach(G,p,r,k)*RULES.aiAppr-danger(G,p,r,k)*RULES.aiDang+(RULES.siege&&zone(k,p)==='enemy'?1.5*RULES.siege:0);
  if(k!==from){delete G.at[k];G.at[from]={p,r};u.pos=from;}
  return sc;}
function aiPlay(G,p,rng){const S=G.sides[p],opts=playOptions(G,p);if(!opts.length)return null;let best=null,bs=-1e9;
  for(const o of opts){let sc=valueOf(o.r)*0.2+rng()*0.3-approach(G,p,o.r,o.slot)*0.15;
    if((o.r==='8'||o.r==='3')){const own=['K','Q'].filter(m=>S.u[m]).map(m=>dist(o.slot,S.u[m].pos));sc+=own.length?2-Math.min(...own)*0.5:0;}
    if(o.r==='6')sc+=o.target?Math.min(3,S.u[o.target].dmg)*0.6:-0.5;
    if(o.r==='7')sc+=S.deck.length?0.6:-1;
    if(o.r==='A')sc+=S.sacred||!S.u.K?-1:0.3;
    if(sc>bs){bs=sc;best=o;}}
  return best;}
function aiUnits(G,p,rng){const S=G.sides[p];
  const order_=units(S).sort((a,b)=>forceOf(S,b)-forceOf(S,a));
  for(const r of order_){if(G.winner!=null)return;if(!S.u[r])continue;const u=S.u[r];
    const here=spot(G,p,r,u.pos);let best=u.pos,bs=here;
    for(const k of moveTargets(G,p,r)){const sc=spot(G,p,r,k)-(moveCost(G)?1.2:0)+rng()*0.05;if(sc>bs+0.15){bs=sc;best=k;}}
    if(best!==u.pos)move(G,p,r,best);
    for(let n=0;n<2&&S.u[r]&&canAttack(G,p,r)&&G.winner==null;n++){
      const ts=targetsFor(G,p,r).map(t=>[t,atkScore(G,p,r,t)]).sort((a,b)=>b[1]-a[1]);
      if(!ts.length||ts[0][1]<0)break;
      if(canOrder(G,p,r)&&rem(G.sides[1-p],G.at[ts[0][0]].r)===dmgOf(G,p,r)+1)order(G,p,r);
      attack(G,p,r,ts[0][0]);}
  }}
function aiTurn(G,p,rng,choice){const S=G.sides[p]; // choice: jogada já decidida fora do motor (null = não jogar)
  if(G.draws===0&&canDraw(G,p))drawAction(G,p);
  const o=choice===undefined?aiPlay(G,p,rng):choice;if(o)play(G,p,o);
  if(canSacre(G,p)&&!S.u.A.sick)sacre(G,p);
  aiUnits(G,p,rng);if(G.winner!=null)return;
  const h=healTargets(G,p).map(r=>({r,d:S.u[r].dmg})).sort((a,b)=>b.d-a.d)[0];
  if(h&&h.d>=2)decree(G,p,{heal:h.r});else if(!S.hand.length&&S.deck.length)decree(G,p,{draw:true});
  if(S.coins>=4&&S.hand.length<=1&&canDraw(G,p))drawAction(G,p);}
if(typeof module!=='undefined')module.exports={RULES,CARDS,COST,CELLS,NB,MON,dist,zone,newGame,playOptions,play,moveTargets,move,targetsFor,canAttack,attack,endTurn,aiTurn,mkRng,rem,units,slotOf,TURN_LIMIT,key};
