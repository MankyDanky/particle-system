// Mobile UI handling for responsive design

export function initMobileUI() {
  // Get elements
  const controlsPanel = document.querySelector('.controls');
  const systemsPanel = document.getElementById('particle-systems-list');
  const examplesPanel = document.getElementById('examples-panel');
  const overlay = document.getElementById('mobile-overlay');
  
  // Toggle buttons
  const controlsToggle = document.getElementById('controls-toggle');
  const systemsToggle = document.getElementById('systems-toggle');
  const examplesToggle = document.getElementById('examples-toggle');
  
  // Close buttons
  const controlsClose = document.getElementById('controls-close');
  const systemsClose = document.getElementById('systems-close');
  const examplesClose = document.getElementById('examples-close');
  
  // Helper function to close all panels
  function closeAllPanels() {
    controlsPanel?.classList.remove('mobile-visible');
    systemsPanel?.classList.remove('mobile-visible');
    examplesPanel?.classList.remove('mobile-visible');
    overlay?.classList.remove('active');
  }
  
  // Helper function to open a panel
  function openPanel(panel) {
    closeAllPanels();
    panel?.classList.add('mobile-visible');
    overlay?.classList.add('active');
  }
  
  // Toggle button event listeners
  controlsToggle?.addEventListener('click', () => {
    if (controlsPanel?.classList.contains('mobile-visible')) {
      closeAllPanels();
    } else {
      openPanel(controlsPanel);
    }
  });
  
  systemsToggle?.addEventListener('click', () => {
    if (systemsPanel?.classList.contains('mobile-visible')) {
      closeAllPanels();
    } else {
      openPanel(systemsPanel);
    }
  });
  
  examplesToggle?.addEventListener('click', () => {
    if (examplesPanel?.classList.contains('mobile-visible')) {
      closeAllPanels();
    } else {
      openPanel(examplesPanel);
    }
  });
  
  // Close button event listeners
  controlsClose?.addEventListener('click', closeAllPanels);
  systemsClose?.addEventListener('click', closeAllPanels);
  examplesClose?.addEventListener('click', closeAllPanels);
  
  // Close panels when clicking overlay
  overlay?.addEventListener('click', closeAllPanels);
  
  // Close panels when pressing Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllPanels();
    }
  });
  
  // Handle window resize - close panels if resizing to desktop
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    const currentWidth = window.innerWidth;
    // If resizing from mobile to desktop, close panels
    if (lastWidth <= 768 && currentWidth > 768) {
      closeAllPanels();
    }
    lastWidth = currentWidth;
  });
  
  // Prevent touch events on panels from closing them
  [controlsPanel, systemsPanel, examplesPanel].forEach(panel => {
    panel?.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });
}

// Export a function to programmatically close panels (useful for other modules)
export function closeMobilePanels() {
  const controlsPanel = document.querySelector('.controls');
  const systemsPanel = document.getElementById('particle-systems-list');
  const examplesPanel = document.getElementById('examples-panel');
  const overlay = document.getElementById('mobile-overlay');
  
  controlsPanel?.classList.remove('mobile-visible');
  systemsPanel?.classList.remove('mobile-visible');
  examplesPanel?.classList.remove('mobile-visible');
  overlay?.classList.remove('active');
}
