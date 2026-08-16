/* Linh vật góc màn hình + badge chuông: báo khi có phản hồi từ đội CSKH (lúc
   đăng nhập lại / tải trang, và trực tiếp khi đang ở trong app) và khi có thông
   báo chưa đọc. Số phản hồi CSKH được cộng vào badge trên icon chuông
   (mobile + desktop) và cập nhật realtime. */
(function () {
  "use strict";
  if (!window.BlobMascot) return;
  var toast = document.querySelector("[data-blob-toast]");
  if (!toast) return;

  var onSupportPage = toast.getAttribute("data-on-support") === "yes";
  var supportUnread = parseInt(toast.getAttribute("data-support-unread") || "0", 10) || 0;

  // Badge trên icon chuông = thông báo thường (nền) + phản hồi CSKH chưa xem.
  var bellBadge = document.querySelector("[data-notification-badge]");
  var notifBase = bellBadge ? (parseInt(bellBadge.getAttribute("data-notif-base") || "0", 10) || 0) : 0;
  function updateBell(supportCount) {
    if (!bellBadge) return;
    var total = notifBase + (supportCount || 0);
    if (total > 0) {
      bellBadge.textContent = total > 9 ? "9+" : String(total);
      bellBadge.hidden = false;
    } else {
      bellBadge.hidden = true;
    }
  }
  var supportNow = supportUnread;
  var notifNow = notifBase;
  updateBell(supportNow);

  var bell = document.querySelector("[data-notification-trigger]");
  var panel = document.querySelector("[data-notification-panel]");

  function fmtTime(iso) {
    try {
      return new Date(iso).toLocaleString("vi-VN", {
        hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
      });
    } catch (e) { return ""; }
  }

  // Vẽ lại nội dung dropdown chuông từ dữ liệu mới → không cần tải lại trang.
  function renderDropdown(support, items) {
    if (!panel) return;
    Array.prototype.slice
      .call(panel.querySelectorAll(".notification-support-item,.notification-list,.notification-empty"))
      .forEach(function (n) { n.remove(); });
    var frag = document.createDocumentFragment();
    if (support > 0) {
      var a = document.createElement("a");
      a.className = "notification-support-item";
      a.href = "/app/support";
      var sb = document.createElement("b"); sb.textContent = "Đội ngũ chăm sóc đã phản hồi";
      var sp = document.createElement("p"); sp.textContent = support + " tin nhắn mới từ hỗ trợ. Bấm để mở.";
      a.appendChild(sb); a.appendChild(sp); frag.appendChild(a);
    }
    if (items && items.length) {
      var ul = document.createElement("ul"); ul.className = "notification-list";
      items.forEach(function (it) {
        var li = document.createElement("li");
        if (!it.isRead) li.className = "unread";
        var t = document.createElement("b"); t.textContent = it.title; li.appendChild(t);
        if (it.body) { var p = document.createElement("p"); p.textContent = it.body; li.appendChild(p); }
        var tm = document.createElement("time"); tm.textContent = fmtTime(it.createdAt); li.appendChild(tm);
        ul.appendChild(li);
      });
      frag.appendChild(ul);
    } else if (support === 0) {
      var empty = document.createElement("p");
      empty.className = "notification-empty";
      empty.textContent = "Bạn chưa có thông báo mới.";
      frag.appendChild(empty);
    }
    panel.appendChild(frag);
  }

  // Mở chuông (app.js) đã đánh dấu thông báo thường là đã đọc → hạ nền về 0,
  // giữ nguyên phần phản hồi CSKH đang chờ.
  document.addEventListener("notifications:read", function () {
    notifBase = 0;
    notifNow = 0;
    updateBell(supportNow);
  });

  var mascot = window.BlobMascot.create({ mood: "happy", label: "Thông báo ShopTik" });

  var mHost = document.createElement("div");
  mHost.className = "blob-toast-mascot";
  mHost.appendChild(mascot.el);

  var copy = document.createElement("div");
  copy.className = "blob-toast-copy";
  var title = document.createElement("b");
  var body = document.createElement("span");
  copy.appendChild(title);
  copy.appendChild(body);

  var action = document.createElement("button");
  action.type = "button";
  action.className = "blob-toast-go";
  action.textContent = "Xem";

  var closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "blob-toast-close";
  closeBtn.setAttribute("aria-label", "Đóng");
  closeBtn.textContent = "×";

  toast.appendChild(mHost);
  toast.appendChild(copy);
  toast.appendChild(action);
  toast.appendChild(closeBtn);

  var hideTimer = null;
  var onAction = null;

  function show(t, b, handler) {
    title.textContent = t;
    body.textContent = b || "";
    onAction = handler || null;
    action.hidden = !handler;
    toast.hidden = false;
    window.requestAnimationFrame(function () { toast.classList.add("is-open"); });
    mascot.setMood("happy");
    mascot.say("!", 1200);
    if (hideTimer) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hide, 9000);
  }
  function hide() {
    toast.classList.remove("is-open");
    window.setTimeout(function () { toast.hidden = true; }, 250);
  }
  closeBtn.addEventListener("click", hide);
  action.addEventListener("click", function () {
    if (onAction) onAction();
    hide();
  });

  function goSupport() {
    if (window.location.pathname.indexOf("/app/support") === 0) {
      document.dispatchEvent(new CustomEvent("support-chat:open"));
    } else {
      window.location.href = "/app/support";
    }
  }
  function showSupport(count) {
    show(
      "Đội ngũ chăm sóc đã phản hồi",
      count > 1 ? count + " tin nhắn mới đang chờ bạn." : "Bạn có tin nhắn mới từ đội hỗ trợ.",
      goSupport
    );
  }

  // 1) Lúc tải trang / đăng nhập lại: còn phản hồi CSKH chưa xem → báo ngay.
  if (supportUnread > 0 && !onSupportPage) {
    window.setTimeout(function () { showSupport(supportUnread); }, 900);
  } else {
    // Không có phản hồi hỗ trợ → nhắc thông báo chung (một lần mỗi phiên).
    var badge = document.querySelector("[data-notification-badge]");
    if (badge && bell && notifBase > 0) {
      var seen = false;
      try { seen = window.sessionStorage.getItem("blob-notify-seen") === "1"; } catch (e) {}
      if (!seen) {
        window.setTimeout(function () {
          show("Bạn có thông báo mới", "Nhấn để xem chi tiết từ ShopTik.", function () { bell.click(); });
          try { window.sessionStorage.setItem("blob-notify-seen", "1"); } catch (e) {}
        }, 1400);
      }
    }
  }

  // 2) CSKH phản hồi trực tiếp khi đang ở trang có khung chat (poll 5s ở đó).
  document.addEventListener("support-chat:agent", function (e) {
    var d = (e && e.detail) || {};
    supportNow += 1;
    updateBell(supportNow);
    show("Đội ngũ chăm sóc đã phản hồi", d.preview || "Bạn có tin nhắn mới từ đội hỗ trợ.", goSupport);
  });

  // 3) Poll trạng thái thông báo trên MỌI trang → cập nhật badge chuông + vẽ lại
  //    nội dung dropdown + bật linh vật khi có thông báo/tin CSKH mới. Nhờ vậy
  //    KHÔNG cần tải lại trang (áp dụng cả mobile lẫn desktop).
  var POLL_MS = 20000;
  var timer = null;
  function pollState() {
    fetch("/app/notifications/state", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        var notif = data.notif || 0;
        var support = data.support || 0;
        var items = data.items || [];
        // Thông báo thường MỚI (đơn xác nhận, rút được duyệt…) → linh vật báo.
        if (notif > notifNow) {
          var newest = items[0] || null;
          show(
            newest ? newest.title : "Bạn có thông báo mới",
            newest ? newest.body : "Nhấn để xem chi tiết.",
            function () { if (bell) bell.click(); }
          );
        }
        // Phản hồi CSKH mới → chỉ báo khi KHÔNG ở trang hỗ trợ.
        if (support > supportNow && !onSupportPage) { showSupport(support); }
        notifNow = notif;
        notifBase = notif;
        supportNow = support;
        updateBell(supportNow);
        renderDropdown(support, items);
      })
      .catch(function () {});
  }
  function start() { if (!timer) timer = window.setInterval(pollState, POLL_MS); }
  function stop() { if (timer) { window.clearInterval(timer); timer = null; } }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else { pollState(); start(); }
  });
  window.setTimeout(start, POLL_MS);
})();
