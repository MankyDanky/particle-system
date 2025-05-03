/**
 * Scene Manager for saving and loading particle system scenes
 * Handles serializing particle systems to JSON and loading them from files
 */

/**
 * Save the current scene to a JSON file
 * @param {Object} particleSystemManager - The particle system manager containing all systems
 */
export function saveScene(particleSystemManager) {
  if (!particleSystemManager || !particleSystemManager.particleSystems || particleSystemManager.particleSystems.length === 0) {
    alert("No particle systems to save.");
    return;
  }

  try {
    // Extract the serializable configurations from each particle system
    const scene = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      systems: particleSystemManager.particleSystems.map(({ config }) => ({
        // Include only the serializable properties of each system
        name: config.name,
        id: config.id,
        particleCount: config.particleCount,
        lifetime: config.lifetime,
        emissionRate: config.emissionRate,
        emissionDuration: config.emissionDuration,
        particleSize: config.particleSize,
        particleSpeed: config.particleSpeed,
        emissionShape: config.emissionShape,
        cubeLength: config.outerLength || config.cubeLength, // Always use outerLength if available
        outerLength: config.outerLength || config.cubeLength, // Keep them synchronized
        innerLength: config.innerLength,
        outerRadius: config.outerRadius,
        innerRadius: config.innerRadius,
        squareSize: config.squareSize,
        squareInnerSize: config.squareInnerSize,
        circleInnerRadius: config.circleInnerRadius,
        circleOuterRadius: config.circleOuterRadius,
        fadeEnabled: config.fadeEnabled,
        colorTransitionEnabled: config.colorTransitionEnabled,
        particleColor: config.particleColor,
        startColor: config.startColor,
        endColor: config.endColor,
        bloomEnabled: config.bloomEnabled,
        bloomIntensity: config.bloomIntensity,
        burstMode: config.burstMode,
        gravityEnabled: config.gravityEnabled,
        gravityStrength: config.gravityStrength,
        dampingEnabled: config.dampingEnabled,
        dampingStrength: config.dampingStrength,
        attractorEnabled: config.attractorEnabled,
        attractorStrength: config.attractorStrength,
        attractorPosition: config.attractorPosition,
        shapeRotationX: config.shapeRotationX,
        shapeRotationY: config.shapeRotationY,
        shapeRotationZ: config.shapeRotationZ,
        rotation: config.rotation,
        rotationMode: config.rotationMode, 
        minRotation: config.minRotation,
        maxRotation: config.maxRotation,
        overrideXVelocity: config.overrideXVelocity,
        overrideYVelocity: config.overrideYVelocity,
        overrideZVelocity: config.overrideZVelocity,
        xVelocity: config.xVelocity,
        yVelocity: config.yVelocity,
        zVelocity: config.zVelocity,
        circleVelocityDirection: config.circleVelocityDirection,
        cylinderVelocityDirection: config.cylinderVelocityDirection,
        cylinderInnerRadius: config.cylinderInnerRadius,
        cylinderOuterRadius: config.cylinderOuterRadius,
        cylinderHeight: config.cylinderHeight,
        aspectRatio: config.aspectRatio,
        randomSize: config.randomSize,
        minSize: config.minSize,
        maxSize: config.maxSize,
        fadeSizeEnabled: config.fadeSizeEnabled,
        opacity: config.opacity,
        randomSpeed: config.randomSpeed,
        minSpeed: config.minSpeed,
        maxSpeed: config.maxSpeed,
      })),
      activeSystemIndex: particleSystemManager.activeSystemIndex
    };

    // Convert to JSON string
    const sceneJSON = JSON.stringify(scene, null, 2);
    
    // Create file name with timestamp
    const date = new Date();
    const timestamp = `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}`;
    const filename = `particle-scene_${timestamp}.json`;
    
    // Create a blob and download link
    const blob = new Blob([sceneJSON], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = filename;
    
    // Trigger download
    document.body.appendChild(downloadLink);
    downloadLink.click();
    
    // Clean up
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error("Error saving scene:", error);
    alert("Error saving scene. See console for details.");
  }
}

/**
 * Load particle systems from a JSON file
 * @param {Event} event - The file input change event that contains the selected file
 * @returns {Promise<Object>} - Promise resolving to the loaded scene data
 */
export function loadScene(event) {
  return new Promise((resolve, reject) => {
    try {
      // Get the file from the event directly
      const file = event.target.files[0];
      if (!file) {
        reject(new Error("No file selected"));
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const sceneData = JSON.parse(e.target.result);
          
          // Check version compatibility
          if (!sceneData.version) {
            throw new Error("Invalid scene file: missing version information");
          }
          
          // Process each system configuration
          if (!Array.isArray(sceneData.systems) || sceneData.systems.length === 0) {
            throw new Error("No valid particle systems found in the file");
          }
          
          // Initialize the result
          const loadedSystems = [];
          
          // Create new particle systems from the configuration
          for (const systemConfig of sceneData.systems) {
            loadedSystems.push(systemConfig);
          }
          
          resolve({
            systems: loadedSystems,
            activeSystemIndex: sceneData.activeSystemIndex || 0
          });
          
        } catch (error) {
          console.error("Error loading scene:", error);
          alert("Error loading scene: " + error.message);
          reject(error);
        }
        
        // Reset the file input
        event.target.value = '';
      };
      
      reader.onerror = () => {
        alert("Failed to read the file");
        reject(new Error("Failed to read the file"));
        // Reset the file input
        event.target.value = '';
      };
      
      // Read the file
      reader.readAsText(file);
    } catch (error) {
      console.error("Error in loadScene:", error);
      reject(error);
    }
  });
}