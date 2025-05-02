/**
 * Particle system core functionality
 */

import { ParticleEmitter } from './particleEmitter.js';
import { ParticlePhysics } from './particlePhysics.js';
import { ParticleTextureManager } from './particleTextures.js';

export class ParticleSystem {
  constructor(device, config) {
    this.device = device;
    this.config = config;
    
    // Particle system state
    this.MAX_PARTICLES = config.maxParticles || 10000;
    this.particleCount = config.particleCount || 100;
    this.activeParticles = 0;
    this.emitting = false;
    this.currentEmissionTime = 0;
    
    // Create typed arrays for particle data and velocities
    this.particleData = new Float32Array(this.MAX_PARTICLES * 8); // [x, y, z, r, g, b, age, lifetime]
    this.particleVelocities = new Float32Array(this.MAX_PARTICLES * 4); // [vx, vy, vz, padding]
    
    // Create GPU buffers for rendering
    this.instanceBuffer = device.createBuffer({
      size: this.MAX_PARTICLES * 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      label: "particleInstanceBuffer"
    });
    
    // Create GPU buffers for compute shader
    this.velocityBuffer = device.createBuffer({
      size: this.MAX_PARTICLES * 4 * 4, // vec3 + padding
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: "particleVelocityBuffer"
    });
    
    // Create appearance uniform buffer for this specific particle system
    this.appearanceUniformBuffer = device.createBuffer({
      size: 96, // [fadeEnabled, colorTransitionEnabled, particleSize, textureEnabled, colors...] + rotation values
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: "appearanceUniformBuffer"
    });
    
    // Create bloom intensity buffer specific to this system
    this.bloomIntensityBuffer = device.createBuffer({
      size: 64, // intensity (f32) + padding
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: "systemBloomIntensityBuffer"
    });
    
    // Initialize config velocity override properties if not set
    if (config.overrideXVelocity === undefined) config.overrideXVelocity = false;
    if (config.overrideYVelocity === undefined) config.overrideYVelocity = false;
    if (config.overrideZVelocity === undefined) config.overrideZVelocity = false;
    if (config.xVelocity === undefined) config.xVelocity = 0;
    if (config.yVelocity === undefined) config.yVelocity = 0;
    if (config.zVelocity === undefined) config.zVelocity = 0;
    if (config.textureEnabled === undefined) config.textureEnabled = false;
    
    // Initialize the modular components
    this.emitter = new ParticleEmitter(config);
    this.physics = new ParticlePhysics(device);
    this.textureManager = new ParticleTextureManager(device);
    
    // Apply physics settings from the loaded config
    if (config.gravityEnabled) {
      this.setGravity(config.gravityStrength || 0);
    }
    
    if (config.dampingEnabled) {
      this.physics.setDamping(config.dampingStrength || 0);
    }
    
    if (config.attractorEnabled && config.attractorPosition) {
      this.setAttractor(config.attractorStrength || 0, config.attractorPosition);
    }
    
    // Set the current texture to the default
    this.particleTexture = this.textureManager.getDefaultTexture();
    
    // Initialize bloom intensity buffer with this system's bloom intensity
    this.updateBloomIntensity();
    
    // Initialize appearance uniform buffer with this system's settings
    this.updateAppearanceUniform();
    
    // Initialize the frame counter for readback scheduling
    this.frameCount = 0;
    this.shouldReset = false;
    
    // Initialize compute pipeline
    this.initComputePipeline(device);
  }

  async initComputePipeline(device) {
    this.computeReady = await this.physics.initComputePipeline(this.instanceBuffer, this.velocityBuffer);
  }

  async setTexture(imageBitmap) {
    // Clean up previous texture if it exists and isn't the default
    this.textureManager.destroyTexture(this.particleTexture);
    
    // Create texture from the image
    this.particleTexture = await this.textureManager.loadTexture(imageBitmap);
    
    // Enable texturing in the config
    this.config.textureEnabled = true;
    
    // Update appearance uniform to reflect the texture being enabled
    this.updateAppearanceUniform();
    
    // Update instance buffer to ensure vertex data is properly set before rendering
    this.updateBuffers();
  }
  
  resetTexture() {
    // Clean up previous texture if it exists and isn't already the default
    this.textureManager.destroyTexture(this.particleTexture);
    
    // Set to default texture
    this.particleTexture = this.textureManager.getDefaultTexture();
    
    // Update config and appearance uniform
    this.config.textureEnabled = false;
    this.updateAppearanceUniform();
    
    // Ensure buffers are updated
    this.updateBuffers();
  }

  updateAppearanceUniform() {
    // Determine rotation mode flag value
    // 0.0 = fixed, 1.0 = random, 2.0 = towards velocity
    let rotationModeValue = 0.0;
    if (this.config.rotationMode === 'random') {
      rotationModeValue = 1.0;
    } else if (this.config.rotationMode === 'velocity') {
      rotationModeValue = 2.0;
    }
    
    const appearanceData = new Float32Array([
      this.config.fadeEnabled ? 1.0 : 0.0,
      this.config.colorTransitionEnabled ? 1.0 : 0.0,
      this.config.particleSize,
      this.config.textureEnabled ? 1.0 : 0.0, // textureEnabled flag instead of padding
      // Single color (vec3 + padding)
      this.config.particleColor[0], this.config.particleColor[1], this.config.particleColor[2], 
      this.config.rotation || 0.0, // Fixed rotation in degrees
      // Start color (vec3 + padding)
      this.config.startColor[0], this.config.startColor[1], this.config.startColor[2], 
      rotationModeValue, // Rotation mode: 0=fixed, 1=random, 2=velocity
      // End color (vec3 + padding)
      this.config.endColor[0], this.config.endColor[1], this.config.endColor[2], 
      this.config.minRotation || 0.0, // Min rotation in degrees
      this.config.maxRotation || 90.0, // Max rotation in degrees 
      this.config.aspectRatio || 1.0, // Aspect ratio (width/height)
      this.config.randomSize ? 1.0 : 0.0, // randomSize flag
      this.config.minSize || 0.1, // Min particle size
      this.config.maxSize || 0.5, // Max particle size
      this.config.fadeSizeEnabled ? 1.0 : 0.0 // Use fadeSizeEnabled flag instead of padding
    ]);
    
    this.device.queue.writeBuffer(this.appearanceUniformBuffer, 0, appearanceData);
  }
  
  updateBloomIntensity() {
    const bloomIntensityData = new Float32Array(16).fill(0);
    bloomIntensityData[0] = this.config.bloomIntensity || 1.0;
    this.device.queue.writeBuffer(this.bloomIntensityBuffer, 0, bloomIntensityData);
  }

  spawnParticles() {
    // Reset counters
    this.activeParticles = 0;
    this.currentEmissionTime = 0;
    
    if (this.config.burstMode) {
      // Burst mode: emit all particles at once
      const burstCount = this.config.particleCount;
      // Update the particle count to match the requested burst count
      this.particleCount = burstCount;
      
      // Track the number of particles emitted in each batch
      let particlesBatch = 0;
      const batchSize = 500; // Process in smaller batches
      
      // Emit all particles immediately, but in batches
      for (let i = 0; i < burstCount; i++) {
        this.emitParticle();
        particlesBatch++;
        
        // Write to GPU in batches to avoid large buffer uploads at once
        if (particlesBatch >= batchSize || i === burstCount - 1) {
          const startIdx = i - particlesBatch + 1;
          const dataOffset = startIdx * 8;
          const velOffset = startIdx * 4;
          
          // Upload this batch to the GPU
          this.device.queue.writeBuffer(
            this.instanceBuffer, 
            dataOffset * 4, // Offset in bytes
            this.particleData, 
            dataOffset, 
            particlesBatch * 8
          );
          
          this.device.queue.writeBuffer(
            this.velocityBuffer, 
            velOffset * 4, // Offset in bytes
            this.particleVelocities, 
            velOffset, 
            particlesBatch * 4
          );
          
          particlesBatch = 0;
        }
      }
      
      // No need to continue emitting
      this.emitting = false;
    } else {
      // Continuous emission mode
      this.emitting = true;
      
      // Calculate max particles based on emission rate and duration
      const baseLifetime = this.config.lifetime || 5;
      const effectiveDuration = Math.max(this.config.emissionDuration || 10, baseLifetime);
      this.particleCount = Math.min(Math.ceil((this.config.emissionRate || 10) * effectiveDuration), this.MAX_PARTICLES);
    }
  }

  emitParticle() {
    if (this.activeParticles >= this.particleCount) return false;
    
    // Use the emitter to create a new particle
    this.emitter.emitParticle(this.particleData, this.activeParticles, this.particleVelocities);
    
    this.activeParticles++;
    return true;
  }

  updateParticles(deltaTime) {
    // Fixed-step physics system - accumulate real time and step at fixed intervals
    this.physics.physicsAccumulator += deltaTime;
    
    // Ensure a minimum update frequency for smoother motion at low emission rates
    const now = performance.now() / 1000;
    const timeSinceLastUpdate = now - this.physics.lastUpdateTime;
    const forceUpdate = timeSinceLastUpdate > (1.0 / this.physics.minUpdatesPerSecond);
    
    if (this.emitting) {
      // Update emission timer
      this.currentEmissionTime += deltaTime;
      
      // Check if we're still within emission duration
      if (this.currentEmissionTime < this.config.emissionDuration) {
        // Remember the current active count before emitting new particles
        const prevActiveCount = this.activeParticles;
        
        // Calculate the number of particles to emit this frame based on emission rate
        let particlesToEmit = 0;
        
        if (this.config.emissionRate >= 1) {
          // For rates >= 1, calculate deterministically
          particlesToEmit = Math.floor(this.config.emissionRate * deltaTime);
          
          // Probabilistic component for the fractional part
          const fractionalPart = (this.config.emissionRate * deltaTime) - particlesToEmit;
          if (Math.random() < fractionalPart) {
            particlesToEmit += 1;
          }
        } else {
          // For very low rates, use pure probability
          const emissionProbability = this.config.emissionRate * deltaTime;
          if (Math.random() < emissionProbability) {
            particlesToEmit = 1;
          }
        }
        
        // Force at least one particle emission at lower emission rates if it's been too long
        if (particlesToEmit === 0 && forceUpdate && this.config.emissionRate > 0 && 
            this.activeParticles < this.particleCount) {
          particlesToEmit = 1;
        }
        
        // Emit particles
        let particlesEmitted = false;
        for (let i = 0; i < particlesToEmit; i++) {
          if (this.emitParticle()) {
            particlesEmitted = true;
          } else {
            // We reached the particle limit, no need to continue
            break;
          }
        }
        
        // Update GPU buffers if new particles were emitted - only for the newly emitted particles
        if (particlesEmitted) {
          // Only write the newly emitted particles, not the entire buffer
          const newParticleCount = this.activeParticles - prevActiveCount;
          const particleDataOffset = prevActiveCount * 8;
          const velocityOffset = prevActiveCount * 4;
          
          this.device.queue.writeBuffer(
            this.instanceBuffer, 
            particleDataOffset * 4, // Offset in bytes (float32 = 4 bytes)
            this.particleData, 
            particleDataOffset, 
            newParticleCount * 8
          );
          
          this.device.queue.writeBuffer(
            this.velocityBuffer, 
            velocityOffset * 4, // Offset in bytes (float32 = 4 bytes)
            this.particleVelocities, 
            velocityOffset, 
            newParticleCount * 4
          );
        }
      } else {
        // Important: Explicitly stop emitting once duration is reached
        this.emitting = false;
        // Set emission time to exactly match the duration to prevent any timing issues
        this.currentEmissionTime = this.config.emissionDuration;
      }
    }
    
    // Take fixed physics steps based on accumulated time
    while (this.physics.physicsAccumulator >= this.physics.fixedDeltaTime) {
      this.physics.updatePhysics(
        this.physics.fixedDeltaTime, 
        this.activeParticles, 
        this.config,
        this.instanceBuffer,
        this.velocityBuffer
      );
      this.physics.physicsAccumulator -= this.physics.fixedDeltaTime;
      this.physics.physicsClock += this.physics.fixedDeltaTime;
    }
    
    // Force an update if it's been too long since the last one
    if (forceUpdate && this.activeParticles > 0) {
      this.physics.updatePhysics(
        this.physics.fixedDeltaTime, 
        this.activeParticles, 
        this.config,
        this.instanceBuffer,
        this.velocityBuffer
      );
      this.physics.lastUpdateTime = now;
    }
    
    // Readback less frequently but still regularly to clean up particles
    if (this.frameCount++ % 300 === 0) {
      this.readbackAndProcessParticles();
    }
  }
  
  async readbackAndProcessParticles() {
    if (this.activeParticles <= 0) {
      return;
    }
    
    try {
      const result = await this.physics.readbackAndProcessParticles(
        this.activeParticles,
        this.particleData,
        this.particleVelocities,
        this.instanceBuffer,
        this.velocityBuffer
      );
      
      if (!result.shouldUpdate) return;
      
      // Process the data to remove dead particles
      let newActiveCount = 0;
      for (let i = 0; i < this.activeParticles; i++) {
        const age = this.particleData[i * 8 + 6];
        const lifetime = this.particleData[i * 8 + 7];
        
        if (age >= lifetime) {
          // Check if we should respawn the particle
          if (this.emitting && 
              this.currentEmissionTime < this.config.emissionDuration &&
              newActiveCount < this.particleCount) {
            this.respawnParticle(i, newActiveCount);
            newActiveCount++;
            continue;
          }
          // Skip dead particles
          continue;
        }
        
        if (newActiveCount !== i) {
          // Copy particle data
          for (let j = 0; j < 8; j++) {
            this.particleData[newActiveCount * 8 + j] = this.particleData[i * 8 + j];
          }
          
          // Also copy the velocity data to keep arrays in sync
          for (let j = 0; j < 4; j++) {
            this.particleVelocities[newActiveCount * 4 + j] = this.particleVelocities[i * 4 + j];
          }
        }
        newActiveCount++;
      }
      
      // Update active count if it changed
      if (newActiveCount !== this.activeParticles) {
        this.activeParticles = newActiveCount;
        
        // Update GPU buffers with compacted particle data
        this.device.queue.writeBuffer(this.instanceBuffer, 0, this.particleData, 0, this.activeParticles * 8);
        this.device.queue.writeBuffer(this.velocityBuffer, 0, this.particleVelocities, 0, this.activeParticles * 4);
      }
    } catch (error) {
      console.error("Error reading back particle data:", error);
    }
  }

  respawnParticle(oldIndex, newIndex) {
    if (!this.emitting || this.currentEmissionTime >= this.config.emissionDuration) {
      return;
    }
    
    // Use the emitter to respawn the particle
    this.emitter.emitParticle(this.particleData, newIndex, this.particleVelocities);
  }

  updateBuffers() {
    if (this.activeParticles > 0) {
      this.device.queue.writeBuffer(this.instanceBuffer, 0, this.particleData, 0, this.activeParticles * 8);
    }
  }

  updateParticleColors() {
    for (let i = 0; i < this.activeParticles; i++) {
      const index = i * 8;
      
      if (this.config.colorTransitionEnabled) {
        this.particleData[index + 3] = this.config.startColor[0];
        this.particleData[index + 4] = this.config.startColor[1];
        this.particleData[index + 5] = this.config.startColor[2];
      } else {
        this.particleData[index + 3] = this.config.particleColor[0];
        this.particleData[index + 4] = this.config.particleColor[1];
        this.particleData[index + 5] = this.config.particleColor[2];
      }
    }
    
    if (this.activeParticles > 0) {
      this.device.queue.writeBuffer(this.instanceBuffer, 0, this.particleData, 0, this.activeParticles * 8);
    }
  }

  updateParticleVelocities() {
    for (let i = 0; i < this.activeParticles; i++) {
      const index = i * 8;
      const velIndex = i * 4;
      
      const posX = this.particleData[index];
      const posY = this.particleData[index + 1];
      const posZ = this.particleData[index + 2];
      
      const curVelX = this.particleVelocities[velIndex];
      const curVelY = this.particleVelocities[velIndex + 1];
      const curVelZ = this.particleVelocities[velIndex + 2];
      
      const curVelLength = Math.sqrt(
        curVelX * curVelX + 
        curVelY * curVelY + 
        curVelZ * curVelZ
      );
      
      if (curVelLength > 0.001) {
        const speedFactor = this.config.particleSpeed * 2.0;
        this.particleVelocities[velIndex] = (curVelX / curVelLength) * speedFactor;
        this.particleVelocities[velIndex + 1] = (curVelY / curVelLength) * speedFactor;
        this.particleVelocities[velIndex + 2] = (curVelZ / curVelLength) * speedFactor;
      } else {
        const posLength = Math.sqrt(posX * posX + posY * posY + posZ * posZ);
        
        if (posLength > 0.001) {
          const speedFactor = this.config.particleSpeed * 2.0;
          this.particleVelocities[velIndex] = (posX / posLength) * speedFactor;
          this.particleVelocities[velIndex + 1] = (posY / posLength) * speedFactor;
          this.particleVelocities[velIndex + 2] = (posZ / posLength) * speedFactor;
        } else {
          this.particleVelocities[velIndex] = 0;
          this.particleVelocities[velIndex + 1] = this.config.particleSpeed * 2.0;
          this.particleVelocities[velIndex + 2] = 0;
        }
      }
    }
    
    if (this.activeParticles > 0) {
      this.device.queue.writeBuffer(this.velocityBuffer, 0, this.particleVelocities, 0, this.activeParticles * 4);
    }
  }
   
  setGravity(gravityValue) {
    this.physics.setGravity(gravityValue);
  }
  
  setAttractor(strength, position) {
    this.physics.setAttractor(strength, position);
  }
}

export class ParticleSystemManager {
  constructor(device) {
    this.device = device;
    this.particleSystems = [];
    this.activeSystemIndex = 0;
    this.systemCounter = 1;
  }

  createParticleSystem(config = {}) {
    const systemId = this.systemCounter++;
    const systemName = config.name || `System ${systemId + 1}`;
    
    const systemConfig = {
      ...config,
      name: systemName,
      id: systemId
    };
    
    const particleSystem = new ParticleSystem(this.device, systemConfig);
    this.particleSystems.push({
      system: particleSystem,
      config: systemConfig
    });
    
    if (this.particleSystems.length === 1) {
      this.activeSystemIndex = 0;
    }
    
    return systemId;
  }

  getActiveSystem() {
    if (this.particleSystems.length === 0) return null;
    return this.particleSystems[this.activeSystemIndex].system;
  }

  getActiveConfig() {
    if (this.particleSystems.length === 0) return null;
    return this.particleSystems[this.activeSystemIndex].config;
  }

  setActiveSystem(index) {
    if (index >= 0 && index < this.particleSystems.length) {
      this.activeSystemIndex = index;
      return true;
    }
    return false;
  }

  removeSystem(index) {
    if (index >= 0 && index < this.particleSystems.length) {
      this.particleSystems.splice(index, 1);
      
      if (this.particleSystems.length === 0) {
        this.activeSystemIndex = 0;
      } else if (index <= this.activeSystemIndex) {
        this.activeSystemIndex = Math.max(0, this.activeSystemIndex - 1);
      }
      
      return true;
    }
    return false;
  }

  respawnAllSystems() {
    for (const { system } of this.particleSystems) {
      system.spawnParticles();
    }
  }

  updateAllSystems(deltaTime) {
    for (const { system } of this.particleSystems) {
      system.updateParticles(deltaTime);
    }
  }

  getSystemsList() {
    return this.particleSystems.map(({ config }, index) => ({
      name: config.name,
      id: config.id,
      index,
      isActive: index === this.activeSystemIndex
    }));
  }

  duplicateActiveSystem() {
    if (this.particleSystems.length === 0) return -1;
    
    const activeConfig = this.getActiveConfig();
    const newConfig = JSON.parse(JSON.stringify(activeConfig));
    newConfig.name = `${activeConfig.name} (Copy)`;
    
    return this.createParticleSystem(newConfig);
  }
  
  /**
   * Replace all current particle systems with new ones from a saved scene
   * @param {Object} sceneData - The loaded scene data containing systems and activeSystemIndex
   * @returns {boolean} - Whether the replacement was successful
   */
  replaceSystems(sceneData) {
    if (!sceneData || !sceneData.systems || !Array.isArray(sceneData.systems)) {
      console.error("Invalid scene data provided");
      return false;
    }
    
    try {
      // Clear existing systems
      this.particleSystems = [];
      this.systemCounter = 1; // Reset system counter to avoid ID conflicts
      
      // Create new systems from loaded data
      for (const systemConfig of sceneData.systems) {
        // Generate new unique ID to avoid any conflicts
        const systemId = this.systemCounter++;
        
        // Create a new system with the loaded configuration
        const newSystem = new ParticleSystem(this.device, {
          ...systemConfig,
          id: systemId  // Use new ID to avoid conflicts
        });
        
        this.particleSystems.push({
          system: newSystem,
          config: {
            ...systemConfig,
            id: systemId
          }
        });
      }
      
      // Set the active system index from loaded data
      if (sceneData.activeSystemIndex !== undefined && 
          sceneData.activeSystemIndex >= 0 && 
          sceneData.activeSystemIndex < this.particleSystems.length) {
        this.activeSystemIndex = sceneData.activeSystemIndex;
      } else {
        this.activeSystemIndex = 0;
      }
      
      // Initialize all systems with particles
      this.respawnAllSystems();
      
      return true;
    } catch (error) {
      console.error("Error replacing systems:", error);
      return false;
    }
  }
}