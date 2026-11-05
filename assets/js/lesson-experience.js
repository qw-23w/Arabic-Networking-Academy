/* Small, accessible reading tools for all nine lesson pages. */
(() => {
  const article = document.querySelector("article.lesson");
  if (!article) return;
  const progress = document.createElement("div");
  progress.className = "lesson-reading-progress";
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-label", "تقدم القراءة في الدرس");
  progress.setAttribute("aria-valuemin", "0");
  progress.setAttribute("aria-valuemax", "100");
  progress.setAttribute("aria-valuenow", "0");
  const fill = document.createElement("span");
  const label = document.createElement("span");
  label.className = "lesson-reading-progress-label";
  label.textContent = "تقدم القراءة";
  progress.append(fill, label);
  document.body.prepend(progress);

  const heading = article.querySelector("h1");
  if (heading && !article.querySelector(".lesson-meta")) {
    const sample = article.cloneNode(true);
    sample.querySelectorAll("#quiz,#practice,.lesson-toolbar,.lesson-meta").forEach((el) => el.remove());
    const words = (sample.textContent || "").trim().split(/\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.ceil(words / 190));
    const sectionCount = article.querySelectorAll(":scope > section[id]").length;
    const meta = document.createElement("div");
    meta.className = "lesson-meta";
    meta.innerHTML = `<span>قراءة تقريبية · ${minutes} د</span><span>${sectionCount} قسمًا</span><span>اختبار ومختبر تفاعلي</span>`;
    heading.insertAdjacentElement("afterend", meta);
  }

  let frame = 0;
  const update = () => {
    frame = 0;
    const top = article.getBoundingClientRect().top + window.scrollY;
    const range = Math.max(1, article.offsetHeight - window.innerHeight);
    const value = Math.max(0, Math.min(100, Math.round(((window.scrollY - top) / range) * 100)));
    fill.style.width = `${value}%`;
    progress.setAttribute("aria-valuenow", String(value));
  };
  const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  update();

  article.querySelectorAll("pre").forEach((block, index) => {
    if (block.querySelector(".copy-code")) return;
    block.classList.add("code-copy-block");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-code";
    button.textContent = "نسخ الأمر";
    button.setAttribute("aria-label", `نسخ المقطع البرمجي ${index + 1}`);
    const status = document.createElement("span");
    status.className = "copy-code-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    block.append(button, status);
    button.addEventListener("click", async () => {
      const text = block.querySelector("code")?.textContent || block.textContent.replace(button.textContent, "").trim();
      if (!navigator.clipboard?.writeText) { status.textContent = "تعذّر النسخ التلقائي؛ حدّد النص وانسخه يدويًا."; return; }
      try { await navigator.clipboard.writeText(text); status.textContent = "تم نسخ المقطع."; }
      catch { status.textContent = "لم يسمح المتصفح بالنسخ هنا؛ حدّد النص وانسخه يدويًا."; }
    });
  });
})();
