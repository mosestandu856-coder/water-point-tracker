// frontend/src/utils/phoneUtils.js
// Phone number helpers shared across the application.

/**
 * Converts any Uganda phone format to a clean E.164 international string
 * suitable for tel: links and wa.me URLs.
 *
 * Accepts: "0700 000 100", "0700000100", "+256700000100", "256700000100"
 * Returns: "256700000100"  (no + prefix — wa.me requires digits only)
 */
export function toUgandaIntl(raw = "") {
  let digits = String(raw).replace(/[\s\-+()]/g, "");
  if (digits.startsWith("256") && digits.length >= 12) return digits;
  if (digits.startsWith("0")   && digits.length >= 9)  return "256" + digits.slice(1);
  if (digits.length >= 9)                               return "256" + digits;
  return digits;
}

/**
 * Returns a tel: URI for a direct phone call.
 * Example: tel:+256700000100
 */
export function callLink(phone) {
  const intl = toUgandaIntl(phone);
  return `tel:+${intl}`;
}

/**
 * Returns a wa.me URL that opens a WhatsApp chat with a pre-written message.
 * The user can choose to send it as text, voice note, or start a WhatsApp call
 * from inside WhatsApp itself.
 */
export function whatsappLink(phone, message = "") {
  const intl = toUgandaIntl(phone);
  const encoded = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${intl}${encoded}`;
}

/**
 * Formats a Uganda number for display: "0700 000 100"
 */
export function formatPhoneDisplay(raw = "") {
  const digits = String(raw).replace(/[\s\-+()]/g, "");
  let local = digits;
  if (local.startsWith("256")) local = "0" + local.slice(3);
  if (local.length === 10) {
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  }
  return raw; // return original if we can't parse it
}
