import type { Express } from "express";
import express from "express";
import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import { ENV } from "./env";

function getStorageDir(): string {
  const dir = ENV.storageDir || path.join(process.cwd(), "uploads");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function normalizeKey(relKey: string): string {
  // Sanitize to prevent path traversal
  const clean = relKey.replace(/[^a-zA-Z0-9._\-\/]/g, "_");
  return clean.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const fullPath = path.join(getStorageDir(), key);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const buf = typeof data === "string" ? Buffer.from(data) : Buffer.from(data as Buffer);
  fs.writeFileSync(fullPath, buf);
  return { key, url: `/uploads/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/uploads/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  return `/uploads/${key}`;
}

export function registerStorageProxy(app: Express) {
  // Serve uploaded files directly
  app.use("/uploads", express.static(getStorageDir()));

  // Also keep a proxy route for backwards compatibility with old URLs
  app.get("/manus-storage/*", (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) return res.status(400).send("Missing storage key");
    const fullPath = path.join(getStorageDir(), key);
    if (!fs.existsSync(fullPath)) return res.status(404).send("Not found");
    res.redirect(307, `/uploads/${key}`);
  });
}
