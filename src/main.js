async function initWebGPU() {
  if (!navigator.gpu) {
      throw new Error("WebGPU not supported on this browser.");
  }

  const canvas = document.getElementById('webgpu-canvas');
  const context = canvas.getContext('webgpu');

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();

  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
      device: device,
      format: format,
      alphaMode: 'opaque',
  });

  return { device, context, format };
}

async function main() {
  const { device, context, format } = await initWebGPU();
}

main();