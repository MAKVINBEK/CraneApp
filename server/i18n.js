const SUPPORTED_LANGUAGES = ['ru', 'en', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'uk', 'tr'];

const messages = {
  ru: {
    accessDenied: 'Доступ запрещён',
    noToken: 'Токен не передан',
    invalidToken: 'Недействительный токен',
    tokenExpired: 'Срок действия токена истёк',
    loginAgain: 'Войдите снова',
    userNotFound: 'Пользователь не найден',
    serverConfigError: 'Ошибка конфигурации сервера',
    authSystemConfigError: 'Система авторизации не настроена',
    authenticationError: 'Ошибка авторизации',
    internalServerError: 'Внутренняя ошибка сервера',
    unauthorized: 'Не авторизован',
    unsupportedMediaType: 'Неподдерживаемый тип данных',
    tooManyRequests: 'Слишком много запросов. Попробуйте позже.',
    tooManyFailedAttempts: 'Слишком много неудачных попыток. Попробуйте через {minutes} мин.',
    accountBlocked: 'Аккаунт заблокирован',
    accountBlockedReason: 'Аккаунт заблокирован. Причина: {reason}',
    accountBlockedSupport: 'Ваш аккаунт заблокирован. Обратитесь в поддержку.',
    usernamePasswordRequired: 'Введите юзернейм и пароль',
    invalidUsernamePassword: 'Неверный юзернейм или пароль',
    usernameLength: 'Юзернейм должен содержать 5-32 символа',
    usernameFormat: 'Юзернейм может содержать только буквы, цифры и подчёркивания',
    usernameTaken: 'Юзернейм уже занят',
    passwordMin: 'Пароль должен быть не короче 6 символов',
    firstNameRequired: 'Введите имя',
    invalid2FA: 'Неверный доп. пароль 2FA',
    invalidAdditionalPassword: 'Неверный доп. пароль',
    noPasscodeSet: 'Код-пароль не установлен',
    mutedReason: 'Вы замучены. Причина: {reason}',
    muted: 'Вы замучены',
    mutedCannotSend: 'Вы замучены и не можете отправлять сообщения',
    replyNotFound: 'Сообщение для ответа не найдено',
    pollGroupOnly: 'Опросы доступны только в групповых чатах',
    pollQuestionRequired: 'Укажите вопрос опроса',
    pollOptionsCount: 'В опросе должно быть от 2 до 10 вариантов',
    pollNotFound: 'Опрос не найден',
    pollNotPollMessage: 'Сообщение не является опросом',
    pollInvalidOption: 'Недопустимый вариант ответа',
    pollSingleOptionOnly: 'Можно выбрать только один вариант',
    pollOptionIdsRequired: 'Укажите варианты для голосования',
    messageNotFound: 'Сообщение не найдено',
    titleRequired: 'Введите название',
    membersRequired: 'Добавьте участников',
    groupAddPrivacyNone: '{name} не разрешает добавлять себя в группы',
    groupAddPrivacyContacts: '{name} разрешает добавление только своим контактам',
    forwardedFrom: 'Переслано от {name}',
    unknown: 'Неизвестно',
    browser: 'Браузер',
    localNetwork: 'Локальная сеть',
    loginNotification: '🔐 Новый вход в аккаунт\n\n📱 Устройство: {device}\n🌍 Местоположение: {location}\n🌐 IP-адрес: {ip}\n🕐 Время: {time}\n\nЕсли это были не вы — немедленно смените пароль.',
    groupCreatedSystem: '{name} создал(а) группу',
    user: 'Пользователь',
    premiumYes: 'Да',
    premiumNo: 'Нет',
    lastSeenUnknown: 'неизвестно',
    bothPasswordsRequired: 'Введите текущий и новый пароль',
    currentPasswordInvalid: 'Неверный текущий пароль',
    invalidPassword: 'Неверный пароль',
    twoFANotSet: '2FA не установлена',
    none: 'нет',
    qrExpiredTitle: 'QR-код истёк',
    qrExpiredDesc: 'Сгенерируйте новый код в приложении CraneApp',
    qrLoginTitle: 'Вход в CraneApp',
    qrLoginPrompt: 'Войти в CraneApp на этом устройстве?',
    qrLoginButton: 'Войти',
    qrLoginSuccess: '✓ Выполняется вход...',
    botHelp: '🤖 Привет! Я CraneApp — официальный бот.\n\n📋 Команды:\n/help — список команд\n/status — мой статус\n/support текст — написать в поддержку',
    botDevCommands: '\n\n🔧 Команды разработчика:\n/badge @user verified|admin|developer|premium|fake|scam — добавить значок\n/unbadge @user [значок] — убрать значок\n/premium @user — выдать/снять Premium\n/mute @user [мин] — замутить\n/unmute @user — размутить\n/ban @user — заблокировать\n/unban @user — разблокировать\n/info @user — информация\n/broadcast текст — рассылка\n/stats — статистика',
    botBadges: 'Значки',
    botError: 'Ошибка: {message}',
    botSupportUsage: 'Укажите сообщение: /support ваш вопрос',
    botSupportCooldown: 'Вы уже отправляли запрос. Следующий можно отправить через {minutes} мин.',
    botSupportSent: 'Ваш запрос отправлен в поддержку. Мы ответим в ближайшее время.',
    botSupportNotification: '📨 Новый запрос в поддержку от @{username}:\n"{message}"',
    botSpecifyUsername: 'Укажите @username',
    botAvailableBadges: 'Доступные значки: {badges}',
    botUserNotFoundAt: 'Пользователь @{username} не найден',
    botBadgeAdded: '@{username} — значок «{badge}» добавлен',
    botBadgeRemoved: '@{username} — значок «{badge}» снят',
    botBadgesCleared: '@{username} — все значки сняты',
    botPremiumGranted: '@{username} — Premium выдан 💎',
    botPremiumRemoved: '@{username} — Premium снят',
    botMuted: '@{username} замучен на {minutes} мин. (до {time})',
    botUnmuted: '@{username} размучен',
    botBanned: '@{username} заблокирован',
    botUnbanned: '@{username} разблокирован',
    botBadge: 'Значок',
    botFake: 'Фейк',
    botMute: 'Мут',
    botBan: 'Бан',
    botRegistration: 'Регистрация',
    botLastSeen: 'Последний визит',
    botBroadcastUsage: 'Укажите текст рассылки',
    botBroadcastSent: 'Рассылка отправлена {count} пользователям',
    botStatsTitle: 'Статистика CraneApp',
    botStatsUsers: 'Пользователей',
    botStatsBanned: 'Забанено',
    botStatsChats: 'Чатов',
    botStatsMessagesToday: 'Сообщений за 24ч',
    botUnknownCommand: 'Неизвестная команда. Напишите /help',
    adminsPinOnly: 'Только администраторы могут закреплять сообщения',
    supportRequestClosed: 'Запрос уже закрыт',
    messageRequired: 'Введите сообщение',
    requestNotFound: 'Запрос не найден',
    botNotFound: 'Бот не найден',
    privateChatTitle: 'Личный чат',
    botWelcome: '🤖 Здравствуй! Я CraneApp — официальный бот.\n\n✨ Что я умею:\n• Уведомлять о входах с новых устройств\n• Следить за безопасностью твоего аккаунта\n• Сообщать о важных обновлениях\n• Отвечать на твои вопросы 24/7\n\n🛡️ Безопасность превыше всего — если замечу что-то подозрительное, мгновенно сообщу.\n\n💡 Напиши /help в любой момент, чтобы узнать все мои команды.\n\nДобро пожаловать в CraneApp! 🚀'
  },
  en: {
    accessDenied: 'Access denied',
    noToken: 'No token provided',
    invalidToken: 'Invalid token',
    tokenExpired: 'Token expired',
    loginAgain: 'Please log in again',
    userNotFound: 'User not found',
    serverConfigError: 'Server configuration error',
    authSystemConfigError: 'Authentication system is not configured',
    authenticationError: 'Authentication error',
    internalServerError: 'Internal server error',
    unauthorized: 'Unauthorized',
    unsupportedMediaType: 'Unsupported media type',
    tooManyRequests: 'Too many requests. Try again later.',
    tooManyFailedAttempts: 'Too many failed attempts. Try again in {minutes} min.',
    accountBlocked: 'Account blocked',
    accountBlockedReason: 'Account blocked. Reason: {reason}',
    accountBlockedSupport: 'Your account is blocked. Contact support.',
    usernamePasswordRequired: 'Enter username and password',
    invalidUsernamePassword: 'Invalid username or password',
    usernameLength: 'Username must be 5-32 characters',
    usernameFormat: 'Username can only contain letters, numbers, and underscores',
    usernameTaken: 'Username already taken',
    passwordMin: 'Password must be at least 6 characters',
    firstNameRequired: 'First name is required',
    invalid2FA: 'Invalid 2FA password',
    invalidAdditionalPassword: 'Invalid additional password',
    noPasscodeSet: 'No passcode set',
    mutedReason: 'You are muted. Reason: {reason}',
    muted: 'You are muted',
    mutedCannotSend: 'You are muted and cannot send messages',
    replyNotFound: 'Reply message not found',
    pollGroupOnly: 'Polls are only available in group chats',
    pollQuestionRequired: 'Poll question is required',
    pollOptionsCount: 'A poll must have 2 to 10 options',
    pollNotFound: 'Poll not found',
    pollNotPollMessage: 'Message is not a poll',
    pollInvalidOption: 'Invalid poll option',
    pollSingleOptionOnly: 'Only one option is allowed',
    pollOptionIdsRequired: 'optionIds are required',
    messageNotFound: 'Message not found',
    titleRequired: 'Enter a title',
    membersRequired: 'Add members',
    groupAddPrivacyNone: '{name} does not allow being added to groups',
    groupAddPrivacyContacts: '{name} only allows contacts to add them',
    forwardedFrom: 'Forwarded from {name}',
    unknown: 'Unknown',
    browser: 'Browser',
    localNetwork: 'Local network',
    loginNotification: '🔐 New login to your account\n\n📱 Device: {device}\n🌍 Location: {location}\n🌐 IP address: {ip}\n🕐 Time: {time}\n\nIf this was not you, change your password immediately.',
    groupCreatedSystem: '{name} created the group',
    user: 'User',
    premiumYes: 'Yes',
    premiumNo: 'No',
    lastSeenUnknown: 'unknown',
    bothPasswordsRequired: 'Enter current and new password',
    currentPasswordInvalid: 'Current password is incorrect',
    invalidPassword: 'Invalid password',
    twoFANotSet: '2FA is not enabled',
    none: 'none',
    qrExpiredTitle: 'QR code expired',
    qrExpiredDesc: 'Generate a new code in the CraneApp app',
    qrLoginTitle: 'Sign in to CraneApp',
    qrLoginPrompt: 'Sign in to CraneApp on this device?',
    qrLoginButton: 'Sign in',
    qrLoginSuccess: '✓ Signing in...',
    botHelp: '🤖 Hi! I am CraneApp, the official bot.\n\n📋 Commands:\n/help — command list\n/status — my status\n/support text — contact support',
    botDevCommands: '\n\n🔧 Developer commands:\n/badge @user verified|admin|developer|premium|fake|scam — add badge\n/unbadge @user [badge] — remove badge\n/premium @user — grant/remove Premium\n/mute @user [min] — mute\n/unmute @user — unmute\n/ban @user — ban\n/unban @user — unban\n/info @user — info\n/broadcast text — broadcast\n/stats — statistics',
    botBadges: 'Badges',
    botError: 'Error: {message}',
    botSupportUsage: 'Specify a message: /support your question',
    botSupportCooldown: 'You have already sent a request. You can send the next one in {minutes} min.',
    botSupportSent: 'Your request was sent to support. We will reply soon.',
    botSupportNotification: '📨 New support request from @{username}:\n"{message}"',
    botSpecifyUsername: 'Specify @username',
    botAvailableBadges: 'Available badges: {badges}',
    botUserNotFoundAt: 'User @{username} not found',
    botBadgeAdded: '@{username} — badge "{badge}" added',
    botBadgeRemoved: '@{username} — badge "{badge}" removed',
    botBadgesCleared: '@{username} — all badges removed',
    botPremiumGranted: '@{username} — Premium granted 💎',
    botPremiumRemoved: '@{username} — Premium removed',
    botMuted: '@{username} muted for {minutes} min. (until {time})',
    botUnmuted: '@{username} unmuted',
    botBanned: '@{username} banned',
    botUnbanned: '@{username} unbanned',
    botBadge: 'Badge',
    botFake: 'Fake',
    botMute: 'Mute',
    botBan: 'Ban',
    botRegistration: 'Registration',
    botLastSeen: 'Last seen',
    botBroadcastUsage: 'Specify broadcast text',
    botBroadcastSent: 'Broadcast sent to {count} users',
    botStatsTitle: 'CraneApp statistics',
    botStatsUsers: 'Users',
    botStatsBanned: 'Banned',
    botStatsChats: 'Chats',
    botStatsMessagesToday: 'Messages in 24h',
    botUnknownCommand: 'Unknown command. Type /help',
    adminsPinOnly: 'Only administrators can pin messages',
    supportRequestClosed: 'Request is already closed',
    messageRequired: 'Enter a message',
    requestNotFound: 'Request not found',
    botNotFound: 'Bot not found',
    privateChatTitle: 'Private chat',
    botWelcome: '🤖 Hello! I am CraneApp, the official bot.\n\n✨ What I can do:\n• Notify you about logins from new devices\n• Help protect your account\n• Share important updates\n• Answer your questions 24/7\n\n🛡️ Security comes first. If I notice anything suspicious, I will let you know immediately.\n\n💡 Type /help anytime to see all my commands.\n\nWelcome to CraneApp! 🚀'
  },
  de: {
    accessDenied: 'Zugriff verweigert', noToken: 'Kein Token übergeben', invalidToken: 'Ungültiges Token',
    tokenExpired: 'Token abgelaufen', loginAgain: 'Bitte erneut anmelden', userNotFound: 'Benutzer nicht gefunden',
    unauthorized: 'Nicht autorisiert', tooManyRequests: 'Zu viele Anfragen. Versuche es später erneut.',
    accountBlocked: 'Konto gesperrt', usernamePasswordRequired: 'Benutzername und Passwort eingeben',
    invalidUsernamePassword: 'Ungültiger Benutzername oder Passwort', invalid2FA: 'Ungültiges 2FA-Passwort',
    unknown: 'Unbekannt', browser: 'Browser', localNetwork: 'Lokales Netzwerk',
    loginNotification: '🔐 Neue Anmeldung bei deinem Konto\n\n📱 Gerät: {device}\n🌍 Standort: {location}\n🌐 IP-Adresse: {ip}\n🕐 Zeit: {time}\n\nWenn du das nicht warst, ändere sofort dein Passwort.',
    pollGroupOnly: 'Umfragen sind nur in Gruppenchats verfügbar',
    pollQuestionRequired: 'Umfragefrage erforderlich',
    pollOptionsCount: 'Eine Umfrage muss 2 bis 10 Optionen haben',
    pollNotFound: 'Umfrage nicht gefunden',
    pollNotPollMessage: 'Nachricht ist keine Umfrage',
    pollInvalidOption: 'Ungültige Umfrageoption',
    pollSingleOptionOnly: 'Nur eine Option ist erlaubt',
    pollOptionIdsRequired: 'optionIds sind erforderlich',
    messageNotFound: 'Nachricht nicht gefunden'
  },
  fr: {
    accessDenied: 'Accès refusé', noToken: 'Aucun jeton fourni', invalidToken: 'Jeton invalide',
    tokenExpired: 'Jeton expiré', loginAgain: 'Veuillez vous reconnecter', userNotFound: 'Utilisateur introuvable',
    unauthorized: 'Non autorisé', tooManyRequests: 'Trop de requêtes. Réessayez plus tard.',
    accountBlocked: 'Compte bloqué', usernamePasswordRequired: 'Entrez le nom d’utilisateur et le mot de passe',
    invalidUsernamePassword: 'Nom d’utilisateur ou mot de passe invalide', invalid2FA: 'Mot de passe 2FA invalide',
    unknown: 'Inconnu', browser: 'Navigateur', localNetwork: 'Réseau local',
    loginNotification: '🔐 Nouvelle connexion à votre compte\n\n📱 Appareil : {device}\n🌍 Emplacement : {location}\n🌐 Adresse IP : {ip}\n🕐 Heure : {time}\n\nSi ce n’était pas vous, changez immédiatement votre mot de passe.',
    pollGroupOnly: 'Les sondages sont disponibles uniquement dans les groupes',
    pollQuestionRequired: 'La question du sondage est requise',
    pollOptionsCount: 'Un sondage doit avoir de 2 à 10 options',
    pollNotFound: 'Sondage introuvable',
    pollNotPollMessage: 'Ce message n’est pas un sondage',
    pollInvalidOption: 'Option de sondage invalide',
    pollSingleOptionOnly: 'Une seule option est autorisée',
    pollOptionIdsRequired: 'optionIds requis',
    messageNotFound: 'Message introuvable'
  },
  es: {
    accessDenied: 'Acceso denegado', noToken: 'No se proporcionó token', invalidToken: 'Token no válido',
    tokenExpired: 'Token caducado', loginAgain: 'Inicia sesión de nuevo', userNotFound: 'Usuario no encontrado',
    unauthorized: 'No autorizado', tooManyRequests: 'Demasiadas solicitudes. Inténtalo más tarde.',
    accountBlocked: 'Cuenta bloqueada', usernamePasswordRequired: 'Introduce usuario y contraseña',
    invalidUsernamePassword: 'Usuario o contraseña inválidos', invalid2FA: 'Contraseña 2FA inválida',
    unknown: 'Desconocido', browser: 'Navegador', localNetwork: 'Red local',
    loginNotification: '🔐 Nuevo inicio de sesión en tu cuenta\n\n📱 Dispositivo: {device}\n🌍 Ubicación: {location}\n🌐 Dirección IP: {ip}\n🕐 Hora: {time}\n\nSi no fuiste tú, cambia tu contraseña inmediatamente.',
    pollGroupOnly: 'Las encuestas solo están disponibles en grupos',
    pollQuestionRequired: 'La pregunta de la encuesta es obligatoria',
    pollOptionsCount: 'La encuesta debe tener entre 2 y 10 opciones',
    pollNotFound: 'Encuesta no encontrada',
    pollNotPollMessage: 'El mensaje no es una encuesta',
    pollInvalidOption: 'Opción de encuesta no válida',
    pollSingleOptionOnly: 'Solo se permite una opción',
    pollOptionIdsRequired: 'Se requieren optionIds',
    messageNotFound: 'Mensaje no encontrado'
  },
  it: {
    accessDenied: 'Accesso negato', noToken: 'Token non fornito', invalidToken: 'Token non valido',
    tokenExpired: 'Token scaduto', loginAgain: 'Accedi di nuovo', userNotFound: 'Utente non trovato',
    unauthorized: 'Non autorizzato', tooManyRequests: 'Troppe richieste. Riprova più tardi.',
    accountBlocked: 'Account bloccato', usernamePasswordRequired: 'Inserisci username e password',
    invalidUsernamePassword: 'Username o password non validi', invalid2FA: 'Password 2FA non valida',
    unknown: 'Sconosciuto', browser: 'Browser', localNetwork: 'Rete locale',
    loginNotification: '🔐 Nuovo accesso al tuo account\n\n📱 Dispositivo: {device}\n🌍 Posizione: {location}\n🌐 Indirizzo IP: {ip}\n🕐 Ora: {time}\n\nSe non eri tu, cambia subito la password.',
    pollGroupOnly: 'I sondaggi sono disponibili solo nei gruppi',
    pollQuestionRequired: 'La domanda del sondaggio è obbligatoria',
    pollOptionsCount: 'Un sondaggio deve avere da 2 a 10 opzioni',
    pollNotFound: 'Sondaggio non trovato',
    pollNotPollMessage: 'Il messaggio non è un sondaggio',
    pollInvalidOption: 'Opzione del sondaggio non valida',
    pollSingleOptionOnly: 'È consentita una sola opzione',
    pollOptionIdsRequired: 'optionIds obbligatori',
    messageNotFound: 'Messaggio non trovato'
  },
  pt: {
    accessDenied: 'Acesso negado', noToken: 'Token não fornecido', invalidToken: 'Token inválido',
    tokenExpired: 'Token expirado', loginAgain: 'Entre novamente', userNotFound: 'Usuário não encontrado',
    unauthorized: 'Não autorizado', tooManyRequests: 'Muitas solicitações. Tente mais tarde.',
    accountBlocked: 'Conta bloqueada', usernamePasswordRequired: 'Informe usuário e senha',
    invalidUsernamePassword: 'Usuário ou senha inválidos', invalid2FA: 'Senha 2FA inválida',
    unknown: 'Desconhecido', browser: 'Navegador', localNetwork: 'Rede local',
    loginNotification: '🔐 Novo login na sua conta\n\n📱 Dispositivo: {device}\n🌍 Localização: {location}\n🌐 Endereço IP: {ip}\n🕐 Hora: {time}\n\nSe não foi você, altere sua senha imediatamente.',
    pollGroupOnly: 'Enquetes estão disponíveis apenas em grupos',
    pollQuestionRequired: 'A pergunta da enquete é obrigatória',
    pollOptionsCount: 'A enquete deve ter de 2 a 10 opções',
    pollNotFound: 'Enquete não encontrada',
    pollNotPollMessage: 'A mensagem não é uma enquete',
    pollInvalidOption: 'Opção de enquete inválida',
    pollSingleOptionOnly: 'Apenas uma opção é permitida',
    pollOptionIdsRequired: 'optionIds são obrigatórios',
    messageNotFound: 'Mensagem não encontrada'
  },
  pl: {
    accessDenied: 'Odmowa dostępu', noToken: 'Brak tokenu', invalidToken: 'Nieprawidłowy token',
    tokenExpired: 'Token wygasł', loginAgain: 'Zaloguj się ponownie', userNotFound: 'Nie znaleziono użytkownika',
    unauthorized: 'Brak autoryzacji', tooManyRequests: 'Zbyt wiele żądań. Spróbuj później.',
    accountBlocked: 'Konto zablokowane', usernamePasswordRequired: 'Podaj nazwę użytkownika i hasło',
    invalidUsernamePassword: 'Nieprawidłowa nazwa użytkownika lub hasło', invalid2FA: 'Nieprawidłowe hasło 2FA',
    unknown: 'Nieznane', browser: 'Przeglądarka', localNetwork: 'Sieć lokalna',
    loginNotification: '🔐 Nowe logowanie na konto\n\n📱 Urządzenie: {device}\n🌍 Lokalizacja: {location}\n🌐 Adres IP: {ip}\n🕐 Czas: {time}\n\nJeśli to nie Ty, natychmiast zmień hasło.',
    pollGroupOnly: 'Ankiety są dostępne tylko w grupach',
    pollQuestionRequired: 'Pytanie ankiety jest wymagane',
    pollOptionsCount: 'Ankieta musi mieć od 2 do 10 opcji',
    pollNotFound: 'Nie znaleziono ankiety',
    pollNotPollMessage: 'Wiadomość nie jest ankietą',
    pollInvalidOption: 'Nieprawidłowa opcja ankiety',
    pollSingleOptionOnly: 'Dozwolona jest tylko jedna opcja',
    pollOptionIdsRequired: 'Wymagane są optionIds',
    messageNotFound: 'Nie znaleziono wiadomości'
  },
  uk: {
    accessDenied: 'Доступ заборонено', noToken: 'Токен не передано', invalidToken: 'Недійсний токен',
    tokenExpired: 'Термін дії токена минув', loginAgain: 'Увійдіть знову', userNotFound: 'Користувача не знайдено',
    unauthorized: 'Не авторизовано', tooManyRequests: 'Забагато запитів. Спробуйте пізніше.',
    accountBlocked: 'Акаунт заблоковано', usernamePasswordRequired: 'Введіть юзернейм і пароль',
    invalidUsernamePassword: 'Невірний юзернейм або пароль', invalid2FA: 'Невірний пароль 2FA',
    unknown: 'Невідомо', browser: 'Браузер', localNetwork: 'Локальна мережа',
    loginNotification: '🔐 Новий вхід в акаунт\n\n📱 Пристрій: {device}\n🌍 Місцезнаходження: {location}\n🌐 IP-адреса: {ip}\n🕐 Час: {time}\n\nЯкщо це були не ви, негайно змініть пароль.',
    pollGroupOnly: 'Опитування доступні лише в групових чатах',
    pollQuestionRequired: 'Потрібно вказати питання опитування',
    pollOptionsCount: 'В опитуванні має бути від 2 до 10 варіантів',
    pollNotFound: 'Опитування не знайдено',
    pollNotPollMessage: 'Повідомлення не є опитуванням',
    pollInvalidOption: 'Недопустимий варіант відповіді',
    pollSingleOptionOnly: 'Можна вибрати лише один варіант',
    pollOptionIdsRequired: 'Потрібно вказати optionIds',
    messageNotFound: 'Повідомлення не знайдено'
  },
  tr: {
    accessDenied: 'Erişim reddedildi', noToken: 'Token sağlanmadı', invalidToken: 'Geçersiz token',
    tokenExpired: 'Token süresi doldu', loginAgain: 'Lütfen tekrar giriş yap', userNotFound: 'Kullanıcı bulunamadı',
    unauthorized: 'Yetkisiz', tooManyRequests: 'Çok fazla istek. Daha sonra tekrar dene.',
    accountBlocked: 'Hesap engellendi', usernamePasswordRequired: 'Kullanıcı adı ve şifre gir',
    invalidUsernamePassword: 'Geçersiz kullanıcı adı veya şifre', invalid2FA: 'Geçersiz 2FA şifresi',
    unknown: 'Bilinmiyor', browser: 'Tarayıcı', localNetwork: 'Yerel ağ',
    loginNotification: '🔐 Hesabına yeni giriş\n\n📱 Cihaz: {device}\n🌍 Konum: {location}\n🌐 IP adresi: {ip}\n🕐 Zaman: {time}\n\nBu sen değilsen hemen şifreni değiştir.',
    pollGroupOnly: 'Anketler yalnızca grup sohbetlerinde kullanılabilir',
    pollQuestionRequired: 'Anket sorusu gerekli',
    pollOptionsCount: 'Ankette 2 ile 10 seçenek olmalıdır',
    pollNotFound: 'Anket bulunamadı',
    pollNotPollMessage: 'Mesaj bir anket değil',
    pollInvalidOption: 'Geçersiz anket seçeneği',
    pollSingleOptionOnly: 'Yalnızca bir seçenek seçilebilir',
    pollOptionIdsRequired: 'optionIds gerekli',
    messageNotFound: 'Mesaj bulunamadı'
  }
};

function normalizeLanguage(value) {
  const lang = String(value || '').toLowerCase().split(',')[0].split(';')[0].split('-')[0].trim();
  return SUPPORTED_LANGUAGES.includes(lang) ? lang : null;
}

function format(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

function t(lang, key, vars) {
  const code = normalizeLanguage(lang) || 'ru';
  const template = messages[code]?.[key] ?? messages.en?.[key] ?? messages.ru?.[key] ?? key;
  return format(template, vars);
}

function languageFromHeaders(req) {
  return normalizeLanguage(req.headers['x-crane-language'])
    || normalizeLanguage(req.headers['accept-language'])
    || 'ru';
}

async function languageForUser(userId, query) {
  if (!userId || !query) return null;
  try {
    const result = await query(
      `SELECT u.language AS user_language, us.settings->>'language' AS settings_language
       FROM users u
       LEFT JOIN user_settings us ON us.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );
    const row = result.rows[0] || {};
    return normalizeLanguage(row.settings_language) || normalizeLanguage(row.user_language);
  } catch (_) {
    return null;
  }
}

async function getRequestLanguage(req, query, jwt, secret) {
  if (req.user?.settings_language || req.user?.language) {
    return normalizeLanguage(req.user.settings_language) || normalizeLanguage(req.user.language) || languageFromHeaders(req);
  }

  let userId = req.user?.id || req.user?.userId;
  const authHeader = req.headers.authorization || '';
  if (!userId && jwt && secret && authHeader.startsWith('Bearer ')) {
    try {
      userId = jwt.verify(authHeader.split(' ')[1], secret).userId;
    } catch (_) {}
  }

  return await languageForUser(userId, query) || languageFromHeaders(req);
}

function middleware({ query, jwt, secret }) {
  return async (req, res, next) => {
    req.locale = await getRequestLanguage(req, query, jwt, secret);
    req.t = (key, vars) => t(req.locale, key, vars);
    next();
  };
}

module.exports = {
  SUPPORTED_LANGUAGES,
  messages,
  normalizeLanguage,
  languageFromHeaders,
  languageForUser,
  getRequestLanguage,
  middleware,
  t
};
