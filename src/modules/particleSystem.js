/**
 * Particle system core functionality
 */

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
    this.emissionTimer = 0;
    
    // Create typed arrays for particle data and velocities
    this.particleData = new Float32Array(this.MAX_PARTICLES * 8); // [x, y, z, r, g, b, age, lifetime]
    this.particleVelocities = new Float32Array(this.MAX_PARTICLES * 3); // [vx, vy, vz]
    
    // Create GPU buffers
    this.instanceBuffer = device.createBuffer({
      size: this.MAX_PARTICLES * 8 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  spawnParticles() {
    // Reset counters
    this.activeParticles = 0;
    this.currentEmissionTime = 0;
    this.emissionTimer = 0;
    
    if (this.config.burstMode) {
      // Burst mode: emit all particles at once
      const burstCount = this.config.particleCount;
      // Update the particle count to match the requested burst count
      this.particleCount = burstCount;
      
      // Emit all particles immediately
      for (let i = 0; i < burstCount; i++) {
        this.emitParticle();
      }
      
      // No need to continue emitting
      this.emitting = false;
    } else {
      // Continuous emission mode
      this.emitting = true;
      
      // Calculate max particles based on emission rate and duration
      const baseLifetime = this.config.lifetime || 5;
      const effectiveDuration = Math.min(this.config.emissionDuration || 10, baseLifetime);
      this.particleCount = Math.min(Math.ceil((this.config.emissionRate || 10) * effectiveDuration), this.MAX_PARTICLES);
    }
  }

  emitParticle() {
    if (this.activeParticles >= this.particleCount) return false;
    
    const index = this.activeParticles * 8;
    let posX, posY, posZ;
    
    if (this.config.emissionShape === 'cube') {
      // Generate random position within a cube
      const halfLength = this.config.cubeLength / 2;
      posX = (Math.random() - 0.5) * this.config.cubeLength;
      posY = (Math.random() - 0.5) * this.config.cubeLength;
      posZ = (Math.random() - 0.5) * this.config.cubeLength;
    } else if (this.config.emissionShape === 'sphere') {
      // Generate random position within a sphere shell
      let theta = Math.random() * 2 * Math.PI; // azimuthal angle
      let phi = Math.acos(2 * Math.random() - 1); // polar angle
      
      // Calculate direction vector
      let dirX = Math.sin(phi) * Math.cos(theta);
      let dirY = Math.sin(phi) * Math.sin(theta);
      let dirZ = Math.cos(phi);
      
      // Generate random radius between inner and outer
      let radius;
      if (this.config.innerRadius === 0) {
        // For solid sphere, use cubic distribution for uniform volume distribution
        radius = this.config.outerRadius * Math.cbrt(Math.random());
      } else {
        // For shell, interpolate between inner and outer
        radius = this.config.innerRadius + (this.config.outerRadius - this.config.innerRadius) * Math.random();
      }
      
      // Calculate position
      posX = dirX * radius;
      posY = dirY * radius;
      posZ = dirZ * radius;
    }
    
    // Normalize to get direction vector from origin
    const length = Math.sqrt(posX * posX + posY * posY + posZ * posZ) || 0.0001; // Avoid division by zero
    const dirX = posX / length;
    const dirY = posY / length;
    const dirZ = posZ / length;
    
    // Set position
    this.particleData[index] = posX;
    this.particleData[index + 1] = posY;
    this.particleData[index + 2] = posZ;
    
    // Store velocity vector for this particle (scaled by speed)
    const velIndex = this.activeParticles * 3;
    this.particleVelocities[velIndex] = dirX * this.config.particleSpeed;
    this.particleVelocities[velIndex + 1] = dirY * this.config.particleSpeed;
    this.particleVelocities[velIndex + 2] = dirZ * this.config.particleSpeed;
    
    // Color
    if (this.config.colorTransitionEnabled) {
      this.particleData[index + 3] = this.config.startColor[0];
      this.particleData[index + 4] = this.config.startColor[1];
      this.particleData[index + 5] = this.config.startColor[2];
    } else {
      this.particleData[index + 3] = this.config.particleColor[0];
      this.particleData[index + 4] = this.config.particleColor[1];
      this.particleData[index + 5] = this.config.particleColor[2];
    }
    
    // Age and lifetime - set a lifetime from the config
    const baseLifetime = this.config.lifetime || 5;
    this.particleData[index + 6] = 0; // Age starts at 0
    this.particleData[index + 7] = baseLifetime + Math.random() * 2 - 1; // Add a small random variance
    
    this.activeParticles++;
    return true;
  }

  updateParticles(deltaTime) {
    if (this.emitting) {
      // Update emission timer
      this.currentEmissionTime += deltaTime;
      this.emissionTimer += deltaTime;
      
      // Check if we're still within emission duration
      if (this.currentEmissionTime < this.config.emissionDuration) {
        // Calculate how many particles to emit this frame
        const particlesToEmit = this.config.emissionRate * deltaTime;
        let wholeParticlesToEmit = Math.floor(particlesToEmit);
        const fractionalPart = particlesToEmit - wholeParticlesToEmit;
        
        // Handle fractional particles (probabilistic emission)
        if (Math.random() < fractionalPart) {
          wholeParticlesToEmit += 1;
        }
        
        // Emit particles
        for (let i = 0; i < wholeParticlesToEmit; i++) {
          this.emitParticle();
        }
      } else if (this.emitting) {
        // Stop emitting once duration is reached
        this.emitting = false;
      }
    }
    
    // Update particle positions and ages
    let needsUpdate = false;
    for (let i = 0; i < this.activeParticles; i++) {
      // Update age
      this.particleData[i * 8 + 6] += deltaTime;
      
      // Update position based on velocity and deltaTime
      const velIndex = i * 3;
      const posIndex = i * 8;
      
      // Apply velocity to position
      this.particleData[posIndex] += this.particleVelocities[velIndex] * deltaTime;
      this.particleData[posIndex + 1] += this.particleVelocities[velIndex + 1] * deltaTime;
      this.particleData[posIndex + 2] += this.particleVelocities[velIndex + 2] * deltaTime;
      
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      this.updateBuffers();
    }
  }

  updateBuffers() {
    let newActiveCount = 0;
    for (let i = 0; i < this.activeParticles; i++) {
      const age = this.particleData[i * 8 + 6];
      const lifetime = this.particleData[i * 8 + 7];
      
      if (age >= lifetime) continue;
      
      if (newActiveCount !== i) {
        // Copy particle data
        for (let j = 0; j < 8; j++) {
          this.particleData[newActiveCount * 8 + j] = this.particleData[i * 8 + j];
        }
        
        // Also copy the velocity data to keep arrays in sync
        for (let j = 0; j < 3; j++) {
          this.particleVelocities[newActiveCount * 3 + j] = this.particleVelocities[i * 3 + j];
        }
      }
      newActiveCount++;
    }
    this.activeParticles = newActiveCount;
    
    this.device.queue.writeBuffer(this.instanceBuffer, 0, this.particleData, 0, this.activeParticles * 8);
  }

  updateParticleColors() {
    for (let i = 0; i < this.activeParticles; i++) {
      const index = i * 8;
      
      // Update color based on current settings
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
    
    // Update the buffer with the new colors
    if (this.activeParticles > 0) {
      this.device.queue.writeBuffer(this.instanceBuffer, 0, this.particleData, 0, this.activeParticles * 8);
    }
  }

  updateParticleVelocities() {
    for (let i = 0; i < this.activeParticles; i++) {
      const index = i * 8; // Position data index
      const velIndex = i * 3; // Velocity data index
      
      // Get the current position
      const posX = this.particleData[index];
      const posY = this.particleData[index + 1];
      const posZ = this.particleData[index + 2];
      
      // Calculate direction away from origin (normalize the position vector)
      const length = Math.sqrt(posX * posX + posY * posY + posZ * posZ) || 0.0001; // Avoid division by zero
      const dirX = posX / length;
      const dirY = posY / length;
      const dirZ = posZ / length;
      
      // Update velocity based on current speed setting
      this.particleVelocities[velIndex] = dirX * this.config.particleSpeed;
      this.particleVelocities[velIndex + 1] = dirY * this.config.particleSpeed;
      this.particleVelocities[velIndex + 2] = dirZ * this.config.particleSpeed;
    }
  }
}