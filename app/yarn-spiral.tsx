"use client";

import { useRef, useEffect, useCallback } from "react";
import { Caveat } from "next/font/google";
import { prepareWithSegments, layoutWithLines } from "@chenglou/pretext";

// ── Font ────────────────────────────────────────────────────
const handFont = Caveat({
  subsets: ["latin"],
  display: "swap",
});
const TEXT_BASE_PX = 20;
const TEXT_MIN_PX = 12;
function textFont(w: number) {
  const px = w < 600 ? Math.max(TEXT_MIN_PX, Math.round(TEXT_BASE_PX * (w / 600))) : TEXT_BASE_PX;
  return `700 ${px}px ${handFont.style.fontFamily}`;
}

// ── Text ────────────────────────────────────────────────────
const PHRASES = [
  "WHAT IS IT?",
  "WHAT DOES IT DO?",
  "I DON'T GET IT",
  "OH WOW",
  "THIS IS FUN",
  "IT CAN DO WHAT I DO",
  "WAIT NOW WHAT DO I DO?",
  "AM I WHAT I DO?",
  "NO I AM NOT WHAT I DO",
  "I AM ME",
  "AND I CAN DO SOMETHING NEW",
];

// ── Tuning ──────────────────────────────────────────────────
const GRAVITY = 0.35;
const DAMPING = 0.97;
const ITERATIONS = 14;
const SEG = 8;
const TURNS = 10;
const GRAB_R = 28;
const EDGE_T = 50;
const UNWIND_K = 1.4;
const FREE_RADIUS = 20;
const YARN_FILL = "#c4b5de";
const BG = "#dbeafe";

// ── Types ───────────────────────────────────────────────────
interface P {
  x: number;
  y: number;
  px: number;
  py: number;
  pinned: boolean;
}
interface Attach {
  idx: number;
  x: number;
  y: number;
}
interface TextArc {
  text: string;
  arcStart: number;
  w: number;
}
interface State {
  ps: P[];
  freeS: number;
  freeE: number;
  freed: Set<number>;
  attach: Attach[];
  drag: { idx: number; end: "s" | "e" | "mid" } | null;
  cx: number;
  cy: number;
  texts: TextArc[];
  yarnW: number;
  font: string;
  interacted: boolean;
}

// ── Spiral generation ───────────────────────────────────────
function spiral(
  cx: number,
  cy: number,
  count: number,
  maxR: number,
  minR: number
): { x: number; y: number }[] {
  const maxA = TURNS * 2 * Math.PI;
  const N = count * 40;
  const raw: { x: number; y: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = maxA * t;
    const r = minR + (maxR - minR) * t;
    raw.push({ x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) });
  }
  const pts: { x: number; y: number }[] = [raw[0]];
  let acc = 0;
  for (let i = 1; i < raw.length && pts.length < count; i++) {
    const dx = raw[i].x - raw[i - 1].x;
    const dy = raw[i].y - raw[i - 1].y;
    const d = Math.sqrt(dx * dx + dy * dy);
    acc += d;
    while (acc >= SEG && pts.length < count) {
      acc -= SEG;
      const r = acc / d;
      pts.push({ x: raw[i].x - dx * r, y: raw[i].y - dy * r });
    }
  }
  pts.reverse(); // index 0 = outermost
  return pts;
}

// ── Rotate points around center ─────────────────────────────
function rotatePoints(
  pts: { x: number; y: number }[],
  cx: number,
  cy: number,
  angle: number
) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    p.x = cx + dx * cos - dy * sin;
    p.y = cy + dx * sin + dy * cos;
  }
}

// ── Add organic wobble ──────────────────────────────────────
function addWobble(
  pts: { x: number; y: number }[],
  cx: number,
  cy: number
) {
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i].x - cx;
    const dy = pts[i].y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const tx = -dy / dist;
    const ty = dx / dist;
    const wobble =
      Math.sin(i * 0.04 * Math.PI) * 2.5 +
      Math.sin(i * 0.11 * Math.PI) * 1.5;
    pts[i].x += tx * wobble;
    pts[i].y += ty * wobble;
  }
}

// ── Physics ─────────────────────────────────────────────────
function simulate(s: State, w: number, h: number) {
  const { ps, freeS, freeE, freed, attach, drag } = s;
  const n = ps.length;
  for (let i = 0; i < n; i++) {
    ps[i].pinned = !(i < freeS || i >= n - freeE || freed.has(i));
  }
  for (const a of attach) {
    ps[a.idx].pinned = true;
    ps[a.idx].x = a.x;
    ps[a.idx].y = a.y;
  }
  if (drag) ps[drag.idx].pinned = true;
  for (const p of ps) {
    if (p.pinned) continue;
    const vx = (p.x - p.px) * DAMPING;
    const vy = (p.y - p.py) * DAMPING;
    p.px = p.x;
    p.py = p.y;
    p.x += vx;
    p.y += vy + GRAVITY;
    if (p.x < -50) p.x = -50;
    if (p.x > w + 50) p.x = w + 50;
    if (p.y > h + 100) p.y = h + 100;
  }
  for (let it = 0; it < ITERATIONS; it++) {
    for (let i = 0; i < n - 1; i++) {
      const a = ps[i],
        b = ps[i + 1];
      if (a.pinned && b.pinned) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.001) continue;
      const f = ((d - SEG) / d) * 0.5;
      const ox = dx * f,
        oy = dy * f;
      if (!a.pinned && !b.pinned) {
        a.x += ox;
        a.y += oy;
        b.x -= ox;
        b.y -= oy;
      } else if (a.pinned) {
        b.x -= ox * 2;
        b.y -= oy * 2;
      } else {
        a.x += ox * 2;
        a.y += oy * 2;
      }
    }
  }
}

function unwind(s: State) {
  const { ps, freeS, freeE, drag } = s;
  const n = ps.length;
  const th = SEG * UNWIND_K;
  if (drag?.end === "s" && freeS > 0 && freeS < n - freeE) {
    const dx = ps[freeS - 1].x - ps[freeS].x;
    const dy = ps[freeS - 1].y - ps[freeS].y;
    if (Math.sqrt(dx * dx + dy * dy) > th) {
      s.freeS++;
      const p = ps[s.freeS - 1];
      p.px = p.x;
      p.py = p.y;
    }
  }
  if (drag?.end === "e" && freeE > 0 && freeE < n - freeS) {
    const fi = n - freeE;
    const pi = fi - 1;
    if (fi < n && pi >= 0) {
      const dx = ps[fi].x - ps[pi].x;
      const dy = ps[fi].y - ps[pi].y;
      if (Math.sqrt(dx * dx + dy * dy) > th) {
        s.freeE++;
        const p = ps[n - s.freeE];
        p.px = p.x;
        p.py = p.y;
      }
    }
  }
}

// ── Canvas draw ─────────────────────────────────────────────
function draw(
  ctx: CanvasRenderingContext2D,
  s: State,
  w: number,
  h: number,
  edge: string | null,
  textFont: string,
  mouse: { x: number; y: number }
) {
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, w * dpr, h * dpr);
  ctx.save();
  ctx.scale(dpr, dpr);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  const { ps, yarnW } = s;
  const n = ps.length;

  // yarn path — draw in chunks so later segments layer on top of earlier ones
  // each chunk's fill extends backward to cover the seam its own border creates
  if (n > 1) {
    const CHUNK = 6;
    const OVERLAP = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let start = 0; start < n - 1; start += CHUNK) {
      const end = Math.min(start + CHUNK + 1, n);
      // BG border for this chunk only
      ctx.beginPath();
      ctx.moveTo(ps[start].x, ps[start].y);
      for (let i = start + 1; i < end - 1; i++) {
        const mx = (ps[i].x + ps[i + 1].x) / 2;
        const my = (ps[i].y + ps[i + 1].y) / 2;
        ctx.quadraticCurveTo(ps[i].x, ps[i].y, mx, my);
      }
      ctx.lineTo(ps[end - 1].x, ps[end - 1].y);
      ctx.strokeStyle = BG;
      ctx.lineWidth = yarnW + 3;
      ctx.stroke();
      // fill extends back to cover the border seam at the chunk boundary
      const fillStart = Math.max(0, start - OVERLAP);
      ctx.beginPath();
      ctx.moveTo(ps[fillStart].x, ps[fillStart].y);
      for (let i = fillStart + 1; i < end - 1; i++) {
        const mx = (ps[i].x + ps[i + 1].x) / 2;
        const my = (ps[i].y + ps[i + 1].y) / 2;
        ctx.quadraticCurveTo(ps[i].x, ps[i].y, mx, my);
      }
      ctx.lineTo(ps[end - 1].x, ps[end - 1].y);
      ctx.strokeStyle = YARN_FILL;
      ctx.lineWidth = yarnW - 1;
      ctx.stroke();
    }
  }

  // text along rope — later texts mask earlier ones via a yarn-colored backdrop
  ctx.font = textFont;
  ctx.textBaseline = "middle";
  for (const t of s.texts) {
    // draw masking stripe behind text (covers earlier text underneath)
    ctx.beginPath();
    const steps = Math.max(2, Math.ceil(t.w / 4));
    const p0 = arcPos(ps, t.arcStart);
    ctx.moveTo(p0.x, p0.y);
    for (let j = 1; j <= steps; j++) {
      const pos = arcPos(ps, t.arcStart + (t.w * j) / steps);
      ctx.lineTo(pos.x, pos.y);
    }
    ctx.strokeStyle = YARN_FILL;
    ctx.lineWidth = yarnW - 1;
    ctx.lineCap = "round";
    ctx.stroke();

    // draw characters
    ctx.fillStyle = "#1e1b2e";
    let arc = t.arcStart;
    for (const ch of t.text) {
      const cw = ctx.measureText(ch).width;
      const pos = arcPos(ps, arc + cw / 2);
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(pos.a);
      ctx.fillText(ch, -cw / 2, 0);
      ctx.restore();
      arc += cw;
    }
  }

  // hand-drawn arrow pointing at the start (hidden after first interaction)
  if (!s.interacted) {
    const p0 = ps[0];
    const tipX = p0.x - yarnW / 2 - 4;
    const tipY = p0.y;
    const startX = tipX - 60;
    const startY = tipY - 15;
    ctx.save();
    ctx.strokeStyle = "#1e1b2e";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(
      startX + 20,
      startY + 14,
      tipX - 22,
      tipY - 4,
      tipX,
      tipY
    );
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tipX - 9, tipY - 7);
    ctx.lineTo(tipX + 1, tipY);
    ctx.lineTo(tipX - 7, tipY + 8);
    ctx.stroke();
    ctx.restore();
  }

  // attachment dots — darker purple, × only on hover
  for (const a of s.attach) {
    const hovered = Math.hypot(mouse.x - a.x, mouse.y - a.y) < 14;
    ctx.beginPath();
    ctx.arc(a.x, a.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#a78bcc";
    ctx.fill();
    if (hovered) {
      const xs = 3.5;
      ctx.beginPath();
      ctx.moveTo(a.x - xs, a.y - xs);
      ctx.lineTo(a.x + xs, a.y + xs);
      ctx.moveTo(a.x + xs, a.y - xs);
      ctx.lineTo(a.x - xs, a.y + xs);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.stroke();
    }
  }

  // edge highlight
  if (edge && s.drag) {
    ctx.save();
    ctx.strokeStyle = "rgba(124,58,237,0.35)";
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    if (edge === "top") {
      ctx.moveTo(0, 2);
      ctx.lineTo(w, 2);
    }
    if (edge === "bottom") {
      ctx.moveTo(0, h - 2);
      ctx.lineTo(w, h - 2);
    }
    if (edge === "left") {
      ctx.moveTo(2, 0);
      ctx.lineTo(2, h);
    }
    if (edge === "right") {
      ctx.moveTo(w - 2, 0);
      ctx.lineTo(w - 2, h);
    }
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function arcPos(ps: P[], arc: number): { x: number; y: number; a: number } {
  const idx = arc / SEG;
  const i = Math.max(0, Math.min(ps.length - 2, Math.floor(idx)));
  const t = Math.max(0, Math.min(1, idx - i));
  const a = ps[i],
    b = ps[i + 1] ?? ps[i];
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    a: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

// ── Pretext measurement ─────────────────────────────────────
function measureWidth(text: string, font: string): number {
  try {
    const prep = prepareWithSegments(text, font);
    const { lines } = layoutWithLines(prep, 1e6, 20);
    return lines.length > 0 ? lines[0].width : 0;
  } catch {
    const c = document.createElement("canvas").getContext("2d")!;
    c.font = font;
    return c.measureText(text).width;
  }
}

// ── Component ───────────────────────────────────────────────
export function YarnSpiral() {
  const boxRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const st = useRef<State | null>(null);
  const raf = useRef(0);
  const sz = useRef({ w: 0, h: 0 });
  const edgeRef = useRef<string | null>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });

  useEffect(() => {
    const box = boxRef.current;
    const cv = cvRef.current;
    if (!box || !cv) return;

    let cancelled = false;
    let onResize: (() => void) | null = null;

    document.fonts.ready.then(() => {
      if (cancelled) return;

      const dpr = window.devicePixelRatio || 1;
      const { width: w, height: h } = box.getBoundingClientRect();
      sz.current = { w, h };
      cv.width = w * dpr;
      cv.height = h * dpr;
      cv.style.width = w + "px";
      cv.style.height = h + "px";

      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(w, h) * 0.28;
      const minR = 12;
      const yarnW = (maxR - minR) / TURNS;
      // enough points to cover full spiral arc
      const spiralCount = Math.min(
        1200,
        Math.round((TURNS * Math.PI * (maxR + minR)) / SEG)
      );
      // generate spiral, rotate so start is at upper-left, add wobble
      const spts = spiral(cx, cy, spiralCount, maxR, minR);
      const dx0 = spts[0].x - cx;
      const dy0 = spts[0].y - cy;
      const currentAngle = Math.atan2(dy0, dx0);
      // target: ~10 o'clock = upper-left
      const targetAngle = Math.atan2(-0.5, -0.866); // -5π/6
      rotatePoints(spts, cx, cy, targetAngle - currentAngle);
      addWobble(spts, cx, cy);

      // trailing curve (bezier to right side, slightly below center)
      const last = spts[spts.length - 1] ?? { x: cx, y: cy };
      const edgePad = Math.max(12, Math.min(40, w * 0.04));
      const endX = w - edgePad;
      const endY = cy + Math.min(30, h * 0.04);
      const tdx = endX - last.x;
      const tdy = endY - last.y;
      const trailDist = Math.sqrt(tdx * tdx + tdy * tdy);
      const trailCount = Math.max(10, Math.round(trailDist / SEG));
      const sag = trailDist * 0.25;
      const ctrlX = last.x + tdx * 0.45;
      const ctrlY = Math.max(last.y, endY) + sag;
      const trail: { x: number; y: number }[] = [];
      for (let i = 1; i <= trailCount; i++) {
        const t = i / trailCount;
        const u = 1 - t;
        trail.push({
          x: u * u * last.x + 2 * u * t * ctrlX + t * t * endX,
          y: u * u * last.y + 2 * u * t * ctrlY + t * t * endY,
        });
      }

      const all = [...spts, ...trail];
      // one-time subtle jitter at random intervals (10-20 segments apart)
      for (let i = Math.floor(Math.random() * 11) + 5; i < all.length; i += Math.floor(Math.random() * 11) + 5) {
        all[i].x += (Math.random() - 0.5) * 6;
      }
      const ps: P[] = all.map((p) => ({
        x: p.x,
        y: p.y,
        px: p.x,
        py: p.y,
        pinned: true,
      }));

      // ── Text placement — only in top zones (y < cy) ──
      const font = textFont(w);
      const widths = PHRASES.map((t) => measureWidth(t, font));
      const spiralArc = spts.length * SEG;
      const mainCount = PHRASES.length - 1;

      // scan spiral for top zones (contiguous ranges where y < cy)
      const topZones: { start: number; end: number }[] = [];
      let inTopZone = spts[0].y < cy;
      let zStart = inTopZone ? 0 : -1;
      for (let i = 1; i < spts.length; i++) {
        const nowTop = spts[i].y < cy;
        if (nowTop && !inTopZone) zStart = i * SEG;
        else if (!nowTop && inTopZone && zStart >= 0) {
          topZones.push({ start: zStart, end: i * SEG });
          zStart = -1;
        }
        inTopZone = nowTop;
      }
      if (inTopZone && zStart >= 0) {
        topZones.push({ start: zStart, end: spiralArc });
      }

      // build virtual arc (top-only) → real arc mapping
      const topMap: { vStart: number; rStart: number; len: number }[] = [];
      let vAcc = 0;
      for (const z of topZones) {
        const len = z.end - z.start;
        topMap.push({ vStart: vAcc, rStart: z.start, len });
        vAcc += len;
      }
      const totalTopArc = vAcc;
      function virtualToReal(v: number): number {
        for (const seg of topMap) {
          if (v < seg.vStart + seg.len)
            return seg.rStart + (v - seg.vStart);
        }
        const lst = topMap[topMap.length - 1];
        return lst ? lst.rStart + lst.len : 0;
      }

      const mainWidths = widths.slice(0, mainCount);
      const totalMainW = mainWidths.reduce((a, b) => a + b, 0);
      const textGap = Math.max(
        15,
        (totalTopArc - totalMainW) / (mainCount + 1)
      );

      const texts: TextArc[] = [];
      let vPos = textGap;
      for (let i = 0; i < mainCount; i++) {
        texts.push({
          text: PHRASES[i],
          arcStart: virtualToReal(vPos),
          w: widths[i],
        });
        vPos += widths[i] + textGap;
      }

      // nudge specific phrases further along their rounds
      const oneRingArc = spiralArc / TURNS;
      texts[0].arcStart -= oneRingArc * 0.05; // WHAT IS IT?
      texts[1].arcStart += oneRingArc * 1.23; // WHAT DOES IT DO?
      texts[2].arcStart += oneRingArc * 1.50; // I DON'T GET IT
      texts[3].arcStart += oneRingArc * 1.65; // OH WOW
      texts[4].arcStart += oneRingArc * 2.45; // THIS IS FUN
      texts[5].arcStart += oneRingArc * 2.4; // IT CAN DO WHAT I DO
      texts[6].arcStart += oneRingArc * 2; // WAIT NOW WHAT DO I DO?
      texts[7].arcStart += oneRingArc * 1.65; // AM I WHAT I DO?
      texts[8].arcStart += oneRingArc * 1.19; // NO I AM NOT WHAT I DO
      texts[9].arcStart += oneRingArc * .7; // I AM ME

      // last phrase on trailing tail (close to the end)
      const tailStartArc = spiralArc;
      const tailArc = trailCount * SEG;
      const lastW = widths[widths.length - 1];
      texts.push({
        text: PHRASES[PHRASES.length - 1],
        arcStart: tailStartArc + tailArc - lastW - 40,
        w: lastW,
      });

      st.current = {
        ps,
        freeS: 12,
        freeE: 5,
        freed: new Set(),
        attach: [
          { idx: 0, x: spts[0].x, y: cy - maxR },
          { idx: ps.length - 1, x: endX, y: endY },
        ],
        drag: null,
        cx,
        cy,
        texts,
        yarnW,
        font,
        interacted: false,
      };

      function tick() {
        const s = st.current;
        if (!s) return;
        const { w, h } = sz.current;
        simulate(s, w, h);
        unwind(s);
        const ctx = cv!.getContext("2d");
        if (ctx) draw(ctx, s, w, h, edgeRef.current, s.font, mouseRef.current);
        raf.current = requestAnimationFrame(tick);
      }
      raf.current = requestAnimationFrame(tick);

      function handleResize() {
        const { width: nw, height: nh } = box!.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        sz.current = { w: nw, h: nh };
        cv!.width = nw * dpr;
        cv!.height = nh * dpr;
        cv!.style.width = nw + "px";
        cv!.style.height = nh + "px";
      }
      onResize = handleResize;
      window.addEventListener("resize", handleResize);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf.current);
      if (onResize) window.removeEventListener("resize", onResize);
    };
  }, []);

  const down = useCallback((e: React.PointerEvent) => {
    const s = st.current;
    if (!s) return;
    s.interacted = true;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const { ps } = s;
    const n = ps.length;

    for (let i = s.attach.length - 1; i >= 0; i--) {
      const a = s.attach[i];
      if (Math.hypot(x - a.x, y - a.y) < 16) {
        ps[a.idx].pinned = false;
        ps[a.idx].px = ps[a.idx].x;
        ps[a.idx].py = ps[a.idx].y;
        s.attach.splice(i, 1);
        return;
      }
    }

    const d0 = Math.hypot(x - ps[0].x, y - ps[0].y);
    if (d0 < GRAB_R) {
      s.drag = { idx: 0, end: "s" };
      ps[0].x = x;
      ps[0].y = y;
      ps[0].px = x;
      ps[0].py = y;
      if (s.freeS < 8) s.freeS = 8;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    const dN = Math.hypot(x - ps[n - 1].x, y - ps[n - 1].y);
    if (dN < GRAB_R) {
      s.drag = { idx: n - 1, end: "e" };
      ps[n - 1].x = x;
      ps[n - 1].y = y;
      ps[n - 1].px = x;
      ps[n - 1].py = y;
      if (s.freeE < 8) s.freeE = 8;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    let bestIdx = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(x - ps[i].x, y - ps[i].y);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestD < s.yarnW / 2 + 8) {
      s.drag = { idx: bestIdx, end: "mid" };
      for (let j = bestIdx - FREE_RADIUS; j <= bestIdx + FREE_RADIUS; j++) {
        if (j >= 0 && j < n && !s.freed.has(j)) {
          s.freed.add(j);
          ps[j].px = ps[j].x;
          ps[j].py = ps[j].y;
        }
      }
      ps[bestIdx].x = x;
      ps[bestIdx].y = y;
      ps[bestIdx].px = x;
      ps[bestIdx].py = y;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  }, []);

  const move = useCallback((e: React.PointerEvent) => {
    const s = st.current;
    if (!s) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    mouseRef.current = { x, y };

    if (!s.drag) {
      let cursor = "default";
      const { ps } = s;
      const n = ps.length;
      for (const a of s.attach) {
        if (Math.hypot(x - a.x, y - a.y) < 16) {
          cursor = "pointer";
          break;
        }
      }
      if (cursor === "default") {
        if (
          Math.hypot(x - ps[0].x, y - ps[0].y) < GRAB_R ||
          Math.hypot(x - ps[n - 1].x, y - ps[n - 1].y) < GRAB_R
        ) {
          cursor = "grab";
        }
      }
      if (cursor === "default") {
        for (let i = 0; i < n; i += 3) {
          if (Math.hypot(x - ps[i].x, y - ps[i].y) < s.yarnW / 2 + 5) {
            cursor = "grab";
            break;
          }
        }
      }
      (e.currentTarget as HTMLElement).style.cursor = cursor;
      return;
    }

    (e.currentTarget as HTMLElement).style.cursor = "grabbing";
    const { w, h } = sz.current;
    const p = s.ps[s.drag.idx];
    p.x = x;
    p.y = y;
    p.px = x;
    p.py = y;

    edgeRef.current = null;
    if (x < EDGE_T) edgeRef.current = "left";
    else if (x > w - EDGE_T) edgeRef.current = "right";
    if (y < EDGE_T) edgeRef.current = "top";
    else if (y > h - EDGE_T) edgeRef.current = "bottom";
  }, []);

  const up = useCallback((e: React.PointerEvent) => {
    const s = st.current;
    if (!s?.drag) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const { w, h } = sz.current;

    let ax = x,
      ay = y,
      pin = false;
    if (x < EDGE_T) {
      ax = 0;
      pin = true;
    } else if (x > w - EDGE_T) {
      ax = w;
      pin = true;
    }
    if (y < EDGE_T) {
      ay = 0;
      pin = true;
    } else if (y > h - EDGE_T) {
      ay = h;
      pin = true;
    }

    if (pin) {
      s.attach.push({ idx: s.drag.idx, x: ax, y: ay });
      s.ps[s.drag.idx].x = ax;
      s.ps[s.drag.idx].y = ay;
      s.ps[s.drag.idx].px = ax;
      s.ps[s.drag.idx].py = ay;
    }

    s.drag = null;
    edgeRef.current = null;
    (e.currentTarget as HTMLElement).style.cursor = "default";
  }, []);

  const copyText = useCallback(() => {
    navigator.clipboard.writeText(PHRASES.join(" → "));
  }, []);

  return (
    <div
      ref={boxRef}
      className={`${handFont.className} fixed inset-0 overflow-hidden select-none`}
      style={{ background: BG, cursor: "default", touchAction: "none", overscrollBehavior: "none" }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
    >
      <div className="absolute top-3 sm:top-6 left-1/2 z-10 -translate-x-1/2 flex flex-col items-center gap-0.5 sm:gap-1 text-center w-full px-3 sm:px-0 sm:w-auto">
        <h1
          className="rounded-lg px-2.5 sm:px-5 py-1.5 sm:py-2 text-xs sm:text-base font-bold tracking-[0.08em] sm:tracking-[0.18em] text-white whitespace-nowrap"
          style={{ background: "#1e1b2e" }}
        >
          THE AI ADOPTION SPIRAL
        </h1>
        <a
          href="https://www.linkedin.com/in/liz-fosslien"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm sm:text-xl font-bold tracking-[0.06em] sm:tracking-[0.18em] text-black hover:underline whitespace-nowrap"
          style={{ fontFamily: handFont.style.fontFamily }}
        >
          Inspired by Liz Fosslien
        </a>
      </div>

      <canvas ref={cvRef} className="absolute inset-0" />

      <div className="sr-only" role="article" aria-label="AI Adoption Spiral">
        {PHRASES.join(" — ")}
      </div>

      <button
        onClick={copyText}
        className="absolute bottom-3 sm:bottom-5 left-3 sm:left-5 z-10 rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 backdrop-blur transition hover:bg-white/60"
        style={{ background: "rgba(255,255,255,0.4)" }}
      >
        Copy text
      </button>

    </div>
  );
}
