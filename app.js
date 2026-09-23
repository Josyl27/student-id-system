/* Student ID Generator — admin app (Supabase backend) */
const cfg = window.APP_CONFIG || {};
const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

/* ---------- Constants ---------- */
const STATUSES = ["Pending","Verified","Approved","Generated","Printed","Rejected"];
const ELIGIBLE = ["Verified","Approved","Generated","Printed"];
const CARD_W_MM = IDCard.W_MM, CARD_H_MM = IDCard.H_MM;
const BUCKET = "student-photos";
const GRADES = ["Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"];
const BLOOD = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
const SHEET_MAP = {
  "timestamp":"submitted_at",
  "lrn":"student_id","lrn no":"student_id","lrn number":"student_id","learner reference number":"student_id","lrn (learner reference number)":"student_id",
  "student id number":"student_id","student id":"student_id",
  "last name":"last_name","surname":"last_name","first name":"first_name","given name":"first_name",
  "middle name":"middle_name","middle initial":"middle_name","complete name":"name","name":"name",
  "date of birth":"dob","birthday":"dob","birthdate":"dob","sex":"sex","gender":"sex","blood type":"blood_type",
  "grade level":"year_level","grade":"year_level","year level":"year_level","section":"section","adviser":"adviser","class adviser":"adviser",
  "emergency contact name":"emergency_name","emergency contact person":"emergency_name",
  "emergency contact address":"emergency_address","address":"emergency_address",
  "emergency contact number":"emergency_contact","contact number":"emergency_contact",
  "school year":"school_year","student email address":"email","student email":"email","email":"email","email address":"email",
  "mobile number":"mobile","student id photo":"photo_source","student photo":"photo_source","photo":"photo_source",
  "student signature":"signature_source","signature":"signature_source"
};

/* ---------- State ---------- */
const S = {
  user:null, template:null, tplDirty:false,
  students:new Map(), photos:new Map(), sigs:new Map(), audit:[],
  view:"dashboard", f:{q:"",status:"",grade:"",section:""}, sel:new Set(), modal:null, channel:null
};

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtDate = t => t ? new Date(t).toLocaleString(undefined,{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "—";
function toast(msg, kind="ok"){
  const t=document.createElement("div"); t.className="toast "+kind; t.setAttribute("role","status"); t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{ t.classList.add("leaving"); setTimeout(()=>t.remove(),240); }, 3400);
  return t;
}
function dbErr(error, fallback="Couldn't save. Check your connection and try again."){
  if(!error) return;
  const m = error.message || "";
  if(error.code === "23505") toast("Another student already has this LRN.","err");
  else if(/template|verified|approved|locked/i.test(m)) toast(m,"err");
  else toast(fallback,"err");
  console.error(error);
}
async function audit(action, detail){ const { error } = await sb.from("audit_log").insert({ action, detail }); if(error) console.warn(error); }
function siteUrl(){ return (S.template?.site_url || location.href.replace(/[^/]*([?#].*)?$/,"")).replace(/\/$/,""); }
const verifyURL = s => `${siteUrl()}/verify.html?c=${encodeURIComponent(s.verify_token)}`;

/* ---------- Data loading ---------- */
async function loadTemplate(){
  const { data, error } = await sb.from("id_template").select("*").eq("id",1).single();
  if(error) throw error; S.template = data; S.tplDirty = false;
}
async function loadStudents(){
  const map = new Map(); let from = 0;
  for(;;){
    const { data, error } = await sb.from("students").select("*").order("student_id").range(from, from+999);
    if(error) throw error;
    data.forEach(r=>map.set(r.id, r));
    if(data.length < 1000) break; from += 1000;
  }
  S.students = map;
}
async function loadAudit(){
  const { data } = await sb.from("audit_log").select("*").order("at",{ascending:false}).limit(400);
  S.audit = data || [];
}
function subscribe(){
  if(S.channel) return;
  S.channel = sb.channel("students-live").on("postgres_changes",{event:"*",schema:"public",table:"students"}, p=>{
    if(p.eventType==="DELETE"){ S.students.delete(p.old.id); S.photos.delete(p.old.id); S.sigs.delete(p.old.id); }
    else {
      const cur = S.students.get(p.new.id);
      if(cur && cur.photo_path!==p.new.photo_path) S.photos.delete(p.new.id);
      if(cur && cur.signature_path!==p.new.signature_path) S.sigs.delete(p.new.id);
      S.students.set(p.new.id, p.new);
    }
    const typing = document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if(!S.modal && !typing && S.view!=="template") render();
  }).subscribe();
}

/* ---------- Brand ---------- */
// Swap these two lines to rename the studio (e.g. "Petal Pass", "Blossom ID Studio").
const BRAND = { name:"Bloom ID Studio", tagline:"Every student, beautifully identified." };
const LOGO = (cls="logo") => `<svg class="${cls}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${BRAND.name}">
  <ellipse cx="24" cy="12.5" rx="6.6" ry="8.6" fill="var(--blush)"/>
  <ellipse cx="34.1" cy="19.9" rx="6.6" ry="8.6" fill="var(--lilac)" transform="rotate(72 34.1 19.9)"/>
  <ellipse cx="30.2" cy="31.8" rx="6.6" ry="8.6" fill="var(--peach)" transform="rotate(144 30.2 31.8)"/>
  <ellipse cx="17.8" cy="31.8" rx="6.6" ry="8.6" fill="var(--blush)" transform="rotate(216 17.8 31.8)"/>
  <ellipse cx="13.9" cy="19.9" rx="6.6" ry="8.6" fill="var(--lilac)" transform="rotate(288 13.9 19.9)"/>
  <circle cx="24" cy="24" r="6.2" fill="var(--primary)"/>
  <circle cx="21.8" cy="21.8" r="1.7" fill="#fff" opacity=".65"/>
</svg>`;
const greeting = () => { const h=new Date().getHours(); return h<12?"Good morning":h<18?"Good afternoon":"Good evening"; };
const adminName = () => { const n=(S.user?.email||"").split("@")[0].replace(/[._-]+/g," ").trim(); return n ? n.charAt(0).toUpperCase()+n.slice(1) : "there"; };

/* ---------- Appearance ---------- */
const THEME_LABEL = { system:"Theme: system", light:"Theme: light", dark:"Theme: dark" };
function theme(){ try{ return localStorage.getItem("sidg-theme") || "system"; }catch{ return "system"; } }
function applyTheme(t){
  if(t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}
applyTheme(theme());

/* ---------- Boot & auth ---------- */
async function boot(){
  if(!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT")){
    $("#root").innerHTML = `<div class="center"><div class="panel login"><h1>Almost ready</h1><p class="muted" style="margin-top:8px">Add your Supabase project URL and anon key to <b>config.js</b>, then reload.</p></div></div>`; return;
  }
  const { data:{ session } } = await sb.auth.getSession();
  if(!session) return renderLogin();
  if(!(await checkAdmin())) return;
  await enterApp();
}
async function checkAdmin(){
  const { data, error } = await sb.rpc("is_admin");
  if(error || !data){ await sb.auth.signOut(); renderLogin("This account isn't an administrator. Ask the system owner to add you."); return false; }
  const { data:{ user } } = await sb.auth.getUser(); S.user = user; return true;
}
function renderLogin(err=""){
  $("#root").innerHTML = `
  <div class="center"><form class="panel login stack" id="loginForm">
    <div>${LOGO()}<h1>${esc(BRAND.name)}</h1><p class="tagline">${esc(BRAND.tagline)}</p>
      <p class="muted small" style="margin-top:10px">Sign in — for authorized school personnel only.</p></div>
    <label class="f">Email<input type="email" name="email" required autocomplete="username"></label>
    <label class="f">Password<input type="password" name="pass" required autocomplete="current-password"></label>
    ${err?`<p class="errtxt" role="alert">${esc(err)}</p>`:""}
    <button class="btn primary" type="submit">Sign in</button>
  </form></div>`;
  $("#loginForm").addEventListener("submit", async e=>{
    e.preventDefault(); const fd = new FormData(e.target);
    const btn = e.target.querySelector("button"); btn.disabled = true; btn.textContent = "Signing in…";
    const { error } = await sb.auth.signInWithPassword({ email:fd.get("email"), password:fd.get("pass") });
    if(error) return renderLogin("The email or password is incorrect.");
    if(!(await checkAdmin())) return;
    await audit("Signed in", S.user.email);
    enterApp();
  });
}
async function signOut(){ await audit("Signed out", S.user?.email); S.channel?.unsubscribe(); S.channel=null; await sb.auth.signOut(); S.user=null; renderLogin(); }
async function enterApp(){
  $("#root").innerHTML = `<div class="boot" aria-busy="true" aria-label="Loading student records">
    <div class="skel title"></div>
    <div class="stats"><div class="skel stats"></div><div class="skel stats"></div><div class="skel stats"></div><div class="skel stats"></div></div>
    ${'<div class="skel rows"></div>'.repeat(6)}
  </div>`;
  try{ await Promise.all([loadTemplate(), loadStudents(), loadAudit()]); }
  catch(e){ console.error(e); $("#root").innerHTML = `<div class="center"><div class="panel login"><h1>Couldn't load records</h1><p class="muted" style="margin-top:8px">Check that schema.sql has been run and your internet connection is working, then reload.</p></div></div>`; return; }
  render(); subscribe();
}

/* ---------- Shell ---------- */
const NAV = [["dashboard","Dashboard"],["students","Students"],["generator","ID generator"],["generated","Generated IDs"],["verify","Verification"],["template","ID template"],["audit","Audit log"]];
function render(){
  $("#root").innerHTML = `
  <div class="app">
    <aside class="side">
      <div class="mark">${LOGO()}<div><b>${esc(BRAND.name)}</b><span>${esc(BRAND.tagline)}</span></div></div>
      <nav class="nav" aria-label="Main">${NAV.map(([k,l])=>`<button data-nav="${k}" ${k===S.view?'aria-current="page"':""}>${l}</button>`).join("")}</nav>
      <div class="foot"><div style="margin-bottom:8px"><span class="dot" aria-hidden="true"></span>Database connected</div>
        Signed in as <b>${esc(S.user.email)}</b>
        <div class="footrow"><button data-act="signout">Sign out</button><button class="theme-toggle" data-act="theme">${THEME_LABEL[theme()]}</button></div>
        <div class="brandline">${esc(BRAND.name)} 🌸</div></div>
    </aside>
    <main class="main" id="main">${VIEWS[S.view]()}</main>
  </div>`;
  after[S.view]?.();
}
document.addEventListener("click", e=>{
  const n = e.target.closest("[data-nav]");
  if(n){
    if(S.view==="template" && S.tplDirty && n.dataset.nav!=="template"){
      if(!confirm("Leave without saving your template changes?")) return;
      loadTemplate();
    }
    closeModal(); S.view = n.dataset.nav; render(); window.scrollTo(0,0); return;
  }
  const a = e.target.closest("[data-act]");
  if(a) ACTIONS[a.dataset.act]?.(a.dataset.id, a, e);
});

/* ---------- Derived ---------- */
const all = () => [...S.students.values()].sort((a,b)=>listName(a).localeCompare(listName(b)));
const uniq = f => [...new Set(all().map(s=>s[f]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true}));
const pill = st => `<span class="pill s-${esc(st)}">${esc(st)}</span>`;
const canGenerate = s => s && ELIGIBLE.includes(s.status) && S.template.locked;
function fullName(s){ const n=IDCard.nameParts(s); return [n.first,n.initial,n.last].filter(Boolean).join(" "); }
function listName(s){ const n=IDCard.nameParts(s); return n.last ? `${n.last}, ${[n.first,n.initial].filter(Boolean).join(" ")}` : (s.name||""); }
const gradeSection = s => [s.year_level, s.section].filter(Boolean).join(" – ");
function filtered(){
  const {q,status,grade,section} = S.f, ql = q.trim().toLowerCase();
  return all().filter(s=>{
    if(status && s.status!==status) return false;
    if(grade && s.year_level!==grade) return false;
    if(section && s.section!==section) return false;
    if(ql && ![s.student_id,s.name,s.last_name,s.first_name,s.section,s.year_level,s.adviser].join(" ").toLowerCase().includes(ql)) return false;
    return true;
  });
}
const flipCard = (label) => `<div class="stack" style="align-items:center;gap:12px">
  <div class="flipwrap"><div class="flipcard" id="flipcard">
    <div class="face front"><canvas class="idcard" data-pv="1" data-side="front" role="img" aria-label="Front of ID${label?" for "+esc(label):""}"></canvas></div>
    <div class="face back"><canvas class="idcard" data-pv="1" data-side="back" role="img" aria-label="Back of ID${label?" for "+esc(label):""}"></canvas></div>
  </div></div>
  <button type="button" class="btn sm" data-act="flip" aria-pressed="false">Flip to back</button></div>`;
const cardPair = (attr, label) => `<div class="pair"><div><canvas class="idcard" ${attr} data-side="front" role="img" aria-label="Front of ID${label?" for "+esc(label):""}"></canvas><p class="muted small center-t">Front</p></div>
  <div><canvas class="idcard" ${attr} data-side="back" role="img" aria-label="Back of ID${label?" for "+esc(label):""}"></canvas><p class="muted small center-t">Back</p></div></div>`;

/* ---------- Views ---------- */
const VIEWS = {}, after = {};

VIEWS.dashboard = () => {
  const s = all();
  const c = { total:s.length, pending:s.filter(x=>x.status==="Pending").length, verified:s.filter(x=>ELIGIBLE.includes(x.status)).length, generated:s.filter(x=>x.generated_at).length };
  return `
  <div class="head"><div><h1>Dashboard</h1><p class="muted">One official template. Every ID generated from verified student records.</p></div></div>
  <div class="stack">
    <section class="welcome">
      <span class="sparkle" aria-hidden="true">✦</span><span class="sparkle" aria-hidden="true">✦</span>
      ${LOGO("bloom")}
      <h2>${greeting()}, ${esc(adminName())} 🌸</h2>
      <p>Welcome back to ${esc(BRAND.name)}. ${c.pending ? `${c.pending} student${c.pending>1?"s are":" is"} waiting for verification` : "Everything is verified"} and ${c.generated} ID${c.generated===1?"":"s"} ha${c.generated===1?"s":"ve"} been generated so far.</p>
    </section>
    <div class="stats">
      <div class="stat"><div class="n">${c.total}</div><div class="l">Total students</div></div>
      <div class="stat"><div class="n">${c.pending}</div><div class="l">Pending verification</div></div>
      <div class="stat"><div class="n">${c.verified}</div><div class="l">Verified students</div></div>
      <div class="stat"><div class="n">${c.generated}</div><div class="l">IDs generated</div></div>
    </div>
    ${!S.template.locked?`<div class="lockbar draft"><span><b>The ID template isn't approved yet.</b> IDs can't be generated until it is.</span><button class="btn sm" data-nav="template">Set up template</button></div>`:""}
    <div class="grid2">
      <div class="panel stack"><h2>How IDs get made</h2>
        <div class="flow"><span>Google Form</span><i>›</i><span>Google Sheets</span><i>›</i><span>Database</span><i>›</i><span>Verify</span><i>›</i><span>Generate</span><i>›</i><span>Print or PDF</span></div>
        <p class="muted small">New form responses arrive here automatically, with photo and signature. You can also import a CSV on the Students page.</p>
        <div class="row"><button class="btn primary" data-nav="students">Go to students</button><button class="btn" data-nav="generator">Open ID generator</button></div>
      </div>
      <div class="panel stack"><h2>Recent activity</h2>
        ${S.audit.length?`<table class="log"><tbody>${S.audit.slice(0,6).map(r=>`<tr><td>${fmtDate(r.at)}</td><td>${esc(r.action)} <span class="muted">${esc(r.detail)}</span></td></tr>`).join("")}</tbody></table>`:`<p class="muted small">Nothing yet.</p>`}
      </div>
    </div>
  </div>`;
};

VIEWS.students = () => `
  <div class="head"><div><h1>Students</h1><p class="muted">${S.students.size} records</p></div>
    <div class="row">
      <button class="btn" data-act="exportCsv" ${S.students.size?"":"disabled"}>Export CSV</button>
      <label class="btn" style="position:relative">Import CSV<input type="file" accept=".csv,text/csv" id="csvIn" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>
      <button class="btn primary" data-act="add">Add student</button>
    </div></div>
  <div class="stack">
    <div class="filters">
      <input type="search" id="fq" placeholder="Search by LRN, name, section or adviser" value="${esc(S.f.q)}" aria-label="Search students">
      <select id="fstatus" aria-label="Status"><option value="">All statuses</option>${STATUSES.map(s=>`<option ${S.f.status===s?"selected":""}>${s}</option>`).join("")}</select>
      <select id="fgrade" aria-label="Grade level"><option value="">All grade levels</option>${uniq("year_level").map(s=>`<option ${S.f.grade===s?"selected":""}>${esc(s)}</option>`).join("")}</select>
      <select id="fsection" aria-label="Section"><option value="">All sections</option>${uniq("section").map(s=>`<option ${S.f.section===s?"selected":""}>${esc(s)}</option>`).join("")}</select>
    </div>
    <div id="studentTable">${studentTable(filtered())}</div>
  </div>`;
function studentTable(rows){
  if(!S.students.size) return `<div class="panel empty"><h2>No students yet</h2><p class="muted">Form responses appear here once the Google Sheets sync is set up. You can also import a CSV or add a student by hand.</p></div>`;
  if(!rows.length) return `<div class="panel empty"><h2>No matches</h2><p class="muted">Try a different search or clear the filters.</p></div>`;
  return `<div class="tablewrap"><table>
  <thead><tr><th>Photo</th><th>LRN</th><th>Name</th><th>Grade and section</th><th>Adviser</th><th>Status</th><th>ID generated</th><th>Actions</th></tr></thead>
  <tbody>${rows.map(s=>{ const id=esc(s.id), ok=canGenerate(s); return `<tr>
    <td>${S.photos.get(s.id)?`<img class="thumb" src="${S.photos.get(s.id)}" alt="">`:`<span class="thumb none" data-photo="${id}">${s.photo_path?"":"none"}</span>`}</td>
    <td><b>${esc(s.student_id)}</b></td><td>${esc(listName(s))}</td><td>${esc(gradeSection(s))}</td><td>${esc(s.adviser)}</td>
    <td>${pill(s.status)}</td><td class="small">${fmtDate(s.generated_at)}</td>
    <td><div class="acts">
      <button class="linkbtn" data-act="view" data-id="${id}">View</button>
      <button class="linkbtn" data-act="edit" data-id="${id}">Edit</button>
      ${s.status==="Pending"||s.status==="Rejected"?`<button class="linkbtn" data-act="verify" data-id="${id}">Verify</button>`:""}
      <button class="linkbtn" data-act="preview" data-id="${id}" ${ok?"":`disabled title="${S.template.locked?"Verify this student first":"Approve the ID template first"}"`}>Generate ID</button>
      <button class="linkbtn" data-act="print1" data-id="${id}" ${ok&&s.generated_at?"":"disabled"}>Print</button>
      <button class="linkbtn" data-act="pdf1" data-id="${id}" ${ok&&s.generated_at?"":"disabled"}>Download PDF</button>
    </div></td></tr>`; }).join("")}</tbody></table></div>`;
}
after.students = () => {
  const upd = () => { $("#studentTable").innerHTML = studentTable(filtered()); hydrateThumbs(); };
  $("#fq").addEventListener("input", e=>{ S.f.q=e.target.value; upd(); });
  $("#fstatus").addEventListener("change", e=>{ S.f.status=e.target.value; upd(); });
  $("#fgrade").addEventListener("change", e=>{ S.f.grade=e.target.value; upd(); });
  $("#fsection").addEventListener("change", e=>{ S.f.section=e.target.value; upd(); });
  $("#csvIn").addEventListener("change", e=>importCSV(e.target.files[0]));
  hydrateThumbs();
};
async function hydrateThumbs(){
  for(const el of document.querySelectorAll("[data-photo]")){
    const p = await getAsset(el.dataset.photo, "photo");
    if(p && el.isConnected){ const img=document.createElement("img"); img.className="thumb"; img.src=p; img.alt=""; el.replaceWith(img); }
  }
}

VIEWS.generator = () => {
  const list = all().filter(s=>ELIGIBLE.includes(s.status));
  [...S.sel].forEach(id=>{ if(!list.find(s=>s.id===id)) S.sel.delete(id); });
  return `
  <div class="head"><div><h1>ID generator</h1><p class="muted">Only verified or approved students appear here. Every ID uses the official template.</p></div>
    <div class="row"><button class="btn" data-act="selall">${S.sel.size===list.length&&list.length?"Clear selection":"Select all"}</button>
    <button class="btn primary" data-act="bulk" ${S.sel.size&&S.template.locked?"":"disabled"}>Generate selected IDs (${S.sel.size})</button></div></div>
  ${!S.template.locked?`<div class="lockbar draft" style="margin-bottom:16px"><span>Approve the ID template before generating IDs.</span><button class="btn sm" data-nav="template">Open template</button></div>`:""}
  ${list.length?`<div class="tablewrap checklist">${list.map(s=>`<label><input type="checkbox" data-sel="${esc(s.id)}" ${S.sel.has(s.id)?"checked":""}>
    <span style="flex:1;min-width:0"><b>${esc(listName(s))}</b> <span class="muted small">${esc(s.student_id)} · ${esc(gradeSection(s))}</span></span>
    ${s.photo_path?"":`<span class="pill s-Pending">No photo</span>`} ${s.signature_path?"":`<span class="pill s-Pending">No signature</span>`} ${pill(s.status)}</label>`).join("")}</div>`
  :`<div class="panel empty"><h2>No verified students</h2><p class="muted">Verify students on the Students page and they'll show up here.</p><button class="btn" data-nav="students">Go to students</button></div>`}`;
};
after.generator = () => document.querySelectorAll("[data-sel]").forEach(cb=>cb.addEventListener("change", e=>{
  e.target.checked ? S.sel.add(e.target.dataset.sel) : S.sel.delete(e.target.dataset.sel); render();
}));

VIEWS.generated = () => {
  const list = all().filter(s=>s.generated_at);
  return `<div class="head"><div><h1>Generated IDs</h1><p class="muted">${list.length} IDs on file</p></div>
  ${list.length?`<div class="row"><button class="btn" data-act="printAll">Print all</button><button class="btn primary" data-act="pdfAll">Download all as PDF</button></div>`:""}</div>
  ${list.length?`<div class="cardgrid">${list.map(s=>`<figure>${cardPair(`data-card="${esc(s.id)}"`, listName(s))}
    <figcaption><b>${esc(listName(s))}</b><br><span class="muted">${esc(s.student_id)}</span> ${pill(s.status)}<br>
    <button class="linkbtn" data-act="print1" data-id="${esc(s.id)}">Print</button> &nbsp; <button class="linkbtn" data-act="pdf1" data-id="${esc(s.id)}">PDF</button></figcaption></figure>`).join("")}</div>`
  :`<div class="panel empty"><h2>No IDs generated yet</h2><p class="muted">Generate IDs from the ID generator.</p><button class="btn" data-nav="generator">Open ID generator</button></div>`}`;
};
after.generated = async () => { for(const c of document.querySelectorAll("[data-card]")){ const s=S.students.get(c.dataset.card); if(s&&c.isConnected) await drawCard(s,S.template,c,false,c.dataset.side); } };

VIEWS.verify = () => `
  <div class="head"><div><h1>Verification</h1><p class="muted">What someone sees after scanning the QR code on the back of an ID. Only approved fields are shown.</p></div></div>
  <div class="grid2"><form class="panel stack" id="vform">
    <label class="f">LRN<input type="text" id="vq" placeholder="12-digit LRN" required></label>
    <button class="btn primary" type="submit">Check ID</button>
    <p class="muted small">QR codes open <b>${esc(siteUrl())}/verify.html</b> with a private code for each student, so LRNs can't be guessed.</p>
  </form><div id="vout"></div></div>`;
after.verify = () => $("#vform").addEventListener("submit", async e=>{
  e.preventDefault(); const q=$("#vq").value.trim().toLowerCase();
  const s = all().find(x=>String(x.student_id).toLowerCase()===q);
  if(!s){ $("#vout").innerHTML = `<div class="panel verify"><h2>Student ID verification</h2><div class="badge invalid">✕ No matching LRN</div></div>`; return; }
  const { data } = await sb.rpc("verify_student",{ code:s.verify_token });
  const r = data?.[0];
  $("#vout").innerHTML = r ? `<div class="panel verify"><h2>Student ID verification</h2><dl class="kv" style="margin-top:14px">
    <dt>LRN</dt><dd>${esc(r.lrn)}</dd><dt>Name</dt><dd>${esc(r.name)}</dd><dt>Grade and section</dt><dd>${esc(r.grade_section)}</dd>
    <dt>Status</dt><dd>${esc(r.status)}</dd><dt>School year</dt><dd>${esc(r.school_year)}</dd></dl>
    <div class="badge ${r.valid?"valid":"invalid"}">${r.valid?"✓ Valid student ID":"✕ This ID is not valid"}</div>
    <p style="margin-top:12px"><a class="linkbtn" href="${esc(verifyURL(s))}" target="_blank" rel="noopener">Open the public page</a></p></div>` : "";
});

VIEWS.template = () => {
  const T=S.template, L=T.locked, dis=L?"disabled":"";
  const imgSlot = (k,label,hint="") => `<div class="imgslot"><span class="small" style="font-weight:600;min-width:118px">${label}</span>${T[k]?`<img src="${T[k]}" alt="">`:`<span class="muted small">${hint||"None"}</span>`}
    <label class="btn sm" style="position:relative">${T[k]?"Replace":"Upload"}<input type="file" accept="image/png,image/jpeg,image/webp" data-img="${k}" ${dis} style="position:absolute;inset:0;opacity:0"></label>
    ${T[k]&&!L?`<button type="button" class="linkbtn" data-act="clearimg" data-id="${k}">Remove</button>`:""}</div>`;
  const check = (k,label) => `<label class="row small" style="font-weight:600;gap:8px"><input type="checkbox" name="${k}" ${T[k]!==false?"checked":""} ${dis} style="width:17px;height:17px;accent-color:var(--brand)"> ${label}</label>`;
  return `
  <div class="head"><div><h1>ID template</h1><p class="muted">The single official front and back design used for every student. Configure it once, then approve it.</p></div></div>
  <div class="stack">
    <div class="lockbar ${L?"locked":"draft"}">${L
      ?`<span><b>Official template, version ${T.version}.</b> Approved ${fmtDate(T.approved_at)} by ${esc(T.approved_by)}. Locked against changes.</span><button class="btn sm" data-act="unlock">Unlock to revise</button>`
      :`<span><b>Draft, version ${T.version}.</b> Save, review the preview, then approve. IDs can only be generated from an approved template.</span><button class="btn sm primary" data-act="approve">Approve as official template</button>`}</div>
    <div class="tpl">
      <form class="stack" id="tplForm">
        <div class="panel stack"><h2>Front: school details</h2><div class="fields">
          <label class="f">School name<input type="text" name="school_name" value="${esc(T.school_name)}" ${dis}></label>
          <label class="f">School ID<input type="text" name="school_id_no" value="${esc(T.school_id_no)}" ${dis}></label>
          <label class="f">Current school year<input type="text" name="school_year" value="${esc(T.school_year)}" ${dis}><small>Used for student records and QR verification.</small></label>
        </div>
          <label class="f">School address<textarea name="school_address" rows="2" ${dis}>${esc(T.school_address)}</textarea><small>Two lines. Press Enter to choose where the second line starts.</small></label>
          ${imgSlot("logo","School logo")}
          ${imgSlot("logo2","Second logo","e.g. DepEd logo")}
          ${check("show_watermark","Show the school logo as a faint watermark")}
        </div>
        <div class="panel stack"><h2>Front: background</h2>
          <div class="f"><span class="small" style="font-weight:600">Green design color</span><div class="swatch"><input type="color" name="primary_color" value="${esc(T.primary_color)}" ${dis} aria-label="Green design color"><span class="small muted">${esc(T.primary_color)}</span></div></div>
          ${imgSlot("front_bg","Front artwork","Built-in green design")}
          <p class="muted small">Optional. Upload the exact background artwork (54 × 85.6 mm, portrait) to replace the built-in green design.</p>
        </div>
        <div class="panel stack"><h2>Back</h2>
          <label class="f">Validity note<textarea name="validity_text" rows="3" ${dis}>${esc(T.validity_text)}</textarea></label>
          <div class="fields">
            <label class="f">Principal's name<input type="text" name="signatory" value="${esc(T.signatory)}" ${dis}></label>
            <label class="f">Title<input type="text" name="signatory_title" value="${esc(T.signatory_title)}" ${dis}></label>
          </div>
          ${imgSlot("signature","Principal's signature")}
          ${imgSlot("back_bg","Back artwork","Plain white")}
          ${check("show_qr","Print a verification QR code on the back")}
          <label class="f">Website address<input type="url" name="site_url" value="${esc(T.site_url)}" placeholder="${esc(siteUrl())}" ${dis}><small>Where this site is hosted. QR codes open its verify page.</small></label>
        </div>
        ${L?"":`<div class="row"><button class="btn primary" type="submit">Save changes</button><span class="muted small" id="tplSaveState">${S.tplDirty?"Unsaved changes":"All changes saved"}</span></div>`}
      </form>
      <div class="previewcol panel stack"><h3>Preview</h3>
        ${cardPair(`data-tpl="1"`,"")}
        <p class="muted small">Shown with a sample long name to test fitting.</p></div>
    </div>
  </div>`;
};
const SAMPLE = { id:"sample", student_id:"123456789012", last_name:"Dela Cruz-Villanueva", first_name:"Maria Cristina", middle_name:"Santos",
  year_level:"Grade 10", section:"Sample", adviser:"Juan P. Reyes", sex:"Female", dob:"2011-08-17", blood_type:"O+",
  emergency_name:"Ana S. Dela Cruz", emergency_address:"Tablon, Cagayan de Oro City", emergency_contact:"09XXXXXXXXX", verify_token:"sample" };
function drawTplPreview(){ document.querySelectorAll("[data-tpl]").forEach(c=>drawCard(SAMPLE,S.template,c,true,c.dataset.side)); }
after.template = () => {
  drawTplPreview();
  if(S.template.locked) return;
  let t;
  const dirty = () => { S.tplDirty=true; $("#tplSaveState").textContent="Unsaved changes"; clearTimeout(t); t=setTimeout(drawTplPreview,150); };
  $("#tplForm").addEventListener("input", e=>{
    const el=e.target; if(!el.name) return;
    S.template[el.name] = el.type==="checkbox" ? el.checked : el.value;
    if(el.type==="color") el.nextElementSibling.textContent = el.value;
    dirty();
  });
  $("#tplForm").addEventListener("submit", async e=>{ e.preventDefault(); if(await saveTemplate()) toast("Template saved."); });
  document.querySelectorAll("[data-img]").forEach(inp=>inp.addEventListener("change", async e=>{
    const k=e.target.dataset.img, f=e.target.files[0], err=validateImage(f,8); if(err) return toast(err,"err");
    try{
      S.template[k] = k==="signature" ? await blobToDataURL(await cleanSignature(f))
                    : /_bg$/.test(k) ? await downscale(f,1300,"image/jpeg") : await downscale(f,700);
    }catch(x){ return toast(x.message || "Couldn't read that image.","err"); }
    S.tplDirty=true; render();
  }));
};
async function saveTemplate(extra={}){
  const { id, updated_at, approved_at, approved_by, version, ...fields } = S.template;
  const { data, error } = await sb.from("id_template").update({ ...fields, ...extra }).eq("id",1).select().single();
  if(error){ dbErr(error); return false; }
  S.template = data; S.tplDirty = false;
  const st = $("#tplSaveState"); if(st) st.textContent = "All changes saved";
  loadAudit(); return true;
}

VIEWS.audit = () => `<div class="head"><div><h1>Audit log</h1><p class="muted">Sign-ins, record changes, template changes and ID generation. Entries can't be edited or deleted.</p></div>
  <button class="btn" data-act="refreshAudit">Refresh</button></div>
  ${S.audit.length?`<div class="tablewrap"><table class="log"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead><tbody>
  ${S.audit.map(r=>`<tr><td>${fmtDate(r.at)}</td><td>${esc(r.actor)}</td><td>${esc(r.action)}</td><td class="muted">${esc(r.detail)}</td></tr>`).join("")}</tbody></table></div>`
  :`<div class="panel empty"><p class="muted">No activity yet.</p></div>`}`;

/* ---------- Card rendering (design lives in card.js) ---------- */
const imgCache = new Map();
function loadImg(src){
  if(!src) return Promise.resolve(null);
  if(imgCache.has(src)) return imgCache.get(src);
  const p = new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; });
  imgCache.set(src,p); return p;
}
let fontsLoaded = null;
function fontsReady(){
  return fontsLoaded ||= Promise.all(['700 20px "Tinos"','700 20px "Arimo"','500 20px "Roboto Condensed"','700 20px "Roboto Condensed"']
    .map(f=>document.fonts.load(f))).catch(()=>{});
}
async function cardAssets(s, T, isSample){
  const [logo, logo2, frontBg, backBg, principalSig, photo, studentSig] = await Promise.all([
    loadImg(T.logo), loadImg(T.logo2), loadImg(T.front_bg), loadImg(T.back_bg), loadImg(T.signature),
    isSample ? null : getAsset(s.id,"photo").then(loadImg),
    isSample ? null : getAsset(s.id,"sig").then(loadImg)
  ]);
  let qr = null;
  if(T.show_qr !== false && window.QRious){ qr = document.createElement("canvas"); new QRious({ element:qr, value:verifyURL(s), size:330, level:"L", padding:0, background:"#FFFFFF", foreground:"#000000" }); }
  return { logo, logo2, frontBg, backBg, principalSig, photo, studentSig, qr };
}
async function drawCard(s, T, canvas, isSample=false, side="front"){
  await fontsReady();
  const a = await cardAssets(s, T, isSample);
  canvas = canvas || document.createElement("canvas");
  return side === "back" ? IDCard.drawBack(canvas, s, T, a) : IDCard.drawFront(canvas, s, T, a);
}

/* ---------- Photos and signatures (private storage bucket) ---------- */
function validateImage(file,maxMB=10){
  if(!file) return "Choose an image file.";
  if(!/^image\/(jpeg|png|webp)$/.test(file.type)) return "Use a JPG, PNG or WEBP image.";
  if(file.size>maxMB*1024*1024) return `The image is larger than ${maxMB} MB.`;
  return "";
}
const blobToDataURL = b => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(b); });
async function blobImg(blob){ const url=await blobToDataURL(blob), img=await loadImg(url); imgCache.delete(url); if(!img) throw new Error("Couldn't read that image. Use a JPG or PNG."); return img; }
async function downscale(file,maxPx,type="image/png"){
  const img=await blobImg(file), s=Math.min(1,maxPx/Math.max(img.width,img.height)), c=document.createElement("canvas");
  c.width=Math.round(img.width*s); c.height=Math.round(img.height*s);
  const g=c.getContext("2d"); if(type==="image/jpeg"){ g.fillStyle="#fff"; g.fillRect(0,0,c.width,c.height); }
  g.drawImage(img,0,0,c.width,c.height);
  return c.toDataURL(type, .85);
}
// Crop to the fixed photo area (32 × 33 mm), keeping the upper-centre (face) region. Never stretches.
async function cropPhoto(blob){
  const img=await blobImg(blob);
  if(img.width<200||img.height<200) throw new Error("The photo is too small. Use at least 200 × 200 pixels.");
  const c=document.createElement("canvas"); c.width=640; c.height=660;
  const r=img.width/img.height, R=640/660; let sw,sh,sx,sy;
  if(r>R){ sh=img.height; sw=sh*R; sx=(img.width-sw)/2; sy=0; } else { sw=img.width; sh=sw/R; sx=0; sy=(img.height-sh)*.25; }
  c.getContext("2d").drawImage(img,sx,sy,sw,sh,0,0,640,660);
  return new Promise(res=>c.toBlob(res,"image/jpeg",.88));
}
// Turn a photographed or scanned signature into dark ink on a transparent background, trimmed.
async function cleanSignature(blob){
  const img=await blobImg(blob), s=Math.min(1,1000/Math.max(img.width,img.height));
  const w=Math.max(1,Math.round(img.width*s)), h=Math.max(1,Math.round(img.height*s));
  const c=document.createElement("canvas"); c.width=w; c.height=h; const g=c.getContext("2d");
  g.fillStyle="#fff"; g.fillRect(0,0,w,h); g.drawImage(img,0,0,w,h);
  const d=g.getImageData(0,0,w,h), px=d.data;
  let lum=0; for(let i=0;i<px.length;i+=4) lum+=.299*px[i]+.587*px[i+1]+.114*px[i+2];
  const paper=lum/(px.length/4), cut=Math.min(200,paper-40);
  let x0=w,y0=h,x1=0,y1=0;
  for(let i=0;i<px.length;i+=4){
    const L=.299*px[i]+.587*px[i+1]+.114*px[i+2];
    if(L>=cut){ px[i+3]=0; continue; }
    px[i]=px[i+1]=px[i+2]=Math.max(0,L*.35); px[i+3]=Math.min(255,(cut-L)*4);
    const p=i/4, x=p%w, y=(p/w)|0; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
  }
  g.putImageData(d,0,0);
  if(x1<=x0||y1<=y0) throw new Error("No signature found in that image. Use dark ink on white paper.");
  const pad=6, out=document.createElement("canvas");
  x0=Math.max(0,x0-pad); y0=Math.max(0,y0-pad); x1=Math.min(w-1,x1+pad); y1=Math.min(h-1,y1+pad);
  out.width=x1-x0+1; out.height=y1-y0+1; out.getContext("2d").drawImage(c,x0,y0,out.width,out.height,0,0,out.width,out.height);
  return new Promise(res=>out.toBlob(res,"image/png"));
}
const KINDS = {
  photo: { path:"photo_path", done:"photo_processed", cache:()=>S.photos, process:cropPhoto, ext:"jpg", type:"image/jpeg", folder:"photos" },
  sig:   { path:"signature_path", done:"signature_processed", cache:()=>S.sigs, process:cleanSignature, ext:"png", type:"image/png", folder:"signatures" }
};
async function uploadAsset(id, blob, kind){
  const k=KINDS[kind], path=`${k.folder}/${id}-${Date.now()}.${k.ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType:k.type, upsert:true });
  if(error) throw error; return path;
}
const assetLoads = new Map();
function getAsset(id, kind){
  const k=KINDS[kind], cache=k.cache(), key=kind+":"+id;
  if(cache.has(id)) return Promise.resolve(cache.get(id));
  if(assetLoads.has(key)) return assetLoads.get(key);
  const p = (async ()=>{
    const s=S.students.get(id); if(!s?.[k.path]) return null;
    const { data:blob, error } = await sb.storage.from(BUCKET).download(s[k.path]);
    if(error||!blob) return null;
    let final = blob;
    if(!s[k.done]){ // original from the Google Form: process once and replace
      try{
        final = await k.process(blob);
        const path = await uploadAsset(id, final, kind);
        const { data } = await sb.from("students").update({ [k.path]:path, [k.done]:true }).eq("id",id).select().single();
        if(data){ await sb.storage.from(BUCKET).remove([s[k.path]]); S.students.set(id,data); }
      }catch(e){ console.warn("Image processing failed", e); final = blob; }
    }
    const url = URL.createObjectURL(final); cache.set(id,url); return url;
  })();
  assetLoads.set(key,p); p.finally(()=>assetLoads.delete(key)); return p;
}

/* ---------- Student form ---------- */
const FIELDS = [
  ["student_id","LRN","text",true],["last_name","Last name","text",true],["first_name","First name","text",true],["middle_name","Middle name","text"],
  ["sex","Gender","select",false,["","Female","Male"]],["dob","Birthday","date"],["blood_type","Blood type","select",false,["",...BLOOD]],
  ["year_level","Grade level","select",true,["",...GRADES]],["section","Section","text",true],["adviser","Adviser","text"],
  ["emergency_name","Emergency contact name","text"],["emergency_address","Emergency contact address","text"],["emergency_contact","Emergency contact number","text"],
  ["school_year","School year","text"],["email","Student email","email"],["mobile","Mobile number","text"],
  ["status","ID status","select",true,STATUSES],["remarks","Remarks","text"]
];
function studentForm(s={}){
  const slot = (kind,label,hint) => { const u=KINDS[kind].cache().get(s.id); return `<div class="imgslot"><span class="small" style="font-weight:600;min-width:110px">${label}</span><span id="${kind}Prev">${u?`<img src="${u}" alt="">`:""}</span>
    <label class="btn sm" style="position:relative">Upload<input type="file" accept="image/jpeg,image/png,image/webp" id="${kind}In" style="position:absolute;inset:0;opacity:0"></label>
    <span class="muted small">${hint}</span></div>`; };
  return `<form id="sform" class="stack"><div class="fields">${FIELDS.map(([k,l,t,req,opts])=>{
    const v = s[k] ?? (k==="status"?"Pending":k==="school_year"?S.template.school_year:"");
    if(t==="select"){ const o=opts.includes(v)?opts:[...opts,v]; return `<label class="f">${l}<select name="${k}" ${req?"required":""}>${o.map(x=>`<option ${x===v?"selected":""}>${esc(x)}</option>`).join("")}</select></label>`; }
    return `<label class="f">${l}<input type="${t}" name="${k}" value="${esc(v)}" ${req?"required":""} ${k==="student_id"?'inputmode="numeric"':""}></label>`;
  }).join("")}</div>
  ${slot("photo","Student photo","Cropped to the photo area automatically.")}
  ${slot("sig","Student signature","Dark ink on white paper. The background is removed automatically.")}
  <p class="errtxt" id="serr" role="alert"></p>
  <div class="row"><button class="btn primary" type="submit">Save student</button><button class="btn" type="button" data-act="close">Cancel</button>
  ${s.id?`<span style="flex:1"></span><button class="btn danger" type="button" data-act="del" data-id="${esc(s.id)}">Delete record</button>`:""}</div></form>`;
}
function bindStudentForm(existing){
  const picked = { photo:null, sig:null };
  for(const kind of ["photo","sig"]) $(`#${kind}In`).addEventListener("change", async e=>{
    const f=e.target.files[0], err=validateImage(f); if(err) return ($("#serr").textContent=err);
    try{ picked[kind]=await KINDS[kind].process(f); $(`#${kind}Prev`).innerHTML=`<img src="${URL.createObjectURL(picked[kind])}" alt="">`; $("#serr").textContent=""; }
    catch(x){ $("#serr").textContent=x.message; }
  });
  // Fill the adviser from classmates in the same section.
  const secIn = $('#sform [name="section"]'), advIn = $('#sform [name="adviser"]');
  secIn.addEventListener("change", ()=>{ if(advIn.value) return; const m=all().find(x=>x.section===secIn.value.trim() && x.adviser); if(m) advIn.value=m.adviser; });
  $("#sform").addEventListener("submit", async e=>{
    e.preventDefault();
    const btn=e.target.querySelector("button[type=submit]"); btn.disabled=true; btn.textContent="Saving…";
    const d=Object.fromEntries(new FormData(e.target)); for(const k in d){ d[k]=String(d[k]).trim(); if(d[k]==="") d[k]=null; }
    d.name = fullName(d) || d.last_name;
    if(d.status==="Verified" && existing?.status!=="Verified"){ d.verified_at=new Date().toISOString(); d.verified_by=S.user.email; }
    const id = existing?.id || crypto.randomUUID();
    try{
      for(const kind of ["photo","sig"]) if(picked[kind]){ d[KINDS[kind].path]=await uploadAsset(id,picked[kind],kind); d[KINDS[kind].done]=true; }
      const q = existing ? sb.from("students").update(d).eq("id",id) : sb.from("students").insert({ id, ...d });
      const { data, error } = await q.select().single();
      if(error){ dbErr(error); btn.disabled=false; btn.textContent="Save student"; return; }
      for(const kind of ["photo","sig"]) if(picked[kind]){ const old=existing?.[KINDS[kind].path]; if(old) sb.storage.from(BUCKET).remove([old]); KINDS[kind].cache().set(id, URL.createObjectURL(picked[kind])); }
      S.students.set(id,data); closeModal(); render(); toast("Student saved.");
    }catch(x){ console.error(x); $("#serr").textContent="Couldn't upload the image. Try again."; btn.disabled=false; btn.textContent="Save student"; }
  });
}
function openModal(title,body,sub=""){
  closeModal();
  S.modal=document.createElement("div"); S.modal.className="overlay";
  S.modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="mhead"><div><h2>${esc(title)}</h2>${sub?`<p class="muted small">${sub}</p>`:""}</div><button class="x" data-act="close" aria-label="Close">×</button></div>${body}</div>`;
  S.modal.addEventListener("click", e=>{ if(e.target===S.modal) closeModal(); });
  document.body.appendChild(S.modal); S.modal.querySelector("input,select,button:not(.x)")?.focus();
}
function closeModal(){ S.modal?.remove(); S.modal=null; }
document.addEventListener("keydown", e=>{ if(e.key==="Escape"&&S.modal) closeModal(); });

async function updateStudent(id, patch){
  const { data, error } = await sb.from("students").update(patch).eq("id",id).select().single();
  if(error){ dbErr(error); return null; }
  S.students.set(id,data); return data;
}


/* ---------- Actions ---------- */
const ACTIONS = {
  signout: signOut, close: closeModal,
  add(){ openModal("Add student", studentForm()); bindStudentForm(null); },
  async edit(id){ await Promise.all([getAsset(id,"photo"),getAsset(id,"sig")]); const s=S.students.get(id); openModal("Edit student", studentForm(s), `LRN ${esc(s.student_id)}`); bindStudentForm(s); },
  async view(id){
    const s=S.students.get(id), [p,sg]=await Promise.all([getAsset(id,"photo"),getAsset(id,"sig")]);
    openModal(listName(s), `<div class="previewwrap"><div class="stack">${p?`<img src="${p}" alt="Photo of ${esc(fullName(s))}" style="width:100%;border-radius:6px">`:`<div class="panel empty muted">No photo on file</div>`}
      ${sg?`<img src="${sg}" alt="Signature" style="width:100%;max-height:80px;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:6px">`:`<p class="muted small">No signature on file</p>`}</div>
      <dl class="kv">${FIELDS.map(([k,l])=>`<dt>${l}</dt><dd>${k==="status"?pill(s[k]):esc(k==="dob"?IDCard.fmtBirthday(s[k]):s[k]||"—")}</dd>`).join("")}
      <dt>Submitted</dt><dd>${fmtDate(s.submitted_at)}</dd><dt>ID generated</dt><dd>${fmtDate(s.generated_at)}</dd></dl></div>
      <div class="row" style="margin-top:18px"><button class="btn" data-act="edit" data-id="${esc(id)}">Edit</button>
      ${canGenerate(s)?`<button class="btn primary" data-act="preview" data-id="${esc(id)}">Generate ID</button>`:""}</div>`, `LRN ${esc(s.student_id)}`);
  },
  verify(id){
    const s=S.students.get(id), miss=[!s.photo_path&&"photo",!s.signature_path&&"signature"].filter(Boolean);
    openModal("Verify student", `<p>Confirm that the details, photo and signature for <b>${esc(fullName(s))}</b> (LRN ${esc(s.student_id)}) match school records.</p>
      ${miss.length?`<p class="errtxt" style="margin-top:8px">No ${miss.join(" or ")} on file yet. The ID will print with that area blank.</p>`:""}
      <div class="row" style="margin-top:18px"><button class="btn primary" data-act="doVerify" data-id="${esc(id)}">Mark as verified</button>
      <button class="btn danger" data-act="doReject" data-id="${esc(id)}">Reject</button><button class="btn" data-act="close">Cancel</button></div>`);
  },
  async doVerify(id){ closeModal(); if(await updateStudent(id,{status:"Verified",verified_at:new Date().toISOString(),verified_by:S.user.email})) toast("Student verified."); render(); },
  async doReject(id){ closeModal(); await updateStudent(id,{status:"Rejected"}); render(); },
  async del(id){
    const s=S.students.get(id); if(!confirm(`Delete the record for ${fullName(s)}? This can't be undone.`)) return;
    const { error } = await sb.from("students").delete().eq("id",id); if(error) return dbErr(error);
    const files=[s.photo_path,s.signature_path].filter(Boolean); if(files.length) await sb.storage.from(BUCKET).remove(files);
    S.students.delete(id); S.photos.delete(id); S.sigs.delete(id); closeModal(); render();
  },
  async preview(id){
    const s=S.students.get(id); if(!canGenerate(s)) return;
    const miss=[!s.photo_path&&"photo",!s.signature_path&&"signature"].filter(Boolean);
    openModal("ID preview", `<div class="stack">${flipCard(fullName(s))}
      <dl class="kv"><dt>Student</dt><dd>${esc(fullName(s))}</dd><dt>LRN</dt><dd>${esc(s.student_id)}</dd><dt>Status</dt><dd>${pill(s.status)}</dd>
      <dt>QR opens</dt><dd class="small" style="word-break:break-all;font-weight:400">${esc(verifyURL(s))}</dd></dl>
      ${miss.length?`<p class="errtxt">No ${miss.join(" or ")} on file. Add it before printing.</p>`:""}
      <div class="row"><button class="btn primary" data-act="gen1" data-id="${esc(id)}">${s.generated_at?"Regenerate ID":"Generate ID"}</button>
      <button class="btn" data-act="print1" data-id="${esc(id)}">Print</button><button class="btn" data-act="pdf1" data-id="${esc(id)}">Download PDF</button></div>
      <p class="muted small">Uses official template version ${S.template.version}.</p></div>`);
    document.querySelectorAll("[data-pv]").forEach(c=>drawCard(s,S.template,c,false,c.dataset.side));
  },
  flip(_id, el){
    const card = $("#flipcard"); if(!card) return;
    const back = card.classList.toggle("flipped");
    el.textContent = back ? "Flip to front" : "Flip to back";
    el.setAttribute("aria-pressed", String(back));
  },
  async gen1(id){ if(await markGenerated([id])){ closeModal(); render(); ACTIONS.preview(id); toast("ID generated."); } },
  async print1(id){ const s=S.students.get(id); if(!canGenerate(s)) return; if(!s.generated_at && !(await markGenerated([id]))) return; printIds([id]); },
  async pdf1(id){ const s=S.students.get(id); if(!canGenerate(s)) return; if(!s.generated_at && !(await markGenerated([id]))) return; pdfIds([id],`ID-${s.student_id}.pdf`); },
  selall(){ const l=all().filter(s=>ELIGIBLE.includes(s.status)); if(S.sel.size===l.length) S.sel.clear(); else l.forEach(s=>S.sel.add(s.id)); render(); },
  async bulk(){
    const ids=[...S.sel].filter(id=>canGenerate(S.students.get(id))); if(!ids.length) return;
    if(!(await markGenerated(ids))) return;
    openModal(`${ids.length} IDs generated`, `<p>All ${ids.length} IDs use official template version ${S.template.version}.</p>
      <p class="muted small" style="margin-top:6px">The PDF puts 9 fronts on one A4 page and their backs on the next page, mirrored so they line up when printed double-sided (flip on long edge).</p>
      <div class="row" style="margin-top:16px"><button class="btn primary" data-act="pdfSel">Download PDF</button><button class="btn" data-act="printSel">Print</button><button class="btn" data-nav="generated">View generated IDs</button></div>`);
    render();
  },
  pdfSel(){ pdfIds([...S.sel],`Student-IDs-${new Date().toISOString().slice(0,10)}.pdf`); },
  printSel(){ printIds([...S.sel]); },
  pdfAll(){ pdfIds(all().filter(s=>s.generated_at&&canGenerate(s)).map(s=>s.id),"Student-IDs-all.pdf"); },
  printAll(){ printIds(all().filter(s=>s.generated_at&&canGenerate(s)).map(s=>s.id)); },
  async approve(){
    if(!S.template.school_name.trim()) return toast("Add the school name first.","err");
    if(!confirm("Approve this as the official ID template? Every student's ID will use this exact front and back design.")) return;
    if(await saveTemplate({ locked:true })){ toast("Template approved."); render(); }
  },
  async unlock(){
    if(!confirm("Unlock the official template? IDs can't be generated until you approve it again, and the new version will apply to every student.")) return;
    const { data, error } = await sb.from("id_template").update({ locked:false }).eq("id",1).select().single();
    if(error) return dbErr(error); S.template=data; loadAudit(); render();
  },
  clearimg(k){ S.template[k]=""; S.tplDirty=true; render(); },
  theme(){
    const next = { system:"light", light:"dark", dark:"system" }[theme()];
    try{ localStorage.setItem("sidg-theme", next); }catch{}
    applyTheme(next); render();
  },
  async refreshAudit(){ await loadAudit(); render(); },
  exportCsv(){
    const cols=[["student_id","LRN"],["last_name","Last Name"],["first_name","First Name"],["middle_name","Middle Name"],["sex","Gender"],["dob","Birthday"],["blood_type","Blood Type"],
      ["year_level","Grade Level"],["section","Section"],["adviser","Adviser"],["emergency_name","Emergency Contact Name"],["emergency_address","Emergency Contact Address"],
      ["emergency_contact","Emergency Contact Number"],["school_year","School Year"],["email","Email Address"],["mobile","Mobile Number"],["status","ID Status"],["generated_at","ID Generated"],["remarks","Remarks"]];
    const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;
    const csv="\ufeff"+[cols.map(c=>q(c[1])).join(","),...all().map(s=>cols.map(([k])=>q(s[k])).join(","))].join("\r\n");
    download(new Blob([csv],{type:"text/csv"}),`students-${new Date().toISOString().slice(0,10)}.csv`);
    audit("Records exported",`${S.students.size} students`);
  }
};
async function markGenerated(ids){
  const now=new Date().toISOString();
  for(const id of ids){
    const s=S.students.get(id); if(!canGenerate(s)) continue;
    const r=await updateStudent(id,{ generated_at:now, status:s.status==="Printed"?"Printed":"Generated" });
    if(!r) return false;
  }
  return true;
}

/* ---------- Output: fronts and backs ---------- */
function download(blob,filename){ const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),5000); }
async function cardImages(ids){
  const out=[];
  for(const id of ids){ const s=S.students.get(id); if(!s) continue;
    out.push({ s, front:(await drawCard(s,S.template,null,false,"front")).toDataURL("image/jpeg",.93), back:(await drawCard(s,S.template,null,false,"back")).toDataURL("image/jpeg",.93) }); }
  return out;
}
// A4 layout: 3 columns × 3 rows. Backs are mirrored left-right so they align on double-sided printing.
const GRID = { gap:6, cols:3, rows:3 };
const cellX = (col) => (210 - GRID.cols*CARD_W_MM - (GRID.cols-1)*GRID.gap)/2 + col*(CARD_W_MM+GRID.gap);
const cellY = (row) => (297 - GRID.rows*CARD_H_MM - (GRID.rows-1)*GRID.gap)/2 + row*(CARD_H_MM+GRID.gap);
async function pdfIds(ids,filename){
  if(!ids.length) return; if(!window.jspdf) return toast("The PDF tool didn't load. Reload the page.","err");
  toast("Preparing PDF…","work");
  const imgs=await cardImages(ids), { jsPDF }=window.jspdf; let pdf;
  if(imgs.length===1){
    pdf=new jsPDF({unit:"mm",format:[CARD_W_MM,CARD_H_MM],orientation:"portrait"});
    pdf.addImage(imgs[0].front,"JPEG",0,0,CARD_W_MM,CARD_H_MM);
    pdf.addPage([CARD_W_MM,CARD_H_MM],"portrait"); pdf.addImage(imgs[0].back,"JPEG",0,0,CARD_W_MM,CARD_H_MM);
  } else {
    pdf=new jsPDF({unit:"mm",format:"a4",orientation:"portrait"});
    const per=GRID.cols*GRID.rows;
    for(let p=0;p<imgs.length;p+=per){
      const batch=imgs.slice(p,p+per);
      for(const side of ["front","back"]){
        if(p>0||side==="back") pdf.addPage("a4","portrait");
        batch.forEach((im,k)=>{
          const row=Math.floor(k/GRID.cols), col=k%GRID.cols, c=side==="back"?GRID.cols-1-col:col;
          const x=cellX(c), y=cellY(row);
          pdf.addImage(im[side],"JPEG",x,y,CARD_W_MM,CARD_H_MM); pdf.setDrawColor(190); pdf.setLineWidth(.1); pdf.rect(x,y,CARD_W_MM,CARD_H_MM);
        });
      }
    }
  }
  download(pdf.output("blob"),filename); audit("PDF downloaded",`${imgs.length} ID${imgs.length>1?"s":""}`);
}
async function printIds(ids){
  if(!ids.length) return;
  const imgs=await cardImages(ids), area=$("#printArea"); area.innerHTML="";
  const per=GRID.cols*GRID.rows;
  for(let p=0;p<imgs.length;p+=per){
    for(const side of ["front","back"]){
      const sh=document.createElement("div"); sh.className="sheet "+side;
      imgs.slice(p,p+per).forEach(im=>{ const img=document.createElement("img"); img.src=im[side]; img.alt=""; sh.appendChild(img); });
      area.appendChild(sh);
    }
  }
  await Promise.all([...area.querySelectorAll("img")].map(i=>i.decode().catch(()=>{})));
  document.body.classList.add("printing"); window.print(); document.body.classList.remove("printing");
  if(confirm(`Mark ${imgs.length===1?"this ID":"these "+imgs.length+" IDs"} as printed?`)){
    const now=new Date().toISOString(); for(const im of imgs) await updateStudent(im.s.id,{status:"Printed",printed_at:now});
    closeModal(); render();
  }
}

/* ---------- CSV import (Google Sheets export) ---------- */
function parseCSV(text){
  const rows=[]; let row=[],cell="",q=false;
  for(let i=0;i<text.length;i++){ const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){cell+='"';i++;} else q=false; } else cell+=c; }
    else if(c==='"') q=true; else if(c===","){row.push(cell);cell="";}
    else if(c==="\n"||c==="\r"){ if(c==="\r"&&text[i+1]==="\n") i++; row.push(cell); rows.push(row); row=[]; cell=""; } else cell+=c; }
  if(cell||row.length){ row.push(cell); rows.push(row); }
  return rows.filter(r=>r.some(x=>x.trim()));
}
function toISODate(v){
  const s=String(v).trim(), dmy=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if(dmy){ const [,a,b,y]=dmy; const [mo,d]= +a>12 ? [b,a] : [a,b]; return `${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
  const d=new Date(s); return isNaN(d)?null:d.toISOString().slice(0,10);
}
function normGrade(v){ const n=String(v||"").match(/\d+/); return n ? "Grade "+n[0] : v; }
async function importCSV(file){
  if(!file) return; if(file.size>5*1024*1024) return toast("That file is larger than 5 MB.","err");
  const rows=parseCSV((await file.text()).replace(/^\ufeff/,""));
  if(rows.length<2) return toast("The file has no student rows.","err");
  const head=rows[0].map(h=>SHEET_MAP[h.trim().toLowerCase().replace(/\s*\*$/,"")]||null);
  if(!head.includes("student_id")) return toast("Couldn't find the LRN column.","err");
  if(!head.includes("last_name") && !head.includes("name")) return toast("Couldn't find the Last Name column.","err");
  const keys=[...new Set(head.filter(Boolean).filter(k=>k!=="photo_source"&&k!=="signature_source"))];
  if(!keys.includes("name")) keys.push("name");
  const recs=new Map(); let skipped=0;
  for(const r of rows.slice(1)){
    const d=Object.fromEntries(keys.map(k=>[k,null])); head.forEach((k,i)=>{ if(k && keys.includes(k)){ const v=(r[i]||"").trim(); d[k]=v||null; } });
    if(!d.student_id){ skipped++; continue; }
    if(!d.name) d.name = fullName(d);
    if(!d.name){ skipped++; continue; }
    if(d.dob) d.dob=toISODate(d.dob);
    if(d.year_level) d.year_level=normGrade(d.year_level);
    if("submitted_at" in d && d.submitted_at){ const t=new Date(d.submitted_at); d.submitted_at=isNaN(t)?null:t.toISOString(); }
    recs.set(d.student_id,d); // last row wins for duplicate LRNs
  }
  const list=[...recs.values()]; let done=0;
  for(let i=0;i<list.length;i+=200){
    const { error } = await sb.from("students").upsert(list.slice(i,i+200),{ onConflict:"student_id" });
    if(error){ dbErr(error,"Import stopped partway. Check the file and try again."); break; }
    done+=Math.min(200,list.length-i);
  }
  await audit("Imported CSV",`${done} rows saved, ${skipped} skipped`);
  await loadStudents(); render();
  toast(`${done} students saved${skipped?`, ${skipped} skipped (missing LRN or name)`:""}. Photos and signatures come through the Google Form sync.`);
}

boot();
