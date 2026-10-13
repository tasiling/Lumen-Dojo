"use client";
import { useEffect, useRef } from "react";
export function usePracticeLeaveGuard(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  const barrier = useRef(false);
  const removing = useRef<string | null>(null);
  useEffect(() => {
    dirtyRef.current = dirty;
    if (dirty && !barrier.current) {
      history.pushState(
        { ...history.state, __practiceDraftGuard: true },
        "",
        location.href,
      );
      barrier.current = true;
    } else if (!dirty && barrier.current && !removing.current) {
      removing.current = location.href;
      history.back();
    }
  }, [dirty]);
  useEffect(() => {
    function approve() {
      if (!dirtyRef.current) return true;
      if (!confirm("尚有未儲存的自譯內容。離開會放棄這些修改，確定離開？"))
        return false;
      dirtyRef.current = false;
      return true;
    }
    function beforeUnload(e: BeforeUnloadEvent) {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    function click(e: MouseEvent) {
      const a = (e.target as Element).closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (
        !a ||
        a.target === "_blank" ||
        a.getAttribute("href")?.startsWith("#")
      )
        return;
      if (!approve()) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }
    function leave(e: Event) {
      if (!approve()) e.preventDefault();
    }
    function pop(e: PopStateEvent) {
      if (removing.current) {
        e.stopImmediatePropagation();
        history.replaceState(e.state, "", removing.current);
        removing.current = null;
        barrier.current = false;
        return;
      }
      if (!barrier.current) return;
      e.stopImmediatePropagation();
      barrier.current = false;
      if (!approve()) {
        history.pushState(
          { ...e.state, __practiceDraftGuard: true },
          "",
          location.href,
        );
        barrier.current = true;
      } else history.back();
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    window.addEventListener("practice-before-leave", leave);
    window.addEventListener("popstate", pop, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
      window.removeEventListener("practice-before-leave", leave);
      window.removeEventListener("popstate", pop, true);
    };
  }, []);
}
