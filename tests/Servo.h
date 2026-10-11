#pragma once
extern int servoAngle;
struct Servo { void attach(int){} void write(int a){ servoAngle=a; } };
