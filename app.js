/* Student ID Generator — admin app (Supabase backend) */
const cfg = window.APP_CONFIG || {};
const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

/* ---------- Constants ---------- */
const STATUSES = ["Pending","Verified","Approved","Generated","Printed","Rejected"];
const ELIGIBLE = ["Verified","Approved","Generated","Printed"];
const CARD_W_MM = 54, CARD_H_MM = 85.6, PX = 12;
const FONTS = ["Public Sans","Archivo","Source Serif 4"];
const BUCKET = "student-photos";
const SHEET_MAP = {
  "timestamp":"submitted_at","student id number":"student_id","student id":"student_id",
  "complete name":"name","name":"name","date of birth":"dob","sex":"sex",
  "college / school / department":"college","college":"college","department":"college",
  "course / program":"course","course":"course","program":"course","year level":"year_level",
  "section":"section","school year":"school_year","student email address":"email","student email":"email",
  "email":"email","mobile number":"mobile","student id photo":"photo_source","student photo":"photo_source"
};

/* ---------- State ---------- */
const S = {
  user:null, template:null, tplDirty:false,
  students:new Map(), photos:new Map(), audit:[],
  view:"dashboard", f:{q:"",status:"",course:"",year:""}, sel:new Set(), modal:null, channel:null
};

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtDate = t => t ? new Date(t).toLocaleString(undefined,{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "—";
function toast(msg){ const t=document.createElement("div"); t.className="toast"; t.setAttribute("role","status"); t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),3600); }
function dbErr(error, fallback="Couldn't save. Check your connection and try again."){
  if(!error) return;
  const m = error.message || "";
  if(error.code === "23505") toast("Another student already has this student ID.");
  else if(/template|verified|approved|locked/i.test(m)) toast(m);
  else toast(fallback);
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
    if(p.eventType==="DELETE"){ S.students.delete(p.old.id); S.photos.delete(p.old.id); }
    else { const cur = S.students.get(p.new.id); if(cur && cur.photo_path!==p.new.photo_path) S.photos.delete(p.new.id); S.students.set(p.new.id, p.new); }
    const typing = document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if(!S.modal && !typing && S.view!=="template") render();
  }).subscribe();
}

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
    <div><h1>Admin sign in</h1><p class="muted small" style="margin-top:6px">For authorized school personnel only.</p></div>
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
  $("#root").innerHTML = '<div class="spin">Loading student records…</div>';
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
      <div class="mark"><div class="card-ico" aria-hidden="true"></div><div><b>Student ID</b><span>Generator</span></div></div>
      <nav class="nav" aria-label="Main">${NAV.map(([k,l])=>`<button data-nav="${k}" ${k===S.view?'aria-current="page"':""}>${l}</button>`).join("")}</nav>
      <div class="foot"><div style="margin-bottom:8px">● Database connected</div>Signed in as <b>${esc(S.user.email)}</b><br><button data-act="signout">Sign out</button></div>
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
const all = () => [...S.students.values()].sort((a,b)=>String(a.student_id).localeCompare(String(b.student_id)));
const uniq = f => [...new Set(all().map(s=>s[f]).filter(Boolean))].sort();
const pill = st => `<span class="pill s-${esc(st)}">${esc(st)}</span>`;
const canGenerate = s => s && ELIGIBLE.includes(s.status) && S.template.locked;
function filtered(){
  const {q,status,course,year} = S.f, ql = q.trim().toLowerCase();
  return all().filter(s=>{
    if(status && s.status!==status) return false;
    if(course && s.course!==course) return false;
    if(year && s.year_level!==year) return false;
    if(ql && ![s.student_id,s.name,s.course,s.section,s.year_level].join(" ").toLowerCase().includes(ql)) return false;
    return true;
  });
}

/* ---------- Views ---------- */
const VIEWS = {}, after = {};

VIEWS.dashboard = () => {
  const s = all();
  const c = { total:s.length, pending:s.filter(x=>x.status==="Pending").length, verified:s.filter(x=>ELIGIBLE.includes(x.status)).length, generated:s.filter(x=>x.generated_at).length };
  return `
  <div class="head"><div><h1>Student ID management</h1><p class="muted">One official template. Every ID generated from verified student records.</p></div></div>
  <div class="stack">
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
        <p class="muted small">New form responses arrive here automatically, photos included. You can also import a CSV on the Students page.</p>
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
      <input type="search" id="fq" placeholder="Search by student ID, name, course, section or year" value="${esc(S.f.q)}" aria-label="Search students">
      <select id="fstatus" aria-label="Status"><option value="">All statuses</option>${STATUSES.map(s=>`<option ${S.f.status===s?"selected":""}>${s}</option>`).join("")}</select>
      <select id="fcourse" aria-label="Course"><option value="">All courses</option>${uniq("course").map(s=>`<option ${S.f.course===s?"selected":""}>${esc(s)}</option>`).join("")}</select>
      <select id="fyear" aria-label="Year level"><option value="">All year levels</option>${uniq("year_level").map(s=>`<option ${S.f.year===s?"selected":""}>${esc(s)}</option>`).join("")}</select>
    </div>
    <div id="studentTable">${studentTable(filtered())}</div>
  </div>`;
function studentTable(rows){
  if(!S.students.size) return `<div class="panel empty"><h2>No students yet</h2><p class="muted">Form responses appear here once the Google Sheets sync is set up. You can also import a CSV or add a student by hand.</p></div>`;
  if(!rows.length) return `<div class="panel empty"><h2>No matches</h2><p class="muted">Try a different search or clear the filters.</p></div>`;
  return `<div class="tablewrap"><table>
  <thead><tr><th>Photo</th><th>Student ID</th><th>Complete name</th><th>Course</th><th>Year</th><th>Section</th><th>School year</th><th>Status</th><th>ID generated</th><th>Actions</th></tr></thead>
  <tbody>${rows.map(s=>{ const id=esc(s.id), ok=canGenerate(s); return `<tr>
    <td>${S.photos.get(s.id)?`<img class="thumb" src="${S.photos.get(s.id)}" alt="">`:`<span class="thumb none" data-photo="${id}">${s.photo_path?"":"none"}</span>`}</td>
    <td><b>${esc(s.student_id)}</b></td><td>${esc(s.name)}</td><td>${esc(s.course)}</td><td>${esc(s.year_level)}</td><td>${esc(s.section)}</td><td>${esc(s.school_year)}</td>
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
  $("#fcourse").addEventListener("change", e=>{ S.f.course=e.target.value; upd(); });
  $("#fyear").addEventListener("change", e=>{ S.f.year=e.target.value; upd(); });
  $("#csvIn").addEventListener("change", e=>importCSV(e.target.files[0]));
  hydrateThumbs();
};
async function hydrateThumbs(){
  for(const el of document.querySelectorAll("[data-photo]")){
    const p = await getPhoto(el.dataset.photo);
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
    <span style="flex:1;min-width:0"><b>${esc(s.name)}</b> <span class="muted small">${esc(s.student_id)} · ${esc(s.course)} · ${esc(s.year_level)} ${esc(s.section)}</span></span>
    ${s.photo_path?"":`<span class="pill s-Pending">No photo</span>`} ${pill(s.status)}</label>`).join("")}</div>`
  :`<div class="panel empty"><h2>No verified students</h2><p class="muted">Verify students on the Students page and they'll show up here.</p><button class="btn" data-nav="students">Go to students</button></div>`}`;
};
after.generator = () => document.querySelectorAll("[data-sel]").forEach(cb=>cb.addEventListener("change", e=>{
  e.target.checked ? S.sel.add(e.target.dataset.sel) : S.sel.delete(e.target.dataset.sel); render();
}));

VIEWS.generated = () => {
  const list = all().filter(s=>s.generated_at);
  return `<div class="head"><div><h1>Generated IDs</h1><p class="muted">${list.length} IDs on file</p></div>
  ${list.length?`<div class="row"><button class="btn" data-act="printAll">Print all</button><button class="btn primary" data-act="pdfAll">Download all as PDF</button></div>`:""}</div>
  ${list.length?`<div class="cardgrid">${list.map(s=>`<figure><canvas class="idcard" data-card="${esc(s.id)}" role="img" aria-label="ID card for ${esc(s.name)}"></canvas>
    <figcaption><b>${esc(s.name)}</b><br><span class="muted">${esc(s.student_id)}</span> ${pill(s.status)}<br>
    <button class="linkbtn" data-act="print1" data-id="${esc(s.id)}">Print</button> &nbsp; <button class="linkbtn" data-act="pdf1" data-id="${esc(s.id)}">PDF</button></figcaption></figure>`).join("")}</div>`
  :`<div class="panel empty"><h2>No IDs generated yet</h2><p class="muted">Generate IDs from the ID generator.</p><button class="btn" data-nav="generator">Open ID generator</button></div>`}`;
};
after.generated = async () => { for(const c of document.querySelectorAll("[data-card]")){ const s=S.students.get(c.dataset.card); if(s&&c.isConnected) await drawCard(s,S.template,c); } };

VIEWS.verify = () => `
  <div class="head"><div><h1>Verification</h1><p class="muted">What someone sees after scanning a student's QR code. Only approved fields are shown.</p></div></div>
  <div class="grid2"><form class="panel stack" id="vform">
    <label class="f">Student ID number<input type="text" id="vq" placeholder="e.g. 2026-0001" required></label>
    <button class="btn primary" type="submit">Check ID</button>
    <p class="muted small">QR codes open <b>${esc(siteUrl())}/verify.html</b> with a private code for each student, so student numbers can't be guessed.</p>
  </form><div id="vout"></div></div>`;
after.verify = () => $("#vform").addEventListener("submit", async e=>{
  e.preventDefault(); const q=$("#vq").value.trim().toLowerCase();
  const s = all().find(x=>String(x.student_id).toLowerCase()===q);
  if(!s){ $("#vout").innerHTML = `<div class="panel verify"><h2>Student ID verification</h2><div class="badge invalid">✕ No matching student ID</div></div>`; return; }
  const { data } = await sb.rpc("verify_student",{ code:s.verify_token });
  const r = data?.[0];
  $("#vout").innerHTML = r ? `<div class="panel verify"><h2>Student ID verification</h2><dl class="kv" style="margin-top:14px">
    <dt>Student ID</dt><dd>${esc(r.student_id)}</dd><dt>Name</dt><dd>${esc(r.name)}</dd><dt>Course</dt><dd>${esc(r.course)}</dd>
    <dt>Year level</dt><dd>${esc(r.year_level)}</dd><dt>Status</dt><dd>${esc(r.status)}</dd><dt>School year</dt><dd>${esc(r.school_year)}</dd></dl>
    <div class="badge ${r.valid?"valid":"invalid"}">${r.valid?"✓ Valid student ID":"✕ This ID is not valid"}</div>
    <p style="margin-top:12px"><a class="linkbtn" href="${esc(verifyURL(s))}" target="_blank" rel="noopener">Open the public page</a></p></div>` : "";
});

VIEWS.template = () => {
  const T=S.template, L=T.locked, dis=L?"disabled":"";
  const imgSlot = (k,label) => `<div class="imgslot"><span class="small" style="font-weight:600">${label}</span>${T[k]?`<img src="${T[k]}" alt="">`:""}
    <label class="btn sm" style="position:relative">${T[k]?"Replace":"Upload"}<input type="file" accept="image/png,image/jpeg,image/webp" data-img="${k}" ${dis} style="position:absolute;inset:0;opacity:0"></label>
    ${T[k]&&!L?`<button type="button" class="linkbtn" data-act="clearimg" data-id="${k}">Remove</button>`:""}</div>`;
  return `
  <div class="head"><div><h1>ID template</h1><p class="muted">The single official design used for every student. Configure it once, then approve it.</p></div></div>
  <div class="stack">
    <div class="lockbar ${L?"locked":"draft"}">${L
      ?`<span><b>Official template, version ${T.version}.</b> Approved ${fmtDate(T.approved_at)} by ${esc(T.approved_by)}. Locked against changes.</span><button class="btn sm" data-act="unlock">Unlock to revise</button>`
      :`<span><b>Draft, version ${T.version}.</b> Save, review the preview, then approve. IDs can only be generated from an approved template.</span><button class="btn sm primary" data-act="approve">Approve as official template</button>`}</div>
    <div class="tpl">
      <form class="stack" id="tplForm">
        <div class="panel stack"><h2>School details</h2><div class="fields">
          <label class="f">School name<input type="text" name="school_name" value="${esc(T.school_name)}" ${dis}></label>
          <label class="f">School address<input type="text" name="school_address" value="${esc(T.school_address)}" ${dis}></label>
          <label class="f">School year printed on IDs<input type="text" name="school_year" value="${esc(T.school_year)}" ${dis}></label>
        </div>${imgSlot("logo","School logo")}</div>
        <div class="panel stack"><h2>Look</h2><div class="fields">
          <div class="f"><span class="small" style="font-weight:600">Primary color</span><div class="swatch"><input type="color" name="primary_color" value="${esc(T.primary_color)}" ${dis} aria-label="Primary color"><span class="small muted">${esc(T.primary_color)}</span></div></div>
          <div class="f"><span class="small" style="font-weight:600">Accent color</span><div class="swatch"><input type="color" name="accent_color" value="${esc(T.accent_color)}" ${dis} aria-label="Accent color"><span class="small muted">${esc(T.accent_color)}</span></div></div>
          <label class="f">Typeface<select name="font" ${dis}>${FONTS.map(f=>`<option ${T.font===f?"selected":""}>${f}</option>`).join("")}</select></label>
          <label class="f">Largest name size<select name="name_max_size" ${dis}>${[[3.8,"Small"],[4.4,"Medium"],[5,"Large"]].map(([v,l])=>`<option value="${v}" ${+T.name_max_size===v?"selected":""}>${l}</option>`).join("")}</select><small>Long names shrink or wrap automatically.</small></label>
        </div><p class="muted small">Card size: CR80, 54 × 85.6 mm portrait. Photo area: 22 × 27.5 mm (4:5), cropped automatically.</p></div>
        <div class="panel stack"><h2>Signature and verification</h2><div class="fields">
          <label class="f">Signatory name<input type="text" name="signatory" value="${esc(T.signatory)}" ${dis}></label>
          <label class="f">Signatory title<input type="text" name="signatory_title" value="${esc(T.signatory_title)}" ${dis}></label>
          <label class="f">Website address<input type="url" name="site_url" value="${esc(T.site_url)}" placeholder="${esc(siteUrl())}" ${dis}><small>Where this site is hosted. QR codes open its verify page.</small></label>
        </div>${imgSlot("signature","Signature image")}</div>
        ${L?"":`<div class="row"><button class="btn primary" type="submit">Save changes</button><span class="muted small" id="tplSaveState">${S.tplDirty?"Unsaved changes":"All changes saved"}</span></div>`}
      </form>
      <div class="previewcol panel stack" style="align-items:center"><h3 style="align-self:flex-start">Preview</h3>
        <canvas class="idcard" id="tplPreview" role="img" aria-label="Template preview"></canvas>
        <p class="muted small" style="text-align:center">Shown with a sample long name to test fitting.</p></div>
    </div>
  </div>`;
};
const SAMPLE = { id:"sample", student_id:"2026-00001", name:"Ma. Cristina Alexandra Dela Cruz-Villanueva", course:"BS Information Technology", year_level:"4th Year", section:"IT4R1", verify_token:"sample" };
after.template = () => {
  drawCard(SAMPLE, S.template, $("#tplPreview"), true);
  if(S.template.locked) return;
  const dirty = () => { S.tplDirty=true; $("#tplSaveState").textContent="Unsaved changes"; drawCard(SAMPLE,S.template,$("#tplPreview"),true); };
  $("#tplForm").addEventListener("input", e=>{
    const el=e.target; if(!el.name) return;
    S.template[el.name] = el.name==="name_max_size" ? +el.value : el.value;
    if(el.type==="color") el.nextElementSibling.textContent = el.value;
    dirty();
  });
  $("#tplForm").addEventListener("submit", async e=>{ e.preventDefault(); if(await saveTemplate()) toast("Template saved."); });
  document.querySelectorAll("[data-img]").forEach(inp=>inp.addEventListener("change", async e=>{
    const f=e.target.files[0], err=validateImage(f,3); if(err) return toast(err);
    S.template[e.target.dataset.img] = await downscale(f,600); S.tplDirty=true; render();
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

/* ---------- Card rendering: the one fixed template ---------- */
const imgCache = new Map();
function loadImg(src){
  if(!src) return Promise.resolve(null);
  if(imgCache.has(src)) return imgCache.get(src);
  const p = new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; });
  imgCache.set(src,p); return p;
}
async function fontsReady(f){ try{ await Promise.all(["800","700","600","400"].map(w=>document.fonts.load(`${w} 20px "${f}"`))); }catch{} }
function fitText(ctx,text,maxW,maxSize,minSize,maxLines,weight,family){
  const words=String(text||"").split(/\s+/).filter(Boolean);
  for(let lines=1;lines<=maxLines;lines++) for(let size=maxSize;size>=minSize;size-=0.1){
    ctx.font=`${weight} ${size*PX}px "${family}"`; const out=wrap(ctx,words,maxW*PX,lines); if(out) return {size,lines:out};
  }
  ctx.font=`${weight} ${minSize*PX}px "${family}"`; return {size:minSize,lines:wrap(ctx,words,maxW*PX,maxLines,true)};
}
function wrap(ctx,words,maxW,maxLines,force=false){
  const lines=[]; let cur="";
  for(const w of words){ const t=cur?cur+" "+w:w; if(ctx.measureText(t).width<=maxW) cur=t; else { if(!cur){ if(!force) return null; cur=w; } lines.push(cur); cur=w; } }
  if(cur) lines.push(cur);
  if(!force && lines.some(l=>ctx.measureText(l).width>maxW)) return null;
  if(lines.length>maxLines){ if(!force) return null; const k=lines.slice(0,maxLines); let l=k[maxLines-1]; while(ctx.measureText(l+"…").width>maxW&&l.length) l=l.slice(0,-1); k[maxLines-1]=l+"…"; return k; }
  return lines;
}
function drawLines(ctx,fit,x,top,h,align,lh=1.12){ let y=top+(h-fit.lines.length*fit.size*lh)/2; ctx.textAlign=align; ctx.textBaseline="top"; for(const l of fit.lines){ ctx.fillText(l,x*PX,y*PX); y+=fit.size*lh; } }
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function drawCover(ctx,img,x,y,w,h){ const r=img.width/img.height,R=w/h; let sw,sh,sx,sy; if(r>R){sh=img.height;sw=sh*R;sx=(img.width-sw)/2;sy=0;} else {sw=img.width;sh=sw/R;sx=0;sy=(img.height-sh)*0.25;} ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h); }
function drawContain(ctx,img,x,y,w,h){ const s=Math.min(w/img.width,h/img.height),dw=img.width*s,dh=img.height*s; ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh); }

async function drawCard(s,T,canvas,isSample=false){
  canvas = canvas || document.createElement("canvas");
  const W=Math.round(CARD_W_MM*PX), H=Math.round(CARD_H_MM*PX); canvas.width=W; canvas.height=H;
  const f=T.font; await fontsReady(f);
  const [logo,sig,photo] = await Promise.all([loadImg(T.logo), loadImg(T.signature), isSample?null:getPhoto(s.id).then(loadImg)]);
  const ctx=canvas.getContext("2d"), m=v=>v*PX, INK="#1A1F1C", MUTED="#5E6763";
  ctx.fillStyle="#FFFFFF"; ctx.fillRect(0,0,W,H);
  ctx.fillStyle=T.primary_color; ctx.fillRect(0,0,W,m(19));
  ctx.fillStyle="#FFFFFF"; roundRect(ctx,m(3.5),m(3),m(13),m(13),m(6.5)); ctx.fill();
  if(logo){ ctx.save(); roundRect(ctx,m(3.5),m(3),m(13),m(13),m(6.5)); ctx.clip(); drawContain(ctx,logo,m(4.3),m(3.8),m(11.4),m(11.4)); ctx.restore(); }
  else { ctx.fillStyle=T.primary_color; ctx.globalAlpha=.25; ctx.font=`700 ${m(2)}px "${f}"`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("LOGO",m(10),m(9.5)); ctx.globalAlpha=1; }
  ctx.fillStyle="#FFFFFF"; drawLines(ctx,fitText(ctx,T.school_name,32.5,3.4,2.1,2,800,f),18.8,2.6,9.2,"left",1.08);
  ctx.globalAlpha=.85; drawLines(ctx,fitText(ctx,T.school_address,32.5,1.75,1.35,2,400,f),18.8,11.8,4.8,"left",1.15); ctx.globalAlpha=1;
  ctx.fillStyle=T.accent_color; ctx.fillRect(0,m(19),W,m(1.1));
  const px=16,py=22.6,pw=22,ph=27.5;
  if(photo) drawCover(ctx,photo,m(px),m(py),m(pw),m(ph));
  else { ctx.fillStyle="#E7EBE9"; ctx.fillRect(m(px),m(py),m(pw),m(ph)); ctx.fillStyle="#B9C2BE"; ctx.beginPath(); ctx.arc(m(px+pw/2),m(py+10.5),m(4.6),0,Math.PI*2); ctx.fill(); ctx.save(); ctx.beginPath(); ctx.rect(m(px),m(py),m(pw),m(ph)); ctx.clip(); ctx.beginPath(); ctx.ellipse(m(px+pw/2),m(py+ph+2),m(9),m(9.5),0,Math.PI,0); ctx.fill(); ctx.restore(); }
  ctx.strokeStyle=T.primary_color; ctx.lineWidth=m(.35); ctx.strokeRect(m(px),m(py),m(pw),m(ph));
  ctx.fillStyle=INK; drawLines(ctx,fitText(ctx,String(s.name||"").toUpperCase(),48,+T.name_max_size||4.4,2.3,2,800,f),27,51.6,8.4,"center",1.08);
  ctx.fillStyle=T.primary_color; drawLines(ctx,fitText(ctx,s.course,48,2.7,1.8,2,600,f),27,60.2,5,"center",1.1);
  ctx.textAlign="left"; ctx.textBaseline="top";
  ctx.fillStyle=MUTED; ctx.font=`600 ${m(1.6)}px "${f}"`; ctx.fillText("Student ID",m(4),m(67));
  ctx.fillStyle=INK; const idf=fitText(ctx,s.student_id,30,3.3,2,1,800,f); ctx.font=`800 ${m(idf.size)}px "${f}"`; ctx.fillText(idf.lines[0]||"",m(4),m(68.8));
  ctx.fillStyle=MUTED; ctx.font=`600 ${m(1.6)}px "${f}"`; ctx.fillText("Year and section",m(4),m(72.9));
  ctx.fillStyle=INK; const ys=fitText(ctx,[s.year_level,s.section].filter(Boolean).join(" – "),30,2.5,1.6,1,700,f); ctx.font=`700 ${m(ys.size)}px "${f}"`; ctx.fillText(ys.lines[0]||"",m(4),m(74.6));
  if(sig) drawContain(ctx,sig,m(4),m(77.2),m(13),m(2.4));
  if(T.signatory){ ctx.fillStyle=MUTED; const sg=fitText(ctx,T.signatory+(T.signatory_title?", "+T.signatory_title:""),30,1.35,1.05,1,400,f); ctx.font=`400 ${m(sg.size)}px "${f}"`; ctx.fillText(sg.lines[0]||"",m(4),m(79.7)); }
  if(T.show_qr!==false && window.QRious){
    const qc=document.createElement("canvas");
    new QRious({element:qc,value:verifyURL(s),size:400,level:"M",background:"#FFFFFF",foreground:"#000000",padding:0});
    ctx.fillStyle="#FFFFFF"; ctx.fillRect(m(35.8),m(66.3),m(14.7),m(14.7));
    ctx.imageSmoothingEnabled=false; ctx.drawImage(qc,m(36.3),m(66.8),m(13.7),m(13.7)); ctx.imageSmoothingEnabled=true;
  }
  ctx.fillStyle=T.primary_color; ctx.fillRect(0,m(81.4),W,H-m(81.4));
  ctx.fillStyle="#FFFFFF"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.font=`700 ${m(1.9)}px "${f}"`;
  ctx.fillText("Academic Year "+(T.school_year||s.school_year||""),W/2,m(83.5));
  return canvas;
}

/* ---------- Photos (private storage bucket) ---------- */
function validateImage(file,maxMB=10){
  if(!file) return "Choose an image file.";
  if(!/^image\/(jpeg|png|webp)$/.test(file.type)) return "Use a JPG, PNG or WEBP image.";
  if(file.size>maxMB*1024*1024) return `The image is larger than ${maxMB} MB.`;
  return "";
}
const readURL = b => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(b); });
async function downscale(file,maxPx){
  const img=await loadImg(await readURL(file)); if(!img) throw new Error("bad image");
  const s=Math.min(1,maxPx/Math.max(img.width,img.height)), c=document.createElement("canvas");
  c.width=Math.round(img.width*s); c.height=Math.round(img.height*s); c.getContext("2d").drawImage(img,0,0,c.width,c.height);
  return c.toDataURL("image/png");
}
// Crop to the fixed 4:5 photo area, keeping the upper-centre (face) region. Never stretches.
async function cropPhoto(blob){
  const url=await readURL(blob), img=await loadImg(url); imgCache.delete(url);
  if(!img) throw new Error("Couldn't read that image. Use a JPG or PNG.");
  if(img.width<200||img.height<250) throw new Error("The photo is too small. Use at least 200 × 250 pixels.");
  const c=document.createElement("canvas"); c.width=480; c.height=600; drawCover(c.getContext("2d"),img,0,0,480,600);
  return new Promise(res=>c.toBlob(res,"image/jpeg",.86));
}
async function uploadPhoto(id, blob){
  const path = `photos/${id}-${Date.now()}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType:"image/jpeg", upsert:true });
  if(error) throw error; return path;
}
const photoLoads = new Map();
function getPhoto(id){
  if(S.photos.has(id)) return Promise.resolve(S.photos.get(id));
  if(photoLoads.has(id)) return photoLoads.get(id);
  const p = (async ()=>{
    const s=S.students.get(id); if(!s?.photo_path) return null;
    const { data:blob, error } = await sb.storage.from(BUCKET).download(s.photo_path);
    if(error||!blob) return null;
    let final = blob;
    if(!s.photo_processed){ // original from the Google Form: crop once and replace
      try{
        final = await cropPhoto(blob);
        const path = await uploadPhoto(id, final);
        const { data } = await sb.from("students").update({ photo_path:path, photo_processed:true }).eq("id",id).select().single();
        if(data){ await sb.storage.from(BUCKET).remove([s.photo_path]); S.students.set(id,data); }
      }catch(e){ console.warn("Photo processing failed", e); final = blob; }
    }
    const url = URL.createObjectURL(final); S.photos.set(id,url); return url;
  })();
  photoLoads.set(id,p); p.finally(()=>photoLoads.delete(id)); return p;
}

/* ---------- Student form ---------- */
const FIELDS = [
  ["student_id","Student ID number","text",true],["name","Complete name","text",true],["dob","Date of birth","date"],
  ["sex","Sex","select",false,["","Female","Male"]],["college","College / school / department","text"],
  ["course","Course / program","text",true],["year_level","Year level","select",true,["","1st Year","2nd Year","3rd Year","4th Year","5th Year"]],
  ["section","Section","text"],["school_year","School year","text"],["email","Student email","email"],["mobile","Mobile number","text"],
  ["status","ID status","select",true,STATUSES],["remarks","Remarks","text"]
];
function studentForm(s={}){
  return `<form id="sform" class="stack"><div class="fields">${FIELDS.map(([k,l,t,req,opts])=>{
    const v = s[k] ?? (k==="status"?"Pending":k==="school_year"?S.template.school_year:"");
    if(t==="select"){ const o=opts.includes(v)?opts:[...opts,v]; return `<label class="f">${l}<select name="${k}" ${req?"required":""}>${o.map(x=>`<option ${x===v?"selected":""}>${esc(x)}</option>`).join("")}</select></label>`; }
    return `<label class="f">${l}<input type="${t}" name="${k}" value="${esc(v)}" ${req?"required":""}></label>`;
  }).join("")}</div>
  <div class="imgslot"><span class="small" style="font-weight:600">Student photo</span><span id="photoPrev">${S.photos.get(s.id)?`<img src="${S.photos.get(s.id)}" alt="">`:""}</span>
    <label class="btn sm" style="position:relative">Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" id="photoIn" style="position:absolute;inset:0;opacity:0"></label>
    <span class="muted small">Cropped to 4:5 automatically.</span></div>
  <p class="errtxt" id="serr" role="alert"></p>
  <div class="row"><button class="btn primary" type="submit">Save student</button><button class="btn" type="button" data-act="close">Cancel</button>
  ${s.id?`<span style="flex:1"></span><button class="btn danger" type="button" data-act="del" data-id="${esc(s.id)}">Delete record</button>`:""}</div></form>`;
}
function bindStudentForm(existing){
  let newPhoto=null;
  $("#photoIn").addEventListener("change", async e=>{
    const f=e.target.files[0], err=validateImage(f); if(err) return ($("#serr").textContent=err);
    try{ newPhoto=await cropPhoto(f); $("#photoPrev").innerHTML=`<img src="${URL.createObjectURL(newPhoto)}" alt="">`; $("#serr").textContent=""; }
    catch(x){ $("#serr").textContent=x.message; }
  });
  $("#sform").addEventListener("submit", async e=>{
    e.preventDefault();
    const btn=e.target.querySelector("button[type=submit]"); btn.disabled=true; btn.textContent="Saving…";
    const d=Object.fromEntries(new FormData(e.target)); for(const k in d){ d[k]=String(d[k]).trim(); if(d[k]==="" && k!=="course") d[k]=null; }
    if(d.status==="Verified" && existing?.status!=="Verified"){ d.verified_at=new Date().toISOString(); d.verified_by=S.user.email; }
    const id = existing?.id || crypto.randomUUID();
    try{
      if(newPhoto){ d.photo_path = await uploadPhoto(id,newPhoto); d.photo_processed = true; }
      const q = existing ? sb.from("students").update(d).eq("id",id) : sb.from("students").insert({ id, ...d });
      const { data, error } = await q.select().single();
      if(error){ dbErr(error); btn.disabled=false; btn.textContent="Save student"; return; }
      if(newPhoto){ if(existing?.photo_path) sb.storage.from(BUCKET).remove([existing.photo_path]); S.photos.set(id, URL.createObjectURL(newPhoto)); }
      S.students.set(id,data); closeModal(); render(); toast("Student saved.");
    }catch(x){ console.error(x); $("#serr").textContent="Couldn't upload the photo. Try again."; btn.disabled=false; btn.textContent="Save student"; }
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
  async edit(id){ await getPhoto(id); const s=S.students.get(id); openModal("Edit student", studentForm(s), `Student ID ${esc(s.student_id)}`); bindStudentForm(s); },
  async view(id){
    const s=S.students.get(id), p=await getPhoto(id);
    openModal(s.name, `<div class="previewwrap"><div>${p?`<img src="${p}" alt="Photo of ${esc(s.name)}" style="width:100%;border-radius:6px">`:`<div class="panel empty muted">No photo on file</div>`}</div>
      <dl class="kv">${FIELDS.map(([k,l])=>`<dt>${l}</dt><dd>${k==="status"?pill(s[k]):esc(s[k]||"—")}</dd>`).join("")}
      <dt>Submitted</dt><dd>${fmtDate(s.submitted_at)}</dd><dt>ID generated</dt><dd>${fmtDate(s.generated_at)}</dd></dl></div>
      ${s.photo_source?`<p class="muted small" style="margin-top:12px;word-break:break-all">Form photo: ${esc(s.photo_source)}</p>`:""}
      <div class="row" style="margin-top:18px"><button class="btn" data-act="edit" data-id="${esc(id)}">Edit</button>
      ${canGenerate(s)?`<button class="btn primary" data-act="preview" data-id="${esc(id)}">Generate ID</button>`:""}</div>`, `Student ID ${esc(s.student_id)}`);
  },
  verify(id){
    const s=S.students.get(id);
    openModal("Verify student", `<p>Confirm that the details and photo for <b>${esc(s.name)}</b> (${esc(s.student_id)}) match school records.</p>
      ${s.photo_path?"":`<p class="errtxt" style="margin-top:8px">This student has no photo yet. The ID will print with a blank photo area.</p>`}
      <div class="row" style="margin-top:18px"><button class="btn primary" data-act="doVerify" data-id="${esc(id)}">Mark as verified</button>
      <button class="btn danger" data-act="doReject" data-id="${esc(id)}">Reject</button><button class="btn" data-act="close">Cancel</button></div>`);
  },
  async doVerify(id){ closeModal(); if(await updateStudent(id,{status:"Verified",verified_at:new Date().toISOString(),verified_by:S.user.email})) toast("Student verified."); render(); },
  async doReject(id){ closeModal(); await updateStudent(id,{status:"Rejected"}); render(); },
  async del(id){
    const s=S.students.get(id); if(!confirm(`Delete the record for ${s.name}? This can't be undone.`)) return;
    const { error } = await sb.from("students").delete().eq("id",id); if(error) return dbErr(error);
    if(s.photo_path) await sb.storage.from(BUCKET).remove([s.photo_path]);
    S.students.delete(id); S.photos.delete(id); closeModal(); render();
  },
  async preview(id){
    const s=S.students.get(id); if(!canGenerate(s)) return;
    openModal("ID preview", `<div class="previewwrap"><canvas class="idcard" id="pv" role="img" aria-label="ID preview for ${esc(s.name)}"></canvas>
      <div class="stack"><dl class="kv"><dt>Student</dt><dd>${esc(s.name)}</dd><dt>Student ID</dt><dd>${esc(s.student_id)}</dd><dt>Status</dt><dd>${pill(s.status)}</dd>
      <dt>QR opens</dt><dd class="small" style="word-break:break-all;font-weight:400">${esc(verifyURL(s))}</dd></dl>
      ${s.photo_path?"":`<p class="errtxt">No photo on file. Add one before printing.</p>`}
      <div class="row"><button class="btn primary" data-act="gen1" data-id="${esc(id)}">${s.generated_at?"Regenerate ID":"Generate ID"}</button>
      <button class="btn" data-act="print1" data-id="${esc(id)}">Print</button><button class="btn" data-act="pdf1" data-id="${esc(id)}">Download PDF</button></div>
      <p class="muted small">Uses official template version ${S.template.version}.</p></div></div>`);
    drawCard(s,S.template,$("#pv"));
  },
  async gen1(id){ if(await markGenerated([id])){ closeModal(); render(); ACTIONS.preview(id); toast("ID generated."); } },
  async print1(id){ const s=S.students.get(id); if(!canGenerate(s)) return; if(!s.generated_at && !(await markGenerated([id]))) return; printIds([id]); },
  async pdf1(id){ const s=S.students.get(id); if(!canGenerate(s)) return; if(!s.generated_at && !(await markGenerated([id]))) return; pdfIds([id],`ID-${s.student_id}.pdf`); },
  selall(){ const l=all().filter(s=>ELIGIBLE.includes(s.status)); if(S.sel.size===l.length) S.sel.clear(); else l.forEach(s=>S.sel.add(s.id)); render(); },
  async bulk(){
    const ids=[...S.sel].filter(id=>canGenerate(S.students.get(id))); if(!ids.length) return;
    if(!(await markGenerated(ids))) return;
    openModal(`${ids.length} IDs generated`, `<p>All ${ids.length} IDs use official template version ${S.template.version}.</p>
      <div class="row" style="margin-top:16px"><button class="btn primary" data-act="pdfSel">Download PDF (A4, 9 per page)</button><button class="btn" data-act="printSel">Print</button><button class="btn" data-nav="generated">View generated IDs</button></div>`);
    render();
  },
  pdfSel(){ pdfIds([...S.sel],`Student-IDs-${new Date().toISOString().slice(0,10)}.pdf`); },
  printSel(){ printIds([...S.sel]); },
  pdfAll(){ pdfIds(all().filter(s=>s.generated_at&&canGenerate(s)).map(s=>s.id),"Student-IDs-all.pdf"); },
  printAll(){ printIds(all().filter(s=>s.generated_at&&canGenerate(s)).map(s=>s.id)); },
  async approve(){
    if(!S.template.school_name.trim()) return toast("Add the school name first.");
    if(!confirm("Approve this as the official ID template? Every student's ID will use this exact design.")) return;
    if(await saveTemplate({ locked:true })){ toast("Template approved."); render(); }
  },
  async unlock(){
    if(!confirm("Unlock the official template? IDs can't be generated until you approve it again, and the new version will apply to every student.")) return;
    const { data, error } = await sb.from("id_template").update({ locked:false }).eq("id",1).select().single();
    if(error) return dbErr(error); S.template=data; loadAudit(); render();
  },
  clearimg(k){ S.template[k]=""; S.tplDirty=true; render(); },
  async refreshAudit(){ await loadAudit(); render(); },
  exportCsv(){
    const cols=[["student_id","Student ID Number"],["name","Complete Name"],["dob","Date of Birth"],["sex","Sex"],["college","College / School / Department"],["course","Course / Program"],["year_level","Year Level"],["section","Section"],["school_year","School Year"],["email","Student Email Address"],["mobile","Mobile Number"],["status","ID Status"],["generated_at","ID Generated"],["remarks","Remarks"]];
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

/* ---------- Output ---------- */
function download(blob,filename){ const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),5000); }
async function cardImages(ids){ const out=[]; for(const id of ids){ const s=S.students.get(id); if(!s) continue; out.push({s,url:(await drawCard(s,S.template)).toDataURL("image/jpeg",.92)}); } return out; }
async function pdfIds(ids,filename){
  if(!ids.length) return; if(!window.jspdf) return toast("The PDF tool didn't load. Reload the page.");
  toast("Preparing PDF…");
  const imgs=await cardImages(ids), { jsPDF }=window.jspdf; let pdf;
  if(imgs.length===1){ pdf=new jsPDF({unit:"mm",format:[CARD_W_MM,CARD_H_MM],orientation:"portrait"}); pdf.addImage(imgs[0].url,"JPEG",0,0,CARD_W_MM,CARD_H_MM); }
  else {
    pdf=new jsPDF({unit:"mm",format:"a4",orientation:"portrait"});
    const gap=6,cols=3,rows=3,x0=(210-cols*CARD_W_MM-(cols-1)*gap)/2,y0=(297-rows*CARD_H_MM-(rows-1)*gap)/2;
    imgs.forEach((im,i)=>{ const k=i%9; if(i&&!k) pdf.addPage(); const x=x0+(k%cols)*(CARD_W_MM+gap), y=y0+Math.floor(k/cols)*(CARD_H_MM+gap);
      pdf.addImage(im.url,"JPEG",x,y,CARD_W_MM,CARD_H_MM); pdf.setDrawColor(190); pdf.setLineWidth(.1); pdf.rect(x,y,CARD_W_MM,CARD_H_MM); });
  }
  download(pdf.output("blob"),filename); audit("PDF downloaded",`${imgs.length} ID${imgs.length>1?"s":""}`);
}
async function printIds(ids){
  if(!ids.length) return;
  const imgs=await cardImages(ids), area=$("#printArea"); area.innerHTML="";
  for(let i=0;i<imgs.length;i+=9){ const sh=document.createElement("div"); sh.className="sheet"; imgs.slice(i,i+9).forEach(im=>{ const img=document.createElement("img"); img.src=im.url; img.alt=""; sh.appendChild(img); }); area.appendChild(sh); }
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
function toISODate(v){ const d=new Date(v); return isNaN(d)?null:d.toISOString().slice(0,10); }
async function importCSV(file){
  if(!file) return; if(file.size>5*1024*1024) return toast("That file is larger than 5 MB.");
  const rows=parseCSV((await file.text()).replace(/^\ufeff/,""));
  if(rows.length<2) return toast("The file has no student rows.");
  const head=rows[0].map(h=>SHEET_MAP[h.trim().toLowerCase()]||null);
  if(!head.includes("student_id")||!head.includes("name")) return toast("Couldn't find the Student ID Number and Complete Name columns.");
  const keys=[...new Set(head.filter(Boolean))], recs=new Map(); let skipped=0;
  for(const r of rows.slice(1)){
    const d=Object.fromEntries(keys.map(k=>[k,null])); head.forEach((k,i)=>{ if(k){ const v=(r[i]||"").trim(); d[k]=v||null; } });
    if(!d.student_id||!d.name){ skipped++; continue; }
    if("dob" in d && d.dob) d.dob=toISODate(d.dob);
    if("submitted_at" in d && d.submitted_at){ const t=new Date(d.submitted_at); d.submitted_at=isNaN(t)?null:t.toISOString(); }
    if("course" in d && !d.course) d.course="";
    recs.set(d.student_id,d); // last row wins for duplicate IDs
  }
  const list=[...recs.values()]; let done=0;
  for(let i=0;i<list.length;i+=200){
    const { error } = await sb.from("students").upsert(list.slice(i,i+200),{ onConflict:"student_id" });
    if(error){ dbErr(error,"Import stopped partway. Check the file and try again."); break; }
    done+=Math.min(200,list.length-i);
  }
  await audit("Imported CSV",`${done} rows saved, ${skipped} skipped`);
  await loadStudents(); render(); toast(`${done} students saved${skipped?`, ${skipped} skipped (missing ID or name)`:""}.`);
}

boot();
