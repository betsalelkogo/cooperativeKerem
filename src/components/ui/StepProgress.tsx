import { cn } from "@/lib/cn";

interface Step {
  key: string;
  label: string;
}

export function StepProgress({
  steps,
  currentIndex,
}: {
  steps: Step[];
  currentIndex: number;
}) {
  return (
    <ol className="mb-8 flex items-center gap-0">
      {steps.map((step, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <li key={step.key} className="flex flex-1 items-center">
            <div className="flex flex-1 flex-col items-center gap-2">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-all duration-300",
                  isDone && "bg-kerem-700 text-white shadow-md shadow-kerem-700/30",
                  isCurrent && "bg-kerem-700 text-white ring-4 ring-kerem-200",
                  !isDone && !isCurrent && "bg-warm-100 text-stone-400"
                )}
              >
                {isDone ? "✓" : i + 1}
              </div>
              <span
                className={cn(
                  "text-center text-xs font-medium",
                  (isDone || isCurrent) ? "text-kerem-800" : "text-stone-400"
                )}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "mb-5 h-0.5 flex-1 transition-colors duration-300",
                  i < currentIndex ? "bg-kerem-500" : "bg-warm-200"
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
