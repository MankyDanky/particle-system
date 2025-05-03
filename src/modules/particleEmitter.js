/**
 * Particle emission functionality
 */

// Emission shape implementations
export class ParticleEmitter {
  constructor(config = {}) {
    this.config = config;
  }

  emitParticle(particleData, index, velocities) {
    let posX, posY, posZ;
    
    if (this.config.emissionShape === 'cube') {
      [posX, posY, posZ] = this.emitFromCube();
    } else if (this.config.emissionShape === 'sphere') {
      [posX, posY, posZ] = this.emitFromSphere();
    } else if (this.config.emissionShape === 'square') {
      [posX, posY, posZ] = this.emitFromSquare();
    } else if (this.config.emissionShape === 'circle') {
      [posX, posY, posZ] = this.emitFromCircle();
    } else if (this.config.emissionShape === 'cylinder') {
      [posX, posY, posZ] = this.emitFromCylinder();
    } else {
      // Default to point emission at origin
      posX = 0;
      posY = 0;
      posZ = 0;
    }
    
    // Apply shape rotation if configured
    if (this.config.shapeRotationX || this.config.shapeRotationY || this.config.shapeRotationZ) {
      [posX, posY, posZ] = this.applyRotation(posX, posY, posZ);
    }
    
    // Apply shape translation if configured
    if (this.config.shapeTranslationX || this.config.shapeTranslationY || this.config.shapeTranslationZ) {
      posX += this.config.shapeTranslationX || 0;
      posY += this.config.shapeTranslationY || 0;
      posZ += this.config.shapeTranslationZ || 0;
    }
    
    // Store the position
    const particleIndex = index * 8;
    particleData[particleIndex] = posX;
    particleData[particleIndex + 1] = posY;
    particleData[particleIndex + 2] = posZ;
    
    // Create velocity direction
    const velIndex = index * 4;
    this.calculateVelocity(posX, posY, posZ, velocities, velIndex);
    
    // Set color
    this.setParticleColor(particleData, particleIndex);
    
    // Set age and lifetime
    this.setParticleLifetime(particleData, particleIndex);
  }

  // Apply rotation transformation to particle position
  applyRotation(x, y, z) {
    let newX = x, newY = y, newZ = z;
    
    // Convert degrees to radians
    const radX = (this.config.shapeRotationX || 0) * Math.PI / 180;
    const radY = (this.config.shapeRotationY || 0) * Math.PI / 180;
    const radZ = (this.config.shapeRotationZ || 0) * Math.PI / 180;
    
    // Apply X-axis rotation
    if (radX !== 0) {
      const cosX = Math.cos(radX);
      const sinX = Math.sin(radX);
      const oldY = newY;
      const oldZ = newZ;
      newY = oldY * cosX - oldZ * sinX;
      newZ = oldY * sinX + oldZ * cosX;
    }
    
    // Apply Y-axis rotation
    if (radY !== 0) {
      const cosY = Math.cos(radY);
      const sinY = Math.sin(radY);
      const oldX = newX;
      const oldZ = newZ;
      newX = oldX * cosY + oldZ * sinY;
      newZ = -oldX * sinY + oldZ * cosY;
    }
    
    // Apply Z-axis rotation
    if (radZ !== 0) {
      const cosZ = Math.cos(radZ);
      const sinZ = Math.sin(radZ);
      const oldX = newX;
      const oldY = newY;
      newX = oldX * cosZ - oldY * sinZ;
      newY = oldX * sinZ + oldY * cosZ;
    }
    
    return [newX, newY, newZ];
  }

  // Helper method: Apply inverse rotation to get back original position before rotation
  inverseRotation(x, y, z) {
    let newX = x, newY = y, newZ = z;
    
    // Convert degrees to radians
    const radX = (this.config.shapeRotationX || 0) * Math.PI / 180;
    const radY = (this.config.shapeRotationY || 0) * Math.PI / 180;
    const radZ = (this.config.shapeRotationZ || 0) * Math.PI / 180;
    
    // Apply inverse Z-axis rotation (apply in reverse order from applyRotation)
    if (radZ !== 0) {
      const cosZ = Math.cos(-radZ); // Negative angle for inverse
      const sinZ = Math.sin(-radZ);
      const oldX = newX;
      const oldY = newY;
      newX = oldX * cosZ - oldY * sinZ;
      newY = oldX * sinZ + oldY * cosZ;
    }
    
    // Apply inverse Y-axis rotation
    if (radY !== 0) {
      const cosY = Math.cos(-radY);
      const sinY = Math.sin(-radY);
      const oldX = newX;
      const oldZ = newZ;
      newX = oldX * cosY + oldZ * sinY;
      newZ = -oldX * sinY + oldZ * cosY;
    }
    
    // Apply inverse X-axis rotation
    if (radX !== 0) {
      const cosX = Math.cos(-radX);
      const sinX = Math.sin(-radX);
      const oldY = newY;
      const oldZ = newZ;
      newY = oldY * cosX - oldZ * sinX;
      newZ = oldY * sinX + oldZ * cosX;
    }
    
    return [newX, newY, newZ];
  }

  emitFromCube() {
    let innerLength = this.config.innerLength || 0;
    let outerLength = this.config.outerLength || this.config.cubeLength;
    
    if (innerLength > 0) {
      // Generate position in a cube shell (between inner and outer length)
      const sides = Math.floor(Math.random() * 6); // Choose one of 6 cube faces
      const u = Math.random() - 0.5; // -0.5 to 0.5
      const v = Math.random() - 0.5; // -0.5 to 0.5
      
      let posX, posY, posZ;
      
      // Generate points on the selected face of a unit cube
      switch(sides) {
        case 0: // Front face (z = 0.5)
          posX = u;
          posY = v;
          posZ = 0.5;
          break;
        case 1: // Back face (z = -0.5)
          posX = u;
          posY = v;
          posZ = -0.5;
          break;
        case 2: // Right face (x = 0.5)
          posX = 0.5;
          posY = u;
          posZ = v;
          break;
        case 3: // Left face (x = -0.5)
          posX = -0.5;
          posY = u;
          posZ = v;
          break;
        case 4: // Top face (y = 0.5)
          posX = u;
          posY = 0.5;
          posZ = v;
          break;
        case 5: // Bottom face (y = -0.5)
          posX = u;
          posY = -0.5;
          posZ = v;
          break;
      }
      
      // Interpolate between inner and outer length
      const t = Math.random();
      const length = innerLength + t * (outerLength - innerLength);
      
      // Scale unit cube points to the shell size
      posX *= length;
      posY *= length;
      posZ *= length;
      
      return [posX, posY, posZ];
    } else {
      // Original solid cube generation using outer length
      const posX = (Math.random() - 0.5) * outerLength;
      const posY = (Math.random() - 0.5) * outerLength;
      const posZ = (Math.random() - 0.5) * outerLength;
      
      return [posX, posY, posZ];
    }
  }

  emitFromSphere() {
    // Generate random position within a sphere shell
    const theta = Math.random() * 2 * Math.PI; // azimuthal angle
    const phi = Math.acos(2 * Math.random() - 1); // polar angle
    
    // Calculate direction vector
    const dirX = Math.sin(phi) * Math.cos(theta);
    const dirY = Math.sin(phi) * Math.sin(theta);
    const dirZ = Math.cos(phi);
    
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
    const posX = dirX * radius;
    const posY = dirY * radius;
    const posZ = dirZ * radius;
    
    return [posX, posY, posZ];
  }

  emitFromSquare() {
    // Generate particles in a 2D square along the XY plane (Z=0)
    const innerSize = this.config.squareInnerSize || 0;
    const outerSize = this.config.squareSize || 2.0;
    
    let posX, posY;
    
    if (innerSize > 0) {
      // Generate position on the perimeter of a square (between inner and outer)
      // Choose which side to place particle on
      const side = Math.floor(Math.random() * 4);
      let size = innerSize + (outerSize - innerSize) * Math.random();
      
      switch(side) {
        case 0: // Top side
          posX = (Math.random() * 2 - 1) * size; // -size to size
          posY = size;
          break;
        case 1: // Right side
          posX = size;
          posY = (Math.random() * 2 - 1) * size; // -size to size
          break;
        case 2: // Bottom side
          posX = (Math.random() * 2 - 1) * size; // -size to size
          posY = -size;
          break;
        case 3: // Left side
          posX = -size;
          posY = (Math.random() * 2 - 1) * size; // -size to size
          break;
      }
    } else {
      // Generate in a solid square
      posX = (Math.random() * 2 - 1) * outerSize; // -outerSize to outerSize
      posY = (Math.random() * 2 - 1) * outerSize; // -outerSize to outerSize
    }
    
    return [posX, posY, 0]; // Flat on XY plane
  }

  emitFromCircle() {
    // Generate particles in a 2D circle along the XY plane (Z=0)
    const innerRadius = this.config.circleInnerRadius || 0;
    const outerRadius = this.config.circleOuterRadius || 2.0;
    
    // Generate angle around the circle
    const angle = Math.random() * Math.PI * 2; // 0 to 2π
    
    // Generate radius
    let radius;
    if (innerRadius > 0) {
      // For ring, interpolate between inner and outer
      radius = innerRadius + (outerRadius - innerRadius) * Math.random();
    } else {
      // For solid circle, use square root for uniform area distribution
      radius = outerRadius * Math.sqrt(Math.random());
    }
    
    // Calculate position
    const posX = Math.cos(angle) * radius;
    const posY = Math.sin(angle) * radius;
    
    return [posX, posY, 0]; // Flat on XY plane
  }

  emitFromCylinder() {
    // Generate particles within a cylinder along the Y axis
    const innerRadius = this.config.cylinderInnerRadius || 0;
    const outerRadius = this.config.cylinderOuterRadius || 2.0;
    const cylinderHeight = this.config.cylinderHeight || 4.0;
    
    // Generate angle around the cylinder circumference
    const angle = Math.random() * Math.PI * 2; // 0 to 2π
    
    // Generate radius - similar to circle
    let radius;
    if (innerRadius > 0) {
      // For hollow cylinder, interpolate between inner and outer
      radius = innerRadius + (outerRadius - innerRadius) * Math.random();
    } else {
      // For solid cylinder, use square root for uniform area distribution
      radius = outerRadius * Math.sqrt(Math.random());
    }
    
    // Calculate XZ position (cylinder is aligned along Y axis)
    const posX = Math.cos(angle) * radius;
    const posZ = Math.sin(angle) * radius;
    
    // Random height within the cylinder
    const posY = (Math.random() - 0.5) * cylinderHeight;
    
    return [posX, posY, posZ];
  }

  calculateVelocity(posX, posY, posZ, velocities, velIndex) {
    // Get translation values
    const translateX = this.config.shapeTranslationX || 0;
    const translateY = this.config.shapeTranslationY || 0;
    const translateZ = this.config.shapeTranslationZ || 0;
    
    // Calculate position relative to the translated origin for direction calculation
    const relPosX = posX - translateX;
    const relPosY = posY - translateY;
    const relPosZ = posZ - translateZ;
    
    // Create velocity direction based on position relative to translated origin
    const length = Math.sqrt(relPosX * relPosX + relPosY * relPosY + relPosZ * relPosZ);
    let dirX, dirY, dirZ;
    
    if (length > 0.0001) {
      // Get original position (before rotation and translation) based on shape type
      let origPosX, origPosY, origPosZ;
      let isDirCalculated = false;
      
      // For circle shape with tangential velocity direction
      if (this.config.emissionShape === 'circle' && this.config.circleVelocityDirection === 'tangential') {
        // For circle in XY plane, we need to work with the original unrotated direction
        // First, calculate the inverse rotation to get back to original space
        const origPos = this.inverseRotation(relPosX, relPosY, relPosZ);
        origPosX = origPos[0];
        origPosY = origPos[1];
        origPosZ = origPos[2];
        
        // Calculate tangential direction in original unrotated space
        const xyLength = Math.sqrt(origPosX * origPosX + origPosY * origPosY);
        if (xyLength > 0.0001) {
          // Create a tangential direction vector (perpendicular to radius vector) in XY plane
          const tangentX = -origPosY / xyLength;
          const tangentY = origPosX / xyLength;
          const tangentZ = 0;
          
          // Apply the forward rotation to the tangent to get it in world space
          const rotatedTangent = this.applyRotation(tangentX, tangentY, tangentZ);
          dirX = rotatedTangent[0];
          dirY = rotatedTangent[1];
          dirZ = rotatedTangent[2];
          isDirCalculated = true;
        }
      } 
      // For cylinder with tangential velocity direction
      else if (this.config.emissionShape === 'cylinder' && this.config.cylinderVelocityDirection === 'tangential') {
        // For cylinder aligned along Y-axis, we need to work in original unrotated space
        const origPos = this.inverseRotation(relPosX, relPosY, relPosZ);
        origPosX = origPos[0];
        origPosY = origPos[1];
        origPosZ = origPos[2];
        
        // Compute tangent to the XZ circle in original space
        const xzLength = Math.sqrt(origPosX * origPosX + origPosZ * origPosZ);
        if (xzLength > 0.0001) {
          // Create tangent in XZ plane (Y is preserved)
          const tangentX = -origPosZ / xzLength;
          const tangentY = 0; // No Y component in the tangent (parallel to the cylinder axis)
          const tangentZ = origPosX / xzLength;
          
          // Apply rotation to the tangent to get it in world space
          const rotatedTangent = this.applyRotation(tangentX, tangentY, tangentZ);
          dirX = rotatedTangent[0];
          dirY = rotatedTangent[1];
          dirZ = rotatedTangent[2];
          isDirCalculated = true;
        } else {
          // If on the axis, use random direction in XZ plane
          const randomAngle = Math.random() * Math.PI * 2;
          const tangentX = Math.cos(randomAngle);
          const tangentY = 0;
          const tangentZ = Math.sin(randomAngle);
          
          // Apply rotation to the random tangent
          const rotatedTangent = this.applyRotation(tangentX, tangentY, tangentZ);
          dirX = rotatedTangent[0];
          dirY = rotatedTangent[1];
          dirZ = rotatedTangent[2];
          isDirCalculated = true;
        }
      }
      
      // For all other shapes or if tangent calculation failed
      if (!isDirCalculated) {
        // Default direction away from translated origin
        dirX = relPosX / length;
        dirY = relPosY / length;
        dirZ = relPosZ / length;
      }
    } else {
      // If particle is at the translated origin, create a random direction
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      dirX = Math.sin(phi) * Math.cos(theta);
      dirY = Math.sin(phi) * Math.sin(theta);
      dirZ = Math.cos(phi);
    }
    
    // Determine particle speed (random or fixed)
    let particleSpeed;
    if (this.config.randomSpeed) {
      // Use random speed between min and max speed
      particleSpeed = (this.config.minSpeed || 0) + Math.random() * ((this.config.maxSpeed || 1) - (this.config.minSpeed || 0));
    } else {
      // Use fixed speed
      particleSpeed = this.config.particleSpeed;
    }
    
    // Store velocity vector (scaled by speed)
    if (this.config.overrideXVelocity) {
      velocities[velIndex] = this.config.xVelocity;
    } else {
      velocities[velIndex] = dirX * particleSpeed;
    }
    
    if (this.config.overrideYVelocity) {
      velocities[velIndex + 1] = this.config.yVelocity;
    } else {
      velocities[velIndex + 1] = dirY * particleSpeed;
    }
    
    if (this.config.overrideZVelocity) {
      velocities[velIndex + 2] = this.config.zVelocity;
    } else {
      velocities[velIndex + 2] = dirZ * particleSpeed;
    }
    
    velocities[velIndex + 3] = 0; // padding
  }

  setParticleColor(particleData, particleIndex) {
    // Color
    if (this.config.colorTransitionEnabled) {
      particleData[particleIndex + 3] = this.config.startColor[0];
      particleData[particleIndex + 4] = this.config.startColor[1];
      particleData[particleIndex + 5] = this.config.startColor[2];
    } else {
      particleData[particleIndex + 3] = this.config.particleColor[0];
      particleData[particleIndex + 4] = this.config.particleColor[1];
      particleData[particleIndex + 5] = this.config.particleColor[2];
    }
  }

  setParticleLifetime(particleData, particleIndex) {
    // Age and lifetime - set a lifetime from the config with small variance
    const baseLifetime = this.config.lifetime || 5;
    particleData[particleIndex + 6] = 0; // Age starts at 0
    particleData[particleIndex + 7] = baseLifetime + (Math.random() * 0.4 - 0.2) * baseLifetime; // Add up to ±20% variance
  }
}