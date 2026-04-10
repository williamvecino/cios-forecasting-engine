import { Link, useLocation } from "wouter";
import { Home, BarChart3, BookOpen, Settings, Sparkles } from "lucide-react";
import { useActiveQuestion } from "@/hooks/use-active-question";

const NAV_ITEMS = [
  { label: "Home", path: "/question", icon: Home },
  { label: "Forecasts", path: "/forecasts", icon: BarChart3 },
  { label: "Library", path: "/library", icon: BookOpen },
  { label: "System", path: "/system", icon: Settings },
];

export default function TopNav() {
  const [location, navigate] = useLocation();
  const { clearQuestion } = useActiveQuestion();

  function isActive(path: string) {
    if (path === "/") return location === "/" || location === "";
    return location.startsWith(path);
  }

  const inWorkflow =
    location.startsWith("/question") ||
    location.startsWith("/signals") ||
    location.startsWith("/forecast") ||
    location.startsWith("/decide");

  function handleNavClick(e: React.MouseEvent, item: typeof NAV_ITEMS[number]) {
    if (item.path === "/question") {
      e.preventDefault();
      clearQuestion();
      try { localStorage.removeItem("cios.lastPath"); } catch {}
      navigate("/question");
    }
  }

  return (
    <nav className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="mx-auto max-w-7xl px-6 flex items-center justify-between h-14">
        <Link href="/" className="flex items-center gap-2" onClick={(e: React.MouseEvent) => { e.preventDefault(); clearQuestion(); try { localStorage.removeItem("cios.lastPath"); } catch {} navigate("/question"); }}>
          <Sparkles className="w-5 h-5 text-primary" />
          <span className="text-sm font-bold tracking-wide text-foreground">CIOS</span>
        </Link>

        <div className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path) || (item.path === "/question" && inWorkflow);
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={(e: React.MouseEvent) => handleNavClick(e, item)}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
