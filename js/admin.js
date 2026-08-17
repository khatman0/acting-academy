/**
 * admin.js
 * ---------------------------------------------------
 * منطق کامل پنل مدیریت: اساتید، گالری، وبلاگ، نمایش‌ها، بلیط‌ها
 * پیش‌نیاز: باید بعد از supabase-config.js و auth.js لود بشه
 * ---------------------------------------------------
 *
 * ⚠️ ساختار جدول‌هایی که این فایل باهاشون کار می‌کنه:
 *
 * instructors: id, name, specialty, bio, photo_url, social_links (jsonb), display_order, created_at
 * gallery:     id, image_url, caption, category, display_order, created_at
 * posts:       id, title, slug, content, cover_image_url, status ('draft'|'published'),
 *              author_id (fk -> profiles.id), published_at, created_at, updated_at
 * shows:       id, title, description, cover_image_url, venue, show_date, show_time,
 *              duration_minutes, price, total_capacity, sold_count (خودکار), status ('draft'|'published'|'closed')
 * bookings:    id, show_id, buyer_name, buyer_email, buyer_phone, quantity, total_price,
 *              status ('confirmed'|'cancelled'), created_at
 *              (این جدول فقط از طریق تابع Postgres به اسم book_tickets پر می‌شه؛ اینجا فقط می‌خونیمش)
 *
 * اگه اسم یا نوع یکی از ستون‌ها فرق داره، باید بخش مربوطه رو اصلاح کنی.
 * فایل sql/shows_tickets_schema.sql باید قبلاً توی Supabase اجرا شده باشه.
 */

let CURRENT_TAB_DATA = { instructors: [], gallery: [], posts: [], shows: [] };

// ==================== ورود به پنل + گارد ادمین ====================
(async function initAdminPanel() {
  const isAdmin = await requireAdmin("index.html");
  if (!isAdmin) return; // requireAdmin خودش ریدایرکت می‌کنه

  setupSidebar();
  setupLogout();
  loadDashboardStats();
  loadInstructors();
  loadGallery();
  loadPosts();
  loadShows();
  loadBookings();
})();

// ==================== سوییچ تب‌های منوی کناری ====================
function setupSidebar() {
  const navItems = document.querySelectorAll(".admin-nav-item[data-panel]");
  navItems.forEach(item => {
    item.addEventListener("click", () => {
      navItems.forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      document.querySelectorAll(".admin-panel").forEach(p => p.classList.remove("active"));
      document.getElementById(item.dataset.panel).classList.add("active");
    });
  });
}

function setupLogout() {
  document.getElementById("admin-logout-btn").addEventListener("click", async () => {
    await signOut();
    window.location.href = "index.html";
  });
}

// ==================== داشبورد ====================
async function loadDashboardStats() {
  const [ins, gal, posts] = await Promise.all([
    supabaseClient.from("instructors").select("id", { count: "exact", head: true }),
    supabaseClient.from("gallery").select("id", { count: "exact", head: true }),
    supabaseClient.from("posts").select("id", { count: "exact", head: true }),
  ]);
  document.getElementById("stat-instructors").textContent = ins.count ?? "0";
  document.getElementById("stat-gallery").textContent = gal.count ?? "0";
  document.getElementById("stat-posts").textContent = posts.count ?? "0";
  // آمار stat-shows و stat-tickets-sold داخل loadShows() و loadBookings() آپدیت می‌شن
}

// ==================== ابزار کمکی: آپلود عکس در Storage ====================
/**
 * یه فایل عکس رو توی باکت STORAGE_BUCKET آپلود می‌کنه و لینک عمومیش رو برمی‌گردونه
 * @param {File} file
 * @param {string} folder - زیرپوشه‌ی داخل باکت (مثلاً "instructors", "gallery", "posts", "shows")
 * @returns {Promise<string>} لینک عمومی عکس
 */
async function uploadImageToStorage(file, folder) {
  const ext = file.name.split(".").pop();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabaseClient.storage.from(STORAGE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) throw error;
  return getPublicImageUrl(path);
}

// ==================== ابزار کمکی: مودال عمومی ====================
function openModal(title, bodyHtml, onSubmit) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-overlay" id="active-modal-overlay">
      <div class="modal-box">
        <h3>${title}</h3>
        <form id="active-modal-form">
          ${bodyHtml}
          <div class="modal-actions">
            <button type="submit" class="btn btn-primary" id="modal-submit-btn">ذخیره</button>
            <button type="button" class="btn btn-outline" id="modal-cancel-btn">انصراف</button>
          </div>
          <div class="form-msg" id="modal-msg"></div>
        </form>
      </div>
    </div>
  `;

  const overlay = document.getElementById("active-modal-overlay");
  const form = document.getElementById("active-modal-form");

  document.getElementById("modal-cancel-btn").addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("modal-submit-btn");
    const msgEl = document.getElementById("modal-msg");
    submitBtn.disabled = true;
    submitBtn.textContent = "در حال ذخیره…";
    try {
      await onSubmit(form);
      closeModal();
    } catch (err) {
      console.error(err);
      msgEl.textContent = "خطا: " + (err.message || "مشکلی پیش اومد.");
      msgEl.classList.add("show", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "ذخیره";
    }
  });
}

function closeModal() {
  document.getElementById("modal-root").innerHTML = "";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ==================================================================
// ==================== مدیریت اساتید ====================
// ==================================================================

async function loadInstructors() {
  const tbody = document.getElementById("instructors-table-body");
  const { data, error } = await supabaseClient
    .from("instructors")
    .select("*")
    .order("display_order", { ascending: true });

  if (error || !data || data.length === 0) {
    tbody.innerHTML = `<tr class="admin-empty-row"><td colspan="5">${error ? "خطا در بارگذاری." : "هنوز استادی ثبت نشده."}</td></tr>`;
    return;
  }

  CURRENT_TAB_DATA.instructors = data;

  tbody.innerHTML = data.map(ins => `
    <tr>
      <td><img src="${ins.photo_url || 'assets/placeholder.jpg'}" alt="${escapeHtml(ins.name)}" /></td>
      <td>${escapeHtml(ins.name)}</td>
      <td>${escapeHtml(ins.specialty || "—")}</td>
      <td>${ins.display_order ?? 0}</td>
      <td class="row-actions">
        <button class="btn btn-outline btn-sm" data-edit-instructor="${ins.id}">ویرایش</button>
        <button class="btn btn-danger btn-sm" data-delete-instructor="${ins.id}">حذف</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-edit-instructor]").forEach(btn => {
    btn.addEventListener("click", () => {
      const ins = CURRENT_TAB_DATA.instructors.find(i => i.id === btn.dataset.editInstructor);
      openInstructorForm(ins);
    });
  });
  tbody.querySelectorAll("[data-delete-instructor]").forEach(btn => {
    btn.addEventListener("click", () => deleteInstructor(btn.dataset.deleteInstructor));
  });
}

document.getElementById("add-instructor-btn").addEventListener("click", () => openInstructorForm(null));

function openInstructorForm(instructor) {
  const isEdit = !!instructor;
  const social = instructor?.social_links || {};

  openModal(isEdit ? "ویرایش استاد" : "افزودن استاد جدید", `
    <div class="field"><label>نام کامل</label><input type="text" id="f-name" required value="${isEdit ? escapeHtml(instructor.name) : ""}" /></div>
    <div class="field"><label>تخصص</label><input type="text" id="f-specialty" value="${isEdit ? escapeHtml(instructor.specialty || "") : ""}" /></div>
    <div class="field"><label>بیوگرافی</label><textarea id="f-bio">${isEdit ? escapeHtml(instructor.bio || "") : ""}</textarea></div>
    <div class="field"><label>عکس پروفایل ${isEdit ? "(اختیاری — برای تغییر عکس)" : ""}</label><input type="file" id="f-photo" accept="image/*" ${isEdit ? "" : "required"} /></div>
    <div class="field"><label>لینک اینستاگرام</label><input type="url" id="f-instagram" placeholder="https://instagram.com/..." value="${escapeHtml(social.instagram || "")}" /></div>
    <div class="field"><label>لینک تلگرام</label><input type="url" id="f-telegram" placeholder="https://t.me/..." value="${escapeHtml(social.telegram || "")}" /></div>
    <div class="field"><label>ترتیب نمایش</label><input type="number" id="f-order" value="${isEdit ? (instructor.display_order ?? 0) : 0}" /></div>
  `, async (form) => {
    const name = form.querySelector("#f-name").value.trim();
    const specialty = form.querySelector("#f-specialty").value.trim();
    const bio = form.querySelector("#f-bio").value.trim();
    const instagram = form.querySelector("#f-instagram").value.trim();
    const telegram = form.querySelector("#f-telegram").value.trim();
    const displayOrder = Number(form.querySelector("#f-order").value) || 0;
    const photoFile = form.querySelector("#f-photo").files[0];

    const payload = {
      name,
      specialty,
      bio,
      display_order: displayOrder,
      social_links: { instagram, telegram },
    };

    if (photoFile) {
      payload.photo_url = await uploadImageToStorage(photoFile, "instructors");
    }

    if (isEdit) {
      const { error } = await supabaseClient.from("instructors").update(payload).eq("id", instructor.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from("instructors").insert(payload);
      if (error) throw error;
    }

    loadInstructors();
    loadDashboardStats();
  });
}

async function deleteInstructor(id) {
  if (!confirm("مطمئنی می‌خوای این استاد رو حذف کنی؟")) return;
  const { error } = await supabaseClient.from("instructors").delete().eq("id", id);
  if (error) { alert("خطا در حذف: " + error.message); return; }
  loadInstructors();
  loadDashboardStats();
}

// ==================================================================
// ==================== مدیریت گالری ====================
// ==================================================================

async function loadGallery() {
  const tbody = document.getElementById("gallery-table-body");
  const { data, error } = await supabaseClient
    .from("gallery")
    .select("*")
    .order("display_order", { ascending: true });

  if (error || !data || data.length === 0) {
    tbody.innerHTML = `<tr class="admin-empty-row"><td colspan="5">${error ? "خطا در بارگذاری." : "هنوز عکسی اضافه نشده."}</td></tr>`;
    return;
  }

  CURRENT_TAB_DATA.gallery = data;

  tbody.innerHTML = data.map(img => `
    <tr>
      <td><img src="${img.image_url}" alt="${escapeHtml(img.caption || '')}" /></td>
      <td>${escapeHtml(img.caption || "—")}</td>
      <td>${escapeHtml(img.category || "—")}</td>
      <td>${img.display_order ?? 0}</td>
      <td class="row-actions">
        <button class="btn btn-outline btn-sm" data-edit-gallery="${img.id}">ویرایش</button>
        <button class="btn btn-danger btn-sm" data-delete-gallery="${img.id}">حذف</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-edit-gallery]").forEach(btn => {
    btn.addEventListener("click", () => {
      const img = CURRENT_TAB_DATA.gallery.find(i => i.id === btn.dataset.editGallery);
      openGalleryForm(img);
    });
  });
  tbody.querySelectorAll("[data-delete-gallery]").forEach(btn => {
    btn.addEventListener("click", () => deleteGalleryImage(btn.dataset.deleteGallery));
  });
}

document.getElementById("add-gallery-btn").addEventListener("click", () => openGalleryForm(null));

function openGalleryForm(image) {
  const isEdit = !!image;

  openModal(isEdit ? "ویرایش تصویر" : "افزودن تصویر جدید", `
    <div class="field"><label>فایل عکس ${isEdit ? "(اختیاری — برای جایگزینی)" : ""}</label><input type="file" id="f-image" accept="image/*" ${isEdit ? "" : "required"} /></div>
    <div class="field"><label>کپشن</label><input type="text" id="f-caption" value="${isEdit ? escapeHtml(image.caption || "") : ""}" /></div>
    <div class="field"><label>دسته‌بندی</label><input type="text" id="f-category" placeholder="مثلاً کلاس‌ها، اجراها" value="${isEdit ? escapeHtml(image.category || "") : ""}" /></div>
    <div class="field"><label>ترتیب نمایش</label><input type="number" id="f-order" value="${isEdit ? (image.display_order ?? 0) : 0}" /></div>
  `, async (form) => {
    const caption = form.querySelector("#f-caption").value.trim();
    const category = form.querySelector("#f-category").value.trim();
    const displayOrder = Number(form.querySelector("#f-order").value) || 0;
    const imageFile = form.querySelector("#f-image").files[0];

    const payload = { caption, category, display_order: displayOrder };

    if (imageFile) {
      payload.image_url = await uploadImageToStorage(imageFile, "gallery");
    }

    if (isEdit) {
      const { error } = await supabaseClient.from("gallery").update(payload).eq("id", image.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from("gallery").insert(payload);
      if (error) throw error;
    }

    loadGallery();
    loadDashboardStats();
  });
}

async function deleteGalleryImage(id) {
  if (!confirm("مطمئنی می‌خوای این تصویر رو حذف کنی؟")) return;
  const { error } = await supabaseClient.from("gallery").delete().eq("id", id);
  if (error) { alert("خطا در حذف: " + error.message); return; }
  loadGallery();
  loadDashboardStats();
}

// ==================================================================
// ==================== مدیریت وبلاگ ====================
// ==================================================================

async function loadPosts() {
  const tbody = document.getElementById("posts-table-body");
  const { data, error } = await supabaseClient
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) {
    tbody.innerHTML = `<tr class="admin-empty-row"><td colspan="5">${error ? "خطا در بارگذاری." : "هنوز مطلبی نوشته نشده."}</td></tr>`;
    return;
  }

  CURRENT_TAB_DATA.posts = data;

  tbody.innerHTML = data.map(post => `
    <tr>
      <td><img src="${post.cover_image_url || 'assets/placeholder.jpg'}" alt="${escapeHtml(post.title)}" /></td>
      <td>${escapeHtml(post.title)}</td>
      <td><span class="status-badge ${post.status === 'published' ? 'published' : 'draft'}">${post.status === 'published' ? 'منتشرشده' : 'پیش‌نویس'}</span></td>
      <td>${post.published_at ? new Date(post.published_at).toLocaleDateString('fa-IR') : "—"}</td>
      <td class="row-actions">
        <button class="btn btn-outline btn-sm" data-edit-post="${post.id}">ویرایش</button>
        <button class="btn btn-danger btn-sm" data-delete-post="${post.id}">حذف</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-edit-post]").forEach(btn => {
    btn.addEventListener("click", () => {
      const post = CURRENT_TAB_DATA.posts.find(p => p.id === btn.dataset.editPost);
      openPostForm(post);
    });
  });
  tbody.querySelectorAll("[data-delete-post]").forEach(btn => {
    btn.addEventListener("click", () => deletePost(btn.dataset.deletePost));
  });
}

document.getElementById("add-post-btn").addEventListener("click", () => openPostForm(null));

function slugify(text) {
  return text
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u0600-\u06FF-]/g, "")
    .toLowerCase();
}

function openPostForm(post) {
  const isEdit = !!post;

  openModal(isEdit ? "ویرایش نوشته" : "نوشته جدید", `
    <div class="field"><label>عنوان</label><input type="text" id="f-title" required value="${isEdit ? escapeHtml(post.title) : ""}" /></div>
    <div class="field"><label>نامک (Slug) — در آدرس لینک استفاده می‌شه</label><input type="text" id="f-slug" required value="${isEdit ? escapeHtml(post.slug) : ""}" placeholder="مثلاً: chera-bazigari-mohem-ast" /></div>
    <div class="field"><label>عکس کاور ${isEdit ? "(اختیاری — برای جایگزینی)" : ""}</label><input type="file" id="f-cover" accept="image/*" ${isEdit ? "" : "required"} /></div>
    <div class="field"><label>متن مطلب</label><textarea id="f-content" style="min-height:200px;" required>${isEdit ? escapeHtml(post.content || "") : ""}</textarea></div>
    <div class="field">
      <label>وضعیت انتشار</label>
      <select id="f-status">
        <option value="draft" ${isEdit && post.status === 'draft' ? 'selected' : ''}>پیش‌نویس</option>
        <option value="published" ${isEdit && post.status === 'published' ? 'selected' : ''}>منتشرشده</option>
      </select>
    </div>
  `, async (form) => {
    const title = form.querySelector("#f-title").value.trim();
    const slug = slugify(form.querySelector("#f-slug").value.trim());
    const content = form.querySelector("#f-content").value.trim();
    const status = form.querySelector("#f-status").value;
    const coverFile = form.querySelector("#f-cover").files[0];

    const payload = {
      title,
      slug,
      content,
      status,
      updated_at: new Date().toISOString(),
    };

    // اگه به «منتشرشده» تغییر کرد و قبلاً تاریخ انتشار نداشت، الان رو ثبت کن
    if (status === "published" && !(isEdit && post.published_at)) {
      payload.published_at = new Date().toISOString();
    }

    if (coverFile) {
      payload.cover_image_url = await uploadImageToStorage(coverFile, "posts");
    }

    if (isEdit) {
      const { error } = await supabaseClient.from("posts").update(payload).eq("id", post.id);
      if (error) throw error;
    } else {
      // فقط موقع ساخت پست جدید، نویسنده رو ثبت می‌کنیم
      const currentUser = await getCurrentUser();
      payload.author_id = currentUser?.id || null;

      const { error } = await supabaseClient.from("posts").insert(payload);
      if (error) throw error;
    }

    loadPosts();
    loadDashboardStats();
  });

  // پر کردن خودکار نامک از روی عنوان (فقط موقع ساخت پست جدید)
  if (!isEdit) {
    document.getElementById("f-title").addEventListener("input", (e) => {
      document.getElementById("f-slug").value = slugify(e.target.value);
    });
  }
}

async function deletePost(id) {
  if (!confirm("مطمئنی می‌خوای این نوشته رو حذف کنی؟")) return;
  const { error } = await supabaseClient.from("posts").delete().eq("id", id);
  if (error) { alert("خطا در حذف: " + error.message); return; }
  loadPosts();
  loadDashboardStats();
}

// ==================================================================
// ==================== مدیریت نمایش‌ها ====================
// ==================================================================

function formatShowDateAdmin(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" });
}

function formatPriceAdmin(n) {
  return Number(n || 0).toLocaleString("fa-IR") + " تومان";
}

async function loadShows() {
  const tbody = document.getElementById("shows-table-body");
  const { data, error } = await supabaseClient
    .from("shows")
    .select("*")
    .order("show_date", { ascending: true });

  if (error || !data || data.length === 0) {
    tbody.innerHTML = `<tr class="admin-empty-row"><td colspan="7">${error ? "خطا در بارگذاری." : "هنوز نمایشی ثبت نشده."}</td></tr>`;
    document.getElementById("stat-shows").textContent = "0";
    return;
  }

  CURRENT_TAB_DATA.shows = data;

  const statusLabel = { draft: "پیش‌نویس", published: "منتشرشده", closed: "بسته‌شده" };
  const statusClass = { draft: "draft", published: "published", closed: "draft" };

  tbody.innerHTML = data.map(show => `
    <tr>
      <td><img src="${show.cover_image_url || 'assets/placeholder.jpg'}" alt="${escapeHtml(show.title)}" /></td>
      <td>${escapeHtml(show.title)}</td>
      <td>${formatShowDateAdmin(show.show_date)} — ${(show.show_time || "").slice(0,5)}</td>
      <td>${show.sold_count ?? 0} / ${show.total_capacity ?? 0}</td>
      <td>${formatPriceAdmin(show.price)}</td>
      <td><span class="status-badge ${statusClass[show.status] || 'draft'}">${statusLabel[show.status] || show.status}</span></td>
      <td class="row-actions">
        <button class="btn btn-outline btn-sm" data-edit-show="${show.id}">ویرایش</button>
        <button class="btn btn-danger btn-sm" data-delete-show="${show.id}">حذف</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-edit-show]").forEach(btn => {
    btn.addEventListener("click", () => {
      const show = CURRENT_TAB_DATA.shows.find(s => s.id === btn.dataset.editShow);
      openShowForm(show);
    });
  });
  tbody.querySelectorAll("[data-delete-show]").forEach(btn => {
    btn.addEventListener("click", () => deleteShow(btn.dataset.deleteShow));
  });

  // آمار داشبورد: تعداد نمایش‌های منتشرشده
  const activeCount = data.filter(s => s.status === "published").length;
  document.getElementById("stat-shows").textContent = activeCount;
}

document.getElementById("add-show-btn").addEventListener("click", () => openShowForm(null));

function openShowForm(show) {
  const isEdit = !!show;

  openModal(isEdit ? "ویرایش نمایش" : "افزودن نمایش جدید", `
    <div class="field"><label>عنوان نمایش</label><input type="text" id="f-title" required value="${isEdit ? escapeHtml(show.title) : ""}" /></div>
    <div class="field"><label>توضیحات</label><textarea id="f-description">${isEdit ? escapeHtml(show.description || "") : ""}</textarea></div>
    <div class="field"><label>عکس کاور ${isEdit ? "(اختیاری — برای جایگزینی)" : ""}</label><input type="file" id="f-cover" accept="image/*" ${isEdit ? "" : "required"} /></div>
    <div class="field"><label>سالن / مکان اجرا</label><input type="text" id="f-venue" value="${isEdit ? escapeHtml(show.venue || "") : ""}" /></div>
    <div class="field"><label>تاریخ اجرا</label><input type="date" id="f-date" required value="${isEdit ? show.show_date : ""}" /></div>
    <div class="field"><label>ساعت اجرا</label><input type="time" id="f-time" required value="${isEdit ? (show.show_time || "").slice(0,5) : ""}" /></div>
    <div class="field"><label>مدت زمان (دقیقه)</label><input type="number" id="f-duration" value="${isEdit ? (show.duration_minutes ?? 90) : 90}" /></div>
    <div class="field"><label>قیمت هر بلیط (تومان)</label><input type="number" id="f-price" required min="0" value="${isEdit ? show.price : 0}" /></div>
    <div class="field"><label>ظرفیت کل صندلی</label><input type="number" id="f-capacity" required min="1" value="${isEdit ? show.total_capacity : 50}" /></div>
    <div class="field">
      <label>وضعیت</label>
      <select id="f-status">
        <option value="draft" ${isEdit && show.status === 'draft' ? 'selected' : ''}>پیش‌نویس</option>
        <option value="published" ${isEdit && show.status === 'published' ? 'selected' : ''}>منتشرشده (قابل فروش)</option>
        <option value="closed" ${isEdit && show.status === 'closed' ? 'selected' : ''}>بسته‌شده</option>
      </select>
    </div>
  `, async (form) => {
    const title = form.querySelector("#f-title").value.trim();
    const description = form.querySelector("#f-description").value.trim();
    const venue = form.querySelector("#f-venue").value.trim();
    const showDate = form.querySelector("#f-date").value;
    const showTime = form.querySelector("#f-time").value;
    const duration = Number(form.querySelector("#f-duration").value) || 90;
    const price = Number(form.querySelector("#f-price").value) || 0;
    const capacity = Number(form.querySelector("#f-capacity").value) || 1;
    const status = form.querySelector("#f-status").value;
    const coverFile = form.querySelector("#f-cover").files[0];

    // جلوگیری از کاهش ظرفیت به کمتر از تعداد بلیط‌های از قبل فروخته‌شده
    if (isEdit && capacity < (show.sold_count ?? 0)) {
      throw new Error(`ظرفیت نمی‌تونه کمتر از تعداد بلیط‌های فروخته‌شده (${show.sold_count}) باشه`);
    }

    const payload = {
      title, description, venue,
      show_date: showDate,
      show_time: showTime,
      duration_minutes: duration,
      price, total_capacity: capacity,
      status,
    };

    if (coverFile) {
      payload.cover_image_url = await uploadImageToStorage(coverFile, "shows");
    }

    if (isEdit) {
      const { error } = await supabaseClient.from("shows").update(payload).eq("id", show.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from("shows").insert(payload);
      if (error) throw error;
    }

    loadShows();
  });
}

async function deleteShow(id) {
  if (!confirm("مطمئنی می‌خوای این نمایش رو حذف کنی؟ بلیط‌های فروخته‌شده‌ی مرتبط باهاش هم حذف می‌شن.")) return;
  const { error } = await supabaseClient.from("shows").delete().eq("id", id);
  if (error) { alert("خطا در حذف: " + error.message); return; }
  loadShows();
  loadBookings();
}

// ==================================================================
// ==================== بلیط‌های فروخته‌شده ====================
// ==================================================================

async function loadBookings() {
  const tbody = document.getElementById("bookings-table-body");
  const { data, error } = await supabaseClient
    .from("bookings")
    .select("*, shows(title)")
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) {
    tbody.innerHTML = `<tr class="admin-empty-row"><td colspan="7">${error ? "خطا در بارگذاری." : "هنوز بلیطی فروخته نشده."}</td></tr>`;
    document.getElementById("stat-tickets-sold").textContent = "0";
    return;
  }

  const confirmedOnly = data.filter(b => b.status === "confirmed");
  const totalTickets = confirmedOnly.reduce((sum, b) => sum + (b.quantity || 0), 0);
  document.getElementById("stat-tickets-sold").textContent = totalTickets;

  tbody.innerHTML = data.map(b => `
    <tr>
      <td>${escapeHtml(b.shows?.title || "—")}</td>
      <td>${escapeHtml(b.buyer_name)}</td>
      <td>${escapeHtml(b.buyer_phone || "—")}${b.buyer_email ? " / " + escapeHtml(b.buyer_email) : ""}</td>
      <td>${b.quantity}</td>
      <td>${formatPriceAdmin(b.total_price)}</td>
      <td style="font-family:monospace;font-size:12px;">${b.id.slice(0, 8)}</td>
      <td>${new Date(b.created_at).toLocaleDateString('fa-IR')}</td>
    </tr>
  `).join("");
}
