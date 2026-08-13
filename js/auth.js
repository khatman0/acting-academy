/**
 * auth.js
 * ---------------------------------------------------
 * مدیریت احراز هویت (ورود / ثبت‌نام / خروج / چک ادمین)
 * برای آموزشگاه بازیگری با Supabase Auth
 *
 * پیش‌نیاز: این فایل باید بعد از supabase-config.js لود بشه
 * <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 * <script src="js/supabase-config.js"></script>
 * <script src="js/auth.js"></script>
 * ---------------------------------------------------
 *
 * ⚠️ نکته مهم درباره نقش ادمین:
 * این فایل فرض می‌کنه که یه جدول به اسم "profiles" توی دیتابیستت داری
 * با ستون‌های: id (uuid, همون auth.users.id) و role (text, مقدار 'admin' یا 'user')
 * اگه اسم جدول یا ستون‌هات فرق داره، بخش checkIsAdmin() رو تغییر بده.
 *
 * ساختار پیشنهادی جدول profiles (اگه هنوز نساختی):
 * create table profiles (
 *   id uuid references auth.users(id) primary key,
 *   full_name text,
 *   role text default 'user', -- 'user' یا 'admin'
 *   created_at timestamp default now()
 * );
 */

// ==================== ثبت‌نام ====================
/**
 * ثبت‌نام کاربر جدید با ایمیل و پسورد
 * @param {string} email
 * @param {string} password
 * @param {string} fullName - نام کامل کاربر (اختیاری، برای ذخیره توی profiles)
 * @returns {Promise<{success: boolean, message: string, user: object|null}>}
 */
async function signUp(email, password, fullName = "") {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (error) {
    return { success: false, message: translateAuthError(error), user: null };
  }

  // ساخت رکورد پروفایل (اگه جدول profiles داری)
  if (data.user) {
    await supabaseClient.from("profiles").insert({
      id: data.user.id,
      full_name: fullName,
      role: "user",
    });
  }

  return {
    success: true,
    message: "ثبت‌نام با موفقیت انجام شد. لطفاً ایمیلت رو برای تأیید حساب چک کن.",
    user: data.user,
  };
}

// ==================== ورود ====================
/**
 * ورود کاربر با ایمیل و پسورد
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, message: string, user: object|null}>}
 */
async function signIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { success: false, message: translateAuthError(error), user: null };
  }

  return { success: true, message: "ورود موفقیت‌آمیز بود.", user: data.user };
}

// ==================== خروج ====================
/**
 * خروج کاربر از حساب
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function signOut() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    return { success: false, message: "خطا در خروج از حساب." };
  }
  return { success: true, message: "با موفقیت خارج شدی." };
}

// ==================== گرفتن کاربر فعلی ====================
/**
 * گرفتن اطلاعات کاربر لاگین‌شده فعلی (اگه لاگین نکرده باشه، null برمی‌گردونه)
 * @returns {Promise<object|null>}
 */
async function getCurrentUser() {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  return user;
}

// ==================== چک ادمین بودن ====================
/**
 * چک می‌کنه کاربر فعلی ادمین هست یا نه
 * (بر اساس ستون role توی جدول profiles)
 * @returns {Promise<boolean>}
 */
async function checkIsAdmin() {
  const user = await getCurrentUser();
  if (!user) return false;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (error || !data) return false;
  return data.role === "admin";
}

// ==================== محافظت از صفحات ====================
/**
 * اگه کاربر لاگین نکرده باشه، به صفحه‌ی لاگین ریدایرکت می‌کنه
 * برای استفاده در صفحاتی که فقط کاربر لاگین‌شده باید ببینه
 * @param {string} redirectTo - مسیر صفحه لاگین (پیش‌فرض: index.html)
 */
async function requireLogin(redirectTo = "index.html") {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = redirectTo;
  }
  return user;
}

/**
 * اگه کاربر ادمین نباشه، به صفحه‌ی اصلی ریدایرکت می‌کنه
 * برای استفاده در ابتدای admin.html / admin.js
 * @param {string} redirectTo - مسیر ریدایرکت در صورت عدم دسترسی
 */
async function requireAdmin(redirectTo = "index.html") {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    alert("شما به این بخش دسترسی ندارید.");
    window.location.href = redirectTo;
  }
  return isAdmin;
}

// ==================== ترجمه خطاهای Supabase به فارسی ====================
/**
 * پیام‌های خطای Supabase رو به فارسی قابل فهم برای کاربر تبدیل می‌کنه
 * @param {object} error
 * @returns {string}
 */
function translateAuthError(error) {
  const msg = error.message || "";

  if (msg.includes("Invalid login credentials")) {
    return "ایمیل یا رمز عبور اشتباهه.";
  }
  if (msg.includes("User already registered")) {
    return "این ایمیل قبلاً ثبت‌نام کرده.";
  }
  if (msg.includes("Password should be at least")) {
    return "رمز عبور باید حداقل ۶ کاراکتر باشه.";
  }
  if (msg.includes("Email not confirmed")) {
    return "ایمیلت هنوز تأیید نشده. لطفاً صندوق ورودیت رو چک کن.";
  }
  if (msg.includes("Unable to validate email address")) {
    return "فرمت ایمیل درست نیست.";
  }
  if (msg.includes("Token has expired or is invalid")) {
    return "کد وارد شده اشتباه یا منقضی شده. دوباره تلاش کن یا کد جدید بگیر.";
  }
  if (msg.includes("For security purposes")) {
    return "برای امنیت، چند ثانیه صبر کن و دوباره تلاش کن.";
  }

  return "خطایی رخ داد. لطفاً دوباره تلاش کن.";
}

// ==================== گوش دادن به تغییر وضعیت لاگین ====================
/**
 * هر جا این فایل لود بشه، به‌صورت خودکار تغییرات وضعیت لاگین
 * (ورود / خروج / تمدید توکن) رو گوش می‌ده.
 * می‌تونی این تابع رو توی هر صفحه‌ای که نیاز داری صدا بزنی
 * تا مثلاً دکمه‌ی "ورود" رو به "خروج" تبدیل کنی.
 *
 * نحوه استفاده در main.js:
 * onAuthChange((user) => {
 *   if (user) { ... نمایش دکمه خروج ... }
 *   else { ... نمایش دکمه ورود ... }
 * });
 */
function onAuthChange(callback) {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    callback(session?.user || null);
  });
}

// ==================== تایید کد ارسال‌شده به ایمیل ====================
/**
 * کد ۶رقمی که به ایمیل کاربر ارسال شده رو تایید می‌کنه
 * (برای تایید ایمیل بعد از ثبت‌نام)
 * @param {string} email
 * @param {string} token - کد ۶رقمی
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function verifySignupOtp(email, token) {
  const { data, error } = await supabaseClient.auth.verifyOtp({
    email,
    token,
    type: "signup",
  });

  if (error) {
    return { success: false, message: translateAuthError(error) };
  }

  return { success: true, message: "ایمیل با موفقیت تایید شد." };
}

/**
 * یه کد جدید برای تایید ایمیل به همون ایمیل می‌فرسته
 * (کد قبلی دیگه معتبر نیست، این جایگزینش می‌شه)
 * @param {string} email
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function resendSignupOtp(email) {
  const { error } = await supabaseClient.auth.resend({
    type: "signup",
    email,
  });

  if (error) {
    return { success: false, message: translateAuthError(error) };
  }

  return { success: true, message: "کد جدید به ایمیلت ارسال شد." };
}

// ==================== ویرایش پروفایل ====================
/**
 * آپدیت نام کامل کاربر توی جدول profiles
 * @param {string} fullName
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function updateProfile(fullName) {
  const user = await getCurrentUser();
  if (!user) return { success: false, message: "ابتدا وارد حساب خود شوید." };

  const { error } = await supabaseClient
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (error) {
    return { success: false, message: "خطا در ذخیره اطلاعات." };
  }

  // آپدیت user_metadata هم برای هماهنگی (اختیاری ولی مفید)
  await supabaseClient.auth.updateUser({ data: { full_name: fullName } });

  return { success: true, message: "اطلاعات با موفقیت ذخیره شد." };
}

/**
 * گرفتن اطلاعات پروفایل کاربر فعلی از جدول profiles
 * @returns {Promise<object|null>}
 */
async function getMyProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) return null;
  return data;
}

// ==================== تغییر رمز عبور ====================
/**
 * تغییر رمز عبور کاربر لاگین‌شده
 * @param {string} newPassword
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function changePassword(newPassword) {
  const { error } = await supabaseClient.auth.updateUser({ password: newPassword });

  if (error) {
    return { success: false, message: translateAuthError(error) };
  }

  return { success: true, message: "رمز عبور با موفقیت تغییر کرد." };
}

// ==================== مدیریت خودکار دکمه‌های منو ====================
/**
 * این تابع به‌صورت خودکار (پایین همین فایل) روی هر صفحه‌ای که
 * auth.js رو لود کرده باشه اجرا می‌شه و بر اساس وضعیت لاگین:
 * - دکمه "ورود" (id="nav-login-btn") رو نشون/مخفی می‌کنه
 * - دکمه "خروج" (id="nav-logout-btn") رو نشون/مخفی می‌کنه و بهش رویداد کلیک می‌ده
 * - دکمه "پنل ادمین" (id="nav-admin-btn") رو فقط برای ادمین‌ها نشون می‌ده
 *
 * پیش‌نیاز: توی HTML این دکمه‌ها باید همین idها رو داشته باشن
 * و برای مخفی بودن پیش‌فرض، کلاس "hidden" روشون باشه (توی style.css تعریف شده)
 */
function initNavAuthUI() {
  const loginBtn = document.getElementById("nav-login-btn");
  const adminBtn = document.getElementById("nav-admin-btn");
  const logoutBtn = document.getElementById("nav-logout-btn");
  const profileBtn = document.getElementById("nav-profile-btn");

  async function updateUI(user) {
    const isAdmin = user ? await checkIsAdmin() : false;

    if (loginBtn) loginBtn.classList.toggle("hidden", !!user);
    if (logoutBtn) logoutBtn.classList.toggle("hidden", !user);
    if (adminBtn) adminBtn.classList.toggle("hidden", !isAdmin);
    if (profileBtn) profileBtn.classList.toggle("hidden", !user);
  }

  // وضعیت اولیه هنگام لود صفحه
  getCurrentUser().then(updateUI);

  // گوش دادن به تغییرات لحظه‌ای (بعد از ورود یا خروج)
  onAuthChange(updateUI);

  // اتصال دکمه خروج
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await signOut();
      window.location.href = "index.html";
    });
  }
}

// اجرای خودکار به محض لود شدن HTML صفحه
document.addEventListener("DOMContentLoaded", initNavAuthUI);
