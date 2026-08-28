import { cn } from "@/lib/utils";

type ProseProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Long-form body copy.
 *
 * Note: no `text-foreground` on the heading variants. `cn()` runs twMerge,
 * which does not know our custom size tokens and would classify `text-h3` as a
 * colour, so a sibling `[&>h2]:text-foreground` silently deletes the size.
 * The wrapper sets the colour for everything instead.
 *
 * Measure is capped at ~68 characters per docs/03-brand.md §6, and body text
 * sits at `foreground` — reading copy is primary content, not a caption.
 */
export function Prose({ children, className }: ProseProps) {
  return (
    <div
      className={cn(
        "max-w-[68ch] text-base text-foreground",
        "[&>*+*]:mt-5",
        "[&>h2]:mt-12 [&>h2]:text-h3",
        "[&>h3]:mt-10 [&>h3]:text-h4",
        "[&>ul]:list-disc [&>ul]:pl-5 [&>ul>li]:mt-2 [&>ul>li]:pl-1",
        "[&>ol]:list-decimal [&>ol]:pl-5 [&>ol>li]:mt-2 [&>ol>li]:pl-1",
        "[&_code]:rounded-sm [&_code]:bg-sunken [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}
