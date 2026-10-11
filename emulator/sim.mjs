import { CPU, avrInstruction, AVRTimer, timer0Config, timer1Config, timer2Config,
         AVRIOPort, portBConfig, portDConfig, AVRUSART, usart0Config } from 'avr8js';

export function loadHex(text) {
  const prog = new Uint8Array(0x8000);
  for (const line of text.split('\n')) {
    if (line[0] !== ':' || line.substr(7, 2) !== '00') continue;
    const n = parseInt(line.substr(1, 2), 16), addr = parseInt(line.substr(3, 4), 16);
    for (let i = 0; i < n; i++) prog[addr + i] = parseInt(line.substr(9 + i * 2, 2), 16);
  }
  return new Uint16Array(prog.buffer);
}

const MHZ = 16;
export class Board {
  constructor(hexText) {
    this.cpu = new CPU(loadHex(hexText));
    new AVRTimer(this.cpu, timer0Config); new AVRTimer(this.cpu, timer1Config); new AVRTimer(this.cpu, timer2Config);
    this.portB = new AVRIOPort(this.cpu, portBConfig);
    this.portD = new AVRIOPort(this.cpu, portDConfig);
    this.usart = new AVRUSART(this.cpu, usart0Config, MHZ * 1e6);
    this.serial = ''; this.usart.onByteTransmit = b => { this.serial += String.fromCharCode(b); };
    this.distanceCm = 20; this.switchPressed = false; this.servoAngle = null; this.led = false;
    this.portD.setPin(2, true);   // released switch, pulled up
    this.portD.setPin(6, false);
    let trigHigh = false, riseB1 = 0;
    this.portD.addListener(v => {
      const t = !!(v & 0x80);
      if (trigHigh && !t && this.distanceCm != null) {           // TRIG falling edge -> echo
        const echoUs = this.distanceCm * 2 / 0.0343;
        this.cpu.addClockEvent(() => {
          this.portD.setPin(6, true);
          this.cpu.addClockEvent(() => this.portD.setPin(6, false), Math.round(echoUs * MHZ));
        }, 200 * MHZ);
      }
      trigHigh = t;
    });
    let lastB = 0;
    this.portB.addListener(v => {
      const b1 = !!(v & 0x02), was = !!(lastB & 0x02);
      if (b1 && !was) riseB1 = this.cpu.cycles;
      if (!b1 && was) {                                          // servo pulse width -> angle
        const us = (this.cpu.cycles - riseB1) / MHZ;
        this.servoAngle = Math.round((us - 544) / (2400 - 544) * 180);
      }
      this.led = !!(v & 0x10);
      lastB = v;
    });
  }
  get ms() { return this.cpu.cycles / (MHZ * 1000); }
  run(ms) { const end = this.cpu.cycles + ms * MHZ * 1000; while (this.cpu.cycles < end) { avrInstruction(this.cpu); this.cpu.tick(); } }
  setSwitch(p) { this.switchPressed = p; this.portD.setPin(2, !p); }
  send(ch) { this.usart.writeByte(ch.charCodeAt(0)); }
}
