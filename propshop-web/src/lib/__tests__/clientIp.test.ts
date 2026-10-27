import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { clientIp } from "../api";

const req = (headers: Record<string, string>) => new NextRequest("http://localhost/api/x", { headers });

test("a spoofed leftmost X-Forwarded-For entry is ignored (one trusted proxy)", () => {
  delete process.env.TRUSTED_PROXY_HOPS;
  assert.equal(clientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" })), "203.0.113.9");
  assert.equal(clientIp(req({ "x-forwarded-for": "203.0.113.9" })), "203.0.113.9");
});

test("two trusted proxies: the client is second from the right", () => {
  process.env.TRUSTED_PROXY_HOPS = "2";
  assert.equal(clientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.2" })), "203.0.113.9");
  delete process.env.TRUSTED_PROXY_HOPS;
});

test("no proxy: forwarded headers are not trusted at all", () => {
  process.env.TRUSTED_PROXY_HOPS = "0";
  assert.equal(clientIp(req({ "x-forwarded-for": "6.6.6.6" })), "direct");
  delete process.env.TRUSTED_PROXY_HOPS;
});

test("Vercel's own header wins", () => {
  assert.equal(clientIp(req({ "x-vercel-forwarded-for": "198.51.100.7", "x-forwarded-for": "6.6.6.6" })), "198.51.100.7");
});
