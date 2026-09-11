// Cập nhật bảng xếp hạng gần realtime trên web mà KHÔNG reload trang và KHÔNG
// phá trạng thái tab/confetti: định kỳ gọi /api/v1/leaderboard rồi ghi đè
// tên · số đơn · ảnh của từng bục tại chỗ. Bảng được tính trực tiếp từ DB nên
// dữ liệu luôn tươi; ở đây chỉ kéo về sớm.
(function () {
  "use strict";
  var section = document.querySelector(".lb2-section");
  if (!section) return;

  var EN = document.documentElement.lang === "en";
  var ORDER_WORD = EN ? "orders" : "đơn";
  var EMPTY_WORD = EN ? "Empty" : "Chưa có";
  var POLL_MS = 45000;

  function firstLetter(name) {
    return (name || "?").trim().charAt(0).toUpperCase() || "?";
  }

  function setAvatar(spot, item, isProduct) {
    var av = spot.querySelector(".lb2-avatar");
    if (!av) return;
    var img = item && (isProduct ? item.imageUrl : item.avatarUrl);
    if (img) {
      av.classList.add("lb2-avatar-img");
      var el = av.querySelector("img");
      if (!el) {
        av.textContent = "";
        el = document.createElement("img");
        el.loading = "lazy";
        el.referrerPolicy = "no-referrer";
        el.alt = "";
        av.appendChild(el);
      }
      if (el.getAttribute("src") !== img) el.setAttribute("src", img);
    } else {
      av.classList.remove("lb2-avatar-img");
      av.textContent = item ? (isProduct ? "▣" : firstLetter(item.name)) : "?";
    }
  }

  function setSpot(spot, item, isProduct) {
    if (!spot) return;
    var nameEl = spot.querySelector(".lb2-name");
    var countEl = spot.querySelector(".lb2-count");
    if (item) {
      spot.classList.remove("is-empty");
      if (nameEl) nameEl.textContent = item.name;
      if (countEl) {
        var b = countEl.querySelector("b");
        if (b) {
          b.textContent = String(item.count);
          // đảm bảo phần chữ sau <b> đúng ngôn ngữ
          if (b.nextSibling) b.nextSibling.textContent = " " + ORDER_WORD;
          else countEl.appendChild(document.createTextNode(" " + ORDER_WORD));
        } else {
          countEl.innerHTML = "<b>" + item.count + "</b> " + ORDER_WORD;
        }
      }
    } else {
      spot.classList.add("is-empty");
      if (nameEl) nameEl.textContent = EMPTY_WORD;
      if (countEl) countEl.textContent = "—";
    }
    setAvatar(spot, item, isProduct);
  }

  function paintPanel(panel, rows, isProduct) {
    if (!panel) return;
    // Bục theo hạng: rank1→rows[0], rank2→rows[1], rank3→rows[2].
    [1, 2, 3].forEach(function (rank) {
      var spot = panel.querySelector(".lb2-spot-" + rank);
      setSpot(spot, rows[rank - 1] || null, isProduct);
    });
  }

  function apply(data) {
    if (!data) return;
    var period = section.querySelector(".lb2-period");
    if (period && data.monthLabel) period.textContent = data.monthLabel;
    var panels = section.querySelectorAll(".lb2-panel");
    if (panels[0] && panels[0].querySelector(".lb2-podium"))
      paintPanel(panels[0], data.topBuyers || [], false);
    if (panels[1] && panels[1].querySelector(".lb2-podium"))
      paintPanel(panels[1], data.topProducts || [], true);
  }

  function refresh() {
    if (document.visibilityState === "hidden") return;
    fetch("/api/v1/leaderboard", { credentials: "same-origin" })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(apply)
      .catch(function () {
        /* im lặng — lần sau thử lại */
      });
  }

  var timer = setInterval(refresh, POLL_MS);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") refresh();
  });
  window.addEventListener("pagehide", function () {
    clearInterval(timer);
  });
})();
