import { useState, useRef, useEffect } from "react";

// ── Design tokens ──────────────────────────────────────────────────────────
const T = {
  bg:       "#F7F7F5",
  surface:  "#FFFFFF",
  border:   "#EBEBEB",
  text:     "#1A1A1A",
  sub:      "#6B6B6B",
  muted:    "#ABABAB",
  andee:    "#6C63FF",
  donny:    "#2ABFBF",
  urgent:   "#E8534A",
  warn:     "#F5A623",
  green:    "#34A853",
  accent:   "#6C63FF",
};

// USERS is now dynamic — built from members state in main app
// Components receive `members` prop or use this fallback for seed render
const MEMBER_COLORS = [
  "#6C63FF","#2ABFBF","#F5A623","#E8534A","#34A853",
  "#C17A7A","#8B5CF6","#0EA5E9","#F59E0B","#10B981",
];
function makeInitial(name){ return (name||"?").trim().charAt(0).toUpperCase(); }
const SEED_MEMBERS = [
  { id:"andee", name:"Andee", color:"#6C63FF" },
  { id:"donny", name:"Donny", color:"#2ABFBF" },
];
// Legacy lookup used in places before members prop is threaded
function getUser(members, id){
  return members.find(m=>m.id===id) || { name:id, color:T.muted, id };
}

// ── Seed data ──────────────────────────────────────────────────────────────
const SEED_TASKS = [
  { id:1,  title:"SimplyMeno content plan",       owner:"andee", deadline:"2026-06-20", priority:"high",   done:false, tags:["work"] },
  { id:2,  title:"Car insurance renewal",          owner:"donny", deadline:"2026-06-18", priority:"high",   done:false, tags:["finance"] },
  { id:3,  title:"Grocery run",                    owner:"andee", deadline:"2026-06-17", priority:"medium", done:false, tags:["home"] },
  { id:4,  title:"Call electrician",               owner:"donny", deadline:"2026-06-19", priority:"medium", done:false, tags:["home"] },
  { id:5,  title:"Monthly budget review",          owner:"andee", deadline:"2026-06-30", priority:"low",    done:false, tags:["finance"] },
  { id:6,  title:"Schedule date night",            owner:"donny", deadline:"2026-06-22", priority:"medium", done:false, tags:["us"] },
  { id:7,  title:"Vet appointment — Max",          owner:"andee", deadline:"2026-06-25", priority:"high",   done:false, tags:["home"] },
  { id:8,  title:"Review AAHA financials",         owner:"andee", deadline:"2026-06-28", priority:"medium", done:false, tags:["work"] },
  { id:9,  title:"Fix back porch light",           owner:"donny", deadline:"2026-06-24", priority:"low",    done:false, tags:["home"] },
  { id:10, title:"Plan July 4th",                  owner:"donny", deadline:"2026-06-29", priority:"medium", done:false, tags:["us"] },
];
const SEED_GOALS = [
  { id:1, title:"Buy our first home",          owner:"shared", category:"financial", progress:35, emoji:"🏠", target:"Dec 2026",    notes:"Down payment savings on track" },
  { id:2, title:"Trip to Mexico",              owner:"shared", category:"travel",    progress:20, emoji:"✈️", target:"Spring 2027", notes:"Research Tulum & Oaxaca" },
  { id:3, title:"Launch SimplyMeno app",       owner:"andee",  category:"career",    progress:60, emoji:"🚀", target:"Sep 2026",    notes:"v3 done, App Store next!" },
  { id:4, title:"Run a 5K",                   owner:"donny",  category:"health",    progress:45, emoji:"🏃", target:"Aug 2026",    notes:"Training 3× per week" },
  { id:5, title:"6-month emergency fund",      owner:"shared", category:"financial", progress:70, emoji:"💰", target:"Oct 2026",    notes:"$8,400 of $12,000 saved" },
  { id:6, title:"Cook 10 new meals together",  owner:"shared", category:"lifestyle", progress:50, emoji:"🍳", target:"Dec 2026",    notes:"5 down, 5 to go!" },
];
const SEED_MSGS = [
  { id:1, from:"donny", text:"Can you add the vet appointment?",     ts:"9:14 AM" },
  { id:2, from:"andee", text:"Done! Car insurance is due soon too.", ts:"9:20 AM" },
  { id:3, from:"donny", text:"Budget review Sunday?",                ts:"9:22 AM" },
];

// ── Helpers ────────────────────────────────────────────────────────────────
const TODAY = new Date(2026,5,15);
function daysUntil(d){ return Math.ceil((new Date(d)-TODAY)/86400000); }
function urgencyColor(d){ return d<0?T.urgent:d<=2?T.urgent:d<=5?T.warn:T.green; }
function fmtDate(s){ return new Date(s).toLocaleDateString("en-US",{month:"short",day:"numeric"}); }
function getDaysInMonth(y,m){ return new Date(y,m+1,0).getDate(); }
function getFirstDOW(y,m){ return new Date(y,m,1).getDay(); }


// ── Notification system ────────────────────────────────────────────────────
async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/weflow-sw.js", { scope: "/" });
  } catch { return null; }
}

async function requestNotifPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return await Notification.requestPermission();
}

async function cacheTasksForSW(tasks) {
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open("weflow-v3");
    await cache.put("/weflow-tasks.json",
      new Response(JSON.stringify(tasks), { headers: {"Content-Type":"application/json"} }));
  } catch {}
}

function fireUrgentNotifs(tasks) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const today = new Date(); today.setHours(0,0,0,0);
  const overdue  = tasks.filter(t => !t.done && new Date(new Date(t.deadline).setHours(0,0,0,0)) < today.getTime());
  const dueToday = tasks.filter(t => {
    if (t.done) return false;
    const d = new Date(t.deadline); d.setHours(0,0,0,0);
    return d.getTime() === today.getTime();
  });
  if (overdue.length)
    new Notification("⚠️ WeFlow — Overdue", { body: overdue.map(t=>t.title).join(", "), icon:"/icon-192.png", tag:"wf-overdue" });
  if (dueToday.length)
    new Notification("📅 WeFlow — Due Today", { body: dueToday.map(t=>t.title).join(", "), icon:"/icon-192.png", tag:"wf-today" });
}

// ── Notifications settings panel ───────────────────────────────────────────
function NotifSettings({ tasks }) {
  const [perm, setPerm] = useState(() => {
    if (typeof window==="undefined"||!("Notification" in window)) return "unsupported";
    return Notification.permission;
  });
  const [testing, setTesting] = useState(false);
  const [swOk, setSwOk] = useState(false);

  useEffect(() => {
    registerSW().then(reg => setSwOk(!!reg));
  }, []);

  async function enable() {
    const result = await requestNotifPermission();
    setPerm(result);
    if (result === "granted") {
      await cacheTasksForSW(tasks);
      new Notification("✅ WeFlow Notifications On", {
        body: "You\'ll get deadline alerts on this device.",
        icon: "/icon-192.png", tag: "wf-setup",
      });
    }
  }

  async function test() {
    setTesting(true);
    await cacheTasksForSW(tasks);
    fireUrgentNotifs(tasks);
    if (!tasks.some(t => !t.done)) {
      new Notification("✅ WeFlow", { body: "Notifications are working! No urgent tasks right now.", icon:"/icon-192.png", tag:"wf-test" });
    }
    setTimeout(() => setTesting(false), 2000);
  }

  const STATUS = {
    granted:     { icon:"✅", label:"Enabled",     color:"#34A853", desc:"You\'ll receive deadline alerts on this device." },
    denied:      { icon:"🚫", label:"Blocked",      color:"#E8534A", desc:"Notifications are blocked. Open Chrome Settings → Site Settings → Notifications to unblock WeFlow." },
    default:     { icon:"🔔", label:"Not set up",   color:"#F5A623", desc:"Tap Enable below to get deadline alerts on your lock screen." },
    unsupported: { icon:"❓", label:"Unsupported",  color:"#ABABAB", desc:"Your browser doesn\'t support notifications. Try Chrome on Android." },
  };
  const s = STATUS[perm] || STATUS.default;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Status card */}
      <div style={{...card, border:`1px solid ${s.color}30`, padding:"20px 18px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
          <span style={{fontSize:28}}>{s.icon}</span>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:T.text}}>{s.label}</div>
            <div style={{fontSize:12,color:s.color,fontWeight:600}}>Notifications</div>
          </div>
        </div>
        <div style={{fontSize:13,color:T.sub,lineHeight:1.6,marginBottom:14}}>{s.desc}</div>
        {perm === "default" && (
          <button onClick={enable} style={{width:"100%",padding:"13px 0",borderRadius:11,
            background:T.accent,border:"none",color:"#fff",fontWeight:700,fontSize:15,
            cursor:"pointer",fontFamily:"inherit"}}>
            Enable notifications
          </button>
        )}
        {perm === "granted" && (
          <button onClick={test} disabled={testing} style={{width:"100%",padding:"12px 0",borderRadius:11,
            background:T.bg,border:`1px solid ${T.border}`,color:T.sub,fontWeight:600,fontSize:14,
            cursor:"pointer",fontFamily:"inherit",opacity:testing?.6:1}}>
            {testing ? "Sending…" : "Send a test notification"}
          </button>
        )}
      </div>

      {/* How it works */}
      <div style={card}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>How it works</div>
        {[
          ["🔔","Deadline today",    "You get an alert at 8am on the day something is due"],
          ["⚠️","Overdue tasks",     "Instant alert when you open WeFlow if anything is overdue"],
          ["📅","2 days before",     "A heads-up 2 days ahead for high priority items"],
          ["📲","Lock screen",       "Alerts appear on your Android lock screen like any other app"],
        ].map(([icon,title,desc],i,arr)=>(
          <div key={i} style={{display:"flex",gap:12,padding:"11px 0",
            borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
            <span style={{fontSize:20,flexShrink:0}}>{icon}</span>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:T.text}}>{title}</div>
              <div style={{fontSize:12,color:T.sub,marginTop:2}}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* SW status */}
      <div style={{...card,padding:"12px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,color:T.sub}}>Background service</span>
          <span style={{fontSize:12,fontWeight:600,color:swOk?T.green:T.warn}}>
            {swOk ? "● Running" : "○ Not registered"}
          </span>
        </div>
        <div style={{fontSize:11,color:T.muted,marginTop:4}}>
          {swOk ? "Service worker active — notifications will work even when WeFlow is closed."
                : "Add weflow-sw.js to your Vercel project to enable background notifications."}
        </div>
      </div>

      {/* Android setup tip */}
      <div style={{...card,background:"#F0F7FF",border:"1px solid #BFDBFE",padding:"14px 16px"}}>
        <div style={{fontSize:12,fontWeight:700,color:"#1D4ED8",marginBottom:6}}>📱 Android setup tip</div>
        <div style={{fontSize:12,color:"#1E40AF",lineHeight:1.6}}>
          For the best experience: open WeFlow in Chrome → tap the menu (⋮) → "Add to Home Screen". 
          Then enable notifications once. Both Andee and Donny do this on their own phones.
        </div>
      </div>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────
const card = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:"16px 18px" };
const inputSt = { width:"100%", background:T.bg, border:`1.5px solid ${T.border}`, borderRadius:10,
  padding:"10px 14px", color:T.text, fontSize:14, outline:"none", boxSizing:"border-box",
  fontFamily:"inherit" };

// ── Atoms ──────────────────────────────────────────────────────────────────
function Avatar({ user, size=32, members=SEED_MEMBERS }) {
  const u = members.find(m=>m.id===user) || { name:user||"?", color:T.muted };
  const initial = makeInitial(u.name);
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:u.color+"18",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:size*.38, fontWeight:700, color:u.color, flexShrink:0, letterSpacing:"-0.5px" }}>
      {initial}
    </div>
  );
}

function Chip({ label, color=T.muted }) {
  return (
    <span style={{ fontSize:11, fontWeight:500, padding:"2px 8px", borderRadius:99,
      background:color+"14", color:color, letterSpacing:"0.02em" }}>{label}</span>
  );
}

function PillBadge({ children, color=T.accent }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:11,
      fontWeight:600, color, background:color+"12", padding:"3px 10px", borderRadius:99 }}>
      {children}
    </span>
  );
}

function ProgressBar({ value, color=T.accent, height=4 }) {
  return (
    <div style={{ height, background:T.border, borderRadius:99, overflow:"hidden" }}>
      <div style={{ height:"100%", width:`${Math.min(100,value)}%`, background:color,
        borderRadius:99, transition:"width .4s ease" }}/>
    </div>
  );
}

function Divider() {
  return <div style={{ height:1, background:T.border, margin:"4px 0" }}/>;
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize:11, fontWeight:600, color:T.muted, textTransform:"uppercase",
      letterSpacing:"0.08em", marginBottom:10 }}>{children}</div>
  );
}

// ── Notification strip ─────────────────────────────────────────────────────
function NotifStrip({ tasks }) {
  const urgent = tasks.filter(t=>!t.done&&daysUntil(t.deadline)<=1);
  if(!urgent.length) return null;
  return (
    <div style={{ background:"#FFF5F4", borderBottom:`1px solid #FDDAD8`,
      padding:"9px 18px", display:"flex", alignItems:"center", gap:8 }}>
      <span style={{ fontSize:14 }}>⏰</span>
      <span style={{ fontSize:12, fontWeight:600, color:T.urgent }}>
        {urgent.length} due {urgent[0]&&daysUntil(urgent[0].deadline)<0?"overdue":"today"}:
      </span>
      <span style={{ fontSize:12, color:"#C0453E", flex:1,
        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
        {urgent.map(t=>t.title).join(", ")}
      </span>
    </div>
  );
}

// ── Task row (minimal) ─────────────────────────────────────────────────────
function TaskRow({ task, onToggle, onDelete }) {
  const d=daysUntil(task.deadline), uc=urgencyColor(d);
  const label = d<0?"Overdue":d===0?"Today":d===1?"Tomorrow":`${d}d`;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 0",
      borderBottom:`1px solid ${T.border}`, opacity:task.done?.45:1 }}>
      <button onClick={()=>onToggle(task.id)} style={{ width:22, height:22, borderRadius:6,
        border:`1.5px solid ${task.done?T.andee:T.border}`,
        background:task.done?T.andee:"transparent",
        cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
        transition:"all .15s" }}>
        {task.done&&<svg width="11" height="8" fill="none" viewBox="0 0 11 8">
          <path d="M1 4l3 3 6-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>}
      </button>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, color:T.text, fontWeight:500,
          textDecoration:task.done?"line-through":"none",
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{task.title}</div>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:3 }}>
          <span style={{ fontSize:12, color:uc, fontWeight:500 }}>{fmtDate(task.deadline)}</span>
          <span style={{ fontSize:11, color:uc, background:uc+"12",
            padding:"1px 7px", borderRadius:99, fontWeight:600 }}>{label}</span>
          {(task.tags||[]).slice(0,1).map(t=><Chip key={t} label={t} color={T.muted}/>)}
        </div>
      </div>
      <Avatar user={task.owner} size={26} members={members}/>
      <button onClick={()=>onDelete(task.id)} style={{ background:"none", border:"none",
        color:T.muted, cursor:"pointer", fontSize:16, lineHeight:1, padding:"0 2px",
        opacity:.5 }}>×</button>
    </div>
  );
}

// ── Add task modal ─────────────────────────────────────────────────────────
function AddTaskModal({ onAdd, onClose }) {
  const [form,setForm]=useState({title:"",owner:"andee",deadline:"",priority:"medium",tags:""});
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  function submit(){
    if(!form.title.trim()||!form.deadline)return;
    onAdd({id:Date.now(),...form,done:false,
      tags:form.tags?form.tags.split(",").map(t=>t.trim()).filter(Boolean):[]});
    onClose();
  }
  const PRIO = [{k:"low",label:"Low",c:T.green},{k:"medium",label:"Medium",c:T.warn},{k:"high",label:"High",c:T.urgent}];
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.25)",display:"flex",
      alignItems:"flex-end",justifyContent:"center",zIndex:200}} onClick={onClose}>
      <div style={{background:T.surface,borderRadius:"20px 20px 0 0",padding:"24px 20px 32px",
        width:"100%",maxWidth:480,display:"flex",flexDirection:"column",gap:16}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:17,fontWeight:700,color:T.text}}>Add activity</span>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,color:T.muted,cursor:"pointer"}}>×</button>
        </div>
        <input value={form.title} onChange={e=>f("title",e.target.value)}
          placeholder="What needs to get done?" style={inputSt} autoFocus/>
        <div>
          <SectionLabel>Assigned to</SectionLabel>
          <div style={{display:"flex",gap:8}}>
            {Object.entries(USERS).map(([k,u])=>(
              <button key={k} onClick={()=>f("owner",k)} style={{flex:1,padding:"9px 0",borderRadius:10,
                cursor:"pointer",border:`1.5px solid ${form.owner===k?u.color:T.border}`,
                background:form.owner===k?u.color+"10":T.surface,
                color:form.owner===k?u.color:T.sub,fontWeight:600,fontSize:14,fontFamily:"inherit"}}>
                {u.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <SectionLabel>Deadline</SectionLabel>
          <input type="date" value={form.deadline} onChange={e=>f("deadline",e.target.value)} style={inputSt}/>
        </div>
        <div>
          <SectionLabel>Priority</SectionLabel>
          <div style={{display:"flex",gap:8}}>
            {PRIO.map(({k,label,c})=>(
              <button key={k} onClick={()=>f("priority",k)} style={{flex:1,padding:"8px 0",borderRadius:10,
                cursor:"pointer",border:`1.5px solid ${form.priority===k?c:T.border}`,
                background:form.priority===k?c+"10":T.surface,
                color:form.priority===k?c:T.sub,fontWeight:600,fontSize:13,fontFamily:"inherit"}}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <input value={form.tags} onChange={e=>f("tags",e.target.value)}
          placeholder="Tags — home, work, finance…" style={inputSt}/>
        <button onClick={submit} disabled={!form.title.trim()||!form.deadline} style={{
          padding:"14px 0",borderRadius:12,background:form.title.trim()&&form.deadline?T.accent:T.border,
          border:"none",color:form.title.trim()&&form.deadline?"#fff":T.muted,
          fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit",transition:"background .2s"}}>
          Save activity
        </button>
      </div>
    </div>
  );
}

// ── Focus tab ──────────────────────────────────────────────────────────────
function FocusTab({ tasks, goals, activeUser, members=SEED_MEMBERS }) {
  const hour = 9; // demo
  const greeting = hour<12?"Good morning":"Good afternoon";
  const myTop = tasks.filter(t=>!t.done&&t.owner===activeUser)
    .sort((a,b)=>new Date(a.deadline)-new Date(b.deadline)).slice(0,3);
  const partnerKey = members.find(m=>m.id!==activeUser)?.id || (activeUser==="andee"?"donny":"andee");
  const partnerTop = tasks.filter(t=>!t.done&&t.owner===partnerKey)
    .sort((a,b)=>new Date(a.deadline)-new Date(b.deadline)).slice(0,3);
  const sharedGoals = goals.filter(g=>g.owner==="shared").slice(0,2);
  const overdue = tasks.filter(t=>!t.done&&daysUntil(t.deadline)<0).length;
  const done = tasks.filter(t=>t.done).length;
  const total = tasks.filter(t=>!t.done).length;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Greeting card */}
      <div style={{...card, background:`linear-gradient(135deg,${T.andee}08,${T.donny}08)`,
        border:`1px solid ${T.andee}20`, padding:"22px 20px"}}>
        <div style={{fontSize:22,fontWeight:300,color:T.text,letterSpacing:"-0.5px",marginBottom:2}}>
          {greeting},
        </div>
        <div style={{fontSize:28,fontWeight:700,color:T.text,letterSpacing:"-1px",marginBottom:14}}>
          {members.find(m=>m.id===activeUser)?.name||activeUser} 👋
        </div>
        <div style={{display:"flex",gap:20}}>
          {[
            {val:total,  label:"active",  color:T.text},
            {val:overdue,label:"overdue", color:T.urgent},
            {val:done,   label:"done",    color:T.green},
          ].map((s,i)=>(
            <div key={i}>
              <div style={{fontSize:24,fontWeight:700,color:s.color,lineHeight:1}}>{s.val}</div>
              <div style={{fontSize:11,color:T.muted,marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* My top 3 */}
      <div style={card}>
        <SectionLabel>Your focus today</SectionLabel>
        {myTop.length===0&&(
          <div style={{color:T.muted,fontSize:14,padding:"8px 0"}}>You're all caught up! 🎉</div>
        )}
        {myTop.map((t,i)=>{
          const d=daysUntil(t.deadline),uc=urgencyColor(d);
          const label=d<0?"Overdue":d===0?"Today":d===1?"Tomorrow":`${d}d`;
          return (
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:12,
              padding:"11px 0",borderBottom:i<myTop.length-1?`1px solid ${T.border}`:"none"}}>
              <div style={{width:26,height:26,borderRadius:8,background:T.accent+"12",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:12,fontWeight:700,color:T.accent,flexShrink:0}}>{i+1}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:500,color:T.text}}>{t.title}</div>
                <div style={{fontSize:12,color:uc,marginTop:1}}>{fmtDate(t.deadline)} · {label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Partner's top 3 */}
      <div style={card}>
        <SectionLabel>{members.find(m=>m.id===partnerKey)?.name||partnerKey}'s focus</SectionLabel>
        {partnerTop.length===0&&(
          <div style={{color:T.muted,fontSize:14,padding:"8px 0"}}>All caught up! 🎉</div>
        )}
        {partnerTop.map((t,i)=>{
          const d=daysUntil(t.deadline),uc=urgencyColor(d);
          const label=d<0?"Overdue":d===0?"Today":d===1?"Tomorrow":`${d}d`;
          return (
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:12,
              padding:"11px 0",borderBottom:i<partnerTop.length-1?`1px solid ${T.border}`:"none"}}>
              <Avatar user={partnerKey} size={26} members={members}/>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:500,color:T.text}}>{t.title}</div>
                <div style={{fontSize:12,color:uc,marginTop:1}}>{fmtDate(t.deadline)} · {label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Shared goals snapshot */}
      {sharedGoals.length>0&&(
        <div style={card}>
          <SectionLabel>Shared goals</SectionLabel>
          {sharedGoals.map((g,i)=>(
            <div key={g.id} style={{padding:"10px 0",
              borderBottom:i<sharedGoals.length-1?`1px solid ${T.border}`:"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:7}}>
                <span style={{fontSize:18}}>{g.emoji}</span>
                <span style={{fontSize:14,fontWeight:500,color:T.text,flex:1}}>{g.title}</span>
                <span style={{fontSize:12,fontWeight:700,color:T.accent}}>{g.progress}%</span>
              </div>
              <ProgressBar value={g.progress} color={T.accent}/>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tasks tab ──────────────────────────────────────────────────────────────
function TasksTab({ tasks, setTasks, onShowAdd, members=SEED_MEMBERS, activeUser="andee" }) {
  const [filter,setFilter]=useState("all");
  const filtered = tasks
    .filter(t=>filter==="all"||t.owner===filter)
    .sort((a,b)=>new Date(a.deadline)-new Date(b.deadline));
  function toggle(id){ setTasks(ts=>ts.map(t=>t.id===id?{...t,done:!t.done}:t)); }
  function del(id){ setTasks(ts=>ts.filter(t=>t.id!==id)); }
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",gap:4,background:T.surface,border:`1px solid ${T.border}`,
          borderRadius:10,padding:3}}>
          {[{id:"all",name:"All"},...members].map(m=>(
            <button key={m.id} onClick={()=>setFilter(m.id)} style={{padding:"5px 10px",borderRadius:7,
              border:"none",background:filter===m.id?T.bg:"transparent",
              color:filter===m.id?T.text:T.muted,fontSize:12,fontWeight:filter===m.id?600:400,
              cursor:"pointer",transition:"all .15s",fontFamily:"inherit",whiteSpace:"nowrap"}}>{m.name}</button>
          ))}
        </div>
        <button onClick={onShowAdd} style={{display:"flex",alignItems:"center",gap:5,
          background:T.accent,border:"none",borderRadius:10,padding:"8px 14px",
          color:"#fff",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
          <span style={{fontSize:16,lineHeight:1}}>+</span> Add
        </button>
      </div>
      <div style={card}>
        {filtered.length===0&&(
          <div style={{color:T.muted,fontSize:14,padding:"16px 0",textAlign:"center"}}>
            Nothing here — add something above
          </div>
        )}
        {filtered.map(t=>(
          <TaskRow key={t.id} task={t} onToggle={toggle} onDelete={del}/>
        ))}
        {filtered.length>0&&<div style={{height:4}}/>}
      </div>
    </div>
  );
}

// ── Calendar tab ───────────────────────────────────────────────────────────
function CalendarTab({ tasks, members=SEED_MEMBERS }) {
  const [mode,setMode]=useState("month");
  const [year,setYear]=useState(2026);
  const [month,setMonth]=useState(5);
  const [weekStart,setWeekStart]=useState(new Date(2026,5,14));
  const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
  const WDAYS=["Su","Mo","Tu","We","Th","Fr","Sa"];

  function tasksOn(y,m,d){
    const ds=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    return tasks.filter(t=>t.deadline===ds&&!t.done);
  }
  function prevMonth(){ month===0?(setMonth(11),setYear(y=>y-1)):setMonth(m=>m-1); }
  function nextMonth(){ month===11?(setMonth(0),setYear(y=>y+1)):setMonth(m=>m+1); }
  function prevWeek(){ setWeekStart(d=>{const n=new Date(d);n.setDate(n.getDate()-7);return n;}); }
  function nextWeek(){ setWeekStart(d=>{const n=new Date(d);n.setDate(n.getDate()+7);return n;}); }

  const weekDays=Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(d.getDate()+i);return d;});
  const cells=[];
  for(let i=0;i<getFirstDOW(year,month);i++) cells.push(null);
  for(let d=1;d<=getDaysInMonth(year,month);d++) cells.push(d);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* Mode + nav */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",gap:4,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:3}}>
          {["month","week"].map(m=>(
            <button key={m} onClick={()=>setMode(m)} style={{padding:"5px 12px",borderRadius:7,border:"none",
              background:mode===m?T.bg:"transparent",color:mode===m?T.text:T.muted,
              fontSize:12,fontWeight:mode===m?600:400,cursor:"pointer",textTransform:"capitalize",fontFamily:"inherit"}}>{m}</button>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={mode==="month"?prevMonth:prevWeek} style={{width:30,height:30,borderRadius:8,
            border:`1px solid ${T.border}`,background:T.surface,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",color:T.sub}}>‹</button>
          <span style={{fontSize:13,fontWeight:600,color:T.text,minWidth:120,textAlign:"center"}}>
            {mode==="month"?`${MONTHS[month]} ${year}`
              :`${weekDays[0].toLocaleDateString("en-US",{month:"short",day:"numeric"})} – ${weekDays[6].toLocaleDateString("en-US",{month:"short",day:"numeric"})}`}
          </span>
          <button onClick={mode==="month"?nextMonth:nextWeek} style={{width:30,height:30,borderRadius:8,
            border:`1px solid ${T.border}`,background:T.surface,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",color:T.sub}}>›</button>
        </div>
      </div>

      {/* Day headers */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {WDAYS.map(d=>(
          <div key={d} style={{textAlign:"center",fontSize:11,color:T.muted,fontWeight:600,padding:"4px 0"}}>{d}</div>
        ))}
      </div>

      {/* Month grid */}
      {mode==="month"&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
          {cells.map((day,i)=>{
            if(!day) return <div key={`e${i}`}/>;
            const isToday=year===2026&&month===5&&day===15;
            const dt=tasksOn(year,month,day);
            return (
              <div key={day} style={{background:isToday?T.accent:T.surface,
                border:`1px solid ${isToday?T.accent:T.border}`,borderRadius:9,
                padding:"6px 5px",minHeight:58}}>
                <div style={{fontSize:12,fontWeight:isToday?700:400,
                  color:isToday?"#fff":T.sub,marginBottom:3,textAlign:"center"}}>{day}</div>
                {dt.slice(0,2).map(t=>(
                  <div key={t.id} style={{fontSize:9,background:(members.find(m=>m.id===t.owner)||{color:T.muted}).color+"18",
                    color:(members.find(m=>m.id===t.owner)||{color:T.muted}).color,borderRadius:4,padding:"1px 4px",marginBottom:2,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:500}}>
                    {t.title}
                  </div>
                ))}
                {dt.length>2&&<div style={{fontSize:9,color:T.muted,textAlign:"center"}}>+{dt.length-2}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Week grid */}
      {mode==="week"&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {weekDays.map((date,i)=>{
            const isToday=date.getFullYear()===2026&&date.getMonth()===5&&date.getDate()===15;
            const dt=tasksOn(date.getFullYear(),date.getMonth(),date.getDate());
            return (
              <div key={i} style={{background:T.surface,border:`1px solid ${isToday?T.accent:T.border}`,
                borderRadius:10,padding:"8px 5px",minHeight:130}}>
                <div style={{textAlign:"center",marginBottom:8}}>
                  <div style={{fontSize:9,fontWeight:600,color:T.muted,textTransform:"uppercase"}}>{WDAYS[date.getDay()]}</div>
                  <div style={{fontSize:20,fontWeight:isToday?700:400,
                    color:isToday?T.accent:T.text,lineHeight:1.2,marginTop:1}}>{date.getDate()}</div>
                </div>
                {dt.map(t=>(
                  <div key={t.id} style={{fontSize:9,background:(members.find(m=>m.id===t.owner)||{color:T.muted}).color+"15",
                    color:(members.find(m=>m.id===t.owner)||{color:T.muted}).color,borderRadius:5,padding:"3px 5px",marginBottom:3,
                    lineHeight:1.3,fontWeight:500}}>{t.title}</div>
                ))}
                {!dt.length&&<div style={{fontSize:9,color:T.border,textAlign:"center",marginTop:16}}>—</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Upcoming strip */}
      <div style={card}>
        <SectionLabel>Coming up</SectionLabel>
        {tasks.filter(t=>!t.done&&daysUntil(t.deadline)>=0&&daysUntil(t.deadline)<=7)
          .sort((a,b)=>new Date(a.deadline)-new Date(b.deadline))
          .slice(0,5).map((t,i,arr)=>{
            const d=daysUntil(t.deadline),uc=urgencyColor(d);
            return (
              <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",
                borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                <div style={{width:36,textAlign:"center"}}>
                  <div style={{fontSize:16,fontWeight:700,color:uc,lineHeight:1}}>{d===0?"0":d}</div>
                  <div style={{fontSize:9,color:T.muted}}>{d===0?"today":"days"}</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500,color:T.text}}>{t.title}</div>
                  <div style={{fontSize:11,color:T.muted,marginTop:1}}>{fmtDate(t.deadline)}</div>
                </div>
                <Avatar user={t.owner} size={24} members={members}/>
              </div>
            );
        })}
      </div>
    </div>
  );
}

// ── Goals tab ──────────────────────────────────────────────────────────────
const CAT_COLORS = {financial:T.green,travel:T.accent,career:"#F5A623",health:T.urgent,lifestyle:"#C17A7A",shared:T.donny};

function AddGoalModal({ onAdd, onClose }) {
  const [form,setForm]=useState({title:"",owner:"shared",category:"financial",target:"",progress:0,emoji:"🎯",notes:""});
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  const EMOJIS=["🏠","✈️","💰","🚀","🏃","🍳","❤️","📚","💪","🎯","🌱","🎉"];
  function submit(){
    if(!form.title.trim())return;
    onAdd({id:Date.now(),...form,progress:parseInt(form.progress)||0});
    onClose();
  }
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.25)",display:"flex",
      alignItems:"flex-end",justifyContent:"center",zIndex:200}} onClick={onClose}>
      <div style={{background:T.surface,borderRadius:"20px 20px 0 0",padding:"24px 20px 32px",
        width:"100%",maxWidth:480,display:"flex",flexDirection:"column",gap:14,maxHeight:"90vh",overflowY:"auto"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:17,fontWeight:700,color:T.text}}>Add goal</span>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,color:T.muted,cursor:"pointer"}}>×</button>
        </div>
        <input value={form.title} onChange={e=>f("title",e.target.value)} placeholder="What do you want to achieve?" style={inputSt} autoFocus/>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {EMOJIS.map(em=>(
            <button key={em} onClick={()=>f("emoji",em)} style={{width:36,height:36,borderRadius:8,
              border:`1.5px solid ${form.emoji===em?T.accent:T.border}`,
              background:form.emoji===em?T.accent+"10":T.surface,cursor:"pointer",fontSize:16}}>
              {em}
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:6}}>
          {[["shared","Shared ❤️"],["andee","Andee"],["donny","Donny"]].map(([k,l])=>(
            <button key={k} onClick={()=>f("owner",k)} style={{flex:1,padding:"8px 0",borderRadius:10,
              cursor:"pointer",border:`1.5px solid ${form.owner===k?T.accent:T.border}`,
              background:form.owner===k?T.accent+"10":T.surface,
              color:form.owner===k?T.accent:T.sub,fontWeight:600,fontSize:12,fontFamily:"inherit"}}>
              {l}
            </button>
          ))}
        </div>
        <select value={form.category} onChange={e=>f("category",e.target.value)} style={{...inputSt}}>
          {["financial","travel","career","health","lifestyle"].map(c=>(
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input value={form.target} onChange={e=>f("target",e.target.value)} placeholder="Target date — e.g. Dec 2026" style={inputSt}/>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <SectionLabel>Progress</SectionLabel>
            <span style={{fontSize:12,fontWeight:700,color:T.accent}}>{form.progress}%</span>
          </div>
          <input type="range" min={0} max={100} value={form.progress}
            onChange={e=>f("progress",e.target.value)} style={{width:"100%",accentColor:T.accent}}/>
        </div>
        <input value={form.notes} onChange={e=>f("notes",e.target.value)} placeholder="Notes…" style={inputSt}/>
        <button onClick={submit} disabled={!form.title.trim()} style={{padding:"14px 0",borderRadius:12,
          background:form.title.trim()?T.accent:T.border,border:"none",
          color:form.title.trim()?"#fff":T.muted,fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
          Save goal
        </button>
      </div>
    </div>
  );
}

function GoalsTab({ goals, setGoals, members=SEED_MEMBERS }) {
  const [view,setView]=useState("list");
  const [filter,setFilter]=useState("all");
  const [showAdd,setShowAdd]=useState(false);
  function updateProgress(id,v){ setGoals(gs=>gs.map(g=>g.id===id?{...g,progress:v}:g)); }
  function del(id){ setGoals(gs=>gs.filter(g=>g.id!==id)); }
  const filtered=goals.filter(g=>filter==="all"||(filter==="shared"&&g.owner==="shared")||g.owner===filter);
  const avgProgress=goals.length?Math.round(goals.reduce((a,g)=>a+g.progress,0)/goals.length):0;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",gap:4,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:3}}>
          {[{id:"all",name:"All"},{id:"shared",name:"Shared ❤️"},...members].map(m=>(
            <button key={m.id} onClick={()=>setFilter(m.id)} style={{padding:"5px 10px",borderRadius:7,border:"none",
              background:filter===m.id?T.bg:"transparent",color:filter===m.id?T.text:T.muted,
              fontSize:11,fontWeight:filter===m.id?600:400,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{m.name}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {["list","vision"].map(v=>(
            <button key={v} onClick={()=>setView(v)} style={{padding:"5px 10px",borderRadius:7,
              border:`1px solid ${view===v?T.accent:T.border}`,background:view===v?T.accent+"10":T.surface,
              color:view===v?T.accent:T.muted,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
              {v==="vision"?"Vision":"List"}
            </button>
          ))}
          <button onClick={()=>setShowAdd(true)} style={{background:T.accent,border:"none",borderRadius:9,
            padding:"6px 12px",color:"#fff",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
            + Goal
          </button>
        </div>
      </div>

      {/* Summary */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
        {[
          {val:goals.length,    label:"total goals",   color:T.text},
          {val:avgProgress+"%", label:"avg progress",  color:T.accent},
          {val:goals.filter(g=>g.progress>=100).length,label:"completed",color:T.green},
        ].map((s,i)=>(
          <div key={i} style={{...card,padding:"12px 14px",textAlign:"center"}}>
            <div style={{fontSize:20,fontWeight:700,color:s.color}}>{s.val}</div>
            <div style={{fontSize:10,color:T.muted,marginTop:2}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* List view */}
      {view==="list"&&(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.map(g=>{
            const cc=CAT_COLORS[g.category]||T.accent;
            return (
              <div key={g.id} style={card}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:12}}>
                  <span style={{fontSize:26}}>{g.emoji}</span>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                      <span style={{fontSize:15,fontWeight:600,color:T.text,lineHeight:1.3}}>{g.title}</span>
                      <button onClick={()=>del(g.id)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:14,flexShrink:0}}>×</button>
                    </div>
                    <div style={{display:"flex",gap:6,marginTop:5,flexWrap:"wrap",alignItems:"center"}}>
                      <Chip label={g.category} color={cc}/>
                      <Chip label={g.owner==="shared"?"shared ❤️":(members.find(m=>m.id===g.owner)?.name||g.owner)} color={g.owner==="shared"?T.donny:(members.find(m=>m.id===g.owner)?.color||T.muted)}/>
                      {g.target&&<span style={{fontSize:11,color:T.muted}}>by {g.target}</span>}
                    </div>
                  </div>
                </div>
                {g.notes&&<div style={{fontSize:12,color:T.sub,marginBottom:12,fontStyle:"italic",lineHeight:1.5}}>"{g.notes}"</div>}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                  <span style={{fontSize:12,color:T.muted}}>Progress</span>
                  <span style={{fontSize:13,fontWeight:700,color:g.progress>=100?T.green:cc}}>{g.progress}%</span>
                </div>
                <ProgressBar value={g.progress} color={g.progress>=100?T.green:cc} height={6}/>
                <div style={{display:"flex",gap:5,marginTop:10}}>
                  {[0,25,50,75,100].map(v=>(
                    <button key={v} onClick={()=>updateProgress(g.id,v)} style={{flex:1,padding:"5px 0",
                      borderRadius:7,border:`1px solid ${g.progress===v?cc:T.border}`,
                      background:g.progress===v?cc+"12":T.bg,
                      color:g.progress===v?cc:T.muted,fontSize:11,fontWeight:600,
                      cursor:"pointer",fontFamily:"inherit"}}>{v}%</button>
                  ))}
                </div>
              </div>
            );
          })}
          {!filtered.length&&<div style={{...card,textAlign:"center",color:T.muted,fontSize:14,padding:"32px 0"}}>No goals yet — add one above</div>}
        </div>
      )}

      {/* Vision board */}
      {view==="vision"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            {[
              {label:"🏠 Home",   url:"https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&q=80"},
              {label:"✈️ Travel", url:"https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80"},
              {label:"💪 Health", url:"https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&q=80"},
              {label:"💰 Wealth", url:"https://images.unsplash.com/photo-1579621970795-87facc2f976d?w=400&q=80"},
              {label:"❤️  Us",    url:"https://images.unsplash.com/photo-1529634806980-85c3dd6d34ac?w=400&q=80"},
              {label:"🚀 Career", url:"https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=400&q=80"},
            ].map((img,i)=>(
              <div key={i} style={{position:"relative",borderRadius:10,overflow:"hidden",aspectRatio:"1",border:`1px solid ${T.border}`}}>
                <img src={img.url} alt={img.label} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} onError={e=>{e.target.style.display="none";}}/>
                <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,.45)",padding:"4px 6px"}}>
                  <span style={{fontSize:10,color:"#fff",fontWeight:600}}>{img.label}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {filtered.map(g=>{
              const cc=CAT_COLORS[g.category]||T.accent;
              return (
                <div key={g.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:14}}>
                  <div style={{fontSize:26,marginBottom:6}}>{g.emoji}</div>
                  <div style={{fontSize:13,fontWeight:700,color:T.text,lineHeight:1.3,marginBottom:3}}>{g.title}</div>
                  <div style={{fontSize:11,color:T.muted,marginBottom:8}}>{g.target||""}</div>
                  <ProgressBar value={g.progress} color={cc} height={4}/>
                  <div style={{fontSize:11,fontWeight:700,color:cc,marginTop:5}}>{g.progress}%</div>
                </div>
              );
            })}
          </div>
          <div style={{...card,textAlign:"center",padding:"20px"}}>
            <div style={{fontSize:20,marginBottom:6}}>❤️</div>
            <div style={{fontSize:13,fontWeight:600,color:T.text,marginBottom:4}}>Andee & Donny</div>
            <div style={{fontSize:12,color:T.muted,fontStyle:"italic"}}>"Building our best life together, one goal at a time."</div>
          </div>
        </div>
      )}

      {showAdd&&<AddGoalModal onAdd={g=>setGoals(gs=>[...gs,g])} onClose={()=>setShowAdd(false)}/>}
    </div>
  );
}

// ── Chat tab ───────────────────────────────────────────────────────────────
function ChatTab({ messages, setMessages, activeUser, members=SEED_MEMBERS }) {
  const [input,setInput]=useState("");
  const endRef=useRef(null);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);
  function send(){
    if(!input.trim())return;
    const ts=new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
    setMessages(m=>[...m,{id:Date.now(),from:activeUser,text:input.trim(),ts}]);
    setInput("");
  }
  return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 280px)",minHeight:300}}>
      <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:8,paddingBottom:8}}>
        {messages.map(m=>{
          const isMe=m.from===activeUser;
          return (
            <div key={m.id} style={{display:"flex",justifyContent:isMe?"flex-end":"flex-start",gap:8,alignItems:"flex-end"}}>
              {!isMe&&<Avatar user={m.from} size={28} members={members}/>}
              <div style={{maxWidth:"75%"}}>
                <div style={{background:isMe?T.accent:T.surface,
                  border:`1px solid ${isMe?"transparent":T.border}`,
                  color:isMe?"#fff":T.text,borderRadius:isMe?"16px 16px 4px 16px":"16px 16px 16px 4px",
                  padding:"10px 14px",fontSize:14,lineHeight:1.5}}>{m.text}</div>
                <div style={{fontSize:10,color:T.muted,marginTop:3,textAlign:isMe?"right":"left"}}>{m.ts}</div>
              </div>
              {isMe&&<Avatar user={m.from} size={28} members={members}/>}
            </div>
          );
        })}
        <div ref={endRef}/>
      </div>
      <div style={{display:"flex",gap:8,marginTop:8,paddingTop:8,borderTop:`1px solid ${T.border}`}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}
          placeholder={`Message as ${members.find(m=>m.id===activeUser)?.name||activeUser}…`}
          style={{flex:1,background:T.bg,border:`1.5px solid ${T.border}`,borderRadius:12,
            padding:"11px 14px",color:T.text,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
        <button onClick={send} disabled={!input.trim()} style={{background:(members.find(m=>m.id===activeUser)||{color:T.accent}).color,
          border:"none",borderRadius:12,padding:"11px 18px",color:"#fff",fontSize:14,fontWeight:600,
          cursor:!input.trim()?"not-allowed":"pointer",opacity:!input.trim()?.5:1,fontFamily:"inherit"}}>
          Send
        </button>
      </div>
    </div>
  );
}

// ── AI tab ─────────────────────────────────────────────────────────────────
function AITab({ tasks, goals, members=SEED_MEMBERS }) {
  const [msgs,setMsgs]=useState([{role:"assistant",text:"Hi! I'm your WeFlow assistant. I know your tasks, deadlines, and goals. Ask me anything — planning help, what to focus on, or how you two are doing on your goals."}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const endRef=useRef(null);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);
  async function send(){
    if(!input.trim()||loading)return;
    const userMsg=input.trim(); setInput("");
    setMsgs(m=>[...m,{role:"user",text:userMsg}]); setLoading(true);
    const ts=tasks.map(t=>{const m=members.find(x=>x.id===t.owner);return `• ${t.title} (${m?.name||t.owner}, due ${t.deadline}, ${t.priority}${t.done?" ✓":""})`}).join("\n");
    const gs=goals.map(g=>{const m=members.find(x=>x.id===g.owner);return `• ${g.emoji} ${g.title} — ${m?.name||g.owner}, ${g.progress}%, target ${g.target}`}).join("\n");
    try {
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",
        headers:{"Content-Type":"application/json"},body:JSON.stringify({
          model:"claude-sonnet-4-6",max_tokens:1000,
          system:`You are a warm, practical time management assistant for Andee and Donny. Be concise.\n\nTasks:\n${ts}\n\nGoals:\n${gs}`,
          messages:[...msgs.filter((_,i)=>i>0).map(m=>({role:m.role==="assistant"?"assistant":"user",content:m.text})),{role:"user",content:userMsg}],
        })});
      const data=await res.json();
      setMsgs(m=>[...m,{role:"assistant",text:data.content?.find(b=>b.type==="text")?.text||"Sorry, try again."}]);
    } catch { setMsgs(m=>[...m,{role:"assistant",text:"Connection error — please try again."}]); }
    setLoading(false);
  }
  const SUGGESTIONS=["What should I focus on today?","How are we doing on our shared goals?","What's overdue?"];
  return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 280px)",minHeight:300}}>
      <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:8,paddingBottom:8}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
            <div style={{background:m.role==="user"?T.accent:T.surface,
              border:`1px solid ${m.role==="user"?"transparent":T.border}`,
              color:m.role==="user"?"#fff":T.text,
              borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",
              padding:"10px 14px",fontSize:14,maxWidth:"82%",lineHeight:1.6}}>{m.text}</div>
          </div>
        ))}
        {loading&&(
          <div style={{display:"flex"}}>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"16px 16px 16px 4px",
              padding:"10px 14px",color:T.muted,fontSize:14}}>Thinking…</div>
          </div>
        )}
        {msgs.length===1&&(
          <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:4}}>
            {SUGGESTIONS.map(s=>(
              <button key={s} onClick={()=>{setInput(s);}} style={{textAlign:"left",background:T.surface,
                border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px",color:T.sub,
                fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>{s}</button>
            ))}
          </div>
        )}
        <div ref={endRef}/>
      </div>
      <div style={{display:"flex",gap:8,marginTop:8,paddingTop:8,borderTop:`1px solid ${T.border}`}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}
          placeholder="Ask anything…"
          style={{flex:1,background:T.bg,border:`1.5px solid ${T.border}`,borderRadius:12,
            padding:"11px 14px",color:T.text,fontSize:14,outline:"none",fontFamily:"inherit"}}/>
        <button onClick={send} disabled={loading||!input.trim()} style={{background:T.accent,border:"none",
          borderRadius:12,padding:"11px 18px",color:"#fff",fontSize:14,fontWeight:600,
          cursor:loading||!input.trim()?"not-allowed":"pointer",
          opacity:loading||!input.trim()?.5:1,fontFamily:"inherit"}}>Send</button>
      </div>
    </div>
  );
}

// ── Family Management Tab ──────────────────────────────────────────────────
function FamilyTab({ members, setMembers, tasks, activeUser, setUser }) {
  const [name,setName]=useState("");
  const [editId,setEditId]=useState(null);
  const [editName,setEditName]=useState("");

  function addMember(){
    const n=name.trim();
    if(!n) return;
    const id=n.toLowerCase().replace(/\s+/g,"_")+"_"+Date.now();
    const color=MEMBER_COLORS[members.length % MEMBER_COLORS.length];
    setMembers(ms=>[...ms,{id,name:n,color}]);
    setName("");
  }

  function removeMember(id){
    if(members.length<=1){ alert("You need at least one member!"); return; }
    setMembers(ms=>ms.filter(m=>m.id!==id));
    if(activeUser===id) setUser(members.find(m=>m.id!==id)?.id||"andee");
  }

  function saveEdit(id){
    const n=editName.trim();
    if(!n) return;
    setMembers(ms=>ms.map(m=>m.id===id?{...m,name:n}:m));
    setEditId(null);
  }

  function changeColor(id,color){
    setMembers(ms=>ms.map(m=>m.id===id?{...m,color}:m));
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Hero */}
      <div style={{...card,background:`linear-gradient(135deg,${T.accent}08,${T.donny}08)`,border:`1px solid ${T.accent}20`,padding:"20px 18px"}}>
        <div style={{fontSize:22,marginBottom:4}}>👨‍👩‍👧‍👦</div>
        <div style={{fontSize:17,fontWeight:700,color:T.text,marginBottom:4}}>Family Members</div>
        <div style={{fontSize:13,color:T.sub,lineHeight:1.5}}>Everyone here gets full access — they can add tasks, update goals, and message the family.</div>
      </div>

      {/* Member list */}
      <div style={card}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>
          {members.length} {members.length===1?"member":"members"}
        </div>
        {members.map((m,i)=>(
          <div key={m.id}>
            <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0"}}>
              {/* Avatar with color swatch */}
              <div style={{width:42,height:42,borderRadius:"50%",background:m.color+"18",
                border:`2px solid ${m.color}`,display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:17,fontWeight:700,color:m.color,flexShrink:0}}>
                {makeInitial(m.name)}
              </div>
              <div style={{flex:1}}>
                {editId===m.id?(
                  <div style={{display:"flex",gap:6}}>
                    <input value={editName} onChange={e=>setEditName(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&saveEdit(m.id)}
                      style={{...inputSt,padding:"6px 10px",fontSize:13,flex:1}}
                      autoFocus/>
                    <button onClick={()=>saveEdit(m.id)} style={{background:T.accent,border:"none",
                      borderRadius:8,padding:"6px 12px",color:"#fff",fontSize:12,fontWeight:600,
                      cursor:"pointer",fontFamily:"inherit"}}>Save</button>
                    <button onClick={()=>setEditId(null)} style={{background:T.bg,border:`1px solid ${T.border}`,
                      borderRadius:8,padding:"6px 10px",color:T.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                  </div>
                ):(
                  <>
                    <div style={{fontSize:15,fontWeight:600,color:T.text}}>{m.name}</div>
                    <div style={{fontSize:11,color:T.muted,marginTop:2}}>
                      {tasks.filter(t=>t.owner===m.id&&!t.done).length} active tasks
                      {(m.id==="andee"||m.id==="donny")&&<span style={{marginLeft:6,color:T.accent,fontWeight:600}}>· Admin</span>}
                    </div>
                  </>
                )}
              </div>
              {editId!==m.id&&(
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <button onClick={()=>{setEditId(m.id);setEditName(m.name);}}
                    style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,
                      padding:"5px 10px",color:T.sub,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                    Edit
                  </button>
                  {m.id!=="andee"&&m.id!=="donny"&&(
                    <button onClick={()=>removeMember(m.id)}
                      style={{background:"#FFF5F4",border:`1px solid #FDDAD8`,borderRadius:8,
                        padding:"5px 10px",color:T.urgent,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Color picker row */}
            {editId!==m.id&&(
              <div style={{display:"flex",gap:5,paddingLeft:54,paddingBottom:8}}>
                {MEMBER_COLORS.map(c=>(
                  <button key={c} onClick={()=>changeColor(m.id,c)} style={{width:18,height:18,
                    borderRadius:"50%",background:c,border:m.color===c?`2px solid ${T.text}`:`2px solid transparent`,
                    cursor:"pointer",flexShrink:0,padding:0}}/>
                ))}
              </div>
            )}
            {i<members.length-1&&<div style={{height:1,background:T.border}}/>}
          </div>
        ))}
      </div>

      {/* Add new member */}
      <div style={card}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>Add someone</div>
        <div style={{display:"flex",gap:8}}>
          <input value={name} onChange={e=>setName(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&addMember()}
            placeholder="Name — e.g. Mom, Tyler, Grandma…"
            style={{...inputSt,flex:1}}/>
          <button onClick={addMember} disabled={!name.trim()} style={{background:name.trim()?T.accent:T.border,
            border:"none",borderRadius:10,padding:"10px 18px",color:name.trim()?"#fff":T.muted,
            fontWeight:600,fontSize:14,cursor:name.trim()?"pointer":"not-allowed",
            fontFamily:"inherit",transition:"background .2s",whiteSpace:"nowrap"}}>
            + Add
          </button>
        </div>
        <div style={{fontSize:12,color:T.muted,marginTop:8}}>
          New members can be assigned tasks, tagged in goals, and join the family chat.
        </div>
      </div>

      {/* Switch active user */}
      <div style={card}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>Viewing as</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {members.map(m=>(
            <button key={m.id} onClick={()=>setUser(m.id)} style={{display:"flex",alignItems:"center",
              gap:8,padding:"8px 14px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",
              border:`1.5px solid ${activeUser===m.id?m.color:T.border}`,
              background:activeUser===m.id?m.color+"10":T.surface}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:m.color+"20",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:11,fontWeight:700,color:m.color}}>{makeInitial(m.name)}</div>
              <span style={{fontSize:13,fontWeight:activeUser===m.id?700:400,
                color:activeUser===m.id?m.color:T.sub}}>{m.name}</span>
              {activeUser===m.id&&<span style={{fontSize:10,color:m.color}}>✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Wrap task-related components to pass members ───────────────────────────
// TaskRow already uses Avatar which now accepts members prop
// We need AddTaskModal to show dynamic member list
function AddTaskModalDynamic({ onAdd, onClose, members }) {
  const [form,setForm]=useState({title:"",owner:members[0]?.id||"andee",deadline:"",priority:"medium",tags:""});
  const f=(k,v)=>setForm(p=>({...p,[k]:v}));
  function submit(){
    if(!form.title.trim()||!form.deadline)return;
    onAdd({id:Date.now(),...form,done:false,
      tags:form.tags?form.tags.split(",").map(t=>t.trim()).filter(Boolean):[]});
    onClose();
  }
  const PRIO=[{k:"low",label:"Low",c:T.green},{k:"medium",label:"Medium",c:T.warn},{k:"high",label:"High",c:T.urgent}];
  // Show up to 4 members in a row, rest in a scrollable row
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.25)",display:"flex",
      alignItems:"flex-end",justifyContent:"center",zIndex:200}} onClick={onClose}>
      <div style={{background:T.surface,borderRadius:"20px 20px 0 0",padding:"24px 20px 32px",
        width:"100%",maxWidth:480,display:"flex",flexDirection:"column",gap:16,maxHeight:"92vh",overflowY:"auto"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:17,fontWeight:700,color:T.text}}>Add activity</span>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,color:T.muted,cursor:"pointer"}}>×</button>
        </div>
        <input value={form.title} onChange={e=>f("title",e.target.value)}
          placeholder="What needs to get done?" style={inputSt} autoFocus/>
        <div>
          <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Assigned to</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {members.map(m=>(
              <button key={m.id} onClick={()=>f("owner",m.id)} style={{display:"flex",alignItems:"center",
                gap:6,padding:"7px 12px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",
                border:`1.5px solid ${form.owner===m.id?m.color:T.border}`,
                background:form.owner===m.id?m.color+"10":T.surface}}>
                <div style={{width:20,height:20,borderRadius:"50%",background:m.color+"20",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:9,fontWeight:700,color:m.color}}>{makeInitial(m.name)}</div>
                <span style={{fontSize:13,fontWeight:600,color:form.owner===m.id?m.color:T.sub}}>{m.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Deadline</div>
          <input type="date" value={form.deadline} onChange={e=>f("deadline",e.target.value)} style={inputSt}/>
        </div>
        <div>
          <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Priority</div>
          <div style={{display:"flex",gap:8}}>
            {PRIO.map(({k,label,c})=>(
              <button key={k} onClick={()=>f("priority",k)} style={{flex:1,padding:"8px 0",borderRadius:10,
                cursor:"pointer",border:`1.5px solid ${form.priority===k?c:T.border}`,
                background:form.priority===k?c+"10":T.surface,
                color:form.priority===k?c:T.sub,fontWeight:600,fontSize:13,fontFamily:"inherit"}}>{label}</button>
            ))}
          </div>
        </div>
        <input value={form.tags} onChange={e=>f("tags",e.target.value)}
          placeholder="Tags — home, work, finance…" style={inputSt}/>
        <button onClick={submit} disabled={!form.title.trim()||!form.deadline} style={{
          padding:"14px 0",borderRadius:12,background:form.title.trim()&&form.deadline?T.accent:T.border,
          border:"none",color:form.title.trim()&&form.deadline?"#fff":T.muted,
          fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
          Save activity
        </button>
      </div>
    </div>
  );
}

// ── Main app ───────────────────────────────────────────────────────────────
export default function WeFlow() {
  const [members,setMembers]=useState(SEED_MEMBERS);
  const [tasks,setTasks]=useState(SEED_TASKS);
  const [goals,setGoals]=useState(SEED_GOALS);
  const [messages,setMessages]=useState(SEED_MSGS);
  const [activeUser,setUser]=useState("andee");
  const [tab,setTab]=useState("focus");
  const [showAdd,setShowAdd]=useState(false);

  // Register SW and check urgent notifications on load
  useEffect(()=>{
    registerSW();
    if(typeof window!=="undefined"&&("Notification" in window)&&Notification.permission==="granted"){
      cacheTasksForSW(tasks);
      fireUrgentNotifs(tasks);
    }
  },[]);

  // Re-cache tasks whenever they change
  useEffect(()=>{ cacheTasksForSW(tasks); },[tasks]);

  // Keep activeUser valid if members change
  useEffect(()=>{
    if(!members.find(m=>m.id===activeUser)) setUser(members[0]?.id||"andee");
  },[members]);

  const activeMember = members.find(m=>m.id===activeUser)||members[0];

  const TABS=[
    {id:"focus",    label:"Focus",    icon:"⚡"},
    {id:"tasks",    label:"Tasks",    icon:"☑"},
    {id:"calendar", label:"Calendar", icon:"📅"},
    {id:"goals",    label:"Goals",    icon:"🎯"},
    {id:"chat",     label:"Chat",     icon:"💬"},
    {id:"ai",       label:"AI",       icon:"✦"},
    {id:"family",   label:"Family",   icon:"👨‍👩‍👧"},
    {id:"notifs",   label:"Alerts",    icon:"🔔"},
  ];

  return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",display:"flex",flexDirection:"column"}}>

      {/* Top bar */}
      <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:"12px 16px",
        display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:30,height:30,borderRadius:9,
            background:`linear-gradient(135deg,${T.accent},${T.donny})`,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>⟳</div>
          <span style={{fontSize:16,fontWeight:700,letterSpacing:"-0.5px",color:T.text}}>WeFlow</span>
        </div>
        {/* Scrollable member switcher */}
        <div style={{display:"flex",gap:3,overflowX:"auto",maxWidth:"65%",
          background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:3}}>
          {members.map(m=>(
            <button key={m.id} onClick={()=>setUser(m.id)} style={{padding:"5px 10px",borderRadius:7,
              border:"none",background:activeUser===m.id?T.surface:"transparent",
              color:activeUser===m.id?m.color:T.muted,fontWeight:activeUser===m.id?700:400,
              fontSize:12,cursor:"pointer",transition:"all .15s",whiteSpace:"nowrap",
              boxShadow:activeUser===m.id?`0 1px 3px rgba(0,0,0,.08)`:"none",fontFamily:"inherit"}}>
              {m.name}
            </button>
          ))}
        </div>
      </div>

      <NotifStrip tasks={tasks}/>

      {/* Content */}
      <div style={{flex:1,overflowY:"auto",padding:"16px 16px 100px"}}>
        {tab==="focus"    && <FocusTab tasks={tasks} goals={goals} activeUser={activeUser} members={members}/>}
        {tab==="tasks"    && <TasksTab tasks={tasks} setTasks={setTasks} onShowAdd={()=>setShowAdd(true)} members={members} activeUser={activeUser}/>}
        {tab==="calendar" && <CalendarTab tasks={tasks} members={members}/>}
        {tab==="goals"    && <GoalsTab goals={goals} setGoals={setGoals} members={members}/>}
        {tab==="chat"     && <ChatTab messages={messages} setMessages={setMessages} activeUser={activeUser} members={members}/>}
        {tab==="ai"       && <AITab tasks={tasks} goals={goals} members={members}/>}
        {tab==="family"   && <FamilyTab members={members} setMembers={setMembers} tasks={tasks} activeUser={activeUser} setUser={setUser}/>}
        {tab==="notifs"   && <NotifSettings tasks={tasks}/>}
      </div>

      {/* Bottom nav */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:T.surface,
        borderTop:`1px solid ${T.border}`,display:"flex",
        paddingBottom:"env(safe-area-inset-bottom,8px)",zIndex:50,overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:"0 0 auto",minWidth:52,
            padding:"10px 6px 8px",border:"none",background:"transparent",cursor:"pointer",
            display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            <span style={{fontSize:17,lineHeight:1,filter:tab===t.id?"none":"grayscale(1)",
              opacity:tab===t.id?1:.4,transition:"all .15s"}}>{t.icon}</span>
            <span style={{fontSize:9,fontWeight:tab===t.id?600:400,
              color:tab===t.id?T.accent:T.muted,fontFamily:"inherit"}}>{t.label}</span>
          </button>
        ))}
      </div>

      {showAdd&&<AddTaskModalDynamic members={members} onAdd={t=>setTasks(ts=>[t,...ts])} onClose={()=>setShowAdd(false)}/>}
    </div>
  );
}
