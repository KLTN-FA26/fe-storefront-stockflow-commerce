"use client";

import Image from "next/image";
import { useState } from "react";

import { isRemoteImage } from "@/lib/remote-image";

import { Button } from "@/components/ui/button";

interface GalleryImage {
  src: string;
  alt: string;
}

interface ImageGalleryProps {
  images: GalleryImage[];
}

export function ImageGallery({ images }: ImageGalleryProps) {
  const [active, setActive] = useState(0);
  const selected = images[active] ?? images[0];

  if (!selected) return <div className="bg-bg-subtle aspect-square rounded-[var(--r-lg)]" />;

  return (
    <div className="space-y-3">
      <div className="border-border-default bg-bg-subtle relative aspect-square overflow-hidden rounded-[var(--r-lg)] border">
        <Image
          src={selected.src}
          alt={selected.alt}
          fill
          unoptimized={isRemoteImage(selected.src)}
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-contain"
        />
      </div>
      <div className="-m-1 flex gap-2 overflow-x-auto p-1">
        {images.map((image, index) => (
          <Button
            key={`${index}-${image.src}`}
            type="button"
            variant="ghost"
            className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border p-0 ${active === index ? "border-accent" : "border-border-default"}`}
            onClick={() => setActive(index)}
          >
            <Image
              src={image.src}
              alt={image.alt}
              fill
              unoptimized={isRemoteImage(image.src)}
              sizes="64px"
              className="object-cover"
            />
          </Button>
        ))}
      </div>
    </div>
  );
}
