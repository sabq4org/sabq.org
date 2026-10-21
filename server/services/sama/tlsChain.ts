/**
 * إكمال سلسلة شهادة ساما عند نقص الشهادة الوسيطة.
 *
 * فخ موثّق (2026-10-14): خادم www.sama.gov.sa صار يرسل شهادته وحدها بلا الوسيطة،
 * فيرفض Node الاتصال بـ«unable to verify the first certificate» (المتصفحات تكمل
 * السلسلة بنفسها عبر AIA فلا يظهر الخلل للقارئ). توقف رصد ساما كله أسبوعًا.
 *
 * الحل كما تفعل المتصفحات: نقرأ رابط «CA Issuers» من شهادة الخادم، نجلب الوسيطة،
 * ونتحقق بأنفسنا أنها تنتهي إلى جذر موثوق في مخزن Node قبل استخدامها. ثم نعيد الطلب
 * بالتحقق الكامل المعتاد (`ca` = الجذور + الوسيطة). Node لا يعامل الوسيطة كمرساة ثقة
 * (allowPartialTrustChain=false افتراضيًا)، فلا يُضعف هذا التحقق من الهوية.
 *
 * لا يستورد db (ADR-001).
 */
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import dns from "node:dns";
import net from "node:net";
import { X509Certificate } from "node:crypto";

const MAX_AIA_HOPS = 3;
const AIA_TIMEOUT_MS = 10_000;

/** رموز أخطاء OpenSSL التي تعني «السلسلة ناقصة» لا «الشهادة مزوّرة أو منتهية». */
const INCOMPLETE_CHAIN_CODES = new Set(["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"]);

export function isIncompleteChainError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return typeof code === "string" && INCOMPLETE_CHAIN_CODES.has(code);
}

/** يستخرج روابط «CA Issuers» من نص infoAccess كما يعيده X509Certificate. */
export function caIssuerUrls(infoAccess: string | undefined): string[] {
  if (!infoAccess) return [];
  const out: string[] = [];
  for (const line of infoAccess.split("\n")) {
    const m = line.match(/^CA Issuers - URI:(\S+)/);
    if (m && /^https?:\/\//i.test(m[1])) out.push(m[1]);
  }
  return out;
}

function parseRoots(pems: readonly string[]): X509Certificate[] {
  const out: X509Certificate[] = [];
  for (const pem of pems) {
    try {
      out.push(new X509Certificate(pem));
    } catch {
      // جذر لا يُقرأ — نتجاوزه
    }
  }
  return out;
}

let systemRoots: X509Certificate[] | null = null;
function defaultRoots(): X509Certificate[] {
  if (!systemRoots) systemRoots = parseRoots(tls.rootCertificates);
  return systemRoots;
}

function issuedBy(child: X509Certificate, parent: X509Certificate): boolean {
  return child.checkIssued(parent) && child.verify(parent.publicKey);
}

function findTrustedIssuer(cert: X509Certificate, roots: X509Certificate[]): X509Certificate | null {
  return roots.find((root) => issuedBy(cert, root)) ?? null;
}

/** شهادة الخادم الطرفية — اتصال قراءة فقط لا يُرسَل عبره أي طلب. */
function fetchLeafCertificate(hostname: string, port: number, timeoutMs: number): Promise<X509Certificate> {
  return new Promise((resolve, reject) => {
    // family لا يظهر في أنواع tls.ConnectionOptions لكنه يمرّ إلى net.connect (ساما تقطع IPv6)
    const options: tls.ConnectionOptions & { family: number } = { host: hostname, port, servername: hostname, family: 4, rejectUnauthorized: false, timeout: timeoutMs };
    const socket = tls.connect(options, () => {
      const raw = socket.getPeerX509Certificate();
      socket.destroy();
      if (!raw) reject(new Error(`no peer certificate from ${hostname}`));
      else resolve(raw);
    });
    socket.on("timeout", () => socket.destroy(new Error(`TLS probe to ${hostname} timed out`)));
    socket.on("error", reject);
  });
}

/** عناوين لا يجوز أن يقصدها رابط AIA: شهادة الخادم لم يُتحقق منها بعد، فرابطها قد يكون مزروعًا. */
const NON_PUBLIC = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
] as const) NON_PUBLIC.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of [["::", 127], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) {
  NON_PUBLIC.addSubnet(addr, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (!family) return false;
  return !NON_PUBLIC.check(address, family === 4 ? "ipv4" : "ipv6");
}

/** lookup يرفض العناوين الخاصة — يُطبَّق على العنوان الذي يُتصل به فعلًا (لا ثغرة إعادة ربط DNS). */
const publicOnlyLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as dns.LookupAddress[];
    const bad = list.find((a) => !isPublicAddress(a.address));
    if (bad || !list.length) return callback(new Error(`AIA host ${hostname} resolves to a non-public address`), "", 0);
    if ((options as dns.LookupOptions).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

function download(url: string, timeoutMs: number, allowPrivate: boolean): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    if (!allowPrivate && net.isIP(host) && !isPublicAddress(host)) {
      reject(new Error(`AIA ${url} targets a non-public address`));
      return;
    }
    const req = client.get(url, { timeout: timeoutMs, ...(allowPrivate ? {} : { lookup: publicOnlyLookup }) }, (res) => {
      if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
        res.resume();
        reject(new Error(`AIA ${url} responded ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > 64 * 1024) req.destroy(new Error("AIA certificate too large"));
        else chunks.push(c);
      });
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error(`AIA ${url} timed out`)));
    req.on("error", reject);
  });
}

/**
 * يبني الشهادات الوسيطة الناقصة لـ hostname بتتبّع AIA حتى جذر موثوق.
 * يعيدها PEM بالترتيب (الأقرب للخادم أولًا)، أو يرمي إن لم تنتهِ السلسلة إلى جذر موثوق.
 */
export async function resolveMissingIntermediates(
  hostname: string,
  /** allowPrivateAia للاختبار المحلي فقط */
  opts: { port?: number; roots?: readonly string[]; allowPrivateAia?: boolean } = {},
): Promise<string[]> {
  const roots = opts.roots ? parseRoots(opts.roots) : defaultRoots();
  const port = opts.port ?? 443;
  let current = await fetchLeafCertificate(hostname, port, AIA_TIMEOUT_MS);
  const chain: X509Certificate[] = [];
  for (let hop = 0; hop < MAX_AIA_HOPS; hop++) {
    if (findTrustedIssuer(current, roots)) {
      if (!chain.length) throw new Error(`${hostname}: leaf already chains to a trusted root`);
      return chain.map((c) => c.toString());
    }
    const urls = caIssuerUrls(current.infoAccess);
    if (!urls.length) throw new Error(`${hostname}: certificate has no CA Issuers URL`);
    let next: X509Certificate | null = null;
    for (const url of urls) {
      try {
        const cert = new X509Certificate(await download(url, AIA_TIMEOUT_MS, opts.allowPrivateAia === true)); // DER أو PEM
        if (issuedBy(current, cert)) {
          next = cert;
          break;
        }
      } catch {
        // نجرّب الرابط التالي
      }
    }
    if (!next) throw new Error(`${hostname}: could not fetch a valid issuer via AIA`);
    chain.push(next);
    current = next;
  }
  if (findTrustedIssuer(current, roots)) return chain.map((c) => c.toString());
  throw new Error(`${hostname}: AIA chain does not reach a trusted root`);
}

/** الجذور الموثوقة + الوسيطات المستكملة — يُمرَّر كـ`ca` لطلب https. */
export function caWithIntermediates(intermediates: string[]): string[] {
  return [...tls.rootCertificates, ...intermediates];
}
