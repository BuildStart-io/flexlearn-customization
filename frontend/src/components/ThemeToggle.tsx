import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Moon, Sun, Laptop } from "lucide-react";

interface ThemeToggleProps {
  variant?: "dropdown" | "button" | "sidebar";
  className?: string;
}

export default function ThemeToggle({ variant = "dropdown", className = "" }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  if (variant === "button") {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={`h-9 w-9 relative rounded-lg ${className}`}
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-amber-500" />
        <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-purple-400" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  if (variant === "sidebar") {
    return (
      <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium bg-muted/40 border border-border/50 ${className}`}>
        <div className="flex items-center gap-2 text-muted-foreground">
          {theme === "dark" ? (
            <Moon className="h-4 w-4 text-purple-400" />
          ) : theme === "light" ? (
            <Sun className="h-4 w-4 text-amber-500" />
          ) : (
            <Laptop className="h-4 w-4 text-primary" />
          )}
          <span className="text-xs text-foreground font-medium capitalize">
            {theme === "dark" ? "Dark Mode" : theme === "light" ? "Light Mode" : "System"}
          </span>
        </div>
        <div className="flex items-center bg-background rounded-md p-0.5 border border-border">
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={`p-1 rounded text-xs transition-colors ${
              theme === "light"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Light mode"
          >
            <Sun className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={`p-1 rounded text-xs transition-colors ${
              theme === "dark"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Dark mode"
          >
            <Moon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setTheme("system")}
            className={`p-1 rounded text-xs transition-colors ${
              theme === "system"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="System theme"
          >
            <Laptop className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className={`h-9 w-9 relative rounded-lg border-border ${className}`}>
          <Sun className="h-[1.1rem] w-[1.1rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-amber-500" />
          <Moon className="absolute h-[1.1rem] w-[1.1rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-purple-400" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")} className="flex items-center gap-2">
          <Sun className="h-4 w-4 text-amber-500" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} className="flex items-center gap-2">
          <Moon className="h-4 w-4 text-purple-400" />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")} className="flex items-center gap-2">
          <Laptop className="h-4 w-4 text-primary" />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
