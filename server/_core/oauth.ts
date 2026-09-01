import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { users } from "../../drizzle/schema";
import { getSessionCookieOptions } from "./cookies";
import { createSessionToken, hashPassword, verifyPassword } from "./sdk";
import { ENV } from "./env";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Simple password-based auth.  In production you'd add rate limiting,
 * CSRF protection, etc.
 */
export function registerAuthRoutes(app: Express) {
  // --- Login (email + password) ---
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      if (!email || !password) {
        return res.status(400).json({ error: "email and password required" });
      }

      const dbConn = await db.getDb();
      if (!dbConn) return res.status(500).json({ error: "database unavailable" });

      const [userRow] = await dbConn
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (!userRow) return res.status(401).json({ error: "invalid credentials" });
      if (!userRow.passwordHash) return res.status(401).json({ error: "no password set" });

      const ok = await verifyPassword(password, userRow.passwordHash);
      if (!ok) return res.status(401).json({ error: "invalid credentials" });

      const sessionToken = await createSessionToken(userRow.openId, userRow.name ?? "", ONE_YEAR_MS);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ success: true, name: userRow.name });
    } catch (e) {
      console.error("[Login] error", e);
      res.status(500).json({ error: "internal error" });
    }
  });

  // --- Register ---
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body as {
        email: string;
        password: string;
        name?: string;
      };
      if (!email || !password) {
        return res.status(400).json({ error: "email and password required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "password must be at least 6 characters" });
      }

      const dbConn = await db.getDb();
      if (!dbConn) return res.status(500).json({ error: "database unavailable" });

      const [existing] = await dbConn
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
      if (existing) return res.status(409).json({ error: "email already registered" });

      const openId = randomUUID();
      const passwordHash = await hashPassword(password);
      const now = new Date();

      await dbConn.insert(users).values({
        openId,
        email: email.toLowerCase(),
        name: name ?? null,
        passwordHash,
        loginMethod: "email",
        role: ENV.ownerEmail === email.toLowerCase() ? "admin" : "user",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      });

      const sessionToken = await createSessionToken(openId, name ?? "", ONE_YEAR_MS);
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ success: true, name: name ?? null });
    } catch (e) {
      console.error("[Register] error", e);
      res.status(500).json({ error: "internal error" });
    }
  });

  // --- Create login form page (served as HTML) ---
  app.get("/api/auth/login-page", (_req: Request, res: Response) => {
    const html = `<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><title>锚点登录</title>
<style>
  body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f5f5f5;}
  .card{background:#fff;padding:2rem;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1);width:320px;}
  h1{margin:0 0 1rem;text-align:center;color:#333;}
  input{width:100%;padding:.5rem;margin:.25rem 0;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;}
  button{width:100%;padding:.5rem;background:#4f46e5;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:1rem;margin-top:.5rem;}
  button:hover{background:#4338ca;}
  .err{color:#dc2626;font-size:.85rem;margin-top:.5rem;text-align:center;}
  .toggle{text-align:center;margin-top:1rem;font-size:.9rem;}
  .toggle a{color:#4f46e5;cursor:pointer;}
</style></head>
<body>
<div class="card">
  <h1 id="title">登录</h1>
  <form id="form">
    <input id="email" type="email" placeholder="邮箱" required autocomplete="email">
    <input id="password" type="password" placeholder="密码" required autocomplete="current-password">
    <input id="name" type="text" placeholder="名字（注册时填写）" style="display:none">
    <button type="submit" id="btn">登录</button>
  </form>
  <div class="err" id="err"></div>
  <div class="toggle"><a id="toggleBtn">没有账号？注册</a></div>
</div>
<script>
  let mode = "login";
  const title=document.getElementById('title'),
        nameInput=document.getElementById('name'),
        btn=document.getElementById('btn'),
        toggleBtn=document.getElementById('toggleBtn'),
        err=document.getElementById('err'),
        form=document.getElementById('form');
  toggleBtn.onclick=()=>{
    mode=mode==='login'?'register':'login';
    title.textContent=mode==='login'?'登录':'注册';
    btn.textContent=mode==='login'?'登录':'注册';
    nameInput.style.display=mode==='register'?'block':'none';
    toggleBtn.textContent=mode==='login'?'没有账号？注册':'已有账号？登录';
    err.textContent='';
  };
  form.onsubmit=async e=>{
    e.preventDefault(); err.textContent='';
    const email=document.getElementById('email').value.trim();
    const password=document.getElementById('password').value;
    const name=mode==='register'?document.getElementById('name').value.trim():undefined;
    const path=mode==='login'?'/api/auth/login':'/api/auth/register';
    try{
      const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,name})});
      const data=await r.json();
      if(!r.ok){err.textContent=data.error||'请求失败';return;}
      window.location.href='/';
    }catch{err.textContent='网络错误';}
  };
</script>
</body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  // --- Start OAuth login (no-op placeholder, redirect to local login) ---
  app.get("/api/oauth/start", (_req: Request, res: Response) => {
    res.redirect(302, "/api/auth/login-page");
  });

  // --- Logout ---
  app.get("/api/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });
}
