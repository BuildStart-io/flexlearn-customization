import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

interface ThemeToggleProps {
  variant?: "button" | "sidebar";
  className?: string;
}

export default function ThemeToggle({ variant = "sidebar", className = "" }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  if (variant === "button") {
    return (
      <button
        type="button"
        className={`inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border bg-background text-foreground hover:bg-muted transition-colors ${className}`}
        onClick={() => setTheme(isDark ? "light" : "dark")}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? (
          <Sun className="h-4 w-4 text-amber-500 transition-all" />
        ) : (
          <Moon className="h-4 w-4 text-purple-600 transition-all" />
        )}
        <span className="sr-only">Toggle theme</span>
      </button>
    );
  }

  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium bg-muted/40 border border-border/50 ${className}`}>
      <div className="flex items-center gap-2 text-foreground">
        {isDark ? (
          <Moon className="h-4 w-4 text-purple-400" />
        ) : (
          <Sun className="h-4 w-4 text-amber-500" />
        )}
        <span className="text-xs font-medium">
          {isDark ? "Dark Mode" : "Light Mode"}
        </span>
      </div>
      <div className="flex items-center bg-background rounded-md p-0.5 border border-border">
        <button
          type="button"
          onClick={() => setTheme("light")}
          className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
            !isDark
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title="Light Mode"
        >
          <Sun className="h-3.5 w-3.5" />
          <span>Light</span>
        </button>
        <button
          type="button"
          onClick={() => setTheme("dark")}
          className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
            isDark
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title="Dark Mode"
        >
          <Moon className="h-3.5 w-3.5" />
          <span>Dark</span>
        </button>
      </div>
    </div>
  );
}
