"use client";

import { useState } from "react";
import Image from "next/image";
import { cloudinaryThumbnailUrl, isDisplayableImageUrl } from "@/lib/cloudinary-image";
import { ToolMark } from "@/components/brand/Marks";

interface ToolImageGalleryProps {
  imageUrl?: string;
  imageUrls?: string[];
  alt: string;
  category?: string;
}

export function ToolImageGallery({ imageUrl, imageUrls, alt, category }: ToolImageGalleryProps) {
  const slides = [...(imageUrls?.length ? imageUrls : []), ...(imageUrl ? [imageUrl] : [])].filter(
    (url, i, arr) => url && arr.indexOf(url) === i
  );
  const displayable = slides.filter(isDisplayableImageUrl);

  const [index, setIndex] = useState(0);

  if (displayable.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-[#f7f3ea]">
        <ToolMark category={category} className="h-32 w-52" />
      </div>
    );
  }

  const current = displayable[index] ?? displayable[0];

  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-warm-100">
        <Image
          src={cloudinaryThumbnailUrl(current, 800)}
          alt={alt}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 640px"
          unoptimized
        />
      </div>
      {displayable.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {displayable.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setIndex(i)}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg ring-2 ${
                i === index ? "ring-kerem-600" : "ring-transparent"
              }`}
            >
              <Image
                src={cloudinaryThumbnailUrl(url, 128)}
                alt=""
                fill
                className="object-cover"
                sizes="64px"
                unoptimized
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
