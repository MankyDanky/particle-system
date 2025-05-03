export class ParticleTextureManager {
  constructor(device) {
    this.device = device;
    this.defaultTexture = null;
    this.createDefaultTexture();
  }

  createDefaultTexture() {
    // Create a 1x1 white texture as the default
    const data = new Uint8Array([255, 255, 255, 255]);
    
    this.defaultTexture = this.device.createTexture({
      size: [1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      label: "defaultParticleTexture"
    });

    this.device.queue.writeTexture(
      { texture: this.defaultTexture },
      data,
      { bytesPerRow: 4 },
      [1, 1]
    );
  }
  
  // Load a texture from an ImageBitmap
  async loadTexture(imageBitmap) {
    // Create texture from the image
    const texture = this.device.createTexture({
      size: [imageBitmap.width, imageBitmap.height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      label: "particleTexture"
    });
    
    this.device.queue.copyExternalImageToTexture(
      { source: imageBitmap },
      { texture },
      [imageBitmap.width, imageBitmap.height]
    );
    
    return texture;
  }
  
  getDefaultTexture() {
    return this.defaultTexture;
  }
  
  destroyTexture(texture) {
    if (texture && texture.label !== "defaultParticleTexture") {
      texture.destroy();
    }
  }
}