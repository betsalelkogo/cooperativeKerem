import Image from "next/image";
import { cn } from "@/lib/cn";

const sizes = {
  sm: 40,
  md: 64,
  lg: 96,
} as const;

type SiteLogoSize = keyof typeof sizes;

interface SiteLogoProps {
  size?: SiteLogoSize;
  className?: string;
  priority?: boolean;
}

export function SiteLogo({ size = "sm", className, priority }: SiteLogoProps) {
  const px = sizes[size];

  return (
    <Image
      src="/logo.png"
      alt="כרם רעים — קואופרטיב הציוד"
      width={px}
      height={px}
      priority={priority}
      className={cn("shrink-0 rounded-full object-contain", className)}
      style={{ width: px, height: px }}
    />
  );
}
