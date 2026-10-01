"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
// Keep an explicit source entry before replacing the route. This preserves the
// selected workspace/query even when this Next version replaces a navigation.
export default function PracticeRouteLink(props: ComponentProps<typeof Link>) {
  const router = useRouter();
  return <Link {...props} onNavigate={(event) => {
    let prevented = false;
    props.onNavigate?.({preventDefault: () => {prevented = true;}});
    if (prevented) return;
    event.preventDefault();
    const href = typeof props.href === "string" ? props.href : null;
    if (!href) return;
    window.history.pushState(window.history.state, "", window.location.href);
    router.replace(href);
  }} />;
}
