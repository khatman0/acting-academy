/**
 * tickets.js
 * ---------------------------------------------------
 * منطق صفحات عمومی «نمایش‌ها»: لیست نمایش‌ها، صفحه‌ی جزئیات
 * و فرم خرید بلیط (مهمان، بدون نیاز به لاگین).
 *
 * پیش‌نیاز: باید بعد از supabase-config.js لود بشه.
 * جدول‌ها و تابع book_tickets باید از قبل توی Supabase
 * با فایل sql/shows_tickets_schema.sql ساخته شده باشن.
 * ---------------------------------------------------
 */

function escapeHtmlTickets(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatShowDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" });
}

function formatShowTime(timeString) {
  if (!timeString) return "";
  return timeString.slice(0, 5); // "20:30:00" -> "20:30"
}

function formatPrice(n) {
  return Number(n || 0).toLocaleString("fa-IR") + " تومان";
}

// ==================== صفحه‌ی لیست نمایش‌ها ====================
async function loadShowsList() {
  const wrap = document.getElementById("shows-grid");
  const { data, error } = await supabaseClient
    .from("shows")
    .select("*")
    .eq("status", "published")
    .order("show_date", { ascending: true });

  if (error) {
    wrap.innerHTML = `<div class="empty-state">خطا در بارگذاری نمایش‌ها.</div>`;
    return;
  }
  if (!data || data.length === 0) {
    wrap.innerHTML = `<div class="empty-state">فعلاً نمایشی برای فروش بلیط منتشر نشده. به‌زودی برمی‌گردیم!</div>`;
    return;
  }

  wrap.innerHTML = data.map(show => {
    const remaining = show.total_capacity - show.sold_count;
    const soldOut = remaining <= 0;
    return `
      <a href="show.html?id=${show.id}" class="card">
        <div class="card-img"><img src="${show.cover_image_url || 'assets/placeholder.jpg'}" alt="${escapeHtmlTickets(show.title)}" loading="lazy" /></div>
        <div class="card-body">
          <h3>${escapeHtmlTickets(show.title)}</h3>
          <p class="role">${formatShowDate(show.show_date)} — ساعت ${formatShowTime(show.show_time)}</p>
          <p class="desc">${escapeHtmlTickets(show.venue || "")}</p>
          <p class="desc" style="margin-top:8px;color:${soldOut ? '#e07a86' : 'var(--marquee-gold-light)'};font-weight:700;">
            ${soldOut ? "بلیط تمام شد" : `${remaining} صندلی باقی‌مانده`}
          </p>
        </div>
      </a>
    `;
  }).join("");
}

// ==================== صفحه‌ی جزئیات + خرید بلیط ====================
async function loadShowDetail() {
  const wrap = document.getElementById("show-detail-wrap");
  const params = new URLSearchParams(window.location.search);
  const showId = params.get("id");

  if (!showId) {
    wrap.innerHTML = `<div class="empty-state">نمایشی مشخص نشده است.</div>`;
    return;
  }

  const { data: show, error } = await supabaseClient
    .from("shows")
    .select("*")
    .eq("id", showId)
    .eq("status", "published")
    .single();

  if (error || !show) {
    wrap.innerHTML = `<div class="empty-state">این نمایش پیدا نشد یا دیگر در دسترس نیست.</div>`;
    return;
  }

  const remaining = show.total_capacity - show.sold_count;
  const soldOut = remaining <= 0;

  wrap.innerHTML = `
    <div class="post-single">
      <div class="cover"><img src="${show.cover_image_url || 'assets/placeholder.jpg'}" alt="${escapeHtmlTickets(show.title)}" /></div>
      <h1>${escapeHtmlTickets(show.title)}</h1>
      <p class="post-meta">${formatShowDate(show.show_date)} — ساعت ${formatShowTime(show.show_time)} · ${escapeHtmlTickets(show.venue || "")}</p>
      <div class="content"><p>${escapeHtmlTickets(show.description || "")}</p></div>
    </div>

    <div class="form-card" id="ticket-form-card">
      <h2>خرید بلیط</h2>
      <p class="sub">قیمت هر بلیط: ${formatPrice(show.price)} — ${soldOut ? "متأسفانه بلیط این نمایش تمام شده" : `${remaining} صندلی باقی‌مانده`}</p>

      ${soldOut ? "" : `
      <form id="ticket-form">
        <div class="field">
          <label>نام و نام خانوادگی</label>
          <input type="text" id="t-name" required />
        </div>
        <div class="field">
          <label>شماره موبایل</label>
          <input type="tel" id="t-phone" required placeholder="09xxxxxxxxx" />
        </div>
        <div class="field">
          <label>ایمیل (اختیاری)</label>
          <input type="email" id="t-email" />
        </div>
        <div class="field">
          <label>تعداد بلیط</label>
          <input type="number" id="t-quantity" min="1" max="${remaining}" value="1" required />
        </div>
        <div class="field">
          <label>مبلغ قابل پرداخت</label>
          <input type="text" id="t-total" value="${formatPrice(show.price)}" disabled />
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;">ثبت رزرو بلیط</button>
        <div class="form-msg" id="ticket-msg"></div>
      </form>
      `}
    </div>
  `;

  if (soldOut) return;

  const qtyInput = document.getElementById("t-quantity");
  const totalInput = document.getElementById("t-total");
  qtyInput.addEventListener("input", () => {
    const qty = Math.max(1, Number(qtyInput.value) || 1);
    totalInput.value = formatPrice(show.price * qty);
  });

  document.getElementById("ticket-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector("button[type=submit]");
    const msgEl = document.getElementById("ticket-msg");
    msgEl.classList.remove("show", "error", "success");

    const name = document.getElementById("t-name").value.trim();
    const phone = document.getElementById("t-phone").value.trim();
    const email = document.getElementById("t-email").value.trim();
    const quantity = Number(qtyInput.value);

    submitBtn.disabled = true;
    submitBtn.textContent = "در حال ثبت…";

    const { data, error } = await supabaseClient.rpc("book_tickets", {
      p_show_id: show.id,
      p_buyer_name: name,
      p_buyer_email: email || null,
      p_buyer_phone: phone,
      p_quantity: quantity,
    });

    if (error) {
      msgEl.textContent = "خطا: " + (error.message || "مشکلی در ثبت رزرو پیش اومد.");
      msgEl.classList.add("show", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "ثبت رزرو بلیط";
      return;
    }

    const booking = data[0];
    document.getElementById("ticket-form-card").innerHTML = `
      <h2>رزرو با موفقیت ثبت شد ✅</h2>
      <p class="sub">کد پیگیری بلیط شما:</p>
      <p style="font-size:20px;font-weight:800;color:var(--marquee-gold);letter-spacing:1px;">${booking.booking_id}</p>
      <p class="sub">این کد رو یادداشت کن یا از صفحه اسکرین‌شات بگیر؛ موقع ورود به سالن نشونش بده.</p>
      <a href="shows.html" class="btn btn-outline" style="width:100%;margin-top:10px;">بازگشت به لیست نمایش‌ها</a>
    `;
  });
}
