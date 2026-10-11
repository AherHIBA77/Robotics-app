import '@wokwi/elements';
import { Board } from './sim.mjs';
import hex from './build/payload_detector.ino.hex';

const W = window;
const $ = id => document.getElementById(id);
W.board = new Board(hex);

// part positions (px, same coordinate system as Wokwi's diagram.json)
const SCALE = 1.35;
const parts = {
  uno:   { left: 300, top: 290 },
  sonar: { left: 390, top: 60 },
  servo: { left: 40,  top: 90, rotate: 180 },
  r_led: { left: 620, top: 200 },
  led:   { left: 700, top: 158, flip: true },
  sw:    { left: 640, top: 360 },
};
const sizes = {};
for (const k in parts) {
  const p = parts[k], e = $(k);
  e.style.left = p.left + 'px'; e.style.top = p.top + 'px';
  if (p.rotate) e.style.transform = `rotate(${p.rotate}deg)`;
  if (p.flip) e.flip = true;
}
$('stage').style.transform = `scale(${SCALE})`;

function pin(id, name) {
  const e = $(id), p = parts[id], info = e.pinInfo.find(q => q.name === name);
  let x = info.x, y = info.y;
  if (p.rotate === 180) { x = e.offsetWidth - x; y = e.offsetHeight - y; }
  return { x: p.left + x, y: p.top + y };
}
// route: list of ['v', y] / ['h', x] moves from the first pin, then a final dog-leg into the second pin
const wires = [
  ['uno:7', 'sonar:TRIG', '#f39c12', [['v', 245]]],
  ['uno:6', 'sonar:ECHO', '#8e44ad', [['v', 230]]],
  ['uno:GND.1', 'sonar:GND', '#222', [['v', 200], ['h', 520]]],
  ['uno:5V', 'sonar:VCC', '#e03131', [['v', 510], ['h', 270], ['v', 185]]],
  ['uno:9', 'servo:PWM', '#e0a800', [['v', 260], ['h', 250]]],
  ['uno:5V', 'servo:V+', '#e03131', [['v', 510], ['h', 260]]],
  ['uno:GND.2', 'servo:GND', '#222', [['v', 525], ['h', 245]]],
  ['uno:12', 'r_led:1', '#2b8a3e', [['v', 215], ['h', 600]]],
  ['r_led:2', 'led:A', '#2b8a3e', []],
  ['led:C', 'uno:GND.3', '#222', [['h', 760], ['v', 540], ['h', 479]]],
  ['uno:2', 'sw:1.l', '#1c7ed6', [['v', 275], ['h', 615]]],
  ['sw:2.r', 'uno:GND.3', '#222', [['h', 725], ['v', 540]]],
];
function routePoints(A, B, moves) {
  const pts = [{ ...A }]; let cur = { ...A }, last = null;
  for (const [m, v] of moves) { cur = m === 'v' ? { x: cur.x, y: v } : { x: v, y: cur.y }; pts.push(cur); last = m; }
  const mid = last === 'v' ? { x: B.x, y: cur.y } : { x: cur.x, y: B.y };
  pts.push(mid, { ...B });
  return pts;
}
const TYPES = { uno: 'wokwi-arduino-uno', sonar: 'wokwi-hc-sr04', servo: 'wokwi-servo', r_led: 'wokwi-resistor', led: 'wokwi-led', sw: 'wokwi-pushbutton' };
W.diagram = () => ({
  version: 1, author: 'AUI Robotics Challenge 2026 - Track B', editor: 'wokwi',
  parts: Object.entries(parts).map(([id, p]) => ({
    type: TYPES[id], id, top: p.top, left: p.left, ...(p.rotate ? { rotate: p.rotate } : {}),
    attrs: { sonar: { distance: '20' }, servo: { horn: 'double' }, r_led: { value: '220' },
             led: { color: 'green', flip: '1' }, sw: { color: 'black' } }[id] || {},
  })),
  connections: wires.map(([a, b, col, moves]) => {
    const [ia, pa] = a.split(':'), [ib, pb] = b.split(':');
    const pts = routePoints(pin(ia, pa), pin(ib, pb), moves), route = [];
    for (let i = 1; i < pts.length; i++) {
      const dx = Math.round(pts[i].x - pts[i - 1].x), dy = Math.round(pts[i].y - pts[i - 1].y);
      if (dx) route.push('h' + dx); if (dy) route.push('v' + dy);
    }
    return [a, b, col, route];
  }),
  dependencies: {},
});
function drawWires() {
  const svg = $('wires'); svg.innerHTML = '';
  for (const [a, b, col, moves] of wires) {
    const [ia, pa] = a.split(':'), [ib, pb] = b.split(':');
    const A = pin(ia, pa), B = pin(ib, pb);
    let d = `M${A.x},${A.y}`, last = null;
    for (const [m, v] of moves) { d += (m === 'v' ? ' V' : ' H') + v; last = m; }
    d += last === 'v' ? ` H${B.x} V${B.y}` : ` V${B.y} H${B.x}`;
    svg.insertAdjacentHTML('beforeend', `<path d="${d}" stroke="${col}" stroke-width="2.6" fill="none" stroke-linejoin="round"/>`);
  }
}
W.render = function () {
  const b = W.board;
  $('servo').angle = b.servoAngle ?? 0;
  $('led').value = b.led;
  $('sw').pressed = b.switchPressed;
  $('dist').textContent = b.distanceCm == null ? 'distance: no echo' : `distance: ${b.distanceCm.toFixed(1)} cm`;
  $('state').textContent = b.led ? 'CLAMP CLOSED' : 'CLAMP OPEN';
  $('state').className = b.led ? 'closed' : 'open';
  $('angle').textContent = `servo: ${b.servoAngle ?? 0}°`;
  $('badge').textContent = `${b.servoAngle ?? 0}°  ${b.led ? 'closed' : 'open'}`;
  $('badge').className = b.led ? 'closed' : 'open';
  $('time').textContent = `t = ${(b.ms / 1000).toFixed(2)} s (emulated ATmega328P @ 16 MHz)`;
  let lines = b.serial.trimEnd().split('\n');
  if (W.eventsOnly) {
    const ev = lines.filter(l => !l.startsWith('dist:')), last = lines.filter(l => l.startsWith('dist:')).at(-1);
    lines = [...ev.slice(-18), '', '— live —', ...(last ? [last] : [])];
  }
  $('serial').innerHTML = lines.slice(-22).map(l =>
    `<div class="${l.startsWith('>>') ? 'ev' : l.startsWith('switch') ? 'sw' : ''}">${l.replace(/</g, '&lt;')}</div>`).join('');
  drawWires();
};
// video overlay: distance track (0-30 cm) and captions
const X0 = 150, X1 = 940, CM = 30;
const cx = cm => X0 + (X1 - X0) * Math.min(cm, CM) / CM;
W.videoMode = () => {
  W.eventsOnly = true; $('hud').style.display = 'none';
  document.querySelector('#side h3').textContent = 'Serial Monitor · 115200 baud  (events + latest reading)';
  $('caption').style.display = 'block'; $('trackbox').style.display = 'block';
  const z5 = $('z5'), z7 = $('z7');
  z5.style.cssText += `left:${cx(0)}px;width:${cx(5) - cx(0)}px;background:#1f9d5533`;
  z7.style.cssText += `left:${cx(5)}px;width:${cx(7) - cx(5)}px;background:#f0a03033`;
  $('ticks').innerHTML = [0, 5, 7, 10, 20, 30].map(c => `<div class="tick" style="left:${cx(c)}px"></div><div class="mark" style="left:${cx(c)}px">${c} cm</div>`).join('');
};
W.overlay = (caption, rx) => {
  $('caption').textContent = caption;
  const d = W.board.distanceCm, cube = $('cube');
  cube.style.left = (d == null ? cx(1) : cx(d)) + 'px';
  cube.className = d == null ? 'gone' : '';
  $('rx').textContent = rx || '';
};
W.ready = customElements.whenDefined('wokwi-arduino-uno').then(() => new Promise(r => setTimeout(r, 300)));
