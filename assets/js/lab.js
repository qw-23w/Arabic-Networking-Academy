/* الحقل التطبيقي — شرح مبسّط + محاكاة شبكة للمبتدئين.
   يُحمَّل قبل lesson.js. يوفّر ANA_LAB.mount({lessonId, uid, onChange}). */
(function (root) {
  "use strict";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ============ محرك المحاكاة (منطق بحت، بلا واجهة) ============ */
  function ipv4(s) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s || "").trim());
    if (!m) return null;
    const p = m.slice(1).map(Number);
    if (p.some((x) => x > 255)) return null;
    return p[0] * 16777216 + p[1] * 65536 + p[2] * 256 + p[3];
  }
  function maskOf(s) {
    s = String(s || "").trim();
    const m = /^\/?(\d{1,2})$/.exec(s);
    if (m) { const n = +m[1]; if (n > 32) return null; return n === 0 ? 0 : ((0xFFFFFFFF << (32 - n)) >>> 0); }
    const v = ipv4(s);
    if (v === null) return null;
    const inv = (~v) >>> 0;
    return ((inv + 1) & inv) === 0 ? v : null;
  }
  const net = (ip, mask) => (ip & mask) >>> 0;
  const LAYER = {
    1: "الطبقة 1 — الفيزيائية (الكابلات)",
    2: "الطبقة 2 — ربط البيانات (السويتش)",
    3: "الطبقة 3 — الشبكة (عناوين IP والراوتر)",
    4: "الطبقة 4 — النقل (المنافذ وجدار الحماية)"
  };
  const byId = (s, id) => s.devices.find((d) => d.id === id);
  const nbrs = (s, id) => { const r = []; s.links.forEach((l) => { if (l[0] === id) r.push(l[1]); else if (l[1] === id) r.push(l[0]); }); return r; };
  // الأجهزة النهائية (PC/راوتر) التي يمكن الوصول إليها من start عبر السويتشات فقط.
  function l2(s, start) {
    const seen = new Set([start]), q = [start], out = [];
    while (q.length) {
      const cur = q.shift();
      nbrs(s, cur).forEach((n) => {
        const d = byId(s, n);
        if (!d) return;
        if (d.type === "sw") { if (!seen.has(n)) { seen.add(n); q.push(n); } }
        else if (n !== start) out.push({ id: n, via: cur });
      });
    }
    return out;
  }
  const F = (layer, msg, fix) => ({ ok: false, layer, label: LAYER[layer] || "", msg, fix: fix || "" });

  function test(S, srcId, dstId, mode) {
    const a = byId(S, srcId), b = byId(S, dstId), o = S.opts || {};
    if (!a || !b) return F(0, "اختر جهازين من القائمتين أولًا.");
    if (a === b) return F(0, "اختر جهازين مختلفين.");
    const ipA = ipv4(a.ip), ipB = ipv4(b.ip);
    if (ipA === null) return F(3, `الجهاز ${a.name} ليس له عنوان IP صحيح.`, `اضغط على ${a.name} واكتب عنوانًا مثل 192.168.1.10`);
    if (ipB === null) return F(3, `الجهاز ${b.name} ليس له عنوان IP صحيح.`, `اضغط على ${b.name} واكتب عنوانًا مثل 192.168.1.20`);
    const mA = maskOf(a.mask), mB = maskOf(b.mask);
    if (mA === null) return F(3, `قناع الشبكة في ${a.name} غير صحيح.`, "استخدم 255.255.255.0 أو /24");
    if (mB === null) return F(3, `قناع الشبكة في ${b.name} غير صحيح.`, "استخدم 255.255.255.0 أو /24");
    const dup = S.devices.find((d) => d.type === "pc" && d !== a && d !== b && (ipv4(d.ip) === ipA || ipv4(d.ip) === ipB));
    if (ipA === ipB || dup) return F(3, "يوجد جهازان لهما العنوان نفسه (تعارض عناوين IP). الشبكة لا تعرف لمن تُسلّم الحزمة.", "اجعل لكل جهاز عنوانًا مختلفًا، مثل .10 و .20 في آخر رقم.");

    if (o.mac) {
      const valid = d => /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(d.mac || "");
      if (!valid(a) || !valid(b)) return F(2, "عنوان MAC غير صالح.", "اكتب ست مجموعات من رقمين سداسيين مثل 02:00:00:00:00:02.");
      if (a.mac.toLowerCase() === b.mac.toLowerCase()) return F(2, "الجهازان يحملان عنوان MAC نفسه؛ لا يمكن تمييز واجهتيهما على هذا المقطع.", "عدّل عنوان MAC في PC2 ليكون فريدًا.");
    }
    let how;
    if (net(ipA, mA) === net(ipB, mA)) {
      if (!l2(S, a.id).some((t) => t.id === b.id)) return F(1, `لا يوجد مسار كابلات بين ${a.name} و${b.name}.`, "وصّل الجهازين بالسويتش نفسه باستخدام زر «وصّل كابل».");
      if (o.groups && a.group !== b.group) return F(2, `${a.name} و${b.name} موجودان في ${o.groupName || "مجموعات"} مختلفة، فالسويتش يعزلهما عن بعض.`, `اجعل الجهازين في ${o.groupName || "المجموعة"} نفسها.`);
      if (net(ipB, mB) !== net(ipA, mB)) return F(3, `${b.name} يعتبر ${a.name} خارج شبكته (قناع الشبكة مختلف) فلن يرد.`, "وحّد قناع الشبكة في الجهازين.");
      how = `الجهازان في الشبكة نفسها (${a.ip}) فتواصلا مباشرة عبر السويتش.`;
    } else {
      if (!a.gw) return F(3, `${b.name} في شبكة مختلفة عن ${a.name}، لكن ${a.name} ليس له بوابة (Gateway) يرسل إليها.`, `اكتب في ${a.name} عنوان البوابة = عنوان منفذ الراوتر القريب منه.`);
      const gw = ipv4(a.gw);
      if (gw === null) return F(3, `عنوان البوابة في ${a.name} غير صحيح.`, "اكتب عنوانًا مثل 192.168.1.1");
      if (net(gw, mA) !== net(ipA, mA)) return F(3, `البوابة ${a.gw} ليست في شبكة ${a.name}، فلا يستطيع الوصول إليها.`, "يجب أن تكون البوابة في الشبكة نفسها.");
      const reachA = l2(S, a.id);
      let rt = null, ifA = null, anyHas = false;
      S.devices.filter((d) => d.type === "rt").forEach((r) => {
        Object.keys(r.ifs || {}).forEach((nb) => {
          if (ipv4(r.ifs[nb].ip) !== gw) return;
          anyHas = true;
          if (!rt && (nb === a.id || reachA.some((t) => t.id === r.id && t.via === nb))) { rt = r; ifA = nb; }
        });
      });
      if (!rt) return anyHas
        ? F(1, `الراوتر الذي يحمل عنوان البوابة ${a.gw} غير موصول بـ ${a.name}.`, "وصّل الراوتر بالجهاز (أو بالسويتش القريب منه).")
        : F(3, `لا يوجد راوتر عنوانه ${a.gw}، فالبوابة المكتوبة في ${a.name} لا تشير إلى شيء.`, "اضغط على الراوتر وانظر عنوان منفذه ثم اكتبه كبوابة.");
      const reachB = l2(S, b.id);
      let ifB = null;
      Object.keys(rt.ifs).forEach((nb) => {
        if (ifB || nb === ifA) return;
        const ii = ipv4(rt.ifs[nb].ip), mm = maskOf(rt.ifs[nb].mask);
        if (ii === null || mm === null || net(ii, mm) !== net(ipB, mm)) return;
        if (nb === b.id || reachB.some((t) => t.id === rt.id && t.via === nb)) ifB = nb;
      });
      if (!ifB) return F(3, `الراوتر ${rt.name} لا يعرف طريقًا إلى شبكة ${b.name}.`, `وصّل ${b.name} بالراوتر وأعطِ منفذ الراوتر عنوانًا في شبكة ${b.name}.`);
      const gwB = ipv4(b.gw);
      if (gwB === null || gwB !== ipv4(rt.ifs[ifB].ip)) return F(3, `وصل الطلب إلى ${b.name} لكن الرد لا يعرف طريق العودة، لأن البوابة في ${b.name} غير صحيحة.`, `اكتب في ${b.name} البوابة = ${rt.ifs[ifB].ip}`);
      how = `${a.name} أرسل الحزمة إلى البوابة، والراوتر ${rt.name} وجّهها إلى شبكة ${b.name}، ثم عاد الرد بالطريق نفسه.`;
    }
    if (mode === "port") {
      if (!b.web) return F(4, `تم رفض الاتصال بالمنفذ 80 في ${b.name}: لا توجد خدمة تعمل عليه. الجهاز نفسه موجود، لكن «الباب» مغلق.`, `فعّل «خدمة الويب» في ${b.name}.`);
      return { ok: true, msg: `${how} وفُتح الاتصال بالمنفذ 80 لأن خدمة الويب تعمل في ${b.name}.` };
    }
    if (b.icmp === false) return F(4, `لا يوجد رد من ${b.name}. وصلت الحزمة لكن جدار الحماية يمنع ping، لذلك يبدو الجهاز «ميتًا» وهو في الحقيقة يعمل.`, "فعّل «السماح بـ ping» في الجهاز الهدف.");
    return { ok: true, msg: how };
  }

  /* ============ محتوى كل درس ============ */
  const pc = (n, x, y, o) => Object.assign({ mac: `02:00:00:00:00:${n.toString(16).padStart(2,"0")}`, id: "pc" + n, type: "pc", name: "PC" + n, x, y, ip: "", mask: "255.255.255.0", gw: "", group: "", web: false, icmp: true }, o || {});
  const sw = (n, x, y) => ({ id: "sw" + n, type: "sw", name: "SW" + n, x, y });
  const rt = (n, x, y, ifs) => ({ id: "r" + n, type: "rt", name: "R" + n, x, y, ifs: ifs || {} });
  const M = "255.255.255.0";
  const star = () => [["pc1", "sw1"], ["pc2", "sw1"]];

  const LABS = {
    1: {
      idea: "الشبكة المحلية (LAN) تربط أجهزة قريبة من بعضها (بيت أو مكتب) عبر سويتش. أما الشبكة الواسعة (WAN) فتربط شبكات بعيدة عن بعضها.",
      how: ["كل جهاز يحتاج كابلًا (أو واي فاي) يوصله بالسويتش.", "السويتش هو «المقسّم» الذي يوصل الأجهزة ببعضها داخل الشبكة نفسها.", "أجهزة الشبكة الواحدة تتشارك أول أرقام العنوان، مثل 192.168.1.x"],
      steps: ["PC3 غير موصول بأي شيء. اضغط «وصّل كابل»، ثم اضغط PC3 وبعده SW1.", "اختر PC1 ثم PC3 واضغط Ping."],
      task: "وصّل PC3 بالسويتش، ثم اختبر الاتصال من PC1 إلى PC3.",
      hint: "اضغط «وصّل كابل»، ثم PC3، ثم SW1. بعدها اختر PC1 ← PC3 واضغط Ping.",
      goal: { a: "pc1", b: "pc3", mode: "ping" },
      preset: () => ({ opts: {}, devices: [pc(1, 90, 70, { ip: "192.168.1.10" }), pc(2, 90, 230, { ip: "192.168.1.11" }), sw(1, 300, 150), pc(3, 510, 150, { ip: "192.168.1.12" })], links: star() })
    },
    2: {
      idea: "نموذج OSI يقسّم الاتصال إلى 7 طبقات. عند حدوث عطل نفحص من الأسفل إلى الأعلى: الكابل أولًا، ثم السويتش، ثم عنوان IP.",
      how: ["الطبقة 1: الكابلات والإشارة.", "الطبقة 2: السويتش وربط الأجهزة المتجاورة.", "الطبقة 3: عناوين IP والراوتر.", "الطبقة 4: المنافذ مثل 80 للويب."],
      steps: ["اضغط Ping من PC1 إلى PC2 ولاحظ سبب الفشل.", "اضغط PC2 وغيّر عنوان PC2 إلى 192.168.1.20 ثم أعد Ping."],
      task: "غيّر عنوان PC2 إلى 192.168.1.20، ثم جرّب Ping مرة أخرى.",
      hint: "الكابلات سليمة، والمشكلة في الطبقة 3. اجعل PC2 في شبكة PC1: عنوانه 192.168.1.20",
      goal: { a: "pc1", b: "pc2", mode: "ping" },
      preset: () => ({ opts: {}, devices: [pc(1, 90, 150, { ip: "192.168.1.10" }), sw(1, 300, 150), pc(2, 510, 150, { ip: "192.168.2.20" })], links: star() })
    },
    3: {
      idea: "كل جهاز في الشبكة يحتاج عنوان IP فريدًا وقناع شبكة. لو تكرر العنوان في جهازين تحصل مشكلة اسمها تعارض عناوين.",
      how: ["العنوان أربعة أرقام مثل 192.168.1.10", "القناع 255.255.255.0 يعني: أول 3 أرقام = اسم الشبكة، والرقم الأخير = رقم الجهاز.", "جهازان في الشبكة نفسها: أول 3 أرقام متطابقة، والأخير مختلف."],
      steps: ["اضغط Ping أولًا لتشاهد مشكلة تكرار العنوان.", "غيّر عنوان PC2 إلى 192.168.1.20 ثم أعد Ping."],
      task: "غيّر عنوان PC2 إلى 192.168.1.20، ثم جرّب Ping.",
      hint: "اجعل عنوان PC2 = 192.168.1.20",
      goal: { a: "pc1", b: "pc2", mode: "ping" },
      preset: () => ({ opts: {}, devices: [pc(1, 90, 70, { ip: "192.168.1.10" }), pc(2, 90, 230, { ip: "192.168.1.10" }), sw(1, 300, 150), pc(3, 510, 150, { ip: "192.168.1.30" })], links: [["pc1", "sw1"], ["pc2", "sw1"], ["pc3", "sw1"]] })
    },
    4: {
      idea: "الراوتر يربط شبكتين مختلفتين. إذا أراد جهاز الكلام مع جهاز في شبكة أخرى فإنه يسلّم الحزمة إلى «البوابة» (Gateway) وهي عنوان الراوتر القريب منه.",
      how: ["لكل منفذ في الراوتر عنوان داخل الشبكة المتصل بها.", "الجهاز يضع عنوان هذا المنفذ كبوابة له.", "بدون بوابة، الجهاز لا يعرف كيف يخرج من شبكته."],
      steps: ["اضغط على R1 لتشاهد عناوين منافذه.", "في PC1 اكتب البوابة 192.168.1.1، وفي PC2 اكتب 192.168.2.1.", "اضغط Ping من PC1 إلى PC2."],
      task: "اكتب البوابة الصحيحة في الجهازين، ثم جرّب Ping.",
      hint: "PC1 ← البوابة 192.168.1.1 ، PC2 ← البوابة 192.168.2.1",
      goal: { a: "pc1", b: "pc2", mode: "ping" },
      preset: () => ({ opts: {}, devices: [pc(1, 90, 150, { ip: "192.168.1.10" }), rt(1, 300, 150, { pc1: { ip: "192.168.1.1", mask: M }, pc2: { ip: "192.168.2.1", mask: M } }), pc(2, 510, 150, { ip: "192.168.2.10" })], links: [["pc1", "r1"], ["pc2", "r1"]] })
    },
    5: {
      idea: "الـ VLAN تقسم سويتشًا واحدًا إلى شبكات منفصلة منطقيًا، كأنك وضعت جدرانًا بين غرف المبنى نفسه. أجهزة VLAN مختلفة لا ترى بعضها.",
      how: ["كل منفذ في السويتش ينتمي إلى VLAN برقم، مثل 10 و20.", "الأجهزة في الـ VLAN نفسها تتواصل، وغير ذلك معزول.", "نستخدمها لفصل الأقسام (إدارة، ضيوف...) دون شراء سويتش لكل قسم."],
      steps: ["جرّب Ping من PC1 إلى PC3؛ يفترض أن ينجح.", "جرّب Ping من PC1 إلى PC2؛ سيفشل لأنهما في VLAN مختلفة.", "اضغط PC2 واختر VLAN 10، ثم أعد Ping."],
      task: "غيّر VLAN في PC2 إلى VLAN 10، ثم جرّب Ping.",
      hint: "اضغط PC2 واختر VLAN 10 من القائمة.",
      goal: { a: "pc1", b: "pc2", mode: "ping" },
      preset: () => ({ opts: { groups: ["VLAN 10", "VLAN 20"], groupName: "VLAN" }, devices: [pc(1, 90, 70, { ip: "192.168.10.11", group: "VLAN 10" }), pc(2, 90, 230, { ip: "192.168.10.12", group: "VLAN 20" }), sw(1, 300, 150), pc(3, 510, 150, { ip: "192.168.10.13", group: "VLAN 10" })], links: [["pc1", "sw1"], ["pc2", "sw1"], ["pc3", "sw1"]] })
    },
    6: {
      idea: "الـ VRF يجعل الراوتر الواحد يعمل كأنه عدة راوترات منفصلة، لكل عميل أو قسم «غرفة توجيه» خاصة به. أما VXLAN فيمدّ شبكة طبقة 2 عبر شبكة IP كأنه نفق.",
      how: ["كل VRF له جدول توجيه خاص ومعزول عن غيره.", "عنوانان متطابقان في VRF مختلفين لا يتعارضان ولا يتواصلان.", "VXLAN يحمل إطارات الشبكة داخل حزم IP ليصل بين مواقع بعيدة (نفق)."],
      steps: ["جرّب Ping من PC1 إلى PC2؛ سيفشل لأنهما في مجموعتين مختلفتين.", "اضغط PC2 واختر VRF أحمر، ثم أعد Ping."],
      task: "غيّر مجموعة PC2 إلى VRF أحمر، ثم جرّب Ping.",
      hint: "اضغط PC2 واختر «VRF أحمر».",
      goal: { a: "pc1", b: "pc2", mode: "ping" },
      preset: () => ({ opts: { groups: ["VRF أحمر", "VRF أزرق"], groupName: "VRF" }, devices: [pc(1, 90, 150, { ip: "192.168.1.10", group: "VRF أحمر" }), sw(1, 300, 150), pc(2, 510, 150, { ip: "192.168.1.20", group: "VRF أزرق" })], links: star() })
    },
    7: {
      idea: "عنوان IP يوصلك إلى الجهاز، أما المنفذ (Port) فيوصلك إلى الخدمة داخله. مثل عنوان المبنى (IP) ورقم الباب (المنفذ). الويب يستخدم المنفذ 80.",
      how: ["Ping يختبر أن الجهاز موجود ويرد.", "TCP يفتح اتصالًا مع منفذ محدد بين جهازين.", "إن لم تكن الخدمة تعمل، يُرفض الاتصال رغم أن الجهاز موجود."],
      steps: ["جرّب Ping من PC1 إلى PC2؛ يفترض أن ينجح.", "اضغط «اتصال بالمنفذ 80»؛ سيفشل لأن الخدمة متوقفة.", "اضغط PC2، فعّل «خدمة الويب»، ثم أعد الاتصال بالمنفذ 80."],
      task: "فعّل خدمة الويب في PC2، ثم اضغط «اتصال بالمنفذ 80».",
      hint: "اضغط PC2 وضع علامة على «خدمة الويب»، ثم اضغط «اتصال بالمنفذ 80».",
      goal: { a: "pc1", b: "pc2", mode: "port" },
      preset: () => ({ opts: { web: true }, devices: [pc(1, 90, 150, { ip: "192.168.1.10" }), sw(1, 300, 150), pc(2, 510, 150, { ip: "192.168.1.20", web: false })], links: star() })
    },
    9: {
      idea: "عنوان MAC معرّف لواجهة الشبكة في الطبقة الثانية، ويستخدمه السويتش لتسليم الإطار محليًا. أما IP فيستخدم للعنونة المنطقية والتوجيه بين الشبكات.",
      how: ["عنوان MAC يتكون عادة من 48 بت ويكتب في ست مجموعات سداسية عشرية.", "يتعلم السويتش عنوان المصدر من الإطار الوارد ويربطه بالمنفذ.", "عند تكرار MAC بين جهازين على الشبكة نفسها قد يصبح تسليم الإطارات غير مستقر."],
      steps: ["اختبر الاتصال ولاحظ تحذير تكرار عنوان MAC.", "اضغط PC2 وعدّل عنوان MAC ليصبح 02:00:00:00:00:02.", "أعد Ping وشاهد الإطار يعبر السويتش."],
      task: "صحّح عنوان MAC المكرر في PC2، ثم أرسل إطارًا ناجحًا من PC1 إلى PC2.",
      hint: "اختر PC2 واجعل MAC = 02:00:00:00:00:02، ثم جرّب Ping.",
      goal: { a: "pc1", b: "pc2", mode: "ping" },
      preset: () => ({ opts: { mac: true }, devices: [pc(1,90,150,{ip:"192.168.1.10"}),sw(1,300,150),pc(2,510,150,{ip:"192.168.1.20",mac:"02:00:00:00:00:01"})], links: star() })
    },
    8: {
      idea: "عند الفشل لا تخمّن: افحص بالترتيب. الكابل، ثم عنوان IP، ثم البوابة، ثم الخدمة، ثم جدار الحماية. وتذكر: عدم رد ping لا يعني دائمًا أن الجهاز معطل.",
      how: ["جدار الحماية قد يمنع ping لأسباب أمنية، والجهاز يعمل.", "اختبار المنفذ يساعدك تعرف هل الجهاز حيّ أم لا.", "الأمن الأساسي: لا تفتح إلا ما تحتاجه."],
      steps: ["اضغط Ping من PC1 إلى PC2؛ لن يرد الجهاز.", "اضغط «اتصال بالمنفذ 80»؛ نجاحه يعني أن الجهاز يعمل.", "اضغط PC2، فعّل «السماح بـ ping»، ثم أعد Ping."],
      task: "اسمح لـ PC2 بالرد على Ping، ثم جرّب مرة أخرى.",
      hint: "جدار حماية PC2 يمنع ping. اضغط PC2 وفعّل «السماح بـ ping».",
      goal: { a: "pc1", b: "pc2", mode: "ping" },
      preset: () => ({ opts: { web: true, fw: true }, devices: [pc(1, 90, 150, { ip: "192.168.1.10" }), sw(1, 300, 150), pc(2, 510, 150, { ip: "192.168.1.20", web: true, icmp: false })], links: star() })
    }
  };

  /* ============ المحاكاة (الواجهة) ============ */
  function createSim(host, cfg, hooks) {
    let S = cfg.preset();
    let sel = null, linking = false, pick = null, drag = null;
    host.innerHTML =
      `<p class="lab-task"><b>مهمتك:</b> ${esc(cfg.task)}</p>
       <div class="lab-tools">
         <button type="button" class="btn secondary small" data-add="pc">+ جهاز PC</button>
         <button type="button" class="btn secondary small" data-add="sw">+ سويتش</button>
         <button type="button" class="btn secondary small" data-add="rt">+ راوتر</button>
         <button type="button" class="btn small" data-link aria-pressed="false">🔌 وصّل كابل</button>
         <button type="button" class="btn secondary small" data-hint>💡 تلميح</button>
         <button type="button" class="btn secondary small" data-reset>↺ إعادة الضبط</button>
       </div>
       <p class="hint lab-status" role="status">اسحب الأجهزة لتحريكها، واضغط على جهاز لتعديل إعداداته.</p>
       <svg class="lab-svg" viewBox="0 0 600 300" role="img" aria-label="لوحة المحاكاة"></svg>
       <div class="lab-dev"></div>
       <div class="lab-test"><b>جرّب الاتصال:</b>
         من <select data-src aria-label="الجهاز المرسل"></select>
         إلى <select data-dst aria-label="الجهاز المستقبل"></select>
         <button type="button" class="btn small" data-ping>Ping</button>
         ${S.opts.web ? '<button type="button" class="btn small" data-port>اتصال بالمنفذ 80</button>' : ""}
       </div>
       <div class="lab-result" role="status" aria-live="polite"></div>`;
    const $ = (q) => host.querySelector(q);
    const svg = $(".lab-svg"), dev = $(".lab-dev"), status = $(".lab-status"), result = $(".lab-result");
    let packetTimer;
    const srcSel = $("[data-src]"), dstSel = $("[data-dst]"), linkBtn = $("[data-link]");
    const say = (t) => { status.textContent = t; };
    const D = (id) => byId(S, id);

    function fillSelects() {
      const pcs = S.devices.filter((d) => d.type === "pc");
      const keep = [srcSel.value, dstSel.value];
      const opts = pcs.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join("");
      srcSel.innerHTML = opts; dstSel.innerHTML = opts;
      const ids = pcs.map((d) => d.id);
      srcSel.value = ids.includes(keep[0]) ? keep[0] : (ids.includes(cfg.goal.a) ? cfg.goal.a : ids[0] || "");
      dstSel.value = ids.includes(keep[1]) ? keep[1] : (ids.includes(cfg.goal.b) ? cfg.goal.b : ids[1] || ids[0] || "");
    }

    function draw() {
      const lines = S.links.map((l) => { const a = D(l[0]), b = D(l[1]); return a && b ? `<line class="lab-link" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>` : ""; }).join("");
      const nodes = S.devices.map((d) => {
        const cls = "lab-node" + (sel === d.id ? " sel" : "") + (pick === d.id ? " pick" : "");
        const shape = d.type === "pc" ? `<rect x="-30" y="-22" width="60" height="42" rx="8"/><text y="7" text-anchor="middle" font-size="22">💻</text>`
          : d.type === "sw" ? `<rect x="-38" y="-18" width="76" height="34" rx="8"/><text y="7" text-anchor="middle" font-size="20">🔀</text>`
          : `<circle r="26"/><text y="8" text-anchor="middle" font-size="22">📡</text>`;
        const sub = d.type === "pc" && d.ip ? `<text class="lab-ip" y="46" text-anchor="middle" font-size="11">${esc(d.ip)}</text>` : "";
        const grp = d.type === "pc" && S.opts.groups && d.group ? `<text class="lab-ip" y="58" text-anchor="middle" font-size="11">${esc(d.group)}</text>` : "";
        return `<g class="${cls}" data-id="${esc(d.id)}" transform="translate(${d.x} ${d.y})">${shape}<text class="lab-name" y="${d.type === "rt" ? 40 : 34}" text-anchor="middle" font-size="13" font-weight="700">${esc(d.name)}</text>${sub}${grp}</g>`;
      }).join("");
      svg.innerHTML = lines + nodes;
    }

    function renderDev() {
      const d = sel && D(sel);
      if (!d) { dev.innerHTML = '<p class="hint">اضغط على أي جهاز في اللوحة لتعديل عنوانه وإعداداته.</p>'; return; }
      let f = "";
      if (d.type === "pc" && S.opts.mac) f += `<label>عنوان MAC <input type="text" dir="ltr" data-f="mac" value="${esc(d.mac || "")}" placeholder="02:00:00:00:00:02"></label>`;
      if (d.type === "pc") {
        f += `<label>عنوان IP <input type="text" dir="ltr" data-f="ip" value="${esc(d.ip)}" placeholder="192.168.1.10" autocomplete="off"></label>
              <label>قناع الشبكة <input type="text" dir="ltr" data-f="mask" value="${esc(d.mask)}" placeholder="255.255.255.0" autocomplete="off"></label>
              <label>البوابة (Gateway) <input type="text" dir="ltr" data-f="gw" value="${esc(d.gw)}" placeholder="اتركها فارغة إن لم تحتجها" autocomplete="off"></label>`;
        if (S.opts.groups) f += `<label>${esc(S.opts.groupName)} <select data-f="group">${S.opts.groups.map((g) => `<option${g === d.group ? " selected" : ""}>${esc(g)}</option>`).join("")}</select></label>`;
        if (S.opts.web) f += `<label class="lab-check"><input type="checkbox" data-f="web"${d.web ? " checked" : ""}> خدمة الويب مفعّلة (المنفذ 80)</label>`;
        if (S.opts.fw) f += `<label class="lab-check"><input type="checkbox" data-f="icmp"${d.icmp !== false ? " checked" : ""}> السماح بـ ping</label>`;
      } else if (d.type === "rt") {
        const ks = Object.keys(d.ifs);
        f += ks.length ? ks.map((k) => `<div class="lab-if"><span>المنفذ نحو ${esc((D(k) || {}).name)}</span>
            <input type="text" dir="ltr" data-if="${esc(k)}" data-k="ip" value="${esc(d.ifs[k].ip)}" placeholder="192.168.1.1" aria-label="عنوان المنفذ">
            <input type="text" dir="ltr" data-if="${esc(k)}" data-k="mask" value="${esc(d.ifs[k].mask)}" placeholder="255.255.255.0" aria-label="قناع المنفذ"></div>`).join("")
          : '<p class="hint">الراوتر غير موصول بشيء بعد. استخدم «وصّل كابل».</p>';
      } else f += '<p class="hint">السويتش لا يحتاج إعدادًا هنا: فقط وصّل الأجهزة به.</p>';
      const cables = nbrs(S, d.id).map((n) => `<button type="button" class="btn secondary small" data-cut="${esc(n)}">فصل ${esc((D(n) || {}).name)} ✂</button>`).join(" ");
      dev.innerHTML = `<div class="lab-dev-head"><b>${esc(d.name)}</b> <button type="button" class="btn secondary small" data-del>🗑 حذف الجهاز</button></div>
        <div class="lab-fields">${f}</div>${cables ? `<p class="lab-cables">الكابلات: ${cables}</p>` : ""}`;
    }
    const refresh = () => { draw(); renderDev(); fillSelects(); };

    function select(id) { sel = id; draw(); renderDev(); }
    function connect(a, b) {
      const A = D(a), B = D(b);
      if (a === b) return say("اختر جهازًا آخر غير الأول.");
      if (S.links.some((l) => (l[0] === a && l[1] === b) || (l[0] === b && l[1] === a))) return say("هذان الجهازان موصولان بالفعل.");
      if ((A.type === "pc" && nbrs(S, a).length >= 1) || (B.type === "pc" && nbrs(S, b).length >= 1)) return say("الجهاز PC له منفذ شبكة واحد فقط. افصل كابله الحالي أولًا.");
      S.links.push([a, b]);
      if (A.type === "rt") A.ifs[b] = { ip: "", mask: M };
      if (B.type === "rt") B.ifs[a] = { ip: "", mask: M };
      say(`تم التوصيل ✔ ${A.name} ↔ ${B.name}` + (A.type === "rt" || B.type === "rt" ? "  — اضغط على الراوتر لتعيين عنوان المنفذ." : ""));
    }
    function cut(a, b) {
      S.links = S.links.filter((l) => !((l[0] === a && l[1] === b) || (l[0] === b && l[1] === a)));
      const A = D(a), B = D(b);
      if (A && A.ifs) delete A.ifs[b];
      if (B && B.ifs) delete B.ifs[a];
    }
    function setLinking(on) { linking = on; pick = null; linkBtn.setAttribute("aria-pressed", on); linkBtn.classList.toggle("on", on); say(on ? "وضع التوصيل: اضغط الجهاز الأول ثم الجهاز الثاني." : "انتهى وضع التوصيل."); draw(); }

    function pt(e) { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left) * 600 / r.width, y: (e.clientY - r.top) * 300 / r.height }; }
    svg.addEventListener("pointerdown", (e) => {
      const g = e.target.closest("[data-id]");
      if (!g) { if (!linking) select(null); return; }
      const d = D(g.dataset.id), p = pt(e);
      drag = { id: d.id, sx: p.x, sy: p.y, ox: d.x, oy: d.y, moved: false };
      try { svg.setPointerCapture(e.pointerId); } catch (x) {}
      e.preventDefault();
    });
    svg.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const p = pt(e), d = D(drag.id);
      if (Math.abs(p.x - drag.sx) + Math.abs(p.y - drag.sy) > 6) drag.moved = true;
      if (!drag.moved) return;
      d.x = Math.max(34, Math.min(566, Math.round(drag.ox + p.x - drag.sx)));
      d.y = Math.max(34, Math.min(250, Math.round(drag.oy + p.y - drag.sy)));
      draw();
    });
    const endDrag = (e) => {
      if (!drag) return;
      const k = drag; drag = null;
      if (k.moved) return;
      if (linking) { if (!pick) { pick = k.id; say("الآن اضغط الجهاز الثاني."); draw(); } else { const f = pick; pick = null; connect(f, k.id); refresh(); } }
      else select(k.id);
    };
    svg.addEventListener("pointerup", endDrag);
    svg.addEventListener("pointercancel", () => { drag = null; });

    host.addEventListener("click", (e) => {
      const t = e.target.closest("button"); if (!t || !host.contains(t)) return;
      if (t.dataset.add) {
        const type = t.dataset.add, pre = { pc: "pc", sw: "sw", rt: "r" }[type], nm = { pc: "PC", sw: "SW", rt: "R" }[type];
        const n = S.devices.filter((d) => d.type === type).reduce((m, d) => Math.max(m, parseInt(d.id.replace(/\D/g, ""), 10) || 0), 0) + 1;
        if (S.devices.length >= 12) return say("وصلت للحد الأقصى (12 جهازًا). احذف جهازًا أولًا.");
        const d = { id: pre + n, type, name: nm + n, x: 300 + ((n * 47) % 120) - 60, y: 40 + ((n * 61) % 190) };
        if (type === "pc") Object.assign(d, { ip: "", mask: M, gw: "", group: (S.opts.groups || [""])[0], mac: `02:00:00:00:00:${n.toString(16).padStart(2,"0")}`, web: false, icmp: true });
        if (type === "rt") d.ifs = {};
        S.devices.push(d); sel = d.id; say(`أُضيف ${d.name}. وصّله بكابل عبر «وصّل كابل».`); refresh();
      } else if (t.hasAttribute("data-link")) setLinking(!linking);
      else if (t.hasAttribute("data-hint")) { result.className = "lab-result hint-box"; result.innerHTML = "💡 " + esc(cfg.hint); }
      else if (t.hasAttribute("data-reset")) { S = cfg.preset(); sel = null; pick = null; if (linking) setLinking(false); result.className = "lab-result"; result.innerHTML = ""; say("أُعيدت اللوحة إلى وضعها الأول."); refresh(); }
      else if (t.hasAttribute("data-del")) { const id = sel; S.links.filter((l) => l.includes(id)).forEach((l) => cut(l[0], l[1])); S.devices = S.devices.filter((d) => d.id !== id); sel = null; refresh(); }
      else if (t.dataset.cut) { cut(sel, t.dataset.cut); refresh(); }
      else if (t.hasAttribute("data-ping") || t.hasAttribute("data-port")) run(t.hasAttribute("data-port") ? "port" : "ping");
    });

    const onEdit = (e) => {
      const el = e.target, d = sel && D(sel); if (!d) return;
      if (el.dataset.f) { d[el.dataset.f] = el.type === "checkbox" ? el.checked : el.value.trim(); draw(); }
      else if (el.dataset.if) { d.ifs[el.dataset.if][el.dataset.k] = el.value.trim(); }
    };
    dev.addEventListener("input", onEdit); dev.addEventListener("change", onEdit);

    function run(mode) {
      const r = test(S, srcSel.value, dstSel.value, mode);
      const A = D(srcSel.value), B = D(dstSel.value);
      const what = mode === "port" ? "الاتصال بالمنفذ 80" : "Ping";
      const goalHit = r.ok && mode === cfg.goal.mode && ((srcSel.value === cfg.goal.a && dstSel.value === cfg.goal.b) || (srcSel.value === cfg.goal.b && dstSel.value === cfg.goal.a));
      // Animate the request along real cables, stopping at the diagnosed failure.
      clearTimeout(packetTimer);
      svg.querySelectorAll(".lab-packet, .lab-packet-failure").forEach(x => x.remove());
      if (A && B && A !== B) {
        const queue = [[A.id]], visited = new Set([A.id]); let path = null;
        while (queue.length) {
          const candidate = queue.shift(), last = candidate[candidate.length - 1];
          if (last === B.id) { path = candidate; break; }
          nbrs(S, last).forEach(n => { if (!visited.has(n)) { visited.add(n); queue.push([...candidate, n]); } });
        }
        // A physical disconnection must never be represented by a packet crossing empty space.
        let route = path || [A.id];
        if (!r.ok) {
          if (r.layer === 1) {
            // Show the packet reaching the last connected device, not jumping the missing cable.
            const seen = new Set([A.id]), q = [[A.id]];
            while (q.length) { const c = q.shift(); if (c.length > route.length) route = c;
              nbrs(S, c[c.length-1]).forEach(n => { if (!seen.has(n)) { seen.add(n); q.push([...c,n]); } }); }
          } else if (r.layer === 2 && path) {
            const switchIndex = path.findIndex(id => D(id)?.type === "sw");
            route = path.slice(0, switchIndex >= 0 ? switchIndex + 1 : 1);
          } else if (r.layer === 3 && path) {
            const routerIndex = path.findIndex(id => D(id)?.type === "rt");
            route = path.slice(0, routerIndex >= 0 ? routerIndex + 1 : 1);
            if (/وصل الطلب إلى/.test(r.msg)) route = path;
          }
        }
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("r", "7"); dot.setAttribute("class", "lab-packet");
        dot.setAttribute("cx", A.x); dot.setAttribute("cy", A.y);
        svg.append(dot);
        const points = route.map(id => D(id)).filter(Boolean);
        const duration = 650;
        function travel(i) {
          if (!dot.isConnected) return;
          if (i >= points.length - 1) {
            if (!r.ok) {
              dot.classList.add("lab-packet-failure"); dot.setAttribute("r", "10");
              const mark = document.createElementNS("http://www.w3.org/2000/svg", "text");
              mark.setAttribute("class", "lab-packet-failure"); mark.setAttribute("x", points[points.length-1].x + 12);
              mark.setAttribute("y", points[points.length-1].y - 12); mark.textContent = "✖"; svg.append(mark);
            } else if (mode === "ping") {
              dot.classList.add("lab-packet-return");
              const back = [...points].reverse();
              function reply(j) { if (!dot.isConnected || j >= back.length - 1) return;
                const from = back[j], to = back[j+1];
                const animation = document.createElementNS("http://www.w3.org/2000/svg", "animateMotion");
                animation.setAttribute("dur", duration + "ms"); animation.setAttribute("fill", "freeze");
                animation.setAttribute("path", `M ${from.x} ${from.y} L ${to.x} ${to.y}`);
                dot.setAttribute("cx", "0"); dot.setAttribute("cy", "0"); dot.replaceChildren(animation);
                animation.beginElement(); packetTimer = setTimeout(() => { dot.setAttribute("cx", to.x); dot.setAttribute("cy", to.y); dot.replaceChildren(); reply(j+1); }, duration);
              } reply(0);
            }
            return;
          }
          const from = points[i], to = points[i+1];
          const animation = document.createElementNS("http://www.w3.org/2000/svg", "animateMotion");
          animation.setAttribute("dur", duration + "ms"); animation.setAttribute("fill", "freeze");
          animation.setAttribute("path", `M ${from.x} ${from.y} L ${to.x} ${to.y}`);
          dot.setAttribute("cx", "0"); dot.setAttribute("cy", "0"); dot.replaceChildren(animation);
          animation.beginElement(); packetTimer = setTimeout(() => { dot.setAttribute("cx", to.x); dot.setAttribute("cy", to.y); dot.replaceChildren(); travel(i+1); }, duration);
        }
        travel(0);
      }
      if (r.ok) result.className = "lab-result ok", result.innerHTML = `<b>✔ نجح ${what}${A && B ? ` من ${esc(A.name)} إلى ${esc(B.name)}` : ""}</b><p>${esc(r.msg)}</p>${goalHit ? "<p><b>🎉 أنجزت مهمة هذا الدرس!</b></p>" : ""}`;
      else result.className = "lab-result bad", result.innerHTML = `<b>✘ فشل ${what}</b>${r.label ? ` <span class="badge soon">${esc(r.label)}</span>` : ""}<p>${esc(r.msg)}</p>${r.fix ? `<p>🛠 ${esc(r.fix)}</p>` : ""}`;
      if (goalHit) hooks.onGoal();
    }
    refresh();
    return { reset: () => host.querySelector("[data-reset]").click() };
  }

  /* ============ النافذة + البطاقة + حفظ الإنجاز ============ */
  function mount(o) {
    const cfg = LABS[o.lessonId];
    if (!cfg) return null;
    const key = `ana_lab_${o.uid}_${o.lessonId}`;
    const prog = { u: false, g: false };
    try { const r = JSON.parse(localStorage.getItem(key) || "{}"); prog.u = !!r.u; prog.g = !!r.g; } catch (e) {}
    const isDone = () => prog.u && prog.g;
    const save = () => { try { localStorage.setItem(key, JSON.stringify(prog)); } catch (e) {} };

    const card = document.createElement("div");
    card.className = "card lab-card";
    card.innerHTML = `<div><h3>🧪 الحقل التطبيقي</h3><p>شرح مبسّط لكيفية عمل هذا الدرس + محاكاة تبني فيها شبكتك وتجرّبها بنفسك. <b>إجباري</b> قبل وضع علامة «مكتمل».</p></div>
      <div class="lab-card-act"><span class="badge soon" data-badge></span><button type="button" class="btn" data-open>افتح الحقل التطبيقي</button></div>`;
    const lesson = document.querySelector(".lesson");
    const slot = document.getElementById("lab-slot"); if (slot) slot.append(card); else if (lesson) lesson.append(card); else return null;

    const ov = document.createElement("div");
    ov.className = "lab-overlay hidden";
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-labelledby", "lab-title");
    ov.innerHTML = `<div class="lab-panel">
      <div class="lab-head"><h2 id="lab-title">🧪 الحقل التطبيقي — الدرس ${{1:1,2:2,9:3,3:4,7:5,4:6,5:7,6:8,8:9}[o.lessonId] || o.lessonId}</h2><button type="button" class="btn secondary small" data-close>إغلاق ✕</button></div>
      <ul class="lab-checks"><li data-c="u">قرأت الشرح وفهمته</li><li data-c="g">أنجزت مهمة المحاكاة</li></ul>
      <div class="alert ok hidden" data-win>🎉 أنهيت الحقل التطبيقي. يمكنك الآن إغلاقه ووضع علامة «مكتمل» في آخر الدرس.</div>
      <div class="lab-tabs" role="tablist">
        <button type="button" role="tab" data-tab="explain" aria-selected="true">① الشرح</button>
        <button type="button" role="tab" data-tab="sim" aria-selected="false">② المحاكاة</button>
      </div>
      <div class="lab-pane" data-pane="explain">
        <div class="alert info"><b>الفكرة:</b> ${esc(cfg.idea)}</div>
        <h3>كيف يعمل؟</h3><ul>${cfg.how.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <h3>ماذا ستفعل في المحاكاة؟</h3><ol>${cfg.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
        <p><button type="button" class="btn success" data-understood>فهمت الشرح — انتقل إلى المحاكاة ←</button></p>
      </div>
      <div class="lab-pane hidden" data-pane="sim"></div>
    </div>`;
    document.body.appendChild(ov);
    const $ = (q) => ov.querySelector(q);

    function paint() {
      card.querySelector("[data-badge]").textContent = isDone() ? "مكتمل ✔" : "إجباري";
      card.querySelector("[data-badge]").className = "badge " + (isDone() ? "done" : "soon");
      card.querySelector("[data-open]").textContent = isDone() ? "افتح الحقل التطبيقي مرة أخرى" : "افتح الحقل التطبيقي";
      ov.querySelectorAll(".lab-checks li").forEach((li) => li.classList.toggle("ok", !!prog[li.dataset.c]));
      $("[data-win]").classList.toggle("hidden", !isDone());
    }
    function tab(name) {
      ov.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === name));
      ov.querySelectorAll("[data-pane]").forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== name));
    }
    const changed = () => { save(); paint(); if (o.onChange) o.onChange(); };
    const sim = createSim($("[data-pane=sim]"), cfg, { onGoal: () => { if (!prog.g) { prog.g = true; changed(); } } });

    let opener = null;
    const close = () => { ov.classList.add("hidden"); document.body.style.overflow = ""; if (opener) opener.focus(); };
    card.querySelector("[data-open]").addEventListener("click", (e) => { opener = e.currentTarget; ov.classList.remove("hidden"); document.body.style.overflow = "hidden"; tab("explain"); $("[data-close]").focus(); });
    $("[data-close]").addEventListener("click", close);
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !ov.classList.contains("hidden")) close(); });
    ov.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => tab(b.dataset.tab)));
    $("[data-understood]").addEventListener("click", () => { if (!prog.u) { prog.u = true; changed(); } tab("sim"); });
    paint();
    return { isDone };
  }

  root.ANA_LAB = { mount };
  root.ANA_LAB_ENGINE = { test, ipv4, maskOf, LABS };
  if (typeof module !== "undefined" && module.exports) module.exports = { test, ipv4, maskOf, LABS };
})(typeof window !== "undefined" ? window : globalThis);
