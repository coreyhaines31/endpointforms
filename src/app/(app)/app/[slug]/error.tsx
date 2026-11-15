"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

import { Container } from "@/components/container";

/**
 * When a workspace page fails to load. Says what happened in plain words,
 * offers the one useful action (try again), and keeps the sidebar, so the
 * rest of the app is still a click away. Server errors arrive with only a
 * digest, never the message, so the digest is what is shown for support.
 */
export default function WorkspaceError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="pt-10">
      <div role="alert" className="animate-rise max-w-[60ch]">
        <p className="font-mono text-label uppercase text-destructive">Couldn’t load</p>
        <h1 className="mt-4 text-h2">This page didn’t load.</h1>
        <p className="mt-3 text-base text-muted-foreground">
          Something went wrong on our side while reading it. Your data is unchanged. Trying
          again usually works; if it keeps happening, the reference below helps us find it.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => retry()}
            className="press inline-flex h-11 items-center gap-2 rounded-md border border-border-control px-4 text-sm font-medium text-foreground hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Try again
          </button>
          {digest ? (
            <p className="font-mono text-sm text-muted-foreground">Reference {digest}</p>
          ) : null}
        </div>
      </div>
    </Container>
  );
}
