/*
 * Popup điểm danh: mở từ menu ([data-checkin-open]). Nạp trạng thái qua
 * GET /app/checkin (chuỗi ngày, tổng, danh sách ngày), vẽ LỊCH THÁNG + THANH
 * TIẾN ĐỘ; bấm nút "Điểm danh hôm nay" hoặc ô ngày hôm nay → POST /app/checkin.
 */
(function () {
  "use strict";
  var scrim = document.querySelector("[data-checkin-scrim]");
  if (!scrim) return;
  var modal = scrim.querySelector(".checkin-modal");
  var el = {
    streak: scrim.querySelector("[data-checkin-streak]"),
    total: scrim.querySelector("[data-checkin-total]"),
    prog: scrim.querySelector("[data-checkin-progress]"),
    progLabel: scrim.querySelector("[data-checkin-progress-label]"),
    month: scrim.querySelector("[data-checkin-month]"),
    cal: scrim.querySelector("[data-checkin-cal]"),
    doBtn: scrim.querySelector("[data-checkin-do]"),
    note: scrim.querySelector("[data-checkin-note]"),
  };
  var state = null;
  var lastFocused = null;

  function csrf() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute("content") : "";
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // Dải 7 ngày trong TUẦN NÀY (T2–CN) kiểu điểm danh của các sàn.
  var week = scrim.querySelector("[data-checkin-week]");
  var LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  function renderWeek(set) {
    if (!week || !state) return;
    var t = String(state.today).split("-");
    var base = new Date(Date.UTC(+t[0], +t[1] - 1, +t[2]));
    var dow = (base.getUTCDay() + 6) % 7; // T2 = 0
    var monday = new Date(base);
    monday.setUTCDate(base.getUTCDate() - dow);
    week.innerHTML = "";
    for (var i = 0; i < 7; i++) {
      var d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      var iso = d.toISOString().slice(0, 10);
      var cell = document.createElement("div");
      cell.className = "cw-day";
      var lab = document.createElement("small");
      lab.textContent = LABELS[i];
      var dot = document.createElement("span");
      dot.className = "cw-dot";
      if (set[iso]) { cell.classList.add("is-done"); dot.textContent = "✓"; }
      else { dot.textContent = d.getUTCDate(); }
      if (iso === state.today) cell.classList.add("is-today");
      if (iso > state.today) cell.classList.add("is-future");
      cell.appendChild(lab);
      cell.appendChild(dot);
      week.appendChild(cell);
    }
  }

  function render() {
    if (!state) return;
    el.streak.textContent = state.streak;
    el.total.textContent = state.totalDays;
    var p = String(state.today).split("-");
    var year = +p[0], month = +p[1] - 1, todayDay = +p[2];
    el.month.textContent = "Tháng " + (month + 1) + " / " + year;
    var set = {};
    (state.dates || []).forEach(function (d) { set[d] = true; });
    var prefix = year + "-" + pad(month + 1) + "-";
    var doneThisMonth = (state.dates || []).filter(function (d) { return d.indexOf(prefix) === 0; }).length;
    var pct = todayDay > 0 ? Math.round((doneThisMonth / todayDay) * 100) : 0;
    el.prog.style.width = Math.min(100, pct) + "%";
    el.progLabel.textContent = doneThisMonth + "/" + todayDay + " ngày trong tháng này";

    renderWeek(set);

    el.cal.innerHTML = "";
    var firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0=CN
    var offset = (firstDow + 6) % 7; // T2 = 0
    var daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    for (var i = 0; i < offset; i++) {
      var em = document.createElement("span");
      em.className = "cal-cell cal-empty";
      el.cal.appendChild(em);
    }
    for (var day = 1; day <= daysInMonth; day++) {
      var iso = year + "-" + pad(month + 1) + "-" + pad(day);
      var isToday = day === todayDay;
      var cell = document.createElement(isToday ? "button" : "span");
      cell.className = "cal-cell";
      cell.textContent = day;
      if (set[iso]) cell.classList.add("is-done");
      if (day > todayDay) cell.classList.add("is-future");
      if (isToday) {
        cell.classList.add("is-today");
        cell.type = "button";
        if (state.checkedInToday) cell.disabled = true;
        else cell.addEventListener("click", checkIn);
      }
      el.cal.appendChild(cell);
    }
    if (state.checkedInToday) {
      el.doBtn.disabled = true;
      el.doBtn.textContent = "Đã điểm danh hôm nay ✓";
    } else {
      el.doBtn.disabled = false;
      el.doBtn.textContent = "Điểm danh hôm nay";
    }
  }

  function load() {
    el.doBtn.disabled = true;
    el.doBtn.textContent = "Đang tải…";
    fetch("/app/checkin", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d) { state = d; render(); } })
      .catch(function () { el.doBtn.textContent = "Không tải được"; });
  }

  function checkIn() {
    if (state && state.checkedInToday) return;
    el.doBtn.disabled = true;
    el.doBtn.textContent = "Đang điểm danh…";
    fetch("/app/checkin", {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "x-csrf-token": csrf() },
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d) {
          state = d;
          render();
          if (d.justCheckedIn) el.note.textContent = "Điểm danh thành công! Chuỗi " + d.streak + " ngày liên tiếp.";
        } else { el.doBtn.disabled = false; el.doBtn.textContent = "Thử lại"; }
      })
      .catch(function () { el.doBtn.disabled = false; el.doBtn.textContent = "Thử lại"; });
  }

  function open(preloaded) {
    lastFocused = document.activeElement;
    // đóng menu tài khoản nếu đang mở
    Array.prototype.forEach.call(document.querySelectorAll(".open"), function (n) {
      if (n.hasAttribute("data-menu") || n.classList.contains("st-menu") || n.classList.contains("px-account-menu")) n.classList.remove("open");
    });
    scrim.hidden = false;
    scrim.removeAttribute("inert");
    document.body.classList.add("no-scroll");
    if (scrim.animate) scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, fill: "forwards" });
    if (modal && modal.animate) modal.animate(
      [{ transform: "translateY(16px) scale(.97)", opacity: 0 }, { transform: "none", opacity: 1 }],
      { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" },
    );
    // Auto-mở đã có sẵn state (preloaded) → chỉ vẽ, khỏi gọi lại API.
    if (preloaded && state) render();
    else load();
    var c = scrim.querySelector("[data-checkin-close]");
    if (c) c.focus();
  }
  function close() {
    scrim.hidden = true;
    scrim.setAttribute("inert", "");
    document.body.classList.remove("no-scroll");
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  }

  document.addEventListener("click", function (e) {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest("[data-checkin-open]")) { e.preventDefault(); open(); return; }
    if (e.target.closest("[data-checkin-close]")) { e.preventDefault(); close(); return; }
    var calBtn = e.target.closest("[data-checkin-cal-toggle]");
    if (calBtn) {
      var wrap = scrim.querySelector("[data-checkin-calwrap]");
      var willOpen = wrap.hidden;
      wrap.hidden = !willOpen;
      calBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
      calBtn.textContent = willOpen ? "Ẩn lịch tháng ▴" : "Xem lịch tháng ▾";
      return;
    }
    if (e.target === scrim) close();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !scrim.hidden) close(); });
  if (el.doBtn) el.doBtn.addEventListener("click", checkIn);

  // Tự bật popup điểm danh khi VÀO trang nếu hôm nay CHƯA điểm danh; đã điểm
  // danh thì không hiện (vẫn mở tay được qua nút "Điểm danh"). Chờ quảng cáo vào
  // trang xong (sự kiện entry-promo-done) để hai popup không chồng nhau; có
  // timeout dự phòng phòng khi quảng cáo không phát sự kiện.
  var autoEvaluated = false;
  function autoEval() {
    if (autoEvaluated) return;
    autoEvaluated = true;
    fetch("/app/checkin", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && !d.checkedInToday) { state = d; open(true); } })
      .catch(function () {});
  }
  document.addEventListener("entry-promo-done", autoEval);
  window.setTimeout(function () {
    var promo = document.querySelector("[data-entry-promo]");
    if (!(promo && !promo.hidden)) autoEval();
  }, 3000);
})();
