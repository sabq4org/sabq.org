import { useEffect, useRef } from "react";

interface Neuron {
  hx: number;
  hy: number;
  x: number;
  y: number;
  ph: number;
  r: number;
  human?: boolean;
}

interface Pulse {
  link: [number, number, number];
  t: number;
  speed: number;
  reverse: boolean;
}

/**
 * دماغ «عقل سبق»: منظر جانبي لدماغ بشري، الفص الجبهي نحو النص (يمين الصفحة)،
 * وعقدة القرار الخضراء في مقدمته — كل نبضة تصلها تتحول للأخضر: الآلة تُشير والمحرر يقرّر.
 */
export function BrainCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    let shapes: Path2D[] = [];
    let gyri: [number, number][][] = [];
    let nodes: Neuron[] = [];
    let links: [number, number, number][] = [];
    let pulses: Pulse[] = [];
    let outline: HTMLCanvasElement | null = null;
    let raf = 0;
    let visible = true;

    const cerebrumPath = () => {
      const p = new Path2D();
      const cx = 0.54 * W, cy = 0.4 * H, rx = 0.41 * W, ry = 0.31 * H;
      for (let i = 0; i <= 180; i++) {
        const t = (i / 180) * Math.PI * 2;
        const r = 1 + 0.028 * Math.sin(t * 13) + 0.018 * Math.sin(t * 23 + 1.3);
        const px = cx + Math.cos(t) * rx * r;
        let py = cy + Math.sin(t) * ry * r * (Math.cos(t) > 0 ? 1.06 : 0.96);
        if (py > cy + ry * 0.55) py = cy + ry * 0.55 + (py - (cy + ry * 0.55)) * 0.35;
        if (i) p.lineTo(px, py);
        else p.moveTo(px, py);
      }
      p.closePath();
      return p;
    };
    const ellipsePath = (cx: number, cy: number, rx: number, ry: number) => {
      const p = new Path2D();
      p.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      return p;
    };
    const stemPath = () => {
      const p = new Path2D();
      p.moveTo(0.43 * W, 0.56 * H);
      p.quadraticCurveTo(0.41 * W, 0.75 * H, 0.385 * W, 0.93 * H);
      p.lineTo(0.455 * W, 0.93 * H);
      p.quadraticCurveTo(0.475 * W, 0.75 * H, 0.52 * W, 0.6 * H);
      p.closePath();
      return p;
    };
    const inside = (px: number, py: number) => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const ok = shapes.some((s) => ctx.isPointInPath(s, px, py));
      ctx.restore();
      return ok;
    };

    const build = () => {
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      if (!W || !H) return;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed = 7;
      pulses = [];
      shapes = [
        cerebrumPath(),
        ellipsePath(0.6 * W, 0.55 * H, 0.24 * W, 0.13 * H),
        ellipsePath(0.27 * W, 0.66 * H, 0.135 * W, 0.095 * H),
        stemPath(),
      ];

      // الحدّ الخارجي فقط: ارسم حواف كل الفصوص ثم امسح داخلها حتى لا تظهر الخطوط المتداخلة
      outline = document.createElement("canvas");
      outline.width = W * dpr;
      outline.height = H * dpr;
      const o = outline.getContext("2d");
      if (o) {
        o.setTransform(dpr, 0, 0, dpr, 0, 0);
        o.strokeStyle = "rgba(140,200,255,.75)";
        o.lineWidth = 3;
        o.lineJoin = "round";
        for (const s of shapes) o.stroke(s);
        o.globalCompositeOperation = "destination-out";
        for (const s of shapes) o.fill(s);
      }

      gyri = [];
      for (let g = 0; g < 44; g++) {
        let px = 0.2 * W + rnd() * 0.68 * W;
        let py = 0.14 * H + rnd() * 0.5 * H;
        let a = rnd() * Math.PI * 2;
        const pts: [number, number][] = [[px, py]];
        for (let k = 0; k < 7; k++) {
          a += (rnd() - 0.5) * 1.8;
          px += Math.cos(a) * W * 0.04;
          py += Math.sin(a) * H * 0.04;
          if (!inside(px, py)) break;
          pts.push([px, py]);
        }
        if (pts.length > 2) gyri.push(pts);
      }

      nodes = [];
      const count = W < 420 ? 110 : 190;
      const minD = W * 0.028;
      for (let tries = 0; nodes.length < count && tries < 8000; tries++) {
        const px = rnd() * W, py = rnd() * H;
        if (!inside(px, py)) continue;
        if (nodes.some((n) => Math.hypot(n.hx - px, n.hy - py) < minD)) continue;
        nodes.push({ hx: px, hy: py, x: px, y: py, ph: rnd() * 6.28, r: 0.8 + rnd() * 1.5 });
      }
      nodes.push({ hx: 0.83 * W, hy: 0.33 * H, x: 0.83 * W, y: 0.33 * H, r: 5, ph: 0, human: true });

      links = [];
      const maxL = W * 0.075;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const d = Math.hypot(nodes[i].hx - nodes[j].hx, nodes[i].hy - nodes[j].hy);
          if (d < (nodes[i].human || nodes[j].human ? maxL * 1.5 : maxL)) links.push([i, j, 1 - d / maxL]);
        }
      }
    };

    const draw = (ms: number) => {
      if (!W || !H) return;
      const t = ms / 1000;
      ctx.clearRect(0, 0, W, H);

      ctx.fillStyle = "rgba(40,90,160,.035)";
      for (const s of shapes) ctx.fill(s);
      if (outline) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.shadowColor = "rgba(92,180,255,.8)";
        ctx.shadowBlur = 22 * dpr;
        ctx.drawImage(outline, 0, 0);
        ctx.restore();
      }

      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(120,190,255,.2)";
      ctx.lineWidth = 1.5;
      for (const g of gyri) {
        ctx.beginPath();
        ctx.moveTo(g[0][0], g[0][1]);
        for (let k = 1; k < g.length - 1; k++) {
          ctx.quadraticCurveTo(g[k][0], g[k][1], (g[k][0] + g[k + 1][0]) / 2, (g[k][1] + g[k + 1][1]) / 2);
        }
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(150,205,255,.35)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0.73 * W, 0.55 * H);
      ctx.bezierCurveTo(0.62 * W, 0.47 * H, 0.52 * W, 0.5 * H, 0.42 * W, 0.42 * H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0.6 * W, 0.1 * H);
      ctx.bezierCurveTo(0.56 * W, 0.24 * H, 0.6 * W, 0.34 * H, 0.54 * W, 0.47 * H);
      ctx.stroke();

      ctx.strokeStyle = "rgba(120,190,255,.16)";
      ctx.lineWidth = 1;
      for (let k = 1; k < 5; k++) {
        const f = 1 - k * 0.17;
        ctx.beginPath();
        ctx.ellipse(0.27 * W, 0.66 * H, 0.135 * W * f, 0.095 * H * f, 0, Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();
      }

      for (const n of nodes) {
        if (n.human) continue;
        n.x = n.hx + Math.sin(t * 0.7 + n.ph) * 1.6;
        n.y = n.hy + Math.cos(t * 0.6 + n.ph) * 1.6;
      }
      ctx.lineWidth = 0.8;
      for (const [i, j, o] of links) {
        const a = nodes[i], b = nodes[j];
        ctx.strokeStyle = a.human || b.human ? `rgba(63,224,160,${0.18 + o * 0.2})` : `rgba(92,180,255,${o * 0.32})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      if (!reduce && Math.random() < 0.7 && links.length) {
        pulses.push({
          link: links[Math.floor(Math.random() * links.length)],
          t: 0,
          speed: 0.012 + Math.random() * 0.02,
          reverse: Math.random() < 0.5,
        });
      }
      pulses = pulses.filter((p) => p.t <= 1);
      for (const p of pulses) {
        p.t += p.speed;
        const [i, j] = p.link;
        const a = nodes[p.reverse ? j : i], b = nodes[p.reverse ? i : j];
        const hu = Boolean(b.human);
        ctx.fillStyle = hu ? "#3fe0a0" : "rgba(190,228,255,.95)";
        ctx.shadowColor = hu ? "#3fe0a0" : "#5cb4ff";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(a.x + (b.x - a.x) * p.t, a.y + (b.y - a.y) * p.t, hu ? 2.4 : 1.7, 0, 7);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      for (const n of nodes) {
        if (n.human) {
          const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 46 + Math.sin(t * 2.2) * 7);
          g.addColorStop(0, "rgba(63,224,160,.55)");
          g.addColorStop(1, "rgba(63,224,160,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 56, 0, 7);
          ctx.fill();
          ctx.fillStyle = "#3fe0a0";
        } else {
          const tw = 0.55 + 0.45 * Math.sin(t * 1.8 + n.ph * 3);
          ctx.fillStyle = `rgba(200,232,255,${0.45 + tw * 0.5})`;
        }
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, 7);
        ctx.fill();
      }
    };

    const loop = (ms: number) => {
      draw(ms);
      raf = visible && !reduce ? requestAnimationFrame(loop) : 0;
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };

    build();
    start();

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        build();
        if (reduce) draw(0);
      }, 150);
    };
    window.addEventListener("resize", onResize);

    const io = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible) start();
    });
    io.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      io.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" />;
}
