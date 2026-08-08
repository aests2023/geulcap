// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('[PWA] Service Worker registered:', reg.scope))
      .catch((err) => console.error('[PWA] Service Worker registration failed:', err));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const dropzone = document.getElementById('dropzone');
  const imageInput = document.getElementById('imageInput');
  const uploadContent = document.getElementById('uploadContent');
  const previewWrapper = document.getElementById('previewWrapper');
  const imagePreviewCanvas = document.getElementById('imagePreviewCanvas');
  const removeBtn = document.getElementById('removeBtn');
  const rotateBtn = document.getElementById('rotateBtn');
  const filterToggle = document.getElementById('filterToggle');
  const scanLine = document.getElementById('scanLine');
  
  const languageSelect = document.getElementById('languageSelect');
  const startBtn = document.getElementById('startBtn');
  
  const progressContainer = document.getElementById('progressContainer');
  const statusText = document.getElementById('statusText');
  const percentText = document.getElementById('percentText');
  const progressBarFill = document.getElementById('progressBarFill');
  
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const resultTextarea = document.getElementById('resultTextarea');
  
  const historyList = document.getElementById('historyList');
  const noHistory = document.getElementById('noHistory');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const copyToast = document.getElementById('copyToast');
  const thresholdSlider = document.getElementById('thresholdSlider');
  const thresholdVal = document.getElementById('thresholdVal');

  // Application State
  let selectedFile = null;
  let originalImage = null;
  let rotationAngle = 0;
  let isProcessing = false;
  let history = JSON.parse(localStorage.getItem('geulcap_history') || '[]');

  // Initialize History UI
  renderHistory();

  // Detect mobile device to update dropzone instructions
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0);
  if (isMobileDevice) {
    uploadContent.innerHTML = `
      <i class="fas fa-camera upload-icon"></i>
      <p style="font-weight: 500; font-size: 1.05rem;">터치하여 사진을 촬영하거나 이미지를 선택하세요</p>
      <span style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem; display: block;">지원 파일: PNG, JPG, JPEG, WEBP 등</span>
    `;
  }

  // --- Image Upload & Drag-and-Drop Handlers ---

  // Click dropzone to open file dialog
  dropzone.addEventListener('click', (e) => {
    if (e.target === removeBtn || removeBtn.contains(e.target)) return;
    imageInput.click();
  });

  // Handle file selection
  imageInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleImageFile(e.target.files[0]);
    }
  });

  // Drag over dropzone
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    }, false);
  });

  // Drag leave dropzone
  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    }, false);
  });

  // Drop file
  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      handleImageFile(files[0]);
    }
  });

  // Paste image from clipboard
  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let item of items) {
      if (item.type.indexOf('image') === 0) {
        const blob = item.getAsFile();
        // Give it a generic name
        blob.name = `Clipboard_Image_${new Date().toISOString().slice(0, 19).replace(/[-:]/g, "")}`;
        handleImageFile(blob);
        break;
      }
    }
  });

  // Handle file reading and display
  function handleImageFile(file) {
    if (isProcessing) return;
    
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      originalImage = new Image();
      originalImage.onload = () => {
        rotationAngle = 0;
        renderCanvas();
        
        uploadContent.style.display = 'none';
        previewWrapper.style.display = 'flex';
        startBtn.disabled = false;
        startBtn.focus();
      };
      originalImage.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Remove image button
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetUploadState();
  });

  function resetUploadState() {
    selectedFile = null;
    originalImage = null;
    rotationAngle = 0;
    imageInput.value = '';
    
    // Clear canvas
    const ctx = imagePreviewCanvas.getContext('2d');
    ctx.clearRect(0, 0, imagePreviewCanvas.width, imagePreviewCanvas.height);
    
    previewWrapper.style.display = 'none';
    uploadContent.style.display = 'block';
    startBtn.disabled = true;
    scanLine.style.display = 'none';
    progressContainer.style.display = 'none';
    progressBarFill.style.width = '0%';
  }

  // --- OCR Processing via Tesseract.js ---

  startBtn.addEventListener('click', async () => {
    if (!selectedFile || isProcessing) return;

    isProcessing = true;
    startBtn.disabled = true;
    languageSelect.disabled = true;
    removeBtn.style.display = 'none';
    
    // UI Visual states
    scanLine.style.display = 'block';
    progressContainer.style.display = 'block';
    progressBarFill.style.width = '0%';
    statusText.textContent = '엔진 대기 중...';
    percentText.textContent = '0%';
    resultTextarea.value = '';
    copyBtn.disabled = true;
    downloadBtn.disabled = true;

    try {
      const lang = languageSelect.value;
      
      // Perform OCR using high-accuracy 'tessdata_best' models
      const result = await Tesseract.recognize(
        imagePreviewCanvas,
        lang,
        {
          logger: m => {
            if (m.status === 'recognizing text') {
              const progress = Math.round(m.progress * 100);
              statusText.textContent = '이미지 분석 및 판독 중...';
              percentText.textContent = `${progress}%`;
              progressBarFill.style.width = `${progress}%`;
            } else {
              statusText.textContent = translateTesseractStatus(m.status);
              if (m.status.includes('loading')) {
                progressBarFill.style.width = '25%';
              } else if (m.status.includes('init')) {
                progressBarFill.style.width = '45%';
              }
            }
          },
          langPath: 'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_best@master',
          gzip: false
        }
      );

      let text = result.data.text.trim();
      if (text) {
        // Apply spell correction for common OCR errors (especially ㅇ vs ㅁ 받침)
        text = postProcessCorrection(text);
        
        resultTextarea.value = text;
        copyBtn.disabled = false;
        downloadBtn.disabled = false;
        
        // Save to History
        const fileName = selectedFile.name || '클립보드 이미지';
        addHistoryItem(text, fileName);
      } else {
        resultTextarea.value = '이미지에서 한글이나 영어를 검출하지 못했습니다. 글씨가 흐릿하거나 다른 언어인지 확인해주세요.';
      }
      
    } catch (error) {
      console.error('OCR Error:', error);
      alert('글씨 추출 중 오류가 발생했습니다. 파일이 정상이거나 브라우저 인터넷 연결 상태를 확인해주세요.');
      resultTextarea.value = '오류 발생: ' + error.message;
    } finally {
      isProcessing = false;
      startBtn.disabled = false;
      languageSelect.disabled = false;
      removeBtn.style.display = 'flex';
      scanLine.style.display = 'none';
      
      // Keep progress container visible for 1s then fade out
      setTimeout(() => {
        if (!isProcessing) {
          progressContainer.style.display = 'none';
        }
      }, 1500);
    }
  });

  // Tesseract Status Translations
  function translateTesseractStatus(status) {
    const statusMap = {
      'loading tesseract core': 'OCR 엔진 핵심 코어 파일 로딩 중...',
      'initializing tesseract': '인식 모델 엔진 초기화 중...',
      'initialized tesseract': '엔진 초기화 완료',
      'loading language traineddata': '선택한 언어 사전 모델 파일 다운로드 중 (수초 소요)...',
      'loaded language traineddata': '언어 데이터 다운로드 완료',
      'initializing api': '분석 인터페이스 설정 중...',
      'initialized api': '판독 준비 완료',
      'recognizing text': '이미지 텍스트 스캔 및 디지털화 진행 중...'
    };
    return statusMap[status] || '분석 모듈 처리 중...';
  }

  // --- Copy and Download Handlers ---

  // Copy to clipboard
  copyBtn.addEventListener('click', () => {
    const text = resultTextarea.value;
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
      // Toggle button visual effect
      copyBtn.classList.add('active');
      copyBtn.innerHTML = '<i class="fas fa-check"></i> 복사 완료';
      
      // Toast notice
      copyToast.classList.add('show');
      
      setTimeout(() => {
        copyBtn.classList.remove('active');
        copyBtn.innerHTML = '<i class="far fa-copy"></i> 복사';
        copyToast.classList.remove('show');
      }, 2000);
    }).catch(err => {
      console.error('Copy failed:', err);
    });
  });

  // Download text file
  downloadBtn.addEventListener('click', () => {
    const text = resultTextarea.value;
    if (!text) return;

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // Format current time for filename
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, "");
    const fileName = `GeulCap_OCR_${dateStr}_${timeStr}.txt`;
    
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });

  // --- History Management ---

  function addHistoryItem(text, filename) {
    const newItem = {
      id: Date.now().toString(),
      text: text,
      filename: filename,
      timestamp: formatCurrentDate()
    };

    // Prepend to history array (max 12 items)
    history.unshift(newItem);
    if (history.length > 12) {
      history.pop();
    }

    localStorage.setItem('geulcap_history', JSON.stringify(history));
    renderHistory();
  }

  function renderHistory() {
    if (history.length === 0) {
      noHistory.style.display = 'flex';
      clearHistoryBtn.style.display = 'none';
      // Keep only placeholder in list
      historyList.innerHTML = '';
      historyList.appendChild(noHistory);
      return;
    }

    noHistory.style.display = 'none';
    clearHistoryBtn.style.display = 'inline-block';
    
    historyList.innerHTML = '';
    
    history.forEach(item => {
      const card = document.createElement('div');
      card.className = 'history-item';
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `${item.filename}에서 추출한 텍스트 기록`);

      card.innerHTML = `
        <div class="history-text">${escapeHTML(item.text)}</div>
        <div class="history-footer">
          <span class="history-footer-time" title="${item.filename}">
            <i class="far fa-file-image"></i> ${truncateFilename(item.filename, 18)}
          </span>
          <span class="history-footer-time">
            <i class="far fa-clock"></i> ${item.timestamp}
          </span>
          <button class="history-delete-btn" data-id="${item.id}" title="기록 삭제" aria-label="기록 삭제">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;

      // Click to load history content to main textarea
      card.addEventListener('click', (e) => {
        // Prevent action if clicking the delete button
        if (e.target.closest('.history-delete-btn')) return;
        
        resultTextarea.value = item.text;
        copyBtn.disabled = false;
        downloadBtn.disabled = false;
        
        // Highlight active textarea
        resultTextarea.focus();
        resultTextarea.select();
        
        // Visual cue toast
        showToast('과거 기록의 텍스트를 결과창에 로드했습니다.');
      });

      // Keyboard support
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });

      historyList.appendChild(card);
    });

    // Wire delete buttons
    document.querySelectorAll('.history-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const itemId = btn.getAttribute('data-id');
        deleteHistoryItem(itemId);
      });
    });
  }

  function deleteHistoryItem(id) {
    history = history.filter(item => item.id !== id);
    localStorage.setItem('geulcap_history', JSON.stringify(history));
    renderHistory();
  }

  clearHistoryBtn.addEventListener('click', () => {
    if (confirm('모든 텍스트 추출 기록을 삭제하시겠습니까?')) {
      history = [];
      localStorage.removeItem('geulcap_history');
      renderHistory();
    }
  });

  // --- Utility Functions ---

  function formatCurrentDate() {
    const now = new Date();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${MM}/${DD} ${hh}:${mm}`;
  }

  function truncateFilename(name, length) {
    if (name.length <= length) return name;
    const extIdx = name.lastIndexOf('.');
    if (extIdx === -1) return name.substring(0, length) + '...';
    
    const ext = name.substring(extIdx);
    const base = name.substring(0, extIdx);
    const allowedBaseLength = length - ext.length - 3;
    
    if (allowedBaseLength <= 0) return name.substring(0, length) + '...';
    return base.substring(0, allowedBaseLength) + '...' + ext;
  }

  function escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(message) {
    // Custom message toast
    const span = copyToast.querySelector('span');
    const icon = copyToast.querySelector('i');
    
    const originalText = span.textContent;
    const originalIcon = icon.className;
    
    span.textContent = message;
    icon.className = 'fas fa-info-circle';
    copyToast.style.background = 'rgba(99, 102, 241, 0.9)';
    copyToast.style.boxShadow = '0 8px 24px rgba(99, 102, 241, 0.3)';
    copyToast.classList.add('show');
    
    setTimeout(() => {
      copyToast.classList.remove('show');
      
      // Reset after animation ends
      setTimeout(() => {
        span.textContent = originalText;
        icon.className = originalIcon;
        copyToast.style.background = '';
        copyToast.style.boxShadow = '';
      }, 400);
    }, 2000);
  }

  // --- Image Processing & Canvas Render ---

  rotateBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!originalImage || isProcessing) return;
    rotationAngle = (rotationAngle + 90) % 360;
    renderCanvas();
  });

  filterToggle.addEventListener('change', () => {
    if (!originalImage || isProcessing) return;
    renderCanvas();
  });

  thresholdSlider.addEventListener('input', () => {
    const t = parseInt(thresholdSlider.value);
    let label = '보통';
    if (t < 7) label = '아주 얇게';
    else if (t < 10) label = '얇게';
    else if (t < 13) label = '보통';
    else if (t < 16) label = '굵게';
    else label = '아주 굵게';
    
    thresholdVal.textContent = `${label} (${t})`;
    
    if (!originalImage || isProcessing) return;
    renderCanvas();
  });

  function renderCanvas() {
    if (!originalImage) return;

    const ctx = imagePreviewCanvas.getContext('2d');
    const angle = rotationAngle;
    const applyFilter = filterToggle.checked;
    
    const isRotated = (angle / 90) % 2 === 1;
    const width = isRotated ? originalImage.naturalHeight : originalImage.naturalWidth;
    const height = isRotated ? originalImage.naturalWidth : originalImage.naturalHeight;
    
    // Dynamic Upscaling: scale up image to have at least 2200px width for smooth characters
    let scale = 1.0;
    const targetWidth = 2200;
    if (width < targetWidth) {
      scale = targetWidth / width;
    }
    scale = Math.max(1.0, Math.min(scale, 3.0)); // Cap scaling at 3x to prevent memory lag
    
    const canvasWidth = Math.round(width * scale);
    const canvasHeight = Math.round(height * scale);
    
    imagePreviewCanvas.width = canvasWidth;
    imagePreviewCanvas.height = canvasHeight;
    
    // Draw rotated and scaled image
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.save();
    ctx.translate(canvasWidth / 2, canvasHeight / 2);
    ctx.rotate((angle * Math.PI) / 180);
    
    const drawW = originalImage.naturalWidth * scale;
    const drawH = originalImage.naturalHeight * scale;
    ctx.drawImage(originalImage, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
    
    if (applyFilter) {
      const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
      const filteredData = adaptiveThreshold(imageData);
      ctx.putImageData(filteredData, 0, 0);
      
      // Clean up 12px outer border to eliminate scanning/shadow edge noise
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvasWidth, 12); // Top border
      ctx.fillRect(0, canvasHeight - 12, canvasWidth, 12); // Bottom border
      ctx.fillRect(0, 0, 12, canvasHeight); // Left border
      ctx.fillRect(canvasWidth - 12, 0, 12, canvasHeight); // Right border
    }
  }

  // Optimized Bradley-Roth Adaptive Thresholding using Integral Image & Weighted Gaussian-like Blur
  function adaptiveThreshold(srcImageData) {
    const width = srcImageData.width;
    const height = srcImageData.height;
    const srcData = srcImageData.data;
    
    const gray = new Uint8Array(width * height);
    const blurred = new Uint8Array(width * height);
    const integral = new Uint32Array(width * height);
    
    // 1. Grayscale conversion
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      gray[i] = Math.round(0.299 * srcData[idx] + 0.587 * srcData[idx+1] + 0.114 * srcData[idx+2]);
    }
    
    // 2. Weighted 3x3 Gaussian-like Blur to smooth out noise while preserving square corners of 'ㅁ'
    const weights = [
      1, 2, 1,
      2, 4, 2,
      1, 2, 1
    ];
    for (let y = 0; y < height; y++) {
      const yOffset = y * width;
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let weightSum = 0;
        
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny >= 0 && ny < height) {
            const nyOffset = ny * width;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              if (nx >= 0 && nx < width) {
                const w = weights[(dy + 1) * 3 + (dx + 1)];
                sum += gray[nyOffset + nx] * w;
                weightSum += w;
              }
            }
          }
        }
        blurred[yOffset + x] = Math.round(sum / weightSum);
      }
    }
    
    // 3. Compute Integral Image of the blurred gray image
    for (let y = 0; y < height; y++) {
      let sum = 0;
      const yOffset = y * width;
      const prevYOffset = (y - 1) * width;
      for (let x = 0; x < width; x++) {
        const val = blurred[yOffset + x];
        sum += val;
        if (y === 0) {
          integral[yOffset + x] = sum;
        } else {
          integral[yOffset + x] = integral[prevYOffset + x] + sum;
        }
      }
    }
    
    const dstImageData = new ImageData(width, height);
    const dstData = dstImageData.data;
    
    // Window size (S) relative to image dimensions, capped between 15 and 45 to keep small fonts sharp
    const S = Math.max(15, Math.min(Math.round(Math.min(width, height) / 24) | 1, 45)) | 1;
    const halfS = Math.floor(S / 2);
    
    // Dynamic Threshold from user slider
    const t = parseInt(thresholdSlider.value);
    
    // 4. Perform thresholding using blurred values
    for (let y = 0; y < height; y++) {
      const yOffset = y * width;
      for (let x = 0; x < width; x++) {
        const idx = (yOffset + x) * 4;
        
        const x1 = Math.max(x - halfS, 0);
        const x2 = Math.min(x + halfS, width - 1);
        const y1 = Math.max(y - halfS, 0);
        const y2 = Math.min(y + halfS, height - 1);
        
        const count = (x2 - x1 + 1) * (y2 - y1 + 1);
        
        let sum = integral[y2 * width + x2];
        if (x1 > 0) sum -= integral[y2 * width + (x1 - 1)];
        if (y1 > 0) sum -= integral[(y1 - 1) * width + x2];
        if (x1 > 0 && y1 > 0) sum += integral[(y1 - 1) * width + (x1 - 1)];
        
        const curr = blurred[yOffset + x];
        
        // If current intensity is darker than the local average, set to black (text), else white
        if (curr * count < sum * (100 - t) / 100) {
          dstData[idx] = 0;
          dstData[idx+1] = 0;
          dstData[idx+2] = 0;
          dstData[idx+3] = 255;
        } else {
          dstData[idx] = 255;
          dstData[idx+1] = 255;
          dstData[idx+2] = 255;
          dstData[idx+3] = 255;
        }
      }
    }
    
    return dstImageData;
  }

  // Spell correction for common OCR receipt errors (especially 'ㅇ' vs 'ㅁ'받침 confusions)
  function postProcessCorrection(text) {
    const corrections = {
      '염수즘': '영수증',
      '영수즘': '영수증',
      '염수증': '영수증',
      '삼품명': '상품명',
      '슴인': '승인',
      '가맹정': '가맹점',
      '부과세': '부가세',
      '대접방': '대접밥',
      '남풍': '낭풍',
      '남품': '낭풍',
      '낭품': '낭풍',
      '좀류': '종류',
      '/1울': '서울',
      '|1울': '서울'
    };
    
    let corrected = text;
    for (const [wrong, right] of Object.entries(corrections)) {
      corrected = corrected.split(wrong).join(right);
    }
    return corrected;
  }
});
