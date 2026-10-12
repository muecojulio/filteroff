import { useEffect, type MutableRefObject, type RefObject } from "react";

/**
 * Posiciona la píldora indicadora de un TabBar calculando `width` y `x` en
 * función del botón activo. Vive en su propio archivo para que HMR pueda
 * recargar el componente sin invalidar el cálculo.
 */
export function useTabIndicator(
  scrollerRef: RefObject<HTMLElement>,
  tabsRef: MutableRefObject<Array<HTMLElement | null>>,
  activeIndex: number,
) {
  useEffect(() => {
    const sync = () => {
      const scroller = scrollerRef.current;
      const tab = tabsRef.current[activeIndex];
      if (!scroller || !tab) return;
      const rect = tab.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      const x = rect.left - scrollerRect.left + scroller.scrollLeft;
      scroller.style.setProperty("--tab-indicator-w", `${rect.width}px`);
      scroller.style.setProperty("--tab-indicator-x", `${x}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    if (scrollerRef.current) ro.observe(scrollerRef.current);
    const tab = tabsRef.current[activeIndex];
    if (tab) ro.observe(tab);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [activeIndex, scrollerRef, tabsRef]);
}
