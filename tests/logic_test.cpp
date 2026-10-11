#include <cstdint>
#include <cstdio>
#include <string>
typedef uint8_t byte;
#define F(x) x
#define __FlashStringHelper char
#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
uint32_t T=0; float simDist=-1; bool simSwitch=false; int led=0; int servoAngle=-1; std::string rx;
uint32_t millis(){ return T; }
void delayMicroseconds(int){}
void pinMode(int,int){}
void digitalWrite(int p,int v){ if(p==12) led=v; }
int digitalRead(int p){ return p==2 ? (simSwitch?LOW:HIGH) : LOW; }
uint32_t pulseIn(int,int,uint32_t){ T+=5; return simDist<0?0:(uint32_t)(simDist*2/0.0343); }
struct S_{ void begin(int){} int available(){return rx.size();} char read(){char c=rx[0];rx.erase(0,1);return c;}
 template<class X> void print(X){} void print(float,int){} template<class X> void println(X){} void println(){} } Serial;
#include "../payload_detector/payload_detector.ino"
void run(uint32_t ms){ uint32_t end=T+ms; while(T<end){ loop(); T+=1; } }
int fails=0;
void check(const char*n,bool c){ printf("%s %s (servo=%d led=%d)\n", c?"PASS":"FAIL", n, servoAngle, led); if(!c) fails++; }
int main(){
  setup(); simDist=20; run(500); check("far: open", servoAngle==0 && !led);
  simDist=4; run(100); check("single near ping not enough", servoAngle==0);
  run(300); check("cube at 4cm: closed + LED", servoAngle==90 && led);
  simDist=6; run(2000); check("6cm (hysteresis band): stays closed", servoAngle==90);
  simDist=30; run(500); check("removed <1s: still closed", servoAngle==90);
  run(800); check("removed >1s: opens", servoAngle==0 && !led);
  simDist=-1; simSwitch=true; run(10); check("switch bounce window: not yet", servoAngle==0);
  run(50); check("microswitch closes clamp (no echo)", servoAngle==90 && led);
  simSwitch=false; simDist=3; run(500); rx="r"; run(100); check("'r' releases", servoAngle==0 && !led);
  run(3000); check("cube still there after release: stays open", servoAngle==0);
  simDist=40; run(1500); simDist=3; run(400); check("removed then returned: re-arms and closes", servoAngle==90);
  printf(fails? "%d FAILED\n":"ALL PASS\n", fails); return fails;
}
