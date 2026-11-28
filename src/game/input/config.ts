export const inputConfig={
  joystickRadiusPixels:58,
  joystickDeadZone:0.12,
  lookSensitivity:{
    // Desktop 100% equals the former 70%; mobile 100% keeps the former 115% speed.
    baseScale:{desktop:0.7,mobile:1.65*1.15},
    legacyPercentAtMaximum:{desktop:70,mobile:115},
    defaultPercent:{desktop:100,mobile:100},
    ranges:{
      desktop:{min:20,max:100,step:5},
      mobile:{min:20,max:210,step:5}
    }
  }
} as const;
