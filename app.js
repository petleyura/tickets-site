/* ============================================================
   Білети та відповіді — Режим 1
   Єдине джерело даних: build/tickets-data.json
   Сторінка не перезавантажується: усе працює через JS.
   ============================================================ */
'use strict';

(function () {

  /* ---------------- Посилання на елементи сторінки ---------------- */

  var els = {
    modeSelect: document.getElementById('mode-select'),
    modeNote:   document.getElementById('mode-note'),

    ticketForm:  document.getElementById('ticket-form'),
    ticketInput: document.getElementById('ticket-input'),
    ticketError: document.getElementById('ticket-error'),

    searchForm:    document.getElementById('search-form'),
    searchInput:   document.getElementById('search-input'),
    searchResults: document.getElementById('search-results'),

    output:    document.getElementById('output'),
    clearBtn:  document.getElementById('clear-btn'),
    syncNote:  document.getElementById('sync-note'),
    block3Title: document.getElementById('block3-title')
  };

  /* ---------------- Стан ---------------- */

  var tickets = [];        // масив білетів із JSON
  var index = [];          // плаский індекс усіх 300 питань для пошуку
  var dataReady = false;

  var MAX_RESULTS = 200;   // запобіжник на надто довгий список

  /* ---------------- Допоміжні функції ---------------- */

  // Нормалізація для пошуку: нижній регістр, однакові апострофи,
  // згорнуті пробіли. Самі тексти при цьому не змінюються.
  function normalize(text) {
    return String(text == null ? '' : text)
      .toLowerCase()
      .replace(/[\u2018\u2019\u02BC\u2032`]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  function showError(el, text) {
    if (!el) { return; }
    if (text) {
      el.textContent = text;
      el.hidden = false;
    } else {
      el.textContent = '';
      el.hidden = true;
    }
  }

  /* ---------------- Завантаження даних ---------------- */

  function loadData() {
    // 1) Вбудовані дані (використовує статична версія для GitHub Pages):
    //    якщо сторінка містить дані всередині себе, мережа взагалі не потрібна.
    if (window.__TICKETS_DATA__ && Array.isArray(window.__TICKETS_DATA__.tickets)) {
      initData(window.__TICKETS_DATA__);
      return;
    }

    // 2) Інакше — файл даних поруч із сайтом (як віддає локальний сервер).
    //    Шляхи ВІДНОСНІ, щоб працювало і в підпапці (GitHub Pages), і локально.
    var urls = ['./build/tickets-data.json', '/build/tickets-data.json', '../build/tickets-data.json'];

    function tryNext(i) {
      if (i >= urls.length) {
        showError(els.ticketError, 'Не вдалося завантажити дані (build/tickets-data.json).');
        return;
      }
      fetch(urls[i], { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) { throw new Error('HTTP ' + res.status); }
          return res.json();
        })
        .then(function (data) {
          initData(data);
        })
        .catch(function () {
          tryNext(i + 1);
        });
    }

    tryNext(0);
  }

  function initData(data) {
    tickets = (data && Array.isArray(data.tickets)) ? data.tickets : [];

    index = [];
    tickets.forEach(function (ticket) {
      var list = Array.isArray(ticket.questions) ? ticket.questions : [];
      list.forEach(function (q) {
        index.push({
          ticket: ticket.ticket,
          number: q.number,
          question: q.question,
          answer: q.answer,
          haystack: normalize(q.question)
        });
      });
    });

    dataReady = true;

    // Ознака для самотесту (не впливає на роботу інтерфейсу)
    if (document.body && document.body.dataset) {
      document.body.dataset.dataReady = '1';
    }
  }

  /* ---------------- Блок 3: стан і відображення ----------------
     Єдине джерело істини для Блоку 3 — масив groups.
     Режим 1 його наповнює, Режим 2 лише показує те, що надіслав сервер. */

  var groups = [];   // [{ title, items: [{question, answer}] }]

  // Повністю перемальовує Блок 3 зі стану (порядок наборів зберігається)
  function renderOutput() {
    els.output.textContent = '';

    groups.forEach(function (g) {
      var group = document.createElement('div');
      group.className = 'output__group';

      if (g.title) {
        var h = document.createElement('p');
        h.className = 'output__group-title';
        h.textContent = g.title;
        group.appendChild(h);
      }

      (g.items || []).forEach(function (item) {
        var wrap = document.createElement('div');
        wrap.className = 'output__item';

        var q = document.createElement('p');
        q.className = 'output__question';
        q.textContent = item.question;

        var a = document.createElement('p');
        a.className = 'output__answer';
        a.textContent = item.answer;

        wrap.appendChild(q);
        wrap.appendChild(a);
        group.appendChild(wrap);
      });

      els.output.appendChild(group);
    });
  }

  // Додає набір (білет або одне знайдене питання) і показує його.
  // Попередні результати не видаляються — нові додаються нижче.
  function appendGroup(title, items) {
    groups.push({ title: title, items: items });
    renderOutput();
    publishState();
  }

  function clearOutput() {
    groups = [];
    renderOutput();
    publishState();
  }

  /* ---------------- Синхронізація з Режимом 2 ---------------- */

  var posting = false;      // чи є незавершена публікація
  var postQueued = false;   // чи надійшла зміна під час публікації
  var stream = null;        // SSE-підключення Режиму 2

  // Режим 1 публікує поточний стан Блоку 3 на сервер.
  // Сервер зберігає його та одразу розсилає всім глядачам (Режим 2).
  function publishState() {
    if (currentMode() !== '1') { return; }
    if (posting) { postQueued = true; return; }

    posting = true;
    postQueued = false;

    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ groups: groups })
    })
      .catch(function () { /* сервер недоступний — інтерфейс працює далі */ })
      .then(function () {
        posting = false;
        if (postQueued) { publishState(); }   // не губимо зміни, що надійшли під час запиту
      });
  }

  function setSyncNote(text) {
    if (!els.syncNote) { return; }
    if (text) {
      els.syncNote.textContent = text;
      els.syncNote.hidden = false;
    } else {
      els.syncNote.textContent = '';
      els.syncNote.hidden = true;
    }
  }

  // Режим 2: підписка на оновлення від сервера (без перезавантаження сторінки)
  function startStream() {
    if (stream) { return; }

    setSyncNote('Очікування даних із Режиму 1…');

    stream = new EventSource('/api/stream');

    stream.onmessage = function (event) {
      var data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      groups = Array.isArray(data.groups) ? data.groups : [];
      renderOutput();

      if (groups.length === 0) {
        setSyncNote('Режим 1 ще не додав результатів — тут з\'явиться його Блок 3.');
      } else {
        setSyncNote('Синхронізовано з Режимом 1. Наборів: ' + groups.length +
                    '. Оновлено: ' + formatTime(data.updatedAt) + '.');
      }
    };

    stream.onerror = function () {
      // EventSource сам перепідключиться (див. retry на сервері)
      setSyncNote('Зв\'язок із сервером втрачено. Перепідключення…');
    };
  }

  function stopStream() {
    if (stream) {
      stream.close();
      stream = null;
    }
  }

  function formatTime(iso) {
    if (!iso) { return '—'; }
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return '—'; }
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  /* ---------------- Блок 1: вибір білета ---------------- */

  function handleTicketSubmit(event) {
    event.preventDefault();

    if (!dataReady) {
      showError(els.ticketError, 'Дані ще не завантажено. Спробуйте за мить.');
      return;
    }

    var raw = els.ticketInput.value.trim();

    if (raw === '') {
      showError(els.ticketError, 'Введіть номер білета від 1 до 30.');
      return;
    }

    // Приймаємо лише ціле число
    if (!/^\d+$/.test(raw)) {
      showError(els.ticketError, 'Номер білета має бути цілим числом від 1 до 30.');
      return;
    }

    var num = parseInt(raw, 10);

    if (num < 1 || num > 30) {
      showError(els.ticketError, 'Невірний номер білета: ' + num + '. Допустимо від 1 до 30.');
      return;
    }

    var ticket = tickets.filter(function (t) { return Number(t.ticket) === num; })[0];

    if (!ticket) {
      showError(els.ticketError, 'Білета №' + num + ' немає у файлі даних.');
      return;
    }

    var list = Array.isArray(ticket.questions) ? ticket.questions : [];
    if (list.length === 0) {
      showError(els.ticketError, 'У білеті №' + num + ' немає питань у файлі даних.');
      return;
    }

    showError(els.ticketError, '');

    var items = list.map(function (q) {
      return { question: q.question, answer: q.answer };
    });

    appendGroup('Білет №' + num, items);
    els.ticketInput.value = '';
  }

  /* ---------------- Блок 2: пошук питань ----------------
     Пошук запускається АВТОМАТИЧНО на кожну зміну тексту в полі.
     Кнопки «Знайти» немає. Правило пошуку не змінилося:
     одне слово — підрядок; кілька слів — усі слова мусять бути в питанні. */

  function runSearch() {
    if (!dataReady) {
      renderSearchMessage('Дані ще не завантажено. Спробуйте за мить.');
      return;
    }

    var query = normalize(els.searchInput.value);

    // Порожнє поле — очищаємо список результатів
    if (query === '') {
      els.searchResults.textContent = '';
      return;
    }

    // Одне слово — підрядок. Кілька слів — усі слова мусять бути присутні
    // в тексті питання (саме як комбінація, а не окремі незалежні пошуки).
    var words = query.split(' ').filter(function (w) { return w.length > 0; });

    var found = index.filter(function (row) {
      for (var i = 0; i < words.length; i++) {
        if (row.haystack.indexOf(words[i]) === -1) { return false; }
      }
      return true;
    });

    renderSearchResults(found);
  }

  // Натискання Enter у полі пошуку не перезавантажує сторінку
  function handleSearchSubmit(event) {
    event.preventDefault();
    runSearch();
  }

  function renderSearchMessage(text) {
    els.searchResults.textContent = '';
    var p = document.createElement('p');
    p.className = 'results__note';
    p.textContent = text;
    els.searchResults.appendChild(p);
  }

  function renderSearchResults(found) {
    els.searchResults.textContent = '';

    if (found.length === 0) {
      renderSearchMessage('Нічого не знайдено');
      return;
    }

    var shown = found.slice(0, MAX_RESULTS);
    var frag = document.createDocumentFragment();

    shown.forEach(function (row) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'results__item';
      btn.setAttribute('role', 'listitem');

      var meta = document.createElement('span');
      meta.className = 'results__meta';
      meta.textContent = '№' + row.number + ':' + row.ticket;

      btn.appendChild(meta);
      btn.appendChild(document.createTextNode(row.question));

      btn.addEventListener('click', function () {
        handlePickQuestion(row);
      });

      frag.appendChild(btn);
    });

    els.searchResults.appendChild(frag);

    if (found.length > shown.length) {
      var note = document.createElement('p');
      note.className = 'results__note';
      note.textContent = 'Показано перші ' + shown.length + ' із ' + found.length +
                         '. Уточніть запит, щоб звузити пошук.';
      els.searchResults.appendChild(note);
    }
  }

  // Натискання на знайдене питання:
  //  1) повністю очищає список результатів у Блоці 2;
  //  2) додає питання + відповідь у Блок 3 (попередні не видаляються).
  function handlePickQuestion(row) {
    els.searchResults.textContent = '';

    appendGroup(
      'Питання №' + row.number + ' (білет №' + row.ticket + ')',
      [{ question: row.question, answer: row.answer }]
    );
  }

  /* ---------------- Режим 1 / Режим 2 ---------------- */

  function currentMode() {
    return els.modeSelect.value === '2' ? '2' : '1';
  }

  // Режим 1 — повний інтерфейс керування.
  // Режим 2 — лише перегляд результату, який формується в Режимі 1.
  function applyMode() {
    var mode = currentMode();

    if (document.body && document.body.classList) {
      document.body.classList.toggle('mode-1', mode === '1');
      document.body.classList.toggle('mode-2', mode === '2');
    }

    if (els.block3Title) {
      els.block3Title.textContent = (mode === '2')
        ? 'Блок 3. Результат (Режим 2 — перегляд)'
        : 'Блок 3. Результат';
    }

    els.modeNote.hidden = true;
    els.modeNote.textContent = '';

    if (mode === '2') {
      // переходимо в режим перегляду: показуємо те, що вже є в Режимі 1,
      // і підписуємось на подальші оновлення
      startStream();
      setSyncNote('Очікування даних із Режиму 1…');
    } else {
      stopStream();
      setSyncNote('');
    }
  }

  function handleModeChange() {
    applyMode();
  }

  /* ---------------- Підписки ---------------- */

  els.ticketForm.addEventListener('submit', handleTicketSubmit);
  els.searchForm.addEventListener('submit', handleSearchSubmit);
  els.clearBtn.addEventListener('click', clearOutput);
  els.modeSelect.addEventListener('change', handleModeChange);

  // Блок 2: пошук запускається на кожен введений або видалений символ
  els.searchInput.addEventListener('input', runSearch);

  /* ---------------- Старт ---------------- */

  // Початковий стан: Режим 1 (керування). Якщо сторінку відкрито з Режимом 2,
  // applyMode одразу підключить перегляд.
  applyMode();

  loadData();

})();
