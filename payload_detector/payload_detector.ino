/*
  AUI Robotics Club - Recruitment Challenge 2026
  Track B - Payload Detector (Electronics)

  When the 30 mm cube comes within 5 cm of the HC-SR04 ultrasonic sensor,
  OR presses the microswitch inside the clamp jaws, the servo turns 90 deg
  to close the clamp and the status LED switches on.

  Board: Arduino Uno (ATmega328P, 5 V logic)

  Pin map
    D2  <- microswitch (other leg to GND), internal pull-up, active LOW
    D6  <- HC-SR04 ECHO
    D7  -> HC-SR04 TRIG
    D9  -> servo signal (orange/yellow wire)
    D12 -> 220 ohm -> LED anode, LED cathode -> GND

  Serial (115200 baud) commands
    r   release: open the clamp and keep it open until the cube is taken away
*/

#include <Servo.h>

// ---------- pins ----------
const uint8_t PIN_SWITCH = 2;
const uint8_t PIN_ECHO   = 6;
const uint8_t PIN_TRIG   = 7;
const uint8_t PIN_SERVO  = 9;
const uint8_t PIN_LED    = 12;

// ---------- tuning ----------
const float    CLOSE_CM        = 5.0;    // detect threshold from the brief
const float    RELEASE_CM      = 7.0;    // hysteresis: object must move past this to count as gone
const uint8_t  CONFIRM_READS   = 3;      // consecutive "near" pings needed before closing
const uint32_t GONE_MS         = 1000;   // object must be gone this long before re-opening
const uint32_t PING_PERIOD_MS  = 60;     // HC-SR04 datasheet: >= 60 ms between pings
const uint32_t ECHO_TIMEOUT_US = 25000;  // ~4.3 m round trip; beyond that = nothing there
const uint32_t DEBOUNCE_MS     = 20;     // mechanical switch bounce settles well under this

const uint8_t SERVO_OPEN_DEG   = 0;
const uint8_t SERVO_CLOSED_DEG = 90;

// ---------- state ----------
enum ClampState { OPEN, CLOSED, RELEASING };
ClampState state = OPEN;

Servo clamp;

float    lastDistanceCm = -1;   // -1 = no echo
uint8_t  nearCount      = 0;
uint32_t lastPingMs     = 0;
uint32_t goneSinceMs    = 0;

bool     switchStable       = false;  // debounced: true = pressed
bool     switchLastRaw      = false;
uint32_t switchChangedMs    = 0;

// ---------- sensors ----------

// One ultrasonic ping. Returns distance in cm, or -1 if no echo came back.
float readDistanceCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);       // 10 us pulse starts a measurement
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  uint32_t us = pulseIn(PIN_ECHO, HIGH, ECHO_TIMEOUT_US);
  if (us == 0) return -1;
  // sound: 343 m/s = 0.0343 cm/us, and the echo travels there AND back
  return us * 0.0343 / 2.0;           // ~ us / 58
}

// Debounced microswitch. INPUT_PULLUP means: released = HIGH, pressed = LOW.
void updateSwitch() {
  bool raw = (digitalRead(PIN_SWITCH) == LOW);
  uint32_t now = millis();
  if (raw != switchLastRaw) {
    switchLastRaw = raw;
    switchChangedMs = now;
  } else if (raw != switchStable && now - switchChangedMs >= DEBOUNCE_MS) {
    switchStable = raw;
    Serial.println(switchStable ? F("switch: pressed") : F("switch: released"));
  }
}

// ---------- actuators ----------

void closeClamp(const __FlashStringHelper *why) {
  clamp.write(SERVO_CLOSED_DEG);
  digitalWrite(PIN_LED, HIGH);
  state = CLOSED;
  goneSinceMs = millis();
  Serial.print(F(">> CLAMP CLOSED  (")); Serial.print(why); Serial.println(')');
}

void openClamp(ClampState next) {
  clamp.write(SERVO_OPEN_DEG);
  digitalWrite(PIN_LED, LOW);
  state = next;
  goneSinceMs = millis();
  Serial.println(next == RELEASING ? F(">> CLAMP RELEASED (waiting for cube to be removed)")
                                   : F(">> CLAMP OPEN"));
}

// ---------- main ----------

void setup() {
  Serial.begin(115200);

  pinMode(PIN_SWITCH, INPUT_PULLUP);   // no external resistor needed
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_TRIG, LOW);
  digitalWrite(PIN_LED, LOW);

  clamp.attach(PIN_SERVO);
  clamp.write(SERVO_OPEN_DEG);         // known starting position

  Serial.println(F("Payload detector ready. Send 'r' to release."));
}

void loop() {
  uint32_t now = millis();

  updateSwitch();

  if (Serial.available()) {
    char c = Serial.read();
    if ((c == 'r' || c == 'R') && state == CLOSED) openClamp(RELEASING);
  }

  if (now - lastPingMs >= PING_PERIOD_MS) {
    lastPingMs = now;
    lastDistanceCm = readDistanceCm();

    bool echoNear = lastDistanceCm > 0 && lastDistanceCm <= CLOSE_CM;
    if (!echoNear)            nearCount = 0;
    else if (nearCount < 255) nearCount++;

    Serial.print(F("dist: "));
    if (lastDistanceCm < 0) Serial.print(F("--"));
    else                    Serial.print(lastDistanceCm, 1);
    Serial.println(F(" cm"));
  }

  // "Present" uses the wider release threshold so the clamp doesn't chatter
  // when the cube sits right at 5 cm.
  bool echoPresent = lastDistanceCm > 0 && lastDistanceCm <= RELEASE_CM;
  bool present = echoPresent || switchStable;

  now = millis();  // the ping above can block up to 25 ms; keep timers consistent

  switch (state) {
    case OPEN:
      if (switchStable)                     closeClamp(F("microswitch"));
      else if (nearCount >= CONFIRM_READS)  closeClamp(F("ultrasonic < 5 cm"));
      break;

    case CLOSED:
    case RELEASING:
      if (present) {
        goneSinceMs = now;
      } else if (now - goneSinceMs >= GONE_MS) {
        if (state == CLOSED) openClamp(OPEN);
        else { state = OPEN; Serial.println(F(">> cube removed, armed again")); }
        nearCount = 0;
      }
      break;
  }
}
