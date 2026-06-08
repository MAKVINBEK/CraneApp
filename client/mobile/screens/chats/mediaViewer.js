// State
        let currentMedia = null;
        let isZoomed = false;
        let touchStartX = 0, touchStartY = 0;
        let touchStartTime = 0;
        let lastTap = 0;

        // Get params
        const urlParams = new URLSearchParams(window.location.search);
        const mediaUrl = urlParams.get('url');
        const mediaType = urlParams.get('type') || 'image';
        const caption = urlParams.get('caption') || '';
        const messageId = urlParams.get('messageId');
        const chatId = urlParams.get('chatId');
        const senderName = urlParams.get('sender') || '';

        // Elements
        const imageContent = document.getElementById('imageContent');
        const videoContent = document.getElementById('videoContent');
        const loadingIndicator = document.getElementById('loadingIndicator');
        const captionEl = document.getElementById('caption');
        const mediaWrapper = document.getElementById('mediaWrapper');
        const videoTime = document.getElementById('videoTime');
        const headerTitle = document.getElementById('headerTitle');

        // Initialize
        function init() {
            currentMedia = {
                url: mediaUrl,
                type: mediaType,
                caption: caption,
                messageId: messageId,
                chatId: chatId
            };

            // Set title
            headerTitle.textContent = senderName || getMediaTypeName(mediaType);

            // Show caption
            if (caption) {
                captionEl.textContent = caption;
                captionEl.classList.add('visible');
            }

            // Load media based on type
            if (mediaType === 'video' || mediaType === 'gif') {
                loadVideo(mediaUrl, mediaType === 'gif');
            } else {
                loadImage(mediaUrl);
            }

            setupGestures();
        }

        function getMediaTypeName(type) {
            const names = {
                image: 'Фото',
                photo: 'Фото',
                video: 'Видео',
                gif: 'GIF',
                sticker: 'Стикер'
            };
            return names[type] || 'Медиа';
        }

        // Load image
        function loadImage(url) {
            imageContent.style.display = 'block';
            videoContent.style.display = 'none';
            
            if (url) {
                imageContent.src = url;
                imageContent.onload = () => {
                    loadingIndicator.style.display = 'none';
                };
                imageContent.onerror = () => {
                    loadingIndicator.querySelector('.loading-text').textContent = 'Ошибка загрузки';
                };
            } else {
                // Demo mode
                imageContent.src = 'https://via.placeholder.com/800x600/1E1E1E/FF007F?text=CraneApp+Media';
                loadingIndicator.style.display = 'none';
            }
        }

        // Load video
        function loadVideo(url, isGif = false) {
            imageContent.style.display = 'none';
            videoContent.style.display = 'block';
            videoTime.style.display = isGif ? 'none' : 'block';

            if (url) {
                videoContent.src = url;
                videoContent.loop = isGif;
                videoContent.muted = isGif; // Auto-play GIFs muted
                videoContent.playsInline = true;
                
                videoContent.onloadedmetadata = () => {
                    loadingIndicator.style.display = 'none';
                    updateVideoTime();
                    
                    if (isGif) {
                        videoContent.play().catch(() => {});
                    }
                };
                
                videoContent.onerror = () => {
                    loadingIndicator.querySelector('.loading-text').textContent = 'Ошибка загрузки';
                };

                // Video controls
                if (!isGif) {
                    setupVideoControls();
                }
            } else {
                // Demo mode
                videoContent.src = 'https://www.w3schools.com/html/mov_bbb.mp4';
                loadingIndicator.style.display = 'none';
            }
        }

        // Video controls
        function setupVideoControls() {
            videoContent.addEventListener('click', togglePlayPause);
            videoContent.addEventListener('timeupdate', updateVideoProgress);
            videoContent.addEventListener('ended', () => {
                videoContent.currentTime = 0;
            });

            // Show controls on tap
            videoContent.addEventListener('click', () => {
                const controls = document.querySelector('.video-controls');
                controls.classList.add('visible');
                setTimeout(() => {
                    controls.classList.remove('visible');
                }, 3000);
            });
        }

        function togglePlayPause() {
            if (videoContent.paused) {
                videoContent.play();
            } else {
                videoContent.pause();
            }
        }

        function updateVideoProgress() {
            const percent = (videoContent.currentTime / videoContent.duration) * 100;
            
            // Create progress bar if not exists
            let progress = document.querySelector('.video-progress');
            if (!progress) {
                createVideoControls();
            }
            
            const fill = document.querySelector('.video-progress-fill');
            if (fill) {
                fill.style.width = percent + '%';
            }
            
            updateVideoTime();
        }

        function createVideoControls() {
            const container = document.getElementById('viewerContainer');
            
            const progress = document.createElement('div');
            progress.className = 'video-progress';
            progress.innerHTML = '<div class="video-progress-fill"></div>';
            progress.onclick = seekVideo;
            container.appendChild(progress);

            const buttons = document.createElement('div');
            buttons.className = 'video-controls visible';
            buttons.innerHTML = `
                <div class="video-buttons">
                    <button class="video-btn" onclick="togglePlayPause()">⏮</button>
                    <button class="video-btn" onclick="togglePlayPause()" id="playPauseBtn">⏸</button>
                    <button class="video-btn" onclick="togglePlayPause()">⏭</button>
                    <button class="video-btn" onclick="toggleFullscreen()">⛶</button>
                </div>
            `;
            container.appendChild(buttons);
        }

        function updateVideoTime() {
            const current = formatTime(videoContent.currentTime || 0);
            const total = formatTime(videoContent.duration || 0);
            videoTime.textContent = `${current} / ${total}`;
        }

        function formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        function seekVideo(e) {
            const rect = e.target.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            videoContent.currentTime = percent * videoContent.duration;
        }

        function toggleFullscreen() {
            const fullscreen = document.getElementById('fullscreenVideo');
            const fullscreenVideo = document.getElementById('fullscreenVideoElement');
            
            if (fullscreen.classList.contains('active')) {
                fullscreen.classList.remove('active');
                fullscreenVideo.pause();
                fullscreenVideo.src = '';
            } else {
                fullscreenVideo.src = videoContent.src;
                fullscreen.classList.add('active');
                fullscreenVideo.play();
                
                // Exit fullscreen on back gesture
                fullscreenVideo.addEventListener('ended', () => {
                    fullscreen.classList.remove('active');
                });
            }
        }

        // Gestures
        function setupGestures() {
            const container = document.getElementById('viewerContainer');

            // Touch events
            container.addEventListener('touchstart', handleTouchStart, { passive: true });
            container.addEventListener('touchend', handleTouchEnd, { passive: true });
            container.addEventListener('touchmove', handleTouchMove, { passive: true });

            // Mouse/click for zoom
            imageContent.addEventListener('click', handleClick);
            imageContent.addEventListener('dblclick', handleDoubleClick);
        }

        function handleTouchStart(e) {
            if (e.touches.length === 1) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                touchStartTime = Date.now();
            }
        }

        function handleTouchMove(e) {
            if (e.touches.length === 1 && !isZoomed) {
                const diffX = e.touches[0].clientX - touchStartX;
                const diffY = e.touches[0].clientY - touchStartY;
                
                // Horizontal swipe
                if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
                    // Could implement gallery navigation here
                }
                
                // Vertical swipe to close
                if (diffY > 100) {
                    closeViewer();
                }
            }
        }

        function handleTouchEnd(e) {
            const touchDuration = Date.now() - touchStartTime;
            
            // Double tap detection
            const now = Date.now();
            if (now - lastTap < 300) {
                handleDoubleClick(e.changedTouches[0]);
                lastTap = 0;
                return;
            }
            lastTap = now;

            // Long press
            if (touchDuration > 500) {
                showContextMenu();
            }
        }

        function handleClick(e) {
            if (mediaType === 'video') {
                togglePlayPause();
                return;
            }
            
            // Single tap - toggle UI
            const header = document.querySelector('.header');
            const actions = document.querySelector('.actions-bar');
            const captionEl = document.querySelector('.caption');
            
            const isHidden = header.style.opacity === '0';
            header.style.opacity = isHidden ? '1' : '0';
            actions.style.opacity = isHidden ? '1' : '0';
            if (captionEl.textContent) {
                captionEl.classList.toggle('visible', isHidden);
            }
        }

        function handleDoubleClick(e) {
            const rect = imageContent.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            if (isZoomed) {
                // Zoom out
                imageContent.classList.remove('zoomed');
                imageContent.style.transform = 'scale(1)';
                isZoomed = false;
            } else {
                // Zoom in at point
                imageContent.classList.add('zoomed');
                
                // Calculate transform origin based on tap position
                const percentX = (x / rect.width) * 100;
                const percentY = (y / rect.height) * 100;
                imageContent.style.transformOrigin = `${percentX}% ${percentY}%`;
                imageContent.style.transform = 'scale(2)';
                isZoomed = true;
            }
        }

        // Actions
        function closeViewer() {
            // Check if there's a history state
            if (window.history.length > 1) {
                window.history.back();
            } else {
                // Fallback to chats
                window.location.href = 'chats.html';
            }
        }

        function showContextMenu() {
            // Could show native context menu
            showShareSheet();
        }

        function showShareSheet() {
            document.getElementById('shareOverlay').classList.add('active');
        }

        function hideShareSheet(e) {
            if (!e || e.target.id === 'shareOverlay') {
                document.getElementById('shareOverlay').classList.remove('active');
            }
        }

        async function shareVia(method) {
            hideShareSheet();
            
            switch (method) {
                case 'copy':
                    if (mediaUrl) {
                        await navigator.clipboard.writeText(mediaUrl);
                        showToast('Скопировано');
                    }
                    break;
                case 'save':
                    saveMedia();
                    break;
                case 'messages':
                    showToast('Пересылка скоро');
                    break;
                case 'story':
                    showToast('Истории скоро');
                    break;
            }
        }

        function saveMedia() {
            if (!mediaUrl || mediaUrl.startsWith('data:') || mediaUrl.includes('placeholder.com')) {
                showToast('Невозможно сохранить', '❌');
                return;
            }

            // Create download link
            const a = document.createElement('a');
            a.href = mediaUrl;
            a.download = 'craneapp_' + Date.now();
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            showToast('Сохранено', '✅');
        }

        function replyToMedia() {
            // Send message to parent window
            if (window.opener) {
                window.opener.postMessage({
                    type: 'reply_to_media',
                    messageId: messageId,
                    chatId: chatId,
                    mediaUrl: mediaUrl,
                    mediaType: mediaType
                }, '*');
            }
            closeViewer();
        }

        function deleteMedia() {
            if (!messageId || !chatId) {
                showToast('Невозможно удалить', '❌');
                return;
            }

        if (confirm(window.i18n?.t('deleteMediaConfirm') || 'Удалить это медиа?')) {
                // Send delete request
                fetch(`/api/v1/messages/${messageId}?forEveryone=true`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': 'Bearer ' + localStorage.getItem('craneapp_auth_token')
                    }
                }).then(() => {
                    showToast('Удалено', '✅');
                    closeViewer();
                }).catch(() => {
                    showToast('Ошибка', '❌');
                });
            }
        }

        function showToast(message, icon = '✓') {
            // Simple toast implementation
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0,0,0,0.9);
                color: #fff;
                padding: 16px 24px;
                border-radius: 12px;
                font-size: 15px;
                z-index: 10000;
                display: flex;
                align-items: center;
                gap: 8px;
            `;
            toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
            document.body.appendChild(toast);
            
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, 2000);
        }

        // Keyboard
        document.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'Escape':
                    closeViewer();
                    break;
                case 'ArrowLeft':
                    if (mediaType === 'video') videoContent.currentTime -= 10;
                    break;
                case 'ArrowRight':
                    if (mediaType === 'video') videoContent.currentTime += 10;
                    break;
                case ' ':
                    if (mediaType === 'video') {
                        e.preventDefault();
                        togglePlayPause();
                    }
                    break;
                case '+':
                case '=':
                    if (!isZoomed) {
                        imageContent.classList.add('zoomed');
                        imageContent.style.transform = 'scale(2)';
                        isZoomed = true;
                    }
                    break;
                case '-':
                    if (isZoomed) {
                        imageContent.classList.remove('zoomed');
                        imageContent.style.transform = 'scale(1)';
                        isZoomed = false;
                    }
                    break;
            }
        });

        // Initialize on load
        init();
