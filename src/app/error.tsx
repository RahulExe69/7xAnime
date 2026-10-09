"use client"; // Error components must be Client Components

import Image from "next/image";
import { useEffect } from "react";
import ErrorImage from "@/assets/error.gif";
import { ROUTES } from "@/constants/routes";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/common/button-link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="w-[100dvw] h-[100dvh]">
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col space-y-5 items-center justify-center">
        <Image
          src={ErrorImage.src}
          alt="error"
          width={300}
          height={300}
          className=""
        />
        <p className="font-bold text-2xl">Something went wrong!</p>
        <p className="max-w-[min(88vw,28rem)] text-center text-sm text-zinc-400">
          The page hit an unexpected error. Reload once; if it repeats, share the technical details below so we can pinpoint the failing component.
        </p>
        <details className="max-w-[min(88vw,28rem)] rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-300">Technical details</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-400">{String(error?.message || "No error message was provided").slice(0, 1200)}{error?.digest ? `\nError ID: ${error.digest}` : ""}</pre>
        </details>
        <div className="flex gap-3 items-center">
          <ButtonLink href={ROUTES.HOME}>Back to Home</ButtonLink>
          <Button onClick={() => reset()} className="" variant={"secondary"}>
            Reload
          </Button>
        </div>
      </div>
    </div>
  );
}

