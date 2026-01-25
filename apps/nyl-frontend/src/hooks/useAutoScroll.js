import { useEffect, useRef } from "react";

const AUTO_SCROLL_THRESHOLD = 60;

export default function useAutoScroll(deps = []) {
  const scrollRef = useRef(null);
  const shouldStickRef = useRef(true);

  const updateStickiness = () => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    shouldStickRef.current = distanceFromBottom <= AUTO_SCROLL_THRESHOLD;
  };

  useEffect(() => {
    if (shouldStickRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, deps);

  return {
    scrollRef,
    onScroll: updateStickiness
  };
}
