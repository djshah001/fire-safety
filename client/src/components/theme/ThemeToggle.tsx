import { useAtom } from "jotai";
import { motion } from "framer-motion";
import { Laptop, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { themeAtom, type ThemePreference } from "@/store/theme";

const choices: Array<{
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
];

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useAtom(themeAtom);

  return (
    <TooltipProvider delayDuration={150}>
      <div
        role="radiogroup"
        aria-label="Color theme selection"
        className={cn(
          "relative inline-flex h-8 items-center rounded-lg border border-border/70 bg-muted/40 p-0.5 shadow-2xs backdrop-blur-xs select-none",
          className,
        )}
      >
        {choices.map(({ value, label, icon: Icon }) => {
          const isActive = theme === value;

          return (
            <Tooltip key={value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  aria-label={`${label} theme`}
                  onClick={() => setTheme(value)}
                  className={cn(
                    "relative z-10 flex h-7 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40",
                    isActive
                      ? "text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
                  )}
                >
                  {/* Sliding Active Background Pill */}
                  {isActive && (
                    <motion.span
                      layoutId="theme-segmented-pill"
                      className="absolute inset-0 rounded-md bg-background border border-border/60 shadow-xs dark:bg-card"
                      transition={{
                        type: "spring",
                        stiffness: 450,
                        damping: 32,
                      }}
                    />
                  )}

                  {/* Icon with Subtle Activation Motion */}
                  <motion.div
                    className="relative z-10 flex items-center justify-center"
                    animate={
                      isActive
                        ? {
                            scale: [1, 1.15, 1],
                            rotate:
                              value === "light"
                                ? 15
                                : value === "dark"
                                  ? -15
                                  : 0,
                          }
                        : { scale: 1, rotate: 0 }
                    }
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  >
                    <Icon
                      className={cn(
                        "size-3.5 shrink-0 transition-colors",
                        isActive ? "text-primary" : "text-muted-foreground",
                      )}
                      aria-hidden="true"
                    />
                  </motion.div>

                  <span className="relative z-10 hidden xl:inline text-[11px] capitalize leading-none">
                    {label}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="text-xs">
                Switch to {label} theme
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
