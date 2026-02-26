import { useEffect, useState } from "react";
import { ChevronsUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ScrollTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 280);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <Button
      type="button"
      size="icon"
      className="fixed bottom-4 left-4 z-50 h-10 w-10 rounded-full shadow-lg sm:bottom-5 sm:left-5"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Scroll to top"
      title="Scroll to top"
    >
      <ChevronsUp className="h-5 w-5" />
    </Button>
  );
}
