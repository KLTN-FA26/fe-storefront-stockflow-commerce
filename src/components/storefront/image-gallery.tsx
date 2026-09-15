"use client";

import Image from "next/image";
import { useState } from "react";

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

  if (!selected) return <div className="aspect-square rounded-xl bg-bg-subtle" />;

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-bg-subtle shadow-md">
        <Image src={selected.src} alt={selected.alt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {images.map((image, index) => (
          <Button key={image.src} type="button" variant="ghost" className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border p-0 ${active === index ? "border-accent" : "border-border-default"}`} onClick={() => setActive(index)}>
            <Image src={image.src} alt={image.alt} fill sizes="64px" className="object-cover" />
          </Button>
        ))}
      </div>
    </div>
  );
}
