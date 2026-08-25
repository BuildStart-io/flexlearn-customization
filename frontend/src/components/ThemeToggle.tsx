import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  variant?: "button" | "sidebar";
  className?: string;
}

export default function ThemeToggle({ variant = "sidebar", className = "" }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={cn(
          "relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-card/60 backdrop-blur-xs text-foreground hover:bg-muted/80 hover:text-foreground transition-all duration-200 active:scale-95 shadow-2xs",
          className
        )}
        title={isDark ? "Switch to Light mode" : "Switch to Dark mode"}
      >
        <Sun className={cn(
          "h-4 w-4 transition-all duration-300",
          isDark ? "scale-0 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100 text-amber-500"
        )} />
        <Moon className={cn(
          "absolute h-4 w-4 transition-all duration-300",
          isDark ? "scale-100 rotate-0 opacity-100 text-primary" : "scale-0 -rotate-90 opacity-0"
        )} />
        <span className="sr-only">Toggle theme</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "group flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
        "text-muted-foreground hover:bg-muted/70 hover:text-foreground active:scale-[0.99]",
        className
      )}
      title={isDark ? "Switch to Light mode" : "Switch to Dark mode"}
    >
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center h-5 w-5">
          <Sun className={cn(
            "h-4 w-4 transition-all duration-300",
            isDark ? "scale-0 rotate-90 opacity-0 text-amber-500" : "scale-100 rotate-0 opacity-100 text-amber-500"
          )} />
          <Moon className={cn(
            "absolute h-4 w-4 transition-all duration-300",
            isDark ? "scale-100 rotate-0 opacity-100 text-primary" : "scale-0 -rotate-90 opacity-0"
          )} />
        </div>
        <span className="font-medium text-xs sm:text-sm">
          {isDark ? "Dark Theme" : "Light Theme"}
        </span>
      </div>

      {/* Sleek minimal iOS/shadcn switch track */}
      <div 
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent p-0.5 transition-colors duration-200 ease-in-out",
          isDark ? "bg-primary" : "bg-muted-foreground/25 group-hover:bg-muted-foreground/35"
        )}
      >
        <span
          className={cn(
            "pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-xs transition-transform duration-200 ease-in-out",
            isDark ? "translate-x-4" : "translate-x-0"
          )}
        />
      </div>
    </button>
  );
}
