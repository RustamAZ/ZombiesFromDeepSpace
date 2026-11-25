import { Color3, Vector3 } from '@babylonjs/core';

export type VoxVoxel = {
  x: number;
  y: number;
  z: number;
  colorIndex: number;
};

export type ParsedVoxModel = {
  size: Vector3;
  voxels: VoxVoxel[];
  palette: Color3[];
};

type VoxTransformNode = {
  type: 'transform';
  childId: number;
  frame: Record<string, string>;
};

type VoxGroupNode = {
  type: 'group';
  childIds: number[];
};

type VoxShapeNode = {
  type: 'shape';
  modelIds: number[];
};

type VoxSceneNode = VoxTransformNode | VoxGroupNode | VoxShapeNode;

type IntegerTransform = {
  rotation: number[][];
  translation: number[];
};

export const defaultVoxPalette = Array.from({ length: 256 }, (_, index) => {
  const shade = index / 255;

  return new Color3(shade, shade, shade);
});

const identityTransform = (): IntegerTransform => ({
  rotation: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ],
  translation: [0, 0, 0]
});

export function parseVox(buffer: ArrayBuffer): ParsedVoxModel {
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const models: ParsedVoxModel[] = [];
  const sceneNodes = new Map<number, VoxSceneNode>();
  let pendingSize = new Vector3(1, 1, 1);
  let palette = defaultVoxPalette;
  let offset = 0;

  const readId = (): string => {
    const id = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );

    offset += 4;
    return id;
  };
  const readInt = (): number => {
    const value = view.getInt32(offset, true);

    offset += 4;
    return value;
  };
  const readString = (): string => {
    const length = readInt();
    const value = decoder.decode(new Uint8Array(buffer, offset, length));

    offset += length;
    return value;
  };
  const readDictionary = (): Record<string, string> => {
    const values: Record<string, string> = {};
    const count = readInt();

    for (let index = 0; index < count; index += 1) {
      values[readString()] = readString();
    }

    return values;
  };

  if (readId() !== 'VOX ') {
    throw new Error('Invalid VOX file.');
  }

  offset += 4;

  const readChunks = (endOffset: number): void => {
    while (offset < endOffset) {
      const id = readId();
      const contentSize = readInt();
      const childrenSize = readInt();
      const contentStart = offset;

      if (id === 'SIZE') {
        pendingSize = new Vector3(readInt(), readInt(), readInt());
      } else if (id === 'XYZI') {
        const count = readInt();
        const voxels: VoxVoxel[] = [];

        for (let index = 0; index < count; index += 1) {
          voxels.push({
            x: view.getUint8(offset),
            y: view.getUint8(offset + 1),
            z: view.getUint8(offset + 2),
            colorIndex: view.getUint8(offset + 3) - 1
          });
          offset += 4;
        }

        models.push({ size: pendingSize.clone(), voxels, palette });
      } else if (id === 'RGBA') {
        palette = [];

        for (let index = 0; index < 256; index += 1) {
          palette.push(new Color3(
            view.getUint8(offset) / 255,
            view.getUint8(offset + 1) / 255,
            view.getUint8(offset + 2) / 255
          ));
          offset += 4;
        }
      } else if (id === 'nTRN') {
        const nodeId = readInt();

        readDictionary();
        const childId = readInt();
        readInt();
        readInt();
        const frameCount = readInt();
        let frame: Record<string, string> = {};

        for (let index = 0; index < frameCount; index += 1) {
          const currentFrame = readDictionary();

          if (index === 0) {
            frame = currentFrame;
          }
        }

        sceneNodes.set(nodeId, { type: 'transform', childId, frame });
      } else if (id === 'nGRP') {
        const nodeId = readInt();

        readDictionary();
        const childCount = readInt();
        const childIds = Array.from({ length: childCount }, () => readInt());

        sceneNodes.set(nodeId, { type: 'group', childIds });
      } else if (id === 'nSHP') {
        const nodeId = readInt();

        readDictionary();
        const modelCount = readInt();
        const modelIds: number[] = [];

        for (let index = 0; index < modelCount; index += 1) {
          modelIds.push(readInt());
          readDictionary();
        }

        sceneNodes.set(nodeId, { type: 'shape', modelIds });
      }

      offset = contentStart + contentSize;

      if (childrenSize > 0) {
        readChunks(offset + childrenSize);
      }
    }
  };

  readChunks(buffer.byteLength);

  for (const model of models) {
    model.palette = palette;
  }

  if (models.length === 0) {
    return { size: Vector3.One(), voxels: [], palette };
  }

  if (sceneNodes.size === 0) {
    const model = models[models.length - 1];

    return { ...model, palette };
  }

  return flattenScene(models, sceneNodes, palette);
}

function flattenScene(
  models: ParsedVoxModel[],
  sceneNodes: Map<number, VoxSceneNode>,
  palette: Color3[]
): ParsedVoxModel {
  const referencedNodes = new Set<number>();
  const transformedVoxels: VoxVoxel[] = [];

  for (const node of sceneNodes.values()) {
    if (node.type === 'transform') {
      referencedNodes.add(node.childId);
    } else if (node.type === 'group') {
      node.childIds.forEach((childId) => referencedNodes.add(childId));
    }
  }

  const rootIds = [...sceneNodes.keys()].filter((nodeId) => !referencedNodes.has(nodeId));
  const visit = (nodeId: number, parentTransform: IntegerTransform): void => {
    const node = sceneNodes.get(nodeId);

    if (!node) {
      return;
    }

    if (node.type === 'transform') {
      visit(node.childId, combineTransforms(parentTransform, parseTransform(node.frame)));
      return;
    }

    if (node.type === 'group') {
      node.childIds.forEach((childId) => visit(childId, parentTransform));
      return;
    }

    for (const modelId of node.modelIds) {
      const model = models[modelId];

      if (!model) {
        continue;
      }

      const center = [
        Math.floor(model.size.x * 0.5),
        Math.floor(model.size.y * 0.5),
        Math.floor(model.size.z * 0.5)
      ];

      for (const voxel of model.voxels) {
        const transformed = applyTransform(parentTransform, [
          voxel.x - center[0],
          voxel.y - center[1],
          voxel.z - center[2]
        ]);

        transformedVoxels.push({
          x: transformed[0],
          y: transformed[1],
          z: transformed[2],
          colorIndex: voxel.colorIndex
        });
      }
    }
  };

  rootIds.forEach((rootId) => visit(rootId, identityTransform()));

  if (transformedVoxels.length === 0) {
    return { ...models[models.length - 1], palette };
  }

  const minimum = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const maximum = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];

  for (const voxel of transformedVoxels) {
    minimum[0] = Math.min(minimum[0], voxel.x);
    minimum[1] = Math.min(minimum[1], voxel.y);
    minimum[2] = Math.min(minimum[2], voxel.z);
    maximum[0] = Math.max(maximum[0], voxel.x);
    maximum[1] = Math.max(maximum[1], voxel.y);
    maximum[2] = Math.max(maximum[2], voxel.z);
  }

  const uniqueVoxels = new Map<string, VoxVoxel>();

  for (const voxel of transformedVoxels) {
    const normalized = {
      x: Math.round(voxel.x - minimum[0]),
      y: Math.round(voxel.y - minimum[1]),
      z: Math.round(voxel.z - minimum[2]),
      colorIndex: voxel.colorIndex
    };

    uniqueVoxels.set(`${normalized.x}:${normalized.y}:${normalized.z}`, normalized);
  }

  return {
    size: new Vector3(
      Math.round(maximum[0] - minimum[0] + 1),
      Math.round(maximum[1] - minimum[1] + 1),
      Math.round(maximum[2] - minimum[2] + 1)
    ),
    voxels: [...uniqueVoxels.values()],
    palette
  };
}

function parseTransform(frame: Record<string, string>): IntegerTransform {
  const translation = (frame._t ?? '0 0 0')
    .split(' ')
    .map((value) => Number.parseInt(value, 10) || 0);
  const encodedRotation = Number.parseInt(frame._r ?? '4', 10);
  const firstAxis = encodedRotation & 0x3;
  const secondAxis = (encodedRotation >> 2) & 0x3;
  const thirdAxis = 3 - firstAxis - secondAxis;
  const rotation = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];

  if (firstAxis > 2 || secondAxis > 2 || thirdAxis > 2 || firstAxis === secondAxis) {
    return { ...identityTransform(), translation };
  }

  rotation[0][firstAxis] = (encodedRotation & 0x10) === 0 ? 1 : -1;
  rotation[1][secondAxis] = (encodedRotation & 0x20) === 0 ? 1 : -1;
  rotation[2][thirdAxis] = (encodedRotation & 0x40) === 0 ? 1 : -1;

  return { rotation, translation };
}

function combineTransforms(parent: IntegerTransform, local: IntegerTransform): IntegerTransform {
  const rotation = Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 3 }, (_, column) =>
      parent.rotation[row][0] * local.rotation[0][column] +
      parent.rotation[row][1] * local.rotation[1][column] +
      parent.rotation[row][2] * local.rotation[2][column]
    )
  );

  return {
    rotation,
    translation: applyTransform(parent, local.translation)
  };
}

function applyTransform(transform: IntegerTransform, point: number[]): number[] {
  return transform.rotation.map((row, index) =>
    Math.round(row[0] * point[0] + row[1] * point[1] + row[2] * point[2] + transform.translation[index])
  );
}
