# NNTime — шаблоны писем для Supabase

Готовые шаблоны на русском. Куда вставлять: **Supabase → Authentication → Emails → Templates**.

Для каждого шаблона в панели два поля: **Subject** (тема) и **Message body** (HTML). Скопируйте содержимое файла `.html` в тело письма, а строку из `.subject.txt` — в тему.

| Шаблон в Supabase | Файл | Тема письма |
|---|---|---|
| Confirm signup | `confirm-signup.html` | Подтвердите адрес — NNTime |
| Magic Link | `magic-link.html` | Вход в NNTime |
| Reset Password | `reset-password.html` | Сброс пароля — NNTime |
| Invite user | `invite-user.html` | Приглашение в NNTime |
| Change Email Address | `change-email.html` | Подтвердите новый адрес — NNTime |
| Reauthentication | `reauthentication.html` | Код подтверждения — NNTime |

## Переменные Supabase

| Переменная | Что подставляет |
|---|---|
| `{{ .ConfirmationURL }}` | готовая ссылка подтверждения / входа |
| `{{ .Token }}` | шестизначный код (можно вводить вместо ссылки) |
| `{{ .Email }}` | текущий адрес пользователя |
| `{{ .NewEmail }}` | новый адрес (только в шаблоне смены почты) |
| `{{ .SiteURL }}` | Site URL из Authentication → URL Configuration |

## Настройка

1. **Authentication → Emails → SMTP Settings** — подключить свой SMTP (иначе письма уходят только на адреса участников проекта, лимит ~2–3 в час).
2. **Authentication → Emails → Templates** — вставить тему и HTML для каждого шаблона.
3. **Authentication → URL Configuration** — Site URL `https://morozkoviezdman.github.io/NNTime/`, Redirect URLs — тот же адрес с `/NNTime/` и без завершающего слэша.
4. Проверить: **Authentication → Users → Send confirmation**.

## Особенности вёрстки

- Табличная вёрстка и inline-стили — так письмо корректно отображается в Gmail, Mail.ru, Яндекс.Почте и Apple Mail.
- Ширина карточки 480px, шрифты системные, кнопка с запасом по площади нажатия.
- После кнопки есть ссылка текстом — на случай, если клиент почты блокирует `href`.
- Код `{{ .Token }}` выводится крупно с разрядкой — удобно вводить с телефона.

## Полезно

- Тема письма без эмодзи и капса лучше проходит спам-фильтры.
- Если письма попадают в «Спам», проверьте домен отправителя в SMTP-провайдере (SPF/DKIM).
- Имя отправителя задаётся в **SMTP Settings → Sender name** (например, `NNTime`).
