"use client";

import { useEffect, useRef, useState } from "react";
import Navbar from "./Navbar";

const MOBILE_QUERY = "(max-width: 639px)";
const HIDE_AFTER_PX = 96;
const SCROLL_DELTA_PX = 8;

export default function AppHeader() {
    const [hidden, setHidden] = useState(false);
    const [headerHeight, setHeaderHeight] = useState(0);
    const frame = useRef<number | null>(null);
    const headerRef = useRef<HTMLElement | null>(null);
    const lastScrollY = useRef(0);
    const lastTouchY = useRef<number | null>(null);

    useEffect(() => {
        const mediaQuery = window.matchMedia(MOBILE_QUERY);

        const getScrollY = () =>
            Math.max(
                window.scrollY,
                document.scrollingElement?.scrollTop ?? 0,
                document.documentElement.scrollTop,
                document.body.scrollTop,
            );

        const readScroll = () => {
            frame.current = null;
            const currentY = getScrollY();

            if (!mediaQuery.matches) {
                setHidden(false);
                lastScrollY.current = currentY;
                return;
            }

            const delta = currentY - lastScrollY.current;

            if (currentY <= HIDE_AFTER_PX) {
                setHidden(false);
                lastScrollY.current = currentY;
                return;
            }

            if (Math.abs(delta) < SCROLL_DELTA_PX) {
                return;
            }

            if (delta > 0) {
                setHidden(true);
            } else {
                setHidden(false);
            }

            lastScrollY.current = currentY;
        };

        const scheduleScrollRead = () => {
            if (frame.current !== null) {
                return;
            }

            frame.current = window.requestAnimationFrame(readScroll);
        };

        const handleDirectionInput = (directionDelta: number) => {
            if (!mediaQuery.matches || Math.abs(directionDelta) < SCROLL_DELTA_PX) {
                return;
            }

            const currentY = getScrollY();

            if (directionDelta > 0 && currentY > HIDE_AFTER_PX) {
                setHidden(true);
                lastScrollY.current = currentY;
            } else if (directionDelta < 0) {
                setHidden(false);
                lastScrollY.current = currentY;
            }
        };

        const shouldIgnoreDirectionInput = (target: EventTarget | null) =>
            target instanceof Element && Boolean(target.closest("[data-header-scroll-ignore='true']"));

        const handleWheel = (event: WheelEvent) => {
            if (!shouldIgnoreDirectionInput(event.target)) {
                handleDirectionInput(event.deltaY);
            }

            scheduleScrollRead();
        };

        const handleTouchStart = (event: TouchEvent) => {
            if (shouldIgnoreDirectionInput(event.target)) {
                lastTouchY.current = null;
                return;
            }

            lastTouchY.current = event.touches[0]?.clientY ?? null;
        };

        const handleTouchMove = (event: TouchEvent) => {
            if (shouldIgnoreDirectionInput(event.target)) {
                scheduleScrollRead();
                return;
            }

            const currentTouchY = event.touches[0]?.clientY ?? null;

            if (currentTouchY !== null && lastTouchY.current !== null) {
                const touchDelta = lastTouchY.current - currentTouchY;
                handleDirectionInput(touchDelta);

                if (Math.abs(touchDelta) >= SCROLL_DELTA_PX) {
                    lastTouchY.current = currentTouchY;
                }
            } else {
                lastTouchY.current = currentTouchY;
            }

            scheduleScrollRead();
        };

        const handleMediaChange = () => {
            setHidden(false);
            lastScrollY.current = getScrollY();
            scheduleScrollRead();
        };

        lastScrollY.current = getScrollY();
        scheduleScrollRead();

        window.addEventListener("scroll", scheduleScrollRead, { passive: true });
        window.addEventListener("wheel", handleWheel, { passive: true });
        window.addEventListener("touchstart", handleTouchStart, { passive: true });
        window.addEventListener("touchmove", handleTouchMove, { passive: true });
        window.addEventListener("resize", handleMediaChange);
        mediaQuery.addEventListener("change", handleMediaChange);

        return () => {
            if (frame.current !== null) {
                window.cancelAnimationFrame(frame.current);
            }

            window.removeEventListener("scroll", scheduleScrollRead);
            window.removeEventListener("wheel", handleWheel);
            window.removeEventListener("touchstart", handleTouchStart);
            window.removeEventListener("touchmove", handleTouchMove);
            window.removeEventListener("resize", handleMediaChange);
            mediaQuery.removeEventListener("change", handleMediaChange);
        };
    }, []);

    useEffect(() => {
        const mediaQuery = window.matchMedia(MOBILE_QUERY);

        const syncHeaderHeight = () => {
            setHeaderHeight(mediaQuery.matches ? (headerRef.current?.offsetHeight ?? 0) : 0);
        };

        syncHeaderHeight();

        const resizeObserver = new ResizeObserver(syncHeaderHeight);

        if (headerRef.current) {
            resizeObserver.observe(headerRef.current);
        }

        window.addEventListener("resize", syncHeaderHeight);
        mediaQuery.addEventListener("change", syncHeaderHeight);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener("resize", syncHeaderHeight);
            mediaQuery.removeEventListener("change", syncHeaderHeight);
        };
    }, []);

    return (
        <>
            <header
                ref={headerRef}
                className={`fixed inset-x-0 top-0 z-30 w-full min-w-0 border-b border-gray-200/80 bg-white/85 p-3 backdrop-blur-xl transition-transform duration-200 ease-out dark:border-white/10 dark:bg-[#0b1220]/85 sm:sticky sm:translate-y-0 ${
                    hidden ? "-translate-y-full" : "translate-y-0"
                }`}
            >
                <Navbar />
            </header>
            <div className="shrink-0 sm:hidden" style={{ height: headerHeight }} aria-hidden="true" />
        </>
    );
}
