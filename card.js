/* Fixed ID template (front + back). Pure drawing: caller passes loaded images.
   Units are millimetres on a CR80 card (54 × 85.6 mm), scaled by IDCard.PX. */
(function (root) {
  const W_MM = 54, H_MM = 85.6, PX = 12;
  const F = {
    serif: '"Tinos","Times New Roman",Times,serif',
    sans: '"Arimo",Arial,Helvetica,sans-serif',
    cond: '"Roboto Condensed","Arial Narrow",Arial,sans-serif'
  };
  let makeCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const m = v => v * PX;

  /* ---------- text helpers ---------- */
  // Draw one line, compressing horizontally if it's wider than maxW. Returns [left, right] in mm.
  function line(ctx, text, x, base, maxW, size, weight, fam, align = "center", opt = {}) {
    text = String(text ?? "");
    ctx.font = `${weight} ${m(size)}px ${fam}`;
    const w = ctx.measureText(text).width, sx = Math.min(1, m(maxW) / (w || 1)), dw = w * sx / PX;
    const left = align === "center" ? x - dw / 2 : align === "right" ? x - dw : x;
    ctx.save(); ctx.translate(m(left), m(base)); ctx.scale(sx, 1);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    if (opt.halo) { ctx.lineJoin = "round"; ctx.strokeStyle = opt.halo; ctx.lineWidth = m(opt.haloW || .45) / sx; ctx.strokeText(text, 0, 0); }
    ctx.fillStyle = opt.color || "#000"; ctx.fillText(text, 0, 0);
    ctx.restore();
    if (opt.underline) { ctx.fillStyle = opt.color || "#000"; ctx.fillRect(m(left), m(base + size * .14), m(dw), m(opt.ulW || .22)); }
    return [left, left + dw];
  }
  // Word-wrap into up to maxLines, shrinking the size until it fits.
  function block(ctx, text, cx, firstBase, maxW, maxSize, minSize, maxLines, weight, fam, lead = 1.33, opt = {}) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    let lines = [], size = maxSize;
    for (; size >= minSize; size -= .05) {
      ctx.font = `${weight} ${m(size)}px ${fam}`; lines = []; let cur = "";
      for (const w of words) { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width <= m(maxW) || !cur) cur = t; else { lines.push(cur); cur = w; } }
      if (cur) lines.push(cur);
      if (lines.length <= maxLines && lines.every(l => ctx.measureText(l).width <= m(maxW))) break;
    }
    lines.slice(0, maxLines).forEach((l, i) => line(ctx, l, cx, firstBase + i * size * lead, maxW, size, weight, fam, "center", opt));
  }

  /* ---------- image helpers ---------- */
  function cover(ctx, img, x, y, w, h) {
    const r = img.width / img.height, R = w / h; let sw, sh, sx, sy;
    if (r > R) { sh = img.height; sw = sh * R; sx = (img.width - sw) / 2; sy = 0; }
    else { sw = img.width; sh = sw / R; sx = 0; sy = (img.height - sh) * .25; } // keep the face (upper part)
    ctx.drawImage(img, sx, sy, sw, sh, m(x), m(y), m(w), m(h));
  }
  function contain(ctx, img, x, y, w, h) {
    const s = Math.min(m(w) / img.width, m(h) / img.height), dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, m(x) + (m(w) - dw) / 2, m(y) + (m(h) - dh) / 2, dw, dh);
  }

  /* ---------- default green textured background ---------- */
  let texCache = null;
  function texture() {
    if (texCache) return texCache;
    const c = makeCanvas(160, 160), g = c.getContext("2d"), img = g.createImageData(160, 160);
    let seed = 20260921; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rnd(), light = v > .5;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = light ? 255 : 0;
      img.data[i + 3] = Math.floor(Math.abs(v - .5) * 2 * 60);
    }
    g.putImageData(img, 0, 0);
    return (texCache = c);
  }
  function shade(hex, amt) {
    const n = parseInt(String(hex).replace("#", ""), 16) || 0x1E8B32;
    const f = c => Math.max(0, Math.min(255, Math.round(c + (amt > 0 ? (255 - c) * amt : c * amt))));
    return "#" + [n >> 16 & 255, n >> 8 & 255, n & 255].map(f).map(v => v.toString(16).padStart(2, "0")).join("");
  }
  function greenPath(ctx, pathFn, color) {
    ctx.save(); ctx.beginPath(); pathFn(ctx); ctx.closePath(); ctx.clip();
    const g = ctx.createLinearGradient(0, 0, m(W_MM), m(H_MM));
    g.addColorStop(0, shade(color, .28)); g.addColorStop(.5, color); g.addColorStop(1, shade(color, -.35));
    ctx.fillStyle = g; ctx.fillRect(0, 0, m(W_MM), m(H_MM));
    ctx.fillStyle = ctx.createPattern(texture(), "repeat"); ctx.fillRect(0, 0, m(W_MM), m(H_MM));
    ctx.restore();
  }
  const P = (ctx, pts) => { ctx.moveTo(m(pts[0]), m(pts[1])); };
  function drawDefaultFront(ctx, color) {
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, m(W_MM), m(H_MM));
    // top swoosh
    greenPath(ctx, c => { P(c, [0, 0]); c.lineTo(m(54), 0); c.lineTo(m(54), m(24)); c.bezierCurveTo(m(49), m(16), m(41), m(9.5), m(29), m(5.6)); c.bezierCurveTo(m(19), m(2.6), m(8), m(2.2), 0, m(3.2)); }, color);
    // bottom swoosh
    greenPath(ctx, c => { P(c, [0, 62.5]); c.bezierCurveTo(m(13), m(68.5), m(31), m(77.5), m(54), m(76.2)); c.lineTo(m(54), m(85.6)); c.lineTo(0, m(85.6)); }, color);
    // white highlight curves
    ctx.save(); ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineCap = "round";
    ctx.lineWidth = m(1.1); ctx.beginPath(); ctx.moveTo(m(-1), m(75.5)); ctx.bezierCurveTo(m(16), m(82.5), m(36), m(84.8), m(55), m(81.4)); ctx.stroke();
    ctx.restore();
  }

  /* ---------- name helpers ---------- */
  function nameParts(s) {
    let last = (s.last_name || "").trim(), first = (s.first_name || "").trim();
    if (!last && s.name) { const w = String(s.name).trim().split(/\s+/); last = w.pop() || ""; first = w.join(" "); }
    const mi = (s.middle_name || "").trim();
    const initial = mi ? (mi.length <= 2 ? mi.replace(/\.?$/, ".") : mi[0] + ".") : "";
    return { last, first, initial };
  }
  const gradeNum = g => String(g || "").replace(/^grade\s*/i, "").trim();
  function fmtBirthday(d) {
    if (!d) return "";
    const x = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return x ? `${x[3]}/${x[2]}/${x[1]}` : String(d);
  }

  /* ---------- FRONT ---------- */
  function drawFront(canvas, s, T, a) {
    canvas.width = Math.round(m(W_MM)); canvas.height = Math.round(m(H_MM));
    const ctx = canvas.getContext("2d"), color = T.primary_color || "#1E8B32";
    if (a.frontBg) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); cover(ctx, a.frontBg, 0, 0, W_MM, H_MM); }
    else drawDefaultFront(ctx, color);

    if (a.logo && T.show_watermark !== false) { ctx.save(); ctx.globalAlpha = .12; contain(ctx, a.logo, 3, 21, 48, 48); ctx.restore(); }

    const halo = { halo: "rgba(255,255,255,.9)", haloW: .35 };
    line(ctx, String(T.school_name || "").toUpperCase(), 27, 9.9, 49.5, 4.35, 700, F.serif, "center", halo);
    const addr = String(T.school_address || "").toUpperCase().split(/\n/).map(x => x.trim()).filter(Boolean).slice(0, 2);
    addr.forEach((l, i) => line(ctx, l, 27, 12.15 + i * 2.0, 44, 1.5, 700, F.serif, "center", { halo: "rgba(255,255,255,.8)", haloW: .3 }));
    if (T.school_id_no) line(ctx, "SCHOOL ID: " + T.school_id_no, 27, addr.length > 1 ? 16.6 : 14.6, 40, 1.7, 700, F.serif, "center", { halo: "rgba(255,255,255,.8)", haloW: .3 });

    // photo
    if (a.photo) cover(ctx, a.photo, 2, 23, 32, 33);
    else {
      ctx.fillStyle = "#EEF1EF"; ctx.fillRect(m(2), m(23), m(32), m(33));
      ctx.fillStyle = "#C3CBC7"; ctx.beginPath(); ctx.arc(m(18), m(35), m(6.3), 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.rect(m(2), m(23), m(32), m(33)); ctx.clip();
      ctx.beginPath(); ctx.ellipse(m(18), m(58.5), m(12.5), m(13), 0, Math.PI, 0); ctx.fill(); ctx.restore();
    }
    if (a.logo) contain(ctx, a.logo, 34.6, 26.2, 14.6, 14.6);
    if (a.logo2) contain(ctx, a.logo2, 35.2, 42, 13.4, 8);

    if (a.studentSig) { ctx.save(); ctx.globalCompositeOperation = "multiply"; contain(ctx, a.studentSig, 14.5, 56.6, 25, 7.4); ctx.restore(); }

    const n = nameParts(s);
    line(ctx, n.last.toUpperCase() + (n.last ? "," : ""), 27, 68.7, 47, 5.5, 700, F.serif, "center", { halo: "rgba(255,255,255,.85)", haloW: .3 });
    line(ctx, [n.first, n.initial].filter(Boolean).join(" ").toUpperCase(), 27, 73.35, 40, 2.9, 700, F.serif, "center", { halo: "rgba(255,255,255,.85)", haloW: .28, underline: true, ulW: .25 });
    line(ctx, "LRN NO: " + (s.student_id || ""), 27, 81.4, 42, 3.3, 700, F.cond, "center", { halo: "rgba(255,255,255,.85)", haloW: .3 });
    return canvas;
  }

  /* ---------- BACK ---------- */
  function drawBack(canvas, s, T, a) {
    canvas.width = Math.round(m(W_MM)); canvas.height = Math.round(m(H_MM));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (a.backBg) cover(ctx, a.backBg, 0, 0, W_MM, H_MM);

    line(ctx, s.adviser || " ", 27, 9.1, 44, 4.0, 500, F.cond, "center", { underline: !!s.adviser, ulW: .22 });
    line(ctx, "ADVISER", 27, 11.85, 40, 2.15, 700, F.sans);
    const gs = [gradeNum(s.year_level), s.section].filter(Boolean).join(" - ").toUpperCase();
    line(ctx, gs || " ", 27, 17.15, 44, 4.0, 500, F.cond, "center", { underline: !!gs, ulW: .22 });
    line(ctx, "GRADE AND SECTION", 27, 20.05, 44, 2.15, 700, F.sans);

    ctx.fillStyle = "#000"; ctx.fillRect(m(2.7), m(22.7), m(48.6), m(3.3));
    line(ctx, "OTHER INFORMATION", 27, 25.15, 44, 2.1, 700, F.sans, "center", { color: "#fff", underline: true, ulW: .16 });

    const qrOn = T.show_qr !== false && a.qr, rowW = qrOn ? 35 : 48;
    const sex = String(s.sex || "").toUpperCase();
    line(ctx, "GENDER: " + sex, 2.9, 29.75, rowW, 2.15, 700, F.sans, "left");
    line(ctx, "BIRTHDAY: " + fmtBirthday(s.dob), 2.9, 33.25, rowW, 2.15, 700, F.sans, "left");
    line(ctx, "BLOOD TYPE: " + String(s.blood_type || "").toUpperCase(), 2.9, 36.75, rowW, 2.15, 700, F.sans, "left");
    if (qrOn) { ctx.fillStyle = "#fff"; ctx.fillRect(m(39.6), m(27), m(11.7), m(11.7)); ctx.imageSmoothingEnabled = false; ctx.drawImage(a.qr, m(39.9), m(27.3), m(11.1), m(11.1)); ctx.imageSmoothingEnabled = true; }

    ctx.strokeStyle = "#000"; ctx.lineWidth = m(.32); ctx.strokeRect(m(2.86), m(40.26), m(48.28), m(14.6));
    ctx.fillStyle = "#000"; ctx.fillRect(m(2.7), m(40.1), m(48.6), m(3.1));
    line(ctx, "IN CASE OF EMERGENCY, PLEASE CONTACT", 27, 42.5, 44, 2.25, 700, F.cond, "center", { color: "#fff", underline: true, ulW: .16 });
    const rows = [["NAME:", s.emergency_name, 46.25], ["ADDRESS:", s.emergency_address, 49.7], ["CONTACT NUMBER:", s.emergency_contact, 53.15]];
    for (const [label, val, y] of rows) {
      const [, r] = line(ctx, label, 4.1, y, 30, 2.05, 700, F.sans, "left");
      if (val) line(ctx, val, r + .9, y, 50.2 - (r + .9), 2.3, 500, F.cond, "left", { underline: true, ulW: .16 });
    }

    block(ctx, String(T.validity_text || "").toUpperCase(), 27, 61.35, 50, 2.05, 1.3, 3, 500, F.cond, 1.3);

    if (a.principalSig) { ctx.save(); ctx.globalCompositeOperation = "multiply"; contain(ctx, a.principalSig, 12, 69.4, 30, 8.4); ctx.restore(); }
    const [pl, pr] = line(ctx, String(T.signatory || "").toUpperCase(), 27, 79.8, 42, 4.4, 700, F.serif);
    ctx.fillStyle = "#000"; ctx.fillRect(m(Math.min(8.3, pl - 1)), m(80.45), m(Math.max(45.7, pr + 1) - Math.min(8.3, pl - 1)), m(.24));
    line(ctx, String(T.signatory_title || "").toUpperCase(), 27, 83.45, 44, 2.15, 700, F.sans);
    return canvas;
  }

  root.IDCard = {
    W_MM, H_MM, PX, F, drawFront, drawBack, nameParts, gradeNum, fmtBirthday,
    setCanvasFactory(fn) { makeCanvas = fn; texCache = null; }
  };
})(typeof window !== "undefined" ? window : globalThis);
