"use client";

// ============================================================
// Le Rasa — admin image dropzone
// ------------------------------------------------------------
// Upload / replace / remove one image, with drag & drop, a live preview and
// proper loading and error states. Purely a UI shell around the EXISTING
// uploader: the bytes still go through adminUpload() to
// /api/admin/site-assets/upload, which is admin-cookie-gated, sniffs the
// content and writes to the shared site-assets bucket. No second upload path,
// no storage credentials on the client.
//
// Validation runs twice on purpose. Here it is for speed and a friendly
// message — a 12 MB file should not be uploaded before being rejected. The
// server repeats every check (and is the only one that counts), and the same
// limits are forwarded to it so it enforces THIS field's stricter policy
// rather than the endpoint's more permissive default.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { adminUpload } from "@/lib/admin-api";

const WINE = "#873853";
const BERRY = "#5C2A41";

const DEFAULT_ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/** ".jpg, .png" style list for the message and the file picker. */
function extList(types: string[]): string {
  return types.map((t) => t.replace("image/", "").toUpperCase()).join(", ");
}

function mb(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

/**
 * Decode the file in the browser. Catches a truncated or corrupted image before
 * it is ever uploaded, and yields the dimensions so the aspect-ratio hint can
 * be accurate. Resolves null when the bytes will not decode.
 */
function probeImage(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(
        img.naturalWidth > 0 && img.naturalHeight > 0
          ? { width: img.naturalWidth, height: img.naturalHeight }
          : null,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export type ImageDropzoneProps = {
  /** Current image URL ("" when unset). */
  value: string;
  /** Called with the new URL, or "" when the image is removed. */
  onChange: (url: string) => void;
  /** Accepted MIME types. Forwarded to the server, which clamps them. */
  accept?: string[];
  /** Size cap in bytes. Forwarded to the server, which clamps it. */
  maxBytes?: number;
  /** Folder inside the shared site-assets bucket to store under, e.g. "about".
   *  Omit to store at the bucket root, which is where every caller that
   *  predates this option still writes. A module that owns a folder can clean
   *  up inside it safely — see the route's header. */
  prefix?: string;
  /** What this image IS, for the preview's alt text and the ratio note, e.g.
   *  "About page photo". Defaults to the popup background this was built for. */
  label?: string;
  /** Called with each uploaded URL, so the parent can clean up an image that
   *  was uploaded and then replaced or abandoned before Save. */
  onUploaded?: (url: string) => void;
  /** e.g. "1600×900" — shown in the hint and used for the ratio warning. */
  recommendedWidth?: number;
  recommendedHeight?: number;
  /** CSS aspect-ratio for the preview frame, so the box never jumps. */
  previewAspect?: string;
  /** Lets the parent form disable Save while an upload is in flight. */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
};

export function ImageDropzone({
  value,
  onChange,
  accept = DEFAULT_ACCEPT,
  maxBytes = DEFAULT_MAX_BYTES,
  prefix,
  label = "Popup background",
  onUploaded,
  recommendedWidth = 1600,
  recommendedHeight = 900,
  previewAspect = "16 / 9",
  onBusyChange,
  disabled = false,
}: ImageDropzoneProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against a slow upload resolving after the field was unmounted.
  // It MUST be re-armed on mount, not just cleared on unmount: React re-mounts
  // components (StrictMode does it on every mount in dev), and a ref that only
  // ever flips to false leaves every later upload silently discarded — the
  // spinner then runs forever.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const setBusyBoth = useCallback(
    (next: boolean) => {
      setBusy(next);
      onBusyChange?.(next);
    },
    [onBusyChange],
  );

  const upload = useCallback(
    async (file: File) => {
      setError("");
      setNotice("");

      if (!accept.includes((file.type || "").toLowerCase())) {
        setError(`That file is not supported. Use ${extList(accept)}.`);
        return;
      }
      if (file.size > maxBytes) {
        setError(`That image is ${mb(file.size)}. The limit is ${mb(maxBytes)}.`);
        return;
      }

      setBusyBoth(true);
      try {
        const size = await probeImage(file);
        if (!size) {
          setError("That image could not be read — it may be corrupted. Try another file.");
          return;
        }

        const { url } = await adminUpload(file, "/api/admin/site-assets/upload", {
          maxBytes: String(maxBytes),
          accept: accept.join(","),
          ...(prefix ? { prefix } : {}),
        });
        // The file EXISTS in the bucket from here on, whether or not this
        // component is still mounted — so the parent is told before the
        // liveness check, or an unmount mid-upload would strand the object with
        // nothing tracking it.
        onUploaded?.(url);
        if (!alive.current) return;
        onChange(url);

        // A ratio that is off is a design note, not a failure — still uploaded.
        const target = recommendedWidth / recommendedHeight;
        const actual = size.width / size.height;
        if (Math.abs(actual - target) / target > 0.12) {
          setNotice(
            `Uploaded. This image is ${size.width}×${size.height}; ${recommendedWidth}×${recommendedHeight} fits best, so the edges may be cropped.`,
          );
        }
      } catch (err) {
        if (alive.current) setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        if (alive.current) setBusyBoth(false);
      }
    },
    [accept, maxBytes, prefix, onChange, onUploaded, recommendedWidth, recommendedHeight, setBusyBoth],
  );

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so picking the SAME file again still fires a change event.
    e.target.value = "";
    if (file) void upload(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (disabled || busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  function handleRemove() {
    setError("");
    setNotice("");
    onChange("");
  }

  const locked = disabled || busy;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!locked) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragging ? WINE : "rgba(135,56,83,0.3)"}`,
          background: dragging ? "rgba(135,56,83,0.06)" : "rgba(135,56,83,0.02)",
          borderRadius: 14,
          padding: value ? 12 : "26px 18px",
          textAlign: "center",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        {value ? (
          <>
            <div
              style={{
                position: "relative",
                width: "100%",
                maxWidth: 360,
                margin: "0 auto 12px",
                aspectRatio: previewAspect,
                borderRadius: 10,
                overflow: "hidden",
                background: "rgba(135,56,83,0.08)",
              }}
            >
              {/* Fixed-ratio frame above, so swapping images never shifts the
                  page. eslint-disable: an admin-supplied URL can point at any
                  host, which next/image would reject. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value}
                alt={`${label} preview`}
                loading="lazy"
                decoding="async"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button type="button" onClick={() => inputRef.current?.click()} disabled={locked} style={btn(locked)}>
                {busy ? "Uploading…" : "Replace image"}
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={locked}
                style={{ ...btn(locked), borderColor: "#d9534f", color: "#d9534f" }}
              >
                Remove image
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: BERRY, fontWeight: 700, margin: "0 0 4px" }}>
              {busy ? "Uploading…" : "Drag an image here"}
            </p>
            <p style={{ color: BERRY, opacity: 0.65, fontSize: "0.85rem", margin: "0 0 12px" }}>
              or
            </p>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={locked} style={btn(locked)}>
              Choose file
            </button>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept.join(",")}
          onChange={handlePick}
          disabled={locked}
          style={{ display: "none" }}
        />
      </div>

      <p style={{ color: BERRY, opacity: 0.6, fontSize: "0.8rem", margin: "8px 0 0" }}>
        {extList(accept)} · up to {mb(maxBytes)} · {recommendedWidth}×{recommendedHeight} recommended (
        {previewAspect.replace(" / ", ":")})
      </p>

      {error && (
        <p role="alert" style={{ color: "#d9534f", fontSize: "0.85rem", margin: "6px 0 0", fontWeight: 600 }}>
          {error}
        </p>
      )}
      {notice && !error && (
        <p style={{ color: "#9a6212", fontSize: "0.85rem", margin: "6px 0 0" }}>{notice}</p>
      )}
    </div>
  );
}

function btn(disabled: boolean): React.CSSProperties {
  return {
    background: "white",
    border: `1px solid ${WINE}`,
    color: WINE,
    borderRadius: 999,
    padding: "8px 18px",
    fontWeight: 700,
    fontSize: "0.85rem",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
}
