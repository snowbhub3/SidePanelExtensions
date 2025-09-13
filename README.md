SidePanelExtensions — Інструкція розгортання

Огл��д

У цій папці міститься розширення Chrome (SidePanelExtensions) та serverless proxy-функція, яка дозволяє вбудовувати сторінки, що зазвичай блокуються в iframe, шляхом очищення заголовків і ін’єкції mobile UA/viewport.

Зміст

SidePanelExtensions/
  manifest.json
  popup.html
  popup.js
  sidepanel.html
  sidepanel.js
  styles.css
  service_worker.js
  content_script.js
  netlify/functions/proxy.js    <-- Serverless proxy для Netlify

Мета

- Один раз задеплоїти proxy (Netlify або Vercel).
- Вставити URL задеплоєного proxy в service_worker.js (DEFAULT_PROXY_BASE). Після цього користувачам нічого вводити не потрібно.
- Завантажити розширення у Chrome (Load unpacked) — користувачі не будуть просити вказувати proxy.

ВАЖЛИВО: публічний проксі може бути використаний зловмисниками. Якщо плануєте публічний доступ — додайте автентифікацію або обмеження по швидкості.

Короткі кроки — деплой proxy на Netlify (рекомендовано)

1) Підготовка репозиторію
- Переконайтеся, що у репозиторії є SidePanelExtensions/netlify/functions/proxy.js
- Якщо proxy потребує додаткових залежностей (наприклад node-fetch), додайте їх у package.json. Netlify використовує Node 18+, у якому доступний глобальний fetch; при потребі додайте node-fetch.

2) Деплой на Netlify
- Зареєструйтесь на https://www.netlify.com та підключіть ваш Git-репозиторій.
- Під час налаштування можна залишити стандартні будівельні опції. Netlify автоматично знайде функції у netlify/functions.
- Після деплою функція буде доступна за адресою:
  https://<your-site>.netlify.app/.netlify/functions/proxy?url=<encoded-target-url>

3) Вставити DEFAULT_PROXY_BASE у розширення
- Після деплою скопіюйте базовий URL proxy (без ?url=), наприклад:
  https://<your-site>.netlify.app/.netlify/functions/proxy
- Відкрийте SidePanelExtensions/service_worker.js і замініть плейсхолдер:
  const DEFAULT_PROXY_BASE = 'REPLACE_WITH_YOUR_PROXY_URL';
  на
  const DEFAULT_PROXY_BASE = 'https://<your-site>.netlify.app/.netlify/functions/proxy';

- Після встановлення розширення цей URL буде збережено в chrome.storage.local і користувачам нічого додатково вводити не потрібно.

4) Завантаження розширення у Chrome для тестування
- Відкрийте chrome://extensions
- Увімкніть Developer mode
- Натисніть "Load unpacked" і виберіть папку SidePanelExtensions
- Закріпіть іконку розширення

5) Використання розширення
- Відкрийте будь-який сайт у вкладці, натисніть іконку розширення, натисніть Add current
- У списку натисніть Open біля доданого сайту — розширення спробує відкрити бічну панель і завантажити сайт через proxy (якщо необхідно). Зображення, іконки і скрипти повинні підвантажуватися, оскільки proxy додає <base href>, viewport і встановлює mobile UA/override.

Як працює proxy
- Proxy отримує HTML сторінки, додає <base href> (щоб відносні шляхи працювали), ін���єктується невеликий скрипт для емуляції мобільного UA/viewport і повертає HTML без обмежувальних заголовків.
- Для не-HTML ресурсів (зображення, скрипти) proxy передає бінарний контент без змін.
- Розширення спочатку намагається використовувати proxy (якщо налаштовано), потім fetch+srcdoc (якщо дозволяє CORS), і в останню чергу — безпосередній iframe.src.

Безпека та правові моменти
- Proxy фактично обходить X-Frame-Options/CSP для сторінок, що рендеряться через proxy. Переконайтеся, що ви маєте право транслювати відповідний контент.
- Публічний proxy може бути зловживаний. Розгляньте додавання авторизації або ключа API.

Додатково: деплой на Vercel (альтернатива)
- Якщо ви віддаєте перевагу Vercel, скопіюйте netlify/functions/proxy.js у SidePanelExtensions/api/proxy.js і адаптуйте експорт:

  // SidePanelExtensions/api/proxy.js (Vercel)
  const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
  module.exports = async (req, res) => {
    const target = req.query.url || '';
    if (!target) return res.status(400).send('Missing url');
    try {
      const r = await fetch(target, { redirect: 'follow' });
      const contentType = r.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        const buffer = await r.arrayBuffer();
        res.setHeader('content-type', contentType || 'application/octet-stream');
        return res.send(Buffer.from(buffer));
      }
      let text = await r.text();
      text = text.replace(/<head(.*?)>/i, m => m + `<base href="${target}">` + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" + `<script>/* mobile UA inject */</script>`);
      res.setHeader('content-type','text/html; charset=utf-8');
      return res.send(text);
    } catch (err) {
      return res.status(500).send('Fetch error');
    }
  };

Після деплою на Vercel встановіть DEFAULT_PROXY_BASE у service_worker.js на https://<your-app>.vercel.app/api/proxy

Допомога з деплоєм

Я можу підготувати фінальний репозиторій і встановити DEFAULT_PROXY_BASE після того, як ви повідомите URL розгорнутого proxy. Також можу надати покрокові CLI-команди для деплою на Netlify за допомогою netlify-cli.

-- Кінець інструкції
