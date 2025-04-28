import "./style.css";
import { initWebGPU, createRenderTextures, createDepthTexture, createBuffer } from "./modules/webgpu.js";
import { ParticleSystem } from "./modules/particleSystem.js";
import { createBindGroupLayouts, createRenderPipelines, createBindGroups, createSampler } from "./modules/renderers.js";
import { createLookAtMatrix, createProjectionMatrix, multiplyMatrices, hexToRgb } from "./modules/utils.js";
import { ParticleUI, setupCameraControls } from "./modules/ui.js";

async function main() {
  // Initialize WebGPU
  const { device, context, format, canvas } = await initWebGPU();
  
  // Initialize configuration state
  const config = {
    // Camera control settings
    cameraRotationX: 0,
    cameraRotationY: 0,
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
    rotationSpeed: 0.01,
    cameraDistance: 10.0,
    minZoom: 3.0,
    maxZoom: 20.0,
    
    // Particle settings
    maxParticles: 10000,
    particleCount: 100,
    lifetime: 5,
    emissionRate: 10,
    emissionDuration: 10,
    emissionShape: 'cube',
    cubeLength: 2.0,
    innerRadius: 0.0,
    outerRadius: 2.0,
    particleSize: 0.5,
    particleSpeed: 1.0,
    
    // Appearance settings
    fadeEnabled: true,
    colorTransitionEnabled: false,
    particleColor: hexToRgb('#ffffff'),
    startColor: hexToRgb('#ff0000'),
    endColor: hexToRgb('#0000ff'),
    
    // Bloom settings
    bloomEnabled: true,
    bloomIntensity: 1.0,
    
    // Mode settings
    burstMode: false,
    
    // Callback methods for UI interactions
    onAppearanceChange: updateAppearanceUniform,
    onColorChange: updateParticleColors,
    onSizeChange: updateQuadGeometry,
    onSpeedChange: updateParticleVelocities,
    onBloomIntensityChange: updateBloomIntensity,
    onRespawn: spawnParticles
  };
  
  // Set up UI elements
  const ui = new ParticleUI(config);
  
  // Set up camera controls
  setupCameraControls(canvas, config);
  
  // Create render textures
  let { sceneTexture, bloomTexA, bloomTexB } = createRenderTextures(device, format, canvas.width, canvas.height);
  
  // Create depth texture
  let depthTexture = createDepthTexture(device, canvas.width, canvas.height);
  
  // Create quad geometry for billboards
  const quadVertices = new Float32Array([
    -config.particleSize, -config.particleSize, 0,
    config.particleSize, -config.particleSize, 0,
    config.particleSize, config.particleSize, 0,
    -config.particleSize, config.particleSize, 0
  ]);
  
  const quadIndices = new Uint16Array([
    0, 1, 2,
    2, 3, 0
  ]);
  
  // Create buffers
  const quadVertexBuffer = createBuffer(
    device, 
    quadVertices, 
    GPUBufferUsage.VERTEX
  );
  
  const quadIndexBuffer = createBuffer(
    device, 
    quadIndices, 
    GPUBufferUsage.INDEX
  );
  
  const uniformBuffer = device.createBuffer({
    size: 80, // MVP matrix + camera position + aspect
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  
  const appearanceUniformBuffer = device.createBuffer({
    size: 64, // [fadeEnabled, colorTransitionEnabled, particleSize, padding, colors...]
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  
  // Create bloom-related buffers
  const horizontalBlurUniformBuffer = device.createBuffer({
    size: 32, // direction (vec2) + resolution (vec2) + padding
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  
  const verticalBlurUniformBuffer = device.createBuffer({
    size: 32, // direction (vec2) + resolution (vec2) + padding
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  
  const bloomIntensityBuffer = device.createBuffer({
    size: 64, // intensity (f32) + padding
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  
  // Initialize buffer data
  const horizontalDirection = new Float32Array([1.0, 0.0, canvas.width, canvas.height, 0.0, 0.0, 0.0, 0.0]);
  const verticalDirection = new Float32Array([0.0, 1.0, canvas.width, canvas.height, 0.0, 0.0, 0.0, 0.0]);
  const bloomIntensityData = new Float32Array(16).fill(0);
  bloomIntensityData[0] = config.bloomIntensity;
  
  device.queue.writeBuffer(horizontalBlurUniformBuffer, 0, horizontalDirection);
  device.queue.writeBuffer(verticalBlurUniformBuffer, 0, verticalDirection);
  device.queue.writeBuffer(bloomIntensityBuffer, 0, bloomIntensityData);
  
  // Create high-quality sampler
  const sampler = createSampler(device);
  
  // Create bind group layouts
  const layouts = createBindGroupLayouts(device);
  
  // Create render pipelines
  const {
    particlePipeline,
    blurPipeline,
    compositePipeline,
    directRenderPipeline
  } = createRenderPipelines(device, format, layouts);
  
  // Create particle system
  const particleSystem = new ParticleSystem(device, config);
  
  // Create bind groups
  const buffers = {
    uniformBuffer,
    appearanceUniformBuffer,
    horizontalBlurUniformBuffer,
    verticalBlurUniformBuffer,
    bloomIntensityBuffer
  };
  
  const textures = {
    sceneTexture,
    bloomTexA,
    bloomTexB
  };
  
  let bindGroups = createBindGroups(device, sampler, buffers, textures);
  
  // Initialize appearance uniform buffer
  updateAppearanceUniform();
  
  // Resize handler for window resizing
  window.addEventListener('resize', resizeCanvasToDisplaySize);
  
  // Initialize particles and start animation
  spawnParticles();
  let lastTime = performance.now();
  requestAnimationFrame(frame);
  
  // Animation loop
  function frame(currentTime) {
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    // Update particle state
    particleSystem.updateParticles(deltaTime);
    
    const aspect = canvas.height / canvas.width;
    const projectionMatrix = createProjectionMatrix(aspect);
    
    // Calculate camera position
    const cameraX = config.cameraDistance * Math.sin(config.cameraRotationY) * Math.cos(config.cameraRotationX);
    const cameraY = config.cameraDistance * Math.sin(config.cameraRotationX);
    const cameraZ = config.cameraDistance * Math.cos(config.cameraRotationY) * Math.cos(config.cameraRotationX);
    
    const cameraPos = [cameraX, cameraY, cameraZ];
    
    // Create view matrix
    const viewMatrix = createLookAtMatrix(
      cameraPos,
      [0, 0, 0],
      [0, 1, 0]
    );
    
    // Create MVP matrix
    const mvpMatrix = multiplyMatrices(projectionMatrix, viewMatrix);
    
    // Update uniform buffer
    device.queue.writeBuffer(uniformBuffer, 0, mvpMatrix);
    device.queue.writeBuffer(uniformBuffer, 64, new Float32Array([cameraX, cameraY, cameraZ, aspect]));
    
    // Render frame
    const commandEncoder = device.createCommandEncoder();
    
    // 1. First render ONLY the particles to a texture (no background)
    const sceneRenderPassDescriptor = {
      colorAttachments: [{
        view: sceneTexture.createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
      }],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    };
    
    // Render particles to scene texture with transparency
    const scenePassEncoder = commandEncoder.beginRenderPass(sceneRenderPassDescriptor);
    scenePassEncoder.setPipeline(particlePipeline);
    scenePassEncoder.setBindGroup(0, bindGroups.particleBindGroup);
    
    scenePassEncoder.setVertexBuffer(0, quadVertexBuffer);
    scenePassEncoder.setVertexBuffer(1, particleSystem.instanceBuffer);
    scenePassEncoder.setIndexBuffer(quadIndexBuffer, 'uint16');
    
    if (particleSystem.activeParticles > 0) {
      scenePassEncoder.drawIndexed(6, particleSystem.activeParticles);
    }
    
    scenePassEncoder.end();
    
    if (config.bloomEnabled) {
      // Apply multiple blur passes for higher quality bloom
      // First ping-pong between textures for multiple passes
      for (let i = 0; i < 3; i++) {
        // 2. Apply horizontal blur from scene texture (or bloomTexB in subsequent passes) to bloomTexA
        const horizontalBlurPassDescriptor = {
          colorAttachments: [{
            view: bloomTexA.createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
          }],
        };
        
        const horizontalBlurPassEncoder = commandEncoder.beginRenderPass(horizontalBlurPassDescriptor);
        horizontalBlurPassEncoder.setPipeline(blurPipeline);
        
        // On first pass, use scene texture as input; otherwise use result of previous vertical pass
        const horizontalBindGroup = i === 0 ? bindGroups.horizontalBlurBindGroup : 
          device.createBindGroup({
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
              { binding: 0, resource: sampler },
              { binding: 1, resource: bloomTexB.createView() },
              { binding: 2, resource: { buffer: horizontalBlurUniformBuffer } }
            ],
          });
        
        horizontalBlurPassEncoder.setBindGroup(0, horizontalBindGroup);
        horizontalBlurPassEncoder.draw(3);
        horizontalBlurPassEncoder.end();
        
        // 3. Apply vertical blur from bloomTexA to bloomTexB
        const verticalBlurPassDescriptor = {
          colorAttachments: [{
            view: bloomTexB.createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
          }],
        };
        
        const verticalBlurPassEncoder = commandEncoder.beginRenderPass(verticalBlurPassDescriptor);
        verticalBlurPassEncoder.setPipeline(blurPipeline);
        verticalBlurPassEncoder.setBindGroup(0, bindGroups.verticalBlurBindGroup);
        verticalBlurPassEncoder.draw(3);
        verticalBlurPassEncoder.end();
      }
    }
    
    // 4. Final composite pass - blend the particles onto a solid background (with or without bloom)
    const compositePassDescriptor = {
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0.1, g: 0.2, b: 0.3, a: 1.0 }, // Background color
      }],
    };
    
    const compositePassEncoder = commandEncoder.beginRenderPass(compositePassDescriptor);
    
    if (config.bloomEnabled) {
      // If bloom is enabled, use the composite pipeline to blend original and blurred textures
      compositePassEncoder.setPipeline(compositePipeline);
      compositePassEncoder.setBindGroup(0, bindGroups.compositeBindGroup);
    } else {
      // If bloom is disabled, render the scene directly to the canvas
      compositePassEncoder.setPipeline(directRenderPipeline);
      compositePassEncoder.setBindGroup(0, bindGroups.directRenderBindGroup);
    }
    
    compositePassEncoder.draw(3);
    compositePassEncoder.end();
    
    device.queue.submit([commandEncoder.finish()]);
    
    requestAnimationFrame(frame);
  }
  
  // Function to handle window resize
  function resizeCanvasToDisplaySize() {
    // Store old textures
    const oldSceneTexture = sceneTexture;
    const oldBloomTexA = bloomTexA;
    const oldBloomTexB = bloomTexB;
    const oldDepthTexture = depthTexture;
    
    // Update canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Create new textures with updated size
    const newTextures = createRenderTextures(device, format, canvas.width, canvas.height);
    sceneTexture = newTextures.sceneTexture;
    bloomTexA = newTextures.bloomTexA;
    bloomTexB = newTextures.bloomTexB;
    
    depthTexture = createDepthTexture(device, canvas.width, canvas.height);
    
    // Update the blur uniforms with new resolution values
    const horizontalDirection = new Float32Array([1.0, 0.0, canvas.width, canvas.height, 0.0, 0.0, 0.0, 0.0]);
    const verticalDirection = new Float32Array([0.0, 1.0, canvas.width, canvas.height, 0.0, 0.0, 0.0, 0.0]);
    device.queue.writeBuffer(horizontalBlurUniformBuffer, 0, horizontalDirection);
    device.queue.writeBuffer(verticalBlurUniformBuffer, 0, verticalDirection);
    
    // Recreate bind groups with the new textures
    const textures = {
      sceneTexture,
      bloomTexA,
      bloomTexB
    };
    
    bindGroups = createBindGroups(device, sampler, buffers, textures);
    
    // Schedule the old textures for destruction after the current frame completes
    requestAnimationFrame(() => {
      oldSceneTexture.destroy();
      oldBloomTexA.destroy();
      oldBloomTexB.destroy();
      oldDepthTexture.destroy();
    });
  }
  
  // Function to update quad geometry with new size
  function updateQuadGeometry(size) {
    const newQuadVertices = new Float32Array([
      -size, -size, 0,
      size, -size, 0,
      size, size, 0,
      -size, size, 0
    ]);
    
    device.queue.writeBuffer(quadVertexBuffer, 0, newQuadVertices);
  }
  
  // Function to update appearance settings in the uniform buffer
  function updateAppearanceUniform() {
    const appearanceData = new Float32Array([
      config.fadeEnabled ? 1.0 : 0.0,
      config.colorTransitionEnabled ? 1.0 : 0.0,
      config.particleSize,
      0.0, // padding
      // Single color (vec3 + padding)
      config.particleColor[0], config.particleColor[1], config.particleColor[2], 0.0,
      // Start color (vec3 + padding)
      config.startColor[0], config.startColor[1], config.startColor[2], 0.0,
      // End color (vec3 + padding)
      config.endColor[0], config.endColor[1], config.endColor[2], 0.0
    ]);
    
    device.queue.writeBuffer(appearanceUniformBuffer, 0, appearanceData);
  }
  
  // Function to update bloom intensity
  function updateBloomIntensity() {
    const bloomIntensityData = new Float32Array(16).fill(0);
    bloomIntensityData[0] = config.bloomIntensity;
    device.queue.writeBuffer(bloomIntensityBuffer, 0, bloomIntensityData);
  }
  
  // Function to update particle velocities based on speed changes
  function updateParticleVelocities() {
    particleSystem.updateParticleVelocities();
  }
  
  // Function to update particle colors
  function updateParticleColors() {
    particleSystem.updateParticleColors();
  }
  
  // Function to spawn particles
  function spawnParticles() {
    particleSystem.spawnParticles();
  }
}

// Start the application
main();