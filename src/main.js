// Import necessary modules
import "./style.css";
import { initWebGPU, createRenderTextures, createDepthTexture, createBuffer } from "./modules/webgpu.js";
import { ParticleSystem, ParticleSystemManager } from "./modules/particleSystem.js";
import { createBindGroupLayouts, createRenderPipelines, createBindGroups, createSampler } from "./modules/renderers.js";
import { createLookAtMatrix, createProjectionMatrix, multiplyMatrices, hexToRgb } from "./modules/utils.js";
import { ParticleUI, MultiSystemUI} from "./modules/ui.js";
import { setupCameraControls } from "./modules/cameraControls.js";
import "./modules/tabs.js"; 
import { saveScene, loadScene } from "./modules/sceneManager.js";

async function main() {
  // Initialize WebGPU
  const { device, context, format, canvas } = await initWebGPU();
  
  // Create particle system manager
  const particleSystemManager = new ParticleSystemManager(device);
  
  // Texture cache for bloom effects
  const textureCache = {
    bloomSourceTextures: {},
    bloomCompositeTextures: {},
    combinedTexture: null,
    getBloomSourceTexture: function(systemId, width, height) {
      if (!this.bloomSourceTextures[systemId]) {
        this.bloomSourceTextures[systemId] = device.createTexture({
          size: [width, height],
          format: format,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
      }
      return this.bloomSourceTextures[systemId];
    },
    getBloomCompositeTexture: function(systemId, width, height) {
      if (!this.bloomCompositeTextures[systemId]) {
        this.bloomCompositeTextures[systemId] = device.createTexture({
          size: [width, height],
          format: format,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
      }
      return this.bloomCompositeTextures[systemId];
    },
    getCombinedTexture: function(width, height) {
      if (!this.combinedTexture) {
        this.combinedTexture = device.createTexture({
          size: [width, height],
          format: format,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
      }
      return this.combinedTexture;
    },
    resizeTextures: function(width, height) {
      // Clean up old textures
      Object.values(this.bloomSourceTextures).forEach(texture => texture?.destroy());
      Object.values(this.bloomCompositeTextures).forEach(texture => texture?.destroy());
      if (this.combinedTexture) this.combinedTexture.destroy();
      
      // Reset arrays
      this.bloomSourceTextures = {};
      this.bloomCompositeTextures = {};
      this.combinedTexture = null;
    }
  };
  
  // Bind group cache to avoid recreating bind groups every frame
  const bindGroupCache = {
    // System-specific bind groups for particles
    systemBindGroups: [],
    // Bloom-related bind groups
    systemBloomHorizontalBindGroups: [],
    secondHorizontalBindGroups: [],
    systemBloomCompositeBindGroups: [],
    // Final rendering bind groups
    nonBloomBindGroup: null,
    bloomCompositeBindGroups: [],
    finalBindGroup: null,
    textureStates: {},
    
    // Clear cache when textures change
    clear: function() {
      this.systemBindGroups = [];
      this.systemBloomHorizontalBindGroups = [];
      this.secondHorizontalBindGroups = [];
      this.systemBloomCompositeBindGroups = [];
      this.nonBloomBindGroup = null;
      this.bloomCompositeBindGroups = [];
      this.finalBindGroup = null;
      this.textureStates = {}; // Reset texture state tracking
    }
  };
  
  // Update config to initialize rotationMode
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
    // 3D shape settings
    cubeLength: 2.0,
    innerLength: 0.0,
    outerLength: 2.0,
    innerRadius: 0.0,
    outerRadius: 2.0,
    // Shape rotation settings
    shapeRotationX: 0,
    shapeRotationY: 0,
    shapeRotationZ: 0,
    // 2D shape settings
    squareSize: 2.0,
    squareInnerSize: 0.0,
    circleInnerRadius: 0.0,
    circleOuterRadius: 2.0,
    particleSize: 0.5,
    particleSpeed: 1.0,
    
    // Random size settings
    randomSize: false,
    minSize: 0.1,
    maxSize: 0.5,
    
    // Physics settings
    dampingEnabled: false,
    dampingStrength: 0.5,
    
    // Velocity override settings
    overrideXVelocity: false,
    overrideYVelocity: false,
    overrideZVelocity: false,
    xVelocity: 0,
    yVelocity: 0,
    zVelocity: 0,
    
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
    
    // Rotation settings
    rotation: 0,
    rotationMode: 'fixed',
    minRotation: 0,
    maxRotation: 90,
    
    // Default name for the first system
    name: 'System 1',
    randomSpeed: false,
    minSpeed: 0.1,
    maxSpeed: 1.0,
    // Callback methods for UI interactions - will be updated later
    onAppearanceChange: null,
    onColorChange: null,
    onSizeChange: null,
    onSpeedChange: null,
    onBloomIntensityChange: null,
    onRespawn: null,
    fadeSizeEnabled: false,
    opacity: 1.0,

  };
  
  // Create buffers
  const uniformBuffer = device.createBuffer({
    size: 80, // MVP matrix + camera position + aspect
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  
  const appearanceUniformBuffer = device.createBuffer({
    size: 96, // [fadeEnabled, colorTransitionEnabled, particleSize, textureEnabled, colors...] + rotation values
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
  
  // Create the first particle system
  particleSystemManager.createParticleSystem(config);
  
  // Create function to handle UI configuration updates when switching between systems
  let currentUI = null;
  
  // Create separate quad buffers for each system
  const systemQuadBuffers = {};
  
  function createQuadBufferForSystem(systemId, particleSize) {
    const quadVertices = new Float32Array([
      -0.5, -0.5, 0,
      0.5, -0.5, 0,
      0.5, 0.5, 0,
      -0.5, 0.5, 0
    ]);
    
    return createBuffer(
      device, 
      quadVertices, 
      GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    );
  }
  
  function onSystemSelected(index) {
    // Get the configuration of the selected system
    const selectedConfig = particleSystemManager.particleSystems[index].config;
    
    // Clean up any existing UI
    if (currentUI) {
      currentUI.removeAllEventListeners();
    }
    
    // Create a new UI with the selected system's config
    currentUI = new ParticleUI(selectedConfig);
    
    // Update callback methods to point to the right system
    const activeSystem = particleSystemManager.getActiveSystem();
    
    selectedConfig.getActiveSystem = () => {
      return activeSystem;
    };
    
    // Set up callbacks specific to this system
    selectedConfig.onAppearanceChange = () => {
      // Update this specific system's appearance uniform buffer
      const system = particleSystemManager.particleSystems[index].system;
      system.updateAppearanceUniform();
    };
    
    selectedConfig.onColorChange = () => {
      if (activeSystem) {
        activeSystem.updateParticleColors();
        // Also update the appearance buffer to ensure consistent colors
        activeSystem.updateAppearanceUniform();
      }
    };
        
    selectedConfig.onSpeedChange = () => {
      if (activeSystem) {
        activeSystem.updateParticleVelocities();
      }
    };
    
    selectedConfig.onPhysicsChange = (param, value) => {
      // Update physics settings for this system
      const system = particleSystemManager.particleSystems[index].system;
      
      if (param === 'gravity') {
        system.setGravity(value);
        selectedConfig.gravityStrength = value;
      } else if (param === 'damping') {
        system.physics.setDamping(value);
        selectedConfig.dampingStrength = value;
      } else if (param === 'turbulence') {
        system.setTurbulence(value);
      } else if (param === 'attractor') {
        system.setAttractor(value.strength, value.position);
        selectedConfig.attractorStrength = value.strength;
        selectedConfig.attractorPosition = value.position;
      }
    };
    
    selectedConfig.onBloomIntensityChange = () => {
      // Update this specific system's bloom intensity buffer
      const system = particleSystemManager.particleSystems[index].system;
      system.updateBloomIntensity();
    };
    
    selectedConfig.onRespawn = () => {
      if (activeSystem) {
        activeSystem.spawnParticles();
      }
    };
    
    // Initialize appearance uniform buffer for this system
    activeSystem.updateAppearanceUniform();
    
    // Update bloom intensity
    activeSystem.updateBloomIntensity();
    
    // Update Respawn All button to respawn all systems
    const respawnButton = document.getElementById('respawn-button');
    if (respawnButton) {
      respawnButton.onclick = () => particleSystemManager.respawnAllSystems();
    }
  }
  
  // Initialize buffer data
  const horizontalDirection = new Float32Array([1.0, 0.0, canvas.width, canvas.height, 0.0, 0.0, 0.0, 0.0]);
  const verticalDirection = new Float32Array([0.0, 1.0, canvas.width, canvas.height, 0.0, 0.0, 0.0, 0.0]);
  const bloomIntensityData = new Float32Array(16).fill(0);
  bloomIntensityData[0] = config.bloomIntensity;
  
  // Initialize quad index buffer (shared across all systems)
  const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const quadIndexBuffer = createBuffer(
    device,
    quadIndices,
    GPUBufferUsage.INDEX
  );
  
  // Create initial quad buffer for the first system
  const firstSystemId = particleSystemManager.particleSystems[0].config.id;
  systemQuadBuffers[firstSystemId] = createQuadBufferForSystem(
    firstSystemId, 
    config.particleSize
  );
  
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
  
  // Create render textures
  let { sceneTexture, bloomTexA, bloomTexB } = createRenderTextures(device, format, canvas.width, canvas.height);
  
  // Create depth texture
  let depthTexture = createDepthTexture(device, canvas.width, canvas.height);
  
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
  
  // Create multi-system UI
  const multiSystemUI = new MultiSystemUI(particleSystemManager, onSystemSelected);
  
  // Initialize the first system UI after bind groups are created
  onSystemSelected(0);
  
  // Set up camera controls
  setupCameraControls(canvas, config);
  
  // Resize handler for window resizing
  window.addEventListener('resize', resizeCanvasToDisplaySize);
  
  // Save and load functionality
  const saveButton = document.getElementById('save-scene-button');
  const loadInput = document.getElementById('load-scene-input');
  
  if (saveButton) {
    saveButton.addEventListener('click', () => saveScene(particleSystemManager));
  }
  
  if (loadInput) {
    loadInput.addEventListener('change', async (event) => {
      try {
        const sceneData = await loadScene(event);
        if (sceneData) {
          particleSystemManager.replaceSystems(sceneData);
          multiSystemUI.updateSystemsList();
          onSystemSelected(particleSystemManager.activeSystemIndex);
        }
      } catch (error) {
        console.error("Error loading scene:", error);
      }
    });
  }
  
  // Initialize particles and start animation
  particleSystemManager.respawnAllSystems();
  let lastTime = performance.now();
  requestAnimationFrame(frame);
  
  // Animation loop
  function frame(currentTime) {
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    // Update all particle systems
    particleSystemManager.updateAllSystems(deltaTime);
    
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
    
    // Check if any system has bloom enabled
    const anySystemHasBloom = particleSystemManager.particleSystems.some(
      ({ config }) => config.bloomEnabled
    );
    
    // Render frame
    const commandEncoder = device.createCommandEncoder();
    
    // First for systems WITHOUT bloom - render to sceneTexture 
    const nonBloomSceneRenderPassDescriptor = {
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
    
    // Render all non-bloom particles to scene texture
    const nonBloomPassEncoder = commandEncoder.beginRenderPass(nonBloomSceneRenderPassDescriptor);
    nonBloomPassEncoder.setPipeline(particlePipeline);
    nonBloomPassEncoder.setIndexBuffer(quadIndexBuffer, 'uint16');
    
    // Render each non-bloom particle system
    for (const { system, config } of particleSystemManager.particleSystems) {
      // Skip systems with bloom enabled (will be rendered in the next pass)
      if (config.bloomEnabled || system.activeParticles === 0) {
        continue;
      }
      
      // Check if we need to recreate the bind group due to texture changes
      const bindGroupId = system.config.id;
      const needsNewBindGroup = 
        !bindGroupCache.systemBindGroups[bindGroupId] || 
        bindGroupCache.textureStates[bindGroupId] !== config.textureEnabled;
      
      // Store the current texture state for future comparison
      bindGroupCache.textureStates = bindGroupCache.textureStates || {};
      bindGroupCache.textureStates[bindGroupId] = config.textureEnabled;
      
      // Create or recreate the bind group if needed
      if (needsNewBindGroup) {
        bindGroupCache.systemBindGroups[bindGroupId] = device.createBindGroup({
          layout: layouts.particleBindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: { buffer: system.appearanceUniformBuffer } },
            { binding: 2, resource: system.particleTexture.createView() },
            { binding: 3, resource: sampler }
          ]
        });
        
      }
      
      nonBloomPassEncoder.setVertexBuffer(0, systemQuadBuffers[system.config.id]);
      nonBloomPassEncoder.setBindGroup(0, bindGroupCache.systemBindGroups[system.config.id]);
      nonBloomPassEncoder.setVertexBuffer(1, system.instanceBuffer);
      nonBloomPassEncoder.setVertexBuffer(2, system.velocityBuffer); // Add velocity buffer to shader
      nonBloomPassEncoder.drawIndexed(6, system.activeParticles);
    }
    
    nonBloomPassEncoder.end();
    
    // For systems WITH bloom - render to a separate texture
    if (anySystemHasBloom) {
      // We'll handle each bloom system separately to maintain individual bloom intensities
      const bloomSystems = particleSystemManager.particleSystems.filter(
        ({ config }) => config.bloomEnabled
      );
      
      // Process each bloom-enabled system with its own intensity
      for (let i = 0; i < bloomSystems.length; i++) {
        const { system, config } = bloomSystems[i];
        const systemId = system.config.id; // Use the system's unique ID instead of array index
        
        if (system.activeParticles === 0) continue;
        
        // Render this system's particles to its own texture - use cached texture
        const bloomSourceTexture = textureCache.getBloomSourceTexture(systemId, canvas.width, canvas.height);
        
        const bloomSystemRenderPassDescriptor = {
          colorAttachments: [{
            view: bloomSourceTexture.createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
          }],
          depthStencilAttachment: {
            view: depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'load',
            depthStoreOp: 'store',
          },
        };
        
        const bloomSystemEncoder = commandEncoder.beginRenderPass(bloomSystemRenderPassDescriptor);
        bloomSystemEncoder.setPipeline(particlePipeline);
        bloomSystemEncoder.setIndexBuffer(quadIndexBuffer, 'uint16');
        
        // Use system-specific quad buffer
        if (!systemQuadBuffers[systemId]) {
          // Create quad buffer if it doesn't exist yet
          systemQuadBuffers[systemId] = createQuadBufferForSystem(systemId, system.config.particleSize);
        }
        
        bloomSystemEncoder.setVertexBuffer(0, systemQuadBuffers[systemId]);
        
        // Track texture state changes for bloom systems too
        bindGroupCache.textureStates = bindGroupCache.textureStates || {};
        
        // Create a new bind group if needed or if texture state has changed
        const needsNewBindGroup = !bindGroupCache.systemBindGroups[systemId] || 
                                 bindGroupCache.textureStates[systemId] !== config.textureEnabled;
        
        // Update our tracking of texture state
        bindGroupCache.textureStates[systemId] = config.textureEnabled;
        
        // Create a system-specific bind group with all required entries
        const systemBindGroup = device.createBindGroup({
          layout: layouts.particleBindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: { buffer: system.appearanceUniformBuffer } },
            { binding: 2, resource: system.particleTexture.createView() },
            { binding: 3, resource: sampler }
          ]
        });
        
        bloomSystemEncoder.setBindGroup(0, systemBindGroup);
        bloomSystemEncoder.setVertexBuffer(1, system.instanceBuffer);
        bloomSystemEncoder.setVertexBuffer(2, system.velocityBuffer); // Add velocity buffer to the bloom shader
        bloomSystemEncoder.drawIndexed(6, system.activeParticles);
        bloomSystemEncoder.end();
        
        // Set bloom intensity for this specific system
        const bloomIntensityData = new Float32Array(16).fill(0);
        bloomIntensityData[0] = config.bloomIntensity;
        device.queue.writeBuffer(bloomIntensityBuffer, 0, bloomIntensityData);
        
        // Apply bloom effect with this system's intensity 
        
        // First horizontal blur pass
        const horizontalBlurPassDescriptor = {
          colorAttachments: [{
            view: bloomTexA.createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
          }],
        };
        
        // Create or get cached bloom bind group for this specific system's texture
        if (!bindGroupCache.systemBloomHorizontalBindGroups[systemId]) {
          bindGroupCache.systemBloomHorizontalBindGroups[systemId] = device.createBindGroup({
            layout: layouts.bloomBindGroupLayout,
            entries: [
              { binding: 0, resource: sampler },
              { binding: 1, resource: bloomSourceTexture.createView() },
              { binding: 2, resource: { buffer: horizontalBlurUniformBuffer } }
            ]
          });
        }
        
        const horizontalBlurPassEncoder = commandEncoder.beginRenderPass(horizontalBlurPassDescriptor);
        horizontalBlurPassEncoder.setPipeline(blurPipeline);
        horizontalBlurPassEncoder.setBindGroup(0, bindGroupCache.systemBloomHorizontalBindGroups[systemId]);
        horizontalBlurPassEncoder.draw(3);
        horizontalBlurPassEncoder.end();
        
        // Then vertical blur
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
        
        // Apply a second pass for smoother bloom
        if (!bindGroupCache.secondHorizontalBindGroups[systemId]) {
          bindGroupCache.secondHorizontalBindGroups[systemId] = device.createBindGroup({
            layout: layouts.bloomBindGroupLayout,
            entries: [
              { binding: 0, resource: sampler },
              { binding: 1, resource: bloomTexB.createView() },
              { binding: 2, resource: { buffer: horizontalBlurUniformBuffer } }
            ]
          });
        }
        
        const secondHorizontalBlurPassEncoder = commandEncoder.beginRenderPass(horizontalBlurPassDescriptor);
        secondHorizontalBlurPassEncoder.setPipeline(blurPipeline);
        secondHorizontalBlurPassEncoder.setBindGroup(0, bindGroupCache.secondHorizontalBindGroups[systemId]);
        secondHorizontalBlurPassEncoder.draw(3);
        secondHorizontalBlurPassEncoder.end();
        
        const secondVerticalBlurPassEncoder = commandEncoder.beginRenderPass(verticalBlurPassDescriptor);
        secondVerticalBlurPassEncoder.setPipeline(blurPipeline);
        secondVerticalBlurPassEncoder.setBindGroup(0, bindGroups.verticalBlurBindGroup);
        secondVerticalBlurPassEncoder.draw(3);
        secondVerticalBlurPassEncoder.end();
        
        // Create a composited bloom texture for this system (with its specific intensity)
        const systemBloomCompositeTexture = textureCache.getBloomCompositeTexture(systemId, canvas.width, canvas.height);
        
        // Apply this system's bloom intensity by compositing the source with the blurred result
        const systemCompositePassDescriptor = {
          colorAttachments: [{
            view: systemBloomCompositeTexture.createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
          }],
        };
        
        const systemCompositeEncoder = commandEncoder.beginRenderPass(systemCompositePassDescriptor);
        systemCompositeEncoder.setPipeline(compositePipeline);
        
        // Create a bloom composite bind group using the system's specific bloom intensity buffer
        const systemBloomCompositeBindGroup = device.createBindGroup({
          layout: layouts.compositeBindGroupLayout,
          entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: bloomSourceTexture.createView() },
            { binding: 2, resource: bloomTexB.createView() },
            { binding: 3, resource: { buffer: system.bloomIntensityBuffer } } // Use system-specific bloom intensity buffer
          ]
        });
        
        systemCompositeEncoder.setBindGroup(0, systemBloomCompositeBindGroup);
        systemCompositeEncoder.draw(3);
        systemCompositeEncoder.end();
      }
    }
    
    // Create a combined texture for all particles (non-bloom and bloom)
    const combinedTexture = textureCache.getCombinedTexture(canvas.width, canvas.height);
    
    // Start with non-bloom particles
    const combinedPassDescriptor = {
      colorAttachments: [{
        view: combinedTexture.createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
      }],
    };
    
    const combinedPassEncoder = commandEncoder.beginRenderPass(combinedPassDescriptor);
    combinedPassEncoder.setPipeline(directRenderPipeline);
    
    // Add non-bloom particles first
    const nonBloomBindGroup = device.createBindGroup({
      layout: layouts.compositeBindGroupLayout,
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: sceneTexture.createView() },
        { binding: 2, resource: sceneTexture.createView() },
        { binding: 3, resource: { buffer: bloomIntensityBuffer } }
      ]
    });
    
    combinedPassEncoder.setBindGroup(0, nonBloomBindGroup);
    combinedPassEncoder.draw(3);
    
    // Then add each bloom system's composited particles
    for (let i = 0; i < particleSystemManager.particleSystems.length; i++) {
      const { config, system } = particleSystemManager.particleSystems[i];
      const systemId = system.config.id;
      
      if (!config.bloomEnabled) continue;
      
      // Set to additive blending
      combinedPassEncoder.setPipeline(directRenderPipeline);
      
      // Create a bloom composite bind group
      const bloomCompositeBindGroup = device.createBindGroup({
        layout: layouts.compositeBindGroupLayout,
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: textureCache.getBloomCompositeTexture(systemId, canvas.width, canvas.height).createView() },
          { binding: 2, resource: sceneTexture.createView() },
          { binding: 3, resource: { buffer: bloomIntensityBuffer } }
        ]
      });
      
      combinedPassEncoder.setBindGroup(0, bloomCompositeBindGroup);
      combinedPassEncoder.draw(3);
    }
    
    combinedPassEncoder.end();
    
    // Final composite pass - blend the combined particle result onto a solid background
    const finalPassDescriptor = {
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0.1, g: 0.2, b: 0.3, a: 1.0 }, // Background color
      }],
    };
    
    const finalPassEncoder = commandEncoder.beginRenderPass(finalPassDescriptor);
    finalPassEncoder.setPipeline(directRenderPipeline);
    
    // Use cached final bind group or create a new one
    if (!bindGroupCache.finalBindGroup) {
      bindGroupCache.finalBindGroup = device.createBindGroup({
        layout: layouts.compositeBindGroupLayout,
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: combinedTexture.createView() },
          { binding: 2, resource: sceneTexture.createView() }, // Unused
          { binding: 3, resource: { buffer: bloomIntensityBuffer } }
        ]
      });
    }
    
    finalPassEncoder.setBindGroup(0, bindGroupCache.finalBindGroup);
    finalPassEncoder.draw(3);
    finalPassEncoder.end();
    
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
    
    // Clear the bind group cache since it references old textures
    bindGroupCache.clear();
    
    // Recreate bind groups with the new textures
    const textures = {
      sceneTexture,
      bloomTexA,
      bloomTexB
    };
    
    bindGroups = createBindGroups(device, sampler, buffers, textures);
    
    // Resize cached textures to match new window size
    textureCache.resizeTextures(canvas.width, canvas.height);
    
    // Make sure we don't render with cached bind groups that reference destroyed textures
    // Wait for the next frame to ensure no in-flight operations are using the old textures
    let frameSkipped = false;
    const waitForNextFrame = () => {
      if (!frameSkipped) {
        frameSkipped = true;
        requestAnimationFrame(waitForNextFrame);
        return;
      }
      
      // Now it's safe to destroy the old textures
      oldSceneTexture.destroy();
      oldBloomTexA.destroy();
      oldBloomTexB.destroy();
      oldDepthTexture.destroy();
    };
    
    requestAnimationFrame(waitForNextFrame);
  }
}

// Start the application
main();