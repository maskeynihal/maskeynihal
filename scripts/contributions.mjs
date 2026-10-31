// Fetches the contribution calendar and renders an animated skyline SVG for the profile README.
// README images can't run JS, so the animation is CSS keyframes inside the SVG.
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const USER = process.env.GH_USER || "maskeynihal";
const token = process.env.GITHUB_TOKEN || execSync("gh auth token").toString().trim();

const QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: QUERY, variables: { login: USER } }),
});
const json = await res.json();
if (json.errors) throw new Error(JSON.stringify(json.errors));
const cal = json.data.user.contributionsCollection.contributionCalendar;

const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const days = cal.weeks.flatMap((w, x) =>
  w.contributionDays.map((d) => ({ ...d, x, y: new Date(d.date + "T00:00:00Z").getUTCDay(), level: LEVEL[d.contributionLevel] })),
);

const best = days.reduce((a, b) => (b.contributionCount > a.contributionCount ? b : a));

const THEMES = {
  light: { bg: "#ffffff", text: "#1f2328", muted: "#59636e", ramp: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"] },
  dark: { bg: "#0d1117", text: "#e6edf3", muted: "#8b949e", ramp: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"] },
};

const PAD = 20;
const weeks = cal.weeks.length;
const fmt = (n) => n.toLocaleString("en-US");

mkdirSync("assets", { recursive: true });
writeFileSync("assets/city-light.svg", renderCity(THEMES.light));
writeFileSync("assets/city-dark.svg", renderCity(THEMES.dark));

// Skyline: each day is a box (front, lit top, shaded side) in an oblique projection.
// Weekday rows recede up and to the right; height is sqrt(count) so one spike doesn't flatten the year.
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

function renderCity(t) {
  const CW = 10, BW = 8, DX = 7, DY = 5, OX = 5, OY = 4, MAXH = 130, CTOP = 120;
  const CWIDTH = PAD * 2 + weeks * CW + 6 * DX + OX;
  const BASE = CTOP + MAXH + 6 * DY + 10;
  const CH = BASE + PAD + 8;
  const maxSqrt = Math.sqrt(best.contributionCount) || 1;
  const geo = (d) => {
    const depth = 6 - d.y;
    const h = d.contributionCount ? Math.max(3, (Math.sqrt(d.contributionCount) / maxSqrt) * MAXH) : 1.5;
    return { X: PAD + d.x * CW + depth * DX, Yb: BASE - depth * DY, h };
  };
  // Back rows first, left to right, so nearer boxes cover farther ones.
  const order = [...days].sort((a, b) => a.y - b.y || a.x - b.x);
  const boxes = order.map((d) => {
    const { X, Yb, h } = geo(d);
    const c = t.ramp[d.level];
    const top = `${X},${Yb - h} ${X + BW},${Yb - h} ${X + BW + OX},${Yb - h - OY} ${X + OX},${Yb - h - OY}`;
    const side = `${X + BW},${Yb} ${X + BW + OX},${Yb - OY} ${X + BW + OX},${Yb - h - OY} ${X + BW},${Yb - h}`;
    const delay = ((d.x + (6 - d.y) * 1.6) * 22) / 1000; // front row rises first
    return `<g class="b" style="animation-delay:${delay.toFixed(2)}s;transform-origin:${X}px ${Yb}px"><title>${d.date}: ${d.contributionCount}</title><polygon points="${side}" fill="${shade(c, 0.72)}"/><rect x="${X}" y="${Yb - h}" width="${BW}" height="${h}" fill="${c}"/><polygon points="${top}" fill="${shade(c, 1.22)}"/></g>`;
  });
  const end = ((weeks + 6 * 1.6) * 22) / 1000 + 0.8;
  const bg = geo(best);
  const tipX = bg.X + BW / 2 + OX / 2, tipY = bg.Yb - bg.h - OY - 4;
  const labelY = Math.min(tipY - 18, CTOP - 20);
  const anchor = tipX > CWIDTH / 2 ? "end" : "start";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CWIDTH}" height="${CH}" viewBox="0 0 ${CWIDTH} ${CH}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<style>
.b{transform:scaleY(0);animation:rise .9s cubic-bezier(.34,1.4,.64,1) forwards}
@keyframes rise{to{transform:scaleY(1)}}
.f{opacity:0;animation:fade .6s ease forwards}
@keyframes fade{to{opacity:1}}
.l{stroke-dasharray:200;stroke-dashoffset:200;animation:draw .7s ease forwards}
@keyframes draw{to{stroke-dashoffset:0}}
@media (prefers-reduced-motion:reduce){.b{animation:none;transform:none}.f{animation:none;opacity:1}.l{animation:none;stroke-dashoffset:0}}
</style>
<rect width="100%" height="100%" rx="8" fill="${t.bg}"/>
<text x="${PAD}" y="34" font-size="22" font-weight="700" fill="${t.text}">${fmt(cal.totalContributions)}</text>
<text x="${PAD}" y="52" font-size="12" fill="${t.muted}">contributions, one building per day</text>
${boxes.join("\n")}
<polyline class="l" style="animation-delay:${end.toFixed(2)}s" points="${tipX},${tipY} ${tipX},${labelY + 6}" fill="none" stroke="${t.muted}" stroke-width="1"/>
<circle class="f" style="animation-delay:${end.toFixed(2)}s" cx="${tipX}" cy="${tipY}" r="2" fill="${t.text}"/>
<text class="f" style="animation-delay:${(end + 0.5).toFixed(2)}s" x="${tipX + (anchor === "end" ? 6 : -6)}" y="${labelY}" font-size="12" font-weight="600" text-anchor="${anchor}" fill="${t.text}">best day: ${best.contributionCount} on ${best.date}</text>
</svg>`;
}
console.log(`total=${cal.totalContributions} best=${best.contributionCount}@${best.date}`);
