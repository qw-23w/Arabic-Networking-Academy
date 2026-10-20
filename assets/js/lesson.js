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

  function sanitize(html) {
    const doc = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html");
    doc.body.querySelectorAll("script,style,iframe,object,embed,link,meta,base,form,animate,set,foreignObject").forEach(n => n.remove());
    doc.body.querySelectorAll("*").forEach(el => {
      [...el.attributes].forEach(a => {
        const n = a.name.toLowerCase(), v = a.value.replace(/[\s\u0000-\u001f]/g, "").toLowerCase();
        if (n.startsWith("on") || n === "srcdoc" || n === "formaction" || n === "action" ||
            ((n === "href" || n === "src" || n === "xlink:href") && /^(javascript|vbscript|data):/.test(v))) el.removeAttribute(a.name);
      });
    });
    return doc.body.innerHTML;
  }

  const ov = await sb.from("lesson_section_overrides").select("section_id,html").eq("lesson_id", LESSON_ID);
  if (ov.error) console.error("overrides", ov.error); // fall back to the built-in text
  (ov.data || []).forEach(r => {
    const s = sections.find(x => x.id === r.section_id);
    if (s) s.innerHTML = sanitize(r.html);
  });

  if (isAdmin) sections.forEach(s => {
    const bar = document.createElement("div"); bar.className = "admin-bar";
    const b = document.createElement("button"); b.type = "button"; b.className = "btn secondary small"; b.textContent = "✎ تعديل هذا القسم";
    bar.appendChild(b); s.before(bar);
    b.addEventListener("click", () => {
      if (bar.querySelector(".editor")) return;
      const ed = document.createElement("div"); ed.className = "editor";
      ed.innerHTML = '<p class="hint">تحرير HTML هذا القسم. تُحذف الوسوم والخصائص الخطرة تلقائيًا، ويراه جميع الطلاب بعد الحفظ.</p><textarea dir="ltr" spellcheck="false" aria-label="محتوى القسم"></textarea><p><button type="button" class="btn success" data-a="save">حفظ</button> <button type="button" class="btn secondary" data-a="cancel">إلغاء</button> <button type="button" class="btn secondary" data-a="reset">استعادة الأصل</button> <span class="hint" role="status"></span></p>';
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
          const clean = sanitize(ta.value);
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
  let answered, score;
  function render() {
    answered = 0; score = 0; res.classList.add("hidden"); retry.classList.add("hidden");
    box.innerHTML = QUESTIONS.map((q, i) => `<div class="q" data-i="${i}"><p><b>${i + 1}. ${esc(q.q)}</b></p>` +
      q.o.map((o, j) => `<button type="button" class="opt" data-j="${j}">${esc(o)}</button>`).join("") + `<div class="explain" role="status"></div></div>`).join("");
  }
  box.addEventListener("click", async (e) => {
    const b = e.target.closest(".opt"); if (!b) return;
    const qd = b.closest(".q"), q = QUESTIONS[+qd.dataset.i], j = +b.dataset.j;
    if (qd.dataset.done) return; qd.dataset.done = "1";
    qd.querySelectorAll(".opt").forEach(x => x.disabled = true);
    qd.querySelectorAll(".opt")[q.a].classList.add("correct");
    const ok = j === q.a; if (!ok) b.classList.add("wrong"); else score++;
    qd.querySelector(".explain").textContent = (ok ? "✔ إجابة صحيحة. " : "✘ إجابة غير صحيحة. ") + q.e;
    if (++answered === QUESTIONS.length) {
      res.textContent = `نتيجتك: ${score} من ${QUESTIONS.length}.`; res.classList.remove("hidden"); retry.classList.remove("hidden");
      const { error } = await sb.from("quiz_results").insert({ user_id: uid, lesson_id: LESSON_ID, score, total: QUESTIONS.length });
      if (error) { console.error("quiz", error); res.textContent += " (تعذّر حفظ النتيجة.)"; }
      else res.textContent += " (تم حفظ النتيجة.)";
    }
  });
  retry.addEventListener("click", render);
  render();
})();
