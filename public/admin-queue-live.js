/* Badge việc chờ khu quản trị cập nhật GẦN-REALTIME:
   - Poll /backoffice/queue.json mỗi 15 giây (ẩn tab thì dừng, quay lại poll ngay).
   - Vẽ lại: badge số trên sidebar, dải "Đang chờ" topbar (desktop) và dải
     cuộn ngang đầu trang (mobile), tiêu đề tab "(n) …".
   - Số nào TĂNG thì badge nháy nhẹ để người trực để ý. */
(function () {
  "use strict";

  var MAP = [
    { key: "orders", href: "/backoffice/reconciliation", label: "Đơn hoàn tiền" },
    { key: "withdrawals", href: "/backoffice/withdrawals", label: "Yêu cầu rút" },
    { key: "missions", href: "/backoffice/missions", label: "Nhận thưởng" },
    { key: "referralCodes", href: "/backoffice/accounts", label: "Đổi mã mời" },
    { key: "banks", href: "/backoffice/banks", label: "Ngân hàng xác minh" },
    { key: "kol", href: "/backoffice/kol", label: "Duyệt đối tác" },
  ];
  var truoc = null;
  var tieuDeGoc = document.title.replace(/^\(\d+\)\s*/, "");

  function capNhatSidebar(counts) {
    MAP.forEach(function (m) {
      var link = document.querySelector('.st-nav a[href="' + m.href + '"]');
      if (!link) return;
      var badge = link.querySelector(".st-nav-badge");
      var n = counts[m.key] || 0;
      if (n > 0) {
        if (!badge) {
          badge = document.createElement("em");
          badge.className = "st-nav-badge";
          link.appendChild(badge);
        }
        var tang = truoc !== null && n > (truoc[m.key] || 0);
        badge.textContent = String(n);
        badge.setAttribute("aria-label", n + " việc chờ xử lý");
        if (tang) {
          badge.classList.remove("is-bump");
          void badge.offsetWidth; // reset animation
          badge.classList.add("is-bump");
        }
      } else if (badge) {
        badge.remove();
      }
    });
  }

  function veChips(counts) {
    return MAP.filter(function (m) { return (counts[m.key] || 0) > 0; })
      .map(function (m) {
        var a = document.createElement("a");
        a.href = m.href;
        var b = document.createElement("b");
        b.textContent = String(counts[m.key]);
        a.appendChild(b);
        a.appendChild(document.createTextNode(m.label));
        return a;
      });
  }

  function capNhatQueue(counts) {
    var tong = MAP.reduce(function (s, m) { return s + (counts[m.key] || 0); }, 0);

    var desktop = document.querySelector(".bo-queue");
    if (desktop) {
      desktop.textContent = "";
      if (tong > 0) {
        var label = document.createElement("span");
        label.className = "bo-queue-label";
        label.textContent = "Đang chờ";
        desktop.appendChild(label);
        veChips(counts).forEach(function (a) { desktop.appendChild(a); });
      } else {
        var clear = document.createElement("span");
        clear.className = "bo-queue-clear";
        clear.textContent = "Không còn việc chờ xử lý";
        desktop.appendChild(clear);
      }
    }

    var mobile = document.querySelector(".bo-queue-mobile");
    if (mobile) {
      mobile.textContent = "";
      if (tong > 0) {
        veChips(counts).forEach(function (a) { mobile.appendChild(a); });
        mobile.hidden = false;
      } else {
        mobile.hidden = true;
      }
    }

    document.title = tong > 0 ? "(" + tong + ") " + tieuDeGoc : tieuDeGoc;
  }

  function poll() {
    fetch("/backoffice/queue.json", {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (counts) {
        if (!counts) return;
        capNhatSidebar(counts);
        capNhatQueue(counts);
        truoc = counts;
      })
      .catch(function () {});
  }

  var POLL_MS = 15000;
  var timer = null;
  function start() { if (!timer) timer = window.setInterval(poll, POLL_MS); }
  function stop() { if (timer) { window.clearInterval(timer); timer = null; } }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else { poll(); start(); }
  });
  // Render lần đầu đã đúng từ server — chỉ cần poll các nhịp sau.
  start();
})();
