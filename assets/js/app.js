/* Arabic Networking Academy — shared client logic */
(function () {
  const cfg = window.ANA_CONFIG || {};
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.startsWith("PASTE") &&
                     cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.startsWith("PASTE");
  // Normalise the URL (a trailing slash in config.js is harmless but easy to get wrong).
  const baseUrl = configured ? String(cfg.SUPABASE_URL).trim().replace(/\/+$/, "") : "";
  const libMissing = configured && !window.supabase; // CDN blocked / offline
  const sb = configured && window.supabase
    ? window.supabase.createClient(baseUrl, cfg.SUPABASE_ANON_KEY)
    : null;
  let protectedPage = false;

  const LESSONS = [
    { id: 1, ar: "الشبكات المحلية والواسعة", en: "LANs and WANs", href: "lesson-1.html", published: true },
    { id: 2, ar: "نموذج OSI", en: "The OSI Model", href: "lesson-2.html", published: true },
    { id: 3, ar: "عنوان MAC", en: "MAC Address", href: "lesson-9.html", published: true },
    { id: 4, ar: "عنونة IP", en: "IP Addressing", href: "lesson-3.html", published: true },
    { id: 5, ar: "بروتوكولات TCP/IP", en: "TCP/IP", href: "lesson-7.html", published: true },
    { id: 6, ar: "التوجيه", en: "Routing", href: "lesson-4.html", published: true },
    { id: 7, ar: "الشبكات المحلية الافتراضية", en: "VLANs", href: "lesson-5.html", published: true },
    { id: 8, ar: "VXLAN و VRF", en: "VXLAN and VRF", href: "lesson-6.html", published: true },
    { id: 9, ar: "استكشاف الأخطاء والأمن الأساسي", en: "Troubleshooting and Basic Security", href: "lesson-8.html", published: true }
  ];

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const withTimeout = (promise, ms = 3500) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve({ data: null, error: new Error("Connection timeout") }), ms))]);
  async function getSession() {
    if (!sb) return null;
    try {
      const { data, error } = await withTimeout(sb.auth.getSession());
      if (error) console.error("getSession", error);
      return data ? data.session : null;
    } catch (e) { console.error("getSession", e); return null; }
  }

  // Returns the profile row, or null if it is missing / could not be read (error is logged, never shown as a role).
  async function getProfile(userId) {
    if (!sb) return null;
    try {
      const { data, error } = await withTimeout(sb.from("profiles").select("display_name, role").eq("id", userId).maybeSingle());
      if (error) { console.error("getProfile", error); return null; }
      return data;
    } catch (e) { console.error("getProfile", e); return null; }
  }

  // True when an error looks like a connectivity problem rather than a server-side rejection.
  function isNetworkError(err) {
    if (!err) return false;
    const m = String(err.message || err);
    return err.status === 0 || /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(m);
  }

  function showAlert(el, kind, msg) {
    el.className = "alert " + kind;
    el.textContent = msg;
    el.classList.remove("hidden");
    el.setAttribute("role", kind === "error" ? "alert" : "status");
  }

  function configBanner() {
    if (location.protocol === "file:" || location.protocol === "content:") return '<div class="alert warn" style="margin:0;border-radius:0;text-align:center">أنت تشغّل الموقع من مدير الملفات. للتشغيل الكامل افتحه عبر خادم محلي (http://127.0.0.1:8000). قد لا يعمل تسجيل الدخول من ملف محلي.</div>';
    if (libMissing) return '<div class="alert error" style="margin:0;border-radius:0;text-align:center">تعذّر تحميل مكتبة الاتصال بقاعدة البيانات. تحقق من اتصالك بالإنترنت (أو من حاجب محتوى) ثم أعد تحميل الصفحة.</div>';
    return configured ? "" :
      '<div class="alert warn" style="margin:0;border-radius:0;text-align:center">لم يتم ربط الموقع بقاعدة البيانات بعد. أضف مفاتيح Supabase في الملف <code>assets/js/config.js</code> (راجع README).</div>';
  }

  // Public visit counter: one anonymous record per browser session (the database also ignores repeats within 30 minutes).
  function trackVisit() {
    try {
      if (!sb || sessionStorage.getItem("ana_visit")) return;
      const page = location.pathname.split("/").pop() || "index.html";
      if (page === "admin.html") return;
      let v = localStorage.getItem("ana_vid");
      if (!v || !/^[A-Za-z0-9_-]{8,64}$/.test(v)) {
        v = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
        localStorage.setItem("ana_vid", v);
      }
      Promise.resolve(sb.rpc("track_visit", { p_page: page, p_visitor: v }))
        .then((r) => { if (!r.error) sessionStorage.setItem("ana_visit", "1"); else console.error("track_visit", r.error); })
        .catch(() => {});
    } catch (e) {}
  }

  async function renderLayout(active) {
    trackVisit();
    const session = await getSession();
    const profile = session ? await getProfile(session.user.id) : null;
    const isAdmin = profile && profile.role === "admin";
    const link = (href, text, key) =>
      `<li><a href="${href}"${active === key ? ' aria-current="page"' : ""}>${text}</a></li>`;

    const account = session
      ? `<li class="nav-user">مرحبًا، ${esc(profile ? profile.display_name : "")}</li>` +
        (isAdmin ? link("admin.html", "لوحة الإدارة", "admin") : "") +
        `<li><button class="linklike" id="logout-btn" type="button">تسجيل الخروج</button></li>`
      : `<li><a href="login.html"${active === "login" ? ' aria-current="page"' : ""}>تسجيل الدخول</a></li>
         <li><a class="cta" href="register.html">ابدأ التعلم</a></li>`;

    const header = document.getElementById("site-header");
    if (header) {
      header.className = "site-header";
      header.innerHTML = configBanner() + `
      <div class="container nav">
        <a class="brand" href="index.html"><span class="brand-mark"><img src="assets/img/academy-symbol.webp" alt="" width="38" height="38"></span>أكاديمية الشبكات العربية</a>
        <button class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="nav-links">القائمة</button>
        <ul class="nav-links" id="nav-links">
          ${link("index.html", "الرئيسية", "home")}
          ${link("curriculum.html", "المنهج", "curriculum")}
          ${link("my-learning.html", "تعلمي", "learning")}
          ${link("about.html", "عن الأكاديمية", "about")}
          ${link("help.html", "المساعدة", "help")}
          <li><button class="linklike" id="theme-toggle" type="button" aria-pressed="false"></button></li>
          ${account}
        </ul>
      </div>`;
      const t = document.getElementById("nav-toggle");
      t.addEventListener("click", () => {
        const open = document.getElementById("nav-links").classList.toggle("open");
        t.setAttribute("aria-expanded", open);
      });
      const tt = document.getElementById("theme-toggle");
      const paint = () => { const d = document.documentElement.getAttribute("data-theme") === "dark"; tt.textContent = d ? "☀️ الوضع الفاتح" : "🌙 الوضع المظلم"; tt.setAttribute("aria-pressed", d); };
      paint();
      tt.addEventListener("click", () => {
        const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        try { localStorage.setItem("ana_theme", next); } catch (e) {}
        paint();
      });
      const lo = document.getElementById("logout-btn");
      if (lo) lo.addEventListener("click", async () => {
        lo.disabled = true;
        try { const { error } = await sb.auth.signOut(); if (error) await sb.auth.signOut({ scope: "local" }); }
        catch (e) { try { await sb.auth.signOut({ scope: "local" }); } catch (e2) {} }
        location.href = "index.html";
      });
    }
    const footer = document.getElementById("site-footer");
    const mail = cfg.SUPPORT_EMAIL || "arabicnetworkingacademy@gmail.com";
    if (footer) {
      footer.className = "site-footer";
      footer.innerHTML = `<div class="container">أكاديمية الشبكات العربية — منصة تعليمية مجانية ومفتوحة المصدر. جميع التمارين العملية يجب أن تتم فقط على شبكات تملكها أو لديك إذن صريح باختبارها.<br>للتواصل والاستفسار: <a href="mailto:${esc(mail)}">${esc(mail)}</a> · <a href="help.html">المساعدة</a></div>`;
    }
    return { session, profile, isAdmin };
  }

  // Redirect to login if not signed in. Returns the session.
  async function requireAuth() {
    protectedPage = true;
    const s = await getSession();
    if (!s) {
      try { sessionStorage.setItem("ana_next", location.pathname.split("/").pop() + location.search); } catch (e) {}
      location.replace("login.html");
      return null;
    }
    return s;
  }

  function nextUrl(fallback) {
    let n = null;
    try { n = sessionStorage.getItem("ana_next"); sessionStorage.removeItem("ana_next"); } catch (e) {}
    return n || fallback;
  }

  // Throws on failure so callers can show an error instead of a misleading "0 lessons completed".
  async function myProgress(userId) {
    const { data, error } = await sb.from("lesson_progress").select("lesson_id, started_at, completed_at").eq("user_id", userId);
    if (error) throw error;
    return data || [];
  }

  // Session expired / signed out in another tab: leave protected pages instead of failing silently.
  if (sb) sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" && protectedPage) location.replace("login.html");
  });

  window.ANA = { sb, configured, LESSONS, esc, getSession, getProfile, showAlert, renderLayout, requireAuth, nextUrl, myProgress, isNetworkError };
})();
