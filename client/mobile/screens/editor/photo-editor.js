/**
 * Photo Editor Logic
 * Поддерживает обрезку, точный поворот по градусам, зеркальное отражение и гибкий Swipe-интерфейс.
 */

let cropper = null;
let scaleX = 1;
let scaleY = 1;
let drawerExpanded = false;
let activeTool = null;
let originalAspectRatio = 1;

/**
 * Синхронизация темы
 */
function syncTheme() {
    const theme = document.documentElement.getAttribute('data-theme') || parent.document.documentElement.getAttribute('data-theme');
    if (theme) document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Переключение панелей инструментов
 */
function toggleSubPanel(type, el) {
    const isActive = activeTool === type;
    const rotationCtrl = document.getElementById('rotationControl');
    
    // Если кликнули на тот же инструмент на мобилке — просто переключаем развертку панели
    if (isActive && window.innerWidth <= 768) {
        setDrawerExpanded(!drawerExpanded);
        return;
    }

    // Сброс всех активных состояний
    document.querySelectorAll('.tools-panel .tool-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.sub-panel').forEach(panel => panel.classList.remove('active'));

    if (!isActive) {
        activeTool = type;
        el.classList.add('active');
        const panel = document.getElementById(type + 'Options');
        if (panel) panel.classList.add('active');

        if (window.innerWidth <= 768) setDrawerExpanded(true);

        if (type === 'crop') {
            initCropper();
            rotationCtrl.classList.add('active');
        } else {
            destroyCropper();
            rotationCtrl.classList.remove('active');
        }
    } else {
        // Деактивация инструмента (только для десктопа или если уже свернуто)
        activeTool = null;
        destroyCropper();
        rotationCtrl.classList.remove('active');
        if (window.innerWidth <= 768) setDrawerExpanded(false);
    }
}

/**
 * Управление Drawer (только визуальное сворачивание/разворачивание)
 */
function setDrawerExpanded(expand) {
    const drawer = document.getElementById('controlsDrawer');
    drawerExpanded = expand;
    if (expand) {
        drawer.classList.add('expanded');
    } else {
        drawer.classList.remove('expanded');
    }
    
    // Обновляем размер кроппера после анимации
    setTimeout(() => { if (cropper) cropper.resize(); }, 400);
}

/**
 * Реализация Swipe для мобильной панели
 */
function initSwipeLogic() {
    const drawer = document.getElementById('controlsDrawer');
    const handle = drawer.querySelector('.drag-handle');
    let startY = 0;

    handle.addEventListener('touchstart', e => startY = e.touches[0].clientY);
    handle.addEventListener('touchend', e => {
        const diff = startY - e.changedTouches[0].clientY;
        // Если свайп вверх — разворачиваем, вниз — сворачиваем
        if (Math.abs(diff) > 40) {
            setDrawerExpanded(diff > 0);
        }
    });
}

/**
 * Точный поворот (Slider)
 */
function initRotationSlider() {
    const slider = document.getElementById('rotationSlider');
    const valueDisplay = document.querySelector('.rotation-value');

    slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        valueDisplay.textContent = val > 0 ? `+${val}°` : `${val}°`;
        if (cropper) cropper.rotateTo(val);
    });
}

/**
 * Инициализация Cropper.js
 */
function initCropper() {
    if (cropper) return;
    const image = document.getElementById('previewImage');
    cropper = new Cropper(image, {
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 0.8,
        restore: false,
        guides: true,
        center: true,
        highlight: false,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
        checkCrossOrigin: false,
        responsive: true,
        ready() {
            if (window.lucide) lucide.createIcons();
        }
    });
}

function destroyCropper() {
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
}

function rotateImage() {
    if (!cropper) initCropper();
    cropper.rotate(90);
    document.getElementById('rotationSlider').value = 0;
    document.querySelector('.rotation-value').textContent = '0°';
}

function flipImage(dir) {
    if (!cropper) initCropper();
    if (dir === 'h') {
        scaleX = scaleX === 1 ? -1 : 1;
        cropper.scaleX(scaleX);
    } else {
        scaleY = scaleY === 1 ? -1 : 1;
        cropper.scaleY(scaleY);
    }
}

function setRatio(ratio) {
    if (!cropper) initCropper();
    document.querySelectorAll('.ratio-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');

    if (ratio === 0) cropper.setAspectRatio(originalAspectRatio);
    else cropper.setAspectRatio(ratio);
}

async function saveResult() {
    let finalDataUrl;
    if (cropper) {
        finalDataUrl = cropper.getCroppedCanvas({
            maxWidth: 4096,
            maxHeight: 4096,
            fillColor: '#000',
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        }).toDataURL('image/jpeg', 0.9);
    } else {
        finalDataUrl = document.getElementById('previewImage').src;
    }

    if (window.parent && window.parent.onPhotoEditorComplete) {
        window.parent.onPhotoEditorComplete(finalDataUrl);
    }
    window.parent.closePhotoEditor();
}

window.onload = function() {
    if (window.lucide) lucide.createIcons();
    syncTheme();
    initRotationSlider();
    initSwipeLogic();

    const observer = new MutationObserver(syncTheme);
    observer.observe(parent.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const imageData = localStorage.getItem('craneapp_editor_image');
    if (imageData) {
        const img = document.getElementById('previewImage');
        img.src = imageData;
        img.onload = () => {
            img.style.display = 'block';
            originalAspectRatio = img.naturalWidth / img.naturalHeight;
            const loader = document.getElementById('loader');
            if (loader) loader.style.display = 'none';
        };
    }
};
