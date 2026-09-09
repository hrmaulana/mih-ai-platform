import { useEffect } from "react";
import portalCss from "../../portal.css?inline";

/** Inject portal.css saat mount, cleanup proper saat unmount. */
export function usePortalCss() {
  useEffect(() => {
    document.querySelectorAll('style[data-portal]').forEach(e => e.remove());
    const el = document.createElement("style");
    el.setAttribute("data-portal", "");
    el.textContent = portalCss;
    document.head.appendChild(el);
    return () => document.querySelectorAll('style[data-portal]').forEach(e => e.remove());
  }, []);
}
