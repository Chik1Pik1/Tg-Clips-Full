const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const formidable = require('formidable-serverless');

const app = express();

// Настройка CORS
const allowedOrigins = [
    'https://tg-clips-git-main-andrejs-projects-02565dec.vercel.app',
    'http://localhost:3000',
    'https://*.telegram.org'
];

app.use(
    cors({
        origin: (origin, callback) => {
            console.log('CORS: Запрос от origin:', origin); // Логирование для отладки
            if (!origin || allowedOrigins.includes(origin) || allowedOrigins.some(o => o.includes('*') && new RegExp(o.replace('*', '.*')).test(origin))) {
                callback(null, origin || '*');
            } else {
                console.error('CORS: Отклонен origin:', origin);
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: false,
        optionsSuccessStatus: 204
    })
);

// Явная обработка предварительных запросов (OPTIONS)
app.options('*', cors());

// Парсинг JSON
app.use(express.json({ limit: '100mb' }));

// Инициализация Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Получение публичных видео
app.get('/api/public-videos', async (req, res) => {
    try {
        console.log('GET /api/public-videos: Запрос получен');
        const { data, error } = await supabase.from('videos').select('*').eq('is_public', true);
        if (error) {
            console.error('Ошибка Supabase:', error);
            throw error;
        }
        console.log('GET /api/public-videos: Успешно, данные:', data.length, 'видео');
        res.json(data);
    } catch (error) {
        console.error('Ошибка получения видео:', error.message);
        res.status(500).json({ error: 'Ошибка сервера при получении видео' });
    }
});

// Регистрация канала
app.post('/api/register-channel', async (req, res) => {
    const { telegram_id, channel_link } = req.body;
    console.log('POST /api/register-channel: telegram_id=', telegram_id, 'channel_link=', channel_link);

    if (!telegram_id || !channel_link) {
        console.error('Ошибка: Отсутствуют telegram_id или channel_link');
        return res.status(400).json({ error: 'Требуются telegram_id и channel_link' });
    }

    try {
        const { data, error } = await supabase
            .from('channels')
            .upsert({ telegram_id, channel_link }, { onConflict: ['telegram_id'] })
            .select();

        if (error) {
            console.error('Ошибка Supabase при регистрации канала:', error);
            throw error;
        }

        console.log('Канал зарегистрирован:', data);
        res.json({ message: 'Канал успешно зарегистрирован', channel: data[0] });
    } catch (error) {
        console.error('Ошибка регистрации канала:', error.message);
        res.status(500).json({ error: 'Ошибка сервера при регистрации канала' });
    }
});

// Загрузка видео
app.post('/api/upload-video', async (req, res) => {
    console.log('POST /api/upload-video: Запрос получен');
    const form = new formidable.IncomingForm({ maxFileSize: 100 * 1024 * 1024 });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Ошибка разбора формы:', err);
            return res.status(400).json({ error: 'Ошибка обработки файла' });
        }

        const telegram_id = fields.telegram_id;
        const description = fields.description || '';
        const file = files.file;

        console.log('Данные формы: telegram_id=', telegram_id, 'description=', description, 'file=', file);

        if (!telegram_id || !file) {
            console.error('Ошибка: Отсутствуют telegram_id или файл');
            return res.status(400).json({ error: 'Требуются telegram_id и файл' });
        }

        try {
            const fileContent = require('fs').readFileSync(file.path);
            const fileName = `${telegram_id}/${Date.now()}_${file.name}`;
            const { error: uploadError } = await supabase.storage
                .from('videos')
                .upload(fileName, fileContent, { contentType: file.type });

            if (uploadError) {
                console.error('Ошибка загрузки в Supabase Storage:', uploadError);
                throw uploadError;
            }

            const { publicURL, error: urlError } = supabase.storage
                .from('videos')
                .getPublicUrl(fileName);

            if (urlError || !publicURL) {
                console.error('Ошибка получения публичного URL:', urlError);
                throw new Error('Не удалось получить URL видео');
            }

            const videoData = {
                url: publicURL,
                telegram_id,
                description,
                is_public: true,
                views: [],
                likes: 0,
                dislikes: 0,
                user_likes: [],
                user_dislikes: [],
                comments: [],
                shares: 0,
                view_time: 0,
                replays: 0,
                duration: 0,
                last_position: 0,
                chat_messages: []
            };

            const { data, error: insertError } = await supabase
                .from('videos')
                .insert([videoData])
                .select();

            if (insertError) {
                console.error('Ошибка вставки видео в Supabase:', insertError);
                throw insertError;
            }

            console.log('Видео загружено:', data);
            res.json({ url: publicURL, message: 'Видео успешно загружено' });
        } catch (error) {
            console.error('Ошибка загрузки видео:', error.message);
            res.status(500).json({ error: 'Ошибка сервера при загрузке видео' });
        }
    });
});

// Обновление видео
app.post('/api/update-video', async (req, res) => {
    const { url, telegram_id, description, views, likes, dislikes, user_likes, user_dislikes, comments, shares, view_time, replays, duration, last_position, chat_messages } = req.body;
    console.log('POST /api/update-video: url=', url, 'telegram_id=', telegram_id);

    if (!url || !telegram_id) {
        console.error('Ошибка: Отсутствуют url или telegram_id');
        return res.status(400).json({ error: 'Требуются url и telegram_id' });
    }

    try {
        const { data, error } = await supabase
            .from('videos')
            .update({
                description: description || '',
                views: views || [],
                likes: likes || 0,
                dislikes: dislikes || 0,
                user_likes: user_likes || [],
                user_dislikes: user_dislikes || [],
                comments: comments || [],
                shares: shares || 0,
                view_time: view_time || 0,
                replays: replays || 0,
                duration: duration || 0,
                last_position: last_position || 0,
                chat_messages: chat_messages || []
            })
            .eq('url', url)
            .eq('telegram_id', telegram_id)
            .select();

        if (error) {
            console.error('Ошибка Supabase при обновлении видео:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            console.error('Видео не найдено или нет прав');
            return res.status(403).json({ error: 'Видео не найдено или нет прав' });
        }

        console.log('Видео обновлено:', data);
        res.json({ message: 'Видео успешно обновлено', video: data[0] });
    } catch (error) {
        console.error('Ошибка обновления видео:', error.message);
        res.status(500).json({ error: 'Ошибка сервера при обновлении видео' });
    }
});

// Удаление видео
app.post('/api/delete-video', async (req, res) => {
    const { url, telegram_id } = req.body;
    console.log('POST /api/delete-video: url=', url, 'telegram_id=', telegram_id);

    if (!url || !telegram_id) {
        console.error('Ошибка: Отсутствуют url или telegram_id');
        return res.status(400).json({ error: 'Требуются url и telegram_id' });
    }

    try {
        const { data, error } = await supabase
            .from('videos')
            .delete()
            .eq('url', url)
            .eq('telegram_id', telegram_id)
            .select();

        if (error) {
            console.error('Ошибка Supabase при удалении видео:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            console.error('Видео не найдено или нет прав');
            return res.status(403).json({ error: 'Видео не найдено или нет прав' });
        }

        const fileName = url.split('/').pop();
        const { error: storageError } = await supabase.storage
            .from('videos')
            .remove([`${telegram_id}/${fileName}`]);

        if (storageError) {
            console.error('Ошибка удаления файла из Supabase Storage:', storageError);
            throw storageError;
        }

        console.log('Видео удалено:', data);
        res.json({ message: 'Видео успешно удалено' });
    } catch (error) {
        console.error('Ошибка удаления видео:', error.message);
        res.status(500).json({ error: 'Ошибка сервера при удалении видео' });
    }
});

// Скачивание видео
app.get('/api/download-video', async (req, res) => {
    const { url } = req.query;
    console.log('GET /api/download-video: url=', url);

    if (!url) {
        console.error('Ошибка: Отсутствует url');
        return res.status(400).json({ error: 'Требуется url видео' });
    }

    try {
        const fileName = url.split('/').pop();
        const { signedURL, error } = await supabase.storage
            .from('videos')
            .createSignedUrl(fileName, 60); // URL действителен 60 секунд

        if (error) {
            console.error('Ошибка создания signed URL:', error);
            throw error;
        }

        console.log('Signed URL создан:', signedURL);
        res.json({ signedUrl: signedURL });
    } catch (error) {
        console.error('Ошибка скачивания видео:', error.message);
        res.status(500).json({ error: 'Ошибка сервера при скачивании видео' });
    }
});

// Получение информации о канале
app.get('/api/get-channel', async (req, res) => {
    const { telegram_id } = req.query;
    console.log('GET /api/get-channel: telegram_id=', telegram_id);

    if (!telegram_id) {
        console.error('Ошибка: Отсутствует telegram_id');
        return res.status(400).json({ error: 'Требуется telegram_id' });
    }

    try {
        const { data, error } = await supabase
            .from('channels')
            .select('*')
            .eq('telegram_id', telegram_id);

        if (error) {
            console.error('Ошибка Supabase при получении канала:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            console.error('Канал не найден');
            return res.status(404).json({ error: 'Канал не найден' });
        }

        console.log('Канал найден:', data);
        res.json(data[0]);
    } catch (error) {
        console.error('Ошибка получения канала:', error.message);
        res.status(500).json({ error: 'Ошибка сервера при получении канала' });
    }
});

// Обработка некорректных маршрутов
app.use((req, res) => {
    console.log('Некорректный маршрут:', req.originalUrl);
    res.status(404).json({ error: 'Маршрут не найден' });
});

module.exports = app;
