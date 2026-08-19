/* Badge chuông + poll thông báo/CSKH. Phần HIỂN THỊ linh vật đã dời sang trợ lý
   CamiO cố định (camio-assistant.js): file này chỉ tính badge, vẽ lại dropdown,
   và GỌI window.CamioAssistant.react(...) khi có thông báo / phản hồi CSKH mới.
   Số phản hồi CSKH cộng vào badge chuông (mobile + desktop), cập nhật realtime. */
(function () {
  "use strict";
  var toast = document.querySelector("[data-blob-toast]");
  if (!toast) return;

  function react(kind, opts) {
    if (window.CamioAssistant) window.CamioAssistant.react(kind, opts || {});
  }

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

  // Đang ở trang Hỗ trợ = đã xem phản hồi CSKH (server cũng markSupportRead) →
  // bỏ đánh dấu ngay: hạ phần CSKH trên chuông về 0 và xoá mục "đã phản hồi".
  if (onSupportPage) {
    supportNow = 0;
    updateBell(0);
    if (panel) {
      var __sup = panel.querySelector(".notification-support-item");
      if (__sup) __sup.remove();
    }
  }

  // Bấm vào một mục trong chuông → trợ lý CamiO hiện nội dung thông báo.
  if (panel) {
    panel.addEventListener("click", function (e) {
      var t = e.target;
      if (t && t.closest && t.closest(".notification-support-item")) return;
      var li = t && t.closest ? t.closest(".notification-list li") : null;
      if (li) {
        panel.classList.remove("open");
        var b = li.querySelector("b");
        var p = li.querySelector("p");
        react("notify", { title: b ? b.textContent : "Thông báo", body: p ? p.textContent : "", onAction: null });
      }
    });
  }

  function goSupport() {
    if (window.location.pathname.indexOf("/app/support") === 0) {
      document.dispatchEvent(new CustomEvent("support-chat:open"));
    } else {
      window.location.href = "/app/support";
    }
  }
  function showSupport(count, preview) {
    var text = (preview && String(preview).trim())
      ? (String(preview).length > 140 ? String(preview).slice(0, 140) + "…" : String(preview))
      : (count > 1 ? count + " phản hồi mới đang chờ bạn." : "Bạn có phản hồi mới từ đội hỗ trợ.");
    react("support", { title: "CSKH vừa phản hồi", body: text, onAction: goSupport });
  }

  var forceSupportShow = supportUnread > 0 && !onSupportPage;

  // 1) Lúc tải trang / đăng nhập lại: còn phản hồi CSKH chưa xem → lấy nội dung
  //    phản hồi mới nhất rồi cho trợ lý báo.
  if (forceSupportShow) {
    window.setTimeout(pollState, 900);
  } else {
    // Không có phản hồi hỗ trợ → nhắc thông báo chung (một lần mỗi phiên).
    if (bellBadge && bell && notifBase > 0) {
      var seen = false;
      try { seen = window.sessionStorage.getItem("blob-notify-seen") === "1"; } catch (e) { seen = false; }
      if (!seen) {
        window.setTimeout(function () {
          react("notify", { title: "Bạn có thông báo mới", body: "Nhấn để xem chi tiết từ ShopTik.", onAction: function () { bell.click(); } });
          try { window.sessionStorage.setItem("blob-notify-seen", "1"); } catch (e) { /* ignore */ }
        }, 1600);
      }
    }
  }

  // 2) CSKH phản hồi trực tiếp khi đang ở trang có khung chat.
  document.addEventListener("support-chat:agent", function (e) {
    var d = (e && e.detail) || {};
    supportNow += 1;
    updateBell(supportNow);
    showSupport(supportNow, d.preview);
  });

  // 3) Poll trạng thái thông báo trên MỌI trang → cập nhật badge + dropdown +
  //    bật trợ lý khi có thông báo/CSKH mới (không cần tải lại trang).
  var POLL_MS = 15000;
  var timer = null;
  function pollState() {
    fetch("/app/notifications/state", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        var notif = data.notif || 0;
        var support = data.support || 0;
        var items = data.items || [];
        // Thông báo thường MỚI → trợ lý báo. Đơn hoàn tất (ORDER_APPROVED) =
        // có tiền hoàn → dùng reaction "cashback" vui hơn.
        if (notif > notifNow) {
          var newest = items[0] || null;
          var kind = newest && newest.type === "ORDER_APPROVED" ? "cashback" : "notify";
          react(kind, {
            title: newest ? newest.title : "Bạn có thông báo mới",
            body: newest ? newest.body : "Nhấn để xem chi tiết.",
            onAction: function () { if (bell) bell.click(); }
          });
        }
        if ((support > supportNow || (forceSupportShow && support > 0)) && !onSupportPage) {
          showSupport(support, data.supportPreview);
        }
        forceSupportShow = false;
        notifNow = notif;
        notifBase = notif;
        supportNow = support;
        updateBell(supportNow);
        renderDropdown(support, items);
      })
      .catch(function () { /* ignore */ });
  }
  function start() { if (!timer) timer = window.setInterval(pollState, POLL_MS); }
  function stop() { if (timer) { window.clearInterval(timer); timer = null; } }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else { pollState(); start(); }
  });
  window.addEventListener("focus", pollState);
  window.addEventListener("pageshow", pollState);
  window.setTimeout(function () { pollState(); start(); }, 2500);
})();
