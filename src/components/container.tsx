import { cn } from "@/lib/utils";

type ContainerProps = {
  children: React.ReactNode;
  className?: string;
};

export function Container({ children, className }: ContainerProps) {
  return (
    <div className="px-[5%]">
      <div className={cn("mx-auto w-full max-w-[72rem]", className)}>{children}</div>
    </div>
  );
}
