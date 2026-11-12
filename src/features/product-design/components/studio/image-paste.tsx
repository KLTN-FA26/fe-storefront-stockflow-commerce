"use client";

import { useRef } from "react";

import { placeImage } from "./image-actions";
import { useEditorState, useStudio } from "./studio-context";
import { useStudioPanel } from "./studio-panel-context";
import { describeUploadError, UPLOAD_MESSAGES, useAssetUpload } from "./use-asset-upload";
import { usePasteImage } from "./use-paste-image";

/**
 * A paste on the stage while the image tool is on and its options are not open (the tool picked
 * by its key, or the panel closed for room): the file is stored and placed as the panel's dropzone
 * places it. While the options are open, the panel hears the paste itself and shows its progress
 * and errors; here there is nothing to show them in, so they are said in the studio's live region (errors assertively).
 * Mounted on a draft only; renders nothing.
 */
export function ImagePaste() {
  const services = useStudio();
  const { stageRef, announce, editor } = services;
  const tool = useEditorState((s) => s.tool);
  const { active } = useStudioPanel();
  const { upload } = useAssetUpload();
  const running = useRef(false);

  const addFile = (file: File) => {
    if (running.current) return; // one image at a time, as the dropzone takes them
    running.current = true;
    announce(UPLOAD_MESSAGES.uploading);
    upload(file)
      .then((asset) => {
        const placed = placeImage(services, asset);
        // Not placed on a design that turned read-only meanwhile: that is not a full face.
        if (!placed && !editor.store.getState().readOnly) {
          announce(UPLOAD_MESSAGES.noRoom, { urgent: true });
        }
      })
      .catch((failure: unknown) => announce(describeUploadError(failure), { urgent: true }))
      .finally(() => {
        running.current = false;
      });
  };
  usePasteImage(stageRef, tool === "image" && active !== "tool" ? addFile : null);
  return null;
}
