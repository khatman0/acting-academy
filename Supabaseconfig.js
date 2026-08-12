/**
 * supabase-config.js
 * ---------------------------------------------------
 * اتصال مرکزی به پروژه Supabase آموزشگاه بازیگری.
 * این فایل باید قبل از هر فایل جاوااسکریپت دیگه‌ای
 * توی صفحات HTML لود بشه.
 *
 * نحوه استفاده در HTML:
 * <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 * <script src="js/supabase-config.js"></script>
 * <script src="js/auth.js"></script>
 * ---------------------------------------------------
 */

// ⚠️ این دو مقدار رو با اطلاعات پروژه "acting-academy" خودت جایگزین کن
// از مسیر: Project Settings > API
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL"; // مثال: https://xxxxxxxxxxxx.supabase.co
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

// ساخت یک نمونه واحد (singleton) از کلاینت Supabase
// که توی کل سایت از همین یک نمونه استفاده می‌کنیم
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// نام باکت Storage که برای عکس‌ها ساختیم
const STORAGE_BUCKET = "academy-images";

/**
 * تابع کمکی برای ساخت URL عمومی یک فایل از Storage
 * @param {string} path - مسیر فایل داخل باکت (مثلاً "gallery/photo1.jpg")
 * @returns {string} لینک عمومی قابل استفاده در تگ <img>
 */
function getPublicImageUrl(path) {
  if (!path) return "";
  const { data } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data?.publicUrl || "";
}
