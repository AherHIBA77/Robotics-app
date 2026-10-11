// Records the emulator in real time (1 video second = 1 emulated second) to MP4 via ffmpeg.
import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
const OUT = process.argv[2], FPS = 30;
// timeline: [startSec, caption, action]; distance moves smoothly between keyframes
const KEYS = [  // [t, distance cm (null = no echo)]
  [0, 20], [3, 20], [6, 4], [10, 4], [11.5, 6], [15, 6], [16.5, 30], [20.5, 30], [21, null], [27, null], [27.5, 3], [34, 3],
  [35.5, 40], [38, 40], [40, 4], [44, 4]];
const CAPS = [
  [0, '1 · Idle: nothing within 5 cm, so the clamp is open'],
  [3, '2 · The cube approaches the sensor…'],
  [6, '3 · 3 pings < 5 cm in a row → CLAMP CLOSED, LED on'],
  [10, '4 · 6 cm: inside the 5–7 cm hysteresis band, so it stays closed'],
  [15, '5 · Cube taken away: after 1 s past 7 cm the clamp opens'],
  [20.5, '6 · Sonar sees nothing (blind zone)…'],
  [22, '7 · …microswitch pressed → clamp closes anyway (20 ms debounce)'],
  [26, '8 · Switch released, cube still in the jaws at 3 cm: stays closed'],
  [29.5, "9 · At Point B: type 'r' → clamp releases and stays open"],
  [35, '10 · Cube removed → re-armed'],
  [39, '11 · Next cube arrives → closes again'],
];
const SWITCH = [[22, true], [26, false]], SEND = [[29.5, 'r']];
const END = 44;
const dist = t => {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [ta, da] = KEYS[i], [tb, db] = KEYS[i + 1];
    if (t >= ta && t < tb) { if (da == null || db == null) return da; const k = (t - ta) / (tb - ta), e = k * k * (3 - 2 * k); return da + (db - da) * e; }
  }
  return KEYS.at(-1)[1];
};
const cap = t => CAPS.filter(c => c[0] <= t).at(-1)[1];

const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 900 });
await p.goto('file://' + process.cwd() + '/index.html'); await p.evaluate(() => window.ready); await p.evaluate(() => window.videoMode());
let sent = 0, sw = 0, rxShow = 0;
for (let f = 0; f < END * FPS; f++) {
  const t = f / FPS;
  const ev = { d: dist(t), cap: cap(t), sw: null, send: null };
  while (sw < SWITCH.length && SWITCH[sw][0] <= t) ev.sw = SWITCH[sw++][1];
  if (sent < SEND.length && SEND[sent][0] <= t) { ev.send = SEND[sent++][1]; rxShow = t; }
  ev.rx = t - rxShow < 2.5 && rxShow ? "Serial in: 'r'" : '';
  await p.evaluate((ev, dt) => {
    const B = window.board; B.distanceCm = ev.d;
    if (ev.sw !== null) B.setSwitch(ev.sw);
    if (ev.send) B.send(ev.send);
    B.run(dt); window.render(); window.overlay(ev.cap, ev.rx);
  }, ev, 1000 / FPS);
  ff.stdin.write(await p.screenshot({ type: 'jpeg', quality: 92 }));
  if (f % 150 === 0) process.stdout.write(`${t.toFixed(0)}s `);
}
ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close(); console.log('\ndone', OUT);
