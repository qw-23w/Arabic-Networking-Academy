/* Course navigation: all lessons with expandable section links. */
(() => {
 const host=document.getElementById('lesson-navigation'); if(!host || !window.ANA) return;
 const current=Number(document.querySelector('script[data-lesson-id]')?.dataset.lessonId || (location.pathname.match(/lesson-(\d+)\.html/)||[])[1]);
 const original=document.querySelector('.original-toc ol');
 ANA.LESSONS.forEach(l=>{
  const group=document.createElement('div'); group.className='nav-lesson'+(l.id===current?' current':'');
  const a=document.createElement('a');a.href=l.href;a.className='nav-lesson-link';a.textContent=l.id+'. '+l.ar; if(l.id===current)a.setAttribute('aria-current','page');group.append(a);
  if(l.id===current && original){const list=original.cloneNode(true);list.className='nav-sections';group.append(list);list.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{list.querySelectorAll('a').forEach(x=>x.classList.remove('active'));link.classList.add('active')}));}
  host.append(group);
 });
 const sidebar=host.parentElement;
 const mobileQuery=window.matchMedia('(max-width:959px)');
 const details=document.createElement('details'); details.className='lesson-index'; details.open=!mobileQuery.matches;
 const summary=document.createElement('summary'); summary.textContent='فهرس المنهج والدرس';
 const content=document.createElement('div'); content.className='lesson-index-content';
 const title=sidebar.querySelector('.course-sidebar-title');
 const source=document.querySelector('.original-toc');
 sidebar.insertBefore(details,title); details.append(summary,content); content.append(title,host); if(source)content.append(source);
 let wasMobile=mobileQuery.matches;
 mobileQuery.addEventListener('change',()=>{if(wasMobile!==mobileQuery.matches){details.open=!mobileQuery.matches;wasMobile=mobileQuery.matches;}});
 const links=[...host.querySelectorAll('.nav-sections a')];
 if('IntersectionObserver' in window){const obs=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){links.forEach(a=>{const active=a.hash==='#'+e.target.id;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')})}})},{rootMargin:'-100px 0px -65% 0px'});document.querySelectorAll('.lesson > section[id]').forEach(s=>obs.observe(s));}
})();
/* Shared lesson logic. The lesson page must define LESSON_ID and QUESTIONS before loading this file. */
(async () => {
  const { sb, esc } = ANA;
  const { profile, isAdmin } = await ANA.renderLayout("");
  const session = await ANA.requireAuth();
  if (!session) return;
  const uid = session.user.id;

  // Welcome
  const w = document.getElementById("welcome");
  const name = profile && profile.display_name ? " يا " + profile.display_name : "";
  const fresh = new URLSearchParams(location.search).has("welcome");
  w.textContent = fresh ? `أهلًا بك${name}! تم إنشاء حسابك بنجاح. ابدأ رحلتك مع الدرس الأول.` : `مرحبًا بعودتك${name}.`;
  w.classList.remove("hidden");

  // Progress: mark started, then log one view per browser session
  const btn = document.getElementById("complete"), cm = document.getElementById("complete-msg");
  const up = await sb.from("lesson_progress").upsert({ user_id: uid, lesson_id: LESSON_ID }, { onConflict: "user_id,lesson_id", ignoreDuplicates: true });
  if (up.error) {
    console.error("progress", up.error);
    cm.textContent = ANA.isNetworkError(up.error) ? " تعذّر الاتصال؛ قد لا يُحفظ تقدمك الآن." : " تعذّر تسجيل بدء الدرس؛ قد لا يُحفظ تقدمك.";
  }
  const vk = "ana_view_" + LESSON_ID;
  try {
    if (!sessionStorage.getItem(vk)) {
      const r = await sb.from("lesson_views").insert({ user_id: uid, lesson_id: LESSON_ID });
      if (!r.error) sessionStorage.setItem(vk, "1");
    }
  } catch (e) {}

  // ---------- Content overrides (admins edit; everyone reads) ----------
  const sections = [...document.querySelectorAll(".lesson > section[id]")].filter(s => s.id !== "quiz");
  sections.forEach(s => { s.dataset.orig = s.innerHTML; });

  const HTML_TAGS = new Set(["a","abbr","article","b","blockquote","br","caption","code","dd","del","div","dl","dt","em","figcaption","figure","h2","h3","h4","h5","h6","hr","i","li","mark","ol","p","pre","s","section","small","span","strong","sub","sup","table","tbody","td","tfoot","th","thead","tr","u","ul","img"]);
  const SVG_TAGS = new Set(["svg","g","path","rect","circle","ellipse","line","polyline","polygon","text","tspan","title","desc","defs","marker","clippath"]);
  const HTML_ATTRS = new Set(["class","id","title","dir","lang","role","href","src","alt","width","height","colspan","rowspan","scope","start","reversed","value","loading","decoding","target","rel"]);
  const SVG_ATTRS = new Set(["viewbox","preserveaspectratio","x","y","x1","y1","x2","y2","cx","cy","r","rx","ry","d","points","fill","fill-rule","stroke","stroke-width","stroke-dasharray","stroke-linecap","stroke-linejoin","text-anchor","font-size","font-family","font-weight","transform","xmlns","focusable","opacity","direction","marker-start","marker-end","clip-path"]);
  const HTML_NS = "http://www.w3.org/1999/xhtml", SVG_NS = "http://www.w3.org/2000/svg";
  function sanitize(html, sectionId) {
    const source = new DOMParser().parseFromString(String(html ?? ""), "text/html");
    const scope = String(sectionId || "section").replace(/[^a-z0-9_-]/gi, "-");
    const prefix = `ana-content-${LESSON_ID}-${scope}-`;
    const idMap = new Map();
    source.body.querySelectorAll("*").forEach(el => {
      const svg = el.namespaceURI === SVG_NS, tag = el.localName.toLowerCase();
      const allowed = svg ? SVG_TAGS.has(tag) : el.namespaceURI === HTML_NS && HTML_TAGS.has(tag);
      if (!allowed) return;
      const id = el.getAttribute("id");
      if (id && /^[a-z][a-z0-9_.:-]{0,79}$/i.test(id) && !idMap.has(id)) idMap.set(id, prefix + id);
    });

    function safeHref(value) {
      const raw = String(value || "").trim();
      if (/^#[a-z][a-z0-9_.:-]{0,79}$/i.test(raw)) return "#" + (idMap.get(raw.slice(1)) || raw.slice(1));
      try {
        const url = new URL(raw, location.href);
        return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) ? url.href : null;
      } catch (_) { return null; }
    }
    function safeImage(value) {
      try {
        const url = new URL(String(value || "").trim(), location.href);
        return ["http:", "https:"].includes(url.protocol) && url.origin === location.origin ? url.href : null;
      } catch (_) { return null; }
    }
    function safeSvgValue(name, value) {
      const v = String(value).trim();
      if (name === "direction") return ["ltr","rtl"].includes(v) ? v : null;
      if (["fill","stroke"].includes(name)) return /^(?:none|currentColor|#[0-9a-f]{3,8}|[a-z]{1,20})$/i.test(v) ? v : null;
      if (["marker-start","marker-end","clip-path"].includes(name)) {
        const ref = /^url\(#([a-z][a-z0-9_.:-]{0,79})\)$/i.exec(v);
        return ref && idMap.has(ref[1]) ? `url(#${idMap.get(ref[1])})` : null;
      }
      if (name === "xmlns") return v === SVG_NS ? v : null;
      if (name === "text-anchor") return ["start","middle","end"].includes(v) ? v : null;
      if (name === "focusable") return ["true","false"].includes(v) ? v : null;
      if (name === "transform") return /^[a-zA-Z0-9\s.,()+-]{1,180}$/.test(v) && !/url/i.test(v) ? v : null;
      if (name === "d") return /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]{1,2000}$/.test(v) ? v : null;
      if (name === "points") return /^[0-9eE.,+\-\s]{1,2000}$/.test(v) ? v : null;
      if (["viewbox","preserveaspectratio","x","y","x1","y1","x2","y2","cx","cy","r","rx","ry","width","height","stroke-width","stroke-dasharray","font-size","font-family","font-weight","opacity","fill-rule","stroke-linecap","stroke-linejoin"].includes(name)) {
        return /^[a-zA-Z0-9#.,%+\-\s]{1,160}$/.test(v) && !/url|javascript|data/i.test(v) ? v : null;
      }
      return v;
    }
    function copyNode(node, parent) {
      if (node.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(node.nodeValue || "")); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const svg = node.namespaceURI === SVG_NS, tag = node.localName.toLowerCase();
      const allowed = svg ? SVG_TAGS.has(tag) : node.namespaceURI === HTML_NS && HTML_TAGS.has(tag);
      if (!allowed) return;
      const clean = svg ? document.createElementNS(SVG_NS, node.localName) : document.createElement(tag);
      for (const attr of [...node.attributes]) {
        if (attr.namespaceURI) continue;
        const name = attr.name.toLowerCase(), value = attr.value;
        if (name === "id") {
          const mapped = idMap.get(value);
          if (mapped) clean.setAttribute("id", mapped);
        } else if (name === "class") {
          const classes = value.split(/\s+/).filter(x => /^[a-z0-9_-]{1,40}$/i.test(x)).join(" ");
          if (classes) clean.setAttribute("class", classes);
        } else if (name.startsWith("aria-") && /^aria-[a-z-]{1,32}$/.test(name)) {
          clean.setAttribute(name, value.slice(0, 200));
        } else if (svg && SVG_ATTRS.has(name)) {
          const safe = safeSvgValue(name, value);
          if (safe !== null) clean.setAttribute(attr.name, safe);
        } else if (!svg && HTML_ATTRS.has(name)) {
          if (name === "href" && tag === "a") {
            const safe = safeHref(value); if (safe) clean.setAttribute("href", safe);
          } else if (name === "src" && tag === "img") {
            const safe = safeImage(value); if (safe) clean.setAttribute("src", safe);
          } else if (name === "target" && tag === "a" && ["_blank","_self"].includes(value.toLowerCase())) {
            clean.setAttribute("target", value.toLowerCase());
          } else if (name === "rel" && tag === "a") {
            clean.setAttribute("rel", value.toLowerCase().split(/\s+/).filter(x => ["noopener","noreferrer","nofollow","external"].includes(x)).join(" "));
          } else if (name === "dir" && ["ltr","rtl","auto"].includes(value.toLowerCase())) {
            clean.setAttribute("dir", value.toLowerCase());
          } else if (["width","height","colspan","rowspan","start","value"].includes(name) && /^\d{1,5}$/.test(value)) {
            clean.setAttribute(name, value);
          } else if (["scope"].includes(name) && ["row","col","rowgroup","colgroup"].includes(value.toLowerCase())) {
            clean.setAttribute(name, value.toLowerCase());
          } else if (["loading","decoding"].includes(name) && ["lazy","eager","async","sync","auto"].includes(value.toLowerCase())) {
            clean.setAttribute(name, value.toLowerCase());
          } else if (["title","alt","lang"].includes(name)) {
            clean.setAttribute(name, value.slice(0, 240));
          } else if (name === "role" && /^[a-z][a-z0-9_-]{0,30}$/i.test(value)) {
            clean.setAttribute(name, value);
          }
        }
      }
      if (tag === "a" && clean.getAttribute("target") === "_blank") clean.setAttribute("rel", "noopener noreferrer");
      parent.append(clean);
      for (const child of [...node.childNodes]) copyNode(child, clean);
    }
    const safeBody = document.createElement("div");
    for (const child of [...source.body.childNodes]) copyNode(child, safeBody);
    return safeBody.innerHTML;
  }

  const ov = await sb.from("lesson_section_overrides").select("section_id,html").eq("lesson_id", LESSON_ID);
  if (ov.error) console.error("overrides", ov.error); // fall back to the built-in text
  (ov.data || []).forEach(r => {
    const s = sections.find(x => x.id === r.section_id);
    if (s) s.innerHTML = sanitize(r.html, s.id);
  });

  if (isAdmin) sections.forEach(s => {
    const bar = document.createElement("div"); bar.className = "admin-bar";
    const b = document.createElement("button"); b.type = "button"; b.className = "btn secondary small"; b.textContent = "✎ تعديل هذا القسم";
    bar.appendChild(b); s.before(bar);
    b.addEventListener("click", () => {
      if (bar.querySelector(".editor")) return;
      const ed = document.createElement("div"); ed.className = "editor";
      ed.innerHTML = '<p class="hint">تُحفظ فقط وسوم وخصائص التنسيق المسموحة؛ تزال السكربتات والأنماط وروابط الصور الخارجية. سيرى الطلاب المحتوى بعد الحفظ.</p><textarea dir="ltr" spellcheck="false" aria-label="محتوى القسم"></textarea><p><button type="button" class="btn success" data-a="save">حفظ</button> <button type="button" class="btn secondary" data-a="cancel">إلغاء</button> <button type="button" class="btn secondary" data-a="reset">استعادة الأصل</button> <span class="hint" role="status"></span></p>';
      const ta = ed.querySelector("textarea"), st = ed.querySelector("span.hint");
      ta.value = s.innerHTML;
      ed.addEventListener("click", async (e) => {
        const a = e.target.dataset && e.target.dataset.a; if (!a) return;
        if (a === "cancel") return ed.remove();
        if (a === "reset" && !confirm("استعادة النص الأصلي لهذا القسم؟")) return;
        e.target.disabled = true;
        const key = { lesson_id: LESSON_ID, section_id: s.id };
        let r;
        if (a === "save") {
          const clean = sanitize(ta.value, s.id);
          r = await sb.from("lesson_section_overrides").upsert({ ...key, html: clean, updated_by: uid, updated_at: new Date().toISOString() }, { onConflict: "lesson_id,section_id" });
          if (!r.error) s.innerHTML = clean;
        } else {
          r = await sb.from("lesson_section_overrides").delete().match(key);
          if (!r.error) s.innerHTML = s.dataset.orig;
        }
        if (r.error) { st.textContent = "تعذّر الحفظ: " + r.error.message; e.target.disabled = false; return; }
        ed.remove();
      });
      bar.appendChild(ed);
    });
  });

  // ---------- Completion ----------
  const setDone = (done) => { btn.textContent = done ? "✔ مكتمل — إلغاء العلامة" : "وضع علامة «مكتمل»"; btn.dataset.done = done ? "1" : ""; };
  const pr = await sb.from("lesson_progress").select("completed_at").eq("user_id", uid).eq("lesson_id", LESSON_ID).maybeSingle();
  if (pr.error) { console.error("progress read", pr.error); btn.disabled = true; cm.textContent = " تعذّر تحميل حالة تقدمك. أعد تحميل الصفحة."; }
  setDone(!!(pr.data && pr.data.completed_at));

  // ---------- الحقل التطبيقي: إجباري قبل وضع علامة «مكتمل» ----------
  const lab = window.ANA_LAB ? ANA_LAB.mount({ lessonId: LESSON_ID, uid, onChange: () => gate() }) : null;
  const labOk = () => !lab || lab.isDone() || !!btn.dataset.done;
  const GATE_MSG = " أنهِ «الحقل التطبيقي» أولًا (في نهاية الدرس) ثم يمكنك وضع علامة «مكتمل».";
  function gate() {
    if (pr.error) return;
    if (!labOk()) { btn.disabled = true; cm.textContent = GATE_MSG; }
    else { btn.disabled = false; if (cm.textContent === GATE_MSG) cm.textContent = ""; }
  }
  gate();

  // An UPDATE that matches no row returns no error, so we ask for the changed rows back and verify one was written.
  async function saveCompletion(mark) {
    const completed_at = mark ? new Date().toISOString() : null;
    const u = await sb.from("lesson_progress").update({ completed_at }).eq("user_id", uid).eq("lesson_id", LESSON_ID).select("lesson_id");
    if (u.error) return u.error;
    if (u.data && u.data.length) return null;
    const i = await sb.from("lesson_progress").insert({ user_id: uid, lesson_id: LESSON_ID, completed_at }).select("lesson_id");
    if (i.error) return i.error;
    return i.data && i.data.length ? null : new Error("no row written");
  }
  btn.addEventListener("click", async () => {
    if (btn.disabled) return; // blocks double submission
    const mark = !btn.dataset.done;
    btn.disabled = true;
    const error = await saveCompletion(mark);
    btn.disabled = false;
    if (error) { console.error("complete", error); cm.textContent = ANA.isNetworkError(error) ? " تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مجددًا." : " تعذّر الحفظ، حاول مجددًا."; return; }
    setDone(mark); cm.textContent = mark ? " أحسنت! تم حفظ تقدمك." : " أُلغي الإكمال.";
    if (mark) { try { const progress = await ANA.myProgress(uid); const published = ANA.LESSONS.filter(l => l.published); if (published.length && published.every(l => l.id === LESSON_ID || progress.some(r => r.lesson_id === l.id && r.completed_at))) { const congrats = document.createElement("div"); congrats.className = "course-congrats"; congrats.setAttribute("role","status"); congrats.innerHTML = '<h2>🎉 تهانينا! أكملت جميع دروس الأكاديمية</h2><p>أنجزت المنهج كاملًا مع حقوله التطبيقية. يمكنك الآن مراجعة الدروس أو متابعة تطوير مهاراتك.</p><a class="btn" href="my-learning.html">عرض إنجازي</a>'; document.querySelector("#practice").append(congrats); congrats.scrollIntoView({behavior:"smooth",block:"center"}); } } catch(e) { console.warn("congratulations check",e); } }
    if (!labOk()) btn.disabled = true; // بعد إلغاء العلامة: يلزم إنهاء الحقل التطبيقي لإعادة وضعها
  });

  // ---------- Quiz ----------
  const box = document.getElementById("quiz-box"), res = document.getElementById("quiz-result"), retry = document.getElementById("retry");
  let answered, selected;
  function render() {
    answered = 0; selected = new Array(QUESTIONS.length).fill(null); res.classList.add("hidden"); retry.classList.add("hidden");
    box.innerHTML = QUESTIONS.map((q, i) => `<div class="q" data-i="${i}"><p><b>${i + 1}. ${esc(q.q)}</b></p>` +
      q.o.map((o, j) => `<button type="button" class="opt" data-j="${j}" aria-pressed="false">${esc(o)}</button>`).join("") + `<div class="explain" role="status"></div></div>`).join("");
  }
  box.addEventListener("click", async (e) => {
    const b = e.target.closest(".opt"); if (!b) return;
    const qd = b.closest(".q"), qi = Number(qd.dataset.i), j = Number(b.dataset.j);
    if (qd.dataset.done || !Number.isInteger(qi) || !Number.isInteger(j) || !QUESTIONS[qi] || j < 0 || j >= QUESTIONS[qi].o.length) return;
    qd.dataset.done = "1"; selected[qi] = j;
    qd.querySelectorAll(".opt").forEach(x => { x.disabled = true; x.setAttribute("aria-pressed", String(x === b)); });
    b.classList.add("selected");
    qd.querySelector(".explain").textContent = "تم تسجيل اختيارك. ستظهر نتيجة التصحيح بعد إكمال الأسئلة.";
    if (++answered === QUESTIONS.length) {
      res.textContent = "جارٍ تصحيح إجاباتك على الخادم..."; res.classList.remove("hidden");
      try {
        const { data, error } = await sb.rpc("submit_quiz_answers", { p_lesson_id: LESSON_ID, p_answers: selected });
        const row = Array.isArray(data) ? data[0] : null;
        if (error || !row) throw error || new Error("Missing quiz result");
        const score = Number(row.score), total = Number(row.total);
        if (!Number.isInteger(score) || !Number.isInteger(total) || total !== QUESTIONS.length || score < 0 || score > total) throw new Error("Invalid quiz result");
        res.textContent = `نتيجتك: ${score} من ${total}. (تم تصحيحها وحفظها.)`;
        box.querySelectorAll(".q").forEach((node, index) => { node.querySelector(".explain").textContent = QUESTIONS[index].e || ""; });
      } catch (error) {
        console.error("quiz submission", error);
        res.textContent = "تعذّر تصحيح الاختبار أو حفظه. تأكد من تطبيق تحديث قاعدة البيانات ثم أعد المحاولة.";
      } finally {
        retry.classList.remove("hidden");
      }
    }
  });
  retry.addEventListener("click", render);
  render();
})();
