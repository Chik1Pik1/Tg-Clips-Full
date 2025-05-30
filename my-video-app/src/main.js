import { createClient } from '@supabase/supabase-js';

class VideoManager {
    constructor() {
        // Инициализация Supabase
        this.supabase = createClient(
            import.meta.env.VITE_SUPABASE_URL,
            import.meta.env.VITE_SUPABASE_ANON_KEY
        );

        this.state = {
            currentVideo: null,
            playlist: [],
            preloaded: new Map(),
            currentIndex: 0,
            userId: null,
            uploadedFile: null,
            uploadedFileUrl: null,
            channels: JSON.parse(localStorage.getItem('channels')) || {},
            isSubmenuOpen: false,
            isProgressBarActivated: false,
            hasViewed: false,
            isSwiping: false,
            isDragging: false,
            isHolding: false,
            lastTime: 0,
            touchTimeout: null,
            startX: 0,
            startY: 0,
            endX: 0,
            endY: 0
        };
        this.tg = window.Telegram?.WebApp;
        this.MAX_PRELOAD_SIZE = 3;
        this.MAX_PLAYLIST_SIZE = 10;

        if (this.tg) {
            this.tg.ready();
            this.tg.expand();
            console.log('Telegram Web App инициализирован:', this.tg.initDataUnsafe);
        } else {
            console.warn('Telegram Web App SDK не загружен. Работа в режиме браузера.');
        }
    }

    async init() {
        console.log('Скрипт обновлён, версия 10');
        if (this.tg?.initDataUnsafe?.user) {
            this.state.userId = String(this.tg.initDataUnsafe.user.id);
            console.log('Telegram инициализирован, userId:', this.state.userId);
        } else {
            this.state.userId = 'testUser_' + Date.now();
            console.log('Тестовый userId:', this.state.userId);
        }
        console.log('Зарегистрированные каналы:', this.state.channels);

        this.bindElements();
        this.bindEvents();
        await this.loadInitialVideos();
        this.showPlayer();
    }

    bindElements() {
        this.authScreen = document.getElementById('authScreen');
        this.playerContainer = document.getElementById('playerContainer');
        this.authBtn = document.getElementById('authBtn');
        this.registerChannelBtn = document.getElementById('registerChannelBtn');
        this.userAvatar = document.getElementById('userAvatar');
        this.video = document.getElementById('videoPlayer');
        this.videoSource = document.getElementById('videoSource');
        this.viewCountSpan = document.getElementById('viewCount');
        this.likeCountEl = document.getElementById('likeCount');
        this.dislikeCountEl = document.getElementById('dislikeCount');
        this.commentCountEl = document.getElementById('commentCount');
        this.shareCountEl = document.getElementById('shareCount');
        this.ratingEl = document.getElementById('rating');
        this.reactionBar = document.getElementById('reactionBar');
        this.reactionButtons = document.querySelectorAll('.reaction-btn');
        this.swipeArea = document.getElementById('swipeArea');
        this.reactionAnimation = document.getElementById('reactionAnimation');
        this.progressBar = document.getElementById('progressBar');
        this.progressRange = document.getElementById('progressRange');
        this.commentsWindow = document.getElementById('commentsWindow');
        this.commentsList = document.getElementById('commentsList');
        this.commentInput = document.getElementById('commentInput');
        this.sendCommentBtn = document.getElementById('sendComment');
        this.themeToggle = document.querySelector('.theme-toggle');
        this.toggleReactionBar = document.querySelector('.toggle-reaction-bar');
        this.plusBtn = document.querySelector('.plus-btn');
        this.uploadBtn = document.querySelector('.upload-btn');
        this.submenuUpload = document.getElementById('uploadVideo');
        this.submenuChat = document.getElementById('chatAuthor');
        this.uploadModal = document.getElementById('uploadModal');
        this.uploadProgress = document.getElementById('progressBarInner');
        this.uploadPreview = document.getElementById('uploadPreview');
        this.publishBtn = document.getElementById('publishBtn');
        this.cancelBtn = document.getElementById('cancelBtn');
        this.chatModal = document.getElementById('chatModal');
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.sendChatMessage = document.getElementById('sendChatMessage');
        this.closeChat = document.getElementById('closeChat');
        this.shareModal = document.getElementById('shareModal');
        this.shareTelegram = document.getElementById('shareTelegram');
        this.copyLink = document.getElementById('copyLink');
        this.closeShare = document.getElementById('closeShare');
        this.videoUpload = document.createElement('input');
        this.videoUpload.type = 'file';
        this.videoUpload.accept = 'video/mp4,video/quicktime,video/webm';
        this.videoUpload.style.display = 'none';
        document.body.appendChild(this.videoUpload);
    }

    bindEvents() {
        const bindButton = (btn, handler, name) => {
            if (btn) {
                btn.addEventListener('click', handler);
                console.log(`${name} привязан`);
            } else {
                console.warn(`${name} не найден`);
            }
        };

        bindButton(this.authBtn, () => this.handleAuth(), '#authBtn');
        bindButton(this.registerChannelBtn, () => this.registerChannel(), '#registerChannelBtn');

        this.reactionButtons.forEach(btn => btn.addEventListener('click', (e) => this.handleReaction(btn.dataset.type, e)));
        bindButton(this.plusBtn, (e) => this.toggleSubmenu(e), '.plus-btn');
        bindButton(this.uploadBtn, (e) => this.downloadCurrentVideo(e), '.upload-btn');
        bindButton(this.toggleReactionBar, (e) => this.toggleReactionBarVisibility(e), '.toggle-reaction-bar');
        if (this.video) {
            this.video.addEventListener('loadedmetadata', () => this.handleLoadedMetadata(), { once: true });
            this.video.addEventListener('play', () => this.handlePlay());
            this.video.addEventListener('pause', () => this.handlePause());
            this.video.addEventListener('ended', () => this.handleEnded());
            this.video.addEventListener('timeupdate', () => this.handleTimeUpdate());
        }
        bindButton(this.progressRange, (e) => this.handleProgressInput(e), '#progressRange');
        this.setupSwipeAndMouseEvents();
        bindButton(this.sendCommentBtn, () => this.addComment(), '#sendComment');
        if (this.commentInput) {
            this.commentInput.addEventListener('keypress', (e) => e.key === 'Enter' && this.addComment());
        }
        bindButton(this.submenuUpload, (e) => this.handleSubmenuUpload(e), '#uploadVideo');
        if (this.videoUpload) {
            this.videoUpload.addEventListener('change', (e) => this.handleVideoUpload(e));
        }
        bindButton(this.publishBtn, () => this.publishVideo(), '#publishBtn');
        bindButton(this.cancelBtn, () => this.cancelUpload(), '#cancelBtn');
        bindButton(this.submenuChat, (e) => this.handleSubmenuChat(e), '#chatAuthor');
        bindButton(this.sendChatMessage, () => this.sendChat(), '#sendChatMessage');
        if (this.chatInput) {
            this.chatInput.addEventListener('keypress', (e) => e.key === 'Enter' && this.sendChat());
        }
        bindButton(this.closeChat, () => this.chatModal.classList.remove('visible'), '#closeChat');
        bindButton(this.shareTelegram, () => this.shareViaTelegram(), '#shareTelegram');
        bindButton(this.copyLink, () => this.copyVideoLink(), '#copyLink');
        bindButton(this.closeShare, () => this.shareModal.classList.remove('visible'), '#closeShare');
        bindButton(this.themeToggle, () => this.toggleTheme(), '.theme-toggle');
        const dragHandle = document.querySelector('.drag-handle');
        if (dragHandle) {
            dragHandle.addEventListener('mousedown', (e) => this.startDragging(e));
            dragHandle.addEventListener('touchstart', (e) => this.startDragging(e), { passive: false });
        }
        bindButton(document.querySelector('.fullscreen-btn'), (e) => this.toggleFullscreen(e), '.fullscreen-btn');
        document.addEventListener('click', (e) => this.hideManagementListOnClickOutside(e));
        this.bindUserAvatar();
    }

    handleAuth() {
        if (this.tg?.initDataUnsafe?.user) {
            this.state.userId = String(this.tg.initDataUnsafe.user.id);
            this.showNotification('Вход успешен: ' + this.state.userId);
        } else {
            this.state.userId = 'browserTestUser_' + Date.now();
            this.showNotification('Имитация входа: ' + this.state.userId);
        }
        this.showPlayer();
    }

    showPlayer() {
        if (this.authScreen && this.playerContainer) {
            this.authScreen.style.display = 'none';
            this.playerContainer.style.display = 'flex';
            this.initializePlayer();
        } else {
            console.error('Ошибка: authScreen или playerContainer не найдены');
        }
    }

    bindUserAvatar() {
        if (!this.userAvatar) {
            console.error('Элемент #userAvatar не найден!');
            return;
        }

        this.userAvatar.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this.state.isHolding) {
                const channel = this.state.channels[this.state.userId];
                if (channel?.link) {
                    try {
                        if (this.tg && this.tg.openTelegramLink) {
                            this.tg.openTelegramLink(channel.link);
                        } else {
                            window.open(channel.link, '_blank');
                        }
                    } catch (error) {
                        console.error('Ошибка перехода на канал:', error);
                        this.showNotification('Не удалось открыть канал!');
                    }
                } else {
                    this.showNotification('Канал не зарегистрирован. Зарегистрируйте его!');
                    this.registerChannel();
                }
            }
        });

        const holdDuration = 2000;
        const startHold = (e) => {
            e.preventDefault();
            if (this.state.touchTimeout || this.state.isHolding) return;
            this.state.isHolding = true;
            this.userAvatar.classList.add('holding');
            this.state.touchTimeout = setTimeout(() => {
                this.showVideoManagementList();
                this.state.isHolding = false;
                this.userAvatar.classList.remove('holding');
                this.state.touchTimeout = null;
            }, holdDuration);
        };

        const stopHold = () => {
            if (this.state.touchTimeout) {
                clearTimeout(this.state.touchTimeout);
                this.state.touchTimeout = null;
            }
            this.state.isHolding = false;
            this.userAvatar.classList.remove('holding');
        };

        this.userAvatar.addEventListener('mousedown', startHold);
        this.userAvatar.addEventListener('mouseup', stopHold);
        this.userAvatar.addEventListener('mouseleave', stopHold);
        this.userAvatar.addEventListener('touchstart', startHold, { passive: false });
        this.userAvatar.addEventListener('touchend', stopHold);
        this.userAvatar.addEventListener('touchcancel', stopHold);
        this.userAvatar.addEventListener('touchmove', stopHold, { passive: false });
    }

    async registerChannel() {
        if (!this.state.userId) {
            this.showNotification('Пожалуйста, войдите через Telegram.');
            return;
        }
        const channelLink = prompt('Введите ссылку на ваш Telegram-канал (например, https://t.me/yourchannel):');
        if (channelLink && channelLink.match(/^https:\/\/t\.me\/[a-zA-Z0-9_]+$/)) {
            try {
                const { data, error } = await this.supabase
                    .from('channels')
                    .insert([{ user_id: this.state.userId, channel_name: channelLink }])
                    .select();
                if (error) throw error;
                this.state.channels[this.state.userId] = { videos: [], link: channelLink };
                localStorage.setItem('channels', JSON.stringify(this.state.channels));
                this.showNotification('Канал успешно зарегистрирован!');
                this.showPlayer();
            } catch (error) {
                console.error('Ошибка регистрации канала:', error);
                this.showNotification(`Ошибка при регистрации канала: ${error.message}`);
            }
        } else {
            this.showNotification('Введите корректную ссылку на Telegram-канал.');
        }
    }

    initializePlayer() {
        if (this.userAvatar && this.tg?.initDataUnsafe?.user?.photo_url) {
            this.userAvatar.src = this.tg.initDataUnsafe.user.photo_url;
        } else {
            this.userAvatar.src = '/images/default-avatar.png';
        }
        this.initializeTheme();
        this.initializeTooltips();
    }

    async loadInitialVideos() {
        const stockVideos = [
            { url: "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4", data: this.createEmptyVideoData('testAuthor123') },
            { url: "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_2mb.mp4", data: this.createEmptyVideoData('testAuthor123') },
            { url: "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_5mb.mp4", data: this.createEmptyVideoData('testAuthor123') }
        ];

        try {
            const { data, error } = await this.supabase
                .from('publicVideos')
                .select('*')
                .eq('is_public', true);
            if (error) throw error;

            if (!data || data.length === 0) {
                console.warn('Supabase вернул пустой ответ, используем стоковые видео');
                this.state.playlist = stockVideos;
            } else {
                this.state.playlist = data.map(video => ({
                    url: video.url,
                    data: {
                        views: new Set(video.views || []),
                        likes: video.likes || 0,
                        dislikes: video.dislikes || 0,
                        userLikes: new Set(video.user_likes || []),
                        userDislikes: new Set(video.user_dislikes || []),
                        comments: video.comments || [],
                        shares: video.shares || 0,
                        viewTime: video.view_time || 0,
                        replays: video.replays || 0,
                        duration: video.duration || 0,
                        authorId: video.author_id,
                        lastPosition: video.last_position || 0,
                        chatMessages: video.chat_messages || [],
                        description: video.description || ''
                    }
                }));
            }
        } catch (error) {
            console.error('Ошибка загрузки видео с Supabase:', error);
            this.showNotification(`Не удалось загрузить видео: ${error.message}`);
            this.state.playlist = stockVideos;
        }

        if (this.state.playlist.length > 0) {
            this.state.currentIndex = 0;
            this.loadVideo();
        } else {
            console.error('Плейлист пуст после всех попыток!');
            this.showNotification('Не удалось загрузить видео!');
        }
    }

    createEmptyVideoData(authorId) {
        return {
            views: new Set(),
            likes: 0,
            dislikes: 0,
            userLikes: new Set(),
            userDislikes: new Set(),
            comments: [],
            shares: 0,
            viewTime: 0,
            replays: 0,
            duration: 0,
            authorId,
            lastPosition: 0,
            chatMessages: [],
            description: ''
        };
    }

    handleLoadedMetadata() {
        if (!this.video) return;
        this.video.muted = true;
        this.video.play().then(() => {
            this.video.pause();
            this.video.muted = false;
        }).catch(err => console.error('Unlock error:', err));
        const videoData = this.state.playlist[this.state.currentIndex]?.data;
        if (videoData) {
            videoData.duration = this.video.duration;
            this.progressRange.max = this.video.duration;
            this.progressRange.value = videoData.lastPosition || 0;
            this.updateVideoCache(this.state.currentIndex);
            this.updateRating();
        }
    }

    handlePlay() {
        if (!this.state.playlist || this.state.playlist.length === 0) return;
        const videoData = this.state.playlist[this.state.currentIndex].data;
        if (!this.state.hasViewed && this.state.userId) {
            videoData.views.add(this.state.userId);
            this.state.hasViewed = true;
            this.updateCounters();
        }
        if (this.state.isProgressBarActivated) this.progressBar.classList.remove('visible');
        this.state.isProgressBarActivated = false;
        this.commentsWindow.classList.remove('visible');
        this.preloadNextVideo();
    }

    handlePause() {
        if (!this.state.playlist || this.state.playlist.length === 0) return;
        if (!this.state.isProgressBarActivated) {
            this.state.isProgressBarActivated = true;
            this.progressBar.classList.add('visible');
        }
        const videoData = this.state.playlist[this.state.currentIndex]?.data;
        if (videoData) {
            videoData.lastPosition = this.video.currentTime;
            this.updateVideoCache(this.state.currentIndex);
        }
    }

    handleEnded() {
        if (!this.state.playlist || this.state.playlist.length === 0) return;
        const videoData = this.state.playlist[this.state.currentIndex].data;
        if (this.video.currentTime >= this.video.duration * 0.9) videoData.replays++;
        videoData.lastPosition = 0;
        this.updateVideoCache(this.state.currentIndex);
        this.playNextVideo();
    }

    handleTimeUpdate() {
        if (!this.state.playlist || this.state.playlist.length === 0) return;
        const videoData = this.state.playlist[this.state.currentIndex].data;
        videoData.viewTime += this.video.currentTime - this.state.lastTime;
        videoData.lastPosition = this.video.currentTime;
        this.state.lastTime = this.video.currentTime;
        this.progressRange.value = this.video.currentTime;
        this.updateVideoCache(this.state.currentIndex);
        this.updateRating();
    }

    handleProgressInput(e) {
        if (!this.state.playlist || this.state.playlist.length === 0) return;
        this.video.currentTime = e.target.value;
        const videoData = this.state.playlist[this.state.currentIndex]?.data;
        if (videoData) {
            videoData.lastPosition = this.video.currentTime;
            this.updateVideoCache(this.state.currentIndex);
        }
    }

    setupSwipeAndMouseEvents() {
        if (this.swipeArea) {
            this.swipeArea.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
            this.swipeArea.addEventListener('touchmove', this.throttle((e) => this.handleTouchMove(e), 16), { passive: false });
            this.swipeArea.addEventListener('touchend', (e) => this.handleTouchEnd(e));
            this.swipeArea.addEventListener('mousedown', (e) => this.handleMouseStart(e));
            this.swipeArea.addEventListener('mousemove', this.throttle((e) => this.handleMouseMove(e), 16));
            this.swipeArea.addEventListener('mouseup', (e) => this.handleMouseEnd(e));
        }
    }

    handleTouchStart(e) {
        e.preventDefault();
        this.state.startX = e.touches[0].clientX;
        this.state.startY = e.touches[0].clientY;
        this.state.isSwiping = false;

        if (!this.state.isHolding && !this.state.isDragging) {
            this.toggleVideoPlayback();
        }
    }

    handleTouchMove(e) {
        this.state.endX = e.touches[0].clientX;
        this.state.endY = e.touches[0].clientY;
        const deltaX = this.state.endX - this.state.startX;
        const deltaY = this.state.endY - this.state.startY;
        const minMovement = 10;
        if (Math.abs(deltaX) > minMovement || Math.abs(deltaY) > minMovement) {
            this.state.isSwiping = true;
        }
    }

    handleTouchEnd(e) {
        const deltaX = this.state.endX - this.state.startX;
        const deltaY = this.state.endY - this.state.startY;
        const swipeThresholdHorizontal = 50;
        const swipeThresholdVertical = 50;
        const minMovement = 10;

        if (Math.abs(deltaX) < minMovement && Math.abs(deltaY) < minMovement) {
            return;
        }

        if (!this.state.userId) {
            this.showNotification('Войдите, чтобы ставить реакции');
            return;
        }

        if (Math.abs(deltaX) > swipeThresholdHorizontal && Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX > 0) this.playNextVideo();
            else this.playPreviousVideo();
            if (this.state.isProgressBarActivated) this.progressBar.classList.remove('visible');
            this.state.isProgressBarActivated = false;
        } else if (Math.abs(deltaY) > swipeThresholdVertical && Math.abs(deltaY) > Math.abs(deltaX)) {
            if (deltaY < 0) {
                this.handleReaction('like');
                this.showFloatingReaction('like', this.state.endX, this.state.startY);
            } else if (deltaY > 0) {
                this.handleReaction('dislike');
                this.showFloatingReaction('dislike', this.state.endX, this.state.startY);
            }
        }
        this.state.isSwiping = false;
    }

    handleMouseStart(e) {
        e.preventDefault();
        this.state.isDragging = true;
        this.state.startX = e.clientX;
        this.state.startY = e.clientY;
        this.state.isSwiping = false;

        if (!this.state.isHolding) {
            this.toggleVideoPlayback();
        }
    }

    handleMouseMove(e) {
        if (!this.state.isDragging) return;
        this.state.endX = e.clientX;
        this.state.endY = e.clientY;
        const deltaX = this.state.endX - this.state.startX;
        const deltaY = this.state.endY - this.state.startY;
        const minMovement = 10;
        if (Math.abs(deltaX) > minMovement || Math.abs(deltaY) > minMovement) {
            this.state.isSwiping = true;
        }
    }

    handleMouseEnd(e) {
        if (!this.state.isDragging) return;
        this.state.isDragging = false;

        const deltaX = this.state.endX - this.state.startX;
        const deltaY = this.state.endY - this.state.startY;
        const swipeThresholdHorizontal = 50;
        const swipeThresholdVertical = 50;
        const minMovement = 10;

        if (Math.abs(deltaX) < minMovement && Math.abs(deltaY) < minMovement) {
            return;
        }

        if (!this.state.userId) {
            this.showNotification('Войдите, чтобы ставить реакции');
            return;
        }

        if (Math.abs(deltaX) > swipeThresholdHorizontal && Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX > 0) this.playNextVideo();
            else this.playPreviousVideo();
            if (this.state.isProgressBarActivated) this.progressBar.classList.remove('visible');
            this.state.isProgressBarActivated = false;
        } else if (Math.abs(deltaY) > swipeThresholdVertical && Math.abs(deltaY) > Math.abs(deltaX)) {
            if (deltaY < 0) {
                this.handleReaction('like');
                this.showFloatingReaction('like', this.state.endX, this.state.startY);
            } else if (deltaY > 0) {
                this.handleReaction('dislike');
                this.showFloatingReaction('dislike', this.state.endX, this.state.startY);
            }
        }
        this.state.isSwiping = false;
    }

    showFloatingReaction(type, x, y) {
        const reaction = document.createElement('div');
        reaction.className = `floating-reaction ${type}`;
        reaction.textContent = type === 'like' ? '👍' : '👎';
        reaction.style.left = `${x}px`;
        reaction.style.top = `${y}px`;
        document.body.appendChild(reaction);
        setTimeout(() => reaction.remove(), 1500);
    }

    playNextVideo() {
        if (!this.state.playlist || this.state.playlist.length === 0) return;
        this.recommendNextVideo();
        this.loadVideo('left');
        this.state.hasViewed = false;
    }

    playPreviousVideo() {
        if (!this.state.playlist || this.state.playlist.length === 0) return;
        this.state.currentIndex = (this.state.currentIndex - 1 + this.state.playlist.length) % this.state.playlist.length;
        this.loadVideo('right');
        this.state.hasViewed = false;
    }

    loadVideo(direction = 'left') {
        if (!this.state.playlist || this.state.playlist.length === 0) {
            this.showNotification('Нет видео для воспроизведения!');
            return;
        }

        if (this.state.currentIndex < 0 || this.state.currentIndex >= this.state.playlist.length) {
            this.state.currentIndex = 0;
        }

        const fadeOutClass = direction === 'left' ? 'fade-out-left' : 'fade-out-right';
        this.video.classList.remove('fade-in');
        this.video.classList.add(fadeOutClass);
        this.video.pause();
        setTimeout(() => {
            this.videoSource.src = this.state.playlist[this.state.currentIndex].url;
            this.video.load();
            const timeout = setTimeout(() => {
                if (!this.video.readyState) {
                    this.showNotification('Ошибка загрузки видео!');
                    this.playNextVideo();
                }
            }, 5000);
            this.video.addEventListener('canplay', () => {
                clearTimeout(timeout);
                const lastPosition = this.state.playlist[this.state.currentIndex].data.lastPosition;
                this.video.classList.remove('fade-out-left', 'fade-out-right');
                this.video.classList.add('fade-in');
                if (lastPosition > 0 && lastPosition < this.video.duration) {
                    this.showResumePrompt(lastPosition);
                } else {
                    this.video.play().catch(err => console.log("Ошибка воспроизведения:", err));
                }
            }, { once: true });
            this.updateCounters();
            this.updateComments();
            this.updateRating();
            this.updateDescription();
            this.preloadNextVideo();
        }, 300);
    }

    showResumePrompt(lastPosition) {
        const resumePrompt = document.createElement('div');
        resumePrompt.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: var(--notification-bg); color: var(--notification-text);
            padding: 20px; border-radius: 10px; z-index: 100; text-align: center;
        `;
        resumePrompt.innerHTML = `
            <p>Продолжить с ${this.formatTime(lastPosition)}?</p>
            <button id="resumeYes">Да</button>
            <button id="resumeNo">Нет</button>
        `;
        document.body.appendChild(resumePrompt);

        document.getElementById('resumeYes').addEventListener('click', () => {
            this.video.currentTime = lastPosition;
            this.video.play();
            document.body.removeChild(resumePrompt);
        });

        document.getElementById('resumeNo').addEventListener('click', () => {
            this.video.currentTime = 0;
            this.video.play();
            document.body.removeChild(resumePrompt);
        });
    }

    async addComment() {
        if (!this.state.playlist || this.state.playlist.length === 0) return;
        const videoData = this.state.playlist[this.state.currentIndex].data;
        const text = this.commentInput.value.trim();
        if (text && this.state.userId) {
            const newComment = {
                userId: this.state.userId,
                text: text,
                replyTo: this.commentInput.dataset.replyTo || null
            };
            videoData.comments.push(newComment);
            this.commentInput.value = '';
            this.commentInput.dataset.replyTo = '';
            this.commentInput.placeholder = 'Напишите комментарий...';
            this.updateComments();
            this.updateCounters();
            await this.updateVideoCache(this.state.currentIndex);
        }
    }

    updateComments() {
        if (!this.state.playlist || this.state.playlist.length === 0) return;
        const videoData = this.state.playlist[this.state.currentIndex].data;
        this.commentsList.innerHTML = '';
        videoData.comments.forEach((comment, idx) => {
            const userPhoto = (this.tg?.initDataUnsafe?.user?.id === comment.userId && this.tg?.initDataUnsafe?.user?.photo_url)
                ? this.tg.initDataUnsafe.user.photo_url
                : '/images/default-avatar.png';
            const username = (this.tg?.initDataUnsafe?.user?.id === comment.userId && this.tg?.initDataUnsafe?.user?.username)
                ? `@${this.tg.initDataUnsafe.user.username}`
                : `User_${comment.userId.slice(0, 5)}`;
            const isOwnComment = comment.userId === this.state.userId;
            const commentEl = document.createElement('div');
            commentEl.className = 'comment';
            commentEl.innerHTML = `
                <img src="${userPhoto}" alt="User Avatar" class="comment-avatar" data-user-id="${comment.userId}">
                <div class="comment-content">
                    <span class="comment-username">${username}</span>
                    <div class="comment-text">${this.sanitize(comment.text)}${comment.replyTo !== null && videoData.comments[comment.replyTo] ? `<blockquote>Цитата: ${this.sanitize(videoData.comments[comment.replyTo].text)}</blockquote>` : ''}</div>
                </div>
                <button class="reply-btn" data-index="${idx}">Ответить</button>
                ${isOwnComment ? `<button class="delete-comment-btn" data-index="${idx}">Удалить</button>` : ''}
            `;
            this.commentsList.appendChild(commentEl);
            commentEl.querySelector('.reply-btn').addEventListener('click', () => this.replyToComment(idx));
            if (isOwnComment) {
                commentEl.querySelector('.delete-comment-btn').addEventListener('click', () => this.deleteComment(idx));
            }
            commentEl.querySelector('.comment-avatar').addEventListener('click', () => this.handleAvatarClick(comment.userId));
        });
        this.commentsList.scrollTop = this.commentsList.scrollHeight;
    }

    sanitize(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    replyToComment(index) {
        this.commentInput.dataset.replyTo = index;
        this.commentInput.placeholder = `Ответ на: "${this.state.playlist[this.state.currentIndex].data.comments[index].text.slice(0, 20)}..."`;
        this.commentInput.focus();
    }

    async deleteComment(index) {
        if (!this.state.playlist || this.state.playlist.length === 0) return;
        if (confirm('Удалить этот комментарий?')) {
            this.state.playlist[this.state.currentIndex].data.comments.splice(index, 1);
            this.updateComments();
            this.updateCounters();
            await this.updateVideoCache(this.state.currentIndex);
            this.showNotification('Комментарий удалён');
        }
    }

    handleAvatarClick(userId) {
        const channel = this.state.channels[userId];
        if (channel?.link) {
            try {
                if (this.tg && this.tg.openTelegramLink) {
                    this.tg.openTelegramLink(channel.link);
                } else {
                    window.open(channel.link, '_blank');
                }
            } catch (error) {
                console.error('Ошибка перехода на канал:', error);
                this.showNotification('Не удалось открыть канал!');
            }
        } else {
            this.showNotification('Канал не зарегистрирован');
        }
    }

    updateDescription() {
        if (!this.state.playlist || this.state.playlist.length === 0) return;
        let descriptionEl = document.getElementById('videoDescriptionDisplay');
        if (!descriptionEl) {
            descriptionEl = document.createElement('div');
            descriptionEl.id = 'videoDescriptionDisplay';
            descriptionEl.style.cssText = 'margin-top: 10px; color: var(--text-color);';
            document.querySelector('.video-wrapper')?.insertAdjacentElement('afterend', descriptionEl);
        }
        const description = this.state.playlist[this.state.currentIndex].data.description || 'Описание отсутствует';
        descriptionEl.textContent = description;
        descriptionEl.style.display = description !== 'Описание отсутствует' ? 'block' : 'none';
    }

    updateChat() {
        if (!this.state.playlist || this.state.playlist.length === 0) return;
        const videoData = this.state.playlist[this.state.currentIndex].data;
        this.chatMessages.innerHTML = '';
        videoData.chatMessages.forEach(msg => {
            const messageEl = document.createElement('div');
            messageEl.className = `message ${msg.sender === this.state.userId ? 'sent' : 'received'}`;
            messageEl.textContent = msg.text;
            this.chatMessages.appendChild(messageEl);
        });
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    async sendChat() {
        if (!this.state.playlist || this.state.playlist.length === 0) return;
        const videoData = this.state.playlist[this.state.currentIndex].data;
        const text = this.chatInput.value.trim();
        if (text) {
            videoData.chatMessages.push({ sender: this.state.userId, text });
            this.chatInput.value = '';
            this.updateChat();
            await this.updateVideoCache(this.state.currentIndex);
            setTimeout(() => {
                videoData.chatMessages.push({ sender: videoData.authorId, text: "Спасибо за сообщение!" });
                this.updateChat();
                this.updateVideoCache(this.state.currentIndex);
            }, 1000);
        }
    }

    handleSubmenuChat(e) {
        e.stopPropagation();
        this.chatModal.classList.add('visible');
        this.updateChat();
        this.toggleSubmenu();
    }

    shareViaTelegram() {
        if (!this.state.playlist || this.state.playlist.length === 0) return;
        const videoUrl = this.state.playlist[this.state.currentIndex].url;
        const description = this.state.playlist[this.state.currentIndex].data.description || 'Смотри это крутое видео!';
        const text = `${description}\n${videoUrl}`;
        if (this.tg?.openTelegramLink) {
            this.tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(videoUrl)}&text=${encodeURIComponent(description)}`);
        } else {
            navigator.clipboard.writeText(text)
                .then(() => this.showNotification('Ссылка скопирована! Вставьте её в Telegram.'))
                .catch(err => this.showNotification('Не удалось скопировать ссылку'));
        }
        this.shareModal.classList.remove('visible');
        this.state.playlist[this.state.currentIndex].data.shares++;
        this.updateCounters();
        this.updateVideoCache(this.state.currentIndex);
    }

    copyVideoLink() {
        if (!this.state.playlist || this.state.playlist.length === 0) return;
        const videoUrl = this.state.playlist[this.state.currentIndex].url;
        navigator.clipboard.writeText(videoUrl)
            .then(() => {
                this.showNotification('Ссылка скопирована!');
                this.shareModal.classList.remove('visible');
            })
            .catch(err => this.showNotification('Не удалось скопировать ссылку'));
    }

    async handleVideoUpload(e) {
        this.state.uploadedFile = e.target.files[0];
        if (!this.state.uploadedFile) {
            this.showNotification('Выберите видео для загрузки!');
            return;
        }

        const maxSize = 100 * 1024 * 1024;
        const validTypes = ['video/mp4', 'video/quicktime', 'video/webm'];

        if (this.state.uploadedFile.size > maxSize) {
            this.showNotification('Файл слишком большой! Максимум 100 МБ.');
            this.state.uploadedFile = null;
            return;
        }

        if (!validTypes.includes(this.state.uploadedFile.type)) {
            this.showNotification('Неподдерживаемый формат! Используйте MP4, MOV или WebM.');
            this.state.uploadedFile = null;
            return;
        }

        this.uploadModal.classList.add('visible');
        this.uploadProgress.style.width = '0%';
        this.uploadPreview.style.display = 'none';
        this.publishBtn.disabled = true;

        const videoDescriptionInput = document.getElementById('videoDescription');
        if (videoDescriptionInput) videoDescriptionInput.value = '';

        this.uploadPreview.src = URL.createObjectURL(this.state.uploadedFile);
        this.uploadPreview.style.display = 'block';
        this.publishBtn.disabled = false;

        this.uploadPreview.onloadedmetadata = () => {
            const videoData = this.state.playlist[this.state.currentIndex]?.data;
            if (videoData) {
                videoData.duration = this.uploadPreview.duration;
                this.updateVideoCache(this.state.currentIndex);
            }
            this.uploadPreview.onloadedmetadata = null;
        };
    }

    async publishVideo() {
        if (!this.state.uploadedFile) {
            this.showNotification('Выберите видео для загрузки!');
            return;
        }

        const file = this.state.uploadedFile;
        const description = document.getElementById('videoDescription')?.value || '';
        const fileName = `${this.state.userId}_${Date.now()}.mp4`;

        try {
            // Загрузка видео в Supabase Storage
            const { data: uploadData, error: uploadError } = await this.supabase.storage
                .from('videos')
                .upload(fileName, file, { contentType: file.type });
            if (uploadError) throw uploadError;

            // Получение публичного URL
            const { data: urlData } = this.supabase.storage
                .from('videos')
                .getPublicUrl(fileName);
            const videoUrl = urlData.publicUrl;

            // Сохранение метаданных в таблицу publicVideos
            const videoData = {
                url: videoUrl,
                views: [],
                likes: 0,
                dislikes: 0,
                user_likes: [],
                user_dislikes: [],
                comments: [],
                shares: 0,
                view_time: 0,
                replays: 0,
                duration: this.uploadPreview.duration || 0,
                author_id: this.state.userId,
                last_position: 0,
                chat_messages: [],
                description,
                is_public: true,
                timestamp: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { error: insertError } = await this.supabase
                .from('publicVideos')
                .insert([videoData]);
            if (insertError) throw insertError;

            this.showNotification('Видео успешно опубликовано!');
            this.uploadModal.classList.remove('visible');
            this.state.uploadedFile = null;
            if (this.uploadPreview.src) {
                URL.revokeObjectURL(this.uploadPreview.src);
                this.uploadPreview.src = '';
                this.uploadPreview.style.display = 'none';
            }

            const newVideoData = this.createEmptyVideoData(this.state.userId);
            newVideoData.description = description;
            this.state.playlist.unshift({ url: videoUrl, data: newVideoData });
            this.state.currentIndex = 0;
            this.loadVideo();
            this.addVideoToManagementList(videoUrl, description);
        } catch (error) {
            console.error('Ошибка публикации видео:', error);
            this.showNotification(`Ошибка: ${error.message}`);
        }
    }

    cancelUpload() {
        if (this.state.uploadedFileUrl) {
            URL.revokeObjectURL(this.state.uploadedFileUrl);
        }
        this.state.uploadedFileUrl = null;
        this.state.uploadedFile = null;
        this.uploadModal.classList.remove('visible');
        this.uploadPreview.src = '';
        this.uploadPreview.style.display = 'none';
    }

    addVideoToManagementList(url, description) {
        const managementList = document.getElementById('videoManagementList') || this.createManagementList();
        const videoItem = document.createElement('div');
        videoItem.className = 'video-item';
        videoItem.innerHTML = `
            <span>${description || 'Без описания'}</span>
            <button class="edit-btn" data-url="${url}">Редактировать</button>
            <button class="delete-btn" data-url="${url}">Удалить</button>
        `;
        managementList.appendChild(videoItem);

        videoItem.querySelector('.edit-btn').addEventListener('click', () => this.editVideo(url));
        videoItem.querySelector('.delete-btn').addEventListener('click', () => this.deleteVideo(url));
    }

    createManagementList() {
        const list = document.createElement('div');
        list.id = 'videoManagementList';
        list.style.cssText = 'position: absolute; bottom: 6vh; left: 2vw; background: rgba(0, 0, 0, 0.8); padding: 10px; border-radius: 10px; z-index: 100; display: none;';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-list-btn';
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.addEventListener('click', () => list.classList.remove('visible'));
        list.appendChild(closeBtn);
        document.body.appendChild(list);
        return list;
    }

    editVideo(url) {
        const index = this.state.playlist.findIndex(v => v.url === url);
        if (index === -1) return;
        const newDescription = prompt('Введите новое описание:', this.state.playlist[index].data.description);
        if (newDescription !== null) {
            this.state.playlist[index].data.description = newDescription;
            this.updateVideoCache(index);
            const videoItem = document.querySelector(`.video-item [data-url="${url}"]`).parentElement;
            videoItem.querySelector('span').textContent = newDescription || 'Без описания';
            this.showNotification('Описание обновлено!');
            if (this.state.currentIndex === index) this.updateDescription();
        }
    }

    async deleteVideo(url) {
        try {
            // Удаление видео из Supabase Storage
            const fileName = url.split('/').pop();
            const { error: storageError } = await this.supabase.storage
                .from('videos')
                .remove([fileName]);
            if (storageError) throw storageError;

            // Удаление записи из publicVideos
            const { error: deleteError } = await this.supabase
                .from('publicVideos')
                .delete()
                .eq('url', url);
            if (deleteError) throw deleteError;

            this.showNotification('Видео успешно удалено!');
            const index = this.state.playlist.findIndex(v => v.url === url);
            if (index !== -1) {
                this.state.playlist.splice(index, 1);
                const videoItem = document.querySelector(`.video-item [data-url="${url}"]`);
                if (videoItem) videoItem.parentElement.remove();
                if (this.state.currentIndex === index) {
                    this.state.currentIndex = Math.min(this.state.currentIndex, this.state.playlist.length - 1);
                    this.loadVideo();
                }
            }
        } catch (error) {
            console.error('Ошибка удаления видео:', error);
            this.showNotification(`Ошибка: ${error.message}`);
        }
    }

    showVideoManagementList() {
        const list = document.getElementById('videoManagementList');
        list.classList.toggle('visible');
    }

    hideManagementListOnClickOutside(e) {
        const list = document.getElementById('videoManagementList');
        if (list && list.classList.contains('visible') && !list.contains(e.target) && e.target !== this.userAvatar) {
            list.classList.remove('visible');
        }
    }

    updateCounters() {
        if (!this.state.playlist || this.state.playlist.length === 0) return;
        const videoData = this.state.playlist[this.state.currentIndex].data;
        if (this.viewCountSpan) this.viewCountSpan.textContent = videoData.views.size;
        if (this.likeCountEl) this.likeCountEl.textContent = videoData.likes;
        if (this.dislikeCountEl) this.dislikeCountEl.textContent = videoData.dislikes;
        if (this.commentCountEl) this.commentCountEl.textContent = videoData.comments.length;
        if (this.shareCountEl) this.shareCountEl.textContent = videoData.shares;
        this.updateRating();
    }

    calculateVideoScore(videoData, duration) {
        const avgViewTimePerView = videoData.viewTime / (videoData.views.size || 1);
        let viewTimeRatio = avgViewTimePerView / duration;
        if (viewTimeRatio > 1) viewTimeRatio = 1 + (videoData.replays / (videoData.views.size || 1));
        const rawScore = (videoData.likes * 5.0) + (videoData.comments.length * 10.0) + (videoData.shares * 15.0) + (videoData.viewTime * 0.1) + (videoData.replays * 20.0) * (1 + viewTimeRatio);
        const maxPossibleScore = 50;
        return Math.max(0, Math.min(5, (rawScore / maxPossibleScore) * 5));
    }

    updateRating() {
        if (!this.state.playlist || this.state.playlist.length === 0) return;
        const videoData = this.state.playlist[this.state.currentIndex].data;
        const duration = videoData.duration || 300;
        const score = this.calculateVideoScore(videoData, duration);
        const fullStars = Math.floor(score);
        const halfStar = score % 1 >= 0.5 ? 1 : 0;
        const emptyStars = Math.max(0, 5 - fullStars - halfStar);
        if (this.ratingEl) this.ratingEl.innerHTML = '★'.repeat(fullStars) + (halfStar ? '☆' : '') + '☆'.repeat(emptyStars);
    }

    recommendNextVideo() {
        if (!this.state.playlist || this.state.playlist.length === 0) {
            this.state.currentIndex = 0;
            return;
        }

        const scores = this.state.playlist.map((video, index) => ({
            index,
            score: this.calculateVideoScore(video.data, video.data.duration || 300)
        }));

        if (scores.length === 0) {
            this.state.currentIndex = 0;
            return;
        }

        scores.sort((a, b) => b.score - a.score);
        const nextVideo = scores.find(item => item.index !== this.state.currentIndex) || scores[0];
        this.state.currentIndex = nextVideo.index;
    }

    preloadNextVideo() {
        if (!this.state.playlist || this.state.playlist.length === 0) return;
        this.cleanPreloadedVideos();
        const nextIndex = (this.state.currentIndex + 1) % this.state.playlist.length;
        if (!this.state.preloaded.has(nextIndex)) {
            const preloadVideo = document.createElement('video');
            preloadVideo.src = this.state.playlist[nextIndex].url;
            preloadVideo.preload = 'auto';
            this.state.preloaded.set(nextIndex, preloadVideo);
        }
        const prevIndex = (this.state.currentIndex - 1 + this.state.playlist.length) % this.state.playlist.length;
        if (!this.state.preloaded.has(prevIndex)) {
            const preloadVideo = document.createElement('video');
            preloadVideo.src = this.state.playlist[prevIndex].url;
            preloadVideo.preload = 'auto';
            this.state.preloaded.set(prevIndex, preloadVideo);
        }
    }

    cleanPreloadedVideos() {
        const keep = [
            this.state.currentIndex,
            (this.state.currentIndex + 1) % this.state.playlist.length,
            (this.state.currentIndex - 1 + this.state.playlist.length) % this.state.playlist.length
        ];
        for (const [key, video] of this.state.preloaded) {
            if (!keep.includes(Number(key))) {
                if (video.src) URL.revokeObjectURL(video.src);
                this.state.preloaded.delete(key);
            }
        }
    }

    async updateVideoCache(index) {
        if (!this.state.playlist || this.state.playlist.length === 0 || index < 0 || index >= this.state.playlist.length) return;
        const videoData = this.state.playlist[index].data;
        const url = this.state.playlist[index].url;
        const cacheData = {
            url,
            views: Array.from(videoData.views),
            likes: videoData.likes,
            dislikes: videoData.dislikes,
            user_likes: Array.from(videoData.userLikes),
            user_dislikes: Array.from(videoData.userDislikes),
            comments: videoData.comments,
            shares: videoData.shares,
            view_time: videoData.viewTime,
            replays: videoData.replays,
            duration: videoData.duration,
            last_position: videoData.lastPosition,
            chat_messages: videoData.chatMessages,
            description: videoData.description
        };
        localStorage.setItem(`videoData_${url}`, JSON.stringify(cacheData));

        try {
            const { error } = await this.supabase
                .from('publicVideos')
                .update({
                    views: cacheData.views,
                    likes: cacheData.likes,
                    dislikes: cacheData.dislikes,
                    user_likes: cacheData.user_likes,
                    user_dislikes: cacheData.user_dislikes,
                    comments: cacheData.comments,
                    shares: cacheData.shares,
                    view_time: cacheData.view_time,
                    replays: cacheData.replays,
                    duration: cacheData.duration,
                    last_position: cacheData.last_position,
                    chat_messages: cacheData.chat_messages,
                    description: cacheData.description,
                    updated_at: new Date().toISOString()
                })
                .eq('url', url);
            if (error) throw error;
        } catch (error) {
            console.error('Ошибка обновления данных:', error);
            this.showNotification('Не удалось сохранить данные!');
        }
    }

    initializeTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        if (savedTheme === 'dark') {
            document.body.classList.add('dark');
            this.themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            document.body.classList.remove('dark');
            this.themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        }
    }

    toggleTheme() {
        if (document.body.classList.contains('dark')) {
            document.body.classList.remove('dark');
            this.themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
            localStorage.setItem('theme', 'light');
        } else {
            document.body.classList.add('dark');
            this.themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
            localStorage.setItem('theme', 'dark');
        }
    }

    initializeTooltips() {
        const tooltips = document.querySelectorAll('.tooltip');
        const isFirstVisit = !localStorage.getItem('hasSeenTooltips');
        if (isFirstVisit) {
            tooltips.forEach(tooltip => {
                tooltip.classList.add('visible');
                setTimeout(() => tooltip.classList.remove('visible'), 5000);
            });
            localStorage.setItem('hasSeenTooltips', 'true');
        }
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed; top: 10%; left: 50%; transform: translateX(-50%);
            background: var(--notification-bg); color: var(--notification-text);
            padding: 10px 20px; border-radius: 5px; z-index: 1000;
            opacity: 0; transition: opacity 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.style.opacity = '1', 10);
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => document.body.removeChild(notification), 300);
        }, 3000);
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    throttle(func, limit) {
        let inThrottle;
        return function (...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    toggleVideoPlayback() {
        if (this.video.paused) {
            this.video.play().catch(err => console.error('Play error:', err));
        } else {
            this.video.pause();
        }
    }

    handleReaction(type, e) {
        if (e) e.stopPropagation();
        if (!this.state.userId) {
            this.showNotification('Войдите, чтобы ставить реакции');
            return;
        }
        if (!this.state.playlist || this.state.playlist.length === 0) return;
        const videoData = this.state.playlist[this.state.currentIndex].data;
        if (type === 'like') {
            if (videoData.userLikes.has(this.state.userId)) {
                videoData.userLikes.delete(this.state.userId);
                videoData.likes--;
            } else {
                if (videoData.userDislikes.has(this.state.userId)) {
                    videoData.userDislikes.delete(this.state.userId);
                    videoData.dislikes--;
                }
                videoData.userLikes.add(this.state.userId);
                videoData.likes++;
                this.showReaction('like');
            }
        } else if (type === 'dislike') {
            if (videoData.userDislikes.has(this.state.userId)) {
                videoData.userDislikes.delete(this.state.userId);
                videoData.dislikes--;
            } else {
                if (videoData.userLikes.has(this.state.userId)) {
                    videoData.userLikes.delete(this.state.userId);
                    videoData.likes--;
                }
                videoData.userDislikes.add(this.state.userId);
                videoData.dislikes++;
                this.showReaction('dislike');
            }
        } else if (type === 'comment') {
            this.commentsWindow.classList.toggle('visible');
            if (this.commentsWindow.classList.contains('visible')) this.commentInput.focus();
        } else if (type === 'share') {
            this.shareModal.classList.add('visible');
        }
        this.updateCounters();
        this.updateVideoCache(this.state.currentIndex);
    }

    showReaction(type) {
        if (!this.reactionAnimation) return;
        this.reactionAnimation.innerHTML = type === 'like' ? '<i class="fas fa-thumbs-up"></i>' : '<i class="fas fa-thumbs-down"></i>';
        this.reactionAnimation.classList.add('show');
        setTimeout(() => this.reactionAnimation.classList.remove('show'), 2000);
    }

    toggleSubmenu(e) {
        e.stopPropagation();
        this.state.isSubmenuOpen = !this.state.isSubmenuOpen;
        this.submenuUpload.classList.toggle('active', this.state.isSubmenuOpen);
        this.submenuChat.classList.toggle('active', this.state.isSubmenuOpen);
    }

    toggleReactionBarVisibility(e) {
        e.stopPropagation();
        if (this.reactionBar.classList.contains('visible')) {
            this.reactionBar.classList.remove('visible');
            this.toggleReactionBar.classList.remove('active');
            this.toggleReactionBar.innerHTML = '<i class="fas fa-arrow-right"></i>';
        } else {
            this.reactionBar.classList.add('visible');
            this.toggleReactionBar.classList.add('active');
            this.toggleReactionBar.innerHTML = '<i class="fas fa-arrow-left"></i>';
            setTimeout(() => {
                if (this.reactionBar.classList.contains('visible')) {
                    this.reactionBar.classList.remove('visible');
                    this.toggleReactionBar.classList.remove('active');
                    this.toggleReactionBar.innerHTML = '<i class="fas fa-arrow-right"></i>';
                }
            }, 15000);
        }
    }

    async downloadCurrentVideo(e) {
        e.stopPropagation();
        if (!this.state.playlist || this.state.playlist.length === 0) {
            this.showNotification('Нет видео для скачивания!');
            return;
        }
        const videoUrl = this.state.playlist[this.state.currentIndex].url;
        if (!videoUrl) {
            this.showNotification('Нет видео для скачивания!');
            return;
        }

        this.uploadBtn.classList.add('downloading');
        this.uploadBtn.style.setProperty('--progress', '0%');

        try {
            const response = await fetch(videoUrl, { mode: 'cors' });
            if (!response.ok) throw new Error(`Ошибка загрузки: ${response.status}`);

            const total = Number(response.headers.get('content-length')) || 0;
            let loaded = 0;
            const chunks = [];

            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                loaded += value.length;
                const progress = total ? (loaded / total) * 100 : this.simulateProgress(loaded);
                this.uploadBtn.style.setProperty('--progress', `${progress}%`);
            }

            const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'video/mp4' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `video_${Date.now()}.mp4`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            this.showNotification('Видео успешно скачано!');
        } catch (error) {
            console.error('Ошибка скачивания:', error);
            this.showNotification(`Не удалось скачать видео: ${error.message}`);
        } finally {
            this.uploadBtn.classList.remove('downloading');
            this.uploadBtn.style.setProperty('--progress', '0%');
        }
    }

    simulateProgress(loaded) {
        return Math.min(100, (loaded / (1024 * 1024)) * 10);
    }

    startDragging(e) {
        e.preventDefault();
        let startY = e.type === 'mousedown' ? e.clientY : e.touches[0].clientY;
        let isDragging = true;

        const onMove = (e) => {
            if (!isDragging) return;
            const currentY = e.type === 'mousemove' ? e.clientY : e.touches[0].clientY;
            const deltaY = currentY - startY;
            if (deltaY > 50) {
                this.commentsWindow.classList.remove('visible');
                isDragging = false;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('touchmove', onMove);
            }
        };

        const onEnd = () => {
            isDragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchend', onEnd);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchend', onEnd);
    }

    handleSubmenuUpload(e) {
        e.stopPropagation();
        e.preventDefault();
        this.videoUpload.click();
        this.toggleSubmenu();
    }

    toggleFullscreen(e) {
        e.stopPropagation();
        e.preventDefault();

        if (this.tg && this.tg.requestFullscreen) {
            this.tg.requestFullscreen()
                .then(() => {
                    document.body.classList.add('telegram-fullscreen');
                    this.showNotification('Полноэкранный режим включён');
                })
                .catch((err) => {
                    console.error('Ошибка полноэкранного режима Telegram:', err);
                    this.tg.expand();
                    this.showNotification('Полноэкранный режим недоступен, использовано расширение');
                });
        } else if (!this.tg) {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen()
                    .then(() => document.body.classList.add('fullscreen-mode'))
                    .catch(err => {
                        console.error('Ошибка полноэкранного режима:', err);
                        this.showNotification('Полноэкранный режим не поддерживается');
                    });
            } else {
                document.exitFullscreen()
                    .then(() => document.body.classList.remove('fullscreen-mode'))
                    .catch(err => console.error('Ошибка выхода из полноэкранного режима:', err));
            }
        } else {
            this.showNotification('Полноэкранный режим недоступен');
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const videoManager = new VideoManager();
    try {
        await videoManager.init();
        console.log('VideoManager успешно инициализирован');
    } catch (error) {
        console.error('Ошибка инициализации VideoManager:', error);
        videoManager.showNotification('Ошибка инициализации приложения');
    }
});
