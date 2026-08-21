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

  // Giọng Camio: lấy câu từ public/camio-voice.js (một nguồn thoại), có dự phòng.
  function V(group, fallback, vars) {
    var v = window.CamioVoice;
    return (v && v.pick(group, vars)) || fallback;
  }

  function moodFor(type) {
    var t = String(type || "");
    if (t.indexOf("APPROVED") >= 0 || t.indexOf("CASHBACK") >= 0) return "haohung";
    if (t.indexOf("REJECTED") >= 0 || t.indexOf("CANCEL") >= 0) return "ngacnhien";
    if (t.indexOf("CLAIM") >= 0 || t.indexOf("SUPPORT") >= 0) return "baocao";
    return "vuive";
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
      var sb = document.createElement("b"); sb.textContent = V("supportReply", "Đội hỗ trợ vừa nhắn bạn 📩");
      var sp = document.createElement("p"); sp.textContent = support + " tin nhắn mới đang chờ bạn. Bấm để đọc nha 🧡";
      a.appendChild(sb); a.appendChild(sp); frag.appendChild(a);
    }
    if (items && items.length) {
      var ul = document.createElement("ul"); ul.className = "notification-list";
      items.forEach(function (it) {
        var li = document.createElement("li");
        if (!it.isRead) li.className = "unread";
        // Linh vật CamiO đi kèm MỌI thông báo; biểu cảm theo loại (khớp app-base.njk).
        var img = document.createElement("img");
        img.className = "notification-mascot";
        img.src = "/assets/images/mascot/camio-" + moodFor(it.type) + ".png";
        img.alt = ""; img.width = 40; img.height = 40; img.loading = "lazy";
        li.appendChild(img);
        var copy = document.createElement("span"); copy.className = "notification-copy";
        var t = document.createElement("b"); t.textContent = it.title; copy.appendChild(t);
        if (it.body) { var p = document.createElement("p"); p.textContent = it.body; copy.appendChild(p); }
        var tm = document.createElement("time"); tm.textContent = fmtTime(it.createdAt); copy.appendChild(tm);
        li.appendChild(copy);
        ul.appendChild(li);
      });
      frag.appendChild(ul);
    } else if (support === 0) {
      var empty = document.createElement("p");
      empty.className = "notification-empty";
      empty.textContent = V("emptyNotif", "Bạn chưa có thông báo mới.");
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

  // Bấm vào một mục trong chuông → linh vật NGÓ RA và hiện nội dung phản hồi.
  // (uỷ quyền trên panel để bắt cả các mục do JS vẽ lại.)
  if (panel) {
    panel.addEventListener("click", function (e) {
      var t = e.target;
      // Mục "Đội ngũ chăm sóc đã phản hồi" là <a href="/app/support"> → để nó
      // điều hướng MỞ TRANG HỖ TRỢ như bình thường (không chặn).
      if (t && t.closest && t.closest(".notification-support-item")) return;
      var li = t && t.closest ? t.closest(".notification-list li") : null;
      if (li) {
        panel.classList.remove("open");
        var b = li.querySelector("b");
        var p = li.querySelector("p");
        show(b ? b.textContent : "Thông báo", p ? p.textContent : "", null);
      }
    });
  }

  var mascot = window.BlobMascot.create({ mood: "happy", label: "Thông báo ShopTik" });

  // Bong bóng thoại kiểu truyện tranh (đặt PHÍA TRÊN linh vật).
  var bubble = document.createElement("div");
  bubble.className = "blob-toast-bubble";
  var title = document.createElement("b");
  var body = document.createElement("span");
  var actions = document.createElement("div");
  actions.className = "blob-toast-actions";
  var action = document.createElement("button");
  action.type = "button";
  action.className = "blob-toast-go";
  action.textContent = "Xem";
  var closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "blob-toast-close";
  closeBtn.setAttribute("aria-label", "Đóng");
  closeBtn.textContent = "×";
  actions.appendChild(action);
  actions.appendChild(closeBtn);
  bubble.appendChild(title);
  bubble.appendChild(body);
  bubble.appendChild(actions);

  // Linh vật NGÓ RA từ mép phải màn hình.
  var mHost = document.createElement("div");
  mHost.className = "blob-toast-mascot";
  mHost.appendChild(mascot.el);

  toast.appendChild(bubble);
  toast.appendChild(mHost);

  var hideTimer = null;
  var onAction = null;

  function show(t, b, handler) {
    title.textContent = t;
    body.textContent = b || "";
    onAction = handler || null;
    action.hidden = !handler;
    toast.classList.remove("is-center"); // mặc định: ngó ra mép phải
    toast.hidden = false;
    window.requestAnimationFrame(function () { toast.classList.add("is-open"); });
    // Linh vật ngó vào trong (nhìn về phía nội dung/người dùng).
    mascot.setMood("happy");
    mascot.setGaze(-16, -4);
    if (hideTimer) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hide, 11000);
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
  // Hiện nội dung phản hồi ngay trong bong bóng thoại (không cần lịch sử).
  function showSupport(count, preview) {
    var text = (preview && String(preview).trim())
      ? (String(preview).length > 140 ? String(preview).slice(0, 140) + "…" : String(preview))
      : (count > 1 ? count + " tin nhắn mới đang chờ bạn." : "Có phản hồi từ đội hỗ trợ rồi! Bấm để đọc nha 🧡");
    show(V("supportReply", "Đội hỗ trợ vừa nhắn bạn 📩"), text, goSupport);
    // Phản hồi CSKH → linh vật ra GIỮA màn hình cho nổi bật.
    toast.classList.add("is-center");
  }

  var forceSupportShow = supportUnread > 0 && !onSupportPage;

  // 1) Lúc tải trang / đăng nhập lại: còn phản hồi CSKH chưa xem → lấy nội dung
  //    phản hồi mới nhất rồi cho linh vật ngó ra báo.
  if (forceSupportShow) {
    window.setTimeout(pollState, 900);
  } else {
    // Không có phản hồi hỗ trợ → nhắc thông báo chung (một lần mỗi phiên).
    var badge = document.querySelector("[data-notification-badge]");
    if (badge && bell && notifBase > 0) {
      var seen = false;
      try { seen = window.sessionStorage.getItem("blob-notify-seen") === "1"; } catch (e) {}
      if (!seen) {
        window.setTimeout(function () {
          show(V("newNotif", "Bạn có thông báo mới"), V("newNotifBody", "Nhấn để xem chi tiết."), function () { bell.click(); });
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
    showSupport(supportNow, d.preview);
  });

  // 3) Poll trạng thái thông báo trên MỌI trang → cập nhật badge chuông + vẽ lại
  //    nội dung dropdown + bật linh vật khi có thông báo/tin CSKH mới. Nhờ vậy
  //    KHÔNG cần tải lại trang (áp dụng cả mobile lẫn desktop).
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
        // Thông báo thường MỚI (đơn xác nhận, rút được duyệt…) → linh vật báo.
        if (notif > notifNow) {
          var newest = items[0] || null;
          show(
            newest ? newest.title : V("newNotif", "Bạn có thông báo mới"),
            newest ? newest.body : V("newNotifBody", "Nhấn để xem chi tiết."),
            function () { if (bell) bell.click(); }
          );
        }
        // Phản hồi CSKH mới (hoặc lượt hiện lúc tải trang) → linh vật ngó ra báo,
        // kèm nội dung phản hồi mới nhất trong bong bóng.
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
      .catch(function () {});
  }
  function start() { if (!timer) timer = window.setInterval(pollState, POLL_MS); }
  function stop() { if (timer) { window.clearInterval(timer); timer = null; } }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else { pollState(); start(); }
  });
  // Mobile hay tạm dừng timer khi rời tab → poll NGAY khi quay lại / focus /
  // hiển thị lại trang, để không phải reload tay mới thấy linh vật.
  window.addEventListener("focus", pollState);
  window.addEventListener("pageshow", pollState);
  // Poll sớm ngay sau khi tải (không chờ trọn chu kỳ), rồi chạy định kỳ.
  window.setTimeout(function () { pollState(); start(); }, 2500);
})();
