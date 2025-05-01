/**
 * Renderers module for creating and managing WebGPU render pipelines
 */

import { 
  particleShader, 
  blurShader, 
  compositeShader, 
  directRenderShader 
} from './shaders.js';

export function createBindGroupLayouts(device) {
  // Main particle system bind group layout
  const particleBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' }
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' }
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {}
      },
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {}
      }
    ],
  });

  // Bloom-related bind group layout
  const bloomBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {}
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {}
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' }
      }
    ]
  });

  // Composite bind group layout
  const compositeBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {}
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {}
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {}
      },
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' }
      }
    ]
  });

  return { 
    particleBindGroupLayout, 
    bloomBindGroupLayout, 
    compositeBindGroupLayout 
  };
}

export function createRenderPipelines(device, format, layouts) {
  const {
    particleBindGroupLayout,
    bloomBindGroupLayout,
    compositeBindGroupLayout
  } = layouts;

  // Create pipeline layouts
  const particlePipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [particleBindGroupLayout],
  });

  const blurPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bloomBindGroupLayout]
  });

  const compositePipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [compositeBindGroupLayout]
  });

  // Create shader modules
  const particleShaderModule = device.createShaderModule({
    code: particleShader
  });

  const blurShaderModule = device.createShaderModule({
    code: blurShader
  });

  const compositeShaderModule = device.createShaderModule({
    code: compositeShader
  });

  const directRenderShaderModule = device.createShaderModule({
    code: directRenderShader
  });

  // Create particle render pipeline
  const particlePipeline = device.createRenderPipeline({
    layout: particlePipelineLayout,
    vertex: {
      module: particleShaderModule,
      entryPoint: 'vs_main',
      buffers: [
        {
          arrayStride: 3 * 4,
          stepMode: 'vertex',
          attributes: [
            {
              shaderLocation: 0,
              offset: 0,
              format: 'float32x3',
            }
          ],
        },
        {
          arrayStride: 8 * 4,
          stepMode: 'instance',
          attributes: [
            {
              shaderLocation: 1,
              offset: 0,
              format: 'float32x3',
            },
            {
              shaderLocation: 2,
              offset: 3 * 4,
              format: 'float32x3',
            },
            {
              shaderLocation: 3,
              offset: 6 * 4,
              format: 'float32x2',
            }
          ],
        }
      ],
    },
    fragment: {
      module: particleShaderModule,
      entryPoint: 'fs_main',
      targets: [{
        format: format,
        blend: {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one',
            operation: 'add',
          },
        },
      }],
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'none',
    },
    depthStencil: {
      depthWriteEnabled: false,
      depthCompare: 'less',
      format: 'depth24plus',
    },
  });

  // Create blur pipeline
  const blurPipeline = device.createRenderPipeline({
    layout: blurPipelineLayout,
    vertex: {
      module: blurShaderModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: blurShaderModule,
      entryPoint: 'fs_main',
      targets: [{
        format: format,
      }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  // Create composite pipeline
  const compositePipeline = device.createRenderPipeline({
    layout: compositePipelineLayout,
    vertex: {
      module: compositeShaderModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: compositeShaderModule,
      entryPoint: 'fs_main',
      targets: [{
        format: format,
        blend: {
          color: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
        },
      }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  // Create direct render pipeline
  const directRenderPipeline = device.createRenderPipeline({
    layout: compositePipelineLayout,
    vertex: {
      module: directRenderShaderModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: directRenderShaderModule,
      entryPoint: 'fs_main',
      targets: [{
        format: format,
        blend: {
          color: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
        },
      }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  return {
    particlePipeline,
    blurPipeline,
    compositePipeline,
    directRenderPipeline
  };
}

export function createBindGroups(device, sampler, buffers, textures) {
  const { 
    uniformBuffer, 
    appearanceUniformBuffer, 
    horizontalBlurUniformBuffer,
    verticalBlurUniformBuffer, 
    bloomIntensityBuffer 
  } = buffers;
  
  const { 
    sceneTexture, 
    bloomTexA, 
    bloomTexB 
  } = textures;

  // Create main particle bind group
  const particleBindGroup = device.createBindGroup({
    layout: device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' }
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' }
        }
      ],
    }),
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
      {
        binding: 1,
        resource: { buffer: appearanceUniformBuffer },
      }
    ],
  });

  // Create horizontal blur bind group
  const horizontalBlurBindGroup = device.createBindGroup({
    layout: device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {}
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {}
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' }
        }
      ]
    }),
    entries: [
      {
        binding: 0,
        resource: sampler,
      },
      {
        binding: 1,
        resource: sceneTexture.createView(),
      },
      {
        binding: 2,
        resource: { buffer: horizontalBlurUniformBuffer },
      }
    ],
  });

  // Create vertical blur bind group
  const verticalBlurBindGroup = device.createBindGroup({
    layout: device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {}
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {}
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' }
        }
      ]
    }),
    entries: [
      {
        binding: 0,
        resource: sampler,
      },
      {
        binding: 1,
        resource: bloomTexA.createView(),
      },
      {
        binding: 2,
        resource: { buffer: verticalBlurUniformBuffer },
      }
    ],
  });

  // Create composite bind group
  const compositeBindGroup = device.createBindGroup({
    layout: device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {}
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {}
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {}
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' }
        }
      ]
    }),
    entries: [
      {
        binding: 0,
        resource: sampler,
      },
      {
        binding: 1,
        resource: sceneTexture.createView(),
      },
      {
        binding: 2,
        resource: bloomTexB.createView(),
      },
      {
        binding: 3,
        resource: { buffer: bloomIntensityBuffer },
      }
    ],
  });

  // Direct render bind group
  const directRenderBindGroup = device.createBindGroup({
    layout: device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {}
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {}
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {}
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' }
        }
      ]
    }),
    entries: [
      {
        binding: 0,
        resource: sampler,
      },
      {
        binding: 1,
        resource: sceneTexture.createView(),
      },
      {
        binding: 2,
        resource: bloomTexB.createView(),
      },
      {
        binding: 3,
        resource: { buffer: bloomIntensityBuffer },
      }
    ],
  });

  return {
    particleBindGroup,
    horizontalBlurBindGroup,
    verticalBlurBindGroup,
    compositeBindGroup,
    directRenderBindGroup
  };
}

export function createSampler(device) {
  return device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    maxAnisotropy: 16
  });
}