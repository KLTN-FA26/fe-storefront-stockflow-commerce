"use client";

import type { ComponentType } from "react";

import type {
  DesignElement,
  DrawingElement,
  ImageElement,
  PrintAreaCode,
  TextElement,
} from "../../engine";

/** What a type-specific section of the Properties panel is given. */
export type PropertySectionProps<T extends DesignElement> = {
  element: T;
  code: PrintAreaCode;
  readOnly: boolean;
};

/**
 * The Properties panel's extension point: the section each element type adds under the common
 * fields (the image, text and brush tools fill these in).
 */
export type PropertySections = {
  image?: ComponentType<PropertySectionProps<ImageElement>>;
  text?: ComponentType<PropertySectionProps<TextElement>>;
  drawing?: ComponentType<PropertySectionProps<DrawingElement>>;
};

/** The section `sections` holds for the element's type, if any. */
export function TypeSection({
  sections,
  ...props
}: PropertySectionProps<DesignElement> & { sections: PropertySections }) {
  const { element } = props;
  switch (element.type) {
    case "image": {
      const Section = sections.image;
      return Section ? <Section {...props} element={element} /> : null;
    }
    case "text": {
      const Section = sections.text;
      return Section ? <Section {...props} element={element} /> : null;
    }
    case "drawing": {
      const Section = sections.drawing;
      return Section ? <Section {...props} element={element} /> : null;
    }
  }
}
