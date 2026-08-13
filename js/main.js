/**
 * main.js
 * ---------------------------------------------------
 * رفتارهای مشترک همه صفحات: منوی موبایل و توابع کمکی عمومی
 * ---------------------------------------------------
 */

document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("nav-toggle");
  const links = document.getElementById("nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => links.classList.toggle("open"));
    links.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => links.classList.remove("open"))
    );
  }
});

/**
 * فرمت کردن تاریخ میلادی به شکل خوانا (می‌تونی بعداً به شمسی تبدیلش کنی)
 */
function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * کوتاه کردن متن برای پیش‌نمایش (excerpt)
 */
function truncateText(text, maxLength = 140) {
  if (!text) return "";
  const plain = text.replace(/<[^>]*>/g, "");
  return plain.length > maxLength ? plain.slice(0, maxLength).trim() + "…" : plain;
}

/**
 * ساخت اسلاگ ساده از روی عنوان فارسی (برای پست‌های وبلاگ)
 */
function slugify(title) {
  const base = title
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u0600-\u06FF-]/g, "");
  return `${base}-${Date.now().toString(36)}`;
}
