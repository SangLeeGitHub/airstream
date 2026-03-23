// AirStream Video Delay — YouTube content script
// Delays video playback by N seconds so it syncs with AirStream audio

let delaySec = 0;
let isActive = false;
let overlay = null;
let delayTimer = null;

// Load saved state on page load
chrome.storage.local.get(['delay', 'active'], (data) => {
  delaySec = data.delay || 5;
  isActive = data.active || false;
  if (isActive) attachToVideo();
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SET_DELAY') {
    delaySec = msg.delay;
    isActive = msg.active;
    if (isActive) {
      attachToVideo();
    } else {
      cleanup();
    }
  }
});

function getVideo() {
  return document.querySelector('video');
}

function attachToVideo() {
  const video = getVideo();
  if (!video) {
    // YouTube SPA — retry until video element appears
    setTimeout(attachToVideo, 500);
    return;
  }

  // Remove old listener to avoid duplicates
  video.removeEventListener('play', onPlay);
  video.addEventListener('play', onPlay);
}

function onPlay(e) {
  if (!isActive || delaySec <= 0) return;

  const video = e.target;

  // Pause immediately
  video.pause();

  // Show countdown overlay
  showOverlay(delaySec);

  let remaining = delaySec;

  if (delayTimer) clearInterval(delayTimer);

  delayTimer = setInterval(() => {
    remaining -= 0.1;
    if (overlay) {
      overlay.textContent = `${remaining.toFixed(1)}s`;
    }
    if (remaining <= 0) {
      clearInterval(delayTimer);
      delayTimer = null;
      hideOverlay();
      video.play();
      // Detach so this delay only happens once per play action
      video.removeEventListener('play', onPlay);
      // Re-attach after a short delay for next play action
      setTimeout(() => {
        if (isActive) video.addEventListener('play', onPlay);
      }, 1000);
    }
  }, 100);
}

function showOverlay(sec) {
  hideOverlay();
  const video = getVideo();
  if (!video) return;

  const container = video.closest('.html5-video-container') || video.parentElement;
  overlay = document.createElement('div');
  overlay.textContent = `${sec.toFixed(1)}s`;
  Object.assign(overlay.style, {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: '10000',
    background: 'rgba(0,0,0,0.7)',
    color: '#fff',
    fontSize: '48px',
    fontWeight: 'bold',
    fontFamily: '-apple-system, sans-serif',
    padding: '20px 40px',
    borderRadius: '16px',
    pointerEvents: 'none'
  });
  container.style.position = 'relative';
  container.appendChild(overlay);
}

function hideOverlay() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}

function cleanup() {
  const video = getVideo();
  if (video) video.removeEventListener('play', onPlay);
  if (delayTimer) {
    clearInterval(delayTimer);
    delayTimer = null;
  }
  hideOverlay();
}

// Handle YouTube SPA navigation
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (isActive) setTimeout(attachToVideo, 1000);
  }
}).observe(document.body, { childList: true, subtree: true });
