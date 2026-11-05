/* Course discovery based only on the nine published academy lessons. Durations are estimates, not promises. */
(() => {
  const catalog = [
    { id:1, category:"foundations", level:"beginner", levelLabel:"مبتدئ", minutes:14, objective:"ميّز بين LAN وWAN، ومكوّنات الشبكة الأساسية", prereq:"لا توجد متطلبات", tags:["LAN","WAN","أجهزة الشبكة"] },
    { id:2, category:"foundations", level:"beginner", levelLabel:"مبتدئ", minutes:11, objective:"تتبّع انتقال البيانات عبر طبقات نموذج OSI", prereq:"يفضّل البدء بالدرس الأول", tags:["OSI","طبقات الشبكة"] },
    { id:9, category:"foundations", level:"beginner", levelLabel:"مبتدئ", minutes:3, objective:"افهم دور عنوان MAC في الاتصال داخل الشبكة المحلية", prereq:"فكرة عامة عن الشبكة", tags:["MAC","Ethernet"] },
    { id:3, category:"addressing", level:"beginner", levelLabel:"مبتدئ", minutes:14, objective:"اقرأ عناوين IPv4 والأقنعة والبوابة الافتراضية", prereq:"أساسيات الشبكة", tags:["IP","IPv4","Subnet"] },
    { id:7, category:"addressing", level:"beginner", levelLabel:"مبتدئ", minutes:8, objective:"اربط وظائف TCP وUDP وDNS وDHCP بطلبات الشبكة", prereq:"مبادئ العنونة", tags:["TCP/IP","DNS","DHCP"] },
    { id:4, category:"operations", level:"intermediate", levelLabel:"متوسط", minutes:20, objective:"افهم كيف يختار الموجّه المسار بين الشبكات", prereq:"عنوان IP والبوابة", tags:["Routing","الموجّهات"] },
    { id:5, category:"operations", level:"intermediate", levelLabel:"متوسط", minutes:20, objective:"اشرح كيف تعزل VLAN مجموعات الأجهزة منطقيًا", prereq:"مفاهيم Ethernet والتبديل", tags:["VLAN","Switch"] },
    { id:6, category:"operations", level:"advanced", levelLabel:"متقدم", minutes:24, objective:"قارن بين VRF وVXLAN وحدود العزل التي يشرحها الدرس", prereq:"التوجيه وVLAN", tags:["VRF","VXLAN"] },
    { id:8, category:"practice", level:"intermediate", levelLabel:"متوسط", minutes:17, objective:"اتبع خطوات تشخيص الاتصال وراجع مبادئ الأمن الأساسية", prereq:"مفاهيم الشبكات الأساسية", tags:["التشخيص","أمن الشبكات"] }
  ];
  const $ = (id) => document.getElementById(id);
  const list = $("list"), search = $("course-search"), category = $("course-category"), level = $("course-level");
  if (!list || !window.ANA) return;
  const safe = (value) => ANA.esc(value);
  const itemFor = (lesson) => ({ ...lesson, ...catalog.find((item) => item.id === lesson.id) });
  const metadata = new Map(ANA.LESSONS.map((lesson) => [lesson.id, itemFor(lesson)]));

  function draw(progress = [], session = null) {
    const completed = new Set(progress.filter((row) => row.completed_at).map((row) => row.lesson_id));
    const started = new Set(progress.map((row) => row.lesson_id));
    const lessons = ANA.LESSONS.filter((lesson) => lesson.published).sort((a, b) => a.sequence - b.sequence).map(itemFor);
    const count = lessons.filter((lesson) => {
      const text = `${lesson.ar} ${lesson.en} ${lesson.objective} ${lesson.tags.join(" ")}`.toLocaleLowerCase("ar");
      return (!search.value.trim() || text.includes(search.value.trim().toLocaleLowerCase("ar"))) &&
        (category.value === "all" || lesson.category === category.value) &&
        (level.value === "all" || lesson.level === level.value);
    });
    $("catalog-count").textContent = `${count.length} من ${lessons.length} دروس منشورة`;
    $("catalog-empty").classList.toggle("hidden", count.length > 0);
    list.innerHTML = count.map((lesson) => {
      const isDone = completed.has(lesson.id), isStarted = started.has(lesson.id);
      const target = session ? lesson.href : "register.html";
      const progressText = isDone ? "أكملت هذا الدرس" : isStarted ? "بدأت هذا الدرس" : "لم تبدأه بعد";
      const cta = isDone ? "مراجعة الدرس" : isStarted ? "متابعة الدرس" : session ? "عرض الدرس" : "سجّل لتبدأ";
      return `<article class="course-card catalog-course${isDone ? " is-complete" : ""}" data-category="${lesson.category}">
        <a class="course-visual" href="${target}" aria-label="افتح درس ${safe(lesson.ar)}"><img src="${safe(lesson.image)}" alt="" width="640" height="360" loading="lazy" decoding="async"><span class="course-index">${String(lesson.sequence).padStart(2,"0")}</span></a>
        <div class="course-body"><div class="course-meta"><span class="badge level-${lesson.level}">${lesson.levelLabel}</span><span class="course-duration">قراءة تقديرية · ${lesson.minutes} د</span></div>
          <h3><a href="${target}">${safe(lesson.ar)}</a></h3><p class="course-en en" dir="ltr">${safe(lesson.en)}</p><p>${safe(lesson.objective)}.</p>
          <div class="course-tags">${lesson.tags.map((tag) => `<span>${safe(tag)}</span>`).join("")}</div>
          <p class="course-prereq"><b>قبل البدء:</b> ${safe(lesson.prereq)}</p>
          <p class="course-progress-note">${progressText}</p>
          <a class="btn ${isDone ? "secondary" : ""}" href="${target}">${cta}</a>
        </div></article>`;
    }).join("");
    const doneCount = lessons.filter((lesson) => completed.has(lesson.id)).length;
    $("path-progress").textContent = progress.length
      ? `تقدّمك المحفوظ: أنجزت ${doneCount} من ${lessons.length} دروس.`
      : "تصفّح الدروس بالترتيب، أو ابدأ من الموضوع الذي تحتاجه.";
  }

  (async () => {
    const { session } = await ANA.renderLayout("curriculum");
    let progress = [];
    if (session) {
      try { progress = await ANA.myProgress(session.user.id); }
      catch (error) { console.error("curriculum progress", error); $("path-progress").textContent = "تعذّر تحميل تقدم الحساب الآن؛ يمكنك استعراض الدروس كالمعتاد."; }
    }
    [search, category, level].forEach((control) => control.addEventListener(control === search ? "input" : "change", () => draw(progress, session)));
    draw(progress, session);
  })();
})();
