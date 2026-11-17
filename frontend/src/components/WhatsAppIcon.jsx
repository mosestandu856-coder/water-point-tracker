// frontend/src/components/WhatsAppIcon.jsx
// Official WhatsApp brand icon as an inline SVG.
// Use size prop to control dimensions. Brand colour is #25D366.

import React from "react";

export function WhatsAppIcon({ size = 16, style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
    >
      {/* White background circle */}
      <circle cx="16" cy="16" r="16" fill="#25D366" />
      {/* WhatsApp handset path — official brand shape */}
      <path
        d="M23.5 20.3c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6 0-.3-.2-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.7-1-2.3-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1 2.9 1.2 3.1c.2.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.2 1.8.1.5-.1 1.6-.7 1.9-1.3.3-.6.3-1.1.2-1.3-.1-.1-.3-.2-.5-.3z"
        fill="white"
      />
      <path
        d="M16 4.5C9.6 4.5 4.5 9.6 4.5 16c0 2 .5 4 1.5 5.7L4.5 27.5l5.9-1.5c1.7.9 3.5 1.4 5.6 1.4 6.4 0 11.5-5.1 11.5-11.5S22.4 4.5 16 4.5zm0 21c-1.9 0-3.7-.5-5.3-1.5l-.4-.2-3.5.9.9-3.4-.2-.4C6.5 19.3 6 17.7 6 16 6 10.5 10.5 6 16 6s10 4.5 10 10-4.5 9.5-10 9.5z"
        fill="white"
      />
    </svg>
  );
}

export default WhatsAppIcon;
