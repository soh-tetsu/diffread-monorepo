import { createHash } from "crypto";
import { supabase } from "@/lib/supabase";
import type { ArticleRow } from "@/types/db";

const ARTICLE_BUCKET = process.env.SUPABASE_ARTICLE_BUCKET ?? "articles";
const PDF_BUCKET = process.env.SUPABASE_PDF_BUCKET ?? "articles-pdf";
const MAX_PDF_SIZE_BYTES = Number(
  process.env.MAX_PDF_SIZE_BYTES ?? 25 * 1024 * 1024
);

type StorageFileDescriptor = {
  path: string;
  size_bytes: number;
  content_type: string;
  bucket?: string;
};

type StorageMetadata = {
  bucket: string;
  size_bytes: number;
  url_fingerprint?: string;
  media_type: string;
  files?: Record<string, StorageFileDescriptor>;
  [key: string]: unknown;
};

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sanitizeHost(url: string): string {
  try {
    const host = new URL(url).hostname;
    return host.replace(/[^a-z0-9-]/gi, "-") || "root";
  } catch {
    return "unknown-host";
  }
}

export async function uploadArticleBundle(
  articleId: number,
  normalizedUrl: string,
  payload: { html: string; text: string }
): Promise<{
  path: string;
  metadata: StorageMetadata;
  contentHash: string;
}> {
  const basePath = `article/${articleId}`;
  const htmlPath = `${basePath}/content.html`;
  const textPath = `${basePath}/content.txt`;
  const htmlBuffer = Buffer.from(payload.html, "utf-8");
  const textBuffer = Buffer.from(payload.text, "utf-8");
  const urlFingerprint = fingerprint(normalizedUrl);
  const contentHash = fingerprint(payload.text);

  const htmlUpload = await supabase.storage
    .from(ARTICLE_BUCKET)
    .upload(htmlPath, htmlBuffer, {
      contentType: "text/html",
      upsert: true,
    });

  if (htmlUpload.error) {
    throw new Error(`Failed to upload article HTML: ${htmlUpload.error.message}`);
  }

  const textUpload = await supabase.storage
    .from(ARTICLE_BUCKET)
    .upload(textPath, textBuffer, {
      contentType: "text/plain",
      upsert: true,
    });

  if (textUpload.error) {
    throw new Error(`Failed to upload article text: ${textUpload.error.message}`);
  }

  return {
    path: basePath,
    metadata: {
      bucket: ARTICLE_BUCKET,
      size_bytes: htmlBuffer.byteLength + textBuffer.byteLength,
      url_fingerprint: urlFingerprint,
      media_type: "text/html+plain",
      files: {
        html: {
          path: htmlPath,
          size_bytes: htmlBuffer.byteLength,
          content_type: "text/html",
        },
        text: {
          path: textPath,
          size_bytes: textBuffer.byteLength,
          content_type: "text/plain",
        },
      },
    },
    contentHash,
  };
}

export async function downloadArticleContent(
  storagePath: string,
  storageMetadata?: Record<string, unknown> | null
): Promise<string | null> {
  if (!storagePath) {
    return null;
  }

  const metadata = storageMetadata as StorageMetadata | undefined;
  const bucket = metadata?.bucket ?? ARTICLE_BUCKET;
  const files = metadata?.files as Record<string, StorageFileDescriptor> | undefined;

  const normalizedBase = storagePath.endsWith("/")
    ? storagePath.slice(0, -1)
    : storagePath;

  const resolvePath = (): { path: string; bucket: string } => {
    if (files?.text?.path) {
      return {
        path: files.text.path,
        bucket: files.text.bucket ?? bucket,
      };
    }
    if (normalizedBase.endsWith(".md") || normalizedBase.endsWith(".txt")) {
      return { path: normalizedBase, bucket };
    }
    return { path: `${normalizedBase}/content.txt`, bucket };
  };

  const { path: objectPath, bucket: targetBucket } = resolvePath();

  const { data, error } = await supabase.storage
    .from(targetBucket)
    .download(objectPath);

  if (error || !data) {
    throw new Error(
      `Failed to download article content from ${targetBucket}/${objectPath}: ${error?.message}`
    );
  }

  if (typeof data.text === "function") {
    return await data.text();
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("utf-8");
}

export async function uploadArticlePdf(
  buffer: ArrayBuffer,
  normalizedUrl: string
): Promise<{
  path: string;
  metadata: StorageMetadata;
  contentHash: string;
}> {
  const nodeBuffer = Buffer.from(buffer);
  if (nodeBuffer.byteLength > MAX_PDF_SIZE_BYTES) {
    throw new Error(
      `PDF exceeds limit (${nodeBuffer.byteLength} bytes > ${MAX_PDF_SIZE_BYTES})`
    );
  }

  const fingerprintValue = fingerprint(normalizedUrl);
  const host = sanitizeHost(normalizedUrl);
  const objectPath = `pdf/by-url/${host}/${fingerprintValue}.pdf`;

  const { error } = await supabase.storage
    .from(PDF_BUCKET)
    .upload(objectPath, nodeBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload PDF: ${error.message}`);
  }

  return {
    path: objectPath,
    metadata: {
      bucket: PDF_BUCKET,
      size_bytes: nodeBuffer.byteLength,
      url_fingerprint: fingerprintValue,
      media_type: "application/pdf",
    },
    contentHash: fingerprintValue,
  };
}

export function hasStoredContent(article: ArticleRow): boolean {
  return Boolean(article.storage_path);
}
