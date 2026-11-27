export const inputConfig={
  joystickRadiusPixels:58,
  joystickDeadZone:0.12,
  lookSensitivity:{
    // The former 70% mouse and 115% touch speeds are now the top of each scale.
    baseScale:{desktop:0.7,mobile:1.65*1.15},
    legacyPercentAtMaximum:{desktop:70,mobile:115},
    defaultPercent:{desktop:100,mobile:100},
    min:20,max:100,step:5
  }
} as const;
