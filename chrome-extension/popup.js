const delayInput = document.getElementById('delay');
const toggleBtn = document.getElementById('toggle');
const statusEl = document.getElementById('status');

let isActive = false;

// Load saved state
chrome.storage.local.get(['delay', 'active'], (data) => {
  if (data.delay !== undefined) delayInput.value = data.delay;
  if (data.active) {
    isActive = true;
    updateUI();
  }
});

function setDelay(val) {
  delayInput.value = val;
  chrome.storage.local.set({ delay: val });
  if (isActive) sendToContent();
}
window.setDelay = setDelay;

delayInput.addEventListener('change', () => {
  chrome.storage.local.set({ delay: parseFloat(delayInput.value) });
  if (isActive) sendToContent();
});

toggleBtn.addEventListener('click', () => {
  isActive = !isActive;
  chrome.storage.local.set({ active: isActive });
  updateUI();
  sendToContent();
});

function updateUI() {
  if (isActive) {
    toggleBtn.textContent = '딜레이 해제';
    toggleBtn.classList.add('active');
    statusEl.textContent = `${delayInput.value}초 딜레이 적용 중`;
  } else {
    toggleBtn.textContent = '딜레이 적용';
    toggleBtn.classList.remove('active');
    statusEl.textContent = 'YouTube 페이지에서 사용하세요';
  }
}

function sendToContent() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'SET_DELAY',
        delay: isActive ? parseFloat(delayInput.value) : 0,
        active: isActive
      });
    }
  });
}
