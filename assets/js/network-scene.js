/* Accessible route explainer paired with the locally hosted globe artwork. */
(function () {
  const stage = document.querySelector(".topology-stage");
  if (!stage) return;

  const counter = stage.querySelector("#route-counter");
  const status = stage.querySelector("#route-status");
  const controls = Array.from(document.querySelectorAll(".route-step"));
  if (!counter || !status || !controls.length) return;
  const descriptions = [
    "يبدأ الطلب من جهازك",
    "يعبر الطلب إلى الموجّه",
    "يختار الموجّه المسار الأنسب",
    "يصل الطلب إلى الخادم"
  ];
  function showStep(index) {
    const step = Math.max(0, Math.min(descriptions.length - 1, index));
    stage.dataset.step = String(step + 1);
    counter.textContent = `${String(step + 1).padStart(2, "0")} / 04`;
    status.textContent = descriptions[step];
    controls.forEach((button, buttonIndex) => {
      const current = buttonIndex === step;
      button.classList.toggle("is-current", current);
      button.setAttribute("aria-pressed", String(current));
    });
  }

  controls.forEach((button) => {
    button.addEventListener("click", () => showStep(Number(button.dataset.step)));
  });

  showStep(0);
})();
