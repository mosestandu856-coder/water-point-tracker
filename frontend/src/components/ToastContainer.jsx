// frontend/src/components/ToastContainer.jsx
// Floating toast notification display container with accessible ARIA live regions.

import React from "react";
import { useToast } from "../context/ToastContext";

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (!toasts.length) return null;

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <div className="toast-message">{toast.message}</div>
          <button
            onClick={() => removeToast(toast.id)}
            className="toast-close"
            aria-label="Close notification"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}

export default ToastContainer;

