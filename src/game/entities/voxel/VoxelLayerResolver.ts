import type { VoxelMaterialType } from './VoxelImpact';

export type VoxelLayerRule = {
  name: string;
  minDepth01: number;
  maxDepth01: number;
  destructible: boolean;
  breakSpeedRatio: number;
  scatterMultiplier: number;
  inertiaMultiplier: number;
};

const normalCoreStartDepth = 0.7;
const hardCoreStartDepth = 0.3;

const layerProfiles: Record<VoxelMaterialType, VoxelLayerRule[]> = {
  soft: [
    {
      name: 'crumbly-body',
      minDepth01: 0,
      maxDepth01: 1,
      destructible: true,
      breakSpeedRatio: 0.03,
      scatterMultiplier: 0.58,
      inertiaMultiplier: 0.42
    }
  ],
  normal: [
    {
      name: 'outer-shell',
      minDepth01: 0,
      maxDepth01: normalCoreStartDepth,
      destructible: true,
      breakSpeedRatio: 0.6,
      scatterMultiplier: 1,
      inertiaMultiplier: 0.78
    },
    {
      name: 'inner-core',
      minDepth01: normalCoreStartDepth,
      maxDepth01: 1,
      destructible: false,
      breakSpeedRatio: 1,
      scatterMultiplier: 0,
      inertiaMultiplier: 0
    }
  ],
  hard: [
    {
      name: 'outer-hard-shell',
      minDepth01: 0,
      maxDepth01: hardCoreStartDepth,
      destructible: true,
      breakSpeedRatio: 0.8,
      scatterMultiplier: 1,
      inertiaMultiplier: 0.85
    },
    {
      name: 'hard-core',
      minDepth01: hardCoreStartDepth,
      maxDepth01: 1,
      destructible: false,
      breakSpeedRatio: 1,
      scatterMultiplier: 0,
      inertiaMultiplier: 0
    }
  ]
};

export class VoxelLayerResolver {
  getLayer(material: VoxelMaterialType, depth01: number): VoxelLayerRule {
    const clampedDepth = this.clamp(depth01, 0, 1);
    const layers = layerProfiles[material];

    return layers.find((layer, index) =>
      clampedDepth >= layer.minDepth01 &&
      (index === layers.length - 1 ? clampedDepth <= layer.maxDepth01 : clampedDepth < layer.maxDepth01)
    ) ?? layers[layers.length - 1];
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
