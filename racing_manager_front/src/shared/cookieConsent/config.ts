import { run } from 'vanilla-cookieconsent';

function persistReadableConsent(categories: string[] | undefined) {
  const value = (categories ?? []).join(' ') || 'none';
  document.cookie = `cc_choice=${value}; Path=/; SameSite=Lax; Max-Age=${182 * 24 * 60 * 60}`;
}

export const cookieConsentConfig: Parameters<typeof run>[0] = {
  mode: 'opt-in',
  autoShow: true,
  hideFromBots: false,
  disablePageInteraction: false,
  manageScriptTags: true,
  cookie: {
    name: 'cc_cookie',
    expiresAfterDays: 182,
    sameSite: 'Lax',
  },
  guiOptions: {
    consentModal: {
      layout: 'bar',
      position: 'bottom',
      equalWeightButtons: true,
      flipButtons: false,
    },
    preferencesModal: {
      layout: 'box',
      equalWeightButtons: true,
      flipButtons: false,
    },
  },
  categories: {
    necessary: {
      enabled: true,
      readOnly: true,
    },
    analytics: {
      enabled: false,
      autoClear: {
        cookies: [{ name: /^(_ga|_gid|_ym)/ }],
      },
    },
    functional: {
      enabled: false,
    },
  },
  onConsent: ({ cookie }) => {
    persistReadableConsent(cookie.categories);
  },
  onChange: ({ cookie }) => {
    persistReadableConsent(cookie.categories);
  },
  language: {
    default: 'ru',
    translations: {
      ru: {
        consentModal: {
          title: 'Мы используем файлы cookie',
          description:
            'Портал использует cookies. Сейчас они нужны для авторизации; с вашего согласия мы также сможем применять аналитические и функциональные cookies — например, чтобы в будущем рекомендовать гонки по любимой трассе или дисциплине. Подробнее в <a href="/policy">политиках портала</a>. Вы можете принять или отказаться — мы запомним выбор.',
          acceptAllBtn: 'Принять',
          acceptNecessaryBtn: 'Отказаться',
          showPreferencesBtn: 'Настроить',
          footer: '<a href="/policy">Политики портала</a>',
        },
        preferencesModal: {
          title: 'Настройки cookies',
          acceptAllBtn: 'Принять все',
          acceptNecessaryBtn: 'Отказаться',
          savePreferencesBtn: 'Сохранить выбор',
          closeIconLabel: 'Закрыть',
          sections: [
            {
              title: 'Использование cookies',
              description:
                'Вы можете принять все cookies, оставить только технические или выбрать категории самостоятельно. Технические cookies нужны для входа в портал и не требуют дополнительного согласия. Подробности — в <a href="/policy">политиках портала</a>.',
            },
            {
              title: 'Технические cookies',
              description:
                'Нужны для работы портала: сессия авторизации и сохранение вашего решения по cookies. Эти файлы нельзя отключить.',
              linkedCategory: 'necessary',
              cookieTable: {
                headers: {
                  name: 'Имя',
                  domain: 'Назначение',
                  expiration: 'Срок',
                },
                body: [
                  {
                    name: 'connect.sid',
                    domain: 'Сессия авторизации',
                    expiration: 'Сессия',
                  },
                  {
                    name: 'cc_cookie',
                    domain: 'Сохраняет выбор согласия на cookies',
                    expiration: '6 месяцев',
                  },
                ],
              },
            },
            {
              title: 'Аналитические cookies',
              description:
                'Помогут понять, как пользуются порталом. Счётчики и идентификаторы загружаются только после согласия. Сейчас не подключены — категория нужна, чтобы включить их позже без повторной вёрстки баннера.',
              linkedCategory: 'analytics',
            },
            {
              title: 'Функциональные cookies',
              description:
                'Запоминают предпочтения — например, любимую трассу или дисциплину — и позволят рекомендовать подходящие гонки. Пока не используются и не включаются без вашего согласия.',
              linkedCategory: 'functional',
            },
          ],
        },
      },
    },
  },
};
