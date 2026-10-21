import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { caIssuerUrls, isIncompleteChainError, isPublicAddress, resolveMissingIntermediates } from "../../server/services/sama/tlsChain";

/**
 * يحاكي خلل ساما (2026-10-14): خادم يرسل شهادته بلا الوسيطة، والوسيطة متاحة عبر AIA.
 * السلسلة تُولَّد عند التشغيل (جذر تجريبي → وسيطة → localhost) حتى لا تُحفظ مفاتيح في المستودع.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sama-tls-"));
const f = (name: string) => path.join(dir, name);
const openssl = (...args: string[]) => execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });

let aiaServer: http.Server;
let tlsServer: https.Server;
let tlsPort = 0;
let rootPem = "";
let intermediatePem = "";

function get(ca: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    https
      .get({ host: "localhost", port: tlsPort, path: "/", ca, family: 4 }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      })
      .on("error", reject);
  });
}

beforeAll(async () => {
  aiaServer = http.createServer((req, res) => {
    if (req.url === "/intermediate.der") {
      res.writeHead(200, { "Content-Type": "application/pkix-cert" });
      res.end(fs.readFileSync(f("intermediate.der")));
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => aiaServer.listen(0, "127.0.0.1", r));
  const aiaPort = (aiaServer.address() as AddressInfo).port;

  fs.writeFileSync(f("ca.ext"), "basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n");
  fs.writeFileSync(
    f("leaf.ext"),
    `basicConstraints=CA:FALSE\nsubjectAltName=DNS:localhost\nauthorityInfoAccess=caIssuers;URI:http://127.0.0.1:${aiaPort}/intermediate.der\n`,
  );
  openssl("req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-keyout", "root.key", "-out", "root.pem", "-days", "2", "-subj", "/CN=Sabq Test Root", "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign");
  openssl("req", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-keyout", "int.key", "-out", "int.csr", "-subj", "/CN=Sabq Test Intermediate");
  openssl("x509", "-req", "-in", "int.csr", "-CA", "root.pem", "-CAkey", "root.key", "-CAcreateserial", "-out", "intermediate.pem", "-days", "2", "-extfile", "ca.ext");
  openssl("x509", "-in", "intermediate.pem", "-outform", "DER", "-out", "intermediate.der");
  openssl("req", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-keyout", "leaf.key", "-out", "leaf.csr", "-subj", "/CN=localhost");
  openssl("x509", "-req", "-in", "leaf.csr", "-CA", "intermediate.pem", "-CAkey", "int.key", "-CAcreateserial", "-out", "leaf.pem", "-days", "2", "-extfile", "leaf.ext");

  rootPem = fs.readFileSync(f("root.pem"), "utf8");
  intermediatePem = fs.readFileSync(f("intermediate.pem"), "utf8");

  // الخادم يرسل الطرفية وحدها — مثل ساما
  tlsServer = https.createServer({ key: fs.readFileSync(f("leaf.key")), cert: fs.readFileSync(f("leaf.pem")) }, (_req, res) => {
    res.writeHead(200).end("ok");
  });
  await new Promise<void>((r) => tlsServer.listen(0, "127.0.0.1", r));
  tlsPort = (tlsServer.address() as AddressInfo).port;
});

afterAll(() => {
  tlsServer?.close();
  aiaServer?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("إكمال سلسلة شهادة ساما عبر AIA", () => {
  it("يرفض Node السلسلة الناقصة بالرمز الذي نلتقطه", async () => {
    const err = await get([rootPem]).catch((e) => e);
    expect(isIncompleteChainError(err)).toBe(true);
  });

  it("يجلب الوسيطة ويتحقق أنها تنتهي إلى الجذر، ثم ينجح الطلب بالتحقق الكامل", async () => {
    const chain = await resolveMissingIntermediates("localhost", { port: tlsPort, roots: [rootPem], allowPrivateAia: true });
    expect(chain).toHaveLength(1);
    expect(chain[0].replace(/\s/g, "")).toBe(intermediatePem.replace(/\s/g, ""));
    expect(await get([rootPem, ...chain])).toBe(200);
  });

  it("لا يقبل وسيطة لا تنتهي إلى جذر موثوق", async () => {
    await expect(resolveMissingIntermediates("localhost", { port: tlsPort, roots: [], allowPrivateAia: true })).rejects.toThrow();
  });

  it("لا يتبع رابط AIA إلى عنوان داخلي في التشغيل الفعلي (شهادة الخادم لم يُتحقق منها بعد)", async () => {
    await expect(resolveMissingIntermediates("localhost", { port: tlsPort, roots: [rootPem] })).rejects.toThrow(/could not fetch/);
    for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.20.0.1", "192.168.1.1", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700::1111")).toBe(true);
  });

  it("لا يخلط أخطاء الشهادة الأخرى بالسلسلة الناقصة", () => {
    expect(isIncompleteChainError(Object.assign(new Error("x"), { code: "CERT_HAS_EXPIRED" }))).toBe(false);
    expect(isIncompleteChainError(Object.assign(new Error("x"), { code: "ERR_TLS_CERT_ALTNAME_INVALID" }))).toBe(false);
    expect(isIncompleteChainError(null)).toBe(false);
  });

  it("يقرأ روابط CA Issuers فقط من infoAccess", () => {
    expect(
      caIssuerUrls("OCSP - URI:http://ocsp.example.com\nCA Issuers - URI:http://cacerts.example.com/ca.crt\nCA Issuers - URI:ldap://x"),
    ).toEqual(["http://cacerts.example.com/ca.crt"]);
    expect(caIssuerUrls(undefined)).toEqual([]);
  });
});
