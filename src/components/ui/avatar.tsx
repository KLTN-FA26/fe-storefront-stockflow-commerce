import Image from "next/image";

import { cn } from "@/lib/cn";

function Avatar({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("relative flex size-8 shrink-0 overflow-hidden rounded-full", className)} {...props} />;
}

interface AvatarImageProps extends Omit<React.ComponentProps<typeof Image>, "src" | "alt"> {
  src: string;
  alt?: string;
}

function AvatarImage({ className, alt = "", ...props }: AvatarImageProps) {
  return <Image className={cn("aspect-square size-full object-cover", className)} alt={alt} {...props} />;
}

function AvatarFallback({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("flex size-full items-center justify-center rounded-full bg-bg-muted text-sm font-semibold", className)} {...props} />;
}

export { Avatar, AvatarImage, AvatarFallback };
