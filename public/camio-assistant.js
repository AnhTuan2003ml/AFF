/*
 * Trợ lý CamiO cố định góc dưới-phải (như một trợ lý AI). Luôn hiện trên các
 * trang /app; sống động nhưng KHÔNG chạy lung tung:
 *   - Idle: lơ lửng lên xuống + đưa nhẹ (áo choàng/tai), thỉnh thoảng "chớp mắt"
 *     (nháy sang biểu cảm nhắm mắt rồi về).
 *   - Có thông báo: nhảy lên + vẫy tay, hiện bong bóng, rồi về chỗ.
 *   - Có tiền hoàn/hoa hồng: biểu cảm vui hơn 1–2 giây.
 *   - Có lỗi/cảnh báo: đổi biểu cảm + rung nhẹ, không di chuyển nhiều.
 * Người dùng KÉO để đổi vị trí, THU NHỎ, hoặc TẮT (nhớ qua localStorage).
 *
 * Chuyển động dùng Web Animations API (element.animate) nên KHÔNG bị rule
 * @media(prefers-reduced-motion:reduce){*{transition/animation-duration:.001ms}}
 * trong luxury-ui.css vô hiệu hoá — vẫn "sống" khi máy tắt hiệu ứng hệ thống.
 *
 * Là mascot DUY NHẤT ở góc phải (đã bỏ hẳn nút hỗ trợ nổi cũ để không trùng);
 * bấm mascot mở /app/support. Khi tắt chỉ còn một tab nhỏ ở mép phải để mở lại.
 *
 * API: window.CamioAssistant.react(kind, {title, body, onAction}) — kind:
 * "notify" | "cashback" | "support" | "error" | "welcome".
 */
(function () {
  "use strict";
  if (!window.BlobMascot) return;

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  var OFF = lsGet("camio-asst-off") === "1";
  var MIN = lsGet("camio-asst-min") === "1";
  var busy = false;      // đang chạy reaction → tạm dừng chớp mắt/idle mood
  var idleMood = "confident"; // tư thế đứng tự tin làm nền idle (bình tĩnh)

  // ---------- DOM ----------
  var root = document.createElement("div");
  root.className = "camio-asst";
  root.setAttribute("data-state", MIN ? "min" : "open");

  var tools = document.createElement("div");
  tools.className = "camio-asst-tools";
  var btnMin = document.createElement("button");
  btnMin.type = "button"; btnMin.className = "camio-asst-tool"; btnMin.title = "Thu nhỏ"; btnMin.textContent = "—";
  var btnOff = document.createElement("button");
  btnOff.type = "button"; btnOff.className = "camio-asst-tool"; btnOff.title = "Tắt trợ lý"; btnOff.textContent = "×";
  tools.appendChild(btnMin); tools.appendChild(btnOff);

  var bubble = document.createElement("div");
  bubble.className = "camio-asst-bubble"; bubble.hidden = true;
  var bTitle = document.createElement("b");
  var bBody = document.createElement("span");
  var bActions = document.createElement("div"); bActions.className = "camio-asst-actions";
  var bGo = document.createElement("button");
  bGo.type = "button"; bGo.className = "camio-asst-go"; bGo.textContent = "Xem";
  var bX = document.createElement("button");
  bX.type = "button"; bX.className = "camio-asst-bx"; bX.textContent = "×"; bX.setAttribute("aria-label", "Đóng");
  bActions.appendChild(bGo); bActions.appendChild(bX);
  bubble.appendChild(bTitle); bubble.appendChild(bBody); bubble.appendChild(bActions);

  var stage = document.createElement("div");
  stage.className = "camio-asst-stage";
  stage.title = "Bấm để mở hỗ trợ · kéo để di chuyển";
  var mascot = window.BlobMascot.create({ mood: "confident", label: "Trợ lý CamiO" });
  stage.appendChild(mascot.el);

  root.appendChild(tools);
  root.appendChild(bubble);
  root.appendChild(stage);

  var reopen = document.createElement("button");
  reopen.type = "button"; reopen.className = "camio-asst-reopen";
  reopen.setAttribute("aria-label", "Mở lại trợ lý CamiO");
  reopen.hidden = true;

  document.body.appendChild(root);
  document.body.appendChild(reopen);

  // ---------- vị trí lưu ----------
  (function applyPos() {
    var pos = null;
    try { pos = JSON.parse(lsGet("camio-asst-pos") || "null"); } catch (e) { pos = null; }
    if (pos && typeof pos.right === "number" && typeof pos.bottom === "number") {
      root.style.right = Math.max(6, pos.right) + "px";
      root.style.bottom = Math.max(6, pos.bottom) + "px";
      root.style.left = "auto"; root.style.top = "auto";
    }
  })();

  // ---------- trạng thái bật/tắt/thu nhỏ ----------
  function setMin(m) {
    MIN = m; lsSet("camio-asst-min", m ? "1" : "0");
    root.setAttribute("data-state", m ? "min" : "open");
    if (m) hideBubble();
  }
  function showOn() { root.hidden = false; reopen.hidden = true; setMin(MIN); startIdle(); }
  function showOff() { root.hidden = true; reopen.hidden = false; }

  // ---------- idle: lơ lửng + đưa nhẹ (WAAPI, sống cả khi reduced-motion) ----------
  var floatAnim = null;
  function startIdle() {
    if (floatAnim || !stage.animate) return;
    floatAnim = stage.animate(
      [
        { transform: "translateY(0) rotate(0deg)" },
        { transform: "translateY(-6px) rotate(1.3deg)" },
        { transform: "translateY(0) rotate(0deg)" },
        { transform: "translateY(-4px) rotate(-1.3deg)" },
        { transform: "translateY(0) rotate(0deg)" }
      ],
      { duration: 4200, iterations: Infinity, easing: "ease-in-out" }
    );
  }
  // "Chớp mắt"/thở nhẹ: ảnh phẳng không tách được mắt để chớp riêng, nên dùng
  // cú nhún dọc rất ngắn (scaleY) chồng lên idle cho cảm giác đang "thở/nháy".
  function blink() {
    if (!document.hidden && !busy && !MIN && stage.animate) {
      stage.animate(
        [{ transform: "scaleY(1)" }, { transform: "scaleY(.93)" }, { transform: "scaleY(1)" }],
        { duration: 200, easing: "ease-in-out", composite: "add" }
      );
    }
    window.setTimeout(blink, 2800 + Math.random() * 3600);
  }
  window.setTimeout(blink, 2600 + Math.random() * 2600);

  // ---------- bong bóng ----------
  var bubbleTimer = null, bubbleAction = null;
  function showBubble(title, body, onAction, ms) {
    if (MIN) setMin(false);
    bTitle.textContent = title || "";
    bBody.textContent = body || "";
    bBody.hidden = !body;
    bubbleAction = onAction || null;
    bGo.hidden = !onAction;
    bubble.hidden = false;
    if (bubbleTimer) window.clearTimeout(bubbleTimer);
    if (ms !== 0) bubbleTimer = window.setTimeout(hideBubble, ms || 9000);
  }
  function hideBubble() { bubble.hidden = true; }
  bX.addEventListener("click", function (e) { e.stopPropagation(); hideBubble(); });
  bGo.addEventListener("click", function (e) { e.stopPropagation(); var f = bubbleAction; hideBubble(); if (f) f(); });

  // ---------- hiệu ứng nhảy/rung (thêm chồng lên idle nhờ composite:"add") ----------
  function jump(px) {
    if (!stage.animate) return;
    stage.animate(
      [
        { transform: "translateY(0)" },
        { transform: "translateY(-" + px + "px)" },
        { transform: "translateY(0)" },
        { transform: "translateY(-" + Math.round(px * 0.45) + "px)" },
        { transform: "translateY(0)" }
      ],
      { duration: 900, easing: "cubic-bezier(.3,1.5,.5,1)", composite: "add" }
    );
  }
  function shake() {
    if (!stage.animate) return;
    stage.animate(
      [
        { transform: "translateX(0)" }, { transform: "translateX(-4px)" },
        { transform: "translateX(4px)" }, { transform: "translateX(-3px)" },
        { transform: "translateX(0)" }
      ],
      { duration: 420, composite: "add" }
    );
  }

  function settle(ms) {
    window.setTimeout(function () { mascot.setMood(idleMood); busy = false; }, ms || 1500);
  }

  // ---------- reactions ----------
  function react(kind, opts) {
    opts = opts || {};
    if (OFF) return;
    if (MIN) setMin(false);
    busy = true;
    if (kind === "cashback") {
      mascot.setMood("haohung"); // giơ nắm đấm ăn mừng
      jump(90); window.setTimeout(function () { jump(55); }, 340);
      showBubble(opts.title || "Bạn vừa được hoàn tiền! 🎉", opts.body || "", opts.onAction, 6500);
      settle(1900);
    } else if (kind === "support") {
      mascot.setMood("thichthu"); jump(60); // chăm chú lắng nghe
      showBubble(opts.title || "CSKH vừa phản hồi", opts.body || "", opts.onAction, 11000);
      settle(1500);
    } else if (kind === "error") {
      mascot.setMood("ngacnhien"); shake(); // ngạc nhiên + rung nhẹ, không chạy
      showBubble(opts.title || "Có lỗi xảy ra", opts.body || "", opts.onAction, 8000);
      settle(1700);
    } else if (kind === "welcome") {
      mascot.setMood("vuive"); jump(46); // vẫy tay chào
      showBubble("Chào mừng bạn quay lại!", opts.body || "", null, 6000);
      settle(1700);
    } else { // notify
      mascot.setMood("haohung"); jump(70);
      showBubble(opts.title || "Bạn có thông báo mới", opts.body || "", opts.onAction, 9000);
      settle(1400);
    }
  }

  // ---------- kéo di chuyển ----------
  var dragging = false, moved = false, sx = 0, sy = 0, startRight = 0, startBottom = 0;
  function onDown(e) {
    if (e.target.closest(".camio-asst-tool, .camio-asst-actions")) return;
    var r = root.getBoundingClientRect();
    startRight = window.innerWidth - r.right;
    startBottom = window.innerHeight - r.bottom;
    sx = e.clientX; sy = e.clientY;
    dragging = true; moved = false;
    root.classList.add("dragging");
    try { root.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
  }
  function onMove(e) {
    if (!dragging) return;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    var w = root.offsetWidth, h = root.offsetHeight;
    var right = Math.min(Math.max(6, startRight - dx), window.innerWidth - w - 6);
    var bottom = Math.min(Math.max(6, startBottom - dy), window.innerHeight - h - 6);
    root.style.right = right + "px"; root.style.bottom = bottom + "px";
    root.style.left = "auto"; root.style.top = "auto";
  }
  function onUp(e) {
    if (!dragging) return;
    dragging = false; root.classList.remove("dragging");
    try { root.releasePointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    if (moved) {
      lsSet("camio-asst-pos", JSON.stringify({
        right: window.innerWidth - root.getBoundingClientRect().right,
        bottom: window.innerHeight - root.getBoundingClientRect().bottom
      }));
    }
  }
  root.addEventListener("pointerdown", onDown);
  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerup", onUp);
  root.addEventListener("pointercancel", onUp);

  // ---------- bấm mascot → mở hỗ trợ (nếu không phải thao tác kéo) ----------
  stage.addEventListener("click", function () {
    if (moved) { moved = false; return; }
    if (window.location.pathname.indexOf("/app/support") === 0) {
      document.dispatchEvent(new CustomEvent("support-chat:open"));
    } else {
      window.location.href = "/app/support";
    }
  });

  // ---------- điều khiển ----------
  btnMin.addEventListener("click", function (e) { e.stopPropagation(); setMin(!MIN); });
  btnOff.addEventListener("click", function (e) { e.stopPropagation(); OFF = true; lsSet("camio-asst-off", "1"); showOff(); });
  reopen.addEventListener("click", function () { OFF = false; lsSet("camio-asst-off", "0"); showOn(); });

  // ---------- khởi động ----------
  if (OFF) { showOff(); } else { showOn(); }

  // Chào mừng khi vừa đăng nhập (server đặt [data-camio-welcome]).
  var wl = document.querySelector("[data-camio-welcome]");
  if (wl && !OFF) {
    var name = (wl.getAttribute("data-welcome-name") || "").trim();
    window.setTimeout(function () { react("welcome", { body: name }); }, 900);
  }

  window.CamioAssistant = { react: react, say: showBubble };
})();
