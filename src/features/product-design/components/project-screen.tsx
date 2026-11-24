"use client";

import { STORE_ROUTES } from "@/constants";
import { PageShell } from "@/components/storefront/layout";
import { useSignedIn } from "@/lib/auth/use-signed-in";

import type { FontRegistry } from "../engine";
import { isDesignGone } from "../errors";
import { useProject, useProjectDesigns } from "../queries";
import { DesignSectionSwitch } from "./design-section-switch";
import { LauncherSignIn } from "./launcher-states";
import { type DesignableCatalogue } from "./new-design-dialog";
import { ProjectBody } from "./project-body";
import { ProjectNotFound, ProjectReadError, ProjectSkeleton } from "./project-screen-states";

type ProjectScreenProps = {
  projectId: string;
  /** The catalogue's printable products, for "Tạo bản mới trong dự án" and the clone dialog. */
  catalogue: DesignableCatalogue;
  /** The text fonts of the 3D view: the page hands them over, loaded only when "Xem 3D" is used. */
  loadFonts: () => Promise<FontRegistry>;
};


/**
 * `/design/projects/[id]` (spec 2026-11-12 §5): signed-in customers only, like the other design
 * screens (ruling R18).
 */
export function ProjectScreen(props: ProjectScreenProps) {
  const signedIn = useSignedIn();
  if (signedIn) return <SignedInProject {...props} />;
  return (
    <PageShell>
      <DesignSectionSwitch current="projects" />
      {signedIn === undefined ? (
        <ProjectSkeleton />
      ) : (
        <LauncherSignIn from={STORE_ROUTES.design.project(props.projectId)} />
      )}
    </PageShell>
  );
}

function SignedInProject({ projectId, catalogue, loadFonts }: ProjectScreenProps) {
  const project = useProject(projectId);
  const designs = useProjectDesigns(projectId);
  const body = (() => {
    // A project that is gone (reset, deleted elsewhere) is not kept on screen from the cache.
    if (project.isError && isDesignGone(project.error)) return <ProjectNotFound />;
    if (project.data) {
      return (
        <ProjectBody
          project={project.data}
          designs={designs}
          catalogue={catalogue}
          loadFonts={loadFonts}
        />
      );
    }
    if (project.isError) {
      return (
        <ProjectReadError
          error={project.error}
          onRetry={() => void project.refetch()}
          retrying={project.isFetching}
        />
      );
    }
    return <ProjectSkeleton />;
  })();
  return (
    <PageShell>
      <DesignSectionSwitch current="projects" />
      {body}
    </PageShell>
  );
}
